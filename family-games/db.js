import {
  DB_NAME,
  PLAYER_PREFIX,
  GAME_PREFIX,
  SESSION_PREFIX,
} from './state.js';

const PouchDB = globalThis.PouchDB;

const SYNC_PREFIX = 'family-games.sync.';
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
function playerToDoc(player) {
  return {
    _id: PLAYER_PREFIX + player.id,
    type: 'player',
    id: player.id,
    name: player.name,
    emoji: player.emoji || '',
    colour: player.colour || '',
    // A thumbnail-sized JPEG data URL (see photo.js) — small enough to ride
    // along in the document rather than as an attachment.
    photo: player.photo || '',
    // Archived players keep their history but disappear from the picker.
    archived: !!player.archived,
    order: player.order ?? 0,
    createdAt: player.createdAt ?? Date.now(),
  };
}

function playerFromDoc(doc) {
  return {
    id: doc.id ?? doc._id.slice(PLAYER_PREFIX.length),
    name: doc.name,
    emoji: doc.emoji || '',
    colour: doc.colour || '',
    photo: doc.photo || '',
    archived: !!doc.archived,
    order: doc.order ?? 0,
    createdAt: doc.createdAt ?? 0,
  };
}

function gameToDoc(game) {
  return {
    _id: GAME_PREFIX + game.id,
    type: 'game',
    id: game.id,
    title: game.title,
    createdAt: game.createdAt ?? Date.now(),
  };
}

function gameFromDoc(doc) {
  return {
    id: doc.id ?? doc._id.slice(GAME_PREFIX.length),
    title: doc.title,
    createdAt: doc.createdAt ?? 0,
  };
}

// Sessions are keyed by game so one game's history is a single range scan.
function sessionDocId(session) {
  return `${SESSION_PREFIX}${session.gameId}:${session.id}`;
}

function sessionToDoc(session) {
  return {
    _id: sessionDocId(session),
    type: 'session',
    id: session.id,
    gameId: session.gameId,
    // Local calendar date as YYYY-MM-DD — a game night belongs to the day it
    // was played, not to an instant, so no timezone travels with it.
    date: session.date,
    // `score` is optional: plenty of games only have a finishing order, and a
    // score of 0 is a real result, so "no score" has to be null rather than 0.
    results: (session.results || []).map((r) => ({
      playerId: r.playerId,
      position: r.position,
      score: Number.isFinite(r.score) ? r.score : null,
    })),
    note: session.note || '',
    createdAt: session.createdAt ?? Date.now(),
    updatedAt: Date.now(),
  };
}

function sessionFromDoc(doc) {
  return {
    id: doc.id,
    gameId: doc.gameId,
    date: doc.date,
    // Results recorded before scores existed have no `score` field at all,
    // so it's normalised here and nothing downstream has to care.
    results: (Array.isArray(doc.results) ? doc.results : []).map((r) => ({
      playerId: r.playerId,
      position: r.position,
      score: Number.isFinite(r.score) ? r.score : null,
    })),
    note: doc.note || '',
    createdAt: doc.createdAt ?? 0,
    updatedAt: doc.updatedAt ?? 0,
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

class GamesDB {
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

  // True when there is any user data locally (a player, game or result).
  async hasData() {
    const db = await this.open();
    for (const prefix of [PLAYER_PREFIX, GAME_PREFIX, SESSION_PREFIX]) {
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
      .on('error', (err) => console.error('[family-games changes]', err));
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
  // a result recorded at the table. Call this when the app regains the
  // foreground or the network returns to force a fresh push/pull.
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

  async _putWithRev(doc) {
    const db = await this.open();
    try {
      const existing = await db.get(doc._id);
      doc._rev = existing._rev;
    } catch (err) {
      if (err.status !== 404) throw err;
    }
    await db.put(doc);
  }

  // ── Players ──
  async getPlayers() {
    const db = await this.open();
    const res = await db.allDocs({
      include_docs: true,
      startkey: PLAYER_PREFIX,
      endkey: PLAYER_PREFIX + HIGH,
    });
    const players = res.rows.map((r) => playerFromDoc(r.doc));
    players.sort((a, b) => (a.order - b.order) || (a.createdAt - b.createdAt));
    return players;
  }

  async putPlayer(player) {
    await this._putWithRev(playerToDoc(player));
  }

  async deletePlayer(id) {
    const db = await this.open();
    try {
      const existing = await db.get(PLAYER_PREFIX + id);
      await db.remove(existing);
    } catch (err) {
      if (err.status !== 404) throw err;
    }
  }

  // ── Games ──
  async getGames() {
    const db = await this.open();
    const res = await db.allDocs({
      include_docs: true,
      startkey: GAME_PREFIX,
      endkey: GAME_PREFIX + HIGH,
    });
    const games = res.rows.map((r) => gameFromDoc(r.doc));
    games.sort((a, b) => a.title.localeCompare(b.title));
    return games;
  }

  async putGame(game) {
    await this._putWithRev(gameToDoc(game));
  }

  async deleteGame(id) {
    const db = await this.open();
    // Remove the game doc and every result recorded against it.
    const deletes = [];
    try {
      const existing = await db.get(GAME_PREFIX + id);
      deletes.push({ _id: existing._id, _rev: existing._rev, _deleted: true });
    } catch (err) {
      if (err.status !== 404) throw err;
    }
    const sessions = await db.allDocs({
      include_docs: true,
      startkey: `${SESSION_PREFIX}${id}:`,
      endkey: `${SESSION_PREFIX}${id}:${HIGH}`,
    });
    for (const r of sessions.rows) {
      deletes.push({ _id: r.id, _rev: r.doc._rev, _deleted: true });
    }
    if (deletes.length) await db.bulkDocs(deletes);
  }

  // ── Sessions (one recorded play of a game) ──
  // Every session in one scan: a family's history is small, and the home page
  // needs totals across all games anyway.
  async getSessions() {
    const db = await this.open();
    const res = await db.allDocs({
      include_docs: true,
      startkey: SESSION_PREFIX,
      endkey: SESSION_PREFIX + HIGH,
    });
    const sessions = res.rows.map((r) => sessionFromDoc(r.doc));
    // Newest first: by the date played, then by when it was entered so two
    // games on the same evening keep the order they were recorded in.
    sessions.sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt - a.createdAt));
    return sessions;
  }

  async putSession(session) {
    await this._putWithRev(sessionToDoc(session));
  }

  async deleteSession(gameId, id) {
    const db = await this.open();
    try {
      const existing = await db.get(`${SESSION_PREFIX}${gameId}:${id}`);
      await db.remove(existing);
    } catch (err) {
      if (err.status !== 404) throw err;
    }
  }
}

export const db = new GamesDB();
