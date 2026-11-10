import { state } from './state.js';

// Every recorded play of one game, still newest-first (state.sessions is
// already sorted that way by the DB layer).
export function sessionsFor(gameId) {
  return state.sessions.filter((s) => s.gameId === gameId);
}

// Aggregate a set of sessions into a per-player table.
//
// `sessions` must be newest-first — `last` is taken from the first session a
// player appears in. Ranking is wins first (that's what everyone argues
// about), then average finishing position, then who has turned up most.
export function standings(sessions) {
  const byPlayer = new Map();

  for (const session of sessions) {
    const field = session.results.length;
    for (const r of session.results) {
      let row = byPlayer.get(r.playerId);
      if (!row) {
        row = {
          playerId: r.playerId,
          plays: 0,
          wins: 0,
          podiums: 0,
          total: 0,
          best: Infinity,
          last: r.position,
          lastDate: session.date,
          scored: 0,
          scoreTotal: 0,
          bestScore: null,
        };
        byPlayer.set(r.playerId, row);
      }
      row.plays += 1;
      row.total += r.position;
      if (r.position === 1) row.wins += 1;
      // A podium only means something once there are more than three playing.
      if (r.position <= 3 && field > 3) row.podiums += 1;
      row.best = Math.min(row.best, r.position);
      // Scores are optional, so they're averaged over the games that had one
      // rather than over every play.
      if (r.score != null) {
        row.scored += 1;
        row.scoreTotal += r.score;
        row.bestScore = row.bestScore == null ? r.score : Math.max(row.bestScore, r.score);
      }
    }
  }

  const rows = [...byPlayer.values()].map((row) => ({
    ...row,
    avg: row.total / row.plays,
    winRate: row.wins / row.plays,
    avgScore: row.scored ? row.scoreTotal / row.scored : null,
  }));
  rows.sort(byStanding);
  return rows;
}

// The order the standings table is built in — exported so the table can tell
// two rows apart from two rows that are genuinely level.
export function byStanding(a, b) {
  return (b.wins - a.wins) || (a.avg - b.avg) || (b.plays - a.plays);
}

// The positions two or more players share in one result — a joint 1st reads
// "=1st" rather than pretending someone edged it.
export function jointPositions(results) {
  const seen = new Set();
  const joint = new Set();
  for (const r of results) {
    if (seen.has(r.position)) joint.add(r.position);
    else seen.add(r.position);
  }
  return joint;
}

// Everyone who came 1st — more than one when the game was drawn.
export function winnersOf(session) {
  return session.results.filter((r) => r.position === 1);
}

// Whether this game is one we keep score in — drives whether the score
// columns are worth the space.
export function hasScores(sessions) {
  return sessions.some((s) => s.results.some((r) => r.score != null));
}

// Scores can be anything from 7 to 12.5 to -3, so they're formatted for
// display rather than printed raw.
export function fmtScore(value) {
  if (value == null) return '';
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

// Headline numbers for a game's row on the landing page.
export function gameSummary(gameId) {
  const sessions = sessionsFor(gameId);
  const latest = sessions[0] || null;
  return {
    plays: sessions.length,
    lastDate: latest ? latest.date : null,
    lastWinnerIds: latest ? winnersOf(latest).map((r) => r.playerId) : [],
  };
}

// Whoever has the most wins across a game, used for the "champion" badge.
// A shared lead is a shared title, so this is a list rather than one player.
export function champions(gameId) {
  const rows = standings(sessionsFor(gameId));
  const top = rows[0];
  if (!top || !top.wins) return [];
  return rows.filter((r) => r.wins === top.wins);
}
