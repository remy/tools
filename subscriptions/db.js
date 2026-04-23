import { DB_NAME } from './state.js';

const PouchDB = globalThis.PouchDB;

const SYNC_PREFIX = 'subscription-tracker.sync.';
const SUB_PREFIX = 'sub:';
const SETTINGS_ID = 'settings';

export function getSyncConfig() {
  const url = localStorage.getItem(SYNC_PREFIX + 'url') || '';
  const token = localStorage.getItem(SYNC_PREFIX + 'token') || '';
  return { url, token };
}

export function setSyncConfig({ url, token }) {
  const setOrClear = (k, v) => {
    if (v) localStorage.setItem(SYNC_PREFIX + k, String(v));
    else localStorage.removeItem(SYNC_PREFIX + k);
  };
  setOrClear('url', url);
  setOrClear('token', token);
}

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

function remoteDb(cfg) {
  const opts = {};
  if (cfg.token) {
    opts.fetch = (url, init) => {
      const headers = new Headers(init?.headers || {});
      headers.set('Authorization', `Bearer ${cfg.token}`);
      return PouchDB.fetch(url, { ...init, headers });
    };
  }
  return new PouchDB(cfg.url, opts);
}

// ── Legacy IndexedDB reader ──
async function readLegacyIdb() {
  if (!('indexedDB' in globalThis)) return null;
  const existing = await new Promise((resolve) => {
    if (!indexedDB.databases) return resolve(true);
    indexedDB.databases().then(
      (list) => resolve(list.some((d) => d.name === DB_NAME)),
      () => resolve(true),
    );
  });
  if (!existing) return null;

  return new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onsuccess = () => {
      const opened = req.result;
      const stores = opened.objectStoreNames;
      if (!stores.contains('subscriptions') && !stores.contains('settings')) {
        opened.close();
        return resolve(null);
      }
      const names = [];
      if (stores.contains('subscriptions')) names.push('subscriptions');
      if (stores.contains('settings')) names.push('settings');
      const tx = opened.transaction(names, 'readonly');
      const subsReq = stores.contains('subscriptions')
        ? tx.objectStore('subscriptions').getAll() : null;
      const setReq = stores.contains('settings')
        ? tx.objectStore('settings').getAll() : null;
      tx.oncomplete = () => {
        opened.close();
        resolve({
          subscriptions: subsReq?.result || [],
          settings: (setReq?.result || []).reduce((m, r) => { m[r.key] = r.value; return m; }, {}),
        });
      };
      tx.onerror = () => { opened.close(); resolve(null); };
    };
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}

class SubscriptionDB {
  constructor() {
    this._db = null;
    this._syncHandle = null;
    this._pullFirstPromise = null;
    this._statusListeners = new Set();
    this._lastStatus = null;
    this._changeSubscribers = new Set();
  }

  async open() {
    if (this._db) return this._db;
    this._db = new PouchDB(DB_NAME);
    this._startSync();
    return this._db;
  }

  async hasSubscriptions() {
    const db = await this.open();
    const res = await db.allDocs({
      startkey: SUB_PREFIX,
      endkey: SUB_PREFIX + '￰',
      limit: 1,
    });
    return res.rows.length > 0;
  }

  _emitStatus(s) {
    this._lastStatus = s;
    for (const cb of Array.from(this._statusListeners)) {
      try { cb(s); } catch (err) { console.error(err); }
    }
  }

  async _attachChange(sub) {
    const db = await this.open();
    if (sub.cancelled) return;
    sub.handle = db.changes({ since: 'now', live: true, include_docs: true })
      .on('change', (c) => {
        try { sub.cb(c); } catch (err) { console.error(err); }
      })
      .on('error', (err) => console.error('[subs changes]', err));
  }

  onChange(cb) {
    const sub = { cb, handle: null, cancelled: false };
    this._changeSubscribers.add(sub);
    this._attachChange(sub);
    return () => {
      this._changeSubscribers.delete(sub);
      sub.cancelled = true;
      if (sub.handle) {
        try { sub.handle.cancel(); } catch {}
        sub.handle = null;
      }
    };
  }

  _startSync({ pullFirst = false } = {}) {
    const cfg = getSyncConfig();
    if (!cfg.url) {
      this._emitStatus({ state: 'disabled' });
      return;
    }
    let remote;
    try {
      remote = remoteDb(cfg);
    } catch (err) {
      this._emitStatus({ state: 'error', lastError: err });
      return;
    }
    this._emitStatus({ state: 'syncing' });

    const startLive = () => {
      const handle = this._db.sync(remote, { live: true, retry: true });
      this._syncHandle = handle;
      handle
        .on('change', () => this._emitStatus({ state: 'syncing' }))
        .on('active', () => this._emitStatus({ state: 'syncing' }))
        .on('paused', (err) => {
          if (err) this._emitStatus({ state: 'error', lastError: err });
          else this._emitStatus({ state: 'idle', lastSyncedAt: Date.now() });
        })
        .on('denied', (err) => this._emitStatus({ state: 'error', lastError: err }))
        .on('error', (err) => this._emitStatus({ state: 'error', lastError: err }));
    };

    if (pullFirst) {
      // One-time pull before bidirectional live sync — protects fresh clients
      // from a race where an empty local push wipes the remote.
      this._pullFirstPromise = this._db.replicate.from(remote)
        .then(() => { startLive(); })
        .catch((err) => {
          this._emitStatus({ state: 'error', lastError: err });
          // Still start live sync; retry: true will recover transient failures.
          startLive();
        })
        .finally(() => { this._pullFirstPromise = null; });
    } else {
      startLive();
    }
  }

