// =============================================
// Cook Planner — appliances.js
// =============================================

import { state } from './state.js';
import { COOK_TYPE_MAP, COMBI_COOLDOWN } from './constants.js';
import { lookupFood, pairScore, sharesTray } from './foods.js';

export function applianceConfig() {
  const a = state.appliances || {};
  return {
    mainOvenShelves: a.mainOvenShelves ?? 2,   // 1 -> 2 slots, 2 -> 4 slots
    hasCombi:        a.hasCombi !== false,       // default true
    hobCount:        a.hobCount ?? 5,
    // How long an oven takes to come up to temperature. Not a property of any
    // dish -- it is the kitchen's, and it is why the first instruction of a
    // roast is "turn the oven on" rather than "put the chicken in".
    preheatMins:     a.preheatMins ?? 6,
    // How long a dish may be finished early and left covered, when that is
    // what frees an appliance. Also the kitchen's, not the dish's: it is
    // really a statement about how tolerant this cook is of food standing.
    holdMins:        a.holdMins ?? 15,
  };
}

// A hand-picked shelf, as a number, or null for "let the planner decide".
// Out-of-range values (a 2-shelf plan opened with the oven set to 1 shelf)
// fall back to automatic rather than pinning to a shelf that isn't there.
export function shelfPrefOf(item, numShelves) {
  const raw = item?.shelfPref;
  if (raw === undefined || raw === null || raw === '' || raw === 'auto') return null;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1 || n > numShelves) return null;
  return n;
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

  // Which shelf to use for a dish that needs `needed` slots.
  //
  // Any shelf with room will do as far as capacity goes, so the deciding factor
  // is what is already on it: a half-shelf of parsnips next to a half-shelf of
  // potatoes is one tray and one lot of basting, while parsnips next to a
  // crumble is two. Shelves are scored by their worst neighbour — one bad
  // pairing is enough to spoil the tray — and an empty shelf scores a neutral
  // 0, so a good pairing beats an empty shelf and a bad one loses to it.
  //
  // Returns {shelf, score} or null when the dish doesn't fit anywhere.
  function bestShelf(usage, start, end, excludeId, needed, numShelves, slotsPerShelf, food) {
    let best = null;
    for (let shelf = 1; shelf <= numShelves; shelf++) {
      if (slotsOnShelf(usage, shelf, start, end, excludeId) + needed > slotsPerShelf) continue;
      const mates = usage.filter(u =>
        u.itemId !== excludeId && u.shelf === shelf && u.start < end && u.end > start
      );
      const score = mates.length === 0
        ? 0
        : Math.min(...mates.map(u => pairScore(food, u.food)));
      if (best === null || score > best.score) best = { shelf, score };
    }
    return best;
  }

  // Microwave reservations, with the cooldown pad in front of them. The combi
  // is either thing on demand -- what it cannot be is both at once, and it
  // needs a few minutes off the heat before it will microwave. So an oven dish
  // that runs up to (or over) a microwave slot is what makes the two
  // incompatible; the device being dual-mode is not the problem.
  function combiOvenBlocked(start, end, excludeId) {
    return clashingMicrowave(start, end, excludeId).length > 0;
  }

  // The shelf with the most room, for when a dish fits nowhere and has to go
  // somewhere anyway -- a smaller pile-up makes for a clearer conflict.
  function emptiestShelf(usage, start, end, excludeId, numShelves) {
    let best = 1, most = -1;
    for (let shelf = 1; shelf <= numShelves; shelf++) {
      const free = 2 - slotsOnShelf(usage, shelf, start, end, excludeId);
      if (free > most) { most = free; best = shelf; }
    }
    return best;
  }

  // Microwave bookings that an oven run over [start, end) cannot live with.
  function clashingMicrowave(start, end, excludeId) {
    return combiUsage.filter(u =>
      u.itemId !== excludeId && u.mode === 'microwave' &&
      start < u.end && end + COMBI_COOLDOWN > u.start
    );
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

  // Hand-picked appliances and shelves are placed first so the automatic
  // choices route around them rather than the other way about — an override is
  // only worth making if the rest of the plan respects it.
  const isPinned = (item) =>
    (item.appliancePref && item.appliancePref !== 'auto') ||
    shelfPrefOf(item, cfg.mainOvenShelves) !== null;

  // A microwave dish has exactly one home. An oven dish has two and can route
  // around a reservation -- but only around one that is already there, so the
  // microwave gets its slot first. Taken in clock order instead, a tray of
  // parsnips parks itself in the combi at quarter past and the red cabbage
  // finds the only microwave in the kitchen busy being an oven.
  const needsMicrowave = (item) => COOK_TYPE_MAP[item.cookType]?.resource === 'combi';
  const order = [
    ...sorted.filter(isPinned),
    ...sorted.filter(it => !isPinned(it) && needsMicrowave(it)),
    ...sorted.filter(it => !isPinned(it) && !needsMicrowave(it)),
  ];

  for (const item of order) {
    const { cookStart, cookEnd } = item._s;
    const slots = item.shelfSlots || 1;
    const pref = item.appliancePref || 'auto';
    const ct = COOK_TYPE_MAP[item.cookType];
    const food = lookupFood(item.name);
    item._trayMates = [];
    item._moveTo = null;
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
        combiUsage.push({ start: cookStart, end: cookEnd, mode: 'microwave', shelf: 1, slots: 1, itemId: item.id, food });
        item._appliance = 'combi-mw';
        item._shelf = 1;
      } else {
        item._appliance = 'combi-mw';  // conflict will be detected
        item._shelf = 1;
      }
      continue;
    }

    if (ct.resource === 'oven') {
      const tryCombi = pref === 'combi' || pref === 'auto';
      const tryMain  = pref === 'main' || pref === 'auto';
      const pinnedShelf = shelfPrefOf(item, cfg.mainOvenShelves);

      const takeMain = (shelf, pinned) => {
        mainOvenUsage.push({ start: cookStart, end: cookEnd, shelf, slots, itemId: item.id, food });
        item._appliance = 'main';
        item._shelf = shelf;
        if (pinned) item._shelfPinned = true;
      };
      const takeCombi = () => {
        combiUsage.push({ start: cookStart, end: cookEnd, mode: 'oven', shelf: 1, slots, itemId: item.id, food });
        item._appliance = 'combi';
        item._shelf = 1;
      };

      if (tryMain && pinnedShelf !== null) {
        // A hand-picked shelf is honoured even when it overfills. Overruling
        // the planner is the whole point of the override, and the capacity
        // sweep in conflicts.js will say so if it doesn't fit.
        takeMain(pinnedShelf, true);
        continue;
      }

      const mainOpt = tryMain
        ? bestShelf(mainOvenUsage, cookStart, cookEnd, item.id, slots, cfg.mainOvenShelves, 2, food)
        : null;

      // The combi counts as a second oven here, and room in it beats a bad
      // neighbour in the main one: a crumble that only fits beside the
      // potatoes is better off on its own in the combi than sharing their
      // shelf. Ties go to the main oven, which is what "main oven first" means.
      const combiOpt = (tryCombi && cfg.hasCombi && !combiOvenBlocked(cookStart, cookEnd, item.id))
        ? bestShelf(combiUsage, cookStart, cookEnd, item.id, slots, 1, 2, food)
        : null;

      // Last resort, worked out before anything is placed: would the combi take
      // this dish if the microwave bookings in the way were given up?
      const displaced = tryCombi && cfg.hasCombi
        ? clashingMicrowave(cookStart, cookEnd, item.id) : [];
      const forcedOpt = displaced.length > 0
        ? bestShelf(combiUsage.filter(u => !displaced.includes(u)),
                    cookStart, cookEnd, item.id, slots, 1, 2, food)
        : null;

      if (mainOpt && (!combiOpt || mainOpt.score >= combiOpt.score)) {
        takeMain(mainOpt.shelf, false);
      } else if (combiOpt) {
        takeCombi();
      } else if (forcedOpt) {
        // Nothing fits politely. Keeping the combi clear for a microwave dish is
        // a preference, not a rule: a tray with nowhere at all to go takes the
        // combi anyway. That makes the combi an oven for the window, so the
        // booking it displaces is dropped rather than left holding a slot it
        // can no longer use -- otherwise it would push the next tray out too.
        // conflicts.js reports which microwave dish lost its slot.
        for (const u of displaced) combiUsage.splice(combiUsage.indexOf(u), 1);
        takeCombi();
      } else {
        // Nowhere fits: into the main oven anyway, and conflicts.js will say so.
        takeMain(emptiestShelf(mainOvenUsage, cookStart, cookEnd, item.id, cfg.mainOvenShelves), false);
      }
    }
  }

  // A microwave dish that still has no slot may be rescuable: see if what is
  // in the combi can move to the main oven partway through and let it in.
  const byId = new Map(sorted.map(it => [it.id, it]));
  for (const mw of order) {
    if (COOK_TYPE_MAP[mw.cookType]?.resource !== 'combi') continue;
    if (!(mw.cookTime > 0) || !cfg.hasCombi) continue;
    if (combiUsage.some(u => u.itemId === mw.id && u.mode === 'microwave')) continue;
    mw._relocation = tryRelocate(mw) ? 'done' : 'impossible';
  }

  annotateTrayMates(sorted, mainOvenUsage);
  annotateTrayMates(sorted, combiUsage);

  return sorted;

  // Freeing the combi by moving what is in it.
  //
  // A dish is often in the combi only because the main oven was full when it
  // went in. Shelves come free as things come out, so it can frequently move
  // across partway through and carry on cooking in the main oven, which leaves
  // the combi empty and cooling in time to microwave something. That is a real
  // job for the cook, so it is only proposed when it genuinely fits: every
  // dish in the way has to be out before the cooldown starts, and the main
  // oven has to hold all of them, at once, for the rest of their cooking.
  function tryRelocate(mw) {
    const { cookStart: mwStart, cookEnd: mwEnd } = mw._s;
    const freeBy = mwStart - COMBI_COOLDOWN;

    const blockers = combiUsage.filter(u =>
      u.mode === 'oven' && u.start < mwEnd && u.end + COMBI_COOLDOWN > mwStart
    );
    if (blockers.length === 0) return false;
    // A combi chosen by hand stays chosen. Undoing an override to make room is
    // the planner overruling the cook, which is the wrong way round.
    if (blockers.some(u => byId.get(u.itemId)?.appliancePref === 'combi')) return false;

    // The only moments worth trying are when something changes: a dish going
    // in, or a main-oven shelf coming free.
    const candidates = [...new Set([
      ...blockers.map(b => b.start),
      ...mainOvenUsage.map(u => u.end),
      freeBy,
    ])].filter(t => t <= freeBy).sort((a, b) => a - b);

    for (const at of candidates) {
      const moves = planMoves(blockers, at);
      if (moves) { applyMoves(moves, mw); return true; }
    }
    return false;
  }

  // Can the main oven take every dish in the way, from `at` onwards, all at
  // the same time? Longest remaining cook first: the awkward one to place
  // should pick its shelf before the easy ones fill them.
  function planMoves(blockers, at) {
    const trial = [...mainOvenUsage];
    const moves = [];
    const hardestFirst = [...blockers].sort((a, b) =>
      (b.end - Math.max(b.start, at)) - (a.end - Math.max(a.start, at)));

    for (const b of hardestFirst) {
      const start = Math.max(b.start, at);
      if (start >= b.end) continue;           // finished before the move: nothing to do
      let shelf = null;
      for (let n = 1; n <= cfg.mainOvenShelves; n++) {
        if (slotsOnShelf(trial, n, start, b.end, b.itemId) + b.slots <= 2) { shelf = n; break; }
      }
      if (shelf === null) return null;
      trial.push({ start, end: b.end, shelf, slots: b.slots, itemId: b.itemId, food: b.food });
      moves.push({ usage: b, at: start, shelf });
    }
    return moves.length > 0 ? moves : null;
  }

  function applyMoves(moves, mw) {
    for (const { usage, at, shelf } of moves) {
      const item = byId.get(usage.itemId);
      mainOvenUsage.push({ ...usage, start: at, shelf });
      if (at <= usage.start) {
        // It never goes near the combi after all: a reassignment, not a move.
        combiUsage.splice(combiUsage.indexOf(usage), 1);
        if (item) { item._appliance = 'main'; item._shelf = shelf; }
      } else {
        usage.end = at;                       // the combi half of its cook
        if (item) item._moveTo = { shelf, at, forItem: mw.name };
      }
    }
    combiUsage.push({
      start: mw._s.cookStart, end: mw._s.cookEnd, mode: 'microwave',
      shelf: 1, slots: 1, itemId: mw.id, food: lookupFood(mw.name),
    });
    mw._appliance = 'combi-mw';
    mw._shelf = 1;
  }
}

