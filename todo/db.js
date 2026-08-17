import {
  DB_NAME,
  LIST_PREFIX,
  ITEM_PREFIX,
  TEMPLATE_PREFIX,
  SETTINGS_ID,
} from './state.js';
import { PouchStore, HIGH } from '/lib/pouch-store.js';
import { createSyncConfig, encodeSyncConfig, SHARE_PARAM } from '/lib/sync-config.js';

// `legacyPrefix` names the flat localStorage keys this tool used before the
// shared store existed, so an install configured by the old code keeps syncing.
const { getSyncConfig, setSyncConfig } = createSyncConfig({
  key: 'todo',
  legacyPrefix: 'todo-lists',
});

export { getSyncConfig, setSyncConfig, encodeSyncConfig, SHARE_PARAM };

// ── Document <-> model mappers ──
function listToDoc(list) {
  return {
    _id: LIST_PREFIX + list.id,
    type: 'list',
    id: list.id,
    name: list.name,
    order: list.order ?? 0,
    // Per-list display preference: sink completed items (see sink.js). Stored
    // on the list doc so it syncs with the list itself — unlike the landing
    // page's own ordering, which is deliberately per-device (see order.js).
    sinkChecked: !!list.sinkChecked,
    createdAt: list.createdAt ?? Date.now(),
  };
}

function listFromDoc(doc) {
  return {
    id: doc.id ?? doc._id.slice(LIST_PREFIX.length),
    name: doc.name,
    order: doc.order ?? 0,
    sinkChecked: !!doc.sinkChecked,
    createdAt: doc.createdAt ?? 0,
  };
}

function itemDocId(item) {
  return `${ITEM_PREFIX}${item.listId}:${item.id}`;
}

function itemToDoc(item) {
  return {
    _id: itemDocId(item),
    type: 'item',
    // 'item' (a checkable task, the default) or 'heading' (a section label).
    kind: item.kind === 'heading' ? 'heading' : 'item',
    id: item.id,
    listId: item.listId,
    text: item.text,
    checked: !!item.checked,
    checkedAt: item.checkedAt ?? null,
    order: item.order ?? 0,
    createdAt: item.createdAt ?? Date.now(),
    history: Array.isArray(item.history) ? item.history : [],
  };
}

function itemFromDoc(doc) {
  return {
    id: doc.id,
    listId: doc.listId,
    kind: doc.kind === 'heading' ? 'heading' : 'item',
    text: doc.text,
    checked: !!doc.checked,
    checkedAt: doc.checkedAt ?? null,
    order: doc.order ?? 0,
    createdAt: doc.createdAt ?? 0,
    history: Array.isArray(doc.history) ? doc.history : [],
  };
}

function templateToDoc(tpl) {
  return {
    _id: TEMPLATE_PREFIX + tpl.id,
    type: 'template',
    id: tpl.id,
    name: tpl.name,
    items: Array.isArray(tpl.items) ? tpl.items : [],
    createdAt: tpl.createdAt ?? Date.now(),
  };
}

function templateFromDoc(doc) {
  return {
    id: doc.id ?? doc._id.slice(TEMPLATE_PREFIX.length),
    name: doc.name,
    items: Array.isArray(doc.items) ? doc.items : [],
    createdAt: doc.createdAt ?? 0,
  };
}

// Lists, items and templates all live in one PouchDB so a single replication
// stream keeps everything in sync. The connection lifecycle, status reporting
// and manual sync operations all come from PouchStore — only the mappers above
// and the queries below are specific to todo lists.
class TodoDB extends PouchStore {
  constructor() {
    super({
      dbName: DB_NAME,
      label: 'todo',
      prefixes: [LIST_PREFIX, ITEM_PREFIX, TEMPLATE_PREFIX],
      getConfig: getSyncConfig,
    });
  }

  // ── Lists ──
  getLists() {
    return this.getRange(
      LIST_PREFIX,
      listFromDoc,
      (a, b) => (a.order - b.order) || (a.createdAt - b.createdAt),
    );
  }

