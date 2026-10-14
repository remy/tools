// Canvas renderer for every quote style. Everything is drawn in units of `u`
// (1u = 1px on a 1080px-short-edge card) so thumbnails and exports share code.

import { fitRich, drawRich } from './richtext.js';

export const SIZES = {
  square: { label: 'Square', w: 1080, h: 1080 },
  landscape: { label: 'Landscape', w: 1200, h: 675 },
  portrait: { label: 'Portrait', w: 1080, h: 1350 },
  story: { label: 'Story', w: 1080, h: 1920 },
};

const SERIF = 'Georgia, "Times New Roman", Times, serif';
const SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export const STYLES = {
  classic: { label: 'Classic', draw: drawClassic },
  bold: { label: 'Bold', draw: drawBold },
  spotlight: { label: 'Spotlight', draw: drawSpotlight },
  split: { label: 'Split', draw: drawSplit },
  glass: { label: 'Glass', draw: drawGlass },
  duotone: { label: 'Duotone', draw: drawDuotone },
};

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ quote: string, name: string, role: string, avatar: HTMLImageElement|null, accent: string, style: string }} data
 * @param {number} w
 * @param {number} h
 */
export function render(canvas, data, w, h) {
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const u = Math.min(w, h) / 1080;
  const quote = cleanQuote(data.quote) || 'Your quote goes here.';
  const style = STYLES[data.style] ?? STYLES.classic;
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  style.draw(ctx, { ...data, quote }, w, h, u);
  ctx.restore();
}

// Strip any quote marks the user typed around the text; styles add their own.
function cleanQuote(text = '') {
  return text.trim().replace(/^["'“”‘’«»]+/, '').replace(/["'“”‘’«»]+$/, '').trim();
}

/* ---------- styles ---------- */

// Name over role (or just name, vertically centred) beside an avatar at cy.
function drawNameBlock(ctx, d, x, cy, maxW, name, role) {
  ctx.textAlign = name.align ?? 'left';
  ctx.fillStyle = name.color;
  ctx.font = name.font;
  ctx.fillText(d.name || '', x, d.role ? cy - name.lift : cy + name.size * 0.35, maxW);
  if (d.role) {
    ctx.fillStyle = role.color;
    ctx.font = role.font;
    ctx.fillText(d.role, x, cy + role.drop, maxW);
  }
}

function drawClassic(ctx, d, w, h, u) {
  ctx.fillStyle = '#f7f3ea';
  ctx.fillRect(0, 0, w, h);

  const pad = 100 * u;
  ctx.fillStyle = withAlpha(d.accent, 0.9);
  ctx.font = `700 ${360 * u}px ${SERIF}`;
  ctx.textAlign = 'left';
  ctx.fillText('“', pad - 20 * u, pad + 230 * u);

  const footer = 280 * u;
  const top = pad + 170 * u;
  const box = { x: pad, y: top, w: w - pad * 2, h: h - top - pad - footer };
  const fit = fitRich(ctx, d.quote, { family: SERIF, weight: 400, italic: true }, box.w, box.h, 1.3, 28 * u, 84 * u);
  ctx.fillStyle = '#2b2622';
  drawRich(ctx, fit, box.x, box.y, 1.3, { boxH: box.h, valign: 'center', mark: withAlpha(d.accent, 0.25), code: 'rgba(43, 38, 34, 0.08)' });

  const r = 95 * u;
  const fy = h - pad - r;
  let x = pad;
  if (drawAvatar(ctx, d, x + r, fy, r, { ring: d.accent, ringWidth: 6 * u })) x += r * 2 + 40 * u;
  drawNameBlock(ctx, d, x, fy, w - x - pad,
    { color: '#2b2622', font: `700 ${68 * u}px ${SERIF}`, size: 68 * u, lift: 12 * u },
    { color: '#7a6f64', font: `400 ${48 * u}px ${SANS}`, drop: 58 * u });
}

function drawBold(ctx, d, w, h, u) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, d.accent);
  g.addColorStop(1, mix(d.accent, '#1e0a3c', 0.55));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // soft decorative circles
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath();
  ctx.arc(w * 0.92, h * 0.08, Math.min(w, h) * 0.38, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(w * 0.05, h * 0.98, Math.min(w, h) * 0.22, 0, Math.PI * 2);
  ctx.fill();

  const pad = 96 * u;
  const footer = 260 * u;
  const box = { x: pad, y: pad, w: w - pad * 2, h: h - pad * 2 - footer };
  const fit = fitRich(ctx, `“${d.quote}”`, { family: SANS, weight: 800 }, box.w, box.h, 1.12, 30 * u, 120 * u);
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0,0,0,0.18)';
  ctx.shadowOffsetY = 4 * u;
  ctx.shadowBlur = 16 * u;
  drawRich(ctx, fit, box.x, box.y, 1.12, { boxH: box.h, valign: 'center', mark: 'rgba(30, 10, 60, 0.35)', code: 'rgba(0, 0, 0, 0.22)' });
  ctx.shadowColor = 'transparent';

  const r = 90 * u;
  const fy = h - pad - r + 10 * u;
  let x = pad;
  if (drawAvatar(ctx, d, x + r, fy, r, { ring: '#ffffff', ringWidth: 7 * u })) x += r * 2 + 40 * u;
  drawNameBlock(ctx, d, x, fy, w - x - pad,
    { color: '#ffffff', font: `700 ${64 * u}px ${SANS}`, size: 64 * u, lift: 12 * u },
    { color: 'rgba(255,255,255,0.8)', font: `500 ${46 * u}px ${SANS}`, drop: 56 * u });
}

