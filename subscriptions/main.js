import { state, DEFAULT_RATE } from './state.js';
import { db } from './db.js';
import { render } from './render-calendar.js';
import { bindEvents } from './events.js';

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
}

init();
