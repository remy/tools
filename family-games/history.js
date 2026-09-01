import { playerById } from './state.js';
import {
  $, avatarEl, playerName, nameList, iconBtn, svg, fmtDate, recentDay,
  ordinal, placeLabel, plural, EDIT_PATHS, DELETE_PATHS,
} from './ui.js';
import {
  sessionsFor, standings, byStanding, hasScores, fmtScore, jointPositions, winnersOf,
} from './stats.js';

// Which history entries are expanded. Kept out of the synced state because it's
// pure view state, and kept across re-renders so a background sync doesn't
// collapse the entry you're reading.
const openSessions = new Set();

export function renderGame(game) {
  const sessions = sessionsFor(game.id);
  // Score columns only earn their place in a game where anyone keeps score.
  const showScores = hasScores(sessions);
  renderStandings(sessions, showScores);
  renderSessions(sessions, showScores);
}

// ── Standings table ──
function renderStandings(sessions, showScores) {
  const rows = standings(sessions);
  $('standings-section').hidden = rows.length === 0;
  if (!rows.length) return;

  const ul = $('standings-list');
  ul.replaceChildren();
  // Two players with nothing to separate them are level, not 1st and 2nd.
  let rank = 1;
  rows.forEach((row, i) => {
    if (i > 0 && byStanding(rows[i - 1], row) !== 0) rank = i + 1;
    const joint = rows.some((other) => other !== row && byStanding(other, row) === 0);
    ul.appendChild(standingRow(row, rank, joint, showScores));
  });
}

function standingRow(row, rank, joint, showScores) {
  const li = document.createElement('li');
  li.className = 'standing-row';
  if (rank <= 3) li.dataset.rank = String(rank);

  const pos = document.createElement('span');
  pos.className = 'standing-rank';
  pos.textContent = joint ? `=${rank}` : rank;

  const player = playerById(row.playerId);
  const name = document.createElement('span');
  name.className = 'standing-name';
  name.textContent = playerName(player);

  const body = document.createElement('div');
  body.className = 'standing-body';
  body.appendChild(name);

  const meta = document.createElement('span');
  meta.className = 'standing-meta';
  const parts = [plural(row.plays, 'play'), `avg ${row.avg.toFixed(1)}`, `best ${ordinal(row.best)}`];
  if (showScores && row.bestScore != null) parts.push(`high ${fmtScore(row.bestScore)}`);
  meta.textContent = parts.join(' · ');
  body.appendChild(meta);

  const wins = document.createElement('span');
  wins.className = 'standing-wins';
  wins.title = `${Math.round(row.winRate * 100)}% win rate`;
  wins.textContent = `${row.wins}`;
  const winLabel = document.createElement('span');
  winLabel.className = 'standing-wins-label';
  winLabel.textContent = row.wins === 1 ? 'win' : 'wins';
  wins.appendChild(winLabel);

  li.append(pos, avatarEl(player), body, wins);
  return li;
}

// ── History ──
function renderSessions(sessions, showScores) {
  const wrap = $('session-list');
  wrap.replaceChildren();
  $('empty-history').hidden = sessions.length > 0;
  for (const session of sessions) wrap.appendChild(sessionCard(session, showScores));
}

function sessionCard(session, showScores) {
  const details = document.createElement('details');
  details.className = 'session';
  details.dataset.id = session.id;
  details.open = openSessions.has(session.id);
  details.addEventListener('toggle', () => {
    if (details.open) openSessions.add(session.id);
    else openSessions.delete(session.id);
  });

  const summary = document.createElement('summary');
  summary.className = 'session-summary';

  const when = document.createElement('span');
  when.className = 'session-when';
  const date = document.createElement('span');
  date.className = 'session-date';
  date.textContent = fmtDate(session.date);
  const ago = document.createElement('span');
  ago.className = 'session-ago';
  // The full date is already on the line above, so only a genuinely relative
  // phrase ("yesterday") earns its place here.
  ago.textContent = [recentDay(session.date), plural(session.results.length, 'player')]
    .filter(Boolean).join(' · ');
  when.append(date, ago);

  // A draw at the top has more than one winner — every one of them is named.
  const won = winnersOf(session);
  const winners = won.map((r) => playerById(r.playerId));
  const winnerEl = document.createElement('span');
  winnerEl.className = 'session-winner';
  if (won.length) {
    for (const winner of winners) winnerEl.append(avatarEl(winner, 'avatar-sm'));
    const label = document.createElement('span');
    label.className = 'session-winner-name';
    // The winning score belongs next to the winner's name, collapsed or not —
    // but only when it is one number they all share.
    const score = won[0].score;
    const oneScore = score != null && won.every((r) => r.score === score);
    label.textContent = oneScore
      ? `${nameList(winners)} · ${fmtScore(score)}`
      : nameList(winners);
    winnerEl.appendChild(label);
  }

  const chevron = svg(
    '<path d="M4.5 7L9 11.5L13.5 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
    16,
  );
  chevron.setAttribute('class', 'chevron');

  summary.append(when, winnerEl, chevron);
  details.appendChild(summary);

  const body = document.createElement('div');
  body.className = 'session-body';

  const ol = document.createElement('ol');
  ol.className = 'result-list';
  const ordered = [...session.results].sort((a, b) => a.position - b.position);
  const joint = jointPositions(session.results);
  for (const r of ordered) ol.appendChild(resultRow(r, joint.has(r.position), showScores));
  body.appendChild(ol);

  if (session.note) {
    const note = document.createElement('p');
    note.className = 'session-note';
    note.textContent = session.note;
    body.appendChild(note);
  }

  const actions = document.createElement('div');
  actions.className = 'session-actions';
  actions.append(
    iconBtn('edit-session', 'Edit this result', EDIT_PATHS),
    iconBtn('delete-session', 'Delete this result', DELETE_PATHS, 'icon-danger'),
  );
  body.appendChild(actions);

  details.appendChild(body);
  return details;
}

function resultRow(result, joint, showScores) {
  const li = document.createElement('li');
  li.className = 'result-row';
  if (result.position <= 3) li.dataset.position = String(result.position);

  const pos = document.createElement('span');
  pos.className = 'result-pos';
  pos.textContent = placeLabel(result.position, joint);

  const player = playerById(result.playerId);
  const name = document.createElement('span');
  name.className = 'result-name';
  name.textContent = playerName(player);

  li.append(pos, avatarEl(player, 'avatar-sm'), name);

  // A dash rather than a gap where someone in a scored game has no score, so
  // the column still reads as a column.
  if (showScores) {
    const score = document.createElement('span');
    score.className = 'result-score';
    score.textContent = result.score != null ? fmtScore(result.score) : '–';
    if (result.score == null) score.classList.add('result-score-none');
    li.appendChild(score);
  }

  return li;
}
