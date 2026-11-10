// ── Back-button navigation ──
// The app is one page with two views, so without a history entry per view the
// device back button (or a back gesture) leaves the app altogether instead of
// returning to the game list. Opening a game pushes an entry carrying
// ?game=<id> — the same link share.js builds — so a reload or a bookmark comes
// back to the game that was open.
//
// Dialogs are left alone: a modal <dialog> is a close request of its own, and
// the browser closes the topmost one on a back signal rather than navigating.

const homeUrl = () => location.pathname + location.hash;
const gameUrl = (id) => `${location.pathname}?game=${encodeURIComponent(id)}${location.hash}`;

// Show a view without touching history — how a popped entry is applied.
let show = () => {};

export function initNav(handler) {
  show = handler;
  // Whatever the app booted on becomes the home entry, so there is always
  // somewhere in-app for the first back to land.
  history.replaceState({ gameId: null }, '', homeUrl());
  window.addEventListener('popstate', (e) => {
    // A dialog left open would sit over the view we just landed on. On a phone
    // this rarely runs: a back signal there closes the top dialog instead of
    // navigating, which is exactly the wanted behaviour.
    for (const dlg of document.querySelectorAll('dialog[open]')) dlg.close();
    show(e.state?.gameId || null);
  });
}

export function pushGame(id) {
  history.pushState({ gameId: id }, '', gameUrl(id));
}

// Leaving a game by the header's back button. Stepping back through the entry
// we pushed keeps the stack honest — home > game > home would otherwise need
// two taps of the device back button to escape. Returns false when there is no
// entry of ours to step back through, leaving the caller to swap the view.
export function popHome() {
  if (!history.state?.gameId) return false;
  history.back();
  return true;
}

// Home, in place: for a game that is no longer there to go back to.
export function replaceHome() {
  history.replaceState({ gameId: null }, '', homeUrl());
}