  // Item totals per list, for the home view. One scan over all item docs.
  async getCounts() {
    const db = await this.open();
    const res = await db.allDocs({
      include_docs: true,
      startkey: ITEM_PREFIX,
      endkey: ITEM_PREFIX + HIGH,
    });
    const map = {};
    for (const r of res.rows) {
      const d = r.doc;
      if (d.kind === 'heading') continue; // headings aren't checkable
      const m = map[d.listId] || (map[d.listId] = { total: 0, done: 0 });
      m.total += 1;
      if (d.checked) m.done += 1;
    }
    return map;
  }

  async putList(list) {
    await this.putWithRev(listToDoc(list));
  }

  async deleteList(id) {
    const db = await this.open();
    // Remove the list doc and every item that belongs to it.
    const deletes = await this.deletionsForRange(`${ITEM_PREFIX}${id}:`);
    try {
      const existing = await db.get(LIST_PREFIX + id);
      deletes.push({ _id: existing._id, _rev: existing._rev, _deleted: true });
    } catch (err) {
      if (err.status !== 404) throw err;
    }
    if (deletes.length) await db.bulkDocs(deletes);
  }

  // ── Items ──
  getItems(listId) {
    return this.getRange(
      `${ITEM_PREFIX}${listId}:`,
      itemFromDoc,
      (a, b) => (a.order - b.order) || (a.createdAt - b.createdAt),
    );
  }

  async putItem(item) {
    await this.putWithRev(itemToDoc(item));
  }

  async deleteItem(listId, itemId) {
    await this.removeById(`${ITEM_PREFIX}${listId}:${itemId}`);
  }

  // Toggle (or set) an item's checked state, stamping the time and appending to
  // its history so the full check/uncheck timeline is preserved.
  async setItemChecked(listId, itemId, checked) {
    const db = await this.open();
    const doc = await db.get(`${ITEM_PREFIX}${listId}:${itemId}`);
    const at = Date.now();
    doc.checked = checked;
    doc.checkedAt = at;
    doc.history = Array.isArray(doc.history) ? doc.history : [];
    doc.history.push({ checked, at });
    await db.put(doc);
  }

  // Uncheck every item in a list and clear its check timestamp. The history is
  // wiped too so a reset is a genuine clean slate (used for reusable lists).
  async resetList(listId) {
    const db = await this.open();
    const res = await db.allDocs({
      include_docs: true,
      startkey: `${ITEM_PREFIX}${listId}:`,
      endkey: `${ITEM_PREFIX}${listId}:${HIGH}`,
    });
    const updates = [];
    for (const r of res.rows) {
      const doc = r.doc;
      if (!doc.checked && !doc.checkedAt && (!doc.history || !doc.history.length)) continue;
      doc.checked = false;
      doc.checkedAt = null;
      doc.history = [];
      updates.push(doc);
    }
    if (updates.length) await db.bulkDocs(updates);
  }

  // Persist a new ordering for a list. `orderedIds` is the full list of item ids
  // in their desired sequence; each doc's `order` becomes its index (0..n-1).
  // Only docs whose order actually changed are written.
  async reorderItems(listId, orderedIds) {
    const db = await this.open();
    const res = await db.allDocs({
      include_docs: true,
      startkey: `${ITEM_PREFIX}${listId}:`,
      endkey: `${ITEM_PREFIX}${listId}:${HIGH}`,
    });
    const byId = new Map(res.rows.map((r) => [r.doc.id, r.doc]));
    const updates = [];
    orderedIds.forEach((id, i) => {
      const doc = byId.get(id);
      if (doc && doc.order !== i) {
        doc.order = i;
        updates.push(doc);
      }
    });
    if (updates.length) await db.bulkDocs(updates);
  }

