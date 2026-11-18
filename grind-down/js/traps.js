// Every way to die. Layers: 0 behind platforms, 1 on platforms (under blood), 2 in front.
import { L, R, H, PLAT_H, PAL } from './config.js';
import { rand, clamp, chance, circleRect, overlap } from './util.js';

class Trap {
  constructor(y0, y1) {
    this.y0 = y0; this.y1 = y1;
    this.bloody = false;
  }
  update() {}
  draw() {}
  hit() { return null; }
  absorb() { return false; }
}

class SawBase extends Trap {
  constructor(r, y0, y1) {
    super(y0, y1);
    this.isSaw = true;
    this.r = r;
    this.spin = Math.random() * 8;
    this.dir = chance(0.5) ? 1 : -1;
    this.cx = 0; this.cy = 0;
  }
  update(dt, fx, camY) {
    this.spin += dt * 30 * this.dir;
    const onScreen = this.cy > camY - 20 && this.cy < camY + H + 20;
    if (this.bloody && onScreen && chance(dt * 6)) this.fling(fx);
  }
  fling(fx) {
    const a = rand(0, Math.PI * 2);
    const x = this.cx + Math.cos(a) * (this.r + 1.5);
    const y = this.cy + Math.sin(a) * (this.r + 1.5);
    const s = rand(60, 140) * this.dir;
    fx.particles.drop(x, y, -Math.sin(a) * s, Math.cos(a) * s);
  }
  drawSaw(ctx, camY, sp) {
    const frames = sp.saw(this.r)[this.bloody ? 'bloody' : 'clean'];
    let f = Math.floor(this.spin) % frames.length;
    if (f < 0) f += frames.length;
    ctx.drawImage(frames[f], Math.round(this.cx - this.r), Math.round(this.cy - this.r - camY));
  }
  hit(p) {
    return circleRect(this.cx, this.cy, this.r - 1.5, p.x, p.y, p.w, p.h) ? 'SLICED' : null;
  }
  absorb(x, y) {
    const dx = x - this.cx, dy = y - this.cy;
    if (dx * dx + dy * dy <= this.r * this.r) { this.bloody = true; return true; }
    return false;
  }
}

// Saw that runs along a slot in a platform.
export class FloorSaw extends SawBase {
  constructor(x0, x1, rowY, speed) {
    const r = 6;
    super(r, rowY - r - 1, rowY + 2);
    this.rowY = rowY;
    this.min = x0 + r + 1;
    this.max = x1 - r - 1;
    this.cx = rand(this.min, this.max);
    this.cy = rowY + 1;
    this.vx = speed * (chance(0.5) ? 1 : -1);
  }
  update(dt, fx, camY) {
    this.cx += this.vx * dt;
    if (this.cx < this.min) { this.cx = this.min; this.vx = Math.abs(this.vx); }
    if (this.cx > this.max) { this.cx = this.max; this.vx = -Math.abs(this.vx); }
    this.dir = this.vx > 0 ? 1 : -1;
    super.update(dt, fx, camY);
  }
  draw(ctx, camY, sp, layer) {
    if (layer === 0) this.drawSaw(ctx, camY, sp);
    else if (layer === 1) {
      ctx.fillStyle = PAL.steelK;
      ctx.fillRect(Math.round(this.min - 2), this.rowY - camY, Math.round(this.max - this.min + 4), 1);
    }
  }
}

// Saw swinging on a chain under a platform.
export class Pendulum extends SawBase {
  constructor(px, py, len, speed) {
    const r = 5;
    super(r, py, py + len + r);
    this.px = px; this.py = py; this.len = len;
    const room = Math.min(px - L - r - 1, R - r - 1 - px) / len;
    this.amp = Math.min(1.25, Math.asin(clamp(room, 0, 1)));
    this.w = speed;
    this.t = rand(0, 10);
    this.place();
  }
  place() {
    this.a = this.amp * Math.sin(this.t * this.w);
    this.cx = this.px + Math.sin(this.a) * this.len;
    this.cy = this.py + Math.cos(this.a) * this.len;
  }
  update(dt, fx, camY) {
    this.t += dt;
    this.place();
    this.dir = Math.cos(this.t * this.w) > 0 ? 1 : -1;
    super.update(dt, fx, camY);
  }
  draw(ctx, camY, sp, layer) {
    if (layer !== 2) return;
    ctx.fillStyle = PAL.steelD;
    for (let s = 2; s < this.len - this.r; s += 3) {
      ctx.fillRect(Math.round(this.px + Math.sin(this.a) * s), Math.round(this.py + Math.cos(this.a) * s - camY), 1, 1);
    }
    ctx.fillStyle = PAL.steelM;
    ctx.fillRect(this.px - 1, this.py - camY, 3, 2);
    this.drawSaw(ctx, camY, sp);
  }
}

// Saw riding a rail across the shaft.
export class FlySaw extends SawBase {
  constructor(y, vx) {
    const r = 6;
    super(r, y - r, y + r);
    this.cx = rand(L + r, R - r);
    this.cy = y;
    this.vx = vx;
  }
  update(dt, fx, camY) {
    this.cx += this.vx * dt;
    if (this.cx < L + this.r) { this.cx = L + this.r; this.vx = Math.abs(this.vx); }
    if (this.cx > R - this.r) { this.cx = R - this.r; this.vx = -Math.abs(this.vx); }
    this.dir = this.vx > 0 ? 1 : -1;
    super.update(dt, fx, camY);
  }
  draw(ctx, camY, sp, layer) {
    const y = this.cy - camY;
    if (layer === 0) {
      ctx.fillStyle = PAL.steelK;
      ctx.fillRect(L, y, R - L, 1);
      ctx.fillStyle = PAL.platD;
      ctx.fillRect(L, y + 1, R - L, 1);
      ctx.fillStyle = PAL.steelD;
      ctx.fillRect(L, y - 2, 2, 5);
      ctx.fillRect(R - 2, y - 2, 2, 5);
    } else if (layer === 2) this.drawSaw(ctx, camY, sp);
  }
}

