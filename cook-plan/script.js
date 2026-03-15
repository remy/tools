// =============================================
// Cook Planner — script.js
// =============================================

// ---- Constants ----

const COOK_TYPES = [
  { id: 'oven',      label: 'Oven',      icon: '🔥', resource: 'oven' },
  { id: 'microwave', label: 'Microwave', icon: '📡', resource: 'combi' },
  { id: 'boil',      label: 'Boil',      icon: '💧', resource: 'hob' },
  { id: 'pan',       label: 'Pan',       icon: '🍳', resource: 'hob' },
  { id: 'fry',       label: 'Fry',       icon: '🥘', resource: 'hob' },
  { id: 'none',      label: 'Prep only', icon: '🔪', resource: 'none' },
];

const COOK_TYPE_MAP = Object.fromEntries(COOK_TYPES.map(t => [t.id, t]));

// Main oven: 2 shelves × 2 slots each = 4 slots total
// Combi: 1 shelf = 2 slots, mode: oven or microwave
// Hobs: 5 independent
const RESOURCES = {
  mainOven: { label: 'Main Oven', totalSlots: 4 },
  combi:    { label: 'Combi Oven/MW', totalSlots: 2 },
  hobs:     { label: 'Hobs', total: 5 },
};

const COMBI_COOLDOWN = 5; // minutes between oven→microwave switch

const EV_TYPE_CHIP = {
  prep:       'PREP',
  cook_start: 'IN',
  cook_end:   'OUT',
  set:        'REST',
  ready:      'READY',
  serve:      '',
};

const DEFAULT_STATE = {
  view: 'input',
  mode: 'end',       // 'start' | 'end'
  targetTime: '17:00',
  items: [],
  appliances: { mainOvenShelves: 2, hasCombi: true, hobCount: 5 },
};

// ---- Time helpers ----

function parseTime(str) {
  if (!str) return null;
  const [h, m] = str.split(':').map(Number);
  return h * 60 + m;
}

