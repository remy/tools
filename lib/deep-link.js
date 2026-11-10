// Virtual per-record links, and the boot-time handling of link parameters.
//
// A list (or game, or any other record) has no page of its own — it's a
// document in a local PouchDB — so a shareable link is "virtual": the id
// travels in the query string and the app opens that record on boot. Keeping it
// in the query (rather than a path segment like /todo/<id>) means no
// server-side routing is involved; netlify.toml rewrites the extensionless path
// straight to the tool's index.html so the host never tries to resolve the id
// as a page.

import { SHARE_PARAM, encodeSyncConfig, decodeSyncConfig } from './sync-config.js';

// `param`      query-string key carrying the record id, e.g. 'list'
// `pendingKey` sessionStorage key the id is parked under across a reload
// `getConfig`  () => ({ url, token }), for links that carry sync access
export function createDeepLink({ param, pendingKey, getConfig }) {
  // The target record is stashed in sessionStorage rather than a module
  // variable because a link that also carries ?sync= reloads the page (see
  // consumeLinkParams) to boot with the new config applied — the id has to
  // survive that reload.
  function setPending(id) {
    try {
      sessionStorage.setItem(pendingKey, id);
    } catch {
      // Private-mode storage failures just mean the deep link is a no-op.
    }
  }

  function takePending() {
    try {
      const id = sessionStorage.getItem(pendingKey);
      sessionStorage.removeItem(pendingKey);
      return id;
    } catch {
      return null;
    }
  }

  // Build the link to a record. With `includeSync` the current sync config
  // rides along too, so a recipient who has never seen this data gets
  // configured for the server and lands on the record in one step — at the cost
  // of handing over the server credentials, hence the separate opt-in.
  function buildLink(id, { includeSync = false } = {}) {
    const params = new URLSearchParams();
    params.set(param, id);
    if (includeSync) {
      const cfg = getConfig();
      if (cfg.url) params.set(SHARE_PARAM, encodeSyncConfig(cfg));
    }
    return `${location.origin}${location.pathname}?${params}`;
  }

  return { param, setPending, takePending, buildLink };
}

// Read the link parameters the app understands and clear them from the URL:
//   ?sync=<base64>  a sync config to adopt
//   ?<param>=<id>   a virtual link to a single record (when `deepLink` is given)
// A sync config has to be in place before anything boots, so that case strips
// the query by reloading via location.replace — replace() keeps the
// credential-bearing URL out of history, and the reload means init() runs
// cleanly with the new config already applied. A bare record link needs no
// reload, so the param is simply swapped out with replaceState. Returns true
// when a reload is on its way, so the caller can skip its normal init.
export function consumeLinkParams({ setConfig, deepLink = null }) {
  const params = new URLSearchParams(location.search);
  const enc = params.get(SHARE_PARAM);
  const recordId = deepLink ? params.get(deepLink.param) : null;
  if (!enc && !recordId) return false;

  // Stashed in sessionStorage so it survives the reload below when one link
  // carries both parameters.
  if (recordId) deepLink.setPending(recordId);

  const clean = location.origin + location.pathname + location.hash;
  if (!enc) {
    history.replaceState(null, '', clean);
    return false;
  }

  try {
    const cfg = decodeSyncConfig(enc);
    if (cfg.url) setConfig(cfg);
  } catch (err) {
    console.error('Ignoring invalid sync share link', err);
  }
  // Always drop the param, even on a bad link, so it can't linger or re-apply.
  location.replace(clean);
  return true;
}
