// Pixel sprite data, rasterised once into canvases at start-up.
import { PAL, W, H } from './config.js';
import { hash } from './util.js';

function mk(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  return [c, x];
}

function fromRows(rows, map, flip = false) {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const [c, x] = mk(w, h);
  rows.forEach((row, j) => {
    [...row].forEach((ch, i) => {
      const col = map[ch];
      if (!col) return;
      x.fillStyle = col;
      x.fillRect(flip ? w - 1 - i : i, j, 1, 1);
    });
  });
  return c;
}

const rotCW = (rows) => {
  const h = rows.length, w = rows[0].length, out = [];
  for (let i = 0; i < w; i++) {
    let s = '';
    for (let j = 0; j < h; j++) s += rows[h - 1 - j][i];
    out.push(s);
  }
  return out;
};
const rotCCW = (rows) => {
  const h = rows.length, w = rows[0].length, out = [];
  for (let i = 0; i < w; i++) {
    let s = '';
    for (let j = 0; j < h; j++) s += rows[j][w - 1 - i];
    out.push(s);
  }
  return out;
};

// --- The hero: "Gib", a lime blob with a headband ---------------------------
const HERO = {
  o: PAL.gO, g: PAL.g, l: PAL.gL, d: PAL.gD,
  w: PAL.eye, k: PAL.pupil, y: PAL.band, Y: PAL.bandD,
};
const CHAR = {
  o: '#0c0608', g: '#2a1c1c', l: '#3b2a26', d: '#1a1012',
  w: PAL.eye, k: PAL.pupil, y: '#3b2a26', Y: '#2a1c1c',
};

const TOP = [
  '..oooo..',
  '.olllgo.',
  'oyyyyyYo',
  'ogwkgwko',
  'oggggggo',
];
const IDLE = [...TOP, 'ogdkkdgo', '.oddddo.', '..o..o..', '.oo..oo.'];
const RUN1 = [...TOP, 'ogdkkdgo', '.oddddo.', '.o...o..', 'oo...oo.'];
const RUN2 = [...TOP, 'ogdkkdgo', '.oddddo.', '...o...o', '..oo..oo'];
const FALL = [
  '..oooo..',
  '.olllgo.',
  'oyyyyyYo',
  'ogkwgkwo',
  'ogwwgwwo',
  'oggkkggo',
  '.odkkdo.',
  '.o....o.',
  'o......o',
];

// --- Gore --------------------------------------------------------------------
const GORE = {
  ...HERO, r: PAL.blood, R: PAL.bloodD, L: PAL.bloodL, b: PAL.bone, B: PAL.boneD, f: PAL.flesh,
};
const GIBS = [
  ['lg', 'dr'],
  ['gg.', 'grd', '.R.'],
  ['og', 'gr'],
  ['fr', 'rf'],
  ['rLr', 'fRr'],
  ['wr', 'wk'], // eyeball
  ['b..b', 'bBBb', 'b..b'], // bone
  ['yY'], // headband scrap
  ['dg', 'gR'],
];
const SKULL = ['.bbb.', 'bbbbb', 'bkbkb', 'bBbBb', '.b.b.'];
const BONE = ['b..b', 'bBBb', 'b..b'];
const RIB = ['bbb', 'b.b', 'bbb'];

// --- Steel ---------------------------------------------------------------------
const STEEL = { l: PAL.steelL, m: PAL.steelM, d: PAL.steelD, r: PAL.blood, R: PAL.bloodD, L: PAL.bloodL };
const SPIKE = ['.l..', '.lm.', '.lmd', 'llmd', 'lmdd'];
const SPIKE_B = ['.L..', '.rR.', '.rmd', 'lrmd', 'lmdd'];

