// Virtual per-list links.
//
// A list has no page of its own — it's a document in a local PouchDB — so a
// shareable link is "virtual": the id travels in the query string and the app
// opens that list on boot. Keeping it in the query (rather than a path segment
// like /todo/<id>) means no server-side routing is involved; netlify.toml
// rewrites /todo straight to the tool's index.html so the host never tries to
// resolve the id as a page.

import { getSyncConfig, encodeSyncConfig, SHARE_PARAM } from './db.js';

export const LIST_PARAM = 'list';

// The target list is stashed in sessionStorage rather than a module variable
// because a link that also carries ?sync= reloads the page (see main.js) to
// boot with the new config applied — the id has to survive that reload.
const PENDING_KEY = 'todo-lists.pendingList';

export function setPendingList(id) {
  try {
    sessionStorage.setItem(PENDING_KEY, id);
  } catch {
    // Private-mode storage failures just mean the deep link is a no-op.
  }
}

export function takePendingList() {
  try {
    const id = sessionStorage.getItem(PENDING_KEY);
    sessionStorage.removeItem(PENDING_KEY);
    return id;
  } catch {
    return null;
  }
}

// Build the link to a list. With `includeSync` the current sync config rides
// along too, so a recipient who has never seen this data gets configured for
// the server and lands on the list in one step — at the cost of handing over
// the server credentials, hence the separate opt-in.
export function buildListLink(listId, { includeSync = false } = {}) {
  const params = new URLSearchParams();
  params.set(LIST_PARAM, listId);
  if (includeSync) {
    const cfg = getSyncConfig();
    if (cfg.url) params.set(SHARE_PARAM, encodeSyncConfig(cfg));
  }
  return `${location.origin}${location.pathname}?${params}`;
}
