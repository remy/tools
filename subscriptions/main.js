import "command-palette";
import { state, DEFAULT_RATE } from './state.js';
import { db, setSyncConfig } from './db.js';
import { render } from './render-calendar.js';
import { renderYearView } from './render-year.js';
import { bindEvents } from './events.js';
import { setupPalette } from './search.js';
import { consumeLinkParams } from '/lib/deep-link.js';

let refreshTimer = null;
function scheduleRefresh() {
  if (refreshTimer) return;
  refreshTimer = setTimeout(async () => {
    refreshTimer = null;
    const [subs, saved] = await Promise.all([db.getAll(), db.getAllSettings()]);
    state.subscriptions = subs;
    if (saved.displayCurrency) state.settings.displayCurrency = saved.displayCurrency;
    if (saved.exchangeRate) state.settings.exchangeRate = saved.exchangeRate;
    if (state.viewMode === 'year') renderYearView();
    else render();
  }, 50);
}

// Mobile browsers freeze the page while backgrounded and Data Saver throttles
// the live-sync socket, so a queued change can sit unpushed behind a zombie
// connection. Restart sync when the app regains the foreground or the network
// returns to flush it promptly. Debounced so a burst of visibility/online
// events collapses into one restart.
let syncKickTimer = null;
function kickSync() {
  clearTimeout(syncKickTimer);
  syncKickTimer = setTimeout(() => db.restartSync(), 300);
}

async function init() {
  const saved = await db.getAllSettings();
  if (saved.displayCurrency) state.settings.displayCurrency = saved.displayCurrency;
  if (saved.exchangeRate) state.settings.exchangeRate = saved.exchangeRate;
  state.subscriptions = await db.getAll();

  const now = new Date();
  state.currentYear = now.getFullYear();
  state.currentMonth = now.getMonth();

  render();
  bindEvents();
  setupPalette();

  db.onChange(scheduleRefresh);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') kickSync();
  });
  window.addEventListener('online', kickSync);
}

// A ?sync= link has to be applied before anything boots, and reloads the page —
// skip the normal init when one is on its way. There is no per-record deep
// link: a subscription has no view of its own to land on.
if (!consumeLinkParams({ setConfig: setSyncConfig })) init();
