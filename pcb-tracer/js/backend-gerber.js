"use strict";

/* ---- Gerber ------------------------------------------------------------ */

/** Which layer of the set a file is, by content first then by name. */
function classify(name, text) {
  const n = name.toLowerCase();
  const isDrill = /^M48\b/mi.test(text.slice(0, 400)) ||
                  (/^t\d+[cf][\d.]+/mi.test(text) && !/%FS/.test(text));
  if (isDrill && !/%FS/.test(text)) return 'drill';
  if (!/%FS|%MO(MM|IN)|^G04|D0[123]\*/m.test(text)) return null;
  if (/\.gtl$|f[_.-]?cu|top[_ .-]?(copper|layer)|toplayer|copper[_ .-]?top|\.cmp$/.test(n)) return 'top';
  if (/\.gbl$|b[_.-]?cu|bottom[_ .-]?(copper|layer)|bottomlayer|copper[_ .-]?bottom|\.sol$/.test(n)) return 'bot';
  if (/\.(gko|gm1|gm2)$|edge[_ .-]?cuts|outline|profile/.test(n)) return 'edge';
  if (/\.gto$|f[_.-]?silks|top[_ .-]?silk|silkscreen.*top|topsilk/.test(n)) return 'silktop';
  if (/\.gbo$|b[_.-]?silks|bottom[_ .-]?silk|bottomsilk/.test(n)) return 'silkbot';
  return null;
}

