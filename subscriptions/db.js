import { DB_NAME } from './state.js';
import { openDatabase } from '../vendor/origin-sql/origin-sql.bundle.js';

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT,
    favicon TEXT,
    amount REAL NOT NULL,
    currency TEXT NOT NULL,
    cycle TEXT NOT NULL,
    recurring_day INTEGER NOT NULL,
    recurring_month INTEGER,
    category TEXT NOT NULL,
    end_date TEXT,
    created_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )`,
];

const SYNC_PREFIX = 'subscription-tracker.sync.';

export function getSyncConfig() {
  const url = localStorage.getItem(SYNC_PREFIX + 'url') || '';
  const token = localStorage.getItem(SYNC_PREFIX + 'token') || '';
  const interval = parseInt(localStorage.getItem(SYNC_PREFIX + 'interval') || '15000', 10);
  return { url, token, interval };
}

export function setSyncConfig({ url, token, interval }) {
  const setOrClear = (k, v) => {
    if (v) localStorage.setItem(SYNC_PREFIX + k, String(v));
    else localStorage.removeItem(SYNC_PREFIX + k);
  };
  setOrClear('url', url);
  setOrClear('token', token);
  setOrClear('interval', interval);
}

function toRow(sub) {
  return {
    id: sub.id,
    name: sub.name,
    url: sub.url ?? null,
    favicon: sub.favicon ?? null,
    amount: sub.amount,
    currency: sub.currency,
    cycle: sub.cycle,
    recurring_day: sub.recurringDay,
    recurring_month: sub.recurringMonth ?? null,
    category: sub.category ?? 'personal',
    end_date: sub.endDate ?? null,
    created_at: sub.createdAt ?? Date.now(),
  };
}

function fromRow(r) {
  const sub = {
    id: r.id,
    name: r.name,
    url: r.url || '',
    favicon: r.favicon || '',
    amount: r.amount,
    currency: r.currency,
    cycle: r.cycle,
    recurringDay: r.recurring_day,
    category: r.category,
    createdAt: r.created_at,
  };
  if (r.recurring_month != null) sub.recurringMonth = r.recurring_month;
  if (r.end_date) sub.endDate = r.end_date;
  return sub;
}

const INSERT_SUB_SQL = `INSERT OR REPLACE INTO subscriptions
    (id, name, url, favicon, amount, currency, cycle,
     recurring_day, recurring_month, category, end_date, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

function subParams(r) {
  return [r.id, r.name, r.url, r.favicon, r.amount, r.currency, r.cycle,
    r.recurring_day, r.recurring_month, r.category, r.end_date, r.created_at];
}

async function fetchRemoteTables(url, authToken) {
  const endpoint = new URL('/v2/pipeline', url);
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(authToken ? { authorization: `Bearer ${authToken}` } : {}),
    },
    body: JSON.stringify({
      requests: [
        {
          type: 'execute',
          stmt: {
            sql: "SELECT name, sql FROM sqlite_master WHERE type = 'table'"
              + " AND name NOT LIKE '\\_sync\\_%' ESCAPE '\\'"
              + " AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\'",
            args: [],
          },
        },
        { type: 'close' },
      ],
    }),
  });
  if (!resp.ok) throw new Error(`libSQL returned HTTP ${resp.status}`);
  const json = await resp.json();
  const res = json.results?.[0];
  if (res?.type === 'error') {
    throw new Error(res.error?.message || 'remote schema query failed');
  }
  const result = res?.response?.result;
  const cols = (result?.cols ?? []).map((c) => c.name);
  const rows = result?.rows ?? [];
  const nameIdx = cols.indexOf('name');
  const sqlIdx = cols.indexOf('sql');
  return rows
    .map((r) => ({ name: r[nameIdx]?.value, sql: r[sqlIdx]?.value }))
    .filter((t) => t.name && t.sql);
}

function toIdempotentCreate(sql) {
  return sql.replace(
    /^(\s*CREATE\s+TABLE\s+)(?!IF\s+NOT\s+EXISTS\b)/i,
    '$1IF NOT EXISTS ',
  );
}

