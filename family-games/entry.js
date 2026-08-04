import { state, activePlayers, playerById, gameById } from './state.js';
import { db } from './db.js';
import { $, avatarEl, todayISO, ordinal } from './ui.js';
import { ensureGame, refreshAll, selectGame } from './games.js';
import { quickAddPlayer } from './players.js';

const NEW_GAME = '__new__';

// The finishing order being built, as player ids: index 0 finished 1st. The
// picker is a tap-in-order affair rather than a set of position dropdowns —
// it's the fastest thing to do at the table with a phone in one hand.
let ranked = [];
// Ids of the session being edited, if any. Null while recording a fresh one.
let editing = null;

// Everyone tappable: the current squad, plus anyone archived who already
// appears in the result being edited so editing can't silently drop them.
function pickablePlayers() {
  const players = activePlayers();
  for (const id of ranked) {
    if (!players.some((p) => p.id === id)) {
      const player = playerById(id);
      if (player) players.push(player);
    }
  }
  return players;
}

export function openEntry({ gameId = null, sessionId = null } = {}) {
  editing = sessionId ? state.sessions.find((s) => s.id === sessionId) : null;
  ranked = editing
    ? [...editing.results].sort((a, b) => a.position - b.position).map((r) => r.playerId)
    : [];

  $('entry-title').textContent = editing ? 'Edit result' : 'Record a result';
  $('entry-save').textContent = editing ? 'Save changes' : 'Save result';
  $('entry-delete').hidden = !editing;
  $('entry-id').value = editing ? editing.id : '';
  $('entry-date').value = editing ? editing.date : todayISO();

  fillGameSelect(editing ? editing.gameId : gameId);
  // The game a result belongs to is part of its identity (and its document id),
  // so editing changes the result, not which game it was played in.
  $('entry-game').disabled = !!editing;

  hideQuickAdd();
  setError('');
  renderPicker();
  $('entry-dialog').showModal();
}

function fillGameSelect(preferredId) {
  const sel = $('entry-game');
  sel.replaceChildren();
  for (const game of state.games) sel.appendChild(new Option(game.title, game.id));
  sel.appendChild(new Option('＋ New game…', NEW_GAME));

  // Default to the game we came from, else the one played most recently
  // (state.sessions is newest-first), else straight into naming a new game.
  const lastPlayed = state.sessions.find((s) => gameById(s.gameId))?.gameId;
  sel.value = (preferredId && gameById(preferredId))
    ? preferredId
    : (lastPlayed || state.games[0]?.id || NEW_GAME);

  $('entry-new-game').value = '';
  syncNewGameField();
}

// Show the title box only while "New game…" is selected.
export function syncNewGameField() {
  const isNew = $('entry-game').value === NEW_GAME;
  $('entry-new-game-field').hidden = !isNew;
  // With no games at all there is nothing to pick between, so the select is
  // just noise.
  $('entry-game-field').hidden = state.games.length === 0;
  if (isNew) setTimeout(() => $('entry-new-game').focus(), 50);
}

// ── Player picker ──
function renderPicker() {
  const wrap = $('entry-players');
  wrap.replaceChildren();
  const players = pickablePlayers();
  $('entry-no-players').hidden = players.length > 0;

  for (const player of players) {
    const position = ranked.indexOf(player.id) + 1;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'player-chip';
    btn.dataset.id = player.id;
    btn.setAttribute('aria-pressed', String(position > 0));
    btn.setAttribute(
      'aria-label',
      position ? `${player.name}, ${ordinal(position)} — tap to unrank` : `${player.name} — tap to rank`,
    );
    if (position) {
      btn.dataset.position = String(position);
      const badge = document.createElement('span');
      badge.className = 'chip-position';
      badge.textContent = position;
      btn.appendChild(badge);
    }
    const name = document.createElement('span');
    name.className = 'chip-name';
    name.textContent = player.name;
    btn.append(avatarEl(player, 'avatar-sm'), name);
    wrap.appendChild(btn);
  }
}

// Tapping an unranked player puts them next; tapping a ranked one pulls them
// out and everyone below shuffles up.
export function togglePlayer(id) {
  const at = ranked.indexOf(id);
  if (at === -1) ranked.push(id);
  else ranked.splice(at, 1);
  setError('');
  renderPicker();
}

export function clearOrder() {
  ranked = [];
  renderPicker();
}

// ── Quick-add a player without leaving the dialog ──
export function toggleQuickAdd() {
  const row = $('entry-quick-add');
  row.hidden = !row.hidden;
  if (!row.hidden) {
    $('entry-player-name').value = '';
    $('entry-player-name').focus();
  }
}

function hideQuickAdd() {
  $('entry-quick-add').hidden = true;
  $('entry-player-name').value = '';
}

export async function addPlayerFromEntry() {
  const input = $('entry-player-name');
  const id = await quickAddPlayer(input.value);
  if (!id) { input.focus(); return; }
  input.value = '';
  input.focus();
  renderPicker();
}

// ── Save / delete ──
function setError(message) {
  const el = $('entry-error');
  el.textContent = message;
  el.hidden = !message;
}

export async function saveEntry() {
  const date = $('entry-date').value || todayISO();
  const selected = $('entry-game').value;

  let gameId = selected;
  if (selected === NEW_GAME || !state.games.length) {
    const title = $('entry-new-game').value.trim();
    if (!title) {
      setError('Give the new game a title.');
      $('entry-new-game').focus();
      return;
    }
    gameId = await ensureGame(title);
  }
  if (!ranked.length) {
    setError('Tap at least one player to set the finishing order.');
    return;
  }

  const results = ranked.map((playerId, i) => ({ playerId, position: i + 1 }));
  await db.putSession({
    id: editing ? editing.id : crypto.randomUUID(),
    gameId,
    date,
    results,
    note: editing ? editing.note : '',
    createdAt: editing ? editing.createdAt : Date.now(),
  });

  $('entry-dialog').close();
  await refreshAll();
  // Land on the game just recorded so the new entry is right there in context.
  selectGame(gameId);
}

export async function deleteEntry() {
  if (!editing) return;
  if (!confirm('Delete this result? This cannot be undone.')) return;
  await db.deleteSession(editing.gameId, editing.id);
  $('entry-dialog').close();
  await refreshAll();
}
