// Virtual per-game links — see /lib/deep-link.js for how they work.
//
// netlify.toml rewrites /family-games straight to this tool's index.html, so a
// link like /family-games?game=<id> never has its id resolved as a path by the
// host.

import { createDeepLink } from '/lib/deep-link.js';
import { getSyncConfig } from './db.js';

export const gameLink = createDeepLink({
  param: 'game',
  pendingKey: 'family-games.pendingGame',
  getConfig: getSyncConfig,
});

export const { setPending: setPendingGame, takePending: takePendingGame } = gameLink;
export const buildGameLink = gameLink.buildLink;