// Procedurally rasterised spinning saw, `n` frames covering one tooth step.
// Blood pattern is tooth-periodic so the loop is seamless.
function sawFrames(r, n = 8) {
  const size = r * 2 + 1;
  const teeth = Math.max(6, Math.round(r * 1.3));
  const out = { clean: [], bloody: [] };
  const TAU = Math.PI * 2;
  for (const bloody of [false, true]) {
    for (let f = 0; f < n; f++) {
      const [c, x] = mk(size, size);
      const rot = (f / n) * (TAU / teeth);
      for (let j = 0; j < size; j++) {
        for (let i = 0; i < size; i++) {
          const dx = i - r, dy = j - r;
          const d = Math.hypot(dx, dy);
          if (d > r + 0.5) continue;
          const a = Math.atan2(dy, dx) - rot;
          const fr = ((((a / TAU) * teeth) % 1) + 1) % 1;
          const toothR = r - 2.2 + 2.7 * (1 - fr);
          let col = null;
          if (d <= r - 2) {
            if (d < 1.2) col = PAL.steelK;
            else if (d < 2.4) col = PAL.steelD;
            else if (d > r - 3) col = PAL.steelD;
            else col = (dx + dy < -r * 0.6) ? PAL.steelL : PAL.steelM;
            if (r >= 8 && d > 3.5 && d < r - 3.5 && fr < 0.18) col = PAL.steelD; // spoke grooves
          } else if (d <= toothR) {
            col = fr < 0.35 ? PAL.steelL : PAL.steelM;
          }
          if (!col) continue;
          if (bloody && d > 2.4) {
            const edge = d > r - 3.5 && fr < 0.65;
            const smear = hash(Math.round(d * 2), Math.floor(fr * 4)) < 0.28;
            if (edge || smear) {
              const hv = hash(Math.round(d * 3), Math.floor(fr * 6) + 7);
              col = fr < 0.18 ? PAL.bloodL : hv < 0.5 ? PAL.blood : PAL.bloodD;
            }
          }
          x.fillStyle = col;
          x.fillRect(i, j, 1, 1);
        }
      }
      out[bloody ? 'bloody' : 'clean'].push(c);
    }
  }
  return out;
}

// --- Environment strips ----------------------------------------------------------
function brickStrip() {
  const th = 8, [c, x] = mk(W, H + th * 2);
  x.fillStyle = PAL.mortar;
  x.fillRect(0, 0, c.width, c.height);
  for (let ty = 0; ty < c.height; ty += th) {
    for (let tx = 0; tx < W; tx += 16) {
      const courses = [[1, 3, 0], [5, 3, 8]];
      for (const [by, bh, off] of courses) {
        for (let bx = -16 + off; bx < 16; bx += 16) {
          const x0 = tx + bx + 1, x1 = tx + bx + 15;
          for (let py = ty + by; py < ty + by + bh; py++) {
            for (let px = Math.max(tx, x0); px < Math.min(tx + 16, x1); px++) {
              const hv = hash(px, py % th);
              x.fillStyle = hv < 0.08 ? PAL.brickN : (by === 1 ? PAL.brick1 : PAL.brick2);
              x.fillRect(px, py, 1, 1);
            }
          }
        }
      }
    }
  }
  return c;
}

function wallStrip(flip) {
  const th = 12, w = 6, [c, x] = mk(w, H + th * 2);
  for (let y = 0; y < c.height; y++) {
    const yy = y % th;
    for (let i = 0; i < w; i++) {
      const xi = flip ? w - 1 - i : i; // i=5 is the shaft-facing edge
      let col = PAL.wallM;
      if (yy === 0) col = PAL.wallD;
      else if (i === 5) col = PAL.wallH;
      else if (i === 4) col = PAL.wallL;
      else if (i === 0) col = PAL.wallD;
      else if (hash(i, yy) < 0.1) col = PAL.wallD;
      if (yy === 6 && i < 3) col = PAL.wallD;
      x.fillStyle = col;
      x.fillRect(xi, y, 1, 1);
    }
  }
  return c;
}

export function buildSprites() {
  const sawCache = new Map();
  const hero = (rows) => [fromRows(rows, HERO), fromRows(rows, HERO, true)];
  return {
    hero: { idle: hero(IDLE), run1: hero(RUN1), run2: hero(RUN2), fall: hero(FALL) },
    charred: fromRows(FALL, CHAR),
    corpse: fromRows(IDLE, HERO),
    halfTop: fromRows([...TOP, 'rLrrLrRr'], GORE),
    halfBot: fromRows(['RrLrrLrR', 'ogdkkdgo', '.oddddo.', '..o..o..', '.oo..oo.'], GORE),
    gibs: GIBS.map((g) => fromRows(g, GORE)),
    eyeball: fromRows(GIBS[5], GORE),
    skull: fromRows(SKULL, { ...GORE, k: PAL.pupil }),
    bone: fromRows(BONE, GORE),
    rib: fromRows(RIB, GORE),
    spike: fromRows(SPIKE, STEEL),
    spikeB: fromRows(SPIKE_B, STEEL),
    spikeR: fromRows(rotCW(SPIKE), STEEL), // points right (left wall)
    spikeRB: fromRows(rotCW(SPIKE_B), STEEL),
    spikeL: fromRows(rotCCW(SPIKE), STEEL), // points left (right wall)
    spikeLB: fromRows(rotCCW(SPIKE_B), STEEL),
    bricks: brickStrip(),
    wallLeft: wallStrip(false),
    wallRight: wallStrip(true),
    saw(r) {
      if (!sawCache.has(r)) sawCache.set(r, sawFrames(r));
      return sawCache.get(r);
    },
  };
}