function drawSpotlight(ctx, d, w, h, u) {
  const pad = 90 * u;
  const r = 150 * u;
  const hasFace = !!(d.avatar || d.name);
  const ay = pad + 18 * u + r;

  const bg = ctx.createRadialGradient(w / 2, ay, 0, w / 2, ay, Math.max(w, h) * 0.9);
  bg.addColorStop(0, mix(d.accent, '#ffffff', 0.78));
  bg.addColorStop(1, mix(d.accent, '#ffffff', 0.95));
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  let top = pad;
  if (hasFace) {
    ctx.strokeStyle = d.accent;
    ctx.lineWidth = 5 * u;
    ctx.beginPath();
    ctx.arc(w / 2, ay, r + 22 * u, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowColor = withAlpha(mix(d.accent, '#000000', 0.5), 0.3);
    ctx.shadowBlur = 40 * u;
    ctx.shadowOffsetY = 14 * u;
    drawAvatar(ctx, d, w / 2, ay, r, { ring: '#ffffff', ringWidth: 9 * u });
    ctx.shadowColor = 'transparent';
    top = ay + r + 40 * u;
  }

  ctx.textAlign = 'center';
  if (d.name) {
    top += 72 * u;
    ctx.fillStyle = '#111827';
    ctx.font = `800 ${72 * u}px ${SANS}`;
    ctx.fillText(d.name, w / 2, top, w - pad * 2);
  }
  if (d.role) {
    top += 62 * u;
    ctx.fillStyle = mix(d.accent, '#000000', 0.35);
    ctx.font = `500 ${48 * u}px ${SANS}`;
    ctx.fillText(d.role, w / 2, top, w - pad * 2);
  }
  if (d.name || d.role) top += 60 * u;

  const box = { x: pad, y: top, w: w - pad * 2, h: h - top - pad };
  const fit = fitRich(ctx, `“${d.quote}”`, { family: SANS, weight: 500 }, box.w, box.h, 1.3, 24 * u, 78 * u);
  ctx.fillStyle = '#1f2937';
  drawRich(ctx, fit, w / 2, box.y, 1.3, { align: 'center', boxH: box.h, valign: 'center', mark: withAlpha(d.accent, 0.3) });
}

function drawSplit(ctx, d, w, h, u) {
  const wide = w >= h;
  const panel = wide ? { x: 0, y: 0, w: Math.round(w * 0.44), h } : { x: 0, y: 0, w, h: Math.round(h * 0.48) };

  // photo (or a coloured stand-in) filling the panel
  if (d.avatar) {
    drawCover(ctx, d.avatar, panel);
  } else {
    const g = ctx.createLinearGradient(panel.x, panel.y, panel.x + panel.w, panel.y + panel.h);
    g.addColorStop(0, d.accent);
    g.addColorStop(1, mix(d.accent, '#1e0a3c', 0.5));
    ctx.fillStyle = g;
    ctx.fillRect(panel.x, panel.y, panel.w, panel.h);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.textAlign = 'center';
    ctx.font = `800 ${Math.min(panel.w, panel.h) * 0.42}px ${SANS}`;
    ctx.fillText(d.name ? initials(d.name) : '“', panel.x + panel.w / 2, panel.y + panel.h * (d.name ? 0.5 : 0.72));
  }

  const ip = 60 * u;
  if (d.name || d.role) {
    const shade = ctx.createLinearGradient(0, panel.y + panel.h * 0.4, 0, panel.y + panel.h);
    shade.addColorStop(0, 'rgba(0,0,0,0)');
    shade.addColorStop(1, 'rgba(0,0,0,0.72)');
    ctx.fillStyle = shade;
    ctx.fillRect(panel.x, panel.y, panel.w, panel.h);

    ctx.textAlign = 'left';
    let ny = panel.y + panel.h - ip;
    const maxW = panel.w - ip * 2;
    if (d.role) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = `500 ${46 * u}px ${SANS}`;
      ctx.fillText(d.role, panel.x + ip, ny, maxW);
      ny -= 66 * u;
    }
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${66 * u}px ${SANS}`;
    ctx.fillText(d.name || '', panel.x + ip, ny, maxW);
  }

  // accent seam between panel and text
  ctx.fillStyle = d.accent;
  if (wide) ctx.fillRect(panel.w, 0, 10 * u, h);
  else ctx.fillRect(0, panel.h, w, 10 * u);

  const area = wide ? { x: panel.w + 10 * u, y: 0, w: w - panel.w - 10 * u, h } : { x: 0, y: panel.h + 10 * u, w, h: h - panel.h - 10 * u };
  ctx.fillStyle = '#faf7f2';
  ctx.fillRect(area.x, area.y, area.w, area.h);

  const pad = 76 * u;
  ctx.fillStyle = d.accent;
  ctx.font = `700 ${150 * u}px ${SERIF}`;
  ctx.textAlign = 'left';
  ctx.fillText('“', area.x + pad - 8 * u, area.y + pad + 100 * u);

  const box = { x: area.x + pad, y: area.y + pad + 110 * u, w: area.w - pad * 2, h: area.h - pad * 2 - 110 * u };
  const fit = fitRich(ctx, d.quote, { family: SANS, weight: 700 }, box.w, box.h, 1.22, 22 * u, 84 * u);
  ctx.fillStyle = '#111827';
  drawRich(ctx, fit, box.x, box.y, 1.22, { boxH: box.h, valign: 'center', mark: withAlpha(d.accent, 0.3) });
}

function drawGlass(ctx, d, w, h, u) {
  const base = ctx.createLinearGradient(0, 0, w, h);
  base.addColorStop(0, mix(d.accent, '#0b1020', 0.6));
  base.addColorStop(1, '#0b1020');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);

  // soft colour blobs; radial gradients stand in for a blur filter
  const m = Math.max(w, h);
  const blobs = [
    [w * 0.15, h * 0.12, m * 0.55, d.accent],
    [w * 0.92, h * 0.4, m * 0.5, rotateHue(d.accent, 70)],
    [w * 0.4, h * 1.0, m * 0.6, rotateHue(d.accent, -60)],
  ];
  for (const [x, y, r, c] of blobs) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, withAlpha(c, 0.95));
    g.addColorStop(1, withAlpha(c, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  const mg = 70 * u;
  const card = { x: mg, y: mg, w: w - mg * 2, h: h - mg * 2 };
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = 60 * u;
  ctx.shadowOffsetY = 20 * u;
  const sheen = ctx.createLinearGradient(0, card.y, 0, card.y + card.h);
  sheen.addColorStop(0, 'rgba(255,255,255,0.24)');
  sheen.addColorStop(1, 'rgba(255,255,255,0.08)');
  ctx.fillStyle = sheen;
  ctx.beginPath();
  ctx.roundRect(card.x, card.y, card.w, card.h, 48 * u);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 2 * u;
  ctx.stroke();

  const pad = 70 * u;
  const r = 90 * u;
  const footer = r * 2 + 70 * u;
  const box = { x: card.x + pad, y: card.y + pad, w: card.w - pad * 2, h: card.h - pad * 2 - footer };
  const fit = fitRich(ctx, `“${d.quote}”`, { family: SANS, weight: 600 }, box.w, box.h, 1.2, 24 * u, 100 * u);
  ctx.fillStyle = '#ffffff';
  drawRich(ctx, fit, box.x, box.y, 1.2, { boxH: box.h, valign: 'center', mark: 'rgba(255,255,255,0.25)', code: 'rgba(0,0,0,0.25)' });

  const ly = card.y + card.h - pad - r * 2 - 36 * u;
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(box.x, ly, box.w, 2 * u);

  const fy = card.y + card.h - pad - r;
  let x = box.x;
  if (drawAvatar(ctx, d, x + r, fy, r, { ring: 'rgba(255,255,255,0.7)', ringWidth: 5 * u })) x += r * 2 + 40 * u;
  drawNameBlock(ctx, d, x, fy, box.x + box.w - x,
    { color: '#ffffff', font: `700 ${64 * u}px ${SANS}`, size: 64 * u, lift: 12 * u },
    { color: 'rgba(255,255,255,0.75)', font: `400 ${46 * u}px ${SANS}`, drop: 56 * u });
}

function drawDuotone(ctx, d, w, h, u) {
  const dark = mix(d.accent, '#0a0a1a', 0.8);
  const light = mix(d.accent, '#ffffff', 0.45);

  if (d.avatar) {
    // photo sits in the upper part so the face stays clear of the quote
    ctx.fillStyle = dark;
    ctx.fillRect(0, 0, w, h);
    drawCover(ctx, duotone(d.avatar, dark, light), { x: 0, y: 0, w, h: h * 0.78 });
  } else {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, light);
    g.addColorStop(1, dark);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    if (d.name) {
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.textAlign = 'center';
      ctx.font = `900 ${Math.min(w, h) * 0.6}px ${SANS}`;
      ctx.fillText(initials(d.name), w / 2, h * 0.5);
    }
  }

  // fade to the dark tone so the text always has contrast
  const shade = ctx.createLinearGradient(0, h * 0.25, 0, h);
  shade.addColorStop(0, withAlpha(dark, 0));
  shade.addColorStop(0.55, withAlpha(dark, 0.75));
  shade.addColorStop(1, withAlpha(dark, 0.95));
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, w, h);

  const pad = 90 * u;
  const credit = d.name || d.role;
  const footer = credit ? (d.role ? 210 : 150) * u : 0;
  const box = { x: pad, y: h * 0.3, w: w - pad * 2, h: h * 0.7 - pad - footer };
  const fit = fitRich(ctx, `“${d.quote}”`, { family: SANS, weight: 800 }, box.w, box.h, 1.12, 26 * u, 110 * u);
  ctx.fillStyle = '#ffffff';
  drawRich(ctx, fit, box.x, box.y, 1.12, { boxH: box.h, valign: 'bottom', mark: withAlpha(d.accent, 0.6), code: 'rgba(0,0,0,0.3)' });

  if (!credit) return;
  let y = h - pad - footer + 50 * u;
  ctx.fillStyle = light;
  ctx.fillRect(pad, y - 20 * u, 90 * u, 8 * u);
  ctx.textAlign = 'left';
  y += 72 * u;
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 ${68 * u}px ${SANS}`;
  ctx.fillText(d.name || '', pad, y, w - pad * 2);
  if (d.role) {
    ctx.fillStyle = light;
    ctx.font = `500 ${48 * u}px ${SANS}`;
    ctx.fillText(d.role, pad, y + 62 * u, w - pad * 2);
  }
}

/* ---------- helpers ---------- */

/** Draws avatar (or initials). Returns true when something was drawn. */
function drawAvatar(ctx, d, cx, cy, r, opts = {}) {
  const { avatar, name, accent } = d;
  if (!avatar && !name) return false;
  ctx.save();
  ctx.beginPath();
  if (opts.square) ctx.roundRect(cx - r, cy - r, r * 2, r * 2, r * 0.25);
  else ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();

  if (opts.ring) {
    ctx.save();
    ctx.lineWidth = opts.ringWidth * 2;
    ctx.strokeStyle = opts.ring;
    ctx.stroke();
    ctx.restore();
  }
  ctx.clip();

  if (avatar) {
    const s = Math.min(avatar.naturalWidth, avatar.naturalHeight);
    const sx = (avatar.naturalWidth - s) / 2;
    const sy = (avatar.naturalHeight - s) / 2;
    if (opts.grayscale && 'filter' in ctx) ctx.filter = 'grayscale(1)';
    ctx.drawImage(avatar, sx, sy, s, s, cx - r, cy - r, r * 2, r * 2);
    ctx.filter = 'none';
  } else {
    ctx.fillStyle = accent;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${r * 0.8}px ${SANS}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials(name), cx, cy + r * 0.04);
  }
  ctx.restore();
  return true;
}

