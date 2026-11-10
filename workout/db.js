import {
  DB_NAME,
  WORKOUT_PREFIX,
  PROGRESS_PREFIX,
  PLAN_META_ID,
  DEFAULT_REV,
} from './state.js';
import { PouchStore } from '/lib/pouch-store.js';
import { createSyncConfig, encodeSyncConfig, SHARE_PARAM } from '/lib/sync-config.js';

// This tool stored its data in a bespoke IndexedDB wrapper before PouchDB, and
// never had a sync config, so there are no legacy keys to fall back to.
const { getSyncConfig, setSyncConfig } = createSyncConfig({ key: 'workout' });

export { getSyncConfig, setSyncConfig, encodeSyncConfig, SHARE_PARAM };

// ── Document <-> model mappers ──
//
// One document per workout day rather than a single blob for the whole plan:
// two devices editing different days would otherwise collide on one document
// and PouchDB would silently pick a winner, losing an edit.
//
// The uploaded JSON marks a circuit workout with `type: "circuit"`, which would
// collide with the document-type field every other doc in this database uses.
// It is stored as `mode` and mapped back on the way out, so workouts.json and
// PROMPT.md stay valid unchanged.
function workoutToDoc(workout) {
  const doc = {
    _id: WORKOUT_PREFIX + workout.docId,
    type: 'workout',
    docId: workout.docId,
    id: workout.id,
    label: workout.label,
    focus: workout.focus,
    order: workout.order ?? 0,
    exercises: (workout.exercises || []).map((ex) => ({
      id: ex.id,
      name: ex.name,
      sets: ex.sets ?? '',
      reps: ex.reps ?? '',
    })),
  };
  if (workout.type === 'circuit') doc.mode = 'circuit';
  if (workout.rounds != null) doc.rounds = workout.rounds;
  if (workout.cardio) doc.cardio = { ...workout.cardio };
  return doc;
}

function workoutFromDoc(doc) {
  const workout = {
    docId: doc.docId ?? doc._id.slice(WORKOUT_PREFIX.length),
    id: doc.id,
    label: doc.label,
    focus: doc.focus,
    order: doc.order ?? 0,
    exercises: (Array.isArray(doc.exercises) ? doc.exercises : []).map((ex) => ({
      id: ex.id,
      name: ex.name,
      sets: ex.sets ?? '',
      reps: ex.reps ?? '',
    })),
  };
  if (doc.mode === 'circuit') workout.type = 'circuit';
  if (doc.rounds != null) workout.rounds = doc.rounds;
  if (doc.cardio) workout.cardio = { ...doc.cardio };
  return workout;
}

// Give every workout and exercise a stable id. Progress is keyed by exercise id
// rather than array position, so reordering or deleting an exercise in the
// manage page can't silently reattach recorded sets to the wrong one.
//
// `stable` derives ids deterministically from the workout id and position,
// which is what the built-in plan needs: it is re-read from workouts.json on
// every load and has to produce the same ids each time.
export function normalisePlan(data, { stable = false } = {}) {
  const workouts = (data?.workouts || []).map((w, wi) => ({
    ...w,
    docId: w.docId || (stable ? `default-${w.id}-${wi}` : crypto.randomUUID()),
    order: wi,
    exercises: (w.exercises || []).map((ex, ei) => ({
      ...ex,
      id: ex.id || (stable ? `default-${w.id}-${wi}-${ei}` : crypto.randomUUID()),
    })),
  }));
  return { workouts };
}

// Strip the internal ids back out, so a downloaded file matches the schema in
// PROMPT.md and can be handed to anyone.
export function planToJson(plan) {
  return {
    workouts: (plan?.workouts || []).map((w) => {
      const out = { id: w.id, label: w.label, focus: w.focus };
      if (w.type === 'circuit') out.type = 'circuit';
      if (w.rounds != null) out.rounds = w.rounds;
      out.exercises = (w.exercises || []).map((ex) => {
        const e = { name: ex.name };
        if (w.type !== 'circuit') {
          e.sets = ex.sets;
          e.reps = ex.reps;
        }
        return e;
      });
      if (w.cardio) out.cardio = { ...w.cardio };
      return out;
    }),
  };
}