// ── One-time migration from the legacy IndexedDB store ──
async function readLegacyIdb() {
  if (!('indexedDB' in globalThis)) return null;
  const existing = await new Promise((resolve) => {
    if (!indexedDB.databases) return resolve(true); // can't tell — try anyway
    indexedDB.databases().then(
      (list) => resolve(list.some((d) => d.name === DB_NAME)),
      () => resolve(true),
    );
  });
  if (!existing) return null;

  return new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME, 1);
    let opened = null;
    req.onsuccess = () => {
      opened = req.result;
      const stores = opened.objectStoreNames;
      if (!stores.contains('subscriptions') && !stores.contains('settings')) {
        opened.close();
        return resolve(null);
      }
      const tx = opened.transaction(
        [stores.contains('subscriptions') ? 'subscriptions' : 'settings'].concat(
          stores.contains('subscriptions') && stores.contains('settings') ? ['settings'] : [],
        ),
        'readonly',
      );
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
      tx.onerror = () => {
        opened.close();
        resolve(null);
      };
    };
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}

async function migrateFromIdb(dbh) {
  const already = await dbh.query("SELECT value FROM settings WHERE key = 'migratedFromIdb'");
  if (already.length) return;
  const legacy = await readLegacyIdb();
  if (!legacy) {
    await dbh.exec(
      'INSERT OR REPLACE INTO settings(key, value) VALUES (?, ?)',
      ['migratedFromIdb', JSON.stringify('1')],
    );
    return;
  }
  await dbh.transaction(async (tx) => {
    for (const sub of legacy.subscriptions) {
      await tx.exec(INSERT_SUB_SQL, subParams(toRow(sub)));
    }
    for (const [k, v] of Object.entries(legacy.settings)) {
      await tx.exec(
        'INSERT OR REPLACE INTO settings(key, value) VALUES (?, ?)',
        [k, JSON.stringify(v)],
      );
    }
    await tx.exec(
      'INSERT OR REPLACE INTO settings(key, value) VALUES (?, ?)',
      ['migratedFromIdb', JSON.stringify('1')],
    );
  });
}

class SubscriptionDB {
  constructor() {
    this._dbPromise = null;
    this._statusListeners = new Set();
    this._unsubStatus = null;
    this._lastStatus = null;
  }

  async open() {
    if (this._dbPromise) return this._dbPromise;
    this._dbPromise = (async () => {
      const cfg = getSyncConfig();
      const sync = cfg.url
        ? {
          url: cfg.url,
          authToken: cfg.token || undefined,
          interval: cfg.interval || undefined,
          syncOnMutation: true,
        }
        : undefined;
      // Schema is applied one statement at a time: origin-sql runs the schema
      // option through sqlite's single-statement prepare/step, which silently
      // drops anything after the first semicolon.
      const dbh = await openDatabase({ name: DB_NAME, sync });
      for (const sql of SCHEMA_STATEMENTS) await dbh.exec(sql);
      await migrateFromIdb(dbh);
      if (sync) {
        this._unsubStatus = dbh.onSyncStatus((s) => {
          this._lastStatus = s;
          for (const cb of Array.from(this._statusListeners)) {
            try { cb(s); } catch (err) { console.error(err); }
          }
        });
      } else {
        this._lastStatus = { state: 'disabled' };
        for (const cb of Array.from(this._statusListeners)) {
          try { cb(this._lastStatus); } catch (err) { console.error(err); }
        }
      }
      return dbh;
    })();
    return this._dbPromise;
  }

  async reopen() {
    if (this._unsubStatus) {
      try { this._unsubStatus(); } catch {}
      this._unsubStatus = null;
    }
    if (this._dbPromise) {
      try { const dbh = await this._dbPromise; await dbh.close(); } catch {}
      this._dbPromise = null;
    }
    return this.open();
  }

