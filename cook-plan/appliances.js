// =============================================
// Cook Planner — appliances.js
// =============================================

import { state } from './state.js';
import { COOK_TYPE_MAP, COMBI_COOLDOWN } from './constants.js';

export function applianceConfig() {
  const a = state.appliances || {};
  return {
    mainOvenShelves: a.mainOvenShelves ?? 2,   // 1 -> 2 slots, 2 -> 4 slots
    hasCombi:        a.hasCombi !== false,       // default true
    hobCount:        a.hobCount ?? 5,
  };
}

export function assignAppliances(items) {
  // Sort by cookStart for deterministic assignment
  const sorted = [...items].sort((a, b) => a._s.cookStart - b._s.cookStart);

  // Track occupancy -- entries include {start, end, shelf, slots, itemId}
  // Main oven: 2 shelves x 2 slots each.  Combi: 1 shelf x 2 slots (oven) or exclusive (mw).
  const mainOvenUsage = [];
  const combiUsage    = [];   // also has mode: 'oven'|'microwave'
  const hobUsage      = [];   // {start, end, hob:1-5, itemId}

  // Max slots used on a specific shelf during [start, end), ignoring excludeId.
  function slotsOnShelf(usage, shelf, start, end, excludeId) {
    const overlapping = usage.filter(u =>
      u.itemId !== excludeId && u.shelf === shelf && u.start < end && u.end > start
    );
    if (overlapping.length === 0) return 0;
    const pts = new Set([start]);
    for (const u of overlapping) {
      if (u.start >= start && u.start < end) pts.add(u.start);
    }
    let max = 0;
    for (const t of pts) {
      const total = overlapping
        .filter(u => u.start <= t && u.end > t)
        .reduce((s, u) => s + u.slots, 0);
      if (total > max) max = total;
    }
    return max;
  }

  // First shelf number that can fit `needed` more slots, or null.
  function firstFreeShelf(usage, start, end, excludeId, needed, numShelves, slotsPerShelf) {
    for (let shelf = 1; shelf <= numShelves; shelf++) {
      if (slotsOnShelf(usage, shelf, start, end, excludeId) + needed <= slotsPerShelf) {
        return shelf;
      }
    }
    return null;
  }

  function combiModeAt(start, end, excludeId) {
    // Returns 'oven', 'microwave', or null (free)
    const overlapping = combiUsage.filter(u =>
      u.itemId !== excludeId && u.start < end && u.end > start
    );
    if (overlapping.length === 0) return null;
    return overlapping[0].mode;
  }

  function lastCombiOvenEndBefore(start, excludeId) {
    const ovenPeriods = combiUsage.filter(u =>
      u.itemId !== excludeId && u.mode === 'oven' && u.end <= start
    );
    if (ovenPeriods.length === 0) return null;
    return Math.max(...ovenPeriods.map(u => u.end));
  }

  function firstFreeHob(start, end, excludeId, maxHobs) {
    const usedHobs = hobUsage
      .filter(u => u.itemId !== excludeId && u.start < end && u.end > start)
      .map(u => u.hob);
    for (let h = 1; h <= (maxHobs ?? 5); h++) {
      if (!usedHobs.includes(h)) return h;
    }
    return null;
  }

  const cfg = applianceConfig();

  for (const item of sorted) {
    const { cookStart, cookEnd } = item._s;
    const slots = item.shelfSlots || 1;
    const pref = item.appliancePref || 'auto';
    const ct = COOK_TYPE_MAP[item.cookType];
    if (!ct) { item._appliance = null; continue; }

    if (ct.resource === 'none') {
      item._appliance = null;
      continue;
    }

    if (ct.resource === 'hob') {
      let hob;
      if (pref.startsWith('hob')) {
        hob = parseInt(pref.replace('hob', ''), 10);
        if (hob > cfg.hobCount) hob = null;  // preference out of range
        const conflict = hob && hobUsage.some(u =>
          u.itemId !== item.id && u.hob === hob && u.start < cookEnd && u.end > cookStart
        );
        if (conflict) hob = null;
      }
      if (!hob) hob = firstFreeHob(cookStart, cookEnd, item.id, cfg.hobCount);
      if (hob) {
        hobUsage.push({ start: cookStart, end: cookEnd, hob, itemId: item.id });
        item._appliance = `hob${hob}`;
      } else {
        item._appliance = 'hob?';
      }
      continue;
    }

    if (ct.resource === 'combi') {
      // Microwave mode -- exclusive: only one item at a time
      if (!cfg.hasCombi) {
        item._appliance = 'combi-mw';  // no combi; conflict will be flagged
        item._shelf = 1;
        continue;
      }
      const lastOvenEnd = lastCombiOvenEndBefore(cookStart, item.id);
      const cooldownOk = (lastOvenEnd === null) || (cookStart - lastOvenEnd >= COMBI_COOLDOWN);
      const existingMode = combiModeAt(cookStart, cookEnd, item.id);
      const combiFree = (existingMode === null);   // microwave needs the combi entirely free
      if (cooldownOk && combiFree) {
        combiUsage.push({ start: cookStart, end: cookEnd, mode: 'microwave', shelf: 1, slots: 1, itemId: item.id });
        item._appliance = 'combi-mw';
        item._shelf = 1;
      } else {
        item._appliance = 'combi-mw';  // conflict will be detected
        item._shelf = 1;
      }
      continue;
    }

    if (ct.resource === 'oven') {
      const tryCombi = pref === 'combi' && cfg.hasCombi;
      const tryMain  = pref === 'main' || pref === 'auto';

      let assigned = false;

      if (tryMain) {
        // Main oven: cfg.mainOvenShelves shelves x 2 slots each
        const shelf = firstFreeShelf(mainOvenUsage, cookStart, cookEnd, item.id, slots, cfg.mainOvenShelves, 2);
        if (shelf !== null) {
          mainOvenUsage.push({ start: cookStart, end: cookEnd, shelf, slots, itemId: item.id });
          item._appliance = 'main';
          item._shelf = shelf;
          assigned = true;
        }
      }

      if (!assigned && (tryCombi || (pref === 'auto' && cfg.hasCombi))) {
        const existingMode = combiModeAt(cookStart, cookEnd, item.id);
        if (existingMode === null || existingMode === 'oven') {
          // Combi oven: 1 shelf x 2 slots
          const shelf = firstFreeShelf(combiUsage, cookStart, cookEnd, item.id, slots, 1, 2);
          if (shelf !== null) {
            combiUsage.push({ start: cookStart, end: cookEnd, mode: 'oven', shelf: 1, slots, itemId: item.id });
            item._appliance = 'combi';
            item._shelf = 1;
            assigned = true;
          }
        }
      }

      if (!assigned) {
        // Overflow: assign to main oven anyway (conflict will be detected)
        const shelf = firstFreeShelf(mainOvenUsage, cookStart, cookEnd, item.id, slots, cfg.mainOvenShelves, 2) ?? 1;
        mainOvenUsage.push({ start: cookStart, end: cookEnd, shelf, slots, itemId: item.id });
        item._appliance = 'main';
        item._shelf = shelf;
      }
    }
  }

  return sorted;
}
