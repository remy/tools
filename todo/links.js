// URL detection inside item text. Items are plain strings, so links are found
// by scanning rather than stored as structured data — that keeps existing lists
// (and Markdown imports) working with no migration.

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;

// Trailing punctuation usually belongs to the sentence, not the URL:
// "see https://example.com/page." → the full stop is not part of the link.
// A closing bracket is only dropped when it has no matching opener inside the
// match, so "…/wiki/Foo_(bar)" survives intact.
const TRAILING = '.,;:!?’”»';
const PAIRS = { ')': '(', ']': '[', '}': '{' };

function trimTrailing(url) {
  let end = url.length;
  while (end > 0) {
    const ch = url[end - 1];
    if (TRAILING.includes(ch)) { end -= 1; continue; }
    if (PAIRS[ch]) {
      const slice = url.slice(0, end);
      const opens = slice.split(PAIRS[ch]).length - 1;
      const closes = slice.split(ch).length - 1;
      if (closes > opens) { end -= 1; continue; }
    }
    break;
  }
  return url.slice(0, end);
}

// A bare "www.example.com" is a link to a human but not a valid href, so give
// it a scheme. Anything that isn't http(s) after that is rejected — this is the
// single place a URL becomes something the app will navigate to.
function toHref(raw) {
  const candidate = /^www\./i.test(raw) ? `https://${raw}` : raw;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname.includes('.')) return null;
    return url.href;
  } catch {
    return null;
  }
}

// All links in a string, in order: { raw, href, index }.
export function findUrls(text) {
  const found = [];
  if (!text) return found;
  for (const match of text.matchAll(URL_RE)) {
    const raw = trimTrailing(match[0]);
    const href = toHref(raw);
    if (href) found.push({ raw, href, index: match.index });
  }
  return found;
}

export function hasUrl(text) {
  return findUrls(text).length > 0;
}

// A compact, readable form of a URL for a button label — the host plus a
// truncated path, dropping the scheme and any "www." prefix.
export function shortUrl(href) {
  try {
    const url = new URL(href);
    const host = url.hostname.replace(/^www\./, '');
    const rest = `${url.pathname === '/' ? '' : url.pathname}${url.search}`;
    const label = host + rest;
    return label.length > 42 ? `${label.slice(0, 41)}…` : label;
  } catch {
    return href;
  }
}

// Render text with its URLs wrapped in highlight spans. Returns a fragment so
// callers can drop it straight into a node — never HTML, so item text can't
// inject markup.
export function linkify(text, { action } = {}) {
  const frag = document.createDocumentFragment();
  let cursor = 0;
  for (const { raw, href, index } of findUrls(text)) {
    if (index > cursor) frag.append(text.slice(cursor, index));
    const span = document.createElement('span');
    span.className = 'todo-link';
    span.textContent = raw;
    span.dataset.href = href;
    if (action) span.dataset.action = action;
    frag.append(span);
    cursor = index + raw.length;
  }
  if (cursor < text.length) frag.append(text.slice(cursor));
  return frag;
}

// Open in a new tab without handing the opener over to the target page.
export function openUrl(href) {
  window.open(href, '_blank', 'noopener,noreferrer');
}
