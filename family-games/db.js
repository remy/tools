import {
  DB_NAME,
  PLAYER_PREFIX,
  GAME_PREFIX,
  SESSION_PREFIX,
} from './state.js';
import { PouchStore } from '/lib/pouch-store.js';
import { createSyncConfig, encodeSyncConfig, SHARE_PARAM } from '/lib/sync-config.js';

// `legacyPrefix` names the flat localStorage keys this tool used before the
// shared store existed, so an install configured by the old code keeps syncing.
const { getSyncConfig, setSyncConfig } = createSyncConfig({
  key: 'family-games',
  legacyPrefix: 'family-games',
});

export { getSyncConfig, setSyncConfig, encodeSyncConfig, SHARE_PARAM };

// ── Document <-> model mappers ──
function playerToDoc(player) {
  return {
    _id: PLAYER_PREFIX + player.id,
    type: 'player',
    id: player.id,
    name: player.name,
    emoji: player.emoji || '',
    colour: player.colour || '',
    // A thumbnail-sized JPEG data URL (see photo.js) — small enough to ride
    // along in the document rather than as an attachment.
    photo: player.photo || '',
    // Archived players keep their history but disappear from the picker.
    archived: !!player.archived,
    order: player.order ?? 0,
    createdAt: player.createdAt ?? Date.now(),
  };
}

function playerFromDoc(doc) {
  return {
    id: doc.id ?? doc._id.slice(PLAYER_PREFIX.length),
    name: doc.name,
    emoji: doc.emoji || '',
    colour: doc.colour || '',
    photo: doc.photo || '',
    archived: !!doc.archived,
    order: doc.order ?? 0,
    createdAt: doc.createdAt ?? 0,
  };
}

function gameToDoc(game) {
  return {
    _id: GAME_PREFIX + game.id,
    type: 'game',
    id: game.id,
    title: game.title,
    createdAt: game.createdAt ?? Date.now(),
  };
}

function gameFromDoc(doc) {
  return {
    id: doc.id ?? doc._id.slice(GAME_PREFIX.length),
    title: doc.title,
    createdAt: doc.createdAt ?? 0,
  };
}

// The rounds behind a result. A score saved before rounds existed is the one
// round it was entered as, so an old result can still be added to.
function roundsOf(result) {
  const rounds = Array.isArray(result.rounds) ? result.rounds.filter(Number.isFinite) : [];
  if (rounds.length) return rounds;
  return Number.isFinite(result.score) ? [result.score] : [];
}

// Sessions are keyed by game so one game's history is a single range scan.
function sessionDocId(session) {
  return `${SESSION_PREFIX}${session.gameId}:${session.id}`;
}

function sessionToDoc(session) {
  return {
    _id: sessionDocId(session),
    type: 'session',
    id: session.id,
    gameId: session.gameId,
    // Local calendar date as YYYY-MM-DD — a game night belongs to the day it
    // was played, not to an instant, so no timezone travels with it.
    date: session.date,
    // `rounds` is how a score was built up — one number per hand, leg or leg
    // of a night — and `score` is their sum, kept alongside because every
    // reader wants the total. `score` is optional: plenty of games only have a
    // finishing order, and a score of 0 is a real result, so "no score" has to
    // be null rather than 0.
    results: (session.results || []).map((r) => {
      const rounds = roundsOf(r);
      return {
        playerId: r.playerId,
        position: r.position,
        rounds,
        score: rounds.length ? rounds.reduce((a, b) => a + b, 0) : null,
      };
    }),
    note: session.note || '',
    createdAt: session.createdAt ?? Date.now(),
    updatedAt: Date.now(),
  };
}

function sessionFromDoc(doc) {
  return {
    id: doc.id,
    gameId: doc.gameId,
    date: doc.date,
    // Results recorded before scores existed have no `score` field at all,
    // and results from before scores were totted up round by round have no
    // `rounds`. Both are normalised here and nothing downstream has to care.
    results: (Array.isArray(doc.results) ? doc.results : []).map((r) => {
      const rounds = roundsOf(r);
      return {
        playerId: r.playerId,
        position: r.position,
        rounds,
        score: rounds.length ? rounds.reduce((a, b) => a + b, 0) : null,
      };
    }),
    note: doc.note || '',
    createdAt: doc.createdAt ?? 0,
    updatedAt: doc.updatedAt ?? 0,
  };
}

// Players, games and sessions all live in one PouchDB so a single replication
// stream keeps everything in sync. The connection lifecycle, status reporting
// and manual sync operations all come from PouchStore — only the mappers above
// and the queries below are specific to this tool.
class GamesDB extends PouchStore {
  constructor() {
    super({
      dbName: DB_NAME,
      label: 'family-games',
      prefixes: [PLAYER_PREFIX, GAME_PREFIX, SESSION_PREFIX],
      getConfig: getSyncConfig,
    });
  }

  // ── Players ──
  getPlayers() {
    return this.getRange(
      PLAYER_PREFIX,
      playerFromDoc,
      (a, b) => (a.order - b.order) || (a.createdAt - b.createdAt),
    );
  }

  async putPlayer(player) {
    await this.putWithRev(playerToDoc(player));
  }

  async deletePlayer(id) {
    await this.removeById(PLAYER_PREFIX + id);
  }

  // ── Games ──
  getGames() {
    return this.getRange(GAME_PREFIX, gameFromDoc, (a, b) => a.title.localeCompare(b.title));
  }

  async putGame(game) {
    await this.putWithRev(gameToDoc(game));
  }

  async deleteGame(id) {
    const db = await this.open();
    // Remove the game doc and every result recorded against it.
    const deletes = await this.deletionsForRange(`${SESSION_PREFIX}${id}:`);
    try {
      const existing = await db.get(GAME_PREFIX + id);
      deletes.push({ _id: existing._id, _rev: existing._rev, _deleted: true });
    } catch (err) {
      if (err.status !== 404) throw err;
    }
    if (deletes.length) await db.bulkDocs(deletes);
  }

  // ── Sessions (one recorded play of a game) ──
  // Every session in one scan: a family's history is small, and the home page
  // needs totals across all games anyway.
  getSessions() {
    // Newest first: by the date played, then by when it was entered so two
    // games on the same evening keep the order they were recorded in.
    return this.getRange(
      SESSION_PREFIX,
      sessionFromDoc,
      (a, b) => b.date.localeCompare(a.date) || (b.createdAt - a.createdAt),
    );
  }

  async putSession(session) {
    await this.putWithRev(sessionToDoc(session));
  }

  async deleteSession(gameId, id) {
    await this.removeById(`${SESSION_PREFIX}${gameId}:${id}`);
  }
}

export const db = new GamesDB();
