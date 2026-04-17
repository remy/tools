/* origin-sql 0.3.0 — browser-side SQLite with optional libSQL sync */
/* Homepage: https://github.com/ */
/* License: MIT */

// src/errors.js
var OriginSqlError = class extends Error {
  constructor(message, cause) {
    super(message);
    this.name = "OriginSqlError";
    if (cause !== void 0) this.cause = cause;
  }
};
var SchemaError = class extends OriginSqlError {
  constructor(message, cause) {
    super(message, cause);
    this.name = "SchemaError";
  }
};
var RpcError = class extends OriginSqlError {
  constructor(message, cause) {
    super(message, cause);
    this.name = "RpcError";
  }
};
var SyncError = class extends OriginSqlError {
  constructor(message, cause) {
    super(message, cause);
    this.name = "SyncError";
  }
};
var AuthError = class extends SyncError {
  constructor(message, cause) {
    super(message, cause);
    this.name = "AuthError";
  }
};
var NetworkError = class extends SyncError {
  constructor(message, cause) {
    super(message, cause);
    this.name = "NetworkError";
  }
};
var ServerError = class extends SyncError {
  constructor(message, cause, status) {
    super(message, cause);
    this.name = "ServerError";
    if (status !== void 0) this.status = status;
  }
};
var QuotaError = class extends OriginSqlError {
  constructor(message, cause) {
    super(message, cause);
    this.name = "QuotaError";
  }
};

// src/rpc.js
function createRpc(port) {
  const pending = /* @__PURE__ */ new Map();
  let nextId = 1;
  port.addEventListener("message", (event) => {
    const { id, result, error } = event.data ?? {};
    if (id == null) return;
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    if (error) {
      entry.reject(new RpcError(error.message ?? "rpc error", error));
    } else {
      entry.resolve(result);
    }
  });
  function call(op, payload, transfer) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      if (transfer && transfer.length) {
        port.postMessage({ id, op, payload }, transfer);
      } else {
        port.postMessage({ id, op, payload });
      }
    });
  }
  function dispose(reason) {
    const err = new RpcError(reason ?? "rpc disposed");
    for (const { reject } of pending.values()) reject(err);
    pending.clear();
  }
  return { call, dispose };
}

// src/events.js
function createNotifier() {
  const byTable = /* @__PURE__ */ new Map();
  function subscribe(table, cb) {
    const key = String(table).toLowerCase();
    let set = byTable.get(key);
    if (!set) {
      set = /* @__PURE__ */ new Set();
      byTable.set(key, set);
    }
    set.add(cb);
    return () => {
      const s = byTable.get(key);
      if (!s) return;
      s.delete(cb);
      if (s.size === 0) byTable.delete(key);
    };
  }
  function emit(tables) {
    if (!tables) return;
    for (const table of tables) {
      const set = byTable.get(String(table).toLowerCase());
      if (!set) continue;
      for (const cb of Array.from(set)) {
        try {
          cb();
        } catch (err) {
          console.error("[origin-sql] subscriber threw:", err);
        }
      }
    }
  }
  function clear() {
    byTable.clear();
  }
  return { subscribe, emit, clear };
}

