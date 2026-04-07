// =============================================
// Cook Planner — state.js
// =============================================

import { DEFAULT_STATE } from './constants.js';

export let state = { ...DEFAULT_STATE, items: [] };

export function encodeState(s) {
  try { return btoa(encodeURIComponent(JSON.stringify(s))); }
  catch { return ''; }
}

export function decodeState(encoded) {
  try { return JSON.parse(decodeURIComponent(atob(encoded))); }
  catch { return null; }
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
