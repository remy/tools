// Persistent paint layers in world space, chunked so the shaft can be infinite.
import { W, H } from './config.js';
import { pick, rand, randi, chance } from './util.js';

const CH = 256;

export class Decals {
  constructor() { this.chunks = new Map(); }

  clear() { this.chunks.clear(); }

  chunk(i) {
    let c = this.chunks.get(i);
    if (!c) {
      c = document.createElement('canvas');
      c.width = W; c.height = CH;
      c.ctx = c.getContext('2d');
      this.chunks.set(i, c);
    }
    return c;
  }

  pset(x, y, col, w = 1, h = 1) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || x >= W) return;
    const i = Math.floor(y / CH);
    const c = this.chunk(i);
    c.ctx.fillStyle = col;
    c.ctx.fillRect(x, y - i * CH, w, h);
  }

  // Radial splatter: blob plus streaky rays.
  splat(x, y, r, cols) {
    for (let j = -r; j <= r; j++) {
      for (let i = -r; i <= r; i++) {
        const d = Math.hypot(i, j) / r;
        if (d <= 1 && Math.random() < 0.9 * (1 - d) ** 1.4) this.pset(x + i, y + j, pick(cols));
      }
    }
    const rays = randi(6, 12);
    for (let k = 0; k < rays; k++) {
      const a = rand(0, Math.PI * 2), len = rand(r * 0.6, r * 2.2);
      for (let s = r * 0.3; s < len; s += 1) {
        if (chance(1 - s / len)) this.pset(x + Math.cos(a) * s, y + Math.sin(a) * s, pick(cols));
      }
      if (chance(0.5)) this.pset(x + Math.cos(a) * len, y + Math.sin(a) * len, pick(cols), 2, 2);
    }
  }

  draw(ctx, camY) {
    const i0 = Math.floor(camY / CH), i1 = Math.floor((camY + H) / CH);
    for (let i = i0; i <= i1; i++) {
      const c = this.chunks.get(i);
      if (c) ctx.drawImage(c, 0, i * CH - camY);
    }
  }

  prune(camY) {
    const min = Math.floor(camY / CH) - 1;
    for (const k of this.chunks.keys()) if (k < min) this.chunks.delete(k);
  }
}