function drawCover(ctx, img, box) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const scale = Math.max(box.w / iw, box.h / ih);
  const sw = box.w / scale;
  const sh = box.h / scale;
  ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, box.x, box.y, box.w, box.h);
}

// Map image luminance onto a dark→light colour ramp. Cached per image and colours.
const duotoneCache = new WeakMap();
function duotone(img, dark, light) {
  const key = dark + light;
  const hit = duotoneCache.get(img);
  if (hit?.key === key) return hit.canvas;
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const c = canvas.getContext('2d');
  c.drawImage(img, 0, 0);
  const data = c.getImageData(0, 0, canvas.width, canvas.height);
  const px = data.data;
  const a = hexToRgb(dark);
  const b = hexToRgb(light);
  for (let i = 0; i < px.length; i += 4) {
    const lum = (0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]) / 255;
    const t = Math.min(1, Math.max(0, (lum - 0.5) * 1.25 + 0.5));
    px[i] = a[0] + (b[0] - a[0]) * t;
    px[i + 1] = a[1] + (b[1] - a[1]) * t;
    px[i + 2] = a[2] + (b[2] - a[2]) * t;
  }
  c.putImageData(data, 0, 0);
  duotoneCache.set(img, { key, canvas });
  return canvas;
}

function initials(name) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts.at(-1)[0] : '')).toUpperCase();
}

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a, b, t) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const c = ca.map((v, i) => Math.round(v + (cb[i] - v) * t));
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}

function rotateHue(hex, deg) {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const dlt = max - min;
  let hue = 0;
  let sat = 0;
  if (dlt) {
    sat = dlt / (1 - Math.abs(2 * l - 1));
    if (max === r) hue = ((g - b) / dlt) % 6;
    else if (max === g) hue = (b - r) / dlt + 2;
    else hue = (r - g) / dlt + 4;
    hue *= 60;
  }
  hue = (hue + deg + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  const [r1, g1, b1] = hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x] : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x];
  return '#' + [r1, g1, b1].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('');
}

function withAlpha(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
