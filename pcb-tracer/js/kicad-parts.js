"use strict";

/* ==========================================================================
   A4. KiCad: what a footprint actually is
   --------------------------------------------------------------------------
   Nowhere does a .kicad_pcb say "0402 SMD capacitor, 1.5nF" -- there is no
   such field. What it carries is a reference designator, a value, the library
   footprint name, a free-text (descr …), (tags …) and an (attr smd), and the
   readable summary is assembled out of those. Every piece of it is a guess of
   some sort, so the footprint name and description are always shown verbatim
   alongside: the derivation is a convenience on top of the file's own words,
   never a replacement for them.
   ========================================================================== */

/** Reference designator prefixes, following KiCad's own symbol libraries.
    The prefix is the most reliable signal of what a part is -- a footprint
    name may be a house library with no clue in it, and tags are free text. */
const REF_KIND = {
  R: 'resistor', RN: 'resistor network', RV: 'potentiometer', RT: 'thermistor',
  C: 'capacitor', CN: 'capacitor network', L: 'inductor', FB: 'ferrite bead',
  FL: 'filter', D: 'diode', LED: 'LED', DZ: 'zener diode', Q: 'transistor',
  U: 'IC', IC: 'IC', J: 'connector', P: 'connector', CON: 'connector',
  X: 'crystal', Y: 'crystal', XTAL: 'crystal', G: 'oscillator',
  SW: 'switch', S: 'switch', BT: 'battery', B: 'battery', F: 'fuse',
  TP: 'test point', JP: 'jumper', MH: 'mounting hole', MP: 'mounting hole',
  H: 'hardware', K: 'relay', T: 'transformer', VR: 'regulator',
  AE: 'antenna', ANT: 'antenna', LS: 'speaker', M: 'motor', MK: 'microphone',
  DS: 'display', HS: 'heatsink',
};

/** KiCad's own footprint libraries are named after what is in them, which is
    the next best clue after the designator -- and the only clue at all on a
    board whose references are net names (VCC, GND) rather than R1 and C2. */
const LIB_KIND = {
  capacitor: 'capacitor', resistor: 'resistor', inductor: 'inductor',
  diode: 'diode', led: 'LED', crystal: 'crystal', oscillator: 'oscillator',
  connector: 'connector', testpoint: 'test point', mountinghole: 'mounting hole',
  jumper: 'jumper', fuse: 'fuse', varistor: 'varistor', ferrite: 'ferrite bead',
  button: 'switch', switch: 'switch', relay: 'relay', battery: 'battery',
  potentiometer: 'potentiometer', package: 'IC', transistor: 'transistor',
  sensor: 'sensor', buzzer: 'buzzer', display: 'display', motor: 'motor',
  transformer: 'transformer', heatsink: 'heatsink', rf: 'RF module',
};

/** Imperial chip codes and their metric names -- the pairing KiCad's own
    footprint names use, as in C_0402_1005Metric. */
const CHIP_METRIC = {
  '0075': '0402', '0100': '0603', '0201': '0603', '0402': '1005',
  '0603': '1608', '0805': '2012', '1206': '3216', '1210': '3225',
  '1218': '3246', '1806': '4516', '1812': '4532', '2010': '5025',
  '2512': '6332', '2920': '7451',
};

/* SOT/TO before the plain SO, or "SOT-23" is read as an "SO" package with a
   stray T after it. Longest-first is the rule throughout. */
const PKG_RE = /\b(TSOP-II|TSOP-I|TSOP|TSSOP|TVSOP|VSSOP|SSOP|MSOP|SOT-?\d+[A-Za-z]?|TO-?\d+[A-Za-z]*|DO-?\d+|SOIC|SOP|SO|QFN|DFN|WSON|LQFP|TQFP|QFP|LGA|BGA|PLCC|CDIP|DIP|SIP|SMA|SMB|SMC)(?:[-_](\d+))?/i;

/** "Capacitor_SMD:C_0402_1005Metric" -> "C_0402_1005Metric". */
function shortFootprint(lib) {
  const i = String(lib || '').indexOf(':');
  return i < 0 ? String(lib || '') : String(lib).slice(i + 1);
}

/** "0402 (1005 metric)" or "SOIC-28" or '' -- best effort from the footprint
    name, which is the only place the package size is ever written down. */
