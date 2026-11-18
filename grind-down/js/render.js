// Backdrop: parallax bricks, depth markers and the shaft walls.
import { W, H, L, R, PAL, PX_PER_M } from './config.js';
import { drawText } from './font.js';

export function drawBackground(ctx, sp, camY) {
  const oy = Math.floor(camY * 0.5) % 8;
  ctx.drawImage(sp.bricks, 0, -oy);

  // Depth markers every 50 m, painted on the back wall
  const m0 = Math.ceil(camY / PX_PER_M / 50) * 50;
  for (let m = Math.max(50, m0 - 50); m * PX_PER_M < camY + H + 16; m += 50) {
    const y = m * PX_PER_M - camY;
    ctx.fillStyle = PAL.marker;
    ctx.fillRect(L + 4, y, 10, 1);
    ctx.fillRect(R - 14, y, 10, 1);
    drawText(ctx, m + 'M', W / 2, y - 2, PAL.marker, { align: 'center' });
  }
}

export function drawWalls(ctx, sp, camY) {
  const oy = Math.floor(camY) % 12;
  ctx.drawImage(sp.wallLeft, 0, -oy);
  ctx.drawImage(sp.wallRight, R, -oy);
}
