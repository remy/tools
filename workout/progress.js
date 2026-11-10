// Per-day progress: how many sets of each exercise have been logged today.
//
// Persisted so ticked sets survive reloads and tab switches. There is no
// history — progress is wiped when the day rolls over or the plan changes (see
// db.js), because what matters is finishing today's session, not a record of
// every session ever done.

import { state, todayKey } from './state.js';
import { db } from './db.js';
import { resetRepTimer } from './timers.js';

// Overlay the stored set counts onto the freshly rendered rep panels.
export function applyStoredProgress() {
  if (!state.plan) return;
  state.plan.workouts.forEach((workout, wi) => {
    if (workout.type === 'circuit') return;
    const panel = document.getElementById(`panel-${wi}`);
    if (!panel) return;
    const dayProg = state.progress[workout.docId] || {};
    panel.querySelectorAll('.exercise-row').forEach((row) => {
      const total = parseInt(row.dataset.totalSets, 10);
      const completed = parseInt(dayProg[row.dataset.exerciseId], 10) || 0;
      row.dataset.completedSets = completed;
      const cur = row.querySelector('.ex-sets-current');
      if (cur) cur.textContent = completed;
      row.classList.toggle('done', total > 0 && completed >= total);
    });
    updateDayControls(panel);
  });
}

// Writes in flight, keyed by workout. Tapping through a set of five logs five
// writes in about as many hundred milliseconds, and every PouchDB write has to
// carry the document's current _rev — fire them concurrently and each one reads
// the same _rev, so all but the first are rejected as conflicts and those sets
// are silently lost. Writes are therefore serialised per workout and coalesced:
// state.progress is the source of truth, so a write requested while another is
// in flight just marks the document dirty and the latest state is written once
// the current write lands.
const writing = new Map();

function queueProgressWrite(docId) {
  const entry = writing.get(docId);
  if (entry) {
    entry.dirty = true;
    return;
  }
  const next = { dirty: false };
  writing.set(docId, next);
  (async () => {
    do {
      next.dirty = false;
      await db.putProgress(docId, state.progress[docId], state.planRev, todayKey());
    } while (next.dirty);
  })()
    .catch((err) => console.error('[workout progress]', err))
    .finally(() => writing.delete(docId));
}

// Record the current set count for a rep row and persist it. Deliberately not
// awaited by callers — the tap has already updated the DOM, and waiting on
// IndexedDB before the next tap can register would make logging sets feel slow.
export function recordProgress(row) {
  const wi = parseInt(row.dataset.workoutIndex, 10);
  const workout = state.plan?.workouts?.[wi];
  if (!workout || workout.type === 'circuit') return;
  const exerciseId = row.dataset.exerciseId;
  const completed = parseInt(row.dataset.completedSets, 10) || 0;
  const day = state.progress[workout.docId] || (state.progress[workout.docId] = {});
  if (completed > 0) day[exerciseId] = completed;
  else delete day[exerciseId];
  if (!Object.keys(day).length) delete state.progress[workout.docId];
  queueProgressWrite(workout.docId);
}

// Show/label the reset button: hidden until the day has any progress, and
// promoted to a "day complete" state once every exercise is done.
export function updateDayControls(panel) {
  const btn = panel.querySelector('.day-reset');
  if (!btn) return;
  const rows = [...panel.querySelectorAll('.exercise-row')];
  const anyProgress = rows.some((r) => (parseInt(r.dataset.completedSets, 10) || 0) > 0 || r.classList.contains('done'));
  const allDone = rows.length > 0 && rows.every((r) => r.classList.contains('done'));
  btn.hidden = !anyProgress;
  btn.classList.toggle('complete', allDone);
  btn.textContent = allDone ? 'Day complete · Clear' : 'Reset day';
}

// Wipe the active day's progress back to zero.
export function clearDay(panel) {
  const first = panel.querySelector('.exercise-row');
  const wi = first ? parseInt(first.dataset.workoutIndex, 10) : -1;
  const workout = state.plan?.workouts?.[wi];
  panel.querySelectorAll('.exercise-row').forEach((row) => {
    row.classList.remove('done');
    row.dataset.completedSets = 0;
    const cur = row.querySelector('.ex-sets-current');
    if (cur) cur.textContent = '0';
  });
  if (workout) {
    // Through the same queue as recordProgress: clearing while a tap's write is
    // still in flight would otherwise race it and the document could come back.
    delete state.progress[workout.docId];
    queueProgressWrite(workout.docId);
  }
  resetRepTimer();
  updateDayControls(panel);
}
