// ── Constants ──
export const DB_NAME = 'family-games';

// ID prefixes for the single PouchDB datastore. Players, games and the
// individual results all live in one DB so a single replication stream keeps
// everything in sync.
export const PLAYER_PREFIX = 'player:';
export const GAME_PREFIX = 'game:';
export const SESSION_PREFIX = 'session:';

// ── Mutable application state ──
// All modules import this same object reference.
export const state = {
  players: [],        // [{ id, name, emoji, colour, archived, order, createdAt }]
  games: [],          // [{ id, title, createdAt }]
  sessions: [],       // every recorded result, newest first: { id, gameId, date, results: [{ playerId, position, rounds, score }] }
  currentGameId: null,
  view: 'home',       // 'home' (all games) | 'game' (one game's standings + history)
};

// The players available when recording a result — archived players stay in the
// history but drop out of the picker.
export function activePlayers() {
  return state.players.filter((p) => !p.archived);
}

export function playerById(id) {
  return state.players.find((p) => p.id === id) || null;
}

export function gameById(id) {
  return state.games.find((g) => g.id === id) || null;
}
