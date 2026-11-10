// =============================================
// Cook Planner — state.js
//
// `state` is the in-memory model every render reads synchronously. PouchDB is
// where it lives between visits: each mutation is followed by a save of just
// the document that changed, and a change arriving from the server reloads the
// whole thing (see sync.js).
// =============================================

import { DEFAULT_STATE } from './constants.js';
import { db } from './db.js';

export let state = { ...DEFAULT_STATE, items: [] };

// Internal helper to reassign the module-level state reference.
// Other modules hold an import binding to `state`, so reassigning
// via this function keeps everyone in sync.
export function _setState(newState) {
  state = newState;
}

// ── View: device-local, deliberately not synced ──
// Which view you happen to be looking at is not part of the cook. Syncing it
// would mean opening the schedule on a phone in the kitchen yanked the laptop
// out of the editor mid-edit.
const VIEW_KEY = 'cook-plan.view';

export function setView(view) {
  state.view = view;
  try {
    localStorage.setItem(VIEW_KEY, view);
  } catch {
    // Private-mode storage failures just mean the view isn't remembered.
  }
}

function readView() {
  try {
    return localStorage.getItem(VIEW_KEY) === 'schedule' ? 'schedule' : 'input';
  } catch {
    return 'input';
  }
}

// ── Loading ──

export async function loadFromDb() {
  const [plan, items] = await Promise.all([db.getPlan(), db.getItems()]);
  _setState({ ...DEFAULT_STATE, ...(plan || {}), items, view: readView() });
  return state;
}

// Items are ordered by an explicit field rather than array position, so a new
// one has to be given a place at the end.
export function nextOrder() {
  return state.items.reduce((max, item) => Math.max(max, (item.order ?? 0) + 1), 0);
}

// ── Saving ──
// Writes carry the document's current revision, which means two saves racing on
// the same document would make the second one a 409 — tapping the hob-count
// buttons quickly is enough to cause it. Each document therefore gets its own
// promise chain and writes queue behind it. Failures are logged rather than
// thrown: these are called from event handlers with nowhere to throw to, and
// PouchDB keeps the local write regardless.

const queues = new Map();

function enqueue(key, fn) {
  const next = (queues.get(key) || Promise.resolve())
    .then(fn)
    .catch((err) => console.error('[cook-plan] save failed', err));
  queues.set(key, next);
  return next;
}

export function savePlan() {
  return enqueue('plan', () => db.putPlan(state));
}

export function saveItem(item) {
  return enqueue(item.id, () => db.putItem(item));
}

export function deleteItem(id) {
  return enqueue(id, () => db.deleteItem(id));
}

// Swap in a whole different cook — a JSON import, an incoming share link, or
// starting over. The in-memory state is replaced first so the caller can
// re-render straight away without waiting on the write.
export function replaceAll(incoming) {
  const next = {
    ...DEFAULT_STATE,
    ...incoming,
    items: (incoming.items || []).map((item, i) => ({ ...item, order: i })),
    view: state.view,
  };
  _setState(next);
  return enqueue('plan', () => db.replaceAll({ plan: next, items: next.items }));
}

export function resetState() {
  return replaceAll({ ...DEFAULT_STATE, items: [] });
}
