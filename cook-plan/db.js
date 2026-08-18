// =============================================
// Cook Planner — db.js
// Local PouchDB store, replicating live against CouchDB.
// =============================================

import { PouchStore, HIGH } from '/lib/pouch-store.js';
import { createSyncConfig } from '/lib/sync-config.js';
import { DB_NAME, PLAN_ID, ITEM_PREFIX, DEFAULT_STATE } from './constants.js';

// No `legacyPrefix`: this tool has never had sync before, so there are no flat
// keys from an older release to fall back to.
const { getSyncConfig, setSyncConfig } = createSyncConfig({ key: 'cook-plan' });

export { getSyncConfig, setSyncConfig };

// ── Document <-> model mappers ──

function planToDoc(plan) {
  return {
    _id: PLAN_ID,
    type: 'plan',
    mode: plan.mode === 'start' ? 'start' : 'end',
    targetTime: plan.targetTime || DEFAULT_STATE.targetTime,
    snapMins: plan.snapMins || 0,
    appliances: { ...DEFAULT_STATE.appliances, ...(plan.appliances || {}) },
    updatedAt: Date.now(),
  };
}

function planFromDoc(doc) {
  return {
    mode: doc.mode === 'start' ? 'start' : 'end',
    targetTime: doc.targetTime || DEFAULT_STATE.targetTime,
    snapMins: doc.snapMins || 0,
    appliances: { ...DEFAULT_STATE.appliances, ...(doc.appliances || {}) },
  };
}

function itemToDoc(item) {
  return {
    _id: ITEM_PREFIX + item.id,
    type: 'item',
    id: item.id,
    name: item.name,
    cookType: item.cookType || 'oven',
    shelfSlots: item.shelfSlots ?? 1,
    appliancePref: item.appliancePref || 'auto',
    prepTime: item.prepTime || 0,
    cookTime: item.cookTime || 0,
    setTime: item.setTime || 0,
    overrideCookStart: item.overrideCookStart ?? null,
    order: item.order ?? 0,
    createdAt: item.createdAt ?? Date.now(),
  };
}

function itemFromDoc(doc) {
  return {
    id: doc.id ?? doc._id.slice(ITEM_PREFIX.length),
    name: doc.name,
    cookType: doc.cookType || 'oven',
    shelfSlots: doc.shelfSlots ?? 1,
    appliancePref: doc.appliancePref || 'auto',
    prepTime: doc.prepTime || 0,
    cookTime: doc.cookTime || 0,
    setTime: doc.setTime || 0,
    overrideCookStart: doc.overrideCookStart ?? null,
    order: doc.order ?? 0,
    createdAt: doc.createdAt ?? 0,
  };
}

// ── Recognising our own writes ──
// Everything this tab writes comes back through the live changes feed like any
// other change. Re-rendering on those would be wasted work, and worse would
// rebuild the view out from under a half-finished edit — so each local write's
// revision is noted here and its echo swallowed once. The set drains itself:
// an entry is removed the moment its echo arrives.
const localRevs = new Set();

function noteLocal(res) {
  if (res && res.ok && res.id && res.rev) localRevs.add(`${res.id}@${res.rev}`);
}

export function isLocalEcho(change) {
  const rev = change?.doc?._rev || change?.changes?.[0]?.rev;
  if (!rev) return false;
  const key = `${change.id}@${rev}`;
  if (!localRevs.has(key)) return false;
  localRevs.delete(key);
  return true;
}

// The plan doc and the item docs share one database so a single replication
// stream carries the whole cook. Only the mappers above and the queries below
// are specific to this tool — the connection lifecycle, status reporting and
// manual sync operations all come from PouchStore.
class CookPlanDB extends PouchStore {
  constructor() {
    super({
      dbName: DB_NAME,
      label: 'cook-plan',
      // Food items only. A plan doc on its own is just appliance settings, so
      // counting it as data would put a merge warning in front of someone with
      // nothing to lose, and skip the pull that protects a fresh device.
      prefixes: [ITEM_PREFIX],
      getConfig: getSyncConfig,
    });
  }

  // ── Plan ──
  async getPlan() {
    const db = await this.open();
    try {
      return planFromDoc(await db.get(PLAN_ID));
    } catch (err) {
      if (err.status !== 404) throw err;
      return null;
    }
  }

  async putPlan(plan) {
    noteLocal(await this.putWithRev(planToDoc(plan)));
  }

  // ── Items ──
  getItems() {
    return this.getRange(
      ITEM_PREFIX,
      itemFromDoc,
      (a, b) => (a.order - b.order) || (a.createdAt - b.createdAt),
    );
  }

  async putItem(item) {
    noteLocal(await this.putWithRev(itemToDoc(item)));
  }

  async deleteItem(id) {
    noteLocal(await this.removeById(ITEM_PREFIX + id));
  }

  // Swap the whole cook for a different one — "start a new cook", a JSON
  // import, or an incoming #state= link. Ids are commonly reused (importing
  // the same file twice), so rather than delete-then-recreate, every incoming
  // item carries the current revision of the id it is taking over and only the
  // ids left unclaimed are tombstoned. One bulkDocs, so the old items can never
  // linger alongside the new ones.
  async replaceAll({ plan, items }) {
    const db = await this.open();
    const existing = await db.allDocs({
      startkey: ITEM_PREFIX,
      endkey: ITEM_PREFIX + HIGH,
    });
    const revs = new Map(existing.rows.map((r) => [r.id, r.value.rev]));

    const now = Date.now();
    const docs = items.map((item, i) => {
      const doc = itemToDoc({ ...item, order: i, createdAt: item.createdAt ?? now + i });
      const rev = revs.get(doc._id);
      if (rev) {
        doc._rev = rev;
        revs.delete(doc._id);
      }
      return doc;
    });
    for (const [id, rev] of revs) docs.push({ _id: id, _rev: rev, _deleted: true });

    if (docs.length) (await db.bulkDocs(docs)).forEach(noteLocal);
    await this.putPlan(plan);
  }
}

export const db = new CookPlanDB();
