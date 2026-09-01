import { state, activePlayers, playerById, gameById } from './state.js';
import { db } from './db.js';
import { $, avatarEl, iconBtn, playerName, todayISO, placeLabel, DELETE_PATHS } from './ui.js';
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
// Player ids that finished level with whoever is directly above them in
// `ranked`. A tie is stored against the lower player so it survives someone
// being pulled out of the middle of the order.
let tied = new Set();
// 'score': the order follows the scores, highest first, and re-sorts as they
// are entered — equal scores share a place. 'manual': the order is whatever
// was tapped, which is how a lowest-wins game gets recorded, and where a draw
// with no score to prove it is marked by hand. "Clear order" and marking a tie
// both drop into manual; "Sort by score" goes back.
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
  // Two saved results on the same position were joint — read that back so an
  // edit doesn't quietly split a draw.
  tied = new Set(
    previous.filter((r, i) => i > 0 && r.position === previous[i - 1].position).map((r) => r.playerId),
  );
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
  score: 'Tap everyone who played, then type their scores — highest score takes 1st, '
    + 'and a matching score is a joint place. Playing something where that’s upside down? '
    + 'Hit "Clear order" and tap them in the order they finished instead.',
  manual: 'Tap players in the order they finished — the first tap is 1st place. '
    + 'Tap a ranked player again to take them out, use "=" to make them joint with the '
    + 'player above, and scores are still yours to fill in.',
};

// Two players on the same score drew, so the order the sort happened to put
// them in means nothing — they share the place. Anyone still without a score
// is left out of it.
function tieOnEqualScores() {
  tied = new Set();
  ranked.forEach((id, i) => {
    if (i === 0) return;
    const mine = scores.get(id);
    const above = scores.get(ranked[i - 1]);
    if (mine != null && above != null && mine === above) tied.add(id);
  });
}

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
  // While the order belongs to the scores, so do the ties — re-derived on
  // every repaint so pulling a player out can't leave a stale one behind.
  if (orderMode === 'score') tieOnEqualScores();
  const players = pickablePlayers();
  $('entry-no-players').hidden = players.length > 0;
  $('entry-hint').textContent = HINTS[orderMode];
  $('entry-sort').disabled = scores.size === 0;

  const place = places();
  reconcile($('entry-players'), players.map((p) => p.id), buildChip, (btn, id) => updateChip(btn, id, place));
  renderRanking(place);
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

function updateChip(btn, id, place) {
  const player = playerById(id);
  const position = place.get(id) || 0;
  const joint = isJoint(place, position);

  btn.setAttribute('aria-pressed', String(position > 0));
  btn.setAttribute(
    'aria-label',
    position
      ? `${player.name}, ${placeLabel(position, joint)} — tap to unrank`
      : `${player.name} — tap to rank`,
  );
  if (position) btn.dataset.position = String(position);
  else delete btn.dataset.position;

  const badge = btn.querySelector('.chip-position');
  badge.hidden = position === 0;
  badge.textContent = position ? `${joint ? '=' : ''}${position}` : '';
  btn.querySelector('.avatar').replaceWith(avatarEl(player, 'avatar-sm'));
  btn.querySelector('.chip-name').textContent = player.name;
}

// Standard competition ranking over the current order: a shared place is
// taken by everyone in it and the next player down drops by the size of the
// group, so a joint 1st is followed by 3rd.
function places() {
  const out = new Map();
  let place = 1;
  ranked.forEach((id, i) => {
    if (i > 0 && !tied.has(id)) place = i + 1;
    out.set(id, place);
  });
  return out;
}

// Whether a place is shared — either the row above is tied to this one, or
// this one is tied to it.
function isJoint(place, position) {
  return position > 0 && [...place.values()].filter((p) => p === position).length > 1;
}

// ── The order itself, with a score box per place ──
function renderRanking(place) {
  const list = $('entry-ranking');
  list.hidden = ranked.length === 0;
  reconcile(list, ranked, buildRankRow, (li, id, i) => updateRankRow(li, id, i, place));
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

  // Joins this player to the one above on the same place. It sits before the
  // name because that is what it reads as: everything from here up is level.
  const tie = document.createElement('button');
  tie.type = 'button';
  tie.className = 'rank-tie';
  tie.dataset.action = 'tie';
  tie.dataset.id = id;
  tie.textContent = '=';

  const score = document.createElement('input');
  score.type = 'number';
  score.className = 'rank-score';
  score.step = 'any';
  score.inputMode = 'numeric';
  score.placeholder = 'Score';
  score.dataset.id = id;

  const remove = iconBtn('unrank', '', DELETE_PATHS, 'icon-danger');
  remove.dataset.id = id;

  li.append(pos, tie, avatar, name, score, remove);
  return li;
}

function updateRankRow(li, id, i, place) {
  const player = playerById(id);
  const position = place.get(id);
  const joint = isJoint(place, position);
  if (position <= 3) li.dataset.position = String(position);
  else delete li.dataset.position;
  li.classList.toggle('is-tied', tied.has(id) && i > 0);

  li.querySelector('.rank-pos').textContent = placeLabel(position, joint);

  const above = i > 0 ? playerById(ranked[i - 1]) : null;
  const tie = li.querySelector('.rank-tie');
  // The top row has nothing above to be level with, so its toggle is kept in
  // the layout but taken out of play.
  tie.disabled = i === 0;
  tie.setAttribute('aria-pressed', String(tied.has(id) && i > 0));
  tie.setAttribute(
    'aria-label',
    above
      ? (tied.has(id)
        ? `Split ${playerName(player)} from ${playerName(above)}`
        : `Tie ${playerName(player)} with ${playerName(above)}`)
      : 'Nobody above to tie with',
  );
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
  tied.delete(id);
  // Whoever is left at the top can't be level with anyone above them.
  if (ranked.length) tied.delete(ranked[0]);
  setError('');
  renderPicker();
}

// Mark this player level with the one above, or split them again. Doing it by
// hand means the order is no longer the scores' to decide, so it drops into
// manual mode and the tie survives.
export function toggleTie(id) {
  const at = ranked.indexOf(id);
  if (at < 1) return;
  if (tied.has(id)) tied.delete(id);
  else tied.add(id);
  orderMode = 'manual';
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
  tied = new Set();
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

  // A save straight off the last score box may beat the focusout that commits
  // it, so settle the order (and the ties it implies) before reading places.
  commitScore();
  const place = places();
  const results = ranked.map((playerId) => ({
    playerId,
    position: place.get(playerId),
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