  // Import parsed Markdown entries ([{ kind, text, checked }]) into a list.
  // When `replace` is set the list's existing items are cleared first;
  // otherwise the new entries are appended after whatever is already there.
  async importItems(listId, entries, { replace = false } = {}) {
    const db = await this.open();
    const res = await db.allDocs({
      include_docs: true,
      startkey: `${ITEM_PREFIX}${listId}:`,
      endkey: `${ITEM_PREFIX}${listId}:${HIGH}`,
    });

    const docs = [];
    let base = 0;
    if (replace) {
      for (const r of res.rows) {
        docs.push({ _id: r.id, _rev: r.doc._rev, _deleted: true });
      }
    } else {
      for (const r of res.rows) {
        base = Math.max(base, (r.doc.order ?? 0) + 1);
      }
    }

    const now = Date.now();
    entries.forEach((entry, i) => {
      const heading = entry.kind === 'heading';
      const checked = !heading && !!entry.checked;
      docs.push(itemToDoc({
        id: crypto.randomUUID(),
        listId,
        kind: heading ? 'heading' : 'item',
        text: entry.text,
        checked,
        checkedAt: checked ? now : null,
        order: base + i,
        createdAt: now + i,
        history: checked ? [{ checked: true, at: now }] : [],
      }));
    });

    if (docs.length) await db.bulkDocs(docs);
  }

  // ── Templates ──
  getTemplates() {
    return this.getRange(
      TEMPLATE_PREFIX,
      templateFromDoc,
      (a, b) => (a.createdAt - b.createdAt),
    );
  }

  async putTemplate(tpl) {
    await this.putWithRev(templateToDoc(tpl));
  }

  async deleteTemplate(id) {
    await this.removeById(TEMPLATE_PREFIX + id);
  }

  // Create a new list and populate it with one unchecked item per template
  // line. Returns the new list's id so the caller can select it.
  async createListFromTemplate(templateId, name) {
    const db = await this.open();
    const tplDoc = await db.get(TEMPLATE_PREFIX + templateId);
    const listId = crypto.randomUUID();
    const now = Date.now();
    await this.putList({ id: listId, name: name || tplDoc.name, order: now, createdAt: now });
    const docs = (tplDoc.items || [])
      .map((text) => String(text).trim())
      .filter(Boolean)
      .map((text, i) => itemToDoc({
        id: crypto.randomUUID(),
        listId,
        text,
        checked: false,
        checkedAt: null,
        order: i,
        createdAt: now + i,
        history: [],
      }));
    if (docs.length) await db.bulkDocs(docs);
    return listId;
  }

  // Duplicate a list and every item in it under a new name. Text, headings,
  // ordering and check state are all carried over, but per-item history is
  // not — the clone starts with a clean timeline. Returns the new list's id.
  async cloneList(sourceId, name) {
    const db = await this.open();
    const source = await db.get(LIST_PREFIX + sourceId);
    const items = await this.getItems(sourceId);
    const listId = crypto.randomUUID();
    const now = Date.now();
    await this.putList({
      id: listId,
      name,
      order: now,
      sinkChecked: !!source.sinkChecked,
      createdAt: now,
    });
    const docs = items.map((item, i) => itemToDoc({
      ...item,
      id: crypto.randomUUID(),
      listId,
      createdAt: now + i,
      history: item.checked ? [{ checked: true, at: now }] : [],
    }));
    if (docs.length) await db.bulkDocs(docs);
    return listId;
  }

  // ── Settings ──
  async _getSettingsDoc() {
    const db = await this.open();
    try {
      return await db.get(SETTINGS_ID);
    } catch (err) {
      if (err.status === 404) return { _id: SETTINGS_ID };
      throw err;
    }
  }

  async getSetting(key) {
    const doc = await this._getSettingsDoc();
    return doc[key] ?? null;
  }

  async setSetting(key, value) {
    const db = await this.open();
    const doc = await this._getSettingsDoc();
    doc[key] = value;
    await db.put(doc);
  }
}

export const db = new TodoDB();
