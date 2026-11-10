import { state, gameById } from './state.js';
import { db } from './db.js';
import { render } from './render.js';
import { fmtDate } from './ui.js';
import { pushGame, popHome, replaceHome } from './nav.js';

// Pull everything into state and paint. The active view ('home' vs 'game') is
// preserved so a background sync never yanks anyone out of the game they're
// looking at.
export async function refreshAll() {
  state.players = await db.getPlayers();
  state.games = await db.getGames();
  state.sessions = await db.getSessions();

  // The open game may have gone (deleted here, or on another device mid-sync),
  // in which case its history entry has nothing behind it either.
  if (state.currentGameId && !gameById(state.currentGameId)) {
    replaceHome();
    showGame(null);
    return;
  }
  render();
}

// Swap the view and paint it. History is left alone — this is what a popped
// entry applies, so it must not push one of its own.
export function showGame(id) {
  const game = id ? gameById(id) : null;
  state.currentGameId = game ? game.id : null;
  state.view = game ? 'game' : 'home';
  render();
}

export function selectGame(id) {
  showGame(id);
  if (state.view === 'game') pushGame(state.currentGameId);
}

export function goHome() {
  // Stepping back repaints via popstate; only the fallback paints here.
  if (!popHome()) showGame(null);
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
  // refreshAll drops the view (and its history entry) once the game is gone.
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
