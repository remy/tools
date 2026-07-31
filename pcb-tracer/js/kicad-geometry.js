"use strict";

/* ==========================================================================
   A2. KiCad: geometry
   ========================================================================== */

const n = v => String(Math.round(v * 1e4) / 1e4);
const polyPoints = pts => pts.map(p => n(p[0]) + ',' + n(p[1])).join(' ');

/** SVG arc for the KiCad 6+ form: three points on the arc. */
function arcPath(s, m, e) {
  const [x1, y1] = s, [x2, y2] = m, [x3, y3] = e;
  const d = 2 * (x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2));
  if (Math.abs(d) < 1e-12) return 'M' + n(x1) + ' ' + n(y1) + 'L' + n(x3) + ' ' + n(y3);
  const s1 = x1 * x1 + y1 * y1, s2 = x2 * x2 + y2 * y2, s3 = x3 * x3 + y3 * y3;
  const cx = (s1 * (y2 - y3) + s2 * (y3 - y1) + s3 * (y1 - y2)) / d;
  const cy = (s1 * (x3 - x2) + s2 * (x1 - x3) + s3 * (x2 - x1)) / d;
  const r = Math.hypot(x1 - cx, y1 - cy);
  const ang = (px, py) => Math.atan2(py - cy, px - cx);
  const ccw = (a, b) => { let v = b - a; while (v < 0) v += 2 * Math.PI; return v; };
  const a1 = ang(x1, y1), a2 = ang(x2, y2), a3 = ang(x3, y3);
  let sweep, total;
  if (ccw(a1, a2) < ccw(a1, a3)) { sweep = 1; total = ccw(a1, a3); }
  else { sweep = 0; total = 2 * Math.PI - ccw(a1, a3); }
  return 'M' + n(x1) + ' ' + n(y1) + 'A' + n(r) + ' ' + n(r) + ' 0 ' +
         (total > Math.PI ? 1 : 0) + ' ' + sweep + ' ' + n(x3) + ' ' + n(y3);
}

/** SVG arc for the KiCad 5 form: centre + start point + swept angle.
    KiCad's arc end is the start rotated about the centre by -angle with its own
    [[c,s],[-s,c]] matrix, which in SVG's y-down space is a positive rotation by
    +angle -- so the sweep flag simply follows the sign of the angle. */
function arcCenterAngle(cx, cy, px, py, deg) {
  const a = deg * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
  const vx = px - cx, vy = py - cy;
  const r = Math.hypot(vx, vy);
  if (Math.abs(deg) >= 359.999) {   // SVG arcs can't close on themselves
    return 'M' + n(px) + ' ' + n(py) +
           'A' + n(r) + ' ' + n(r) + ' 0 1 1 ' + n(2 * cx - px) + ' ' + n(2 * cy - py) +
           'A' + n(r) + ' ' + n(r) + ' 0 1 1 ' + n(px) + ' ' + n(py);
  }
  return 'M' + n(px) + ' ' + n(py) + 'A' + n(r) + ' ' + n(r) + ' 0 ' +
         (Math.abs(deg) > 180 ? 1 : 0) + ' ' + (deg > 0 ? 1 : 0) + ' ' +
         n(cx + vx * ca - vy * sa) + ' ' + n(cy + vx * sa + vy * ca);
}