function gerberBackend(entries) {
  const found = {}, drills = [];
  for (const e of entries) {
    const kind = classify(e.name, e.text);
    if (!kind) continue;
    if (kind === 'drill') drills.push(parseDrill(e.text));
    else found[kind] = parseGerber(e.text);
  }
  if (!found.top && !found.bot) {
    const anyGerber = entries.some(e => classify(e.name, e.text));
    throw new Error(
      (anyGerber ? 'Gerbers found, but no top or bottom copper layer among them.'
                 : "that doesn't look like a board — expected a .kicad_pcb or Gerber files.") +
      '\nFiles seen:\n  ' + entries.map(e => e.name).join('\n  '));
  }
  if (!found.top || !found.bot) warn('only one copper layer found; nets cannot cross sides');
  if (!drills.length) warn('no drill file found, so top and bottom nets are not stitched');

  const bb = [Infinity, Infinity, -Infinity, -Infinity];
  const merge = o => {
    if (!o || !isFinite(o.bbox[0])) return;
    bb[0] = Math.min(bb[0], o.bbox[0]); bb[1] = Math.min(bb[1], o.bbox[1]);
    bb[2] = Math.max(bb[2], o.bbox[2]); bb[3] = Math.max(bb[3], o.bbox[3]);
  };
  ['top', 'bot', 'edge', 'silktop', 'silkbot'].forEach(k => merge(found[k]));
  drills.forEach(merge);
  if (!isFinite(bb[0])) throw new Error('no drawable geometry found');

  const mmW = bb[2] - bb[0], mmH = bb[3] - bb[1];
  const MAXPX = 12e6;                 // two Int32 label arrays plus an ImageData
  let ppm = Math.min(66, Math.sqrt(MAXPX / (mmW * mmH)));
  const W = Math.max(1, Math.round(mmW * ppm)), H = Math.max(1, Math.round(mmH * ppm));
  ppm = W / mmW;

  const mk = () => {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d', {willReadFrequently: true});
    g.setTransform(ppm, 0, 0, -ppm, -bb[0] * ppm, bb[3] * ppm);   // Gerber is y-up
    return {c, g};
  };
  const top = mk(), bot = mk(), silk = mk(), edge = mk();
  if (found.top) rasterise(top.g, found.top.ops, '#e04a4a');
  if (found.bot) rasterise(bot.g, found.bot.ops, '#3f7fd0');
  if (found.silktop) rasterise(silk.g, found.silktop.ops, 'rgba(223,230,245,.55)');
  if (found.silkbot) rasterise(silk.g, found.silkbot.ops, 'rgba(150,165,195,.4)');
  if (found.edge) rasterise(edge.g, found.edge.ops, '#e8d44d');
  top.c.id = 'c-top'; bot.c.id = 'c-bot'; silk.c.id = 'c-silk'; edge.c.id = 'c-edge';

  const layers = {};
  for (const side of ['top', 'bot']) {
    if (!found[side]) { layers[side] = {labels: new Int32Array(W * H), ncomp: 0}; continue; }
    const src = side === 'top' ? top : bot;
    layers[side] = labelLayer(src.g.getImageData(0, 0, W, H).data, W, H, 128);
  }

  // stitch the sides through drill hits -- the only thing that can join them
  const nTop = layers.top.ncomp, nBot = layers.bot.ncomp, total = nTop + nBot + 1;
  const par = new Int32Array(total);
  for (let i = 0; i < total; i++) par[i] = i;
  const find = a => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
  const uni = (a, b) => { a = find(a); b = find(b); if (a !== b) par[Math.max(a, b)] = Math.min(a, b); };
  const gid = (side, l) => side === 'top' ? l : nTop + l;
  const px2 = {x: v => Math.round((v - bb[0]) * ppm), y: v => Math.round((bb[3] - v) * ppm)};

  let stitched = 0;
  const holesAt = new Map();
  for (const dr of drills) for (const h of dr.hits) {
    const cx = px2.x(h.x), cy = px2.y(h.y);
    const r = Math.max(1, Math.round(h.d / 2 * ppm));
    let lt = 0, lb = 0;                        // a drill lands in the annular ring
    for (let dy = -r; dy <= r && (!lt || !lb); dy++)
      for (let dx = -r; dx <= r && (!lt || !lb); dx++) {
        const px = cx + dx, py = cy + dy;
        if (px < 0 || py < 0 || px >= W || py >= H) continue;
        const i = py * W + px;
        if (!lt) lt = layers.top.labels[i];
        if (!lb) lb = layers.bot.labels[i];
      }
    if (lt && lb) { uni(gid('top', lt), gid('bot', lb)); stitched++; }
    const key = lt ? gid('top', lt) : (lb ? gid('bot', lb) : 0);
    if (key) holesAt.set(key, (holesAt.get(key) || 0) + 1);
  }

  const netOf = new Int32Array(total);
  const info = [];
  for (let i = 1; i < total; i++) {
    const root = find(i);
    if (!netOf[root]) {
      info.push({id: info.length + 1, px: 0, holes: 0, top: false, bot: false, name: null});
      netOf[root] = info.length;
    }
    netOf[i] = netOf[root];
  }
  const netAtLabel = (side, l) => l ? netOf[gid(side, l)] : 0;

  for (let i = 0; i < W * H; i++) {
    const lt = layers.top.labels[i], lb = layers.bot.labels[i];
    if (lt) { const v = info[netAtLabel('top', lt) - 1]; v.px++; v.top = true; }
    if (lb) { const v = info[netAtLabel('bot', lb) - 1]; v.px++; v.bot = true; }
  }
  for (const [k, v] of holesAt) {
    const nn = info[netOf[find(k)] - 1];
    if (nn) nn.holes += v;
  }

  // Gerber X2 net names, if the exporter wrote any
  let named = 0;
  for (const side of ['top', 'bot']) {
    if (!found[side] || !found[side].hasNets) continue;
    for (const o of found[side].ops) {
      if (!o.net) continue;
      const ox = o.op === 'flash' ? o.x : o.x1, oy = o.op === 'flash' ? o.y : o.y1;
      if (ox === undefined) continue;
      const i = px2.y(oy) * W + px2.x(ox);
      if (i < 0 || i >= W * H) continue;
      const nn = info[netAtLabel(side, layers[side].labels[i]) - 1];
      if (nn && !nn.name) { nn.name = o.net; named++; }
    }
  }

  const byId = new Map(info.map(v => [v.id, v]));
  info.sort((a, b) => b.px - a.px);
  info.forEach((v, k) => { v.rank = k + 1; });
  const mm2 = p => p / (ppm * ppm);
  const label = v => v.name || ('Net ' + v.rank);

  const hi = document.createElement('canvas');
  hi.width = W; hi.height = H; hi.id = 'c-hi';
  const hiCtx = hi.getContext('2d');
  const hiData = hiCtx.createImageData(W, H);
  const pixCache = new Map();
  let painted = new Set();

  function pixelsOf(id) {
    let got = pixCache.get(id);
    if (got) return got;
    const N = W * H;
    const hit = i => {
      const lt = layers.top.labels[i], lb = layers.bot.labels[i];
      return (lt && netAtLabel('top', lt) === id) || (lb && netAtLabel('bot', lb) === id);
    };
    let count = 0;
    for (let i = 0; i < N; i++) if (hit(i)) count++;
    got = new Int32Array(count);
    for (let i = 0, k = 0; i < N; i++) if (hit(i)) got[k++] = i;
    pixCache.set(id, got);
    return got;
  }

  const milPerPx = (1 / ppm) / 0.0254;
  if (milPerPx > 3)
    warn('board is large, so the raster is only ' + milPerPx.toFixed(1) +
         ' mil/px — check narrow gaps before trusting a net');

  let isFlipped = false;

  return {
    kind: 'gerber', W, H,
    nets: info.filter(v => v.px >= 8).map(v => ({
      id: v.id, name: label(v),
      right: (v.top ? 'F' : '') + (v.bot ? 'B' : '') + (v.holes ? ' · ' + v.holes : ''),
    })),
    mount(w) { for (const c of [bot.c, top.c, silk.c, edge.c, hi]) w.appendChild(c); },
    netAt(ev) {
      const r = stage.getBoundingClientRect();
      let px = (ev.clientX - r.left - view.x) / view.k;
      const py = (ev.clientY - r.top - view.y) / view.k;
      if (isFlipped) px = W - px;
      const ix = Math.floor(px), iy = Math.floor(py);
      if (ix < 0 || iy < 0 || ix >= W || iy >= H) return null;
      const i = iy * W + ix;
      const topOn = !wrap.classList.contains('no-top');
      const botOn = !wrap.classList.contains('no-bot');
      const lt = topOn ? layers.top.labels[i] : 0;
      const lb = botOn ? layers.bot.labels[i] : 0;
      // prefer whichever side is drawn uppermost right now
      const first = isFlipped ? lb : lt, second = isFlipped ? lt : lb;
      const fs = isFlipped ? 'bot' : 'top', ss = isFlipped ? 'top' : 'bot';
      if (first) return netAtLabel(fs, first);
      if (second) return netAtLabel(ss, second);
      return null;
    },
    setHighlight(want) {
      const d = hiData.data;
      let changed = false;
      for (const id of painted) if (!want.has(id)) {
        for (const i of pixelsOf(id)) d[i * 4 + 3] = 0;
        changed = true;
      }
      for (const id of want) if (!painted.has(id)) {
        for (const i of pixelsOf(id)) {
          d[i * 4] = 255; d[i * 4 + 1] = 225; d[i * 4 + 2] = 77; d[i * 4 + 3] = 255;
        }
        changed = true;
      }
      if (changed) hiCtx.putImageData(hiData, 0, 0);
      painted = new Set(want);
    },
    describe(id) {
      const v = byId.get(id);
      if (!v) return '';
      return '<div class="nn">' + esc(label(v)) + '</div><div class="meta">' +
        (v.top && v.bot ? 'both sides' : v.top ? 'top only' : 'bottom only') +
        ' &middot; ' + v.holes + ' hole' + (v.holes === 1 ? '' : 's') +
        ' &middot; ' + mm2(v.px).toFixed(1) + ' mm² of copper' +
        (v.name ? '' : ' &middot; unnamed (Gerbers carry no netlist)') +
        (pinned.has(id) ? ' &middot; pinned' : '') + '</div>';
    },
    onFlip(on) {
      isFlipped = on;
      wrap.insertBefore(on ? top.c : bot.c, on ? bot.c : top.c);
    },
    toggles: [
      {cls: 'no-top', label: 'Top copper', swatch: 'var(--f)', on: true},
      {cls: 'no-bot', label: 'Bottom copper', swatch: 'var(--b)', on: true},
      {cls: 'no-gsilk', label: 'Silkscreen', swatch: 'var(--silk)', on: true},
      {cls: 'no-edge', label: 'Board outline', swatch: 'var(--edge)', on: true},
    ],
    stats: info.filter(v => v.px >= 8).length + ' nets &middot; ' + mmW.toFixed(1) +
      ' &times; ' + mmH.toFixed(1) + ' mm &middot; ' + W + '&times;' + H + ' px (' +
      milPerPx.toFixed(2) + ' mil/px) &middot; ' + stitched + ' stitched holes' +
      (named ? ' &middot; ' + named + ' X2 net names' : ''),
  };
}
