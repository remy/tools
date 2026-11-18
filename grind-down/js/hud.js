// HUD, overlays, and blood splats on the "lens".
import { W, H, L, R, PAL, BLOOD } from './config.js';
import { drawText } from './font.js';
import { rand, randi, pick } from './util.js';

const SH = { shadow: PAL.textD };

export function drawHUD(ctx, sp, { depth, best, deaths }) {
  drawText(ctx, depth + 'M', L + 2, H - 8, PAL.text, SH);
  drawText(ctx, 'BEST ' + best, R - 2, H - 8, PAL.hud, { ...SH, align: 'right' });
  ctx.drawImage(sp.skull, W / 2 - 9, H - 9);
  drawText(ctx, deaths, W / 2 - 2, H - 8, PAL.text, SH);
}

function dim(ctx, a = 0.6) {
  ctx.fillStyle = `rgb(10 6 16 / ${a})`;
  ctx.fillRect(0, 0, W, H);
}

const blink = (t, rate = 2) => Math.floor(t * rate) % 2 === 0;

export function drawTitle(ctx, t, best, touch) {
  dim(ctx, 0.55);
  const y = 58;
  drawText(ctx, 'GRIND', W / 2, y, PAL.blood, { scale: 4, align: 'center', shadow: PAL.textD });
  drawText(ctx, 'DOWN', W / 2, y + 24, PAL.bloodL, { scale: 4, align: 'center', shadow: PAL.textD });
  // drips off the logo
  ctx.fillStyle = PAL.blood;
  for (let i = 0; i < 7; i++) {
    const x = 36 + i * 15 + (i % 3);
    const len = 2 + ((t * (8 + i * 3) + i * 7) % 14);
    ctx.fillRect(x, y + 44, 1, Math.floor(len));
    if (len > 12) ctx.fillRect(x, y + 44 + Math.floor(len) + 1, 1, 1);
  }
  drawText(ctx, "DON'T GET SQUISHED.", W / 2, 120, PAL.text, { ...SH, align: 'center' });
  drawText(ctx, "DON'T GET SLICED.", W / 2, 128, PAL.text, { ...SH, align: 'center' });
  const help = touch
    ? ['HOLD BOTTOM LEFT/RIGHT: MOVE', 'TAP ANYWHERE ELSE: JUMP', '']
    : ['ARROWS OR A/D: MOVE', 'SPACE OR UP: JUMP', 'P: PAUSE   M: MUTE'];
  help.forEach((line, i) => drawText(ctx, line, W / 2, 150 + i * 8, PAL.steelM, { ...SH, align: 'center' }));
  if (best) drawText(ctx, 'BEST ' + best + 'M', W / 2, 186, PAL.hud, { ...SH, align: 'center' });
  if (blink(t)) drawText(ctx, touch ? 'TAP TO START' : 'PRESS ANY KEY', W / 2, 206, PAL.text, { ...SH, align: 'center' });
}

export function drawReady(ctx, readyT) {
  const word = readyT > 0.45 ? 'READY' : 'GO!';
  drawText(ctx, word, W / 2, 110, readyT > 0.45 ? PAL.hud : PAL.bloodL, { scale: 3, align: 'center', shadow: PAL.textD });
}

export function drawDead(ctx, t, info, touch) {
  if (t < 0.25) return;
  dim(ctx, Math.min(0.5, (t - 0.25) * 2));
  drawText(ctx, info.cause + '!', W / 2, 84, PAL.bloodL, { scale: 3, align: 'center', shadow: PAL.textD });
  drawText(ctx, 'DEPTH ' + info.depth + 'M', W / 2, 112, PAL.text, { ...SH, align: 'center' });
  if (info.newBest) {
    if (blink(t, 4)) drawText(ctx, 'NEW BEST!', W / 2, 122, PAL.hud, { ...SH, align: 'center' });
  } else {
    drawText(ctx, 'BEST ' + info.best + 'M', W / 2, 122, PAL.hud, { ...SH, align: 'center' });
  }
  drawText(ctx, 'DEATHS ' + info.deaths, W / 2, 132, PAL.steelM, { ...SH, align: 'center' });
  if (t > 0.5 && blink(t)) drawText(ctx, touch ? 'TAP: AGAIN' : 'ANY KEY: AGAIN', W / 2, 156, PAL.text, { ...SH, align: 'center' });
}

export function drawPaused(ctx, t, touch) {
  dim(ctx, 0.6);
  drawText(ctx, 'PAUSED', W / 2, 110, PAL.text, { scale: 3, align: 'center', shadow: PAL.textD });
  if (blink(t)) drawText(ctx, touch ? 'TAP TO GO ON' : 'ANY KEY TO GO ON', W / 2, 136, PAL.steelM, { ...SH, align: 'center' });
}

export function drawDanger(ctx, danger, t) {
  if (danger <= 0) return;
  const pulse = 0.5 + 0.5 * Math.sin(t * (10 + danger * 14));
  ctx.fillStyle = `rgb(255 48 72 / ${(0.08 + 0.22 * pulse) * danger})`;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = PAL.danger;
  if (pulse > 0.5) {
    for (let y = 0; y < H; y += 4) {
      ctx.fillRect(0, y, 1, 2);
      ctx.fillRect(W - 1, y, 1, 2);
    }
  }
}

// Blood splashed on the screen, sliding down.
export class Lens {
  constructor() { this.splats = []; }
  clear() { this.splats.length = 0; }
  add(x, y, n) {
    for (let k = 0; k < n; k++) {
      const cx = Math.round(x + rand(-50, 50)), cy = Math.round(y + rand(-60, 40));
      const r = randi(3, 9), pix = [];
      for (let j = -r; j <= r; j++) {
        for (let i = -r; i <= r; i++) {
          const d = Math.hypot(i, j) / r;
          if (d <= 1 && Math.random() < 1.05 - d * d) pix.push([cx + i, cy + j, pick(BLOOD)]);
        }
      }
      const drips = Array.from({ length: randi(1, 4) }, () => ({ x: cx + randi(-r + 1, r - 1), y: cy + r - 1, len: 0, v: rand(6, 26) }));
      this.splats.push({ pix, drips, life: rand(1.6, 2.6) });
    }
  }
  update(dt) {
    for (const s of this.splats) {
      s.life -= dt;
      for (const d of s.drips) d.len += d.v * dt;
    }
    this.splats = this.splats.filter((s) => s.life > 0);
  }
  draw(ctx) {
    for (const s of this.splats) {
      ctx.globalAlpha = Math.min(1, s.life) * 0.85;
      for (const [x, y, c] of s.pix) { ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); }
      ctx.fillStyle = PAL.blood;
      for (const d of s.drips) {
        ctx.fillRect(d.x, d.y, 1, Math.floor(d.len));
        ctx.fillRect(d.x, d.y + Math.floor(d.len), 2, 2);
      }
    }
    ctx.globalAlpha = 1;
  }
}
