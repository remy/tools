import { state, activePlayers, playerById, gameById } from './state.js';
import { db } from './db.js';
import { $, avatarEl, iconBtn, playerName, todayISO, ordinal, DELETE_PATHS } from './ui.js';
import { ensureGame, refreshAll, selectGame } from './games.js';
import { quickAddPlayer } from './players.js';

const NEW_GAME = '__new__';

// The finishing order being built, as player ids: index 0 finished 1st. The
// picker is a tap-in-order affair rather than a set of position dropdowns —
// it's the fastest thing to do at the table with a phone in one hand.
let ranked = [];
// playerId -> score, for the games that have one. Held separately from
// `ranked` so clearing the order to re-rank by hand doesn't lose the numbers
// anyone already typed in.
let scores = new Map();
// 'score': the order follows the scores, highest first, and re-sorts as they
// are entered. 'manual': the order is whatever was tapped, which is how a
// lowest-wins game (or a tie broken at the table) gets recorded. "Clear order"
// drops into manual; "Sort by score" goes back.
let orderMode = 'score';
// The session being edited, if any. Null while recording a fresh one.
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
  const previous = editing
    ? [...editing.results].sort((a, b) => a.position - b.position)
    : [];
  ranked = previous.map((r) => r.playerId);
  scores = new Map(previous.filter((r) => r.score != null).map((r) => [r.playerId, r.score]));
  // An edit opens in manual mode so nothing already saved re-shuffles itself;
  // "Sort by score" is right there if that's what's wanted.
  orderMode = editing ? 'manual' : 'score';

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
const HINTS = {
  score: 'Tap everyone who played, then type their scores — highest score takes 1st. '
    + 'Playing something where that’s upside down? Hit "Clear order" and tap them in the order they finished instead.',
  manual: 'Tap players in the order they finished — the first tap is 1st place. '
    + 'Tap a ranked player again to take them out, and scores are still yours to fill in.',
};

// Repaint a keyed list without rebuilding it: each element is matched back to
// the player it belongs to, updated in place, and only moved if it is actually
// in the wrong spot. Re-creating (or needlessly shuffling) a node blurs
// whatever is focused inside it, and on a phone a blur closes the keyboard —
// which is exactly what must not happen while scores are being typed.
function reconcile(parent, ids, build, update) {
  const spare = new Map([...parent.children].map((el) => [el.dataset.id, el]));
  ids.forEach((id, i) => {
    const el = spare.get(id) || build(id);
    spare.delete(id);
    update(el, id, i);
    if (parent.children[i] !== el) parent.insertBefore(el, parent.children[i] || null);
  });
  for (const el of spare.values()) el.remove();
}

function renderPicker() {
  const players = pickablePlayers();
  $('entry-no-players').hidden = players.length > 0;
  $('entry-hint').textContent = HINTS[orderMode];
  $('entry-sort').disabled = scores.size === 0;

  reconcile($('entry-players'), players.map((p) => p.id), buildChip, updateChip);
  renderRanking();
}

function buildChip(id) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'player-chip';
  btn.dataset.id = id;

  const badge = document.createElement('span');
  badge.className = 'chip-position';
  const avatar = document.createElement('span');
  avatar.className = 'avatar';
  const name = document.createElement('span');
  name.className = 'chip-name';

  btn.append(badge, avatar, name);
  return btn;
}

function updateChip(btn, id) {
  const player = playerById(id);
  const position = ranked.indexOf(id) + 1;

  btn.setAttribute('aria-pressed', String(position > 0));
  btn.setAttribute(
    'aria-label',
    position ? `${player.name}, ${ordinal(position)} — tap to unrank` : `${player.name} — tap to rank`,
  );
  if (position) btn.dataset.position = String(position);
  else delete btn.dataset.position;

  const badge = btn.querySelector('.chip-position');
  badge.hidden = position === 0;
  badge.textContent = position || '';
  btn.querySelector('.avatar').replaceWith(avatarEl(player, 'avatar-sm'));
  btn.querySelector('.chip-name').textContent = player.name;
}

// ── The order itself, with a score box per place ──
function renderRanking() {
  const list = $('entry-ranking');
  list.hidden = ranked.length === 0;
  reconcile(list, ranked, buildRankRow, updateRankRow);
}