function partPackage(short) {
  const chip = /(?:^|[_-])(\d{4})(?:[_-]|$)/.exec(short);
  if (chip && CHIP_METRIC[chip[1]])
    return chip[1] + ' (' + CHIP_METRIC[chip[1]] + ' metric)';
  const m = PKG_RE.exec(short);
  if (!m) return '';
  return m[2] ? m[1].toUpperCase() + '-' + m[2] : m[1].toUpperCase();
}

const refPrefix = ref => (/^([A-Za-z]+)/.exec(ref || '') || ['', ''])[1];

/** "capacitor", from the designator, then the library, then (tags …) --
    most standard first, freest text last. */
function partKind(ref, lib, tags) {
  const byRef = REF_KIND[refPrefix(ref).toUpperCase()];
  if (byRef) return byRef;
  const i = String(lib || '').indexOf(':');
  const byLib = i > 0 && LIB_KIND[lib.slice(0, i).split('_')[0].toLowerCase()];
  if (byLib) return byLib;
  const t = String(tags || '').trim().split(/\s+/)[0];
  return /^[a-z][a-z-]{2,}$/.test(t) ? t : '';
}

/** KiCad fills an unset value in with a placeholder rather than leaving it
    blank -- the footprint's own name, the designator, or just "C" for a
    capacitor -- and none of those tell you anything you can't already see. */
function partValue(raw, ref, lib) {
  const v = String(raw || '').trim();
  const same = s => s && v.toLowerCase() === String(s).toLowerCase();
  return same(shortFootprint(lib)) || same(ref) || same(refPrefix(ref)) ? '' : v;
}

/** A KiCad library description carries a datasheet URL and a note about the
    generator that wrote it. Neither is readable in a two-line box, and neither
    is the part -- the useful sentence is what is left. */
function partDescription(raw) {
  return String(raw || '')
    .replace(/\s*\(\s*https?:\/\/[^)]*\)/g, '')
    .replace(/[,;]?\s*generated with .*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** The meta line, as parts to join with a separator:
    ["SMD capacitor", "0402 (1005 metric)", "front", "2 pads"] */
function partSummary(c) {
  const bits = [];
  const mount = c.attr === 'smd' ? 'SMD'
              : c.attr === 'through_hole' ? 'Through-hole' : '';
  const kind = partKind(c.ref, c.lib, c.tags);
  if (mount || kind) bits.push([mount, kind].filter(Boolean).join(' '));
  const pkg = partPackage(shortFootprint(c.lib));
  if (pkg) bits.push(pkg);
  bits.push(c.side === 'b' ? 'back' : 'front');
  bits.push(c.pads.length + ' pad' + (c.pads.length === 1 ? '' : 's'));
  // (attr virtual) is a BOM flag rather than a mounting style, so it reads as
  // a note at the end instead of turning into a "Virtual test point"
  if (c.attr === 'virtual') bits.push('board only');
  return bits;
}

/* ---- boxes, for the hit area a footprint occupies ---------------------- */

const newBox = () => [Infinity, Infinity, -Infinity, -Infinity];
const boxOk = b => Number.isFinite(b[0]);

function putBox(b, x, y, r) {
  r = r || 0;
  if (x - r < b[0]) b[0] = x - r;
  if (y - r < b[1]) b[1] = y - r;
  if (x + r > b[2]) b[2] = x + r;
  if (y + r > b[3]) b[3] = y + r;
}

/** Footprint-local extent of one fp_* graphic. Deliberately approximate: this
    only has to bound the part well enough to point at, not draw it -- an arc
    is bounded by its three given points rather than by its true sweep. */
function growBox(b, g) {
  for (const k of ['start', 'mid', 'end', 'center']) {
    const p = kid(g, k);
    if (p) putBox(b, f(p[1]), f(p[2]));
  }
  if (/circle$/.test(g[0])) {
    const c = kid(g, 'center'), e = kid(g, 'end');
    if (c && e) putBox(b, f(c[1]), f(c[2]), Math.hypot(f(e[1]) - f(c[1]), f(e[2]) - f(c[2])));
  }
  for (const p of ptsOf(g)) putBox(b, p[0], p[1]);
}

const unionBox = (...boxes) => {
  const out = newBox();
  for (const b of boxes) if (boxOk(b)) { putBox(out, b[0], b[1]); putBox(out, b[2], b[3]); }
  return boxOk(out) ? out : null;
};
