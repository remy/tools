// =============================================
// Cook Planner — schedule.js
// =============================================

import { state } from './state.js';
import { parseTime } from './utils.js';
import { COMBI_COOLDOWN } from './constants.js';
import { assignAppliances, applianceConfig } from './appliances.js';
import { detectConflicts } from './conflicts.js';
import { buildEvents } from './events.js';
import { syncDayOffset } from './clock.js';

// Everything a dish needs from first touch to being on the table.
function totalDuration(it) {
  return (it.prepTime || 0) + (it.cookTime || 0) + (it.setTime || 0) + (it.servePrep || 0);
}

export function computeSchedule() {
  const plain = buildSchedule(new Map());

  // A dish that can wait, waiting. Back-scheduling pins every cook to the
  // serve time, which is right for anything that suffers from standing and
  // needlessly rigid for a tray of roast veg: finished a few minutes early and
  // covered, it is no worse off, and those few minutes can be exactly what
  // lets the combi stop being an oven in time to be a microwave.
  const holds = planHolds(plain, applianceConfig().holdMins);
  if (holds.size === 0) return plain;

  // Shifting a dish re-opens every allocation decision after it, so the new
  // plan is only kept if it is genuinely better. Trading one clash for another
  // is not worth making anybody's parsnips wait.
  const held = buildSchedule(holds);
  return held.conflicts.length < plain.conflicts.length ? held : plain;
}

// How much earlier each dish would have to finish to free the combi, where
// that is the only thing standing between a microwave dish and its slot.
// All or nothing per clash: emptying the combi half way empties nothing.
function planHolds(plan, allowance) {
  const holds = new Map();
  if (!(allowance > 0)) return holds;

  for (const mw of plan.items) {
    if (mw._relocation !== 'impossible') continue;
    const freeBy = mw._s.cookStart - COMBI_COOLDOWN;

    const blockers = plan.items.filter(i =>
      i._appliance === 'combi' && i.cookTime > 0 && !i.overrideCookStart
      && i._s.cookStart < mw._s.cookEnd
      && i._s.cookEnd + COMBI_COOLDOWN > mw._s.cookStart
    );
    if (blockers.length === 0) continue;

    const needed = blockers.map(b => b._s.cookEnd - freeBy);
    if (needed.some(n => n > allowance)) continue;

    blockers.forEach((b, n) => {
      if (needed[n] > 0) holds.set(b.id, Math.max(holds.get(b.id) || 0, needed[n]));
    });
  }
  return holds;
}

function buildSchedule(holds) {
  const target = parseTime(state.targetTime);
  if (target === null) return { items: [], conflicts: [], events: [] };

  // In start mode, find the longest item so everything back-schedules to finish together
  const maxDuration = state.mode === 'start'
    ? Math.max(...state.items.map(totalDuration))
    : 0;
  const startModeFinish = target + maxDuration;

  // Compute raw times for each item
  const scheduled = state.items.map(item => {
    let cookStart;
    // A hand-set start is the cook's own decision and outranks any hold.
    const hold = item.overrideCookStart ? 0 : (holds.get(item.id) || 0);
    if (item.overrideCookStart) {
      cookStart = parseTime(item.overrideCookStart);
    } else if (state.mode === 'end') {
      // Back from the table: carving and plating happen last, so a dish that
      // needs ten minutes of that has to be out of the oven ten minutes
      // earlier than one that goes straight to the table.
      const setEnd  = target - hold - (item.servePrep || 0);
      const cookEnd = setEnd - (item.setTime || 0);
      cookStart = cookEnd - (item.cookTime || 0);
    } else {
      // start mode: stagger so all items finish together when the longest item does
      cookStart = startModeFinish - hold
        - (item.servePrep || 0) - (item.setTime || 0) - (item.cookTime || 0);
    }
    const prepStart = cookStart - (item.prepTime || 0);
    const cookEnd   = cookStart + (item.cookTime || 0);
    const setEnd    = cookEnd + (item.setTime || 0);
    const serveEnd  = setEnd + (item.servePrep || 0);
    return { ...item, _holdFor: hold, _s: { cookStart, prepStart, cookEnd, setEnd, serveEnd } };
  });

  // Optional: snap nearby start times together so the schedule rounds to natural clusters
  const snapped = snapTimings(scheduled, state.snapMins || 0);

  const assigned = assignAppliances(snapped);
  const conflicts = detectConflicts(assigned);
  // In start mode, target is when cooking begins; serve happens when the
  // longest item finishes. In end mode, target is the serve time itself.
  // Either way, an override that pushes an item past the nominal serve time
  // must shift SERVE later — eating before something is ready makes no sense.
  const baseServe = state.mode === 'start' ? startModeFinish : target;
  const lastFinish = assigned.length > 0
    ? Math.max(...assigned.map(it => it._s.serveEnd))
    : baseServe;
  const serveTime = Math.max(baseServe, lastFinish);
  const events = buildEvents(assigned, serveTime);

  syncDayOffset(events);

  return { items: assigned, conflicts, events };
}

// Cluster items whose cookStart falls within `threshold` minutes of the cluster's anchor,
// then snap all items in each cluster to the anchor (earliest cookStart in that cluster).
// Items with a manual override are left untouched.
export function snapTimings(items, threshold) {
  if (!threshold) return items;

  // Work on non-overridden items only; overrides are left as-is
  const free     = items.filter(it => !it.overrideCookStart);
  const fixed    = items.filter(it =>  it.overrideCookStart);

  // Sort by cookStart ascending
  const sorted = [...free].sort((a, b) => a._s.cookStart - b._s.cookStart);

  // Greedy clustering: each cluster snaps to its anchor (first item's cookStart)
  const result = [];
  let clusterAnchor = null;
  for (const item of sorted) {
    const cs = item._s.cookStart;
    if (clusterAnchor === null || cs - clusterAnchor > threshold) {
      clusterAnchor = cs;
    }
    if (cs !== clusterAnchor) {
      const shift = clusterAnchor - cs;  // negative: move earlier
      const s = item._s;
      result.push({ ...item, _s: {
        cookStart: clusterAnchor,
        prepStart: s.prepStart + shift,
        cookEnd:   s.cookEnd   + shift,
        setEnd:    s.setEnd    + shift,
        serveEnd:  s.serveEnd  + shift,
      }});
    } else {
      result.push(item);
    }
  }

  // Restore original order and re-merge fixed items
  const byId = Object.fromEntries(result.map(it => [it.id, it]));
  return items.map(it => byId[it.id] ?? it);
}
