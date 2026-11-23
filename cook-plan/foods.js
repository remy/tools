// =============================================
// Cook Planner — foods.js
//
// A small catalogue of the things that actually turn up at a roast, with the
// timings most recipes agree on. Two jobs:
//
// 1. Autocomplete. Typing "parsn" offers "Parsnips" and, with it, a cook type
//    and a set of times — the tedious part of adding a dish.
// 2. Tray pairing. The main oven's shelves hold two half-shelf slots each, so
//    something has to decide which two dishes end up side by side. Potatoes and
//    parsnips want the same heat and the same fat and can go in one big tray;
//    a crumble next to salmon is a worse idea. `pairScore` is what the shelf
//    allocator in appliances.js consults to make that call.
//
// `family` groups things that are interchangeable on a tray. `heat` stands in
// for an oven temperature the planner doesn't otherwise model — hot is roughly
// 200°C+, mid 180–190°C, low 150–170°C. `tray` says whether a dish is loose on
// a baking tray ('open', so it can share one) or sealed in its own dish or tin
// ('dish' — happy to share a shelf, but never a tray).
//
// `serve` is the hands-on job between resting and eating — carving a joint,
// turning out a pudding. Nearly everything is zero: a tray of parsnips goes
// from the oven to the table.
// =============================================

// name, cookType, prep, cook, rest, serve, slots, family, heat, tray
const RAW = [
  // ── Big roasts ──
  ['Turkey',               'oven', 20, 180, 30, 20, 2, 'poultry',  'mid', 'dish'],
  ['Turkey crown',         'oven', 15, 120, 25, 15, 2, 'poultry',  'mid', 'dish'],
  ['Roast chicken',        'oven', 10,  90, 15, 10, 2, 'poultry',  'mid', 'dish'],
  ['Chicken thighs',       'oven',  5,  45,  5,  0, 1, 'poultry',  'mid', 'open'],
  ['Roast duck',           'oven', 15, 120, 20, 10, 2, 'poultry',  'mid', 'dish'],
  ['Roast goose',          'oven', 20, 150, 30, 15, 2, 'poultry',  'mid', 'dish'],
  ['Beef joint',           'oven', 15,  90, 25, 10, 2, 'red-meat', 'hot', 'dish'],
  ['Rib of beef',          'oven', 20, 120, 30, 15, 2, 'red-meat', 'hot', 'dish'],
  ['Leg of lamb',          'oven', 15, 105, 25, 10, 2, 'red-meat', 'mid', 'dish'],
  ['Shoulder of lamb',     'oven', 15, 240, 30, 10, 2, 'red-meat', 'low', 'dish'],
  ['Pork loin',            'oven', 15, 100, 20, 10, 2, 'red-meat', 'mid', 'dish'],
  ['Pork belly',           'oven', 20, 150, 15, 10, 2, 'red-meat', 'low', 'dish'],
  ['Gammon joint',         'oven', 15, 120, 15, 10, 2, 'red-meat', 'mid', 'dish'],
  ['Beef Wellington',      'oven', 30,  40, 15,  5, 2, 'pastry',   'hot', 'dish'],
  ['Nut roast',            'oven', 20,  50, 10,  5, 1, 'veg-bake', 'mid', 'dish'],

  // ── Roast veg: the tray-sharers ──
  ['Roast potatoes',       'oven', 20,  55,  0,  0, 2, 'root-veg', 'hot', 'open'],
  ['Hasselback potatoes',  'oven', 20,  60,  0,  0, 2, 'root-veg', 'hot', 'open'],
  ['Parsnips',             'oven', 10,  40,  0,  0, 1, 'root-veg', 'hot', 'open'],
  ['Honey-roast carrots',  'oven', 10,  35,  0,  0, 1, 'root-veg', 'hot', 'open'],
  ['Roast swede',          'oven', 10,  45,  0,  0, 1, 'root-veg', 'hot', 'open'],
  ['Roast beetroot',       'oven', 10,  50,  0,  0, 1, 'root-veg', 'hot', 'open'],
  ['Sweet potatoes',       'oven', 10,  40,  0,  0, 1, 'root-veg', 'hot', 'open'],
  ['Roast veg medley',     'oven', 15,  40,  0,  0, 2, 'root-veg', 'hot', 'open'],
  ['Roast onions',         'oven',  5,  35,  0,  0, 1, 'allium',   'hot', 'open'],
  ['Roast shallots',       'oven',  5,  30,  0,  0, 1, 'allium',   'hot', 'open'],
  ['Roast leeks',          'oven',  5,  30,  0,  0, 1, 'allium',   'mid', 'open'],
  ['Roast sprouts',        'oven',  8,  25,  0,  0, 1, 'brassica', 'hot', 'open'],
  ['Roast cauliflower',    'oven',  8,  30,  0,  0, 1, 'brassica', 'hot', 'open'],
  ['Roast broccoli',       'oven',  5,  20,  0,  0, 1, 'brassica', 'hot', 'open'],

  // ── Trimmings ──
  ['Pigs in blankets',     'oven', 10,  30,  0,  0, 1, 'sausage',  'mid', 'open'],
  ['Pork sausages',        'oven',  2,  30,  0,  0, 1, 'sausage',  'mid', 'open'],
  ['Stuffing balls',       'oven', 10,  30,  0,  0, 1, 'stuffing', 'mid', 'open'],
  ['Sage & onion stuffing','oven', 10,  35,  0,  0, 1, 'stuffing', 'mid', 'dish'],
  ['Yorkshire puddings',   'oven', 10,  22,  0,  0, 1, 'batter',   'hot', 'dish'],
  ['Toad in the hole',     'oven', 15,  40,  0,  0, 2, 'batter',   'hot', 'dish'],
  ['Pork crackling',       'oven',  5,  25,  0,  0, 1, 'red-meat', 'hot', 'open'],
  ['Cauliflower cheese',   'oven', 20,  30,  5,  0, 2, 'veg-bake', 'mid', 'dish'],
  ['Dauphinoise potatoes', 'oven', 20,  75, 10,  5, 2, 'veg-bake', 'mid', 'dish'],
  ['Bread rolls',          'oven',  2,  10,  0,  0, 1, 'bread',    'hot', 'open'],
  ['Garlic bread',         'oven',  2,  15,  0,  0, 1, 'bread',    'hot', 'open'],
  ['Salmon fillets',       'oven',  5,  20,  5,  0, 1, 'fish',     'mid', 'open'],

  // ── Hob ──
  ['Mashed potatoes',      'boil', 15,  20,  0,  0, 1, 'root-veg', 'mid', 'open'],
  ['Boiled potatoes',      'boil', 10,  20,  0,  0, 1, 'root-veg', 'mid', 'open'],
  ['Brussels sprouts',     'boil', 10,   8,  0,  0, 1, 'brassica', 'mid', 'open'],
  ['Carrots',              'boil',  5,  15,  0,  0, 1, 'root-veg', 'mid', 'open'],
  ['Green beans',          'boil',  3,   6,  0,  0, 1, 'brassica', 'mid', 'open'],
  ['Garden peas',          'boil',  2,   5,  0,  0, 1, 'brassica', 'mid', 'open'],
  ['Cauliflower',          'boil',  5,  10,  0,  0, 1, 'brassica', 'mid', 'open'],
  ['Broccoli',             'boil',  3,   6,  0,  0, 1, 'brassica', 'mid', 'open'],
  ['Red cabbage',          'pan',  10,  45,  0,  0, 1, 'brassica', 'mid', 'dish'],
  ['Gravy',                'pan',   5,  15,  0,  0, 1, 'sauce',    'mid', 'dish'],
  ['Bread sauce',          'pan',   5,  15,  0,  0, 1, 'sauce',    'mid', 'dish'],
  ['Cranberry sauce',      'pan',   5,  10,  0,  0, 1, 'sauce',    'mid', 'dish'],

  // ── Pudding ──
  ['Apple crumble',        'oven', 20,  40, 10,  0, 2, 'dessert',  'mid', 'dish'],
  ['Apple pie',            'oven', 15,  45, 10,  5, 2, 'dessert',  'mid', 'dish'],
  ['Christmas pudding',    'boil',  5, 120,  0,  5, 1, 'dessert',  'mid', 'dish'],
  ['Mince pies',           'oven',  2,  18,  0,  0, 1, 'dessert',  'mid', 'open'],
];

