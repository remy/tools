// =============================================
// Cook Planner — schedule.js
// =============================================

import { state } from './state.js';
import { parseTime, nowMins } from './utils.js';
import { assignAppliances } from './appliances.js';
import { detectConflicts } from './conflicts.js';
import { buildEvents } from './events.js';
import { setNextDayOffset } from './clock.js';

export function computeSchedule() {
  const target = parseTime(state.targetTime);
  if (target === null) return { items: [], conflicts: [], events: [] };

  // In start mode, find the longest item so everything back-schedules to finish together
  const maxDuration = state.mode === 'start'
    ? Math.max(...state.items.map(it => (it.prepTime || 0) + (it.cookTime || 0) + (it.setTime || 0)))
    : 0;
  const startModeFinish = target + maxDuration;

  // Compute raw times for each item
  const scheduled = state.items.map(item => {
    let cookStart;
    if (item.overrideCookStart) {
      cookStart = parseTime(item.overrideCookStart);
    } else if (state.mode === 'end') {
      const cookEnd = target - (item.setTime || 0);
      cookStart = cookEnd - (item.cookTime || 0);
    } else {
      // start mode: stagger so all items finish together when the longest item does
      cookStart = startModeFinish - (item.setTime || 0) - (item.cookTime || 0);
    }
    const prepStart = cookStart - (item.prepTime || 0);
    const cookEnd   = cookStart + (item.cookTime || 0);
    const setEnd    = cookEnd + (item.setTime || 0);
    return { ...item, _s: { cookStart, prepStart, cookEnd, setEnd } };
  });

  // Optional: snap nearby start times together so the schedule rounds to natural clusters
  const snapped = snapTimings(scheduled, state.snapMins || 0);

  const assigned = assignAppliances(snapped);
  const conflicts = detectConflicts(assigned);
  const events = buildEvents(assigned, target);

  // If every scheduled event is more than 60 minutes in the past, the schedule
  // must be for the next calendar day -- offset all "now" comparisons by +1 day.
  const maxEventTime = events.reduce((m, ev) => Math.max(m, ev.endTime ?? ev.time), 0);
  setNextDayOffset(nowMins() > maxEventTime + 60 ? 1440 : 0);

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
      }});
    } else {
      result.push(item);
    }
  }

  // Restore original order and re-merge fixed items
  const byId = Object.fromEntries(result.map(it => [it.id, it]));
  return items.map(it => byId[it.id] ?? it);
}
