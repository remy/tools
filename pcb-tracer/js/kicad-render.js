"use strict";

/* ==========================================================================
   A3. KiCad: board -> SVG
   --------------------------------------------------------------------------
   Two coordinate facts drive everything here:
     * a pad's angle in the file is ABSOLUTE, not relative to its footprint,
       so the pad's own rotation is (padAngle - footprintAngle);
     * KiCad rotates with [[c,s],[-s,c]] in a y-down space, which is SVG's
       rotate(-angle).
   ========================================================================== */

const CU = ['F.Cu', 'B.Cu'];

function buildKicad(pcb) {
  const buckets = {};
  const push = (k, s) => (buckets[k] || (buckets[k] = [])).push(s);

  const nets = {};                       // id -> {name, pads, seg, via}
  for (const nd of kids(pcb, 'net')) nets[+nd[1]] = {
    name: nd.length > 2 ? nd[2] : '', pads: [], seg: 0, via: 0
  };
  const netOf = node => {
    const nn = kid(node, 'net');
    return nn ? +nn[1] : 0;
  };
  const netAttr = id => id ? ' data-net="' + id + '"' : '';
  const bump = (id, key) => { if (nets[id]) nets[id][key]++; };

  const bbox = [Infinity, Infinity, -Infinity, -Infinity];
  const grow = (x, y, pad) => {
    pad = pad || 0;
    if (x - pad < bbox[0]) bbox[0] = x - pad;
    if (y - pad < bbox[1]) bbox[1] = y - pad;
    if (x + pad > bbox[2]) bbox[2] = x + pad;
    if (y + pad > bbox[3]) bbox[3] = y + pad;
  };

  const counts = {segment: 0, via: 0, pad: 0, zone: 0};

  /* ---- copper pours ---------------------------------------------------- */
  for (const z of kids(pcb, 'zone')) {
    const net = netOf(z);
    const zl = kid(z, 'layer'), zls = kid(z, 'layers');
    const dflt = zl ? zl[1] : (zls ? zls[1] : 'F.Cu');
    for (const fp of kids(z, 'filled_polygon')) {
      const fl = kid(fp, 'layer');
      const layer = fl ? fl[1] : dflt;
      if (CU.indexOf(layer) < 0) continue;
      const pts = ptsOf(fp);
      if (pts.length < 3) continue;
      for (const p of pts) grow(p[0], p[1]);
      const side = layer === 'F.Cu' ? 'f' : 'b';
      push('zones-' + side, '<polygon class="cu zone ' + side + '" points="' +
           polyPoints(pts) + '"' + netAttr(net) + '/>');
      counts.zone++;
    }
  }

  /* ---- graphics (outline, silkscreen, fab) ----------------------------- */
  function graphic(g, ox, oy, rot) {
    ox = ox || 0; oy = oy || 0; rot = rot || 0;
    const lay = kid(g, 'layer');
    const layer = lay ? lay[1] : '';
    let bucket, cls;
    if (layer === 'Edge.Cuts') { bucket = 'edge'; cls = 'edge'; }
    else if (/\.SilkS$/.test(layer) || /\.Mask$/.test(layer)) {
      // plenty of boards (the Nintendo ones included) use mask openings as artwork
      bucket = 'silk'; cls = 'silk ' + (layer[0] === 'F' ? 'f' : 'b');
    } else if (/\.Fab$/.test(layer)) {
      bucket = 'fab'; cls = 'fab ' + (layer[0] === 'F' ? 'f' : 'b');
    } else return;

    const stroke = kid(g, 'stroke');
    const wNode = (stroke && kid(stroke, 'width')) || kid(g, 'width');
    const w = Math.max(wNode ? f(wNode[1], 0.12) : 0.12, 0.05);
    const sw = ' stroke-width="' + n(w) + '"';

    const a = -rot * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
    const tp = (x, y) => rot ? [x * ca - y * sa + ox, x * sa + y * ca + oy]
                             : [x + ox, y + oy];

    const fill = kid(g, 'fill');
    const filled = !!(fill && ['yes', 'solid', 'true'].indexOf(fill[1]) >= 0);
    const base = g[0].indexOf('_') >= 0 ? g[0].split('_')[1] : g[0];

    if (base === 'line') {
      const s = kid(g, 'start'), e = kid(g, 'end');
      if (!s || !e) return;
      const p1 = tp(f(s[1]), f(s[2])), p2 = tp(f(e[1]), f(e[2]));
      grow(p1[0], p1[1], w / 2); grow(p2[0], p2[1], w / 2);
      push(bucket, '<line class="' + cls + '" x1="' + n(p1[0]) + '" y1="' + n(p1[1]) +
           '" x2="' + n(p2[0]) + '" y2="' + n(p2[1]) + '"' + sw + '/>');

    } else if (base === 'arc') {
      const st = kid(g, 'start'), md = kid(g, 'mid'), en = kid(g, 'end'),
            ang = kid(g, 'angle');
      if (!st || !en) return;
      if (ang && !md) {                      // KiCad 5: centre + start + angle
        const c = tp(f(st[1]), f(st[2])), p = tp(f(en[1]), f(en[2]));
        grow(c[0], c[1], Math.hypot(p[0] - c[0], p[1] - c[1]) + w / 2);
        push(bucket, '<path class="' + cls + '" d="' +
             arcCenterAngle(c[0], c[1], p[0], p[1], f(ang[1])) + '"' + sw + '/>');
      } else {                               // KiCad 6+: start + mid + end
        const p1 = tp(f(st[1]), f(st[2])), p3 = tp(f(en[1]), f(en[2]));
        const p2 = md ? tp(f(md[1]), f(md[2]))
                      : [(p1[0] + p3[0]) / 2, (p1[1] + p3[1]) / 2];
        for (const p of [p1, p2, p3]) grow(p[0], p[1], w / 2);
        push(bucket, '<path class="' + cls + '" d="' + arcPath(p1, p2, p3) + '"' + sw + '/>');
      }

    } else if (base === 'circle') {
      const c = kid(g, 'center'), e = kid(g, 'end');
      if (!c || !e) return;
      const pc = tp(f(c[1]), f(c[2])), pe = tp(f(e[1]), f(e[2]));
      const r = Math.hypot(pe[0] - pc[0], pe[1] - pc[1]);
      grow(pc[0], pc[1], r + w / 2);
      push(bucket, '<circle class="' + cls + (filled ? ' filled' : '') + '" cx="' +
           n(pc[0]) + '" cy="' + n(pc[1]) + '" r="' + n(r) + '"' + sw + '/>');

    } else if (base === 'poly' || base === 'rect') {
      let pts;
      if (base === 'rect') {
        const s = kid(g, 'start'), e = kid(g, 'end');
        if (!s || !e) return;
        pts = [[f(s[1]), f(s[2])], [f(e[1]), f(s[2])],
               [f(e[1]), f(e[2])], [f(s[1]), f(e[2])]];
      } else pts = ptsOf(g);
      if (pts.length < 3) return;
      pts = pts.map(p => tp(p[0], p[1]));
      for (const p of pts) grow(p[0], p[1], w / 2);
      push(bucket, '<polygon class="' + cls + (filled ? ' filled' : '') +
           '" points="' + polyPoints(pts) + '"' + sw + '/>');
    }
  }

  for (const name of ['gr_line', 'gr_arc', 'gr_circle', 'gr_poly', 'gr_rect'])
    for (const g of kids(pcb, name)) graphic(g);

  /* ---- footprints: pads, artwork, refdes ------------------------------- */
  // 'module' is the KiCad 5 and earlier spelling of 'footprint'
  const footprints = kids(pcb, 'footprint').concat(kids(pcb, 'module'));

  for (const fpn of footprints) {
    const [fx, fy, frot] = atOf(fpn);
    let ref = '';
    for (const t of kids(fpn, 'fp_text'))
      if (t[1] === 'reference') { ref = t.length > 2 ? t[2] : ''; break; }

    for (const name of ['fp_line', 'fp_arc', 'fp_circle', 'fp_poly', 'fp_rect'])
      for (const g of kids(fpn, name)) graphic(g, fx, fy, frot);

    for (const t of kids(fpn, 'fp_text')) {
      if (hasFlag(t, 'hide')) continue;
      if (t[1] !== 'reference' && t[1] !== 'user') continue;
      const label = t.length > 2 ? t[2] : '';
      if (!label || label.indexOf('${') >= 0) continue;
      const [tx, ty] = atOf(t);
      const a = -frot * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
      const ax = tx * ca - ty * sa + fx, ay = tx * sa + ty * ca + fy;
      const eff = kid(t, 'effects');
      const fo = eff && kid(eff, 'font');
      const size = fo && kid(fo, 'size') ? f(kid(fo, 'size')[1], 1) : 1;
      push('labels', '<text class="lbl' + (t[1] === 'user' ? ' usr' : '') +
           '" x="' + n(ax) + '" y="' + n(ay) + '" font-size="' + n(size) + '">' +
           esc(label) + '</text>');
    }

    for (const p of kids(fpn, 'pad')) {
      if (p.length < 4) continue;
      const padNo = p[1], ptype = p[2], shape = p[3];
      const [px, py, prot] = atOf(p);
      const layers = kid(p, 'layers');
      const lnames = layers ? layers.slice(1).filter(x => typeof x === 'string') : [];

      const sides = [];
      if (lnames.some(l => l === 'F.Cu' || l === '*.Cu')) sides.push('f');
      if (lnames.some(l => l === 'B.Cu' || l === '*.Cu')) sides.push('b');
      if (!sides.length) continue;

      const net = netOf(p);
      if (net && nets[net]) {
        const fn = kid(p, 'pinfunction');
        let label = (ref || '?') + '.' + padNo;
        if (fn && fn.length > 1 && fn[1] !== padNo) label += ' (' + fn[1] + ')';
        nets[net].pads.push(label);
      }

      const sz = kid(p, 'size');
      const w = sz ? f(sz[1], 1) : 1;
      const h = sz && sz.length > 2 ? f(sz[2], w) : w;

      const gt = 'translate(' + n(fx) + ',' + n(fy) + ') rotate(' + n(-frot) + ')';
      const rel = prot - frot;
      let pt = 'translate(' + n(px) + ',' + n(py) + ')';
      if (Math.abs(rel) > 1e-9) pt += ' rotate(' + n(-rel) + ')';

      const body = [];
      if (shape === 'rect' || shape === 'roundrect' || shape === 'trapezoid') {
        let rr = 0;
        if (shape === 'roundrect') {
          const rat = kid(p, 'roundrect_rratio');
          rr = (rat ? f(rat[1], 0.25) : 0.25) * Math.min(w, h);
        }
        body.push('<rect x="' + n(-w / 2) + '" y="' + n(-h / 2) + '" width="' + n(w) +
                  '" height="' + n(h) + '"' + (rr ? ' rx="' + n(rr) + '"' : '') + '/>');
      } else if (shape === 'circle') {
        body.push('<circle cx="0" cy="0" r="' + n(w / 2) + '"/>');
      } else if (shape === 'oval') {
        body.push('<rect x="' + n(-w / 2) + '" y="' + n(-h / 2) + '" width="' + n(w) +
                  '" height="' + n(h) + '" rx="' + n(Math.min(w, h) / 2) + '"/>');
      } else if (shape === 'custom') {
        const opts = kid(p, 'options');
        const anchor = opts && kid(opts, 'anchor') ? kid(opts, 'anchor')[1] : 'circle';
        body.push(anchor === 'rect'
          ? '<rect x="' + n(-w / 2) + '" y="' + n(-h / 2) + '" width="' + n(w) +
            '" height="' + n(h) + '"/>'
          : '<circle cx="0" cy="0" r="' + n(w / 2) + '"/>');
        const prims = kid(p, 'primitives');
        if (prims) {
          for (const gp of kids(prims, 'gr_poly')) {
            const pts = ptsOf(gp);
            if (pts.length >= 3) body.push('<polygon points="' + polyPoints(pts) + '"/>');
          }
          for (const gl of kids(prims, 'gr_line')) {
            const s = kid(gl, 'start'), e = kid(gl, 'end'), wn = kid(gl, 'width');
            if (s && e) body.push('<line x1="' + n(f(s[1])) + '" y1="' + n(f(s[2])) +
              '" x2="' + n(f(e[1])) + '" y2="' + n(f(e[2])) + '" stroke="inherit" ' +
              'stroke-width="' + n(wn ? f(wn[1], 0.1) : 0.1) + '"/>');
          }
          for (const gc of kids(prims, 'gr_circle')) {
            const c = kid(gc, 'center'), e = kid(gc, 'end');
            if (c && e) body.push('<circle cx="' + n(f(c[1])) + '" cy="' + n(f(c[2])) +
              '" r="' + n(Math.hypot(f(e[1]) - f(c[1]), f(e[2]) - f(c[2]))) + '"/>');
          }
        }
      } else {
        body.push('<rect x="' + n(-w / 2) + '" y="' + n(-h / 2) + '" width="' + n(w) +
                  '" height="' + n(h) + '"/>');
      }

      const a = -frot * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
      grow(px * ca - py * sa + fx, px * sa + py * ca + fy, Math.max(w, h) / 2 + 0.2);
      counts.pad++;

      let hole = '';
      const drill = kid(p, 'drill');
      if (drill && (ptype === 'thru_hole' || ptype === 'np_thru_hole')) {
        const dr = f(drill[1], 0);
        if (dr) hole = '<circle class="hole" cx="0" cy="0" r="' + n(dr / 2) + '"/>';
      }

      const info = esc((ref || '?') + ' pad ' + padNo);
      for (const side of sides)
        push('pads-' + side, '<g class="cu pad ' + side + '" transform="' + gt + '"' +
             netAttr(net) + ' data-info="' + info + '"><g transform="' + pt + '">' +
             body.join('') + hole + '</g></g>');
    }
  }

  /* ---- tracks ---------------------------------------------------------- */
  for (const s of kids(pcb, 'segment')) {
    const lay = kid(s, 'layer');
    const layer = lay ? lay[1] : 'F.Cu';
    if (CU.indexOf(layer) < 0) continue;
    const st = kid(s, 'start'), en = kid(s, 'end'), wn = kid(s, 'width');
    if (!st || !en) continue;
    const w = wn ? f(wn[1], 0.2) : 0.2;
    const net = netOf(s);
    const x1 = f(st[1]), y1 = f(st[2]), x2 = f(en[1]), y2 = f(en[2]);
    grow(x1, y1, w / 2); grow(x2, y2, w / 2);
    const side = layer === 'F.Cu' ? 'f' : 'b';
    push('tracks-' + side, '<line class="cu trk ' + side + '" x1="' + n(x1) + '" y1="' +
         n(y1) + '" x2="' + n(x2) + '" y2="' + n(y2) + '" stroke-width="' + n(w) + '"' +
         netAttr(net) + '/>');
    counts.segment++; bump(net, 'seg');
  }

  for (const arcNode of kids(pcb, 'arc')) {
    const lay = kid(arcNode, 'layer');
    const layer = lay ? lay[1] : 'F.Cu';
    if (CU.indexOf(layer) < 0) continue;
    const st = kid(arcNode, 'start'), md = kid(arcNode, 'mid'), en = kid(arcNode, 'end');
    if (!st || !en) continue;
    const wn = kid(arcNode, 'width');
    const w = wn ? f(wn[1], 0.2) : 0.2;
    const net = netOf(arcNode);
    const p1 = [f(st[1]), f(st[2])], p3 = [f(en[1]), f(en[2])];
    const p2 = md ? [f(md[1]), f(md[2])] : [(p1[0] + p3[0]) / 2, (p1[1] + p3[1]) / 2];
    for (const p of [p1, p2, p3]) grow(p[0], p[1], w / 2);
    const side = layer === 'F.Cu' ? 'f' : 'b';
    push('tracks-' + side, '<path class="cu trk ' + side + '" d="' + arcPath(p1, p2, p3) +
         '" stroke-width="' + n(w) + '"' + netAttr(net) + '/>');
    counts.segment++; bump(net, 'seg');
  }

  /* ---- vias ------------------------------------------------------------ */
  for (const v of kids(pcb, 'via')) {
    const [x, y] = atOf(v);
    const sz = kid(v, 'size'), dr = kid(v, 'drill');
    const size = sz ? f(sz[1], 0.6) : 0.6, drill = dr ? f(dr[1], 0.3) : 0.3;
    const net = netOf(v);
    grow(x, y, size / 2);
    push('vias', '<g class="cu via" transform="translate(' + n(x) + ',' + n(y) + ')"' +
         netAttr(net) + '><circle class="ring" r="' + n(size / 2) +
         '"/><circle class="hole" r="' + n(drill / 2) + '"/></g>');
    counts.via++; bump(net, 'via');
  }

  /* ---- assemble -------------------------------------------------------- */
  // b/f pairs are adjacent so the viewer can swap their stacking on flip
  const order = ['zones-b', 'zones-f', 'tracks-b', 'tracks-f', 'pads-b', 'pads-f',
                 'vias', 'silk', 'fab', 'edge', 'labels'];
  const html = order.filter(k => buckets[k] && buckets[k].length)
    .map(k => '<g id="g-' + k + '">' + buckets[k].join('') + '</g>').join('');

  if (!Number.isFinite(bbox[0])) throw new Error('no drawable geometry found');
  const pad = Math.max(bbox[2] - bbox[0], bbox[3] - bbox[1]) * 0.02 + 1;
  const viewBox = [n(bbox[0] - pad), n(bbox[1] - pad),
                   n(bbox[2] - bbox[0] + 2 * pad), n(bbox[3] - bbox[1] + 2 * pad)].join(' ');

  const padKey = s => {
    const m = /\.(\w+)/.exec(s);
    if (!m) return [0, ''];
    return /^\d+$/.test(m[1]) ? [+m[1], ''] : [1e9, m[1]];
  };
  for (const id in nets) {
    nets[id].pads = [...new Set(nets[id].pads)].sort((a, b) => {
      const ra = a.split('.')[0], rb = b.split('.')[0];
      if (ra !== rb) return ra < rb ? -1 : 1;
      const ka = padKey(a), kb = padKey(b);
      return ka[0] - kb[0] || (ka[1] < kb[1] ? -1 : ka[1] > kb[1] ? 1 : 0);
    });
  }

  return {html, nets, viewBox, counts,
          cx: (bbox[0] + bbox[2]) / 2};
}