function buildRankRow(id) {
  const li = document.createElement('li');
  li.className = 'rank-row';
  li.dataset.id = id;

  const pos = document.createElement('span');
  pos.className = 'rank-pos';
  const avatar = document.createElement('span');
  avatar.className = 'avatar';
  const name = document.createElement('span');
  name.className = 'rank-name';

  const score = document.createElement('input');
  score.type = 'number';
  score.className = 'rank-score';
  score.step = 'any';
  score.inputMode = 'numeric';
  score.placeholder = 'Score';
  score.dataset.id = id;

  const remove = iconBtn('unrank', '', DELETE_PATHS, 'icon-danger');
  remove.dataset.id = id;

  li.append(pos, avatar, name, score, remove);
  return li;
}

function updateRankRow(li, id, i) {
  const player = playerById(id);
  const place = i + 1;
  if (place <= 3) li.dataset.position = String(place);
  else delete li.dataset.position;

  li.querySelector('.rank-pos').textContent = ordinal(place);
  li.querySelector('.avatar').replaceWith(avatarEl(player, 'avatar-sm'));
  li.querySelector('.rank-name').textContent = playerName(player);
  li.querySelector('[data-action="unrank"]')
    .setAttribute('aria-label', `Take ${playerName(player)} out`);

  const score = li.querySelector('.rank-score');
  score.setAttribute('aria-label', `Score for ${playerName(player)}`);
  // Tell the phone keyboard what its action key does, so it reads "next" all
  // the way down the order and "done" on the last score.
  score.enterKeyHint = i === ranked.length - 1 ? 'done' : 'next';
  // Never stomp on a half-typed number: the box someone is in owns its value
  // until they leave it.
  if (document.activeElement !== score) {
    const value = scores.get(id);
    score.value = value == null ? '' : String(value);
  }
}

// Step down the order to the next score box. Nothing re-sorts on the way, so
// the boxes stay put under the keyboard and the next one is where the player
// expects it; the last box gives up focus, which closes entry and commits.
export function focusNextScore(input) {
  const boxes = [...$('entry-ranking').querySelectorAll('.rank-score')];
  const next = boxes[boxes.indexOf(input) + 1];
  if (next) next.focus();
  else input.blur();
}

// Repaint the picker from outside — used when the player list changes while
// the record dialog is open.
export function refreshPicker() {
  renderPicker();
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

// Record a typed score. Deliberately does not re-render: re-sorting under a
// half-typed number would pull the box out from under the keyboard. The
// re-sort waits until focus leaves the order list entirely (see commitScore),
// so stepping from one score to the next never moves anything.
export function setScore(id, raw) {
  const value = raw.trim() === '' ? null : Number(raw);
  if (value == null || !Number.isFinite(value)) scores.delete(id);
  else scores.set(id, value);
  $('entry-sort').disabled = scores.size === 0;
}

export function commitScore() {
  if (orderMode !== 'score') return;
  sortByScore({ keepMode: true });
}

// Order by score, highest first. Anyone without a score keeps their relative
// place at the back — they're usually the ones still being counted up.
export function sortByScore({ keepMode = false } = {}) {
  const focused = document.activeElement;
  const focusedId = focused?.classList?.contains('rank-score') ? focused.dataset.id : null;

  const scored = ranked.filter((id) => scores.has(id));
  const unscored = ranked.filter((id) => !scores.has(id));
  scored.sort((a, b) => scores.get(b) - scores.get(a));
  ranked = [...scored, ...unscored];
  if (!keepMode) orderMode = 'score';
  renderPicker();

  // A row that has to move is unavoidably lifted out and reinserted, which
  // blurs it — put focus back on the same player's box so a sort that lands
  // mid-entry doesn't end it.
  if (focusedId) {
    const next = $('entry-ranking').querySelector(`.rank-score[data-id="${focusedId}"]`);
    next?.focus();
  }
}

// Wipe the order but keep the scores, so the finishing order can be tapped out
// by hand for the games where the biggest number doesn't win.
export function clearOrder() {
  ranked = [];
  orderMode = 'manual';
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

  const results = ranked.map((playerId, i) => ({
    playerId,
    position: i + 1,
    score: scores.has(playerId) ? scores.get(playerId) : null,
  }));
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
