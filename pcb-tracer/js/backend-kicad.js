"use strict";

/* ==========================================================================
   C. backends
   --------------------------------------------------------------------------
   Both board types end up behind one interface, so the viewer below doesn't
   care which it is drawing:

     { kind, W, H, nets, mount(wrap), netAt(ev), setHighlight(Set),
       describe(id), toggles, stats, onFlip(bool) }

   The difference that forces two implementations is where connectivity comes
   from. A .kicad_pcb states it outright, so that backend is an SVG whose
   elements carry data-net. Gerbers state nothing, so that backend has to
   recover it from pixels and ends up as a stack of canvases plus label arrays.
   ========================================================================== */

const SVG_NS = 'http://www.w3.org/2000/svg';
const PPM = 20;              // base render density (px per mm); zoom is CSS

/* ---- KiCad ------------------------------------------------------------- */

function kicadBackend(text, name) {
  const root = parseSexp(text);
  if (!Array.isArray(root) || root[0] !== 'kicad_pcb')
    throw new Error("this isn't a .kicad_pcb board file");
  const built = buildKicad(root);

  const vb = built.viewBox.split(' ').map(Number);
  const W = Math.max(1, Math.round(vb[2] * PPM)), H = Math.max(1, Math.round(vb[3] * PPM));

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', built.viewBox);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('id', 'board-svg');
  svg.style.width = W + 'px';
  svg.style.height = H + 'px';
  svg.innerHTML = built.html;

  const byNet = new Map();
  for (const el of svg.querySelectorAll('[data-net]')) {
    const id = +el.dataset.net;
    let a = byNet.get(id);
    if (!a) byNet.set(id, a = []);
    a.push(el);
  }

  const raw = built.nets;
  const nets = Object.keys(raw).map(k => ({id: +k, ...raw[k]}))
    .filter(v => v.id !== 0)
    .sort((a, b) => b.pads.length - a.pads.length || a.name.localeCompare(b.name))
    .map(v => ({id: v.id, name: v.name || '(net ' + v.id + ')',
                right: String(v.pads.length)}));

  const parts = built.parts;
  const cmpEls = [];
  for (const el of svg.querySelectorAll('[data-cmp]')) cmpEls[+el.dataset.cmp] = el;

  let painted = new Set(), paintedCmp = new Set();
  const c = built.counts;

  /* The Components layer switch is what turns all of this on: with it off the
     tool behaves exactly as it did and every pick resolves to a net. The class
     lives on #wrap, which the CSS already keys off, so read it from there
     rather than keeping a second copy of the same state. */
  const partsLive = () =>
    !!svg.parentNode && !svg.parentNode.classList.contains('no-cmp');

  /** Pointer -> board millimetres. getScreenCTM() carries every CSS transform
      above the svg, so pan, zoom and the flipped view all come out right.
      Applied by hand rather than through DOMPoint, which keeps it working
      whether the browser hands back a DOMMatrix or a legacy SVGMatrix. */
  function boardPoint(ev) {
    const m = svg.getScreenCTM();
    if (!m) return null;
    const i = m.inverse();
    return [i.a * ev.clientX + i.c * ev.clientY + i.e,
            i.b * ev.clientX + i.d * ev.clientY + i.f];
  }

  return {
    kind: 'kicad', W, H, nets, parts,
    mount: w => w.appendChild(svg),
    netAt(ev) {
      let t = ev.target;
      while (t && t !== svg) {
        if (t.dataset && t.dataset.net) return +t.dataset.net;
        t = t.parentNode;
      }
      return null;
    },
    /** Index of the part under the pointer, or null.

        Hit tested in board coordinates rather than by letting the browser do
        it, because a footprint's box has copper both above and below it in the
        stack: pads and vias are painted over it, pours and tracks under it.
        Doing it in JS is the only way to say what should win, and with a few
        hundred boxes it costs nothing. Smallest box wins, so a 0402 sitting
        inside a connector's outline is still the thing you picked.

        Pads and vias beat the part: copper you can trace is what you meant to
        click. Tracks and pours below it lose -- turn the layer off to get them
        back, which is the same switch that turned this on. */
    componentAt(ev) {
      if (!partsLive()) return null;
      for (let t = ev.target; t && t !== svg; t = t.parentNode)
        if (t.classList && (t.classList.contains('pad') || t.classList.contains('via')))
          return null;
      const p = boardPoint(ev);
      if (!p) return null;
      let best = null, bestArea = Infinity;
      for (let i = 0; i < parts.length; i++) {
        const c = parts[i], b = c.box;
        if (!b) continue;
        const a = -c.rot * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
        const dx = p[0] - c.x, dy = p[1] - c.y;
        const lx = dx * ca + dy * sa, ly = -dx * sa + dy * ca;   // inverse of the render transform
        if (lx < b[0] || lx > b[2] || ly < b[1] || ly > b[3]) continue;
        const area = (b[2] - b[0]) * (b[3] - b[1]);
        if (area < bestArea) { best = i; bestArea = area; }
      }
      return best;
    },
    setComponentHighlight(want) {
      for (const i of paintedCmp)
        if (!want.has(i) && cmpEls[i]) cmpEls[i].classList.remove('on');
      for (const i of want)
        if (!paintedCmp.has(i) && cmpEls[i]) cmpEls[i].classList.add('on');
      paintedCmp = new Set(want);
    },
    describeComponent(i) {
      const c = parts[i];
      if (!c) return '';
      const bits = partSummary(c);
      if (pinnedCmp === i) bits.push('pinned');
      // a 44-pin part would push everything else out of the box
      const CAP = 24;
      const chips = c.pads.slice(0, CAP).map(p =>
        '<b>' + esc(p.no) + (p.fn ? '<i>' + esc(p.fn) + '</i>' : '') +
        (p.name ? '<u>' + esc(p.name) + '</u>' : '') + '</b>').join(' ');
      const more = c.pads.length > CAP
        ? ' <span class="more">+' + (c.pads.length - CAP) + ' more</span>' : '';
      return '<div class="nn">' + esc(c.ref || '(no reference)') +
        (c.value ? ' <span class="cval">' + esc(c.value) + '</span>' : '') + '</div>' +
        '<div class="meta">' + esc(bits.join(' · ')) + '</div>' +
        (c.lib ? '<div class="cfp">' + esc(c.lib) + '</div>' : '') +
        (c.descr ? '<div class="cdesc">' + esc(c.descr) + '</div>' : '') +
        (chips ? '<div class="pads">' + chips + more + '</div>' : '');
    },
    setHighlight(want) {
      for (const id of painted)
        if (!want.has(id)) for (const el of byNet.get(id) || []) el.classList.remove('on');
      for (const id of want)
        if (!painted.has(id)) for (const el of byNet.get(id) || []) el.classList.add('on');
      painted = new Set(want);
    },
    describe(id) {
      const v = raw[id];
      if (!v) return '';
      const pads = v.pads.map(p => '<b>' + esc(p) + '</b>').join(' ');
      return '<div class="nn">' + esc(v.name || '(unnamed net ' + id + ')') + '</div>' +
        '<div class="meta">net ' + id + ' &middot; ' + v.pads.length + ' pad' +
        (v.pads.length === 1 ? '' : 's') + ' &middot; ' + v.seg + ' segments &middot; ' +
        v.via + ' vias' + (pinned.has(id) ? ' &middot; pinned' : '') + '</div>' +
        (pads ? '<div class="pads">' + pads + '</div>' : '');
    },
    onFlip(on) {
      // viewing from the back: back copper belongs above front copper
      for (const k of ['zones', 'tracks', 'pads']) {
        const gf = svg.querySelector('#g-' + k + '-f'), gb = svg.querySelector('#g-' + k + '-b');
        if (!gf || !gb) continue;
        const under = on ? gf : gb, over = on ? gb : gf;
        under.parentNode.insertBefore(under, over);
      }
    },
    toggles: [
      {cls: 'no-f', label: 'Front copper', swatch: 'var(--f)', on: true},
      {cls: 'no-b', label: 'Back copper', swatch: 'var(--b)', on: true},
      {cls: 'no-zones', label: 'Copper pours', swatch: '#6b5aa0', on: true},
      {cls: 'no-pads', label: 'Pads', swatch: '#f2a06a', on: true},
      {cls: 'no-vias', label: 'Vias', swatch: 'var(--via)', on: true},
      {cls: 'no-silk', label: 'Silkscreen & labels', swatch: 'var(--silk)', on: true},
      {cls: 'no-cmp', label: 'Components', swatch: '#7f8db0', on: false},
    ],
    stats: nets.length + ' nets &middot; ' + c.segment + ' tracks &middot; ' + c.via +
           ' vias &middot; ' + c.pad + ' pads &middot; ' + c.zone + ' pour islands' +
           (parts.length ? ' &middot; ' + parts.length + ' components' : ''),
  };
}