// A run of floor spikes on top of a platform.
export class Spikes extends Trap {
  constructor(x0, n, rowY) {
    super(rowY - 5, rowY);
    this.x0 = x0; this.n = n; this.rowY = rowY;
    this.tiles = Array.from({ length: n }, () => chance(0.2));
  }
  set bloody(v) { if (v && this.tiles) this.tiles.fill(true); }
  get bloody() { return false; }
  draw(ctx, camY, sp, layer) {
    if (layer !== 1) return;
    for (let i = 0; i < this.n; i++) {
      ctx.drawImage(this.tiles[i] ? sp.spikeB : sp.spike, this.x0 + i * 4, this.rowY - 5 - camY);
    }
  }
  hit(p) {
    return overlap(p.x, p.y, p.w, p.h, this.x0 + 1, this.rowY - 3, this.n * 4 - 2, 3) ? 'IMPALED' : null;
  }
  absorb(x, y) {
    if (x >= this.x0 && x < this.x0 + this.n * 4 && y >= this.rowY - 5 && y < this.rowY) {
      this.tiles[Math.floor((x - this.x0) / 4)] = true;
      return true;
    }
    return false;
  }
  stain(x0, x1) {
    for (let i = 0; i < this.n; i++) {
      const tx = this.x0 + i * 4;
      if (tx + 4 > x0 && tx < x1) this.tiles[i] = true;
    }
  }
}

// Spikes sticking out of a side wall.
export class WallSpikes extends Trap {
  constructor(side, y0, n) {
    super(y0, y0 + n * 4);
    this.side = side; this.n = n;
    this.x = side === 'left' ? L : R - 5;
    this.tiles = Array.from({ length: n }, () => chance(0.2));
  }
  set bloody(v) { if (v && this.tiles) this.tiles.fill(true); }
  get bloody() { return false; }
  draw(ctx, camY, sp, layer) {
    if (layer !== 1) return;
    const left = this.side === 'left';
    for (let i = 0; i < this.n; i++) {
      const s = left ? (this.tiles[i] ? sp.spikeRB : sp.spikeR) : (this.tiles[i] ? sp.spikeLB : sp.spikeL);
      ctx.drawImage(s, this.x, this.y0 + i * 4 - camY);
    }
  }
  hit(p) {
    const hx = this.side === 'left' ? L : R - 4;
    return overlap(p.x, p.y, p.w, p.h, hx, this.y0 + 1, 4, this.n * 4 - 2) ? 'IMPALED' : null;
  }
  absorb(x, y) {
    if (x >= this.x && x < this.x + 5 && y >= this.y0 && y < this.y1) {
      this.tiles[Math.floor((y - this.y0) / 4)] = true;
      return true;
    }
    return false;
  }
  stain(y0, y1) {
    for (let i = 0; i < this.n; i++) {
      const ty = this.y0 + i * 4;
      if (ty + 4 > y0 && ty < y1) this.tiles[i] = true;
    }
  }
}

// Timed laser across the shaft: off, flickering warning, then on.
export class Laser extends Trap {
  constructor(y, period) {
    super(y - 2, y + 2);
    this.y = y;
    this.period = period;
    this.onDur = 0.75;
    this.warnDur = 0.7;
    this.t = rand(0, period);
    this.wasOn = false;
  }
  get phase() { return this.t % this.period; }
  get on() { return this.phase > this.period - this.onDur; }
  get warn() { return !this.on && this.phase > this.period - this.onDur - this.warnDur; }
  update(dt, fx, camY) {
    this.t += dt;
    const on = this.on;
    if (on && !this.wasOn && this.y > camY && this.y < camY + H) fx.sfx.laser();
    this.wasOn = on;
  }
  draw(ctx, camY, sp, layer) {
    if (layer !== 2) return;
    const y = this.y - camY;
    ctx.fillStyle = PAL.steelD;
    ctx.fillRect(L, y - 2, 3, 5);
    ctx.fillRect(R - 3, y - 2, 3, 5);
    const lit = this.on ? PAL.laser : this.warn ? PAL.laserWarn : PAL.steelK;
    ctx.fillStyle = lit;
    ctx.fillRect(L + 1, y - 1, 2, 3);
    ctx.fillRect(R - 3, y - 1, 2, 3);
    if (this.on) {
      ctx.fillStyle = PAL.laser;
      ctx.fillRect(L + 3, y - 1, R - L - 6, 3);
      ctx.fillStyle = PAL.laserCore;
      ctx.fillRect(L + 3, y, R - L - 6, 1);
      ctx.fillStyle = PAL.laserCore;
      for (let i = 0; i < 6; i++) ctx.fillRect(Math.round(rand(L + 3, R - 4)), y + (chance(0.5) ? -2 : 2), 1, 1);
    } else if (this.warn && Math.floor(this.t * 20) % 2 === 0) {
      ctx.fillStyle = PAL.laserWarn;
      const o = Math.floor(this.t * 30) % 4;
      for (let x = L + 3 + o; x < R - 3; x += 4) ctx.fillRect(x, y, 2, 1);
    }
  }
  hit(p) {
    return this.on && p.y < this.y + 2 && p.y + p.h > this.y - 1 ? 'FRIED' : null;
  }
}
