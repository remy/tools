// =============================================
// Cook Planner — sync.js
// Wiring between the store's replication and what's on screen.
// =============================================

import { db, isLocalEcho } from './db.js';
import { loadFromDb } from './state.js';
import { renderCurrentView } from './router.js';
import { paintSyncStatus } from './settings.js';

// Coalesce a burst of incoming changes into a single refresh.
let timer = null;

function scheduleRefresh(delay = 50) {
  if (timer) return;
  timer = setTimeout(async () => {
    timer = null;
    // A render rebuilds the whole view, which would throw away a half-typed
    // food item or an override being edited. A change that lands while a dialog
    // is open waits until it closes rather than being dropped.
    if (document.querySelector('dialog[open]')) {
      scheduleRefresh(2000);
      return;
    }
    try {
      await loadFromDb();
      renderCurrentView();
      paintSyncStatus();
    } catch (err) {
      console.error('[cook-plan sync]', err);
    }
  }, delay);
}

// Mobile browsers freeze the page while backgrounded and Data Saver throttles
// the live-sync socket, so a queued change can sit unpushed behind a zombie
// connection. Restart sync when the app regains the foreground or the network
// returns to flush it promptly. Debounced so a burst of visibility/online
// events collapses into one restart.
let kickTimer = null;

function kickSync() {
  clearTimeout(kickTimer);
  kickTimer = setTimeout(() => db.restartSync(), 300);
}

export function initSync() {
  db.onChange((change) => {
    if (isLocalEcho(change)) return;
    scheduleRefresh();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') kickSync();
  });
  window.addEventListener('online', kickSync);
}
