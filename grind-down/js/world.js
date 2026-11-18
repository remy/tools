// The shaft: rows of platforms with gaps, plus the traps hung between them.
import { L, R, H, PLAT_H, PAL, PX_PER_M } from './config.js';
import { rand, randi, chance, clamp, pick, overlap } from './util.js';
import { FloorSaw, Pendulum, FlySaw, Spikes, WallSpikes, Laser } from './traps.js';

export const START_Y = 130;

export class World {
  constructor() {
    this.onRow = null;
    this.reset();
  }

  reset() {
    this.rows = [];
    this.traps = [];
    this.nextY = START_Y;
    this.count = 0;
  }

  generate(untilY) {
    while (this.nextY < untilY) {
      const y = this.nextY;
      const gap = randi(46, 60);
      const row = this.makeRow(y, this.count, gap);
      this.rows.push(row);
      this.onRow?.(row);
      this.nextY += gap;
      this.count++;
    }
  }

  makeRow(y, idx, gap) {
    const depth = y / PX_PER_M;
    const d = clamp(depth / 500, 0, 1);
    const gw = () => Math.round(rand(24 - 6 * d, 32 - 8 * d));
    let gaps;
    if (idx === 0) gaps = [[R - 34, 26]];
    else if (chance(0.2 + 0.25 * d)) {
      const a = gw(), b = gw(), mid = (L + R) >> 1;
      gaps = [[randi(L, mid - a - 8), a], [randi(mid + 8, R - b), b]];
    } else {
      const g = gw();
      gaps = [[randi(L, R - g), g]];
    }
    const segs = [];
    let x = L;
    for (const [gx, g] of gaps) {
      if (gx - x >= 4) segs.push({ x0: x, x1: gx });
      x = gx + g;
    }
    if (R - x >= 4) segs.push({ x0: x, x1: R });
    const row = { y, idx, segs, gap };
    if (idx >= 3) this.addTraps(row, depth, d);
    return row;
  }

  addTraps(row, depth, d) {
    const add = (t) => { t.bloody = chance(0.25); this.traps.push(t); return t; };
    const wide = (min) => row.segs.filter((s) => s.x1 - s.x0 >= min);

    // On the platform
    if (chance(0.45 + 0.35 * d)) {
      const type = depth > 10 && chance(0.45) ? 'saw' : 'spikes';
      if (type === 'spikes') {
        const segs = wide(18);
        if (segs.length) {
          const s = pick(segs), len = s.x1 - s.x0;
          const maxN = Math.max(2, Math.min(Math.floor((len - 8) / 4), 5 + Math.floor(5 * d)));
          const n = randi(2, maxN);
          add(new Spikes(s.x0 + randi(0, len - 4 * n), n, row.y));
        }
      } else {
        const segs = wide(30);
        if (segs.length) {
          const s = pick(segs);
          add(new FloorSaw(s.x0, s.x1, row.y, 22 + 40 * d));
        }
      }
    }

    // In the air below
    const mid = row.y + PLAT_H + Math.round((row.gap - PLAT_H) / 2);
    if (depth > 45 && chance(0.15 + 0.45 * d)) {
      const opts = ['pendulum'];
      if (depth > 70) opts.push('flysaw', 'flysaw');
      if (depth > 100) opts.push('laser', 'laser');
      const type = pick(opts);
      if (type === 'pendulum') {
        const segs = wide(10);
        if (segs.length) {
          const s = pick(segs);
          const len = randi(14, Math.min(22, row.gap - PLAT_H - 16));
          add(new Pendulum(randi(s.x0 + 4, s.x1 - 4), row.y + PLAT_H, len, rand(2, 2.8) + d));
        }
      } else if (type === 'flysaw') {
        add(new FlySaw(mid, (chance(0.5) ? 1 : -1) * (35 + 45 * d)));
      } else {
        add(new Laser(mid, 2.6 - 0.8 * d));
      }
    }

    // On the walls
    if (depth > 30 && chance(0.1 + 0.35 * d)) {
      const n = randi(3, 6), y0 = row.y + PLAT_H + 2;
      const side = d > 0.5 && chance(0.3) ? 'both' : pick(['left', 'right']);
      if (side !== 'right') add(new WallSpikes('left', y0, n));
      if (side !== 'left') add(new WallSpikes('right', y0, n));
    }
  }

  prune(camY) {
    const min = camY - 30;
    if (this.rows.length && this.rows[0].y + PLAT_H < min) this.rows = this.rows.filter((r) => r.y + PLAT_H >= min);
    this.traps = this.traps.filter((t) => t.y1 >= min);
  }

  rowAt(x, y) {
    for (const row of this.rows) {
      if (row.y > y) break;
      if (y < row.y + PLAT_H) {
        for (const s of row.segs) if (x >= s.x0 && x < s.x1) return row;
      }
    }
    return null;
  }

  overlapSeg(x, y, w, h) {
    for (const row of this.rows) {
      if (row.y >= y + h) break;
      if (row.y + PLAT_H <= y) continue;
      for (const seg of row.segs) {
        if (x < seg.x1 && x + w > seg.x0) return { row, seg };
      }
    }
    return null;
  }

  absorb(x, y, sawsOnly = false) {
    for (const t of this.traps) {
      if (y < t.y0 || y > t.y1) continue;
      if (sawsOnly && !t.isSaw) continue;
      if (t.absorb(x, y)) return t;
    }
    return null;
  }

  hitTest(p) {
    for (const t of this.traps) {
      if (t.y1 < p.y || t.y0 > p.y + p.h) continue;
      const cause = t.hit(p);
      if (cause) return { cause, trap: t };
    }
    return null;
  }

  update(dt, fx, camY) {
    for (const t of this.traps) if (t.y0 < camY + H + 100) t.update(dt, fx, camY);
  }

  drawTraps(ctx, camY, sp, layer) {
    for (const t of this.traps) {
      if (t.y1 < camY - 8 || t.y0 > camY + H + 8) continue;
      t.draw(ctx, camY, sp, layer);
    }
  }

  drawRows(ctx, camY) {
    for (const row of this.rows) {
      const y = row.y - camY;
      if (y < -PLAT_H || y > H) continue;
      for (const s of row.segs) drawPlat(ctx, s.x0, y, s.x1 - s.x0);
    }
  }
}

function drawPlat(ctx, x, y, w) {
  ctx.fillStyle = PAL.platD;
  ctx.fillRect(x, y, w, PLAT_H);
  ctx.fillStyle = PAL.platM;
  ctx.fillRect(x, y + 2, w, 2);
  ctx.fillStyle = PAL.steelL;
  ctx.fillRect(x, y, w, 1);
  ctx.fillStyle = PAL.steelM;
  ctx.fillRect(x, y + 1, w, 1);
  ctx.fillStyle = PAL.rivet;
  ctx.fillRect(x, y + PLAT_H - 1, w, 1);
  for (let i = x + (((3 - x) % 8) + 8) % 8; i < x + w - 1; i += 8) ctx.fillRect(i, y + 3, 1, 1);
  ctx.fillStyle = PAL.platD;
  if (x > L) ctx.fillRect(x, y + 1, 1, PLAT_H - 1);
  if (x + w < R) ctx.fillRect(x + w - 1, y + 1, 1, PLAT_H - 1);
}
