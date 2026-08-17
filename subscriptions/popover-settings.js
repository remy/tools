import { state, DEFAULT_RATE } from './state.js';
import { db, getSyncConfig, setSyncConfig } from './db.js';
import { render } from './render-calendar.js';
import '/lib/sync-settings.wc.js';

// Settings that arrive by sync live in the database, so re-read them whenever a
// sync operation completes rather than trusting the copy held in memory.
async function reloadFromDb() {
  state.subscriptions = await db.getAll();
  const saved = await db.getAllSettings();
  if (saved.displayCurrency) state.settings.displayCurrency = saved.displayCurrency;
  if (saved.exchangeRate) state.settings.exchangeRate = saved.exchangeRate;
  render();
}

// The sync panel is the shared <sync-settings> component. Configured once, on
// first open, because the settings dialog is the only place it appears.
let syncConfigured = false;

export function openSettings() {
  const ccy = state.settings.displayCurrency;
  const radio = document.querySelector(`input[name="display-currency"][value="${ccy}"]`);
  if (radio) radio.checked = true;
  document.getElementById('exchange-rate').value = state.settings.exchangeRate;

  const panel = document.getElementById('sync-settings');
  if (!syncConfigured) {
    syncConfigured = true;
    panel.configure({
      store: db,
      getConfig: getSyncConfig,
      setConfig: setSyncConfig,
      mergeWarning:
        'Local subscriptions exist on this device. Saving will merge them with '
        + "the server's data (last write wins per item).\n\n"
        + 'To REPLACE local data with the server instead, cancel and use '
        + '"Pull from server".\n\nContinue with merge?',
      onRefresh: reloadFromDb,
    });
  } else {
    // A sync may have landed (or another tab saved) since it was last open.
    panel.refresh();
  }

  document.getElementById('settings-popover').showModal();
}

export async function handleSettingsSave() {
  const ccy = document.querySelector('input[name="display-currency"]:checked').value;
  const rate = parseFloat(document.getElementById('exchange-rate').value) || DEFAULT_RATE;
  state.settings.displayCurrency = ccy;
  state.settings.exchangeRate = rate;
  await db.setSetting('displayCurrency', ccy);
  await db.setSetting('exchangeRate', rate);
  render();
  document.getElementById('settings-popover').close();
}
