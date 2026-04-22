import { state, DEFAULT_RATE } from './state.js';
import { db, getSyncConfig, setSyncConfig } from './db.js';
import { render } from './render-calendar.js';

function statusText(s) {
  if (!s) return 'Sync disabled.';
  if (s.state === 'disabled') return 'Sync disabled.';
  const pending = s.pendingPush ? ` · ${s.pendingPush} pending` : '';
  if (s.state === 'syncing') return `Syncing…${pending}`;
  if (s.state === 'error') {
    const msg = s.lastError?.message || 'Unknown error';
    return `Error: ${msg}${pending}`;
  }
  const last = s.lastSyncedAt
    ? ` · last synced ${new Date(s.lastSyncedAt).toLocaleTimeString()}`
    : '';
  return `Idle${pending}${last}`;
}

function renderSyncStatus(s) {
  const el = document.getElementById('sync-status');
  if (!el) return;
  el.textContent = statusText(s);
  el.dataset.state = s?.state ?? 'disabled';
}

let unsubStatus = null;

export function openSettings() {
  const ccy = state.settings.displayCurrency;
  const radio = document.querySelector(`input[name="display-currency"][value="${ccy}"]`);
  if (radio) radio.checked = true;
  document.getElementById('exchange-rate').value = state.settings.exchangeRate;

  const cfg = getSyncConfig();
  document.getElementById('sync-url').value = cfg.url;
  document.getElementById('sync-token').value = cfg.token;

  if (unsubStatus) unsubStatus();
  unsubStatus = db.onSyncStatus(renderSyncStatus);

  document.getElementById('settings-popover').showPopover();
}

export async function handleSettingsSave() {
  const ccy = document.querySelector('input[name="display-currency"]:checked').value;
  const rate = parseFloat(document.getElementById('exchange-rate').value) || DEFAULT_RATE;
  state.settings.displayCurrency = ccy;
  state.settings.exchangeRate = rate;
  await db.setSetting('displayCurrency', ccy);
  await db.setSetting('exchangeRate', rate);
  render();
  document.getElementById('settings-popover').hidePopover();
}

export async function handleSyncSave() {
  const url = document.getElementById('sync-url').value.trim();
  const token = document.getElementById('sync-token').value.trim();

  setSyncConfig({ url, token });

  const btn = document.getElementById('sync-save');
  btn.disabled = true;
  try {
    await db.reopen();
    state.subscriptions = await db.getAll();
    render();
  } catch (err) {
    renderSyncStatus({ state: 'error', lastError: err });
  } finally {
    btn.disabled = false;
  }
}

export async function handleSyncNow() {
  const btn = document.getElementById('sync-now');
  btn.disabled = true;
  try {
    await db.syncNow();
    state.subscriptions = await db.getAll();
    render();
  } catch (err) {
    renderSyncStatus({ state: 'error', lastError: err });
  } finally {
    btn.disabled = false;
  }
}

export async function handleSyncPull() {
  const ok = confirm(
    'Pull from the server and overwrite local data? Any local changes that '
    + "haven't been pushed will be discarded. The remote server is not modified.",
  );
  if (!ok) return;
  const btn = document.getElementById('sync-pull');
  btn.disabled = true;
  try {
    await db.pullFromRemote();
    const saved = await db.getAllSettings();
    if (saved.displayCurrency) state.settings.displayCurrency = saved.displayCurrency;
    if (saved.exchangeRate) state.settings.exchangeRate = saved.exchangeRate;
    state.subscriptions = await db.getAll();
    render();
  } catch (err) {
    renderSyncStatus({ state: 'error', lastError: err });
  } finally {
    btn.disabled = false;
  }
}
