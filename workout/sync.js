// Wiring between the store's replication and the workout screen.

import { state } from './state.js';
import { db } from './db.js';
import { loadPlan } from './plan.js';
import { reRenderPreservingTab } from './render.js';
import { circuitState, repTimer } from './timers.js';
import { setSyncStatus, paintSyncStatus } from './sync-indicator.js';

// Coalesce remote-sync changes into a single refresh.
let refreshTimer = null;

function scheduleRefresh() {
  if (refreshTimer) return;
  refreshTimer = setTimeout(async () => {
    refreshTimer = null;
    // Re-rendering swaps out the panel elements the running timers hold
    // references to, and would wipe a circuit mid-round off the screen. A
    // change arriving while you are actually training waits until you stop
    // rather than being dropped.
    if (circuitState.running || repTimer.intervalId) {
      setTimeout(scheduleRefresh, 5000);
      return;
    }
    try {
      await loadPlan();
      if (state.plan) reRenderPreservingTab();
      paintSyncStatus();
    } catch (err) {
      console.error('[workout sync]', err);
    }
  }, 50);
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
  db.onSyncStatus(setSyncStatus);
  db.onChange(scheduleRefresh);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') kickSync();
  });
  window.addEventListener('online', kickSync);
}
