import {
  DB_NAME,
  LIST_PREFIX,
  ITEM_PREFIX,
  TEMPLATE_PREFIX,
  SETTINGS_ID,
} from './state.js';

const PouchDB = globalThis.PouchDB;

const SYNC_PREFIX = 'todo-lists.sync.';
const HIGH = '￿';

// Query-string param that carries a shared sync config (URL-safe base64 JSON).
export const SHARE_PARAM = 'sync';

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

// ── Shareable sync config (URL-safe base64 of a JSON {url, token}) ──
// URL-safe so the value survives a query string untouched (no +, /, = that
// URLSearchParams would otherwise mangle). UTF-8 aware so non-ASCII tokens
// round-trip correctly.
export function encodeSyncConfig({ url, token }) {
  const json = JSON.stringify({ url, token: token || '' });
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeSyncConfig(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const cfg = JSON.parse(new TextDecoder().decode(bytes));
  if (!cfg || typeof cfg.url !== 'string') throw new Error('Malformed sync config');
  return { url: cfg.url, token: typeof cfg.token === 'string' ? cfg.token : '' };
}

// ── Document <-> model mappers ──
function listToDoc(list) {
  return {
    _id: LIST_PREFIX + list.id,
    type: 'list',
    id: list.id,
    name: list.name,
    order: list.order ?? 0,
    createdAt: list.createdAt ?? Date.now(),
  };
}

function listFromDoc(doc) {
  return {
    id: doc.id ?? doc._id.slice(LIST_PREFIX.length),
    name: doc.name,
    order: doc.order ?? 0,
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

class TodoDB {
  constructor() {
    this._db = null;
    this._syncHandle = null;
    this._pullFirstPromise = null;
    this._statusListeners = new Set();
    this._lastStatus = null;
    this._changeSubscribers = new Set();
    this._probeSeq = 0;
  }

  async open() {
    if (this._db) return this._db;
    this._db = new PouchDB(DB_NAME);
    this._startSync();
    return this._db;
  }

  // True when there is any user data locally (a list, item or template).
  async hasData() {
    const db = await this.open();
    for (const prefix of [LIST_PREFIX, ITEM_PREFIX, TEMPLATE_PREFIX]) {
      const res = await db.allDocs({ startkey: prefix, endkey: prefix + HIGH, limit: 1 });
      if (res.rows.length) return true;
    }
    return false;
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
      .on('error', (err) => console.error('[todo changes]', err));
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

  // With retry:true PouchDB swallows connection failures: 'paused' fires with
  // no error while it backs off between retries, which looks identical to
  // "all caught up". Probe the remote to tell the two apart before reporting
  // idle. Guarded against stale handles (reopen) and out-of-order responses.
  async _verifyIdle(remote, handle) {
    const probe = ++this._probeSeq;
    let status;
    try {
      await remote.info();
      status = { state: 'idle', lastSyncedAt: Date.now() };
    } catch (err) {
      status = { state: 'error', lastError: err };
    }
    if (this._syncHandle !== handle || probe !== this._probeSeq) return;
    this._emitStatus(status);
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
          else this._verifyIdle(remote, handle);
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

  // Tear down the live-sync connection and start a fresh one, leaving the local
  // DB and its change subscribers untouched (unlike reopen(), which closes
  // IndexedDB). Mobile browsers freeze the page while backgrounded and Data
  // Saver throttles long-lived connections, which can leave a zombie sync
  // socket that looks alive but never resumes — stranding a queued change like
  // an unticked item. Call this when the app regains the foreground or the
  // network returns to force a fresh push/pull. Safe to call when sync is
  // unconfigured (_startSync emits 'disabled' and returns) or before the DB is
  // open (open() starts sync itself).
  restartSync() {
    if (!this._db) return;
    if (this._pullFirstPromise) return; // an initial pull-then-live is in flight
    if (this._syncHandle) {
      try { this._syncHandle.cancel(); } catch {}
      this._syncHandle = null;
    }
    this._startSync();
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
    this._emitStatus({ state: 'syncing' });
    try {
      // Destroy the local DB entirely so no tombstones are left behind that
      // could be pushed back and wipe real data once live sync resumes.
      await this.open();
      await this._db.destroy();
      this._db = new PouchDB(DB_NAME);
      const remote = remoteDb(cfg);
      const result = await this._db.replicate.from(remote);
      for (const sub of this._changeSubscribers) {
        if (!sub.cancelled) this._attachChange(sub);
      }
      this._emitStatus({ state: 'idle', lastSyncedAt: Date.now() });
      this._startSync();
      return result;
    } catch (err) {
      if (!this._db) this._db = new PouchDB(DB_NAME);
      for (const sub of this._changeSubscribers) {
        if (!sub.cancelled && !sub.handle) this._attachChange(sub);
      }
      this._emitStatus({ state: 'error', lastError: err });
      this._startSync();
      throw err;
    }
  }

  // ── Lists ──
  async getLists() {
    const db = await this.open();
    const res = await db.allDocs({
      include_docs: true,
      startkey: LIST_PREFIX,
      endkey: LIST_PREFIX + HIGH,
    });
    const lists = res.rows.map((r) => listFromDoc(r.doc));
    lists.sort((a, b) => (a.order - b.order) || (a.createdAt - b.createdAt));
    return lists;
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
    const db = await this.open();
    const doc = listToDoc(list);
    try {
      const existing = await db.get(doc._id);
      doc._rev = existing._rev;
    } catch (err) {
      if (err.status !== 404) throw err;
    }
    await db.put(doc);
  }

  async deleteList(id) {
    const db = await this.open();
    // Remove the list doc and every item that belongs to it.
    const deletes = [];
    try {
      const existing = await db.get(LIST_PREFIX + id);
      deletes.push({ _id: existing._id, _rev: existing._rev, _deleted: true });
    } catch (err) {
      if (err.status !== 404) throw err;
    }
    const items = await db.allDocs({
      include_docs: true,
      startkey: `${ITEM_PREFIX}${id}:`,
      endkey: `${ITEM_PREFIX}${id}:${HIGH}`,
    });
    for (const r of items.rows) {
      deletes.push({ _id: r.id, _rev: r.doc._rev, _deleted: true });
    }
    if (deletes.length) await db.bulkDocs(deletes);
  }

  // ── Items ──
  async getItems(listId) {
    const db = await this.open();
    const res = await db.allDocs({
      include_docs: true,
      startkey: `${ITEM_PREFIX}${listId}:`,
      endkey: `${ITEM_PREFIX}${listId}:${HIGH}`,
    });
    const items = res.rows.map((r) => itemFromDoc(r.doc));
    items.sort((a, b) => (a.order - b.order) || (a.createdAt - b.createdAt));
    return items;
  }

  async putItem(item) {
    const db = await this.open();
    const doc = itemToDoc(item);
    try {
      const existing = await db.get(doc._id);
      doc._rev = existing._rev;
    } catch (err) {
      if (err.status !== 404) throw err;
    }
    await db.put(doc);
  }

  async deleteItem(listId, itemId) {
    const db = await this.open();
    try {
      const existing = await db.get(`${ITEM_PREFIX}${listId}:${itemId}`);
      await db.remove(existing);
    } catch (err) {
      if (err.status !== 404) throw err;
    }
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
  async getTemplates() {
    const db = await this.open();
    const res = await db.allDocs({
      include_docs: true,
      startkey: TEMPLATE_PREFIX,
      endkey: TEMPLATE_PREFIX + HIGH,
    });
    const tpls = res.rows.map((r) => templateFromDoc(r.doc));
    tpls.sort((a, b) => (a.createdAt - b.createdAt));
    return tpls;
  }

  async putTemplate(tpl) {
    const db = await this.open();
    const doc = templateToDoc(tpl);
    try {
      const existing = await db.get(doc._id);
      doc._rev = existing._rev;
    } catch (err) {
      if (err.status !== 404) throw err;
    }
    await db.put(doc);
  }

  async deleteTemplate(id) {
    const db = await this.open();
    try {
      const existing = await db.get(TEMPLATE_PREFIX + id);
      await db.remove(existing);
    } catch (err) {
      if (err.status !== 404) throw err;
    }
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
    const items = await this.getItems(sourceId);
    const listId = crypto.randomUUID();
    const now = Date.now();
    await this.putList({ id: listId, name, order: now, createdAt: now });
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
