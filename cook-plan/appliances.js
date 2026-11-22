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
  const order = [...sorted.filter(isPinned), ...sorted.filter(it => !isPinned(it))];

  for (const item of order) {
    const { cookStart, cookEnd } = item._s;
    const slots = item.shelfSlots || 1;
    const pref = item.appliancePref || 'auto';
    const ct = COOK_TYPE_MAP[item.cookType];
    const food = lookupFood(item.name);
    item._trayMates = [];
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
      const combiMode = combiModeAt(cookStart, cookEnd, item.id);
      const combiOpt = (tryCombi && cfg.hasCombi && (combiMode === null || combiMode === 'oven'))
        ? bestShelf(combiUsage, cookStart, cookEnd, item.id, slots, 1, 2, food)
        : null;

      if (mainOpt && (!combiOpt || mainOpt.score >= combiOpt.score)) {
        takeMain(mainOpt.shelf, false);
      } else if (combiOpt) {
        takeCombi();
      } else {
        // Nowhere fits: into the main oven anyway, and conflicts.js will say so.
        takeMain(1, false);
      }
    }
  }

  annotateTrayMates(sorted, mainOvenUsage);
  annotateTrayMates(sorted, combiUsage);

  return sorted;
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
