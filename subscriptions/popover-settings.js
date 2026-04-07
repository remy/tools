import { state, DEFAULT_RATE } from './state.js';
import { db } from './db.js';
import { render } from './render-calendar.js';

export function openSettings() {
  const ccy = state.settings.displayCurrency;
  const radio = document.querySelector(`input[name="display-currency"][value="${ccy}"]`);
  if (radio) radio.checked = true;
  document.getElementById('exchange-rate').value = state.settings.exchangeRate;
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
