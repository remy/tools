import { db, getSyncConfig, setSyncConfig } from './db.js';
import './app.js';
import { consumeLinkParams } from '/lib/deep-link.js';
import { statusText } from '/lib/sync-status.js';
import '/lib/sync-settings.wc.js';

const $ = (id) => document.getElementById(id);

// ── Settings dialog ──
// Lives outside <notes-app> because the component rebuilds its whole subtree
// on every render, which would tear down <sync-settings> and its listeners.
function initSettings(app) {
  const dialog = $('settings-dialog');
  const merge = $('import-merge');

  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
  $('settings-close').addEventListener('click', () => dialog.close());

  app.addEventListener('notes:open-settings', () => {
    // A sync may have landed (or another tab saved) since it was last open.
    $('sync-settings').refresh();
    dialog.showModal();
  });

  $('export-notes').addEventListener('click', () => app.exportNotes());

  $('import-open').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!merge.checked && app.notes.length && !confirm(
      `Replace all ${app.notes.length} notes with the imported file?`
      + (getSyncConfig().url ? ' The deletions will sync to every device.' : '')
    )) return;
    if (await app.importNotes(await file.text(), { merge: merge.checked })) {
      dialog.close();
    }
  });

  $('sync-settings').configure({
    store: db,
    getConfig: getSyncConfig,
    setConfig: setSyncConfig,
    mergeWarning:
      'Notes already exist on this device. Saving will merge them with the '
      + "server's notes (last write wins per note).\n\n"
      + 'To REPLACE local notes with the server instead, cancel and use '
      + '"Pull from server".\n\nContinue with merge?',
    onRefresh: () => app.refreshFromStore(),
  });

  db.onSyncStatus((s) => {
    app.setSyncError(s?.state === 'error' ? statusText(s) : '');
  });
}

// ── Dropped files ──
// The inline script in index.html captures a dropped file before this module
// has loaded; register() drains anything it queued, then handles later drops.
// Dropped files always merge — the safe choice without asking.
function initDrop(app) {
  window.__notesEarly?.register(async (text) => {
    if (await app.importNotes(text, { merge: true })) $('settings-dialog').close();
  });
}

// ── Sync ──
// Coalesce bursts of changes (a replication batch, a bulk import) into one
// refresh.
let refreshTimer = null;
function scheduleRefresh(app) {
  if (refreshTimer) return;
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    app.refreshFromStore();
  }, 50);
}

// Mobile browsers freeze the page while backgrounded and Data Saver throttles
// the live-sync socket, which can strand a queued edit behind a zombie
// connection. Restart sync on returning to the foreground or coming back
// online. Debounced so a burst of events collapses into one restart.
let syncKickTimer = null;
function kickSync() {
  clearTimeout(syncKickTimer);
  syncKickTimer = setTimeout(() => db.restartSync(), 300);
}

function updateThemeColor() {
  const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  const update = () => meta.setAttribute('content', darkModeQuery.matches ? '#0f172a' : '#ffffff');
  update();
  darkModeQuery.addEventListener('change', update);
}

function init() {
  const app = document.createElement('notes-app');
  document.body.prepend(app);

  updateThemeColor();
  initSettings(app);
  initDrop(app);
  db.onChange(() => scheduleRefresh(app));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') kickSync();
  });
  window.addEventListener('online', kickSync);
}

// A ?sync= share link saves its config and reloads, in which case boot waits
// for the reload. ?note= is the app's own routing and is left alone.
if (!consumeLinkParams({ setConfig: setSyncConfig })) init();