// Every stretch a dish spends in an appliance, keyed by the appliance it is
// in. A dish that moves between ovens has two; everything else has one. Both
// the summary cards and the hover peek read the schedule through this, so
// neither can disagree with the other about what is where.
export function applianceWindows(items) {
  const wins = [];
  for (const i of items) {
    if (!(i.cookTime > 0)) continue;
    const app = i._appliance;
    if (app === 'main') {
      wins.push({ item: i, key: 'main', shelf: i._shelf, start: i._s.cookStart, end: i._s.cookEnd });
    } else if (app === 'combi' || app === 'combi-mw') {
      wins.push({
        item: i, key: app, mode: app === 'combi' ? 'oven' : 'MW',
        start: i._s.cookStart, end: i._moveTo ? i._moveTo.at : i._s.cookEnd,
      });
      if (i._moveTo) {
        wins.push({
          item: i, key: 'main', shelf: i._moveTo.shelf,
          start: i._moveTo.at, end: i._s.cookEnd, moved: true,
        });
      }
    } else if (app?.startsWith('hob')) {
      wins.push({ item: i, key: app, start: i._s.cookStart, end: i._s.cookEnd });
    }
  }
  return wins;
}

// Note, on each dish, which of its shelf-mates it could genuinely go in one
// tray with. Only pairings the catalogue actually recommends get a mention —
// two things landing on the same shelf is not by itself advice worth printing.
function annotateTrayMates(items, usage) {
  const byId = new Map(items.map(it => [it.id, it]));
  for (const u of usage) {
    const item = byId.get(u.itemId);
    if (!item || u.mode === 'microwave') continue;
    const mates = usage.filter(o =>
      o.itemId !== u.itemId && o.shelf === u.shelf && o.start < u.end && o.end > u.start
      && sharesTray(u.food, o.food)
    );
    const names = mates.map(o => byId.get(o.itemId)?.name).filter(Boolean);
    if (names.length) item._trayMates = [...new Set(names)];
  }
}
