// The meat grinder chasing you from the top of the screen.
import { W, L, R, PAL, GRIND_Y } from './config.js';
import { rand, chance } from './util.js';

const N = 6, RAD = 10, CY = 5;

export class Grinder {
  constructor() {
    this.t = 0;
    this.bloody = false;
  }

  sawX(i) { return L + 12 + i * ((R - L - 24) / (N - 1)); }

  update(dt, fx, camY, active) {
    this.t += dt;
    if (this.bloody && active && chance(dt * 14)) {
      const x = this.sawX(Math.floor(Math.random() * N)) + rand(-6, 6);
      fx.particles.drop(x, camY + GRIND_Y + 1, rand(-40, 40), rand(10, 90));
    }
  }

  draw(ctx, sp, danger) {
    const frames = sp.saw(RAD)[this.bloody ? 'bloody' : 'clean'];
    for (let i = 0; i < N; i++) {
      const dir = i % 2 ? 1 : -1;
      let f = Math.floor(this.t * 34 * dir) % frames.length;
      if (f < 0) f += frames.length;
      ctx.drawImage(frames[f], Math.round(this.sawX(i) - RAD), CY - RAD);
    }
    ctx.fillStyle = PAL.steelK;
    ctx.fillRect(0, 0, W, 3);
    const flash = danger > 0.2 && Math.floor(this.t * (6 + danger * 10)) % 2 === 0;
    const off = Math.floor(this.t * 24);
    for (let x = 0; x < W; x++) {
      ctx.fillStyle = ((x + off) % 8) < 4 ? (flash ? PAL.danger : PAL.hazard) : PAL.textD;
      ctx.fillRect(x, 3, 1, 3);
    }
    ctx.fillStyle = PAL.steelD;
    ctx.fillRect(0, 6, W, 1);
    ctx.fillStyle = PAL.steelM;
    for (let x = 4; x < W; x += 12) ctx.fillRect(x, 1, 1, 1);
  }
}
