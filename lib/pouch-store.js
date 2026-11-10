// Local-first PouchDB store with live CouchDB replication.
//
// Every tool in this collection that syncs works the same way: one local
// PouchDB, documents namespaced by an id prefix, and a live bidirectional
// replication against a CouchDB-compatible endpoint. This class is that whole
// engine — connection lifecycle, status reporting, change subscriptions and the
// three manual operations (sync now, pull, reconfigure). A tool subclasses it
// and adds only its document mappers and domain queries.

// Sorts after every printable character, so `prefix` → `prefix + HIGH` is the
// range of every doc under that prefix.
export const HIGH = '￿';

// Resolved lazily rather than captured at module scope: PouchDB is loaded as a
// classic script, and a module that happens to be evaluated first would
// otherwise capture undefined.
function Pouch() {
  const P = globalThis.PouchDB;
  if (!P) throw new Error('PouchDB is not loaded — include /vendor/pouchdb/pouchdb.min.js');
  return P;
}

function remoteDb(cfg) {
  const P = Pouch();
  const opts = {};
  if (cfg.token) {
    opts.fetch = (url, init) => {
      const headers = new Headers(init?.headers || {});
      headers.set('Authorization', `Bearer ${cfg.token}`);
      return P.fetch(url, { ...init, headers });
    };
  }
  return new P(cfg.url, opts);
}

export class PouchStore {
  // `dbName`     local PouchDB name
  // `label`      short tool name, used only in console output
  // `prefixes`   doc id prefixes that count as user data (see hasData)
  // `getConfig`  () => ({ url, token }) — see lib/sync-config.js
  constructor({ dbName, label, prefixes = [], getConfig }) {
    this._dbName = dbName;
    this._label = label;
    this._prefixes = prefixes;
    this._getConfig = getConfig;
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
    this._db = new (Pouch())(this._dbName);
    this._startSync();
    return this._db;
  }

  // True when there is any user data locally.
  async hasData() {
    const db = await this.open();
    for (const prefix of this._prefixes) {
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
      .on('error', (err) => console.error(`[${this._label} changes]`, err));
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

  _cancelChangeHandles() {
    for (const sub of this._changeSubscribers) {
      if (sub.handle) {
        try { sub.handle.cancel(); } catch {}
        sub.handle = null;
      }
    }
  }

  _reattachChangeHandles() {
    for (const sub of this._changeSubscribers) {
      if (!sub.cancelled && !sub.handle) this._attachChange(sub);
    }
  }

  _cancelSync() {
    if (this._syncHandle) {
      try { this._syncHandle.cancel(); } catch {}
      this._syncHandle = null;
    }
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
    const cfg = this._getConfig();
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
    this._cancelSync();
    this._cancelChangeHandles();
    if (this._db) {
      try { await this._db.close(); } catch {}
      this._db = null;
    }
    // Bypass open()'s implicit _startSync so we can pass pullFirst through.
    this._db = new (Pouch())(this._dbName);
    this._startSync({ pullFirst });
    this._reattachChangeHandles();
    if (this._pullFirstPromise) {
      try { await this._pullFirstPromise; } catch {}
    }
    return this._db;
  }

  // Tear down the live-sync connection and start a fresh one, leaving the local
  // DB and its change subscribers untouched (unlike reopen(), which closes
  // IndexedDB). Mobile browsers freeze the page while backgrounded and Data
  // Saver throttles long-lived connections, which can leave a zombie sync
  // socket that looks alive but never resumes — stranding a queued change. Call
  // this when the app regains the foreground or the network returns to force a
  // fresh push/pull. Safe to call when sync is unconfigured (_startSync emits
  // 'disabled' and returns) or before the DB is open (open() starts sync).
  restartSync() {
    if (!this._db) return;
    if (this._pullFirstPromise) return; // an initial pull-then-live is in flight
    this._cancelSync();
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
    const cfg = this._getConfig();
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
    const cfg = this._getConfig();
    if (!cfg.url) throw new Error('Sync is not configured');
    this._cancelSync();
    this._cancelChangeHandles();
    this._emitStatus({ state: 'syncing' });
    try {
      // Destroy the local DB entirely so no tombstones are left behind that
      // could be pushed back and wipe real data once live sync resumes.
      await this.open();
      await this._db.destroy();
      this._db = new (Pouch())(this._dbName);
      const remote = remoteDb(cfg);
      const result = await this._db.replicate.from(remote);
      this._reattachChangeHandles();
      this._emitStatus({ state: 'idle', lastSyncedAt: Date.now() });
      this._startSync();
      return result;
    } catch (err) {
      if (!this._db) this._db = new (Pouch())(this._dbName);
      this._reattachChangeHandles();
      this._emitStatus({ state: 'error', lastError: err });
      this._startSync();
      throw err;
    }
  }

  // ── Generic document helpers ──

  // Write a doc, carrying over the current _rev when one already exists. The
  // mappers build docs from scratch, so this is what makes them an upsert.
  // Returns the {ok, id, rev} PouchDB reports, so a caller that needs to
  // recognise its own write coming back through the live changes feed can note
  // the revision it just created.
  async putWithRev(doc) {
    const db = await this.open();
    try {
      const existing = await db.get(doc._id);
      doc._rev = existing._rev;
    } catch (err) {
      if (err.status !== 404) throw err;
    }
    return db.put(doc);
  }

  // Every doc under an id prefix, mapped and optionally sorted.
  async getRange(prefix, fromDoc, compare) {
    const db = await this.open();
    const res = await db.allDocs({
      include_docs: true,
      startkey: prefix,
      endkey: prefix + HIGH,
    });
    const out = res.rows.map((r) => fromDoc(r.doc));
    if (compare) out.sort(compare);
    return out;
  }

  // Delete one doc by full id. Missing docs are not an error — the caller
  // wanted it gone and it is.
  // Returns the removal's {ok, id, rev}, or null when there was nothing to
  // remove — same reasoning as putWithRev above.
  async removeById(id) {
    const db = await this.open();
    try {
      const existing = await db.get(id);
      return await db.remove(existing);
    } catch (err) {
      if (err.status !== 404) throw err;
      return null;
    }
  }

  // Tombstones for every doc under a prefix, for the caller to bulk-write
  // alongside whatever else the same operation deletes.
  async deletionsForRange(prefix) {
    const db = await this.open();
    const res = await db.allDocs({
      include_docs: true,
      startkey: prefix,
      endkey: prefix + HIGH,
    });
    return res.rows.map((r) => ({ _id: r.id, _rev: r.doc._rev, _deleted: true }));
  }
}
