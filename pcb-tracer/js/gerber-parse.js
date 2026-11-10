"use strict";

/* ==========================================================================
   B2. Gerber: RS-274X parser
   --------------------------------------------------------------------------
   Gerber is a plotter format: apertures are shapes, and the file strokes and
   stamps them. There is no netlist anywhere in here -- that is why step 5 has
   to recover connectivity from the rendered geometry.
   ========================================================================== */

/* Tiny expression evaluator for aperture-macro arguments ($1+$2, 1.5x$3, ...).
   Gerber spells multiplication 'x'. Kept hand-rolled rather than new Function. */
function evalExpr(src, vars) {
  let i = 0;
  const s = src.replace(/\s+/g, '');
  const peek = () => s[i];
  function primary() {
    if (peek() === '(') { i++; const v = expr(); if (peek() === ')') i++; return v; }
    if (peek() === '-') { i++; return -primary(); }
    if (peek() === '+') { i++; return primary(); }
    if (peek() === '$') {
      i++;
      let d = '';
      while (i < s.length && /[0-9]/.test(s[i])) d += s[i++];
      return vars[+d] !== undefined ? vars[+d] : 0;
    }
    let d = '';
    while (i < s.length && /[0-9.]/.test(s[i])) d += s[i++];
    return parseFloat(d) || 0;
  }
  function term() {
    let v = primary();
    while (i < s.length && (s[i] === 'x' || s[i] === 'X' || s[i] === '/')) {
      const op = s[i++];
      const r = primary();
      v = op === '/' ? (r ? v / r : 0) : v * r;
    }
    return v;
  }
  function expr() {
    let v = term();
    while (i < s.length && (s[i] === '+' || s[i] === '-')) {
      const op = s[i++];
      const r = term();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }
  return expr();
}

/** Expand an aperture macro into primitive shapes in aperture-local units. */
function expandMacro(body, args) {
  const vars = {};
  args.forEach((v, k) => { vars[k + 1] = v; });
  const shapes = [];
  const rot = (x, y, deg) => {
    if (!deg) return [x, y];
    const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    return [x * c - y * s, x * s + y * c];
  };
  for (let stmt of body) {
    stmt = stmt.trim();
    if (!stmt || stmt[0] === '0') continue;                 // comment
    const assign = /^\$(\d+)\s*=\s*(.+)$/.exec(stmt);
    if (assign) { vars[+assign[1]] = evalExpr(assign[2], vars); continue; }
    const p = stmt.split(',').map(t => evalExpr(t, vars));
    const code = p[0];
    if (code === 1) {                                        // circle
      const [, on, d, x, y, r] = p;
      const [cx, cy] = rot(x || 0, y || 0, r || 0);
      shapes.push({type: 'circle', on: on !== 0, d, x: cx, y: cy});
    } else if (code === 4) {                                 // outline
      const on = p[1] !== 0, nv = p[2];
      const pts = [];
      for (let k = 0; k <= nv; k++) pts.push([p[3 + k * 2], p[4 + k * 2]]);
      const r = p[3 + (nv + 1) * 2] || 0;
      shapes.push({type: 'poly', on, pts: pts.map(q => rot(q[0], q[1], r))});
    } else if (code === 5) {                                 // regular polygon
      const [, on, nv, x, y, d, r] = p;
      const pts = [];
      for (let k = 0; k < nv; k++) {
        const a = (r || 0) * Math.PI / 180 + k * 2 * Math.PI / nv;
        pts.push([x + Math.cos(a) * d / 2, y + Math.sin(a) * d / 2]);
      }
      shapes.push({type: 'poly', on: on !== 0, pts});
    } else if (code === 20) {                                // vector line
      const [, on, w, x1, y1, x2, y2, r] = p;
      const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1;
      const nx = -dy / L * w / 2, ny = dx / L * w / 2;
      shapes.push({type: 'poly', on: on !== 0, pts: [
        [x1 + nx, y1 + ny], [x2 + nx, y2 + ny], [x2 - nx, y2 - ny], [x1 - nx, y1 - ny]
      ].map(q => rot(q[0], q[1], r || 0))});
    } else if (code === 21) {                                // centre line
      const [, on, w, h, x, y, r] = p;
      shapes.push({type: 'poly', on: on !== 0, pts: [
        [x - w / 2, y - h / 2], [x + w / 2, y - h / 2],
        [x + w / 2, y + h / 2], [x - w / 2, y + h / 2]
      ].map(q => rot(q[0], q[1], r || 0))});
    } else {
      warn('aperture macro primitive ' + code + ' is not supported (thermals/moirés)');
    }
  }
  return shapes;
}

function parseGerber(text) {
  const ops = [];
  const apertures = {};
  const macros = {};
  let fmt = {xi: 3, yi: 3, xd: 6, yd: 6, abs: true, trailingOmitted: false};
  let unitScale = 1;                       // to millimetres
  let ap = null, x = 0, y = 0, lastD = 2;
  let interp = 'lin', quadrant = 'multi', pol = 'D', region = false;
  let contours = null, contour = null;
  let netName = null, sawNet = false;
  let bbox = [Infinity, Infinity, -Infinity, -Infinity];

  const seen = (px, py, r) => {
    r = r || 0;
    if (px - r < bbox[0]) bbox[0] = px - r;
    if (py - r < bbox[1]) bbox[1] = py - r;
    if (px + r > bbox[2]) bbox[2] = px + r;
    if (py + r > bbox[3]) bbox[3] = py + r;
  };
  const apRadius = a => {
    if (!a) return 0;
    if (a.kind === 'C' || a.kind === 'P') return a.d / 2;
    if (a.kind === 'R' || a.kind === 'O') return Math.hypot(a.w, a.h) / 2;
    if (a.kind === 'M') {
      let m = 0;
      for (const s of a.shapes) {
        if (s.type === 'circle') m = Math.max(m, Math.hypot(s.x, s.y) + s.d / 2);
        else for (const p of s.pts) m = Math.max(m, Math.hypot(p[0], p[1]));
      }
      return m;
    }
    return 0;
  };

  function coord(str, dec) {
    // "L" (leading zeros omitted) is the near-universal modern form: the digits
    // are the fixed-point value. Explicit decimal points also show up.
    if (str.indexOf('.') >= 0) return parseFloat(str);
    let sign = 1, t = str;
    if (t[0] === '-') { sign = -1; t = t.slice(1); }
    else if (t[0] === '+') t = t.slice(1);
    if (fmt.trailingOmitted) t = t.padEnd(fmt.xi + dec, '0');
    return sign * parseInt(t, 10) / Math.pow(10, dec);
  }

  // split into commands: %...% blocks and *-terminated words. Skipping
  // whitespace first matters -- otherwise the newline before a "%...%" block
  // sends us down the word branch, which then swallows a '*' inside the block.
  const blocks = [];
  for (let i = 0; i < text.length;) {
    while (i < text.length && (text[i] === ' ' || text[i] === '\t' ||
                               text[i] === '\r' || text[i] === '\n')) i++;
    if (i >= text.length) break;
    if (text[i] === '%') {
      const end = text.indexOf('%', i + 1);
      if (end < 0) break;
      blocks.push({ext: true, body: text.slice(i + 1, end)});
      i = end + 1;
    } else {
      const end = text.indexOf('*', i);
      if (end < 0) break;
      const w = text.slice(i, end).replace(/[\r\n]/g, '').trim();
      if (w) blocks.push({ext: false, body: w});
      i = end + 1;
    }
  }

  for (const blk of blocks) {
    if (blk.ext) {
      const b = blk.body;
      let m;
      if ((m = /^FS([LT])?([AI])?X(\d)(\d)Y(\d)(\d)/.exec(b))) {
        fmt = {xi: +m[3], xd: +m[4], yi: +m[5], yd: +m[6],
               abs: m[2] !== 'I', trailingOmitted: m[1] === 'T'};
      } else if ((m = /^MO(MM|IN)/.exec(b))) {
        unitScale = m[1] === 'IN' ? 25.4 : 1;
      } else if ((m = /^AD D?(\d+)([A-Za-z_$][\w.$-]*|C|R|O|P),?(.*)$/s.exec(b.replace(/^AD/, 'AD ')))) {
        const code = +m[1], type = m[2];
        const args = (m[3] || '').split('*')[0].split('X')
          .map(t => parseFloat(t)).filter(v => !isNaN(v));
        // Aperture sizes are in the file's unit, exactly like coordinates. %MO
        // always precedes %AD, so scaling here is safe -- and forgetting it makes
        // an inch board render with millimetre-sized pads.
        const s = unitScale;
        const sc = v => v === undefined ? undefined : v * s;
        if (type === 'C') apertures[code] = {kind: 'C', d: sc(args[0]) || 0, hole: sc(args[1])};
        else if (type === 'R') apertures[code] = {kind: 'R', w: sc(args[0]) || 0, h: sc(args[1]) || 0, hole: sc(args[2])};
        else if (type === 'O') apertures[code] = {kind: 'O', w: sc(args[0]) || 0, h: sc(args[1]) || 0, hole: sc(args[2])};
        else if (type === 'P') apertures[code] = {kind: 'P', d: sc(args[0]) || 0, n: args[1] || 3, rot: args[2] || 0, hole: sc(args[3])};
        else if (macros[type]) {
          // scale the expanded geometry, not the arguments -- some are angles
          const shapes = expandMacro(macros[type], args);
          for (const sh of shapes) {
            if (sh.type === 'circle') { sh.d *= s; sh.x *= s; sh.y *= s; }
            else sh.pts = sh.pts.map(p => [p[0] * s, p[1] * s]);
          }
          apertures[code] = {kind: 'M', shapes};
        }
        else warn('unknown aperture template "' + type + '"');
      } else if ((m = /^AM([^*]+)\*([\s\S]*)$/.exec(b))) {
        macros[m[1].trim()] = m[2].split('*').filter(s => s.trim());
      } else if (/^LP([DC])/.test(b)) {
        pol = /^LPC/.test(b) ? 'C' : 'D';
      } else if ((m = /^TO\.N,([^*]*)/.exec(b))) {
        netName = m[1].trim(); sawNet = true;         // Gerber X2 net attribute
      } else if (/^TD/.test(b)) {
        netName = null;
      } else if (/^SR/.test(b) && !/^SRX1Y1/.test(b)) {
        warn('step-repeat (%SR%) is ignored; panelised copies will be missing');
      } else if (/^IPNEG/.test(b)) {
        warn('negative image polarity (%IPNEG%) is not supported');
      }
      continue;
    }

    // ---- function / operation words ----
    let w = blk.body;
    let m;
    while ((m = /^G0*(\d+)/.exec(w))) {
      const g = +m[1];
      if (g === 1) interp = 'lin';
      else if (g === 2) interp = 'cw';
      else if (g === 3) interp = 'ccw';
      else if (g === 4) { w = ''; break; }                 // comment
      else if (g === 36) { region = true; contours = []; contour = null; }
      else if (g === 37) {
        if (contours && contours.length)
          ops.push({op: 'region', contours, pol, net: netName});
        region = false; contours = null; contour = null;
      }
      else if (g === 70) unitScale = 25.4;
      else if (g === 71) unitScale = 1;
      else if (g === 74) quadrant = 'single';
      else if (g === 75) quadrant = 'multi';
      else if (g === 90) fmt.abs = true;
      else if (g === 91) fmt.abs = false;
      w = w.slice(m[0].length);
    }
    if (!w) continue;
    if (/^M0*[02]/.test(w)) break;

    if ((m = /^D0*(\d+)$/.exec(w)) && +m[1] >= 10) { ap = apertures[+m[1]] || null; continue; }

    const cx = /X([+-]?[\d.]+)/.exec(w), cy = /Y([+-]?[\d.]+)/.exec(w);
    const ci = /I([+-]?[\d.]+)/.exec(w), cj = /J([+-]?[\d.]+)/.exec(w);
    const cd = /D0*([123])$/.exec(w);
    if (!cx && !cy && !cd) continue;

    const nx = cx ? coord(cx[1], fmt.xd) * unitScale : (fmt.abs ? x : 0);
    const ny = cy ? coord(cy[1], fmt.yd) * unitScale : (fmt.abs ? y : 0);
    const tx = fmt.abs ? nx : x + nx, ty = fmt.abs ? ny : y + ny;
    const d = cd ? +cd[1] : lastD;      // a bare coordinate repeats the last op
    lastD = d;

    if (d === 3) {
      ops.push({op: 'flash', ap, x: tx, y: ty, pol, net: netName});
      seen(tx, ty, apRadius(ap));
    } else if (d === 1) {
      const arc = interp !== 'lin';
      let seg;
      if (arc) {
        const i0 = ci ? coord(ci[1], fmt.xd) * unitScale : 0;
        const j0 = cj ? coord(cj[1], fmt.yd) * unitScale : 0;
        let ox = x + i0, oy = y + j0;
        if (quadrant === 'single') {
          // legacy: I/J are unsigned, so try the four sign combinations
          let best = null;
          for (const si of [1, -1]) for (const sj of [1, -1]) {
            const px = x + si * Math.abs(i0), py = y + sj * Math.abs(j0);
            const e = Math.abs(Math.hypot(x - px, y - py) - Math.hypot(tx - px, ty - py));
            if (!best || e < best.e) best = {e, px, py};
          }
          ox = best.px; oy = best.py;
        }
        const r = Math.hypot(x - ox, y - oy);
        seg = {op: 'arc', ap, x1: x, y1: y, x2: tx, y2: ty, cx: ox, cy: oy,
               ccw: interp === 'ccw', pol, net: netName};
        seen(ox, oy, r + apRadius(ap));
      } else {
        seg = {op: 'draw', ap, x1: x, y1: y, x2: tx, y2: ty, pol, net: netName};
        seen(x, y, apRadius(ap)); seen(tx, ty, apRadius(ap));
      }
      if (region) {
        if (!contour) { contour = [{x, y}]; contours.push(contour); }
        contour.push(seg.op === 'arc'
          ? {x: tx, y: ty, cx: seg.cx, cy: seg.cy, ccw: seg.ccw}
          : {x: tx, y: ty});
      } else if (ap) ops.push(seg);
    } else if (d === 2 && region) {
      contour = [{x: tx, y: ty}];
      contours.push(contour);
    }
    x = tx; y = ty;
  }

  return {ops, bbox, hasNets: sawNet};
}

/* ==========================================================================
   B3. Gerber: Excellon drill parser -- the only thing that links the two copper layers
   ========================================================================== */

function parseDrill(text) {
  const hits = [];
  const tools = {};
  let metric = true, intDigits = 3, decDigits = 3, tool = null, header = true;
  let x = 0, y = 0;
  let bbox = [Infinity, Infinity, -Infinity, -Infinity];

  const lines = text.split(/\r?\n/);
  for (let raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (header) {
      let m;
      if (/^(METRIC|INCH)/.test(line)) {
        metric = line.startsWith('METRIC');
        if (!metric) { intDigits = 2; decDigits = 4; }
        if ((m = /,(0*)\.(0*)/.exec(line))) {
          intDigits = m[1].length || intDigits;
          decDigits = m[2].length || decDigits;
        }
        continue;
      }
      if ((m = /^;FILE_FORMAT\s*=\s*(\d+)[:.](\d+)/.exec(line))) {
        intDigits = +m[1]; decDigits = +m[2]; continue;
      }
      if ((m = /^T(\d+)[CF]([\d.]+)/.exec(line))) {
        tools[+m[1]] = parseFloat(m[2]) * (metric ? 1 : 25.4);
        continue;
      }
      if (/^(%|M95)/.test(line)) { header = false; continue; }
      if (line[0] === ';' || /^(M48|FMAT|VER|G0[05]|G9[01]|ICI|DETECT|ATC)/.test(line)) continue;
      // an X/Y line means the header ended without a marker
      if (!/^[XY]/.test(line)) continue;
      header = false;
    }

    let m;
    if ((m = /^T(\d+)/.exec(line))) { tool = tools[+m[1]] || 0.3; continue; }
    if (/^M3?0/.test(line)) break;
    if (/^G8[45]/.test(line) && !/[XY]/.test(line)) continue;

    const num = str => {
      if (str.indexOf('.') >= 0) return parseFloat(str);
      let sign = 1, t = str;
      if (t[0] === '-') { sign = -1; t = t.slice(1); }
      return sign * parseInt(t, 10) / Math.pow(10, decDigits);
    };
    const mx = /X([+-]?[\d.]+)/.exec(line), my = /Y([+-]?[\d.]+)/.exec(line);
    if (!mx && !my) continue;
    const nx = (mx ? num(mx[1]) : x) * (metric ? 1 : 25.4);
    const ny = (my ? num(my[1]) : y) * (metric ? 1 : 25.4);

    // G85 slot: "X1Y1G85X2Y2" -- sample along it so both ends stitch
    const slot = /G85X([+-]?[\d.]+)Y([+-]?[\d.]+)/.exec(line);
    const d = tool || 0.3;
    if (slot) {
      const ex = num(slot[1]) * (metric ? 1 : 25.4), ey = num(slot[2]) * (metric ? 1 : 25.4);
      const steps = Math.max(2, Math.ceil(Math.hypot(ex - nx, ey - ny) / (d / 2)));
      for (let k = 0; k <= steps; k++)
        hits.push({x: nx + (ex - nx) * k / steps, y: ny + (ey - ny) * k / steps, d});
      x = ex; y = ey;
    } else {
      hits.push({x: nx, y: ny, d});
      x = nx; y = ny;
    }
    const last = hits[hits.length - 1];
    bbox[0] = Math.min(bbox[0], last.x - d); bbox[1] = Math.min(bbox[1], last.y - d);
    bbox[2] = Math.max(bbox[2], last.x + d); bbox[3] = Math.max(bbox[3], last.y + d);
  }
  return {hits, bbox};
}