class WorkoutDB extends PouchStore {
  constructor() {
    super({
      dbName: DB_NAME,
      label: 'workout',
      prefixes: [WORKOUT_PREFIX],
      getConfig: getSyncConfig,
    });
  }

  // ── Plan ──

  // The stored plan, or null when none has been imported and the built-in
  // workouts.json is still in use.
  async getPlan() {
    const workouts = await this.getRange(
      WORKOUT_PREFIX,
      workoutFromDoc,
      (a, b) => a.order - b.order,
    );
    return workouts.length ? { workouts } : null;
  }

  // Revision of the stored plan. Progress documents carry this so a plan edit —
  // including one arriving from another device — invalidates them.
  async getPlanRev() {
    const db = await this.open();
    try {
      const doc = await db.get(PLAN_META_ID);
      return doc.rev ?? DEFAULT_REV;
    } catch (err) {
      if (err.status === 404) return DEFAULT_REV;
      throw err;
    }
  }

  // Replace the plan wholesale and stamp a new revision. Every write goes
  // through here — an edit to a single exercise included — so a change always
  // moves the revision on and the day's progress is invalidated with it.
  async savePlan(plan) {
    const db = await this.open();
    const docs = await this.deletionsForRange(WORKOUT_PREFIX);
    for (const workout of plan.workouts) docs.push(workoutToDoc(workout));

    let meta = { _id: PLAN_META_ID, type: 'plan-meta' };
    try {
      meta = await db.get(PLAN_META_ID);
    } catch (err) {
      if (err.status !== 404) throw err;
    }
    meta.rev = crypto.randomUUID();
    docs.push(meta);

    await db.bulkDocs(docs);
    return meta.rev;
  }

  // Drop the custom plan and fall back to the built-in one.
  async clearPlan() {
    const db = await this.open();
    const docs = await this.deletionsForRange(WORKOUT_PREFIX);
    try {
      const meta = await db.get(PLAN_META_ID);
      docs.push({ _id: meta._id, _rev: meta._rev, _deleted: true });
    } catch (err) {
      if (err.status !== 404) throw err;
    }
    if (docs.length) await db.bulkDocs(docs);
  }

  // ── Progress ──
  //
  // One document per workout day, holding only the current date. There is no
  // history: progress is a scratchpad for the day, wiped when the day rolls
  // over or the plan changes.

  // Today's sets for every workout, as docId -> { [exerciseId]: completedSets }.
  // Progress from another day or an older plan revision is dropped on the way
  // through, so a stale document never resurfaces.
  async getProgress(planRev, today) {
    const db = await this.open();
    const docs = await this.getRange(PROGRESS_PREFIX, (d) => d);
    const out = {};
    const stale = [];
    for (const doc of docs) {
      if (doc.date === today && doc.planRev === planRev) {
        out[doc.workoutId] = { ...(doc.sets || {}) };
      } else {
        stale.push({ _id: doc._id, _rev: doc._rev, _deleted: true });
      }
    }
    if (stale.length) await db.bulkDocs(stale);
    return out;
  }

  async putProgress(workoutId, sets, planRev, today) {
    // An empty set map is an absence, not a record — clear the doc instead of
    // storing a hollow one.
    if (!sets || !Object.keys(sets).length) {
      await this.removeById(PROGRESS_PREFIX + workoutId);
      return;
    }
    await this.putWithRev({
      _id: PROGRESS_PREFIX + workoutId,
      type: 'progress',
      workoutId,
      date: today,
      planRev,
      sets: { ...sets },
    });
  }

  async clearProgress(workoutId) {
    await this.removeById(PROGRESS_PREFIX + workoutId);
  }

  async clearAllProgress() {
    const db = await this.open();
    const docs = await this.deletionsForRange(PROGRESS_PREFIX);
    if (docs.length) await db.bulkDocs(docs);
  }
}

export const db = new WorkoutDB();
