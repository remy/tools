import { state, gameById } from './state.js';
import { $ } from './ui.js';
import { goHome, selectGame, renameGame, deleteGame, deleteSession } from './games.js';
import {
  openEntry, saveEntry, deleteEntry, togglePlayer, clearOrder, sortByScore,
  setScore, commitScore, focusNextScore, syncNewGameField, toggleQuickAdd,
  addPlayerFromEntry, refreshPicker,
} from './entry.js';
import {
  openPlayerEditor, savePlayer, onNameInput, onEmojiInput, removePlayer,
  restorePlayer, handlePhotoFile, clearPhoto, initPhotoDrop,
} from './players.js';
import {
  openSettings, handleSyncSave, handleSyncNow, handleSyncPull,
  handleShareLink, handleShareGame,
} from './settings.js';

// Native <dialog>: dismiss when the backdrop (the dialog element itself) is
// clicked. Relies on the dialog having no padding so only backdrop clicks
// target the element directly.
function wireBackdropDismiss(id) {
  const dlg = $(id);
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) dlg.close();
  });
}

// ── Home: pick a game ──
function wireHome() {
  $('home-list').addEventListener('click', (e) => {
    const el = e.target.closest('[data-action="pick"]');
    if (el) selectGame(el.dataset.id);
  });
}

// ── Game view: edit or delete a recorded result ──
function wireSessions() {
  $('session-list').addEventListener('click', async (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const card = el.closest('.session');
    if (!card) return;
    if (el.dataset.action === 'edit-session') openEntry({ sessionId: card.dataset.id });
    else if (el.dataset.action === 'delete-session') await deleteSession(card.dataset.id);
  });
}

// ── Record dialog ──
function wireEntry() {
  $('btn-record').addEventListener('click', () => {
    openEntry({ gameId: state.view === 'game' ? state.currentGameId : null });
  });
  $('entry-players').addEventListener('click', (e) => {
    const chip = e.target.closest('.player-chip');
    if (chip) togglePlayer(chip.dataset.id);
  });
  $('entry-game').addEventListener('change', syncNewGameField);
  $('entry-clear').addEventListener('click', clearOrder);
  $('entry-sort').addEventListener('click', () => sortByScore());

  // The order list: scores are read as they're typed but only acted on once
  // the player is finished with the list, so the rows don't shuffle mid-entry.
  const ranking = $('entry-ranking');
  ranking.addEventListener('input', (e) => {
    const input = e.target.closest('.rank-score');
    if (input) setScore(input.dataset.id, input.value);
  });
  ranking.addEventListener('focusout', (e) => {
    if (!e.target.closest('.rank-score')) return;
    // Moving on within the list — the next score, or a row's remove button —
    // is still mid-entry. Re-sorting there would yank the rows (and the phone
    // keyboard) out from under the next tap, so it waits until focus has
    // genuinely left.
    if (ranking.contains(e.relatedTarget)) return;
    commitScore();
  });
  ranking.addEventListener('keydown', (e) => {
    // Enter walks down to the next score rather than saving the whole result.
    // Phone keyboards send the same key from their "next" action.
    const input = e.target.closest('.rank-score');
    if (e.key !== 'Enter' || !input) return;
    e.preventDefault();
    focusNextScore(input);
  });
  ranking.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="unrank"]');
    if (btn) togglePlayer(btn.dataset.id);
  });
  $('entry-add-player').addEventListener('click', toggleQuickAdd);
  $('entry-player-save').addEventListener('click', addPlayerFromEntry);
  // Enter in the quick-add box adds the player rather than submitting the
  // whole result, which is almost never what's meant mid-typing.
  $('entry-player-name').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    addPlayerFromEntry();
  });
  $('entry-delete').addEventListener('click', deleteEntry);
  $('entry-form').addEventListener('submit', (e) => { e.preventDefault(); saveEntry(); });
}

// ── Player editor ──
function wirePlayers() {
  $('players-list').addEventListener('click', async (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const { action, id } = el.dataset;
    if (action === 'edit-player') openPlayerEditor(id);
    else if (action === 'delete-player') await removePlayer(id);
    else if (action === 'restore-player') await restorePlayer(id);
  });
  $('player-new').addEventListener('click', () => openPlayerEditor(null));
  $('player-name').addEventListener('input', onNameInput);
  $('player-emoji').addEventListener('input', onEmojiInput);
  // Editing a player while recording a result (a photo dropped mid-entry, say)
  // leaves stale chips behind — repaint the picker once the editor closes.
  $('player-dialog').addEventListener('close', () => {
    if ($('entry-dialog').open) refreshPicker();
  });
  $('player-form').addEventListener('submit', (e) => { e.preventDefault(); savePlayer(); });

  // Avatar photos: the button opens the picker (the camera, on a phone), and
  // initPhotoDrop takes over the drop/paste queue the inline script started.
  $('photo-pick').addEventListener('click', () => $('photo-file').click());
  $('photo-file').addEventListener('change', async (e) => {
    await handlePhotoFile(e.target.files?.[0]);
    e.target.value = '';
  });
  $('photo-clear').addEventListener('click', clearPhoto);
  initPhotoDrop();
}

export function bindEvents() {
  $('btn-back').addEventListener('click', goHome);
  $('btn-settings').addEventListener('click', openSettings);

  // Settings: this game
  $('game-rename').addEventListener('click', async () => {
    await renameGame(state.currentGameId);
    // The dialog stays open over the renamed game, so keep its label honest.
    const game = gameById(state.currentGameId);
    if (game) $('game-settings-name').textContent = game.title;
  });
  $('game-delete').addEventListener('click', async () => {
    const id = state.currentGameId;
    $('settings-dialog').close();
    await deleteGame(id);
  });
  $('game-share-open').addEventListener('click', () => { $('share-choice').hidden = false; });
  $('share-game-plain').addEventListener('click', () => handleShareGame(false));
  $('share-game-sync').addEventListener('click', () => handleShareGame(true));

  // Settings: sync
  $('sync-save').addEventListener('click', handleSyncSave);
  $('sync-now').addEventListener('click', handleSyncNow);
  $('sync-pull').addEventListener('click', handleSyncPull);
  $('sync-share').addEventListener('click', handleShareLink);

  // Close buttons (any element with data-close pointing at a dialog id)
  document.querySelectorAll('[data-close]').forEach((btn) => {
    btn.addEventListener('click', () => $(btn.dataset.close).close());
  });

  ['entry-dialog', 'player-dialog', 'settings-dialog'].forEach(wireBackdropDismiss);

  wireHome();
  wireSessions();
  wireEntry();
  wirePlayers();
}
