import { state, gameById, playerById } from './state.js';
import { $, avatarEl, plural, relativeDay, nameList } from './ui.js';
import { renderGame } from './history.js';
import { gameSummary } from './stats.js';

// ── Main render ──
export function render() {
  const game = gameById(state.currentGameId);
  // Only stay in the single-game view when a valid game is selected; otherwise
  // fall back home (e.g. the open game was just deleted).
  const onGame = state.view === 'game' && !!game;

  $('header-title').textContent = onGame ? game.title : 'Family Games';
  $('btn-back').hidden = !onGame;
  $('home-view').hidden = onGame;
  $('game-view').hidden = !onGame;
  // From inside a game the button is unambiguous about what it will record.
  $('record-label').textContent = onGame ? `Record a ${game.title} result` : 'Record a result';

  if (onGame) renderGame(game);
  else renderHome();
}

// ── Home view: every game, most recently played first ──
export function renderHome() {
  const games = orderedGames();
  $('empty-app').hidden = games.length > 0;
  $('home-list').hidden = games.length === 0;
  if (!games.length) return;

  const ul = $('home-list');
  ul.replaceChildren();
  for (const { game, summary } of games) ul.appendChild(homeRow(game, summary));
}

// Games we're actually playing float to the top: most recently played first,
// then never-played ones alphabetically at the bottom.
function orderedGames() {
  const rows = state.games.map((game) => ({ game, summary: gameSummary(game.id) }));
  rows.sort((a, b) => {
    if (a.summary.lastDate && b.summary.lastDate) {
      return b.summary.lastDate.localeCompare(a.summary.lastDate);
    }
    if (a.summary.lastDate) return -1;
    if (b.summary.lastDate) return 1;
    return a.game.title.localeCompare(b.game.title);
  });
  return rows;
}

function homeRow(game, summary) {
  const li = document.createElement('li');
  li.className = 'pick-row';

  const pick = document.createElement('button');
  pick.type = 'button';
  pick.className = 'pick-main';
  pick.dataset.action = 'pick';
  pick.dataset.id = game.id;

  const body = document.createElement('span');
  body.className = 'pick-body';

  const title = document.createElement('span');
  title.className = 'pick-name';
  title.textContent = game.title;
  body.appendChild(title);

  const meta = document.createElement('span');
  meta.className = 'pick-meta';
  meta.textContent = summary.plays
    ? `${plural(summary.plays, 'play')} · last played ${relativeDay(summary.lastDate)}`
    : 'No results yet';
  body.appendChild(meta);
  pick.appendChild(body);

  // Whoever won last time, as a nudge about who's on form — all of them when
  // the last one was drawn.
  if (summary.lastWinnerIds.length) {
    const winners = summary.lastWinnerIds.map(playerById);
    const badge = document.createElement('span');
    badge.className = 'pick-winner';
    badge.title = winners.length > 1
      ? `${nameList(winners)} shared the last one`
      : `${nameList(winners)} won the last one`;
    for (const winner of winners) badge.append(avatarEl(winner, 'avatar-sm'));
    pick.appendChild(badge);
  }

  li.appendChild(pick);
  return li;
}
