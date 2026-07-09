import { db, setSyncConfig, decodeSyncConfig, SHARE_PARAM } from './db.js';
import { bindEvents } from './events.js';
import { refreshAll } from './lists.js';
import { initSyncStatus } from './settings.js';

// If the page was opened from a share link (?sync=<base64>), save the encoded
// sync config, then strip the query string by reloading via location.replace.
// replace() keeps the credential-bearing URL out of history, and the reload
// means init() runs cleanly with the new config already applied. Returns true
// when it has triggered a reload, so the normal init is skipped.
function consumeShareLink() {
  const params = new URLSearchParams(location.search);
  const enc = params.get(SHARE_PARAM);
  if (!enc) return false;
  try {
    const cfg = decodeSyncConfig(enc);
    if (cfg.url) setSyncConfig(cfg);
  } catch (err) {
    console.error('Ignoring invalid sync share link', err);
  }
  // Always drop the param, even on a bad link, so it can't linger or re-apply.
  location.replace(location.origin + location.pathname + location.hash);
  return true;
}

// Coalesce remote-sync changes into a single refresh.
let refreshTimer = null;
function scheduleRefresh() {
  if (refreshTimer) return;
  refreshTimer = setTimeout(async () => {
    refreshTimer = null;
    await refreshAll();
  }, 50);
}

async function init() {
  await refreshAll();
  bindEvents();
  initSyncStatus();
  db.onChange(scheduleRefresh);
}

if (!consumeShareLink()) init();
