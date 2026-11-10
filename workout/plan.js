// Loading and saving the plan, keeping the day's progress consistent with it.

import { state, todayKey, DEFAULT_REV } from './state.js';
import { db, normalisePlan } from './db.js';

// The stored plan if one has been imported, otherwise the built-in
// workouts.json. The built-in plan is normalised with stable ids so it produces
// the same exercise ids on every load — progress is keyed by those ids and has
// to survive a reload.
export async function loadPlan() {
  const stored = await db.getPlan();
  if (stored) {
    state.plan = stored;
    state.planRev = await db.getPlanRev();
  } else {
    const response = await fetch('workouts.json');
    state.plan = normalisePlan(await response.json(), { stable: true });
    state.planRev = DEFAULT_REV;
  }
  state.progress = await db.getProgress(state.planRev, todayKey());
  return state.plan;
}

// Write the in-memory plan back and wipe the day's progress.
//
// Any edit to the plan invalidates progress: sets logged against an exercise
// list that has since changed no longer mean anything. Stamping a fresh
// revision is what makes that work across devices too — a plan edit synced from
// elsewhere leaves this device's progress carrying an older revision, and
// getProgress discards it on the next load.
export async function persistPlan() {
  state.planRev = await db.savePlan(state.plan);
  await db.clearAllProgress();
  state.progress = {};
}
