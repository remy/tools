import { db, setSyncConfig, decodeSyncConfig, SHARE_PARAM } from './db.js';
import { bindEvents } from './events.js';
import { refreshAll, selectGame } from './games.js';
import { initSyncStatus } from './settings.js';
import { state } from './state.js';
import { $ } from './ui.js';
import { GAME_PARAM, setPendingGame, takePendingGame } from './share.js';

// Read the two link parameters the app understands and clear them from the URL:
//   ?sync=<base64>  a sync config to adopt (see db.js)
//   ?game=<id>      a virtual link to a single game (see share.js)
// A sync config has to be in place before anything boots, so that case strips
// the query by reloading via location.replace — replace() keeps the
// credential-bearing URL out of history, and the reload means init() runs
// cleanly with the new config already applied. A bare ?game= needs no reload,
// so the param is simply swapped out with replaceState. Returns true when a
// reload is on its way, so the normal init is skipped.
function consumeLinkParams() {
  const params = new URLSearchParams(location.search);
  const enc = params.get(SHARE_PARAM);
  const gameId = params.get(GAME_PARAM);
  if (!enc && !gameId) return false;

  // Stashed in sessionStorage so it survives the reload below when one link
  // carries both parameters.
  if (gameId) setPendingGame(gameId);

  const clean = location.origin + location.pathname + location.hash;
  if (!enc) {
    history.replaceState(null, '', clean);
    return false;
  }

  try {
    const cfg = decodeSyncConfig(enc);
    if (cfg.url) setSyncConfig(cfg);
  } catch (err) {
    console.error('Ignoring invalid sync share link', err);
  }
  // Always drop the param, even on a bad link, so it can't linger or re-apply.
  location.replace(clean);
  return true;
}

// ── Opening a shared game ──
// The game a link points at may not be here yet: a first-time recipient has
// only just been handed a sync config and replication is still running. So the
// id is held and retried as data arrives rather than declared missing outright.
const PENDING_WINDOW = 20000;
let pending = null;

function showShareNotice(kind) {
  const el = $('share-notice');
  if (!kind) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  el.hidden = false;
  el.dataset.state = kind;
  el.textContent = kind === 'waiting'
    ? 'Opening a shared game — waiting for it to sync…'
    : "That shared game isn't on this device. Check your sync settings so it can download.";
}

function resolvePendingGame() {
  if (!pending) return;
  if (state.games.some((g) => g.id === pending.id)) {
    const { id } = pending;
    pending = null;
    showShareNotice(null);
    selectGame(id);
  } else if (Date.now() - pending.since > PENDING_WINDOW) {
    pending = null;
    showShareNotice('missing');
  }
}

// Coalesce remote-sync changes into a single refresh.
let refreshTimer = null;
function scheduleRefresh() {
  if (refreshTimer) return;
  refreshTimer = setTimeout(async () => {
    refreshTimer = null;
    await refreshAll();
    resolvePendingGame();
  }, 50);
}

// Mobile browsers freeze the page while backgrounded and Data Saver throttles
// the live-sync socket, so a result recorded at the table can sit unpushed
// behind a zombie connection. Restart sync when the app regains the foreground
// or the network returns to flush it promptly. Debounced so a burst of
// visibility/online events collapses into one restart.
let syncKickTimer = null;
function kickSync() {
  clearTimeout(syncKickTimer);
  syncKickTimer = setTimeout(() => db.restartSync(), 300);
}

async function init() {
  $('share-notice').addEventListener('click', () => showShareNotice(null));

  const pendingId = takePendingGame();
  if (pendingId) pending = { id: pendingId, since: Date.now() };

  await refreshAll();
  resolvePendingGame();
  if (pending) {
    // Still waiting on replication — say so, and make sure the wait ends even
    // if no further change event ever arrives.
    showShareNotice('waiting');
    setTimeout(resolvePendingGame, PENDING_WINDOW + 250);
  }

  bindEvents();
  initSyncStatus();
  db.onChange(scheduleRefresh);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') kickSync();
  });
  window.addEventListener('online', kickSync);
}

if (!consumeLinkParams()) init();
