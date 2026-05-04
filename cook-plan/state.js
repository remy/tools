// =============================================
// Cook Planner — state.js
// =============================================

import { DEFAULT_STATE } from './constants.js';

export let state = { ...DEFAULT_STATE, items: [] };

// =============================================
// Compact serialization
//
// Two layers of compression keep shareable URL hashes short and readable:
// 1. KEYS: every JSON key is the first letter of its property name. Where two
//    properties share an initial we fall back to two letters (cookType/cookTime
//    → ct/co; shelfSlots/setTime → sh/se; hasCombi/hobCount → ha/ho).
// 2. VALUES: anything equal to its default — null, 0, the documented default
//    string — is omitted on encode and refilled on decode.
//
// The JSON is written into the hash directly (no base64). Browsers will
// percent-encode `"` in the URL bar, but `location.hash` round-trips cleanly
// and the form is human-readable. Two legacy base64 formats are still decoded.
// =============================================

const APP_DEFAULTS = { mainOvenShelves: 2, hasCombi: true, hobCount: 5 };

// ---- v2 compact (current) ---------------------------------------------------

function compactItem(item) {
  const out = { i: item.id, n: item.name };
  if (item.cookType && item.cookType !== 'oven') out.ct = item.cookType;
  if (item.shelfSlots && item.shelfSlots !== 1) out.sh = item.shelfSlots;
  if (item.appliancePref && item.appliancePref !== 'auto') out.a = item.appliancePref;
  if (item.prepTime) out.p = item.prepTime;
  if (item.cookTime) out.co = item.cookTime;
  if (item.setTime) out.se = item.setTime;
  if (item.overrideCookStart) out.o = item.overrideCookStart;
  return out;
}

function expandItem(c) {
  return {
    id: c.i,
    name: c.n,
    cookType: c.ct || 'oven',
    shelfSlots: c.sh ?? 1,
    appliancePref: c.a || 'auto',
    prepTime: c.p || 0,
    cookTime: c.co || 0,
    setTime: c.se || 0,
    overrideCookStart: c.o ?? null,
  };
}

function compactState(s) {
  const c = {};
  if (s.view === 'schedule') c.v = 's';
  if (s.mode === 'start') c.m = 's';
  if (s.targetTime && s.targetTime !== '17:00') c.t = s.targetTime;
  if (s.snapMins) c.s = s.snapMins;

  const a = s.appliances || APP_DEFAULTS;
  const ac = {};
  if (a.mainOvenShelves !== APP_DEFAULTS.mainOvenShelves) ac.m = a.mainOvenShelves;
  if (a.hasCombi !== APP_DEFAULTS.hasCombi) ac.ha = a.hasCombi;
  if (a.hobCount !== APP_DEFAULTS.hobCount) ac.ho = a.hobCount;
  if (Object.keys(ac).length) c.a = ac;

  c.i = (s.items || []).map(compactItem);
  return c;
}

function expandState(c) {
  return {
    view: c.v === 's' ? 'schedule' : 'input',
    mode: c.m === 's' ? 'start' : 'end',
    targetTime: c.t || '17:00',
    snapMins: c.s || 0,
    appliances: {
      mainOvenShelves: c.a?.m ?? APP_DEFAULTS.mainOvenShelves,
      hasCombi: c.a?.ha ?? APP_DEFAULTS.hasCombi,
      hobCount: c.a?.ho ?? APP_DEFAULTS.hobCount,
    },
    items: (c.i || []).map(expandItem),
  };
}

// ---- v1 compact (legacy: t/s/c/r/h keys) ------------------------------------

function expandItemV1(c) {
  return {
    id: c.i,
    name: c.n,
    cookType: c.t || 'oven',
    shelfSlots: c.s ?? 1,
    appliancePref: c.a || 'auto',
    prepTime: c.p || 0,
    cookTime: c.c || 0,
    setTime: c.r || 0,
    overrideCookStart: c.o ?? null,
  };
}

function expandStateV1(c) {
  return {
    view: c.v === 's' ? 'schedule' : 'input',
    mode: c.m === 's' ? 'start' : 'end',
    targetTime: c.t || '17:00',
    snapMins: c.s || 0,
    appliances: {
      mainOvenShelves: c.a?.o ?? APP_DEFAULTS.mainOvenShelves,
      hasCombi: c.a?.c ?? APP_DEFAULTS.hasCombi,
      hobCount: c.a?.h ?? APP_DEFAULTS.hobCount,
    },
    items: (c.i || []).map(expandItemV1),
  };
}

// ---- public API -------------------------------------------------------------

export function encodeState(s) {
  try { return JSON.stringify(compactState(s)); }
  catch { return ''; }
}

// Decoder handles, in order:
//   1. raw or partially URL-encoded JSON (current format) -- detected by `{`
//   2. base64 of UTF-8 JSON                               -- v2 legacy
//   3. base64 of fully percent-encoded JSON               -- v1/v0 legacy
// plus the verbose pre-compact form ({"view":...,"items":...}).
export function decodeState(encoded) {
  if (!encoded) return null;

  // JSON form. The browser percent-encodes `"` but leaves `{`, `,`, `:`, `[`, `]`
  // alone in URL fragments, so `location.hash` round-trips look like
  // `{%22v%22:%22s%22,...}`. Decode any percent-escapes before parsing.
  if (encoded.includes('{')) {
    let json = encoded;
    if (json.includes('%')) {
      try { json = decodeURIComponent(json); } catch { return null; }
    }
    try {
      const decoded = JSON.parse(json);
      if ('view' in decoded || 'items' in decoded) return decoded;
      return expandState(decoded);
    } catch { return null; }
  }

  // Legacy base64 paths (no literal `{` in the string -- it's pure base64).
  let bin;
  try { bin = atob(encoded); } catch { return null; }

  if (bin.startsWith('{')) {
    try {
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const decoded = JSON.parse(new TextDecoder().decode(bytes));
      if ('view' in decoded || 'items' in decoded) return decoded;
      return expandState(decoded);
    } catch { return null; }
  }

  try {
    const decoded = JSON.parse(decodeURIComponent(bin));
    if ('view' in decoded || 'items' in decoded) return decoded;
    return expandStateV1(decoded);
  } catch { return null; }
}

export function saveState() {
  const encoded = encodeState(state);
  localStorage.setItem('cookplan_state', encoded);
  const url = new URL(location.href);
  url.hash = 'state=' + encoded;
  history.replaceState(null, '', url.toString());
}

export function loadState() {
  // Try URL hash first
  const hash = location.hash.replace('#', '');
  if (hash.startsWith('state=')) {
    const decoded = decodeState(hash.slice(6));
    if (decoded) return decoded;
  }
  // Fall back to localStorage
  const stored = localStorage.getItem('cookplan_state');
  if (stored) {
    const decoded = decodeState(stored);
    if (decoded) return decoded;
  }
  return null;
}

export function resetState() {
  _setState({ ...DEFAULT_STATE, items: [] });
  saveState();
}

// Internal helper to reassign the module-level state reference.
// Other modules hold an import binding to `state`, so reassigning
// via this function (which is also used by main.js during init)
// keeps everyone in sync.
export function _setState(newState) {
  state = newState;
}