// src/sync.js
function idempotentCreate(sql) {
  if (!sql) return sql;
  return sql.replace(
    /^(\s*CREATE\s+TABLE\s+)(?!IF\s+NOT\s+EXISTS\b)/i,
    "$1IF NOT EXISTS "
  );
}
var REMOTE_LOG_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS _sync_log (
     seq        INTEGER PRIMARY KEY AUTOINCREMENT,
     table_name TEXT NOT NULL,
     row_id     TEXT NOT NULL,
     op         TEXT NOT NULL CHECK (op IN ('I','U','D')),
     payload    TEXT,
     changed_at INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS _sync_log_seq_idx ON _sync_log(seq)`
];
function encodeArg(v) {
  if (v === null || v === void 0) return { type: "null" };
  if (typeof v === "bigint") return { type: "integer", value: v.toString() };
  if (typeof v === "number") {
    if (Number.isInteger(v)) return { type: "integer", value: String(v) };
    return { type: "float", value: v };
  }
  if (typeof v === "boolean") return { type: "integer", value: v ? "1" : "0" };
  if (typeof v === "string") return { type: "text", value: v };
  if (v instanceof Uint8Array) {
    let bin = "";
    for (let i = 0; i < v.length; i++) bin += String.fromCharCode(v[i]);
    return { type: "blob", base64: btoa(bin) };
  }
  return { type: "text", value: String(v) };
}
function decodeValue(v) {
  if (!v || v.type === "null") return null;
  if (v.type === "integer") return Number(v.value);
  if (v.type === "float") return Number(v.value);
  if (v.type === "text") return v.value;
  if (v.type === "blob") {
    const bin = atob(v.base64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return null;
}
function stmt(sql, args = []) {
  return { sql, args: args.map(encodeArg) };
}
function parseRows(result) {
  if (!result) return [];
  const cols = (result.cols ?? []).map((c) => c.name);
  const rows = result.rows ?? [];
  return rows.map((row) => {
    const obj = {};
    for (let i = 0; i < cols.length; i++) obj[cols[i]] = decodeValue(row[i]);
    return obj;
  });
}
async function pipeline(url, authToken, requests, fetchImpl = fetch) {
  const endpoint = new URL("/v2/pipeline", url);
  let resp;
  try {
    resp = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authToken ? { authorization: `Bearer ${authToken}` } : {}
      },
      body: JSON.stringify({
        requests: [...requests, { type: "close" }]
      })
    });
  } catch (err) {
    throw new NetworkError(`libSQL request to ${endpoint} failed: ${err.message ?? err}`, err);
  }
  if (resp.status === 401 || resp.status === 403) {
    throw new AuthError(`libSQL authentication failed (${resp.status})`);
  }
  if (resp.status >= 500 && resp.status < 600) {
    throw new ServerError(`libSQL server error ${resp.status}`, void 0, resp.status);
  }
  if (!resp.ok) {
    throw new SyncError(`libSQL returned HTTP ${resp.status}`);
  }
  let json;
  try {
    json = await resp.json();
  } catch (err) {
    throw new SyncError("libSQL response was not valid JSON", err);
  }
  const results = json.results ?? [];
  for (const r of results) {
    if (r?.type === "error") {
      const msg = r.error?.message ?? "libSQL returned an error";
      throw new ServerError(`libSQL pipeline error: ${msg}`, r.error, resp.status);
    }
  }
  return results.map((r) => r.response?.result ?? null);
}
function createSyncer({ rpc, url, authToken, fetch: fetchImpl }) {
  let bootstrapped = false;
  let running = false;
  async function bootstrap() {
    if (bootstrapped) return;
    const { tables } = await rpc.call("sync:user-schema", {});
    const setupSql = [
      ...REMOTE_LOG_SCHEMA,
      ...tables.map((t) => idempotentCreate(t.createSql)).filter(Boolean)
    ];
    await pipeline(
      url,
      authToken,
      setupSql.map((s) => ({ type: "execute", stmt: stmt(s) })),
      fetchImpl
    );
    bootstrapped = true;
  }
  async function push() {
    const { ops, watermark } = await rpc.call("sync:prepare-push", {});
    if (!ops.length) return { pushed: 0, watermark: 0, remoteMaxSeq: null };
    const requests = [{ type: "execute", stmt: stmt("BEGIN") }];
    for (const op of ops) {
      if (op.op === "D") {
        requests.push({
          type: "execute",
          stmt: stmt(`DELETE FROM "${op.table}" WHERE rowid = ?`, [Number(op.rowId)])
        });
      } else {
        const cols = Object.keys(op.payload).filter((k) => k !== "__rowid");
        const values = cols.map((k) => op.payload[k]);
        const colList = cols.map((c) => `"${c}"`).join(", ");
        const phList = ["?", ...cols.map(() => "?")].join(", ");
        requests.push({
          type: "execute",
          stmt: stmt(
            `INSERT OR REPLACE INTO "${op.table}" (rowid, ${colList}) VALUES (${phList})`,
            [Number(op.rowId), ...values]
          )
        });
      }
      const payloadJson = op.op === "D" ? null : JSON.stringify(op.payload);
      requests.push({
        type: "execute",
        stmt: stmt(
          "INSERT INTO _sync_log(table_name, row_id, op, payload, changed_at) VALUES (?, ?, ?, ?, ?)",
          [op.table, String(op.rowId), op.op, payloadJson, op.changedAt]
        )
      });
    }
    requests.push({
      type: "execute",
      stmt: stmt("SELECT MAX(seq) AS max_seq FROM _sync_log")
    });
    requests.push({ type: "execute", stmt: stmt("COMMIT") });
    const results = await pipeline(url, authToken, requests, fetchImpl);
    const maxSeqRows = parseRows(results[results.length - 3]);
    const remoteMaxSeq = Number(maxSeqRows[0]?.max_seq ?? 0);
    await rpc.call("sync:mark-synced", {
      watermark,
      syncedAt: Date.now()
    });
    const { lastSeen } = await rpc.call("sync:cursor:get", { url });
    if (remoteMaxSeq > lastSeen) {
      await rpc.call("sync:cursor:set", { url, lastSeen: remoteMaxSeq });
    }
    return { pushed: ops.length, watermark, remoteMaxSeq };
  }
  async function pull() {
    const { lastSeen } = await rpc.call("sync:cursor:get", { url });
    const results = await pipeline(
      url,
      authToken,
      [{
        type: "execute",
        stmt: stmt(
          "SELECT seq, table_name, row_id, op, payload, changed_at FROM _sync_log WHERE seq > ? ORDER BY seq ASC",
          [lastSeen]
        )
      }],
      fetchImpl
    );
    const rows = parseRows(results[0]);
    if (rows.length === 0) return { pulled: 0, lastSeen };
    const ops = rows.map((r) => {
      if (r.op === "D") return { op: "D", table: r.table_name, rowId: r.row_id };
      return {
        op: r.op,
        table: r.table_name,
        rowId: r.row_id,
        payload: JSON.parse(r.payload)
      };
    });
    const newLastSeen = rows[rows.length - 1].seq;
    await rpc.call("sync:apply", {
      ops,
      cursorUrl: url,
      cursorLastSeen: newLastSeen
    });
    return { pulled: rows.length, lastSeen: newLastSeen };
  }
  async function syncOnce() {
    if (running) throw new SyncError("a sync is already in progress");
    running = true;
    try {
      await bootstrap();
      const pushResult = await push();
      const pullResult = await pull();
      return { push: pushResult, pull: pullResult };
    } finally {
      running = false;
    }
  }
  return { sync: syncOnce, push, pull, bootstrap };
}

// src/open.js
var BACKOFF_CAP_MS = 5 * 60 * 1e3;
var WORKER_URL = new URL("./worker.js", import.meta.url);
function waitForReady(worker) {
  return new Promise((resolve, reject) => {
    const onMessage = (event) => {
      if (event.data?.event === "ready") {
        worker.removeEventListener("message", onMessage);
        worker.removeEventListener("error", onError);
        resolve();
      }
    };
    const onError = (event) => {
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
      reject(new OriginSqlError(event.message ?? "worker failed to start", event));
    };
    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
  });
}
async function openDatabase(options) {
  if (!options || typeof options !== "object") {
    throw new OriginSqlError("openDatabase requires an options object");
  }
  const { name, schema, workerUrl, sync } = options;
  if (!name || typeof name !== "string") {
    throw new OriginSqlError("openDatabase requires a string `name`");
  }
  if (sync !== void 0 && sync !== null) {
    if (typeof sync !== "object") {
      throw new OriginSqlError("sync option must be an object");
    }
    if (typeof sync.url !== "string" || !sync.url) {
      throw new OriginSqlError("sync.url is required when sync is set");
    }
    if (sync.syncOnMutation !== void 0 && typeof sync.syncOnMutation !== "boolean") {
      throw new OriginSqlError("sync.syncOnMutation must be a boolean");
    }
  }
  const worker = new Worker(workerUrl ?? WORKER_URL, { type: "module" });
  await waitForReady(worker);
  const rpc = createRpc(worker);
  const notifier = createNotifier();
  try {
    await rpc.call("open", { name, schema: void 0 });
    if (schema) {
      try {
        await rpc.call("exec", { sql: schema, params: [] });
      } catch (err) {
        throw new SchemaError(err.message, err);
      }
    }
    if (sync) {
      await rpc.call("sync:setup", {});
    }
  } catch (err) {
    worker.terminate();
    throw err;
  }
  if (typeof navigator !== "undefined" && navigator.storage?.persist) {
    navigator.storage.persist().catch(() => {
    });
  }
  let closed = false;
  const assertOpen = () => {
    if (closed) throw new OriginSqlError("database is closed");
  };
  async function exec(sql, params = []) {
    assertOpen();
    const result = await rpc.call("exec", { sql, params });
    if (result.tables?.length) {
      notifier.emit(result.tables);
      triggerAutoSync();
    }
    return { changes: result.changes, lastInsertRowid: result.lastInsertRowid };
  }
  async function query(sql, params = []) {
    assertOpen();
    const { columns, rows } = await rpc.call("query", { sql, params });
    return rows.map((row) => {
      const obj = {};
      for (let i = 0; i < columns.length; i++) obj[columns[i]] = row[i];
      return obj;
    });
  }
  async function transaction(fn) {
    assertOpen();
    if (typeof fn !== "function") {
      throw new OriginSqlError("transaction requires a callback function");
    }
    await rpc.call("txn:begin", {});
    const touched = /* @__PURE__ */ new Set();
    const tx = {
      async exec(sql, params = []) {
        const result = await rpc.call("exec", { sql, params });
        for (const t of result.tables ?? []) touched.add(t);
        return { changes: result.changes, lastInsertRowid: result.lastInsertRowid };
      },
      async query(sql, params = []) {
        return query(sql, params);
      }
    };
    try {
      const value = await fn(tx);
      await rpc.call("txn:commit", {});
      if (touched.size) {
        notifier.emit(touched);
        triggerAutoSync();
      }
      return value;
    } catch (err) {
      try {
        await rpc.call("txn:rollback", {});
      } catch {
      }
      throw err;
    }
  }
  function subscribe(table, cb) {
    assertOpen();
    if (typeof cb !== "function") {
      throw new OriginSqlError("subscribe requires a callback function");
    }
    return notifier.subscribe(table, cb);
  }
  const syncer = sync ? createSyncer({
    rpc,
    url: sync.url,
    authToken: sync.authToken,
    fetch: sync.fetch
  }) : null;
  const statusListeners = /* @__PURE__ */ new Set();
  let status = { state: "idle", pendingPush: 0, lastSyncedAt: null };
  let backoffFailures = 0;
  let pausedByAuth = false;
  let intervalTimer = null;
  let inFlightSync = null;
  function deliverStatus() {
    for (const cb of Array.from(statusListeners)) {
      try {
        cb(status);
      } catch (err) {
        console.error("[origin-sql] sync-status subscriber threw:", err);
      }
    }
  }
  async function refreshPending() {
    if (!syncer) return;
    try {
      const { count } = await rpc.call("sync:pending-count", {});
      status = { ...status, pendingPush: count };
    } catch {
    }
  }
  async function setStatus(next) {
    status = { ...status, ...next };
    await refreshPending();
    deliverStatus();
  }
  async function runSyncOnce() {
    await setStatus({ state: "syncing", lastError: void 0 });
    const promise = (async () => {
      try {
        const result = await syncer.sync();
        if (result.pull?.pulled > 0) {
          const { tables } = await rpc.call("sync:user-schema", {});
          notifier.emit(tables.map((t) => t.name));
        }
        backoffFailures = 0;
        pausedByAuth = false;
        await setStatus({
          state: "idle",
          lastSyncedAt: Date.now(),
          lastError: void 0
        });
        return result;
      } catch (err) {
        if (err instanceof AuthError) pausedByAuth = true;
        else backoffFailures++;
        await setStatus({ state: "error", lastError: err });
        throw err;
      }
    })();
    inFlightSync = promise;
    try {
      return await promise;
    } finally {
      if (inFlightSync === promise) inFlightSync = null;
    }
  }
  function scheduleIntervalTick() {
    if (!sync?.interval || pausedByAuth || closed) return;
    const delay = Math.min(
      sync.interval * Math.pow(2, backoffFailures),
      BACKOFF_CAP_MS
    );
    intervalTimer = setTimeout(() => {
      intervalTimer = null;
      runSyncOnce().catch(() => {
      }).finally(scheduleIntervalTick);
    }, delay);
  }
  let autoSyncRunning = false;
  let trailingAutoSyncScheduled = false;
  async function autoSyncLoop() {
    autoSyncRunning = true;
    try {
      do {
        trailingAutoSyncScheduled = false;
        while (inFlightSync) {
          try {
            await inFlightSync;
          } catch {
          }
        }
        if (closed || pausedByAuth) break;
        try {
          await runSyncOnce();
        } catch {
        }
      } while (trailingAutoSyncScheduled && !closed && !pausedByAuth);
    } finally {
      autoSyncRunning = false;
    }
  }
  function triggerAutoSync() {
    if (!syncer || !sync?.syncOnMutation) return;
    if (closed || pausedByAuth) return;
    if (autoSyncRunning) {
      trailingAutoSyncScheduled = true;
      return;
    }
    autoSyncLoop().catch(() => {
    });
  }
  async function syncNow() {
    assertOpen();
    if (!syncer) throw new OriginSqlError("sync is not enabled for this database");
    pausedByAuth = false;
    if (intervalTimer) {
      clearTimeout(intervalTimer);
      intervalTimer = null;
    }
    try {
      const result = await runSyncOnce();
      scheduleIntervalTick();
      return result;
    } catch (err) {
      if (!(err instanceof AuthError)) scheduleIntervalTick();
      throw err;
    }
  }
  function onSyncStatus(cb) {
    assertOpen();
    if (!syncer) throw new OriginSqlError("sync is not enabled for this database");
    if (typeof cb !== "function") {
      throw new OriginSqlError("onSyncStatus requires a callback function");
    }
    statusListeners.add(cb);
    try {
      cb(status);
    } catch (err) {
      console.error("[origin-sql] sync-status subscriber threw:", err);
    }
    return () => statusListeners.delete(cb);
  }
  if (sync) {
    refreshPending().then(() => {
      if (sync.interval) scheduleIntervalTick();
    });
  }
  async function exportDatabase() {
    assertOpen();
    if (inFlightSync) {
      try {
        await inFlightSync;
      } catch {
      }
    }
    const bytes = await rpc.call("export-file", {});
    return new Blob([bytes], { type: "application/vnd.sqlite3" });
  }
  async function importDatabase(blob) {
    assertOpen();
    if (!(blob instanceof Blob) && !(blob instanceof ArrayBuffer) && !(blob instanceof Uint8Array)) {
      throw new OriginSqlError("import requires a Blob, ArrayBuffer, or Uint8Array");
    }
    if (intervalTimer) {
      clearTimeout(intervalTimer);
      intervalTimer = null;
    }
    pausedByAuth = false;
    backoffFailures = 0;
    if (inFlightSync) {
      try {
        await inFlightSync;
      } catch {
      }
    }
    let buffer;
    if (blob instanceof Blob) buffer = await blob.arrayBuffer();
    else if (blob instanceof Uint8Array) buffer = blob.slice().buffer;
    else buffer = blob.slice(0);
    const bytes = new Uint8Array(buffer);
    await rpc.call("import-replace", { bytes }, [buffer]);
    if (schema) {
      try {
        await rpc.call("exec", { sql: schema, params: [] });
      } catch (err) {
        throw new SchemaError(err.message, err);
      }
    }
    if (sync) {
      await rpc.call("sync:setup", {});
    }
    const { tables } = await rpc.call("sync:user-schema", {}).catch(() => ({ tables: [] }));
    if (tables?.length) notifier.emit(tables.map((t) => t.name));
    if (sync) {
      await refreshPending();
      if (sync.interval) scheduleIntervalTick();
    }
  }
  async function close() {
    if (closed) return;
    closed = true;
    if (intervalTimer) {
      clearTimeout(intervalTimer);
      intervalTimer = null;
    }
    statusListeners.clear();
    try {
      await rpc.call("close", {});
    } catch {
    }
    rpc.dispose("database closed");
    notifier.clear();
    worker.terminate();
  }
  return {
    exec,
    query,
    transaction,
    subscribe,
    sync: syncNow,
    onSyncStatus,
    export: exportDatabase,
    import: importDatabase,
    close
  };
}

// src/bundle-entry.js
var WORKER_SOURCE = '/* origin-sql 0.3.0 \u2014 browser-side SQLite with optional libSQL sync */\n/* Homepage: https://github.com/ */\n/* License: MIT */\n\n// src/worker.js\nimport sqlite3InitModule from "https://esm.sh/@sqlite.org/sqlite-wasm@3.46.1-build3";\n\n// src/errors.js\nvar OriginSqlError = class extends Error {\n  constructor(message, cause) {\n    super(message);\n    this.name = "OriginSqlError";\n    if (cause !== void 0) this.cause = cause;\n  }\n};\nvar SchemaError = class extends OriginSqlError {\n  constructor(message, cause) {\n    super(message, cause);\n    this.name = "SchemaError";\n  }\n};\n\n// src/rpc.js\nvar TRANSFER = /* @__PURE__ */ Symbol.for("origin-sql.rpc.transfer");\nfunction withTransfer(value, transfer) {\n  return { [TRANSFER]: transfer, value };\n}\nfunction serveRpc(port, handlers) {\n  port.addEventListener("message", async (event) => {\n    const { id, op, payload } = event.data ?? {};\n    if (id == null || !op) return;\n    const handler = handlers[op];\n    if (!handler) {\n      port.postMessage({ id, error: { message: `unknown op: ${op}` } });\n      return;\n    }\n    try {\n      const result = await handler(payload);\n      if (result && typeof result === "object" && TRANSFER in result) {\n        port.postMessage({ id, result: result.value }, result[TRANSFER]);\n      } else {\n        port.postMessage({ id, result });\n      }\n    } catch (err) {\n      port.postMessage({\n        id,\n        error: { message: err?.message ?? String(err), name: err?.name }\n      });\n    }\n  });\n}\n\n// src/sql-parse.js\nvar IDENT = \'(?:"(?:[^"]|"")+"|`(?:[^`]|``)+`|\\\\[[^\\\\]]+\\\\]|[\\\\w]+)\';\nvar QUALIFIED = `(?:${IDENT}\\\\s*\\\\.\\\\s*)?${IDENT}`;\nvar WRITE_PATTERNS = [\n  new RegExp(`\\\\bINSERT\\\\s+(?:OR\\\\s+\\\\w+\\\\s+)?INTO\\\\s+(${QUALIFIED})`, "gi"),\n  new RegExp(`\\\\bREPLACE\\\\s+INTO\\\\s+(${QUALIFIED})`, "gi"),\n  new RegExp(`\\\\bUPDATE\\\\s+(?:OR\\\\s+\\\\w+\\\\s+)?(${QUALIFIED})\\\\s+SET`, "gi"),\n  new RegExp(`\\\\bDELETE\\\\s+FROM\\\\s+(${QUALIFIED})`, "gi")\n];\nvar DDL_PATTERNS = [\n  new RegExp(\n    `\\\\b(?:CREATE|DROP|ALTER)\\\\s+TABLE\\\\s+(?:IF\\\\s+(?:NOT\\\\s+)?EXISTS\\\\s+)?(${QUALIFIED})`,\n    "gi"\n  )\n];\nvar COMMENT_BLOCK = /\\/\\*[\\s\\S]*?\\*\\//g;\nvar COMMENT_LINE = /--[^\\n]*/g;\nvar STRING_LITERAL = /\'(?:[^\']|\'\')*\'/g;\nfunction stripNoise(sql) {\n  return sql.replace(COMMENT_BLOCK, " ").replace(COMMENT_LINE, " ").replace(STRING_LITERAL, "\'\'");\n}\nfunction unquote(ident) {\n  const t = ident.trim();\n  if (t.length >= 2) {\n    const first = t[0];\n    const last = t[t.length - 1];\n    if (first === \'"\' && last === \'"\' || first === "`" && last === "`") {\n      return t.slice(1, -1);\n    }\n    if (first === "[" && last === "]") return t.slice(1, -1);\n  }\n  return t;\n}\nfunction normalize(ident) {\n  const stripped = unquote(ident);\n  const parts = stripped.split(".").map(unquote);\n  return parts[parts.length - 1].toLowerCase();\n}\nfunction extractTouchedTables(sql) {\n  if (typeof sql !== "string" || sql.length === 0) return /* @__PURE__ */ new Set();\n  const cleaned = stripNoise(sql);\n  const tables = /* @__PURE__ */ new Set();\n  for (const pattern of WRITE_PATTERNS) {\n    pattern.lastIndex = 0;\n    for (const match of cleaned.matchAll(pattern)) {\n      tables.add(normalize(match[1]));\n    }\n  }\n  return tables;\n}\nfunction isDdl(sql) {\n  if (typeof sql !== "string" || sql.length === 0) return false;\n  const cleaned = stripNoise(sql);\n  return DDL_PATTERNS.some((pattern) => {\n    pattern.lastIndex = 0;\n    return pattern.test(cleaned);\n  });\n}\nfunction extractDdlTables(sql) {\n  if (typeof sql !== "string" || sql.length === 0) return /* @__PURE__ */ new Set();\n  const cleaned = stripNoise(sql);\n  const tables = /* @__PURE__ */ new Set();\n  for (const pattern of DDL_PATTERNS) {\n    pattern.lastIndex = 0;\n    for (const match of cleaned.matchAll(pattern)) {\n      tables.add(normalize(match[1]));\n    }\n  }\n  return tables;\n}\n\n// src/sync-triggers.js\nvar SYNC_META_SCHEMA = `\nCREATE TABLE IF NOT EXISTS _sync_meta (\n  seq        INTEGER PRIMARY KEY AUTOINCREMENT,\n  table_name TEXT NOT NULL,\n  row_id     TEXT NOT NULL,\n  op         TEXT NOT NULL CHECK (op IN (\'I\',\'U\',\'D\')),\n  changed_at INTEGER NOT NULL,\n  synced_at  INTEGER\n);\nCREATE INDEX IF NOT EXISTS _sync_meta_pending\n  ON _sync_meta(seq) WHERE synced_at IS NULL;\nCREATE TABLE IF NOT EXISTS _sync_cursor (\n  remote_url TEXT PRIMARY KEY,\n  last_seen  INTEGER NOT NULL\n);\nCREATE TABLE IF NOT EXISTS _sync_suspend (\n  id INTEGER PRIMARY KEY CHECK (id = 1)\n);\n`.trim();\nvar IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;\nfunction assertSafeIdent(name) {\n  if (typeof name !== "string" || !IDENT_RE.test(name)) {\n    throw new SchemaError(\n      `sync is only supported for tables whose names match ${IDENT_RE} (got ${JSON.stringify(name)})`\n    );\n  }\n  return name;\n}\nvar CHANGED_AT = `CAST(unixepoch(\'subsec\') * 1000 AS INTEGER)`;\nfunction insertMeta(table, rowRef, op) {\n  return `INSERT INTO _sync_meta(table_name, row_id, op, changed_at) VALUES (\'${table}\', CAST(${rowRef}.rowid AS TEXT), \'${op}\', ${CHANGED_AT})`;\n}\nfunction triggerSql(tableName) {\n  const t = assertSafeIdent(tableName);\n  const suspended = `EXISTS (SELECT 1 FROM _sync_suspend)`;\n  return [\n    `CREATE TRIGGER IF NOT EXISTS "_sync_trg_${t}_ins" AFTER INSERT ON "${t}" WHEN NOT ${suspended} BEGIN ${insertMeta(t, "NEW", "I")}; END`,\n    `CREATE TRIGGER IF NOT EXISTS "_sync_trg_${t}_upd" AFTER UPDATE ON "${t}" WHEN NOT ${suspended} BEGIN ${insertMeta(t, "NEW", "U")}; END`,\n    `CREATE TRIGGER IF NOT EXISTS "_sync_trg_${t}_del" AFTER DELETE ON "${t}" WHEN NOT ${suspended} BEGIN ${insertMeta(t, "OLD", "D")}; END`\n  ];\n}\nvar LIST_USER_TABLES_SQL = `SELECT name FROM sqlite_master WHERE type = \'table\'   AND name NOT LIKE \'\\\\_sync\\\\_%\' ESCAPE \'\\\\\'   AND name NOT LIKE \'sqlite\\\\_%\' ESCAPE \'\\\\\'`;\n\n// src/worker-core.js\nfunction installWorker(sqlite32, scope = self) {\n  let poolUtilPromise;\n  let poolUtil;\n  let db;\n  let dbPath;\n  let txnDepth = 0;\n  let syncEnabled = false;\n  function listUserTables() {\n    return db.selectValues(LIST_USER_TABLES_SQL);\n  }\n  function installTriggersForAllUserTables() {\n    for (const name of listUserTables()) {\n      for (const stmt of triggerSql(name)) db.exec(stmt);\n    }\n  }\n  function runBound(sql, params) {\n    const s = db.prepare(sql);\n    try {\n      if (params && params.length) s.bind(params);\n      while (s.step()) {\n      }\n    } finally {\n      s.finalize();\n    }\n  }\n  function selectAll(sql, params) {\n    const s = db.prepare(sql);\n    try {\n      if (params && params.length) s.bind(params);\n      const cols = s.getColumnNames();\n      const out = [];\n      while (s.step()) {\n        const vals = s.get([]);\n        const obj = {};\n        for (let i = 0; i < cols.length; i++) obj[cols[i]] = vals[i];\n        out.push(obj);\n      }\n      return out;\n    } finally {\n      s.finalize();\n    }\n  }\n  async function ensureInit(name) {\n    if (db) return;\n    if (!poolUtilPromise) {\n      poolUtilPromise = sqlite32.installOpfsSAHPoolVfs({ name: "origin-sql-pool" });\n    }\n    poolUtil = await poolUtilPromise;\n    dbPath = `/${name}.sqlite`;\n    db = new poolUtil.OpfsSAHPoolDb(dbPath);\n    db.exec("PRAGMA foreign_keys = ON");\n  }\n  function closeDbHandle() {\n    if (!db) return;\n    if (txnDepth > 0) {\n      try {\n        db.exec("ROLLBACK");\n      } catch {\n      }\n      txnDepth = 0;\n    }\n    db.close();\n    db = null;\n  }\n  function runQuery(sql, params) {\n    const stmt = db.prepare(sql);\n    try {\n      if (params && params.length) stmt.bind(params);\n      const columns = stmt.getColumnNames();\n      const rows = [];\n      while (stmt.step()) rows.push(stmt.get([]));\n      return { columns, rows };\n    } finally {\n      stmt.finalize();\n    }\n  }\n  function runExec(sql, params) {\n    const stmt = db.prepare(sql);\n    try {\n      if (params && params.length) stmt.bind(params);\n      while (stmt.step()) {\n      }\n    } finally {\n      stmt.finalize();\n    }\n    const tables = extractTouchedTables(sql);\n    if (isDdl(sql)) for (const t of extractDdlTables(sql)) tables.add(t);\n    return {\n      changes: db.changes(),\n      lastInsertRowid: Number(sqlite32.capi.sqlite3_last_insert_rowid(db.pointer)),\n      tables: Array.from(tables)\n    };\n  }\n  const handlers = {\n    async open({ name }) {\n      await ensureInit(name);\n      return { ok: true };\n    },\n    query({ sql, params }) {\n      return runQuery(sql, params);\n    },\n    exec({ sql, params }) {\n      const result = runExec(sql, params);\n      if (syncEnabled && isDdl(sql)) installTriggersForAllUserTables();\n      return result;\n    },\n    "sync:setup"() {\n      if (!db) throw new Error("database not opened");\n      if (!syncEnabled) {\n        db.exec(SYNC_META_SCHEMA);\n        syncEnabled = true;\n      }\n      installTriggersForAllUserTables();\n      return { ok: true };\n    },\n    "sync:user-schema"() {\n      return {\n        tables: selectAll(\n          LIST_USER_TABLES_SQL.replace("SELECT name", "SELECT name, sql")\n        ).map((r) => ({ name: r.name, createSql: r.sql }))\n      };\n    },\n    "sync:prepare-push"() {\n      db.exec("BEGIN");\n      try {\n        const collapsed = selectAll(`\n          SELECT table_name, row_id, op, changed_at, seq\n          FROM _sync_meta m\n          WHERE synced_at IS NULL\n            AND seq = (\n              SELECT MAX(seq) FROM _sync_meta\n              WHERE table_name = m.table_name\n                AND row_id = m.row_id\n                AND synced_at IS NULL\n            )\n          ORDER BY seq ASC\n        `);\n        let watermark = 0;\n        const ops = [];\n        for (const row of collapsed) {\n          if (row.seq > watermark) watermark = row.seq;\n          if (row.op === "D") {\n            ops.push({ table: row.table_name, rowId: row.row_id, op: "D", changedAt: row.changed_at });\n            continue;\n          }\n          const live = selectAll(\n            `SELECT rowid AS __rowid, * FROM "${row.table_name}" WHERE rowid = ?`,\n            [row.row_id]\n          );\n          if (live.length) {\n            ops.push({\n              table: row.table_name,\n              rowId: row.row_id,\n              op: "U",\n              changedAt: row.changed_at,\n              payload: live[0]\n            });\n          } else {\n            ops.push({ table: row.table_name, rowId: row.row_id, op: "D", changedAt: row.changed_at });\n          }\n        }\n        db.exec("COMMIT");\n        return { ops, watermark };\n      } catch (e) {\n        try {\n          db.exec("ROLLBACK");\n        } catch {\n        }\n        throw e;\n      }\n    },\n    "sync:mark-synced"({ watermark, syncedAt }) {\n      runBound(\n        "UPDATE _sync_meta SET synced_at = ? WHERE seq <= ? AND synced_at IS NULL",\n        [syncedAt, watermark]\n      );\n      return { ok: true };\n    },\n    "sync:cursor:get"({ url }) {\n      const rows = selectAll(\n        "SELECT last_seen FROM _sync_cursor WHERE remote_url = ?",\n        [url]\n      );\n      return { lastSeen: rows[0]?.last_seen ?? 0 };\n    },\n    "sync:cursor:set"({ url, lastSeen }) {\n      runBound(\n        "INSERT OR REPLACE INTO _sync_cursor(remote_url, last_seen) VALUES (?, ?)",\n        [url, lastSeen]\n      );\n      return { ok: true };\n    },\n    "sync:pending-count"() {\n      const rows = selectAll(\n        "SELECT COUNT(*) AS n FROM _sync_meta WHERE synced_at IS NULL",\n        []\n      );\n      return { count: rows[0]?.n ?? 0 };\n    },\n    "sync:apply"({ ops, cursorUrl, cursorLastSeen }) {\n      db.exec("BEGIN");\n      try {\n        runBound("INSERT OR IGNORE INTO _sync_suspend(id) VALUES (1)", []);\n        for (const op of ops) {\n          if (op.op === "D") {\n            runBound(`DELETE FROM "${op.table}" WHERE rowid = ?`, [op.rowId]);\n          } else {\n            const cols = Object.keys(op.payload).filter((k) => k !== "__rowid");\n            const values = cols.map((k) => op.payload[k]);\n            const colList = cols.map((c) => `"${c}"`).join(", ");\n            const phList = ["?", ...cols.map(() => "?")].join(", ");\n            runBound(\n              `INSERT OR REPLACE INTO "${op.table}" (rowid, ${colList}) VALUES (${phList})`,\n              [op.rowId, ...values]\n            );\n          }\n        }\n        db.exec("DELETE FROM _sync_suspend");\n        if (cursorUrl && cursorLastSeen != null) {\n          runBound(\n            "INSERT OR REPLACE INTO _sync_cursor(remote_url, last_seen) VALUES (?, ?)",\n            [cursorUrl, cursorLastSeen]\n          );\n        }\n        db.exec("COMMIT");\n        return { applied: ops.length };\n      } catch (e) {\n        try {\n          db.exec("ROLLBACK");\n        } catch {\n        }\n        throw e;\n      }\n    },\n    async "export-file"() {\n      if (!db || !poolUtil || !dbPath) throw new Error("database not opened");\n      if (txnDepth > 0) throw new Error("cannot export during a transaction");\n      const bytes = await poolUtil.exportFile(dbPath);\n      return withTransfer(bytes, [bytes.buffer]);\n    },\n    async "import-replace"({ bytes }) {\n      if (!poolUtil || !dbPath) throw new Error("database not opened");\n      if (txnDepth > 0) throw new Error("cannot import during a transaction");\n      closeDbHandle();\n      try {\n        await poolUtil.importDb(dbPath, bytes);\n      } catch (err) {\n        db = new poolUtil.OpfsSAHPoolDb(dbPath);\n        db.exec("PRAGMA foreign_keys = ON");\n        throw err;\n      }\n      db = new poolUtil.OpfsSAHPoolDb(dbPath);\n      db.exec("PRAGMA foreign_keys = ON");\n      syncEnabled = false;\n      return { ok: true };\n    },\n    "txn:begin"() {\n      if (txnDepth > 0) throw new Error("nested transactions are not supported in v1");\n      db.exec("BEGIN");\n      txnDepth = 1;\n      return { ok: true };\n    },\n    "txn:commit"() {\n      if (txnDepth === 0) throw new Error("no active transaction");\n      db.exec("COMMIT");\n      txnDepth = 0;\n      return { ok: true };\n    },\n    "txn:rollback"() {\n      if (txnDepth === 0) return { ok: true };\n      db.exec("ROLLBACK");\n      txnDepth = 0;\n      return { ok: true };\n    },\n    close() {\n      closeDbHandle();\n      return { ok: true };\n    }\n  };\n  serveRpc(scope, handlers);\n  scope.postMessage({ id: 0, event: "ready" });\n}\n\n// src/worker.js\nvar sqlite3 = await sqlite3InitModule({\n  print: () => {\n  },\n  printErr: (...args) => console.error("[origin-sql]", ...args)\n});\ninstallWorker(sqlite3);\n';
var workerBlobUrl = null;
function getWorkerUrl() {
  if (workerBlobUrl) return workerBlobUrl;
  const blob = new Blob([WORKER_SOURCE], { type: "application/javascript" });
  workerBlobUrl = URL.createObjectURL(blob);
  return workerBlobUrl;
}
async function openDatabase2(options) {
  return openDatabase({ ...options, workerUrl: options?.workerUrl ?? getWorkerUrl() });
}
export {
  AuthError,
  NetworkError,
  OriginSqlError,
  QuotaError,
  RpcError,
  SchemaError,
  ServerError,
  SyncError,
  openDatabase2 as openDatabase
};
