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

  let painted = new Set();
  const c = built.counts;

  return {
    kind: 'kicad', W, H, nets,
    mount: w => w.appendChild(svg),
    netAt(ev) {
      let t = ev.target;
      while (t && t !== svg) {
        if (t.dataset && t.dataset.net) return +t.dataset.net;
        t = t.parentNode;
      }
      return null;
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
      {cls: 'no-fab', label: 'Component outlines', swatch: '#7f8db0', on: false},
    ],
    stats: nets.length + ' nets &middot; ' + c.segment + ' tracks &middot; ' + c.via +
           ' vias &middot; ' + c.pad + ' pads &middot; ' + c.zone + ' pour islands',
  };
}
