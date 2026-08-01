"use strict";

/* ==========================================================================
   E1. input: loading a board from a URL (?url=…)

   The only network code in the project. It fetches a board *you* named, and
   nothing else: no analytics, no proxy, no upload. A board opened from disk
   still never leaves the machine.

   The catch is CORS. A cross-origin fetch only works if the host says so, and
   github.com does not — but raw.githubusercontent.com sends
   `access-control-allow-origin: *`, so a GitHub blob URL is rewritten to its
   raw form below. Nothing here sets a request header, because a custom header
   would turn the GET into a preflighted request and raw.githubusercontent.com
   answers OPTIONS with a 403.
   ========================================================================== */

/** github.com/o/r/blob/ref/path → raw.githubusercontent.com/o/r/ref/path.
    A /blob/ URL is an HTML page wrapping the file, so fetching it verbatim
    returns markup; anything not recognised as GitHub is passed through
    untouched and stands or falls on its own CORS headers. */
function rawUrl(input) {
  let u;
  try { u = new URL(String(input).trim(), location.href); }
  catch { throw new Error(input + '\nis not a URL'); }

  if (u.protocol !== 'https:' && u.protocol !== 'http:')
    throw new Error('only http(s) URLs can be loaded, not ' + u.protocol);

  if (u.hostname === 'github.com' || u.hostname === 'www.github.com') {
    // The ref may itself contain slashes (refs/heads/main, or a branch named
    // feature/x), so the tail is taken whole — raw resolves it the same way.
    const m = u.pathname.match(/^\/([^/]+)\/([^/]+)\/(?:blob|raw)\/(.+)$/);
    if (!m) throw new Error(
      'that github.com link is not a file.\nOpen the file itself on GitHub and ' +
      'copy that URL — it has /blob/ in the path.');
    return 'https://raw.githubusercontent.com/' + m[1] + '/' + m[2] + '/' + m[3];
  }
  return u.href;
}

const HTML_START = /^\s*(?:<!doctype html|<html\b)/i;

/** Fetch one URL and hand it back as a File, so everything downstream treats
    it exactly like a dropped file. */
async function fetchBoard(input) {
  const url = rawUrl(input);
  let res;
  try {
    res = await fetch(url, {mode: 'cors', credentials: 'omit', redirect: 'follow'});
  } catch (ex) {
    console.error(ex);
    throw new Error('could not fetch ' + url + '\nThe host has to allow ' +
      'cross-origin reads. GitHub does, via raw.githubusercontent.com.');
  }
  // HTTP/2 has no reason phrase, so statusText is usually empty.
  if (!res.ok) throw new Error(res.status +
    (res.statusText ? ' ' + res.statusText : '') + ' fetching ' + url);

  const buf = await res.arrayBuffer();
  const name = decodeURIComponent(new URL(url).pathname.split('/').pop() || '') ||
               'board';
  if (!looksLikeZip(buf) &&
      HTML_START.test(new TextDecoder().decode(new Uint8Array(buf).subarray(0, 64))))
    throw new Error(url + '\nreturned an HTML page, not a board file.');

  return new File([buf], name);
}

/** Board URLs from the query string. Repeating ?url= loads a loose Gerber set
    the same way dropping several files does. */
function boardUrlsFromQuery() {
  const q = new URLSearchParams(location.search);
  return [...q.getAll('url'), ...q.getAll('board')].filter(Boolean);
}

/** Keep the address bar honest: a board loaded from URLs stays shareable, and
    opening a local file drops the stale ?url=. replaceState throws on a
    file:// origin in some browsers, and this is cosmetic, so it may fail. */
function rememberUrls(urls) {
  try {
    const u = new URL(location.href);
    u.searchParams.delete('url');
    u.searchParams.delete('board');
    for (const v of urls || []) u.searchParams.append('url', v);
    history.replaceState(null, '', u);
  } catch (ex) { /* not worth surfacing */ }
}
