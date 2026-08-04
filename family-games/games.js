import { state, gameById } from './state.js';
import { db } from './db.js';
import { render } from './render.js';
import { fmtDate } from './ui.js';

// Pull everything into state and paint. The active view ('home' vs 'game') is
// preserved so a background sync never yanks anyone out of the game they're
// looking at.
export async function refreshAll() {
  state.players = await db.getPlayers();
  state.games = await db.getGames();
  state.sessions = await db.getSessions();

  if (state.currentGameId && !gameById(state.currentGameId)) {
    state.currentGameId = null;
    state.view = 'home';
  }
  render();
}

export function selectGame(id) {
  state.currentGameId = id;
  state.view = 'game';
  render();
}

export function goHome() {
  state.view = 'home';
  state.currentGameId = null;
  render();
}

// Create a game, or return the existing one when the title is already in use —
// re-typing "Poker" should land on the same history, not fork a second one.
export async function ensureGame(title) {
  const trimmed = title.trim();
  const existing = state.games.find(
    (g) => g.title.toLowerCase() === trimmed.toLowerCase(),
  );
  if (existing) return existing.id;

  const id = crypto.randomUUID();
  await db.putGame({ id, title: trimmed, createdAt: Date.now() });
  state.games = await db.getGames();
  return id;
}

export async function renameGame(id) {
  const game = gameById(id);
  if (!game) return;
  const title = prompt('Rename game', game.title);
  if (title == null) return;
  const trimmed = title.trim();
  if (!trimmed || trimmed === game.title) return;
  await db.putGame({ ...game, title: trimmed });
  state.games = await db.getGames();
  render();
}

export async function deleteGame(id) {
  const game = gameById(id);
  if (!game) return;
  const plays = state.sessions.filter((s) => s.gameId === id).length;
  const detail = plays
    ? ` and all ${plays} recorded result${plays === 1 ? '' : 's'}`
    : '';
  if (!confirm(`Delete "${game.title}"${detail}? This cannot be undone.`)) return;
  await db.deleteGame(id);
  if (state.currentGameId === id) {
    state.currentGameId = null;
    state.view = 'home';
  }
  await refreshAll();
}

// Remove a single recorded result, straight from the history list.
export async function deleteSession(id) {
  const session = state.sessions.find((s) => s.id === id);
  if (!session) return;
  if (!confirm(`Delete the result from ${fmtDate(session.date)}? This cannot be undone.`)) return;
  await db.deleteSession(session.gameId, session.id);
  await refreshAll();
}
