// =============================================
// Cook Planner — conflicts.js
// =============================================

import { COOK_TYPE_MAP, COMBI_COOLDOWN } from './constants.js';
import { formatTime } from './utils.js';
import { applianceConfig } from './appliances.js';

export function detectConflicts(items) {
  const conflicts = [];

  // Sweep-line capacity check. Returns [{time, slots, itemIds}] for each moment usage exceeds cap.
  function sweepConflicts(usageArr, capacity) {
    const evts = [];
    for (const u of usageArr) {
      evts.push({ time: u.start, delta: u.slots,  itemId: u.itemId });
      evts.push({ time: u.end,   delta: -u.slots, itemId: u.itemId });
    }
    // Process ends before starts at same time so a finishing item frees its slot first
    evts.sort((a, b) => a.time - b.time || a.delta - b.delta);
    let slots = 0;
    const active = new Set();
    const found = [];
    for (const ev of evts) {
      if (ev.delta > 0) {
        active.add(ev.itemId);
        slots += ev.delta;
        if (slots > capacity) found.push({ time: ev.time, slots, itemIds: [...active] });
      } else {
        active.delete(ev.itemId);
        slots += ev.delta;
      }
    }
    return found;
  }

  function checkOvenConflicts() {
    const cfg = applianceConfig();
    const maxSlots = cfg.mainOvenShelves * 2;
    const ovenItems = items.filter(i =>
      COOK_TYPE_MAP[i.cookType]?.resource === 'oven' && i._appliance === 'main' && i._s.cookTime > 0
    );
    const usage = ovenItems.map(i => ({
      start: i._s.cookStart, end: i._s.cookEnd,
      slots: i.shelfSlots || 1, itemId: i.id,
    }));
    const over = sweepConflicts(usage, maxSlots);
    const seen = new Set();
    for (const { time, slots, itemIds } of over) {
      const key = [...itemIds].sort().join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      const names = itemIds.map(id => {
        const it = ovenItems.find(i => i.id === id);
        return it ? `"${it.name}" (${it.shelfSlots||1} slot${(it.shelfSlots||1)>1?'s':''})` : id;
      });
      conflicts.push({
        type: 'oven',
        message: `Main oven overcapacity at ${formatTime(time)}: ${names.join(', ')} = ${slots}/${maxSlots} slots.`,
        itemIds,
      });
    }
  }

  function checkCombiConflicts() {
    const combiItems = items.filter(i =>
      (i._appliance === 'combi' || i._appliance === 'combi-mw') && i._s.cookTime > 0
    );
    const ovenItems = combiItems.filter(i => i._appliance === 'combi');
    const mwItems   = combiItems.filter(i => i._appliance === 'combi-mw');

    // Oven mode: 2-slot capacity
    const ovenUsage = ovenItems.map(i => ({
      start: i._s.cookStart, end: i._s.cookEnd,
      slots: i.shelfSlots || 1, itemId: i.id,
    }));
    const ovenOver = sweepConflicts(ovenUsage, 2);
    const seen = new Set();
    for (const { time, slots, itemIds } of ovenOver) {
      const key = [...itemIds].sort().join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      conflicts.push({
        type: 'combi-capacity',
        message: `Combi overcapacity at ${formatTime(time)}: ${itemIds.map(id => `"${ovenItems.find(i=>i.id===id)?.name}"`).join(', ')} = ${slots}/2 slots.`,
        itemIds,
      });
    }

    // Microwave mode: exclusive (1 item at a time)
    const mwUsage = mwItems.map(i => ({
      start: i._s.cookStart, end: i._s.cookEnd,
      slots: 1, itemId: i.id,
    }));
    const mwOver = sweepConflicts(mwUsage, 1);
    const mwSeen = new Set();
    for (const { time, itemIds } of mwOver) {
      const key = [...itemIds].sort().join(',');
      if (mwSeen.has(key)) continue;
      mwSeen.add(key);
      conflicts.push({
        type: 'combi-capacity',
        message: `Microwave in use by multiple items at ${formatTime(time)}: ${itemIds.map(id => `"${mwItems.find(i=>i.id===id)?.name}"`).join(', ')} \u2014 microwave is exclusive (one item at a time).`,
        itemIds,
      });
    }
    // Mode conflicts and cooldown -- still pair-wise since mode is per-item
    for (let i = 0; i < combiItems.length; i++) {
      for (let j = i + 1; j < combiItems.length; j++) {
        const a = combiItems[i], b = combiItems[j];
        const overlapStart = Math.max(a._s.cookStart, b._s.cookStart);
        const overlapEnd   = Math.min(a._s.cookEnd,   b._s.cookEnd);
        const modeA = a._appliance === 'combi' ? 'oven' : 'microwave';
        const modeB = b._appliance === 'combi' ? 'oven' : 'microwave';

        if (overlapEnd > overlapStart && modeA !== modeB) {
          conflicts.push({
            type: 'combi-mode',
            message: `Combi mode conflict: "${a.name}" needs it as ${modeA} but "${b.name}" needs it as ${modeB} during ${formatTime(overlapStart)}\u2013${formatTime(overlapEnd)}.`,
            itemIds: [a.id, b.id],
          });
        }

        // Cooldown: oven ends, then microwave starts
        if (modeA === 'oven' && modeB === 'microwave' && a._s.cookEnd <= b._s.cookStart) {
          const gap = b._s.cookStart - a._s.cookEnd;
          if (gap < COMBI_COOLDOWN) {
            conflicts.push({
              type: 'combi-cooldown',
              message: `Combi needs ${COMBI_COOLDOWN}m cooldown before microwave use. "${a.name}" (oven) ends ${formatTime(a._s.cookEnd)}, "${b.name}" (microwave) starts ${formatTime(b._s.cookStart)} \u2014 only ${gap}m gap.`,
              itemIds: [a.id, b.id],
            });
          }
        }
        if (modeB === 'oven' && modeA === 'microwave' && b._s.cookEnd <= a._s.cookStart) {
          const gap = a._s.cookStart - b._s.cookEnd;
          if (gap < COMBI_COOLDOWN) {
            conflicts.push({
              type: 'combi-cooldown',
              message: `Combi needs ${COMBI_COOLDOWN}m cooldown before microwave use. "${b.name}" (oven) ends ${formatTime(b._s.cookEnd)}, "${a.name}" (microwave) starts ${formatTime(a._s.cookStart)} \u2014 only ${gap}m gap.`,
              itemIds: [a.id, b.id],
            });
          }
        }
      }
    }
  }

  function checkHobConflicts() {
    const hobItems = items.filter(i =>
      COOK_TYPE_MAP[i.cookType]?.resource === 'hob' && i._s.cookTime > 0
    );
    // Check all time slices where more than 5 items are on hobs
    const events = [];
    for (const item of hobItems) {
      events.push({ time: item._s.cookStart, type: 'start', item });
      events.push({ time: item._s.cookEnd,   type: 'end',   item });
    }
    events.sort((a, b) => a.time - b.time || (a.type === 'end' ? -1 : 1));
    const active = new Set();
    for (const ev of events) {
      if (ev.type === 'start') active.add(ev.item);
      else active.delete(ev.item);
      if (active.size > 5) {
        const names = [...active].map(i => `"${i.name}"`).join(', ');
        conflicts.push({
          type: 'hobs',
          message: `All 5 hobs in use at ${formatTime(ev.time)}: ${names}. One item needs to be rescheduled.`,
          itemIds: [...active].map(i => i.id),
        });
        break; // report once
      }
    }
  }

  checkOvenConflicts();
  checkCombiConflicts();
  checkHobConflicts();

  return conflicts;
}
