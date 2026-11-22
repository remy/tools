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
      COOK_TYPE_MAP[i.cookType]?.resource === 'oven' && i._appliance === 'main' && i.cookTime > 0
    );
    const describe = (id) => {
      const it = ovenItems.find(i => i.id === id);
      return it ? `"${it.name}" (${it.shelfSlots||1} slot${(it.shelfSlots||1)>1?'s':''})` : id;
    };
    const toUsage = (arr) => arr.map(i => ({
      start: i._s.cookStart, end: i._s.cookEnd,
      slots: i.shelfSlots || 1, itemId: i.id,
    }));

    const over = sweepConflicts(toUsage(ovenItems), maxSlots);
    const seen = new Set();
    for (const { time, slots, itemIds } of over) {
      const key = [...itemIds].sort().join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      conflicts.push({
        type: 'oven',
        message: `Main oven overcapacity at ${formatTime(time)}: ${itemIds.map(describe).join(', ')} = ${slots}/${maxSlots} slots.`,
        itemIds,
      });
    }

    // A shelf holds two slots however much room the oven has overall, so an
    // oven that is only half full can still have a shelf with three things on
    // it — by a hand-picked shelf that doesn't fit, or by the allocator having
    // nowhere left to put something. Neither shows up in the total above.
    const shelfSeen = new Set();
    for (let shelf = 1; shelf <= cfg.mainOvenShelves; shelf++) {
      const onShelf = ovenItems.filter(i => (i._shelf ?? 1) === shelf);
      if (onShelf.length < 2) continue;
      for (const { time, slots, itemIds } of sweepConflicts(toUsage(onShelf), 2)) {
        const key = shelf + ':' + [...itemIds].sort().join(',');
        if (shelfSeen.has(key)) continue;
        shelfSeen.add(key);
        conflicts.push({
          type: 'oven-shelf',
          message: `Main oven shelf ${shelf} overcapacity at ${formatTime(time)}: ${itemIds.map(describe).join(', ')} = ${slots}/2 slots. Move one to another shelf.`,
          itemIds,
        });
      }
    }
  }

  function checkCombiConflicts() {
    const combiItems = items.filter(i =>
      (i._appliance === 'combi' || i._appliance === 'combi-mw') && i.cookTime > 0
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
    // Mode clashes, reported per microwave dish rather than per pair. Three
    // trays sharing the combi oven is one problem, not three, and the combi
    // being dual-mode is not the problem at all -- what the cook needs to know
    // is what is tying it up and that something has to give.
    for (const mw of mwItems) {
      const overlapping = ovenItems.filter(o =>
        o._s.cookStart < mw._s.cookEnd && o._s.cookEnd > mw._s.cookStart
      );
      const tooSoon = ovenItems.filter(o =>
        o._s.cookEnd <= mw._s.cookStart
        && mw._s.cookStart - o._s.cookEnd < COMBI_COOLDOWN
      );

      if (overlapping.length > 0) {
        const until = formatTime(Math.max(...overlapping.map(o => o._s.cookEnd)));
        conflicts.push({
          type: 'combi-mode',
          message: `Combi is in use as an oven until ${until} (${names(overlapping)}), `
            + `so it can't microwave "${mw.name}" at ${formatTime(mw._s.cookStart)}. `
            + `Move a dish to the main oven, or cook "${mw.name}" another way.`,
          itemIds: [mw.id, ...overlapping.map(o => o.id)],
        });
      } else if (tooSoon.length > 0) {
        const last = tooSoon.reduce((a, b) => (b._s.cookEnd > a._s.cookEnd ? b : a));
        const gap = mw._s.cookStart - last._s.cookEnd;
        conflicts.push({
          type: 'combi-cooldown',
          message: `Combi needs ${COMBI_COOLDOWN}m to cool down before it will microwave. `
            + `"${last.name}" comes out at ${formatTime(last._s.cookEnd)} and `
            + `"${mw.name}" wants it at ${formatTime(mw._s.cookStart)} \u2014 only ${gap}m gap.`,
          itemIds: [mw.id, last.id],
        });
      }
    }
  }

  function names(arr) {
    return arr.map(i => `"${i.name}"`).join(', ');
  }

  function checkHobConflicts() {
    const hobItems = items.filter(i =>
      COOK_TYPE_MAP[i.cookType]?.resource === 'hob' && i.cookTime > 0
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
