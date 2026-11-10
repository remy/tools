// =============================================
// Cook Planner — settings.js
// The Settings dialog: what's in the kitchen, and where the data syncs to.
// =============================================

import { db, getSyncConfig, setSyncConfig } from './db.js';
import { loadFromDb } from './state.js';
import { renderCurrentView } from './router.js';
import { renderApplianceSettings } from './appliance-settings.js';
import { statusText } from '/lib/sync-status.js';
import '/lib/sync-settings.wc.js';

const MERGE_WARNING =
  'This device already has a cook planned. Saving will merge it with the '
  + "server's data (last write wins per item).\n\n"
  + 'To REPLACE what is here with the server instead, cancel and use '
  + '"Pull from server".\n\nContinue with merge?';

let lastStatus = null;

// The cog is re-created by every render, so the badge is painted by class
// rather than held as an element reference.
export function paintSyncStatus() {
  const failing = lastStatus?.state === 'error';
  document.querySelectorAll('.sync-error-dot').forEach((dot) => {
    dot.hidden = !failing;
  });
  const btn = document.getElementById('btn-settings');
  if (btn) btn.title = failing ? statusText(lastStatus) : 'Settings';
}

export function initSettings() {
  const dialog = document.getElementById('settings-dialog');

  document.getElementById('settings-close').addEventListener('click', () => dialog.close());
  // <dialog> does not dismiss on a backdrop click by itself. With no padding on
  // the element, the only clicks whose target is the dialog are backdrop ones.
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
  // Appliance changes feed straight into the schedule, so repaint on the way
  // out rather than leaving a timeline that no longer matches the kitchen.
  dialog.addEventListener('close', () => renderCurrentView());

  document.getElementById('sync-settings').configure({
    store: db,
    getConfig: getSyncConfig,
    setConfig: setSyncConfig,
    mergeWarning: MERGE_WARNING,
    onRefresh: async () => {
      await loadFromDb();
      renderCurrentView();
    },
  });

  db.onSyncStatus((s) => {
    lastStatus = s;
    paintSyncStatus();
  });
}

export function openSettings() {
  renderApplianceSettings();
  // A sync may have landed (or another tab saved) since the dialog last closed.
  document.getElementById('sync-settings').refresh();
  document.getElementById('settings-dialog').showModal();
}