  onSyncStatus(cb) {
    this._statusListeners.add(cb);
    if (this._lastStatus) {
      try { cb(this._lastStatus); } catch (err) { console.error(err); }
    }
    return () => this._statusListeners.delete(cb);
  }

  async syncNow() {
    const dbh = await this.open();
    if (!getSyncConfig().url) throw new Error('Sync is not configured');
    return dbh.sync();
  }

  async pullFromRemote() {
    const cfg = getSyncConfig();
    if (!cfg.url) throw new Error('Sync is not configured');
    const dbh = await this.open();
    // origin-sql's pull doesn't auto-create tables that only exist on the
    // remote — we'd hit "no such table: …" when applying a row. Fetch the
    // remote schema first and mirror any missing tables locally.
    const remoteTables = await fetchRemoteTables(cfg.url, cfg.token);
    for (const t of remoteTables) {
      await dbh.exec(toIdempotentCreate(t.sql));
    }
    // Drop any un-pushed local changes so the subsequent sync() is a pull only.
    // _sync_meta is internal to origin-sql; deleting pending rows means push()
    // has nothing to send, while pull() still applies remote ops locally.
    await dbh.exec('DELETE FROM _sync_meta WHERE synced_at IS NULL');
    const result = await dbh.sync();
    return result.pull;
  }

  async getAll() {
    const dbh = await this.open();
    const rows = await dbh.query('SELECT * FROM subscriptions ORDER BY created_at ASC');
    return rows.map(fromRow);
  }

  async put(sub) {
    const dbh = await this.open();
    await dbh.exec(INSERT_SUB_SQL, subParams(toRow(sub)));
  }

  async delete(id) {
    const dbh = await this.open();
    await dbh.exec('DELETE FROM subscriptions WHERE id = ?', [id]);
  }

  async clearAll() {
    const dbh = await this.open();
    await dbh.exec('DELETE FROM subscriptions');
  }

  async getSetting(key) {
    const dbh = await this.open();
    const rows = await dbh.query('SELECT value FROM settings WHERE key = ?', [key]);
    if (!rows.length) return null;
    try { return JSON.parse(rows[0].value); } catch { return rows[0].value; }
  }

  async setSetting(key, value) {
    const dbh = await this.open();
    await dbh.exec(
      'INSERT OR REPLACE INTO settings(key, value) VALUES (?, ?)',
      [key, JSON.stringify(value)],
    );
  }

  async getAllSettings() {
    const dbh = await this.open();
    const rows = await dbh.query('SELECT key, value FROM settings');
    const map = {};
    for (const r of rows) {
      try { map[r.key] = JSON.parse(r.value); } catch { map[r.key] = r.value; }
    }
    return map;
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
    const dbh = await this.open();
    await dbh.transaction(async (tx) => {
      await tx.exec('DELETE FROM subscriptions');
      for (const sub of data.subscriptions) {
        await tx.exec(INSERT_SUB_SQL, subParams(toRow(sub)));
      }
      if (data.settings) {
        for (const [k, v] of Object.entries(data.settings)) {
          await tx.exec(
            'INSERT OR REPLACE INTO settings(key, value) VALUES (?, ?)',
            [k, JSON.stringify(v)],
          );
        }
      }
    });
  }

  async replaceFromLegacy() {
    const legacy = await readLegacyIdb();
    const hasData = legacy
      && (legacy.subscriptions.length || Object.keys(legacy.settings).length);
    if (!hasData) throw new Error('No legacy data found in IndexedDB');
    const dbh = await this.open();
    await dbh.transaction(async (tx) => {
      await tx.exec('DELETE FROM subscriptions');
      for (const sub of legacy.subscriptions) {
        await tx.exec(INSERT_SUB_SQL, subParams(toRow(sub)));
      }
      for (const [k, v] of Object.entries(legacy.settings)) {
        await tx.exec(
          'INSERT OR REPLACE INTO settings(key, value) VALUES (?, ?)',
          [k, JSON.stringify(v)],
        );
      }
    });
    return { subscriptions: legacy.subscriptions.length };
  }
}

export const db = new SubscriptionDB();
