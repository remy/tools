// Sync configuration shared by every PouchDB-backed tool.
//
// All the tools are served from one origin, so they also share one
// localStorage. Rather than each tool inventing its own flat keys, connection
// details live under a single structured key, namespaced by tool:
//
//   tools.sync = { "todo": { url, token }, "workout": { url, token }, … }
//
// Each tool still points at its own CouchDB database — only where the client
// stores the details is shared, never the URL itself.

const STORE_KEY = 'tools.sync';

// Query-string param that carries a shared sync config (URL-safe base64 JSON).
export const SHARE_PARAM = 'sync';

function readAll() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    // Corrupt JSON or blocked storage — fall back to the legacy keys rather
    // than throwing during boot.
    return {};
  }
}

function writeAll(all) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(all));
  } catch {
    // Private-mode storage failures leave sync unconfigured, which the store
    // already handles as "disabled".
  }
}

// Before the shared key existed each tool wrote its own flat pair, e.g.
// `todo-lists.sync.url` / `todo-lists.sync.token`. Those are still read as a
// fallback so an existing install keeps syncing with no user action, and they
// are deliberately left in place on write: rolling back to the previous code
// then still finds a working (if possibly stale) config.
function readLegacy(legacyPrefix) {
  if (!legacyPrefix) return null;
  try {
    const url = localStorage.getItem(`${legacyPrefix}.sync.url`) || '';
    const token = localStorage.getItem(`${legacyPrefix}.sync.token`) || '';
    return url || token ? { url, token } : null;
  } catch {
    return null;
  }
}

// Build the getter/setter pair for one tool. `key` names the tool inside the
// shared store; `legacyPrefix` is the tool's pre-existing flat key prefix.
export function createSyncConfig({ key, legacyPrefix = '' }) {
  function getSyncConfig() {
    const entry = readAll()[key];
    if (entry && typeof entry === 'object') {
      return { url: entry.url || '', token: entry.token || '' };
    }
    return readLegacy(legacyPrefix) || { url: '', token: '' };
  }

  function setSyncConfig({ url, token }) {
    const all = readAll();
    if (url || token) all[key] = { url: url || '', token: token || '' };
    else delete all[key];
    writeAll(all);
  }

  return { getSyncConfig, setSyncConfig };
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
