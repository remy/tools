import "command-palette";
import { state, DEFAULT_RATE } from './state.js';
import { db } from './db.js';
import { render } from './render-calendar.js';
import { renderYearView } from './render-year.js';
import { bindEvents } from './events.js';
import { setupPalette } from './search.js';

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
}

init();
