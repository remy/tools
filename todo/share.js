// Virtual per-list links — see /lib/deep-link.js for how they work.
//
// netlify.toml rewrites /todo straight to this tool's index.html, so a link
// like /todo?list=<id> never has its id resolved as a path by the host.

import { createDeepLink } from '/lib/deep-link.js';
import { getSyncConfig } from './db.js';

export const listLink = createDeepLink({
  param: 'list',
  pendingKey: 'todo-lists.pendingList',
  getConfig: getSyncConfig,
});

export const { setPending: setPendingList, takePending: takePendingList } = listLink;
export const buildListLink = listLink.buildLink;
