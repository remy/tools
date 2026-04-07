// =============================================
// Cook Planner — constants.js
// =============================================

export const COOK_TYPES = [
  { id: 'oven',      label: 'Oven',      icon: '🔥', resource: 'oven' },
  { id: 'microwave', label: 'Microwave', icon: '📡', resource: 'combi' },
  { id: 'boil',      label: 'Boil',      icon: '💧', resource: 'hob' },
  { id: 'pan',       label: 'Pan',       icon: '🍳', resource: 'hob' },
  { id: 'fry',       label: 'Fry',       icon: '🥘', resource: 'hob' },
  { id: 'none',      label: 'Prep only', icon: '🔪', resource: 'none' },
];

export const COOK_TYPE_MAP = Object.fromEntries(COOK_TYPES.map(t => [t.id, t]));

// Main oven: 2 shelves x 2 slots each = 4 slots total
// Combi: 1 shelf = 2 slots, mode: oven or microwave
// Hobs: 5 independent
export const RESOURCES = {
  mainOven: { label: 'Main Oven', totalSlots: 4 },
  combi:    { label: 'Combi Oven/MW', totalSlots: 2 },
  hobs:     { label: 'Hobs', total: 5 },
};

export const COMBI_COOLDOWN = 5; // minutes between oven->microwave switch

export const EV_TYPE_CHIP = {
  prep:       'PREP',
  cook_start: 'IN',
  cook_end:   'OUT',
  set:        'REST',
  ready:      'READY',
  serve:      '',
};

export const DEFAULT_STATE = {
  view: 'input',
  mode: 'end',       // 'start' | 'end'
  targetTime: '17:00',
  items: [],
  appliances: { mainOvenShelves: 2, hasCombi: true, hobCount: 5 },
  snapMins: 0,
};
