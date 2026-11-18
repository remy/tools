// Gib, our doomed hero.
import { GRAV, L, R, PLAT_H } from './config.js';
import { clamp } from './util.js';

const MAX_RUN = 74;
const MAX_FALL = 240;
const JUMP_V = 178;

export class Player {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.w = 6; this.h = 8;
    this.vx = 0; this.vy = 0;
    this.grounded = false;
    this.face = 1;
    this.coyote = 0;
    this.jumpBuf = 0;
    this.anim = 0;
  }

  update(dt, input, world, fx) {
    const ax = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const acc = this.grounded ? 1000 : 800;
    const fr = this.grounded ? 1000 : 260;
    if (ax) {
      this.vx += ax * acc * dt;
      this.face = ax;
    } else if (this.vx) {
      const s = Math.sign(this.vx);
      this.vx -= s * fr * dt;
      if (Math.sign(this.vx) !== s) this.vx = 0;
    }
    this.vx = clamp(this.vx, -MAX_RUN, MAX_RUN);

    if (input.jumpPressed) this.jumpBuf = 0.12;
    else this.jumpBuf -= dt;
    this.coyote = this.grounded ? 0.08 : this.coyote - dt;
    if (this.jumpBuf > 0 && this.coyote > 0) {
      this.vy = -JUMP_V;
      this.jumpBuf = 0;
      this.coyote = 0;
      this.grounded = false;
      fx.sfx.jump();
    }
    if (!input.jump && this.vy < -70) this.vy = -70; // variable jump height

    this.vy = Math.min(this.vy + GRAV * dt, MAX_FALL);

    // Horizontal
    this.x += this.vx * dt;
    if (this.x < L) { this.x = L; this.vx = 0; }
    if (this.x + this.w > R) { this.x = R - this.w; this.vx = 0; }
    let hit = world.overlapSeg(this.x, this.y, this.w, this.h);
    if (hit) {
      if (this.vx > 0) this.x = hit.seg.x0 - this.w;
      else if (this.vx < 0) this.x = hit.seg.x1;
      this.vx = 0;
    }

    // Vertical
    const fallSpeed = this.vy;
    const was = this.grounded;
    this.grounded = false;
    this.y += this.vy * dt;
    hit = world.overlapSeg(this.x, this.y, this.w, this.h);
    if (hit) {
      if (this.vy > 0) {
        this.y = hit.row.y - this.h;
        this.grounded = true;
      } else {
        this.y = hit.row.y + PLAT_H;
      }
      this.vy = 0;
    }
    if (this.grounded && !was && fallSpeed > 140) {
      fx.particles.dust(this.x + 3, this.y + this.h, 5);
      fx.sfx.land();
    }

    this.anim += dt * Math.abs(this.vx) / 5;
  }

  draw(ctx, camY, sp) {
    let frames = sp.hero.idle;
    if (!this.grounded) frames = sp.hero.fall;
    else if (Math.abs(this.vx) > 10) frames = Math.floor(this.anim) % 2 ? sp.hero.run1 : sp.hero.run2;
    ctx.drawImage(frames[this.face < 0 ? 1 : 0], Math.round(this.x) - 1, Math.round(this.y - camY) - 1);
  }
}
