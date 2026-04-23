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

async function applyLegacyImport(legacy) {
  const result = await db.replaceFromLegacy(legacy);
  const saved = await db.getAllSettings();
  state.settings.displayCurrency = saved.displayCurrency || 'GBP';
  state.settings.exchangeRate = saved.exchangeRate || DEFAULT_RATE;
  state.subscriptions = await db.getAll();
  render();
  document.getElementById('settings-popover').hidePopover();
  alert(`Replaced with ${result.subscriptions} subscription(s) from legacy data.`);
}

export async function handleImportLegacy() {
  const idbLegacy = await db.getLegacyIdbData();
  if (idbLegacy) {
    const ok = confirm(
      'Replace all subscriptions and settings with the data from the legacy '
      + 'IndexedDB store on this device? This cannot be undone.',
    );
    if (!ok) return;
    try {
      await applyLegacyImport(idbLegacy);
    } catch (err) {
      alert('Legacy import failed: ' + err.message);
    }
    return;
  }
  // No IndexedDB store on this device — fall back to picking a JSON file.
  document.getElementById('btn-import-legacy-file').click();
}

export async function handleImportLegacyFile(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    // Accept either the standard export shape or a raw legacy snapshot.
    const legacy = {
      subscriptions: Array.isArray(data) ? data : (data.subscriptions || []),
      settings: (data && typeof data === 'object' && data.settings) || {},
    };
    const ok = confirm(
      `Replace all local subscriptions and settings with ${legacy.subscriptions.length} `
      + `subscription(s) from this file? This cannot be undone.`,
    );
    if (!ok) return;
    await applyLegacyImport(legacy);
  } catch (err) {
    alert('Legacy import failed: ' + err.message);
  }
}
