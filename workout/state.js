// ── Constants ──
export const DB_NAME = 'workout';

// ID prefixes for the single PouchDB datastore. The plan and the day's progress
// live in one DB so a single replication stream keeps everything in sync.
export const WORKOUT_PREFIX = 'workout:';
export const PROGRESS_PREFIX = 'progress:';
export const PLAN_META_ID = 'plan-meta';

// Marks progress recorded against the built-in plan, which has no stored
// revision of its own (see db.js).
export const DEFAULT_REV = 'default';

// ── Mutable application state ──
// All modules import this same object reference.
export const state = {
  // { workouts: [{ docId, id, label, focus, order, type?, cardio?, exercises }] }
  plan: null,
  // Revision of the plan the loaded progress belongs to; progress recorded
  // against an older revision is discarded (see progress.js).
  planRev: DEFAULT_REV,
  // docId -> { [exerciseId]: completedSets } for today only.
  progress: {},
};

export function workoutByIndex(index) {
  return state.plan?.workouts?.[index] ?? null;
}

// Local calendar date as YYYY-MM-DD — a workout belongs to the day it was done,
// not to an instant, so no timezone travels with it.
export function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
