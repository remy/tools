import { state, gameById } from './state.js';
import { db, getSyncConfig, setSyncConfig } from './db.js';
import { $ } from './ui.js';
import { refreshAll } from './games.js';
import { renderPlayers } from './players.js';
import { buildGameLink } from './share.js';
import { statusText } from '/lib/sync-status.js';
import '/lib/sync-settings.wc.js';

// ── Sync ──
// The panel itself is the shared <sync-settings> component; all this tool does
// is hand it the store and drive the red badge on the header cog, so a failing
// sync is visible without opening settings.
export function initSyncStatus() {
  $('sync-settings').configure({
    store: db,
    getConfig: getSyncConfig,
    setConfig: setSyncConfig,
    mergeWarning:
      'Players and results exist on this device. Saving will merge them with '
      + "the server's data (last write wins per record).\n\n"
      + 'To REPLACE local data with the server instead, cancel and use '
      + '"Pull from server".\n\nContinue with merge?',
    onRefresh: async () => {
      await refreshAll();
      renderPlayers();
    },
  });

  db.onSyncStatus((s) => {
    const failing = s?.state === 'error';
    $('sync-error-dot').hidden = !failing;
    $('btn-settings').title = failing ? statusText(s) : '';
  });
}

export function openSettings() {
  // A sync may have landed (or another tab saved) since the dialog last closed.
  $('sync-settings').refresh();

  const game = state.view === 'game' ? gameById(state.currentGameId) : null;
  $('game-settings-section').hidden = !game;
  $('share-choice').hidden = true;
  // A link can only carry the data itself when there's a server behind it.
  $('share-game-sync').disabled = !getSyncConfig().url;
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

// A link straight to the open game. Without `includeSync` it only opens the
// game for someone who already has the data; with it, the link also carries
// the sync config so a brand new device can download the history first.
export async function handleShareGame(includeSync) {
  if (!state.currentGameId) return;
  const btn = $(includeSync ? 'share-game-sync' : 'share-game-plain');
  const label = includeSync ? 'Link + sync access' : 'Link to this game';
  await copyLink(buildGameLink(state.currentGameId, { includeSync }), btn, label);
}
