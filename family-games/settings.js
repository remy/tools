import { state, gameById } from './state.js';
import { db, getSyncConfig, setSyncConfig, encodeSyncConfig, SHARE_PARAM } from './db.js';
import { $ } from './ui.js';
import { refreshAll } from './games.js';
import { renderPlayers } from './players.js';
import { buildGameLink } from './share.js';

// Enable the share button only when there's a remote host to share.
function updateShareAvailability(url) {
  $('sync-share').disabled = !url;
}

// ── Sync status ──
// PouchDB errors are inconsistent about where the useful detail lives, so try
// message, then reason, then name, and append the HTTP status when present.
function errorText(err) {
  const detail = err?.message || err?.reason || err?.name || 'Unknown error';
  const status = err?.status ? ` (HTTP ${err.status})` : '';
  return `Sync error: ${detail}${status}`;
}

function statusText(s) {
  if (!s || s.state === 'disabled') return 'Sync disabled.';
  if (s.state === 'syncing') return 'Syncing…';
  if (s.state === 'error') return errorText(s.lastError);
  const last = s.lastSyncedAt
    ? ` · last synced ${new Date(s.lastSyncedAt).toLocaleTimeString()}`
    : '';
  return `Idle${last}`;
}

function renderSyncStatus(s) {
  const el = $('sync-status');
  if (!el) return;
  el.textContent = statusText(s);
  el.dataset.state = s?.state ?? 'disabled';
}

// Subscribe once at startup: keeps the settings-dialog status line current and
// drives the red badge on the header cog so a failing sync is visible without
// opening settings.
export function initSyncStatus() {
  db.onSyncStatus((s) => {
    renderSyncStatus(s);
    const failing = s?.state === 'error';
    $('sync-error-dot').hidden = !failing;
    $('btn-settings').title = failing ? statusText(s) : '';
  });
}

export function openSettings() {
  const cfg = getSyncConfig();
  $('sync-url').value = cfg.url;
  $('sync-token').value = cfg.token;
  updateShareAvailability(cfg.url);

  const game = state.view === 'game' ? gameById(state.currentGameId) : null;
  $('game-settings-section').hidden = !game;
  $('share-choice').hidden = true;
  // A link can only carry the data itself when there's a server behind it.
  $('share-game-sync').disabled = !cfg.url;
  if (game) $('game-settings-name').textContent = game.title;

  renderPlayers();
  $('settings-dialog').showModal();
}

// ── Share links ──
// Copy to the clipboard, flashing confirmation on the button that was pressed
// and restoring its label afterwards. One timer per button so two links copied
// in quick succession don't cancel each other's reset.
const shareResetTimers = new WeakMap();
async function copyLink(link, btn, label) {
  try {
    await navigator.clipboard.writeText(link);
    btn.textContent = 'Copied!';
    clearTimeout(shareResetTimers.get(btn));
    shareResetTimers.set(btn, setTimeout(() => { btn.textContent = label; }, 2000));
  } catch {
    // Clipboard blocked (e.g. insecure context) — surface the link to copy by hand.
    prompt('Copy this link:', link);
  }
}

// Build a link that encodes the current sync config and copy it to the
// clipboard. Opening it on another device saves the config and reloads.
export async function handleShareLink() {
  const cfg = getSyncConfig();
  if (!cfg.url) return;
  const link = `${location.origin}${location.pathname}?${SHARE_PARAM}=${encodeSyncConfig(cfg)}`;
  await copyLink(link, $('sync-share'), 'Copy share link');
}

// A link straight to the open game. Without `includeSync` it only opens the
// game for someone who already has the data; with it, the link also carries
// the sync config so a brand new device can download the history first.
export async function handleShareGame(includeSync) {
  if (!state.currentGameId) return;
  const btn = $(includeSync ? 'share-game-sync' : 'share-game-plain');
  const label = includeSync ? 'Link + sync access' : 'Link to this game';
  await copyLink(buildGameLink(state.currentGameId, { includeSync }), btn, label);
}

// ── Sync controls ──
export async function handleSyncSave() {
  const url = $('sync-url').value.trim();
  const token = $('sync-token').value.trim();
  const btn = $('sync-save');
  btn.disabled = true;
  try {
    // Decide BEFORE writing config so the check reflects current local data.
    const hasLocal = url ? await db.hasData() : false;
    if (url && hasLocal) {
      const ok = confirm(
        'Players and results exist on this device. Saving will merge them with '
        + "the server's data (last write wins per record).\n\n"
        + 'To REPLACE local data with the server instead, cancel and use '
        + '"Pull from server".\n\nContinue with merge?',
      );
      if (!ok) { btn.disabled = false; return; }
    }
    setSyncConfig({ url, token });
    updateShareAvailability(url);
    // pullFirst when local has nothing to lose — protects a fresh client from
    // racing an empty push against the initial pull.
    await db.reopen({ pullFirst: !hasLocal });
    await refreshAll();
    renderPlayers();
  } catch (err) {
    renderSyncStatus({ state: 'error', lastError: err });
  } finally {
    btn.disabled = false;
  }
}

export async function handleSyncNow() {
  const btn = $('sync-now');
  btn.disabled = true;
  try {
    await db.syncNow();
    await refreshAll();
    renderPlayers();
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
  const btn = $('sync-pull');
  btn.disabled = true;
  try {
    await db.pullFromRemote();
    await refreshAll();
    renderPlayers();
  } catch (err) {
    renderSyncStatus({ state: 'error', lastError: err });
  } finally {
    btn.disabled = false;
  }
}
