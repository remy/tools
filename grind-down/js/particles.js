// Blood drops, mist, dust and gibs. Drops stick to whatever they hit.
import { GRAV, L, R, H, PLAT_H, PAL, BLOOD, BLOOD_BG } from './config.js';
import { rand, randi, pick, chance } from './util.js';

const MAX = 3200;
const DROP = 0, MIST = 1, GIB = 2;

export class Particles {
  constructor(fx) {
    this.fx = fx;
    this.list = [];
  }

  clear() { this.list.length = 0; }

  drop(x, y, vx, vy, col = pick(BLOOD), size = 1) {
    if (this.list.length >= MAX) return;
    this.list.push({ k: DROP, x, y, vx, vy, col, size });
  }

  burst(x, y, n, { speed = [40, 200], angle = -Math.PI / 2, spread = Math.PI * 2, jitter = 2 } = {}) {
    for (let i = 0; i < n; i++) {
      const a = angle + (Math.random() - 0.5) * spread;
      const s = rand(speed[0], speed[1]);
      this.drop(x + rand(-jitter, jitter), y + rand(-jitter, jitter), Math.cos(a) * s, Math.sin(a) * s,
        pick(BLOOD), chance(0.18) ? 2 : 1);
    }
  }

  mist(x, y, n, { col = null, speed = 60, life = [0.3, 0.8], float = false, splat = true } = {}) {
    for (let i = 0; i < n; i++) {
      if (this.list.length >= MAX) return;
      const a = rand(0, Math.PI * 2), s = rand(10, speed);
      this.list.push({
        k: MIST, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        col: col || pick(BLOOD), life: rand(life[0], life[1]), float, splat, size: chance(0.3) ? 2 : 1,
      });
    }
  }

  dust(x, y, n) {
    this.mist(x, y, n, { col: PAL.dust, speed: 40, life: [0.15, 0.35], float: true, splat: false });
  }

  smoke(x, y, n) {
    this.mist(x, y, n, { col: PAL.smoke, speed: 30, life: [0.5, 1.2], float: true, splat: false });
  }

  gib(x, y, vx, vy, sprite, bleed = rand(0.5, 1.5), rate = 25) {
    this.list.push({ k: GIB, x, y, vx, vy, sprite, w: sprite.width, h: sprite.height, bleed, rate });
  }

  update(dt, camY, world) {
    const { fg, bg } = this.fx;
    const list = this.list;
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      let keep = true;

      if (p.k === DROP) {
        p.vy += GRAV * dt;
        p.vx *= 1 - 0.6 * dt;
        const oy = p.y;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.x < L) {
          fg.pset(L - 1, p.y, p.col);
          if (chance(0.3)) fg.pset(L - 2, p.y, p.col);
          if (chance(0.12)) for (let k = 1, m = randi(2, 7); k < m; k++) fg.pset(L - 1, p.y + k, PAL.bloodD);
          keep = false;
        } else if (p.x >= R) {
          fg.pset(R, p.y, p.col);
          if (chance(0.3)) fg.pset(R + 1, p.y, p.col);
          if (chance(0.12)) for (let k = 1, m = randi(2, 7); k < m; k++) fg.pset(R, p.y + k, PAL.bloodD);
          keep = false;
        } else {
          const row = world.rowAt(p.x, p.y);
          if (row) {
            const top = oy < row.y + 1;
            const py = top ? row.y + (chance(0.25) ? 1 : 0) : row.y + PLAT_H - 1;
            fg.pset(p.x, py, p.col, p.size, 1);
            if (top && chance(0.07)) {
              for (let k = 0, m = randi(1, 4); k < m; k++) fg.pset(p.x, row.y + PLAT_H + k, k ? PAL.bloodD : PAL.blood);
            }
            keep = false;
          } else if (world.absorb(p.x, p.y)) {
            keep = false;
          }
        }
        if (p.y > camY + H + 120 || p.y < camY - 80) keep = false;
      } else if (p.k === MIST) {
        p.life -= dt;
        p.vx *= 1 - 3 * dt;
        p.vy *= 1 - 3 * dt;
        p.vy += (p.float ? -30 : GRAV * 0.25) * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.life <= 0) {
          if (p.splat && chance(0.6) && p.x > L && p.x < R) bg.pset(p.x, p.y, pick(BLOOD_BG), p.size, p.size);
          keep = false;
        }
      } else {
        // GIB
        p.vy += GRAV * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.x < L) { p.x = L; p.vx = -p.vx * 0.4; fg.pset(L - 1, p.y + 1, PAL.blood); }
        if (p.x + p.w > R) { p.x = R - p.w; p.vx = -p.vx * 0.4; fg.pset(R, p.y + 1, PAL.blood); }
        const hit = world.overlapSeg(p.x, p.y, p.w, p.h);
        if (hit) {
          const { row } = hit;
          if (p.vy > 0) {
            p.y = row.y - p.h;
            for (let k = 0; k < p.w; k++) if (chance(0.6)) fg.pset(p.x + k, row.y, pick(BLOOD));
            if (p.vy > 50) {
              if (p.bleed > 0) this.burst(p.x + p.w / 2, row.y - 1, randi(3, 8), { speed: [30, 90], spread: 1.6 });
              p.vy = -p.vy * 0.3;
              p.vx *= 0.7;
            } else {
              p.vy = 0;
              p.vx *= 1 - 10 * dt;
              if (Math.abs(p.vx) > 5 && chance(0.5)) fg.pset(p.x + p.w / 2, row.y, PAL.blood);
            }
          } else {
            p.y = row.y + PLAT_H;
            p.vy = 0;
          }
        }
        const t = world.absorb(p.x + p.w / 2, p.y + p.h / 2, true);
        if (t) {
          this.burst(p.x + p.w / 2, p.y + p.h / 2, 18, { speed: [40, 180] });
          this.mist(p.x + p.w / 2, p.y + p.h / 2, 6);
          keep = false;
        }
        if (p.bleed > 0) {
          p.bleed -= dt;
          if (chance(dt * p.rate)) this.drop(p.x + p.w / 2, p.y + p.h / 2, p.vx * 0.3 + rand(-20, 20), p.vy * 0.3 + rand(-30, 0));
        }
        if (p.y > camY + H + 120 || p.y < camY - 80) keep = false;
      }

      if (keep) list[n++] = p;
    }
    list.length = n;
  }

  draw(ctx, camY) {
    for (const p of this.list) {
      if (p.k === GIB) {
        ctx.drawImage(p.sprite, Math.round(p.x), Math.round(p.y - camY));
      } else {
        ctx.fillStyle = p.col;
        ctx.fillRect(Math.round(p.x), Math.round(p.y - camY), p.size, p.size);
      }
    }
  }
}
