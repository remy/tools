"use strict";

/* ==========================================================================
   B4. Gerber: rasteriser
   ========================================================================== */

function drawAperture(ctx, ap, x, y) {
  if (!ap) return;
  ctx.beginPath();
  if (ap.kind === 'C') {
    ctx.arc(x, y, ap.d / 2, 0, Math.PI * 2);
    ctx.fill();
  } else if (ap.kind === 'R') {
    ctx.rect(x - ap.w / 2, y - ap.h / 2, ap.w, ap.h);
    ctx.fill();
  } else if (ap.kind === 'O') {
    const r = Math.min(ap.w, ap.h) / 2;
    ctx.roundRect(x - ap.w / 2, y - ap.h / 2, ap.w, ap.h, r);
    ctx.fill();
  } else if (ap.kind === 'P') {
    for (let k = 0; k < ap.n; k++) {
      const a = (ap.rot || 0) * Math.PI / 180 + k * 2 * Math.PI / ap.n;
      const px = x + Math.cos(a) * ap.d / 2, py = y + Math.sin(a) * ap.d / 2;
      k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  } else if (ap.kind === 'M') {
    const prev = ctx.globalCompositeOperation;
    for (const s of ap.shapes) {
      ctx.globalCompositeOperation = s.on ? prev : 'destination-out';
      ctx.beginPath();
      if (s.type === 'circle') ctx.arc(x + s.x, y + s.y, s.d / 2, 0, Math.PI * 2);
      else s.pts.forEach((p, k) =>
        k ? ctx.lineTo(x + p[0], y + p[1]) : ctx.moveTo(x + p[0], y + p[1]));
      ctx.fill();
    }
    ctx.globalCompositeOperation = prev;
    return;
  }
  if (ap.hole) {                                  // aperture hole knocks out
    const prev = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(x, y, ap.hole / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = prev;
  }
}

/** Paint parsed Gerber ops onto a canvas already transformed to board units. */
function rasterise(ctx, ops, colour) {
  ctx.fillStyle = colour;
  ctx.strokeStyle = colour;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const o of ops) {
    const clear = o.pol === 'C';
    ctx.globalCompositeOperation = clear ? 'destination-out' : 'source-over';

    if (o.op === 'flash') {
      drawAperture(ctx, o.ap, o.x, o.y);

    } else if (o.op === 'draw' || o.op === 'arc') {
      const ap = o.ap;
      let w = 0;
      if (!ap) w = 0;
      else if (ap.kind === 'C') w = ap.d;
      else if (ap.kind === 'R' || ap.kind === 'O') w = Math.min(ap.w, ap.h);
      else w = 0.1;
      if (w <= 0) continue;
      ctx.lineWidth = w;
      ctx.beginPath();
      if (o.op === 'draw') { ctx.moveTo(o.x1, o.y1); ctx.lineTo(o.x2, o.y2); }
      else {
        const r = Math.hypot(o.x1 - o.cx, o.y1 - o.cy);
        let a1 = Math.atan2(o.y1 - o.cy, o.x1 - o.cx);
        let a2 = Math.atan2(o.y2 - o.cy, o.x2 - o.cx);
        // a full circle arrives as start == end
        if (Math.abs(o.x1 - o.x2) < 1e-9 && Math.abs(o.y1 - o.y2) < 1e-9) a2 = a1 + 2 * Math.PI;
        ctx.arc(o.cx, o.cy, r, a1, a2, !o.ccw);
      }
      ctx.stroke();

    } else if (o.op === 'region') {
      ctx.beginPath();
      for (const c of o.contours) {
        c.forEach((p, k) => {
          if (k === 0) { ctx.moveTo(p.x, p.y); return; }
          if (p.cx === undefined) { ctx.lineTo(p.x, p.y); return; }
          const prev = c[k - 1];
          const r = Math.hypot(prev.x - p.cx, prev.y - p.cy);
          ctx.arc(p.cx, p.cy, r,
                  Math.atan2(prev.y - p.cy, prev.x - p.cx),
                  Math.atan2(p.y - p.cy, p.x - p.cx), !p.ccw);
        });
        ctx.closePath();
      }
      ctx.fill();
    }
  }
  ctx.globalCompositeOperation = 'source-over';
}

/* ==========================================================================
   B5. Gerber: connectivity -- this is the part KiCad hands you for free
   --------------------------------------------------------------------------
   Two-pass connected-component labelling over the copper mask of each layer,
   4-connected (a diagonal pixel touch is not a conductor), then a union-find
   across layers seeded by drill hits.
   ========================================================================== */

function labelLayer(alpha, W, H, thresh) {
  const labels = new Int32Array(W * H);
  let par = new Int32Array(4096);
  let np = 1;
  const newLabel = () => {
    if (np >= par.length) {
      const g = new Int32Array(par.length * 2);
      g.set(par);
      par = g;
    }
    par[np] = np;
    return np++;
  };
  const find = a => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
  const union = (a, b) => {
    a = find(a); b = find(b);
    if (a !== b) par[a > b ? a : b] = a > b ? b : a;
  };

  for (let yy = 0, i = 0; yy < H; yy++) {
    for (let xx = 0; xx < W; xx++, i++) {
      if (alpha[i * 4 + 3] < thresh) continue;
      const up = yy > 0 ? labels[i - W] : 0;
      const lf = xx > 0 ? labels[i - 1] : 0;
      if (up && lf) { labels[i] = up; if (up !== lf) union(up, lf); }
      else if (up) labels[i] = up;
      else if (lf) labels[i] = lf;
      else labels[i] = newLabel();
    }
  }
  // flatten
  const remap = new Int32Array(np);
  let ncomp = 0;
  for (let a = 1; a < np; a++) if (find(a) === a) remap[a] = ++ncomp;
  for (let a = 1; a < np; a++) remap[a] = remap[find(a)];
  for (let i = 0; i < labels.length; i++) if (labels[i]) labels[i] = remap[labels[i]];
  return {labels, ncomp};
}
