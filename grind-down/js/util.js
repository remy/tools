export const rand = (a, b) => a + Math.random() * (b - a);
export const randi = (a, b) => Math.floor(rand(a, b + 1));
export const chance = (p) => Math.random() < p;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Seeded generator (mulberry32) for the level layout, so every run is the same shaft.
let seedState = 0;
export const reseed = (n) => { seedState = n >>> 0; };
const next = () => {
  let t = (seedState = (seedState + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
export const seeded = {
  rand: (a, b) => a + next() * (b - a),
  randi: (a, b) => Math.floor(a + next() * (b + 1 - a)),
  chance: (p) => next() < p,
  pick: (arr) => arr[Math.floor(next() * arr.length)],
};

export function overlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

export function circleRect(cx, cy, r, x, y, w, h) {
  const px = clamp(cx, x, x + w);
  const py = clamp(cy, y, y + h);
  const dx = cx - px, dy = cy - py;
  return dx * dx + dy * dy < r * r;
}

// Deterministic 0..1 hash for pixel patterns.
export function hash(x, y) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem('grind-down.' + key);
      return v === null ? fallback : JSON.parse(v);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem('grind-down.' + key, JSON.stringify(value)); } catch { /* storage unavailable */ }
  },
};
