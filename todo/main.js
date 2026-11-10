import { db, setSyncConfig } from './db.js';
import { bindEvents } from './events.js';
import { refreshAll, selectList } from './lists.js';
import { initSyncStatus } from './settings.js';
import { initViewport } from './viewport.js';
import { state } from './state.js';
import { listLink, takePendingList } from './share.js';
import { consumeLinkParams } from '/lib/deep-link.js';

// ── Opening a shared list ──
// The list a link points at may not be here yet: a first-time recipient has
// only just been handed a sync config and replication is still running. So the
// id is held and retried as data arrives rather than declared missing outright.
const PENDING_WINDOW = 20000;
let pending = null;

function showShareNotice(kind) {
  const el = document.getElementById('share-notice');
  if (!kind) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  el.hidden = false;
  el.dataset.state = kind;
  el.textContent = kind === 'waiting'
    ? 'Opening a shared list — waiting for it to sync…'
    : "That shared list isn't on this device. Check your sync settings so it can download.";
}

async function resolvePendingList() {
  if (!pending) return;
  if (state.lists.some((l) => l.id === pending.id)) {
    const { id } = pending;
    pending = null;
    showShareNotice(null);
    await selectList(id);
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
    await resolvePendingList();
  }, 50);
}

// Mobile browsers freeze the page while backgrounded and Data Saver throttles
// the live-sync socket, so a queued change (e.g. an unticked item) can sit
// unpushed behind a zombie connection. Restart sync when the app regains the
// foreground or the network returns to flush it promptly. Debounced so a burst
// of visibility/online events collapses into one restart.
let syncKickTimer = null;
function kickSync() {
  clearTimeout(syncKickTimer);
  syncKickTimer = setTimeout(() => db.restartSync(), 300);
}

async function init() {
  document.getElementById('share-notice')
    .addEventListener('click', () => showShareNotice(null));

  const pendingId = takePendingList();
  if (pendingId) pending = { id: pendingId, since: Date.now() };

  await refreshAll();
  await resolvePendingList();
  if (pending) {
    // Still waiting on replication — say so, and make sure the wait ends even
    // if no further change event ever arrives.
    showShareNotice('waiting');
    setTimeout(resolvePendingList, PENDING_WINDOW + 250);
  }

  bindEvents();
  initViewport();
  initSyncStatus();
  db.onChange(scheduleRefresh);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') kickSync();
  });
  window.addEventListener('online', kickSync);
}

if (!consumeLinkParams({ setConfig: setSyncConfig, deepLink: listLink })) init();
