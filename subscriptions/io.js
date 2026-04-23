import { state, DEFAULT_RATE } from './state.js';
import { db } from './db.js';
import { render } from './render-calendar.js';

export async function handleExport() {
  const data = await db.exportData();
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `subscriptions-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function handleImport(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    await db.importData(data);
    const saved = await db.getAllSettings();
    state.settings.displayCurrency = saved.displayCurrency || 'GBP';
    state.settings.exchangeRate = saved.exchangeRate || DEFAULT_RATE;
    state.subscriptions = await db.getAll();
    render();
    document.getElementById('settings-popover').hidePopover();
  } catch (err) {
    alert('Import failed: ' + err.message);
  }
}
