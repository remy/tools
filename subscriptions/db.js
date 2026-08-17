import { DB_NAME } from './state.js';
import { PouchStore } from '/lib/pouch-store.js';
import { createSyncConfig, encodeSyncConfig, SHARE_PARAM } from '/lib/sync-config.js';

const SUB_PREFIX = 'sub:';
const SETTINGS_ID = 'settings';

// `legacyPrefix` names the flat localStorage keys this tool used before the
// shared store existed, so an install configured by the old code keeps syncing.
const { getSyncConfig, setSyncConfig } = createSyncConfig({
  key: 'subscriptions',
  legacyPrefix: 'subscription-tracker',
});

export { getSyncConfig, setSyncConfig, encodeSyncConfig, SHARE_PARAM };

function toDoc(sub) {
  return {
    _id: SUB_PREFIX + sub.id,
    id: sub.id,
    name: sub.name,
    url: sub.url ?? '',
    favicon: sub.favicon ?? '',
    amount: sub.amount,
    currency: sub.currency,
    cycle: sub.cycle,
    recurringDay: sub.recurringDay,
    recurringMonth: sub.recurringMonth ?? null,
    category: sub.category ?? 'personal',
    startDate: sub.startDate ?? null,
    endDate: sub.endDate ?? null,
    createdAt: sub.createdAt ?? Date.now(),
  };
}

function fromDoc(doc) {
  const sub = {
    id: doc.id ?? doc._id.slice(SUB_PREFIX.length),
    name: doc.name,
    url: doc.url || '',
    favicon: doc.favicon || '',
    amount: doc.amount,
    currency: doc.currency,
    cycle: doc.cycle,
    recurringDay: doc.recurringDay,
    category: doc.category,
    createdAt: doc.createdAt,
  };
  if (doc.recurringMonth != null) sub.recurringMonth = doc.recurringMonth;
  if (doc.startDate) sub.startDate = doc.startDate;
  if (doc.endDate) sub.endDate = doc.endDate;
  return sub;
}

// Subscriptions and settings live in one PouchDB so a single replication stream
// keeps everything in sync. The connection lifecycle, status reporting and
// manual sync operations all come from PouchStore — only the mappers above and
// the queries below are specific to this tool.
class SubscriptionDB extends PouchStore {
  constructor() {
    super({
      dbName: DB_NAME,
      label: 'subscriptions',
      prefixes: [SUB_PREFIX],
      getConfig: getSyncConfig,
    });
  }

  // Kept as a named alias: the settings panel reads better asking whether there
  // are subscriptions than whether there is data.
  hasSubscriptions() {
    return this.hasData();
  }

  getAll() {
    return this.getRange(SUB_PREFIX, fromDoc, (a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  }

  async put(sub) {
    await this.putWithRev(toDoc(sub));
  }

  async delete(id) {
    await this.removeById(SUB_PREFIX + id);
  }

  async clearAll() {
    const db = await this.open();
    const deletes = await this.deletionsForRange(SUB_PREFIX);
    if (deletes.length) await db.bulkDocs(deletes);
  }

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

  async getAllSettings() {
    const doc = await this._getSettingsDoc();
    const { _id, _rev, ...rest } = doc;
    return rest;
  }

  async _writeSettings(settings) {
    const db = await this.open();
    const doc = await this._getSettingsDoc();
    Object.assign(doc, settings);
    await db.put(doc);
  }

  async exportData() {
    const subscriptions = (await this.getAll()).map(({ id, ...rest }) => rest);
    const settings = await this.getAllSettings();
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      settings,
      subscriptions,
    };
  }

  async importData(data) {
    if (!data || data.version !== 1 || !Array.isArray(data.subscriptions)) {
      throw new Error('Invalid import file');
    }
    const db = await this.open();
    await this.clearAll();
    const docs = data.subscriptions.map((s) => toDoc({
      ...s,
      id: s.id ?? crypto.randomUUID(),
    }));
    if (docs.length) await db.bulkDocs(docs);
    if (data.settings && Object.keys(data.settings).length) {
      await this._writeSettings(data.settings);
    }
  }

}

export const db = new SubscriptionDB();