  async reopen({ pullFirst = false } = {}) {
    if (this._syncHandle) {
      try { this._syncHandle.cancel(); } catch {}
      this._syncHandle = null;
    }
    for (const sub of this._changeSubscribers) {
      if (sub.handle) {
        try { sub.handle.cancel(); } catch {}
        sub.handle = null;
      }
    }
    if (this._db) {
      try { await this._db.close(); } catch {}
      this._db = null;
    }
    // Bypass open()'s implicit _startSync so we can pass pullFirst through.
    this._db = new PouchDB(DB_NAME);
    this._startSync({ pullFirst });
    for (const sub of this._changeSubscribers) {
      if (!sub.cancelled) this._attachChange(sub);
    }
    if (this._pullFirstPromise) {
      try { await this._pullFirstPromise; } catch {}
    }
    return this._db;
  }

  onSyncStatus(cb) {
    this._statusListeners.add(cb);
    if (this._lastStatus) {
      try { cb(this._lastStatus); } catch (err) { console.error(err); }
    }
    return () => this._statusListeners.delete(cb);
  }

  async syncNow() {
    const cfg = getSyncConfig();
    if (!cfg.url) throw new Error('Sync is not configured');
    const db = await this.open();
    const remote = remoteDb(cfg);
    this._emitStatus({ state: 'syncing' });
    try {
      const result = await db.sync(remote);
      this._emitStatus({ state: 'idle', lastSyncedAt: Date.now() });
      return result;
    } catch (err) {
      this._emitStatus({ state: 'error', lastError: err });
      throw err;
    }
  }

  async pullFromRemote() {
    const cfg = getSyncConfig();
    if (!cfg.url) throw new Error('Sync is not configured');
    // Cancel live sync while we rewrite local state.
    if (this._syncHandle) {
      try { this._syncHandle.cancel(); } catch {}
      this._syncHandle = null;
    }
    const db = await this.open();
    const remote = remoteDb(cfg);
    this._emitStatus({ state: 'syncing' });
    try {
      // Wipe local docs so the pull replaces rather than merges.
      const all = await db.allDocs({ include_docs: true });
      const deletes = all.rows
        .filter((r) => !r.id.startsWith('_design/'))
        .map((r) => ({ _id: r.id, _rev: r.doc._rev, _deleted: true }));
      if (deletes.length) await db.bulkDocs(deletes);
      const result = await db.replicate.from(remote);
      this._emitStatus({ state: 'idle', lastSyncedAt: Date.now() });
      this._startSync();
      return result;
    } catch (err) {
      this._emitStatus({ state: 'error', lastError: err });
      this._startSync();
      throw err;
    }
  }

  async getAll() {
    const db = await this.open();
    const res = await db.allDocs({
      include_docs: true,
      startkey: SUB_PREFIX,
      endkey: SUB_PREFIX + '￰',
    });
    const subs = res.rows.map((r) => fromDoc(r.doc));
    subs.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    return subs;
  }

  async put(sub) {
    const db = await this.open();
    const doc = toDoc(sub);
    try {
      const existing = await db.get(doc._id);
      doc._rev = existing._rev;
    } catch (err) {
      if (err.status !== 404) throw err;
    }
    await db.put(doc);
  }

  async delete(id) {
    const db = await this.open();
    try {
      const existing = await db.get(SUB_PREFIX + id);
      await db.remove(existing);
    } catch (err) {
      if (err.status !== 404) throw err;
    }
  }

  async clearAll() {
    const db = await this.open();
    const res = await db.allDocs({
      include_docs: true,
      startkey: SUB_PREFIX,
      endkey: SUB_PREFIX + '￰',
    });
    const deletes = res.rows.map((r) => ({
      _id: r.id, _rev: r.doc._rev, _deleted: true,
    }));
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
    const subscriptions = await this.getAll();
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
    const docs = data.subscriptions.map((s) => toDoc(s));
    if (docs.length) await db.bulkDocs(docs);
    if (data.settings && Object.keys(data.settings).length) {
      await this._writeSettings(data.settings);
    }
  }

  async getLegacyIdbData() {
    const legacy = await readLegacyIdb();
    if (!legacy) return null;
    const hasData = legacy.subscriptions.length
      || Object.keys(legacy.settings).length;
    return hasData ? legacy : null;
  }

  async replaceFromLegacy(legacy) {
    if (!legacy) {
      legacy = await this.getLegacyIdbData();
      if (!legacy) throw new Error('No legacy data found in IndexedDB');
    }
    const subscriptions = Array.isArray(legacy.subscriptions)
      ? legacy.subscriptions : [];
    const settings = (legacy.settings && typeof legacy.settings === 'object')
      ? legacy.settings : {};
    if (!subscriptions.length && !Object.keys(settings).length) {
      throw new Error('No subscriptions or settings found in legacy data');
    }
    const db = await this.open();
    await this.clearAll();
    const docs = subscriptions.map((s) => toDoc(s));
    if (docs.length) await db.bulkDocs(docs);
    if (Object.keys(settings).length) {
      await this._writeSettings(settings);
    }
    return { subscriptions: subscriptions.length };
  }
}

export const db = new SubscriptionDB();