export const FOODS = RAW.map(
  ([name, cookType, prepTime, cookTime, setTime, servePrep, shelfSlots, family, heat, tray]) => ({
    name, cookType, prepTime, cookTime, setTime, servePrep, shelfSlots, family, heat, tray,
  })
);

export const FOOD_NAMES = FOODS.map(f => f.name);

const BY_KEY = new Map(FOODS.map(f => [normalise(f.name), f]));

function normalise(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// An exact (if punctuation-insensitive) hit only. Suggesting times for a dish
// the cook didn't name is worse than suggesting nothing: "Roast potatoes" must
// not quietly answer for "Potato salad".
export function lookupFood(name) {
  return BY_KEY.get(normalise(name)) || null;
}

// The tray-pairing model.
//
// Families that roast alike, so swapping one for the other on a tray changes
// nothing that matters.
const AFFINITY_GROUPS = [
  ['root-veg', 'allium', 'brassica'],   // all go in hot fat and come out together
  ['sausage', 'stuffing'],              // the trimmings tray
  ['bread', 'pastry'],
];

const HEAT_INDEX = { low: 0, mid: 1, hot: 2 };

// Flavours that shouldn't meet in the same fat, whatever their temperatures say.
function clashes(a, b) {
  const sweet = f => f.family === 'dessert';
  if (sweet(a) !== sweet(b)) return true;              // pudding beside the meat
  const fish = f => f.family === 'fish';
  const strong = f => ['sausage', 'stuffing', 'red-meat', 'allium'].includes(f.family);
  if ((fish(a) && strong(b)) || (fish(b) && strong(a))) return true;
  return false;
}

function sameGroup(a, b) {
  return AFFINITY_GROUPS.some(g => g.includes(a.family) && g.includes(b.family));
}

// How well two dishes sit next to each other on one shelf.
//
//   +3  the same thing, near enough — one big tray (potatoes + parsnips)
//   +2  different but cooked alike (parsnips + roast onions)
//    0  no opinion: unknown dish, or each sealed in its own dish
//   -2  wants a markedly different oven temperature
//   -3  shouldn't share the fat at all
//
// Anything above 0 is a nudge towards putting them together; anything below is
// a reason to use the other shelf first. `null` inputs (a dish not in the
// catalogue) score 0 — an unknown is no reason to shuffle the oven around.
export function pairScore(a, b) {
  if (!a || !b) return 0;
  if (clashes(a, b)) return -3;

  const heatGap = Math.abs((HEAT_INDEX[a.heat] ?? 1) - (HEAT_INDEX[b.heat] ?? 1));
  if (heatGap >= 2) return -2;

  // Each in its own dish or tin: they can share the shelf, but there is no tray
  // to share, so neither one is a reason to prefer this shelf over an empty one.
  if (a.tray !== 'open' || b.tray !== 'open') return 0;

  if (a.family === b.family) return heatGap === 0 ? 3 : 2;
  if (sameGroup(a, b)) return heatGap === 0 ? 2 : 1;
  return 0;
}

// Would these two actually go in one tray together? Used for the "share a tray"
// note on the timeline, which should only appear when it's genuinely useful
// advice rather than whenever two things happen to land on the same shelf.
export function sharesTray(a, b) {
  return pairScore(a, b) >= 2;
}