function formatTime(mins) {
  if (mins === null || mins === undefined) return '--:--';
  const h = Math.floor(((mins % 1440) + 1440) % 1440 / 60);
  const m = ((mins % 1440) + 1440) % 1440 % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function formatDuration(mins) {
  if (!mins || mins <= 0) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatCountdown(totalSeconds) {
  if (totalSeconds <= 0) return 'now';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}

function nowMins() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function nowSecs() {
  const now = new Date();
  return now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
}

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

// ---- State management ----

let state = { ...DEFAULT_STATE, items: [] };

function encodeState(s) {
  try { return btoa(encodeURIComponent(JSON.stringify(s))); }
  catch { return ''; }
}

function decodeState(encoded) {
  try { return JSON.parse(decodeURIComponent(atob(encoded))); }
  catch { return null; }
}

function saveState() {
  const encoded = encodeState(state);
  localStorage.setItem('cookplan_state', encoded);
  const url = new URL(location.href);
  url.hash = 'state=' + encoded;
  history.replaceState(null, '', url.toString());
}

function loadState() {
  // Try URL hash first
  const hash = location.hash.replace('#', '');
  if (hash.startsWith('state=')) {
    const decoded = decodeState(hash.slice(6));
    if (decoded) return decoded;
  }
  // Fall back to localStorage
  const stored = localStorage.getItem('cookplan_state');
  if (stored) {
    const decoded = decodeState(stored);
    if (decoded) return decoded;
  }
  return null;
}

function resetState() {
  state = { ...DEFAULT_STATE, items: [] };
  saveState();
}

// ---- Schedule computation ----

function computeSchedule() {
  const target = parseTime(state.targetTime);
  if (target === null) return { items: [], conflicts: [], events: [] };

  // Compute raw times for each item
  const scheduled = state.items.map(item => {
    let cookStart;
    if (item.overrideCookStart) {
      cookStart = parseTime(item.overrideCookStart);
    } else if (state.mode === 'end') {
      const cookEnd = target - (item.setTime || 0);
      cookStart = cookEnd - (item.cookTime || 0);
    } else {
      // start mode: all items prep together at targetTime
      cookStart = target + (item.prepTime || 0);
    }
    const prepStart = cookStart - (item.prepTime || 0);
    const cookEnd   = cookStart + (item.cookTime || 0);
    const setEnd    = cookEnd + (item.setTime || 0);
    return { ...item, _s: { cookStart, prepStart, cookEnd, setEnd } };
  });

  const assigned = assignAppliances(scheduled);
  const conflicts = detectConflicts(assigned);
  const events = buildEvents(assigned, target);

  return { items: assigned, conflicts, events };
}

// ---- Appliance assignment ----

function applianceConfig() {
  const a = state.appliances || {};
  return {
    mainOvenShelves: a.mainOvenShelves ?? 2,   // 1 → 2 slots, 2 → 4 slots
    hasCombi:        a.hasCombi !== false,       // default true
    hobCount:        a.hobCount ?? 5,
  };
}

function assignAppliances(items) {
  // Sort by cookStart for deterministic assignment
  const sorted = [...items].sort((a, b) => a._s.cookStart - b._s.cookStart);

  // Track occupancy — entries include {start, end, shelf, slots, itemId}
  // Main oven: 2 shelves × 2 slots each.  Combi: 1 shelf × 2 slots (oven) or exclusive (mw).
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
      // Microwave mode — exclusive: only one item at a time
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
        // Main oven: cfg.mainOvenShelves shelves × 2 slots each
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
          // Combi oven: 1 shelf × 2 slots
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

// ---- Conflict detection ----

function detectConflicts(items) {
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
        message: `Microwave in use by multiple items at ${formatTime(time)}: ${itemIds.map(id => `"${mwItems.find(i=>i.id===id)?.name}"`).join(', ')} — microwave is exclusive (one item at a time).`,
        itemIds,
      });
    }
    // Mode conflicts and cooldown — still pair-wise since mode is per-item
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
            message: `Combi mode conflict: "${a.name}" needs it as ${modeA} but "${b.name}" needs it as ${modeB} during ${formatTime(overlapStart)}–${formatTime(overlapEnd)}.`,
            itemIds: [a.id, b.id],
          });
        }

        // Cooldown: oven ends, then microwave starts
        if (modeA === 'oven' && modeB === 'microwave' && a._s.cookEnd <= b._s.cookStart) {
          const gap = b._s.cookStart - a._s.cookEnd;
          if (gap < COMBI_COOLDOWN) {
            conflicts.push({
              type: 'combi-cooldown',
              message: `Combi needs ${COMBI_COOLDOWN}m cooldown before microwave use. "${a.name}" (oven) ends ${formatTime(a._s.cookEnd)}, "${b.name}" (microwave) starts ${formatTime(b._s.cookStart)} — only ${gap}m gap.`,
              itemIds: [a.id, b.id],
            });
          }
        }
        if (modeB === 'oven' && modeA === 'microwave' && b._s.cookEnd <= a._s.cookStart) {
          const gap = a._s.cookStart - b._s.cookEnd;
          if (gap < COMBI_COOLDOWN) {
            conflicts.push({
              type: 'combi-cooldown',
              message: `Combi needs ${COMBI_COOLDOWN}m cooldown before microwave use. "${b.name}" (oven) ends ${formatTime(b._s.cookEnd)}, "${a.name}" (microwave) starts ${formatTime(a._s.cookStart)} — only ${gap}m gap.`,
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

// ---- Build timeline events ----

function buildEvents(items, target) {
  const events = [];

  for (const item of items) {
    const { cookStart, prepStart, cookEnd, setEnd } = item._s;
    const ct = COOK_TYPE_MAP[item.cookType];
    const hasConflict = false; // will be set after

    if (item.prepTime > 0) {
      events.push({
        time: prepStart,
        endTime: cookStart,
        type: 'prep',
        label: `Prep ${item.name}`,
        sub: formatDuration(item.prepTime),
        itemId: item.id,
        itemName: item.name,
      });
    }

    if (item.cookType !== 'none' && item.cookTime > 0) {
      const appLabel = applianceLabel(item._appliance, ct);
      // applianceKey groups items that share the same destination (for merged labels)
      const appKey = item._appliance || 'none';
      // Shelf label: only main oven has 2 addressable shelves worth calling out
      const shelfLabel = (item._appliance === 'main' && item._shelf)
        ? ` · Shelf ${item._shelf}` : '';
      events.push({
        time: cookStart,
        endTime: cookEnd,
        type: 'cook_start',
        label: cookStartLabel(item, ct, appLabel),
        sub: `${formatDuration(item.cookTime)} · ${appLabel}${shelfLabel}`,
        itemId: item.id,
        itemName: item.name,
        canOverride: true,
        applianceKey: appKey,
        applianceLabel: appLabel,
        shelfInfo: item._shelf ?? null,
        ct,
      });
      events.push({
        time: cookEnd,
        endTime: cookEnd,
        type: 'cook_end',
        label: cookEndLabel(item, ct),
        sub: null,
        itemId: item.id,
        itemName: item.name,
        applianceKey: appKey,
        applianceLabel: appLabel,
        ct,
      });
    }

    if (item.setTime > 0) {
      events.push({
        time: cookEnd,
        endTime: setEnd,
        type: 'set',
        label: `${item.name} — rest / set`,
        sub: formatDuration(item.setTime),
        itemId: item.id,
        itemName: item.name,
        applianceKey: 'set',
      });
    }

    events.push({
      time: setEnd,
      endTime: setEnd,
      type: 'ready',
      label: `${item.name} ready`,
      sub: null,
      itemId: item.id,
      itemName: item.name,
      applianceKey: 'ready',
    });
  }

  events.push({
    time: target,
    endTime: target,
    type: 'serve',
    label: '🍽 SERVE',
    sub: null,
    itemId: null,
  });

  // Sort; serve goes last if same time
  events.sort((a, b) => a.time - b.time || (a.type === 'serve' ? 1 : b.type === 'serve' ? -1 : 0));

  // Deduplicate adjacent ready + serve at same time
  return events;
}

function joinNames(names) {
  if (names.length === 1) return names[0];
  return names.slice(0, -1).join(', ') + ' & ' + names[names.length - 1];
}

function mergedLabel(type, evs, names) {
  if (names.length === 0) return evs[0]?.label || '';
  const appLabel = evs[0]?.applianceLabel;
  const ct = evs[0]?.ct;
  switch (type) {
    case 'prep':       return `Prep ${joinNames(names)}`;
    case 'cook_start': {
      const resource = ct?.resource;
      if (resource === 'oven' || resource === 'combi') return `${joinNames(names)} → ${appLabel}`;
      if (resource === 'hob') return `${joinNames(names)} on ${appLabel}`;
      return `Start ${joinNames(names)}`;
    }
    case 'cook_end': {
      const resource = ct?.resource;
      if (resource === 'oven' || resource === 'combi') return `${joinNames(names)} out of oven`;
      if (resource === 'hob') return `${joinNames(names)} off hob`;
      return `${joinNames(names)} done`;
    }
    case 'set':   return `${joinNames(names)} — rest / set`;
    case 'ready': return `${joinNames(names)} ready`;
    default:      return evs[0]?.label || '';
  }
}

function mergedSub(type, evs) {
  if (evs.length === 1) return evs[0].sub;
  if (type === 'cook_start') {
    // Extract duration and shelf separately for cleaner merged formatting
    const appLabel  = evs[0].applianceLabel || '';
    const durParts  = evs.map(e => e.sub?.split(' · ')[0] ?? '');   // "45 min"
    const shelfParts = evs.map(e => e.shelfInfo != null ? `Shelf ${e.shelfInfo}` : null);
    const uniqueDurs   = [...new Set(durParts)];
    const uniqueShelves = [...new Set(shelfParts.filter(Boolean))];

    // All items have the same duration and same shelf → single compact sub
    if (uniqueDurs.length === 1 && (uniqueShelves.length <= 1)) {
      return [durParts[0], appLabel, uniqueShelves[0]].filter(Boolean).join(' · ');
    }
    // Same duration, different shelves → "45 min · Main Oven · Turkey: Shelf 1, Chicken: Shelf 2"
    if (uniqueDurs.length === 1 && uniqueShelves.length > 1) {
      const shelfList = evs.map(e => e.shelfInfo != null ? `${e.itemName}: Shelf ${e.shelfInfo}` : e.itemName).join(', ');
      return [durParts[0], appLabel, shelfList].filter(Boolean).join(' · ');
    }
    // Different durations — show per-item (include shelf inline)
    return evs.map(e => {
      const dur   = e.sub?.split(' · ')[0] ?? '';
      const shelf = e.shelfInfo != null ? ` Shelf ${e.shelfInfo}` : '';
      return `${e.itemName}: ${dur}${shelf}`;
    }).join(' · ') + (appLabel ? ` · ${appLabel}` : '');
  }
  // For set/ready: show duration if uniform
  const subs = evs.map(e => e.sub).filter(Boolean);
  const unique = [...new Set(subs)];
  return unique.length === 1 ? unique[0] : '';
}

function applianceLabel(app, ct) {
  if (!app || app === 'none') return ct?.label || '';
  if (app === 'main') return 'Main Oven';
  if (app === 'combi') return 'Combi Oven';
  if (app === 'combi-mw') return 'Microwave';
  if (app.startsWith('hob')) return `Hob ${app.replace('hob', '')}`;
  return app;
}

function cookStartLabel(item, ct, appLabel) {
  if (ct?.resource === 'oven' || ct?.resource === 'combi') return `${item.name} → ${appLabel}`;
  if (ct?.resource === 'hob') return `${item.name} on ${appLabel}`;
  return `Start ${item.name}`;
}

function cookEndLabel(item, ct) {
  if (ct?.resource === 'oven' || ct?.resource === 'combi') return `${item.name} out of oven`;
  if (ct?.resource === 'hob') return `${item.name} off hob`;
  return `${item.name} done`;
}

// ---- Rendering: input view ----

function renderInputView() {
  const app = document.getElementById('app');
  const mode = state.mode || 'end';

  app.innerHTML = `
    <div class="view" id="view-input">
      <div class="container">
        <header class="app-header">
          <h1>🍳 Cook Planner</h1>
          <div class="header-actions">
            <button class="btn btn-ghost btn-sm" id="btn-theme-toggle" aria-label="Toggle dark mode">🌓</button>
          </div>
        </header>

        <div class="setup-card">
          <button class="btn-icon setup-gear" popovertarget="appl-popover"
            title="Configure appliances" aria-label="Configure appliances">⚙</button>
          <div class="setup-row">
            <div class="setup-field">
              <label class="form-label">Target time</label>
              <div class="time-row" style="display:flex;gap:var(--space-sm);align-items:center;flex-wrap:wrap">
                <div class="seg-control" id="mode-toggle">
                  <button data-mode="end" class="${mode==='end'?'active':''}">Ready by</button>
                  <button data-mode="start" class="${mode==='start'?'active':''}">Start at</button>
                </div>
                <input class="input" id="inp-time" type="time"
                  value="${state.targetTime || '17:00'}" style="width:8rem">
              </div>
              <span class="form-hint">${mode === 'end' ? 'When everything should be on the table' : 'When you\'ll begin cooking'}</span>
            </div>
          </div>
        </div>

        <div class="section-header">
          <h2>Food Items</h2>
          <button class="btn btn-primary btn-sm" id="btn-add-item">+ Add item</button>
        </div>

        <div class="items-list" id="items-list">
          ${state.items.length === 0 ? renderEmptyState() : state.items.map(renderItemCard).join('')}
        </div>

        <div class="input-footer">
          <button class="btn btn-primary btn-lg" id="btn-generate"
            ${state.items.length === 0 ? 'disabled' : ''}>
            Generate Schedule →
          </button>
          ${state.items.length > 0 ? `<button class="btn btn-ghost btn-sm" id="btn-new-cook" style="text-align:center">Start a new cook</button>` : ''}
          ${state.items.length > 0 ? `<button class="btn btn-ghost btn-sm" id="btn-export">⬇ Export JSON</button>` : ''}
        </div>
      </div>
    </div>
  `;

  bindInputEvents();
}

function renderEmptyState() {
  return `
    <div class="empty-state">
      <div style="font-size:2rem">🥘</div>
      <p>Add your food items to get started.</p>
    </div>
  `;
}

function renderItemCard(item) {
  const ct = COOK_TYPE_MAP[item.cookType] || COOK_TYPE_MAP['none'];
  const badges = [];
  badges.push(`<span class="item-badge item-badge-type">${ct.icon} ${ct.label}</span>`);
  if (item.prepTime > 0)  badges.push(`<span class="item-badge">Prep ${formatDuration(item.prepTime)}</span>`);
  if (item.cookTime > 0)  badges.push(`<span class="item-badge">Cook ${formatDuration(item.cookTime)}</span>`);
  if (item.setTime > 0)   badges.push(`<span class="item-badge">Rest ${formatDuration(item.setTime)}</span>`);
  if (ct.resource === 'oven' || ct.resource === 'combi') {
    const slots = item.shelfSlots || 1;
    badges.push(`<span class="item-badge">${slots === 1 ? '½ shelf' : slots === 2 ? '1 shelf' : slots + ' slots'}</span>`);
  }

  return `
    <div class="item-card" data-id="${item.id}">
      <div class="item-card-top">
        <span class="item-name">${escHtml(item.name)}</span>
        <div class="item-actions">
          <button class="btn-icon btn-edit-item" data-id="${item.id}" aria-label="Edit ${escHtml(item.name)}">✏️</button>
          <button class="btn-icon btn-remove-item" data-id="${item.id}" aria-label="Remove ${escHtml(item.name)}">🗑</button>
        </div>
      </div>
      <div class="item-meta">${badges.join('')}</div>
    </div>
  `;
}

function bindInputEvents() {
  document.getElementById('inp-time').addEventListener('change', e => {
    state.targetTime = e.target.value;
    saveState();
  });


  document.getElementById('mode-toggle').addEventListener('click', e => {
    const btn = e.target.closest('button[data-mode]');
    if (!btn) return;
    state.mode = btn.dataset.mode;
    saveState();
    renderInputView();
  });

  document.getElementById('btn-add-item').addEventListener('click', () => {
    openItemModal(null);
  });

  document.getElementById('btn-generate')?.addEventListener('click', () => {
    state.view = 'schedule';
    saveState();
    renderScheduleView();
  });

  document.getElementById('btn-new-cook')?.addEventListener('click', () => {
    if (confirm('Start a new cook? This will clear all current items and settings.')) {
      resetState();
      renderInputView();
    }
  });

  document.getElementById('btn-export')?.addEventListener('click', exportJSON);

  document.getElementById('btn-theme-toggle')?.addEventListener('click', toggleTheme);

  document.getElementById('items-list').addEventListener('click', e => {
    const editBtn = e.target.closest('.btn-edit-item');
    const removeBtn = e.target.closest('.btn-remove-item');
    if (editBtn) openItemModal(editBtn.dataset.id);
    if (removeBtn) removeItem(removeBtn.dataset.id);
  });
}

// ---- Rendering: schedule view ----

let clockInterval = null;
let wakeLock = null;

function renderScheduleView() {
  stopClock();
  const { items, conflicts, events } = computeSchedule();

  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="view" id="view-schedule">
      <div class="container">
        <header class="app-header">
          <h1>🍳 Cook Planner</h1>
          <div class="header-actions">
            <button class="btn btn-ghost btn-sm" id="btn-theme-toggle" aria-label="Toggle dark mode">🌓</button>
            <button class="btn btn-secondary btn-sm" id="btn-edit-plan">✏️ Edit</button>
          </div>
        </header>

        <div class="schedule-view">
          <!-- Clock bar -->
          <div class="clock-bar" id="clock-bar">
            <div class="clock-bar-top">
              <div>
                <div class="clock-time" id="clock-time">--:--:--</div>
                <div class="clock-date" id="clock-date"></div>
              </div>
              <button class="wake-lock-btn" id="wake-lock-btn">🔆 Keep awake</button>
            </div>
            <div class="clock-next" id="clock-next"></div>
          </div>

          <!-- Serve summary -->
          <div class="serve-summary">
            <div class="serve-stat">
              <div class="serve-stat-label">${state.mode === 'end' ? 'Serving at' : 'Starting at'}</div>
              <div class="serve-stat-value">${state.targetTime}</div>
            </div>
            <div class="serve-stat">
              <div class="serve-stat-label">Items</div>
              <div class="serve-stat-value">${state.items.length}</div>
            </div>
            <div class="serve-stat">
              <div class="serve-stat-label">First action</div>
              <div class="serve-stat-value">${events.length > 0 ? formatTime(events[0].time) : '--:--'}</div>
            </div>
          </div>

          <!-- Conflicts -->
          ${conflicts.length > 0 ? renderConflicts(conflicts) : ''}

          <!-- Timeline -->
          <div class="timeline-section">
            <h2>Timeline</h2>
            <div class="timeline" id="timeline">
              ${renderTimeline(events, items)}
            </div>
          </div>

          <!-- Appliance summary -->
          ${renderApplianceSummary(items)}

          <!-- Footer -->
          <div class="schedule-footer">
            <button class="btn btn-secondary btn-sm" id="btn-share">📋 Copy link</button>
            <button class="btn btn-secondary btn-sm" id="btn-new-cook">Start new cook</button>
            <button class="btn btn-ghost btn-sm" id="btn-export">⬇ Export JSON</button>
            <button class="btn btn-ghost btn-sm" id="btn-print">🖨 Print</button>
          </div>
        </div>
      </div>
    </div>
  `;

  bindScheduleEvents(items, events);
  startClock(events);
}

function renderConflicts(conflicts) {
  return `
    <div class="conflicts-section">
      ${conflicts.map(c => `
        <div class="conflict-card">
          <strong>⚠️ Conflict</strong>
          <div class="conflict-detail">${escHtml(c.message)}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderTimeline(events, items) {
  const nowM = nowMins();

  // Group events by time
  const groups = [];
  for (const ev of events) {
    const last = groups[groups.length - 1];
    if (last && last.time === ev.time) last.events.push(ev);
    else groups.push({ time: ev.time, events: [ev] });
  }

  return groups.map(group => {
    const isServeGroup = group.events.some(ev => ev.type === 'serve');
    // A group is past if ALL events in it are past
    const isPast   = group.events.every(ev => ev.endTime < nowM);
    // A group is active if ANY non-serve event in it is active
    const isActive = group.events.some(ev => ev.time <= nowM && ev.endTime >= nowM && ev.type !== 'serve');

    let cls = 'tl-event';
    if (isPast)       cls += ' tl-past';
    if (isActive)     cls += ' tl-active';
    if (isServeGroup) cls += ' tl-serve';

    // Within the time-group, merge events that share the same type+applianceKey
    const clusters = [];
    for (const ev of group.events) {
      const key = `${ev.type}::${ev.applianceKey || ''}`;
      const existing = clusters.find(c => c.key === key);
      if (existing) existing.events.push(ev);
      else clusters.push({ key, type: ev.type, events: [ev] });
    }

    const evRows = clusters.map(cluster => {
      const { type, events: evs } = cluster;
      const chip = EV_TYPE_CHIP[type] || '';

      // Merged label and sub-line
      const names = evs.map(e => e.itemName).filter(Boolean);
      const label = mergedLabel(type, evs, names);
      const sub   = mergedSub(type, evs);

      // Override inputs (one per event in this cluster that canOverride)
      const overrideHtml = evs.filter(e => e.canOverride && e.itemId).map(ev => {
        const item = items.find(i => i.id === ev.itemId);
        const override = item?.overrideCookStart || '';
        const namePrefix = evs.length > 1 ? `<span class="override-name">${escHtml(ev.itemName)}:</span> ` : '';
        return `
          <div class="tl-override">
            <label>${namePrefix}Override cook start:</label>
            <input type="time" class="override-input" data-id="${ev.itemId}" value="${override}">
            ${override ? `<button class="btn-clear-override" data-id="${ev.itemId}" title="Clear override">✕</button>` : ''}
          </div>
        `;
      }).join('');

      // Hidden trackers so the clock updater can find each original event
      const trackers = evs.map(ev =>
        `<span class="tl-tracker" data-item="${ev.itemId || ''}" data-type="${ev.type}" aria-hidden="true"></span>`
      ).join('');

      return `
        <div class="tl-sub-event tl-type-${type}" data-item="${evs[0].itemId || ''}" data-type="${type}">
          ${trackers}
          ${chip ? `<span class="tl-chip">${chip}</span>` : ''}
          <div class="tl-label">${escHtml(label)}</div>
          ${sub ? `<div class="tl-sub">${escHtml(sub)}</div>` : ''}
          ${overrideHtml}
        </div>
      `;
    }).join('');

    return `
      <div class="${cls}">
        <div class="tl-time">${formatTime(group.time)}</div>
        <div class="tl-dot"><span></span></div>
        <div class="tl-content">${evRows}</div>
      </div>
    `;
  }).join('');
}

function renderApplianceSummary(items) {
  const cfg = applianceConfig();
  const ovenItems  = items.filter(i => i._appliance === 'main');
  const combiItems = items.filter(i => i._appliance === 'combi' || i._appliance === 'combi-mw');
  const hobItems   = items.filter(i => i._appliance?.startsWith('hob'));

  // Current slot usage at nowMins
  const now = nowMins();
  function usedSlots(arr) {
    return arr.filter(i => i._s.cookStart <= now && i._s.cookEnd > now)
              .reduce((s, i) => s + (i.shelfSlots || 1), 0);
  }
  function usedHobs(arr) {
    return arr.filter(i => i._s.cookStart <= now && i._s.cookEnd > now)
              .map(i => i._appliance.replace('hob', 'H'));
  }

  const mainUsed  = usedSlots(ovenItems);
  const combiUsed = usedSlots(combiItems);
  const hobsNow   = usedHobs(hobItems);

  function slotBar(used, total, id) {
    let html = `<div class="slot-bar" aria-label="${used} of ${total} slots used">`;
    for (let i = 0; i < total; i++) {
      html += `<div class="slot${i < used ? ' used' : ''}"></div>`;
    }
    return html + '</div>';
  }

  return `
    <div class="appliance-section">
      <h2>Appliances</h2>
      <div class="appliance-grid">
        <div class="appliance-card">
          <div class="app-name">Main Oven</div>
          <div class="app-capacity">${cfg.mainOvenShelves * 2} slots (${cfg.mainOvenShelves} shelf${cfg.mainOvenShelves > 1 ? ' × 2' : ''})</div>
          ${slotBar(mainUsed, cfg.mainOvenShelves * 2)}
          <div class="app-items">
            ${ovenItems.length === 0 ? '<span style="color:var(--colour-text-tertiary)">Nothing scheduled</span>' :
              ovenItems.map(i => `<span>${escHtml(i.name)}: ${formatTime(i._s.cookStart)}–${formatTime(i._s.cookEnd)}</span>`).join('')}
          </div>
        </div>
        ${cfg.hasCombi ? `
        <div class="appliance-card">
          <div class="app-name">Combi</div>
          <div class="app-capacity">2 slots (1 shelf), oven or MW</div>
          ${slotBar(combiUsed, 2)}
          <div class="app-items">
            ${combiItems.length === 0 ? '<span style="color:var(--colour-text-tertiary)">Nothing scheduled</span>' :
              combiItems.map(i => `<span>${escHtml(i.name)} (${i._appliance === 'combi' ? 'oven' : 'MW'}): ${formatTime(i._s.cookStart)}–${formatTime(i._s.cookEnd)}</span>`).join('')}
          </div>
        </div>` : ''}
        <div class="appliance-card">
          <div class="app-name">Hobs</div>
          <div class="app-capacity">${cfg.hobCount} independent hob${cfg.hobCount !== 1 ? 's' : ''}</div>
          <div class="slot-bar">
            ${Array.from({length: cfg.hobCount}, (_, i) => i + 1).map(h => {
              const inUse = hobItems.some(i => i._appliance === `hob${h}` && i._s.cookStart <= now && i._s.cookEnd > now);
              return `<div class="slot${inUse ? ' used' : ''}"></div>`;
            }).join('')}
          </div>
          <div class="app-items">
            ${hobItems.length === 0 ? '<span style="color:var(--colour-text-tertiary)">Nothing scheduled</span>' :
              hobItems.map(i => `<span>${escHtml(i.name)} (${applianceLabel(i._appliance, null)}): ${formatTime(i._s.cookStart)}–${formatTime(i._s.cookEnd)}</span>`).join('')}
          </div>
        </div>
      </div>
    </div>
  `;
}

function bindScheduleEvents(items, events) {
  document.getElementById('btn-edit-plan').addEventListener('click', () => {
    stopClock();
    releaseWakeLock();
    state.view = 'input';
    saveState();
    renderInputView();
  });

  document.getElementById('btn-new-cook')?.addEventListener('click', () => {
    if (confirm('Start a new cook? This will clear all items and settings.')) {
      stopClock();
      releaseWakeLock();
      resetState();
      renderInputView();
    }
  });

  document.getElementById('btn-share')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      const btn = document.getElementById('btn-share');
      if (btn) { btn.textContent = '✅ Copied!'; setTimeout(() => { if (btn) btn.textContent = '📋 Copy link'; }, 2000); }
    } catch {
      prompt('Copy this URL to share:', location.href);
    }
  });

  document.getElementById('btn-export')?.addEventListener('click', exportJSON);
  document.getElementById('btn-print')?.addEventListener('click', () => window.print());
  document.getElementById('btn-theme-toggle')?.addEventListener('click', toggleTheme);

  document.getElementById('wake-lock-btn')?.addEventListener('click', toggleWakeLock);

  // Override inputs
  document.getElementById('timeline')?.addEventListener('change', e => {
    const input = e.target.closest('.override-input');
    if (!input) return;
    const id = input.dataset.id;
    const item = state.items.find(i => i.id === id);
    if (item) {
      item.overrideCookStart = input.value || null;
      saveState();
      renderScheduleView();
    }
  });

  document.getElementById('timeline')?.addEventListener('click', e => {
    const clearBtn = e.target.closest('.btn-clear-override');
    if (!clearBtn) return;
    const id = clearBtn.dataset.id;
    const item = state.items.find(i => i.id === id);
    if (item) {
      item.overrideCookStart = null;
      saveState();
      renderScheduleView();
    }
  });
}

// ---- Live clock ----

// ---- Chimes ----

let chimesFired = new Set();  // keys of events that have already chimed

function chimeKey(ev) {
  return `${ev.time}:${ev.type}:${ev.itemId || ''}`;
}

// Pre-seed so past events (and events right now on first load) don't trigger
function initChimes(events) {
  const nowM = nowMins();
  chimesFired = new Set(events.filter(ev => ev.time <= nowM).map(chimeKey));
}

function playChime(type) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();

    // Bell: fundamental + a detuned partial for richness, quick attack, slow decay
    const freqMap = {
      prep:       392.00,  // G4 — gentle reminder
      cook_start: 523.25,  // C5 — things going in
      cook_end:   783.99,  // G5 — higher/urgent: things coming out
      set:        440.00,  // A4 — soft
      serve:      987.77,  // B5 — bright fanfare note
    };
    const freq  = freqMap[type] ?? 523.25;
    const decay = type === 'serve' ? 2.5 : 1.8;

    const osc1  = ctx.createOscillator();
    const osc2  = ctx.createOscillator();  // bell overtone at ~2.76× fundamental
    const gain  = ctx.createGain();

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.type = 'sine';
    osc2.type = 'sine';
    osc1.frequency.value = freq;
    osc2.frequency.value = freq * 2.756;  // characteristic inharmonic bell partial

    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + decay);

    osc1.start(ctx.currentTime);
    osc2.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + decay);
    osc2.stop(ctx.currentTime + decay);

    // For serve, add a quick second note a fifth up
    if (type === 'serve') {
      const osc3 = ctx.createOscillator();
      const g3   = ctx.createGain();
      osc3.connect(g3);
      g3.connect(ctx.destination);
      osc3.type = 'sine';
      osc3.frequency.value = freq * 1.5;
      g3.gain.setValueAtTime(0, ctx.currentTime + 0.18);
      g3.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.19);
      g3.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.19 + decay);
      osc3.start(ctx.currentTime + 0.18);
      osc3.stop(ctx.currentTime + 0.18 + decay);
      osc3.onended = () => ctx.close();
    } else {
      osc1.onended = () => ctx.close();
    }
  } catch (_) {
    // AudioContext unavailable (e.g. test environments) — fail silently
  }
}

function startClock(events) {
  initChimes(events);
  updateClock(events);
  clockInterval = setInterval(() => updateClock(events), 1000);
}

function stopClock() {
  if (clockInterval) { clearInterval(clockInterval); clockInterval = null; }
}

function updateClock(events) {
  const clockTimeEl = document.getElementById('clock-time');
  const clockDateEl = document.getElementById('clock-date');
  const clockNextEl = document.getElementById('clock-next');
  if (!clockTimeEl) { stopClock(); return; }

  const now = new Date();
  const nowS = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  const nowM = Math.floor(nowS / 60);

  // Fire chimes for events whose time has just been reached
  for (const ev of events) {
    if (ev.time === nowM) {
      const key = chimeKey(ev);
      if (!chimesFired.has(key)) {
        chimesFired.add(key);
        playChime(ev.type);
      }
    }
  }

  clockTimeEl.textContent = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  clockDateEl.textContent = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  // Find next event
  const upcoming = events.filter(ev => ev.time > nowM && ev.type !== 'ready');
  if (upcoming.length > 0) {
    const next = upcoming[0];
    const nextS = next.time * 60;
    const diffS = nextS - nowS;
    clockNextEl.innerHTML = `
      <div class="clock-next-label">Next:</div>
      <div class="clock-next-event">${escHtml(next.label)}</div>
      <div class="clock-next-countdown">${diffS > 0 ? formatCountdown(diffS) : 'NOW'}</div>
    `;
  } else if (events.some(ev => ev.type === 'serve' && ev.time <= nowM)) {
    clockNextEl.innerHTML = `<div class="clock-next-event" style="font-size:1.25rem">🍽 Enjoy your meal!</div>`;
  } else {
    clockNextEl.innerHTML = '';
  }

  // Update past/active classes on grouped timeline rows
  // Each row may contain .tl-tracker elements that map back to original events
  const tlRows = document.querySelectorAll('.tl-event');
  tlRows.forEach(row => {
    const trackers = row.querySelectorAll('.tl-tracker');
    const rowEvents = [...trackers].map(el =>
      events.find(ev => ev.type === el.dataset.type && (ev.itemId || '') === (el.dataset.item || ''))
    ).filter(Boolean);
    if (rowEvents.length === 0) return;
    const isPast   = rowEvents.every(ev => ev.endTime < nowM);
    const isActive = rowEvents.some(ev => ev.time <= nowM && ev.endTime >= nowM && ev.type !== 'serve');
    row.classList.toggle('tl-past',   isPast);
    row.classList.toggle('tl-active', isActive && !isPast);
  });

  // Update appliance slots (re-render just slot bars would need full re-render; skip for perf)
}

// ---- Wake lock ----

async function toggleWakeLock() {
  if (wakeLock) {
    await releaseWakeLock();
  } else {
    await requestWakeLock();
  }
}

async function requestWakeLock() {
  if (!('wakeLock' in navigator)) {
    alert('Wake lock is not supported in this browser.');
    return;
  }
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => {
      wakeLock = null;
      updateWakeLockBtn();
    });
    updateWakeLockBtn();
  } catch (e) {
    console.warn('Wake lock failed:', e);
  }
}

async function releaseWakeLock() {
  if (wakeLock) {
    await wakeLock.release();
    wakeLock = null;
    updateWakeLockBtn();
  }
}

function updateWakeLockBtn() {
  const btn = document.getElementById('wake-lock-btn');
  if (!btn) return;
  if (wakeLock) {
    btn.textContent = '🔆 Awake (tap to release)';
    btn.classList.add('active');
  } else {
    btn.textContent = '🔆 Keep awake';
    btn.classList.remove('active');
  }
}

// ---- Item modal ----

function openItemModal(editId) {
  const overlay = document.getElementById('modal-overlay');
  const title   = document.getElementById('modal-title');
  const body    = document.getElementById('modal-body');

  const item = editId ? state.items.find(i => i.id === editId) : null;
  title.textContent = item ? `Edit: ${item.name}` : 'Add Food Item';

  const defCookType = item?.cookType || 'oven';
  const defSlots    = item?.shelfSlots || 1;
  const showSlots   = (ct) => COOK_TYPE_MAP[ct]?.resource === 'oven' || COOK_TYPE_MAP[ct]?.resource === 'combi';

  body.innerHTML = `
    <form id="item-form" autocomplete="off">
      <div class="form-group">
        <label class="form-label" for="if-name">Name</label>
        <input class="input" id="if-name" type="text" placeholder="e.g. Turkey, Roast Potatoes…"
          value="${escHtml(item?.name || '')}" maxlength="60" required>
      </div>

      <div class="form-group">
        <label class="form-label">Cook type</label>
        <div class="cook-type-grid" id="cook-type-grid">
          ${COOK_TYPES.map(ct => `
            <button type="button" class="cook-type-btn${defCookType === ct.id ? ' selected' : ''}"
              data-cook-type="${ct.id}">
              <span class="cook-icon">${ct.icon}</span>
              ${ct.label}
            </button>
          `).join('')}
        </div>
        <input type="hidden" id="if-cook-type" value="${defCookType}">
      </div>

      <div class="form-group" id="fg-slots" style="${showSlots(defCookType) ? '' : 'display:none'}">
        <label class="form-label">Shelf slots</label>
        <div class="slot-picker">
          <div class="slot-visual" id="slot-visual">
            ${[1,2].map(n => `<div class="sv-slot${defSlots >= n ? ' filled' : ''}" data-slot="${n}"></div>`).join('')}
          </div>
          <span class="slot-label" id="slot-label">${slotsLabel(defSlots)}</span>
        </div>
        <span class="form-hint">1 slot = half a shelf · 2 slots = full shelf</span>
        <input type="hidden" id="if-slots" value="${defSlots}">
      </div>

      <div class="form-group" id="fg-appliance-pref" style="${showSlots(defCookType) ? '' : 'display:none'}">
        <label class="form-label" for="if-appl-pref">Appliance preference</label>
        <select class="input" id="if-appl-pref">
          <option value="auto"  ${(item?.appliancePref||'auto') === 'auto'  ? 'selected' : ''}>Auto (main oven first)</option>
          <option value="main"  ${item?.appliancePref === 'main'  ? 'selected' : ''}>Main Oven only</option>
          <option value="combi" ${item?.appliancePref === 'combi' ? 'selected' : ''}>Combi Oven only</option>
        </select>
      </div>

      <div class="form-group" id="fg-hob-pref" style="${COOK_TYPE_MAP[defCookType]?.resource === 'hob' ? '' : 'display:none'}">
        <label class="form-label" for="if-hob-pref">Hob preference</label>
        <select class="input" id="if-hob-pref">
          <option value="auto" ${(item?.appliancePref||'auto') === 'auto' ? 'selected' : ''}>Auto (first free hob)</option>
          ${[1,2,3,4,5].map(n => `<option value="hob${n}" ${item?.appliancePref === `hob${n}` ? 'selected' : ''}>Hob ${n}</option>`).join('')}
        </select>
      </div>

      <div class="input-row">
        <div class="form-group">
          <label class="form-label" for="if-prep">Prep time</label>
          <div class="input-time-group">
            <input class="input" id="if-prep" type="number" min="0" max="999"
              value="${item?.prepTime ?? 0}" placeholder="0">
            <span class="time-unit">min</span>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label" for="if-cook">Cook time</label>
          <div class="input-time-group">
            <input class="input" id="if-cook" type="number" min="0" max="999"
              value="${item?.cookTime ?? 60}" placeholder="0">
            <span class="time-unit">min</span>
          </div>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label" for="if-set">Rest / set time <span style="font-weight:400;color:var(--colour-text-secondary)">(after cooking)</span></label>
        <div class="input-time-group" style="max-width:12rem">
          <input class="input" id="if-set" type="number" min="0" max="999"
            value="${item?.setTime ?? 0}" placeholder="0">
          <span class="time-unit">min</span>
        </div>
      </div>

      <div class="modal-footer">
        ${item ? `<button type="button" class="btn btn-danger btn-sm" id="btn-delete-item" data-id="${item.id}">Delete</button>` : ''}
        <button type="button" class="btn btn-ghost" id="btn-cancel-modal">Cancel</button>
        <button type="submit" class="btn btn-primary">${item ? 'Save changes' : 'Add item'}</button>
      </div>
    </form>
  `;

  overlay.classList.remove('hidden');
  document.getElementById('if-name').focus();

  // Cook type selection
  document.getElementById('cook-type-grid').addEventListener('click', e => {
    const btn = e.target.closest('.cook-type-btn');
    if (!btn) return;
    const ct = btn.dataset.cookType;
    document.querySelectorAll('.cook-type-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    document.getElementById('if-cook-type').value = ct;
    const resource = COOK_TYPE_MAP[ct]?.resource;
    document.getElementById('fg-slots').style.display    = (resource === 'oven' || resource === 'combi') ? '' : 'none';
    document.getElementById('fg-appliance-pref').style.display = (resource === 'oven') ? '' : 'none';
    document.getElementById('fg-hob-pref').style.display = (resource === 'hob') ? '' : 'none';
  });

  // Slot picker
  document.getElementById('slot-visual').addEventListener('click', e => {
    const slotEl = e.target.closest('.sv-slot');
    if (!slotEl) return;
    const n = parseInt(slotEl.dataset.slot);
    document.getElementById('if-slots').value = n;
    document.getElementById('slot-label').textContent = slotsLabel(n);
    document.querySelectorAll('.sv-slot').forEach(el => {
      el.classList.toggle('filled', parseInt(el.dataset.slot) <= n);
    });
  });

  // Form submit
  document.getElementById('item-form').addEventListener('submit', e => {
    e.preventDefault();
    const name = document.getElementById('if-name').value.trim();
    if (!name) { document.getElementById('if-name').focus(); return; }
    const cookType      = document.getElementById('if-cook-type').value;
    const resource      = COOK_TYPE_MAP[cookType]?.resource;
    const shelfSlots    = parseInt(document.getElementById('if-slots').value) || 1;
    const appliancePref = resource === 'oven'
      ? (document.getElementById('if-appl-pref')?.value || 'auto')
      : resource === 'hob'
        ? (document.getElementById('if-hob-pref')?.value || 'auto')
        : 'auto';
    const prepTime = parseInt(document.getElementById('if-prep').value) || 0;
    const cookTime = parseInt(document.getElementById('if-cook').value) || 0;
    const setTime  = parseInt(document.getElementById('if-set').value)  || 0;

    if (item) {
      Object.assign(item, { name, cookType, shelfSlots, appliancePref, prepTime, cookTime, setTime });
    } else {
      state.items.push({ id: uid(), name, cookType, shelfSlots, appliancePref, prepTime, cookTime, setTime, overrideCookStart: null });
    }
    saveState();
    closeModal();
    renderInputView();
  });

  document.getElementById('btn-cancel-modal').addEventListener('click', closeModal);
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('btn-delete-item')?.addEventListener('click', e => {
    removeItem(e.target.dataset.id);
    closeModal();
  });

  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); }, { once: true });
}

function slotsLabel(n) {
  return n === 1 ? '1 slot — half shelf' : '2 slots — full shelf';
}

function exportJSON() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cook-plan-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function initAppliancePopover() {
  const pop = document.getElementById('appl-popover');
  if (!pop) return;

  pop.addEventListener('toggle', e => {
    if (e.newState !== 'open') return;
    const cfg = applianceConfig();

    pop.innerHTML = `
      <div class="appl-pop-inner">
        <p class="appl-pop-title">Appliances</p>
        <div class="form-group">
          <label class="form-label">Main oven</label>
          <div class="seg-control" id="appl-main-shelves">
            <button data-val="1" class="${cfg.mainOvenShelves === 1 ? 'active' : ''}">1 shelf (2 slots)</button>
            <button data-val="2" class="${cfg.mainOvenShelves === 2 ? 'active' : ''}">2 shelves (4 slots)</button>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Combi oven / microwave</label>
          <div class="seg-control" id="appl-combi-toggle">
            <button data-val="true"  class="${cfg.hasCombi  ? 'active' : ''}">Available</button>
            <button data-val="false" class="${!cfg.hasCombi ? 'active' : ''}">Not available</button>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Hobs</label>
          <div class="seg-control" id="appl-hob-count">
            ${[2,3,4,5,6].map(n =>
              `<button data-val="${n}" class="${cfg.hobCount === n ? 'active' : ''}">${n}</button>`
            ).join('')}
          </div>
        </div>
      </div>
    `;

    pop.querySelector('#appl-main-shelves').addEventListener('click', e => {
      const btn = e.target.closest('button[data-val]');
      if (!btn) return;
      state.appliances = { ...applianceConfig(), mainOvenShelves: parseInt(btn.dataset.val) };
      saveState();
      pop.querySelectorAll('#appl-main-shelves button').forEach(b => b.classList.toggle('active', b === btn));
    });

    pop.querySelector('#appl-combi-toggle').addEventListener('click', e => {
      const btn = e.target.closest('button[data-val]');
      if (!btn) return;
      state.appliances = { ...applianceConfig(), hasCombi: btn.dataset.val === 'true' };
      saveState();
      pop.querySelectorAll('#appl-combi-toggle button').forEach(b => b.classList.toggle('active', b === btn));
    });

    pop.querySelector('#appl-hob-count').addEventListener('click', e => {
      const btn = e.target.closest('button[data-val]');
      if (!btn) return;
      state.appliances = { ...applianceConfig(), hobCount: parseInt(btn.dataset.val) };
      saveState();
      pop.querySelectorAll('#appl-hob-count button').forEach(b => b.classList.toggle('active', b === btn));
    });
  });
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

function removeItem(id) {
  state.items = state.items.filter(i => i.id !== id);
  saveState();
  if (state.view === 'schedule') renderScheduleView();
  else renderInputView();
}

// ---- Theme ----

function toggleTheme() {
  const html = document.documentElement;
  const current = html.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : current === 'light' ? null : 'dark';
  if (next) html.setAttribute('data-theme', next);
  else html.removeAttribute('data-theme');
  localStorage.setItem('cookplan_theme', next || '');
}

function applyTheme() {
  const saved = localStorage.getItem('cookplan_theme');
  if (saved) document.documentElement.setAttribute('data-theme', saved);
}

// ---- Utilities ----

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---- Init ----

function init() {
  applyTheme();
  initAppliancePopover();
  const loaded = loadState();
  if (loaded) {
    // Migrate/merge with defaults
    state = { ...DEFAULT_STATE, ...loaded, items: loaded.items || [] };
  }

  if (state.view === 'schedule' && state.items.length > 0) {
    renderScheduleView();
  } else {
    state.view = 'input';
    renderInputView();
  }
}

document.addEventListener('DOMContentLoaded', init);

// Re-acquire wake lock when page becomes visible again
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.view === 'schedule') {
    requestWakeLock();
  }
});
