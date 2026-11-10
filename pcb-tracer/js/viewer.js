"use strict";

/* ==========================================================================
   D. viewer -- one shell over either backend
   ========================================================================== */

const $ = id => document.getElementById(id);
const stage = $('stage'), wrap = $('wrap'), hud = $('hud'), netList = $('nets');
const drop = $('drop'), errBox = $('err');

/** No hovering pointer means no net preview, so the prompt has to say "tap".
    The second pair is what the Components layer adds, and only shows while it
    is on -- there is nothing to point at otherwise. */
const TOUCH = matchMedia('(hover:none)').matches;
const HINT = TOUCH
  ? 'Tap a trace, pad or via to light up its net.'
  : 'Hover a trace, pad or via — click to pin the net.';
const HINT_CMP = TOUCH
  ? 'Tap a trace, pad or via for its net — or a component for the part.'
  : 'Hover a trace, pad or via for its net — or a component for the part.';

let BE = null;
let view = {x: 0, y: 0, k: 1};
let flipped = false;
let pinned = new Set(), hovered = null;
/* Components are a second, parallel selection: a part is not a net, so it gets
   its own hovered/pinned pair rather than being squeezed into the net sets. */
let pinnedCmp = null, hoveredCmp = null;

function activate(be, title) {
  BE = be;
  flipped = false;
  pinned.clear();
  hovered = null;
  pinnedCmp = hoveredCmp = null;

  wrap.className = '';
  wrap.textContent = '';
  wrap.style.width = be.W + 'px';
  wrap.style.height = be.H + 'px';
  be.mount(wrap);

  const box = $('layers');
  box.textContent = '';
  for (const t of be.toggles) {
    const l = document.createElement('label');
    l.className = 'tog';
    l.innerHTML = '<input type="checkbox"' + (t.on ? ' checked' : '') + '>' +
                  '<span class="swatch" style="background:' + t.swatch + '"></span>' +
                  esc(t.label);
    const cb = l.firstChild;
    const apply = () => wrap.classList.toggle(t.cls, !cb.checked);
    // repaint on a real change, not on the first apply: the net list belongs to
    // the previous board until buildNetList() below runs
    cb.addEventListener('change', () => { apply(); paint(); });
    apply();
    box.appendChild(l);
  }

  $('title').textContent = title;
  $('stats').innerHTML = be.stats;
  $('flip').classList.remove('on');
  $('flip').textContent = 'Flip board';

  buildNetList();
  $('warn').textContent = warnings.length ? '⚠ ' + warnings.join('\n⚠ ') : '';
  $('side').classList.remove('empty');
  for (const el of [hud, $('btns'), $('keys')]) el.hidden = false;
  drop.classList.add('hide');
  fit();
  paint();
}

function buildNetList() {
  netList.textContent = '';
  const frag = document.createDocumentFragment();
  for (const nn of BE.nets) {
    const d = document.createElement('div');
    d.className = 'net';
    d.dataset.net = nn.id;
    d.innerHTML = '<span class="nm">' + esc(nn.name) + '</span>' +
                  '<span class="ct">' + esc(nn.right) + '</span>';
    d.onmouseenter = () => { hovered = nn.id; hoveredCmp = null; paint(); };
    d.onmouseleave = () => { hovered = null; paint(); };
    d.onclick = e => {
      const additive = e.shiftKey || e.metaKey || e.ctrlKey;
      if (!additive) pinnedCmp = null;
      toggle(nn.id, additive);
      // on mobile the list covers the board, so picking one gets out of the way
      if (panel.open && !additive) panel.close();
    };
    frag.appendChild(d);
  }
  netList.appendChild(frag);
  $('q').value = '';
}

function paint() {
  if (!BE) return;
  const want = new Set(pinned);
  if (hovered) want.add(hovered);
  BE.setHighlight(want);

  const cmps = new Set();
  if (pinnedCmp != null) cmps.add(pinnedCmp);
  if (hoveredCmp != null) cmps.add(hoveredCmp);
  BE.setComponentHighlight?.(cmps);

  // the highlight itself is unconditional; `dim` only knocks back everything
  // it isn't, which is what the View option opts into
  wrap.classList.toggle('dim', (want.size > 0 || cmps.size > 0) && dimOnHighlight);
  for (const row of netList.children)
    row.classList.toggle('on', pinned.has(+row.dataset.net));

  // whatever the pointer is on beats whatever is pinned; within each of those,
  // a part can only be reported when nothing traceable was under the pointer,
  // so it is never competing with a net for the same click
  const lastNet = pinned.size ? [...pinned][pinned.size - 1] : null;
  hud.className = '';
  if (hoveredCmp != null) hud.innerHTML = BE.describeComponent(hoveredCmp);
  else if (hovered != null) hud.innerHTML = BE.describe(hovered);
  else if (pinnedCmp != null) hud.innerHTML = BE.describeComponent(pinnedCmp);
  else if (lastNet != null) hud.innerHTML = BE.describe(lastNet);
  else {
    hud.className = 'empty';
    hud.textContent = pinned.size ? pinned.size + ' nets pinned'
      : (componentsLive() ? HINT_CMP : HINT);
  }
}

/** Whether picking a part is on the table at all: a backend that knows about
    components, with the Components layer showing. Gerbers never do. */
const componentsLive = () => !!(BE && BE.componentAt && !wrap.classList.contains('no-cmp'));

/** What is under the pointer -- {cmp} or {net} or null. The backend decides
    which wins where they overlap; here they are just two kinds of answer. */
function hitAt(ev) {
  const i = BE.componentAt ? BE.componentAt(ev) : null;
  if (i != null) return {cmp: i};
  const id = BE.netAt(ev);
  return id == null ? null : {net: id};
}

function toggle(id, additive) {
  if (!additive) {
    const only = pinned.size === 1 && pinned.has(id);
    pinned.clear();
    if (!only) pinned.add(id);
  } else {
    pinned.has(id) ? pinned.delete(id) : pinned.add(id);
  }
  paint();
}

/* ---- pan / zoom ---- */
function applyView() {
  let t = 'translate(' + view.x + 'px,' + view.y + 'px) scale(' + view.k + ')';
  if (flipped) t += ' translate(' + BE.W + 'px,0) scale(-1,1)';
  wrap.style.transform = t;
  wrap.classList.toggle('crisp', BE.kind === 'gerber' && view.k > 1.5);
}

/** The scale at which the whole board just fits. Doubles as the zoom-out floor,
    so you can never shrink the board below the size it opens at. Computed live
    rather than cached, since it depends on the current stage size. */
function fitScale() {
  const r = stage.getBoundingClientRect();
  return Math.min(r.width / BE.W, r.height / BE.H) * 0.94;
}

let lastBox = null;                     // stage size, to re-centre after a resize

function fit() {
  const r = stage.getBoundingClientRect();
  const k = fitScale();
  view = {k, x: (r.width - BE.W * k) / 2, y: (r.height - BE.H * k) / 2};
  lastBox = [r.width, r.height];
  applyView();
}

/** Floor at fit: zooming out past "the whole board on screen" is never useful.
    When clamped the ratio is 1, so the anchoring below leaves x/y untouched. */
const clampScale = k => Math.min(400, Math.max(fitScale(), k));

/** Zoom to `k` while keeping the board point under stage-relative `from`
    parked under `to`. Panning and pinching are the same move with from ≠ to. */
function zoomAbout(k, from, to) {
  view.x = to[0] - (from[0] - view.x) * (k / view.k);
  view.y = to[1] - (from[1] - view.y) * (k / view.k);
  view.k = k;
  applyView();
}

/* One pointer path covers mouse and touch: drag pans, two fingers pinch, and a
   press that never moved is the pick. Touch gets implicit pointer capture, so
   the up event still reports the element the finger went down on -- which is
   exactly what the KiCad backend reads to find the net. */
const pointers = new Map();
let panning = false, moved = false, last = null, down = null, slop = 3;
let pinchD = 0, pinchMid = null;

const spread = () => {
  const [a, b] = [...pointers.values()];
  return [Math.hypot(a[0] - b[0], a[1] - b[1]), [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]];
};

stage.addEventListener('pointerdown', e => {
  if (!BE || (e.pointerType === 'mouse' && e.button !== 0)) return;
  pointers.set(e.pointerId, [e.clientX, e.clientY]);
  if (pointers.size === 1) {
    panning = true; moved = false;
    last = down = [e.clientX, e.clientY];
    slop = e.pointerType === 'mouse' ? 3 : 8;   // a finger wobbles more than a mouse
    stage.style.cursor = 'grabbing';
  } else if (pointers.size === 2) {
    panning = false;
    moved = true;                      // a second finger is never a pick
    [pinchD, pinchMid] = spread();
  }
});

addEventListener('pointermove', e => {
  if (!pointers.has(e.pointerId) || !BE) return;
  pointers.set(e.pointerId, [e.clientX, e.clientY]);
  const r = stage.getBoundingClientRect();
  if (pointers.size >= 2) {
    const [d, mid] = spread();
    if (!pinchD) { pinchD = d; pinchMid = mid; return; }
    zoomAbout(clampScale(view.k * (d / pinchD)),
              [pinchMid[0] - r.left, pinchMid[1] - r.top],
              [mid[0] - r.left, mid[1] - r.top]);
    pinchD = d; pinchMid = mid;
    return;
  }
  if (!panning) return;
  // measured from where the press started, not from the last move, so that a
  // slow drag can't creep along under the threshold and still count as a pick
  if (Math.abs(e.clientX - down[0]) + Math.abs(e.clientY - down[1]) > slop) moved = true;
  view.x += e.clientX - last[0];
  view.y += e.clientY - last[1];
  last = [e.clientX, e.clientY];
  applyView();
});

function release(e) {
  if (!pointers.delete(e.pointerId)) return;
  pinchD = 0;                          // whatever is left re-seeds the pinch
  if (pointers.size) {
    // one finger left of a pinch: carry on panning from where it is
    if (pointers.size === 1) { last = down = [...pointers.values()][0]; panning = true; }
    return;
  }
  const wasPick = panning && !moved;
  panning = false;
  stage.style.cursor = 'crosshair';
  if (wasPick && e.type === 'pointerup') pick(e);
}
addEventListener('pointerup', release);
addEventListener('pointercancel', release);

function pick(e) {
  if (!BE) return;
  const additive = e.shiftKey || e.metaKey || e.ctrlKey;
  const hit = hitAt(e);
  if (!hit) { if (!additive) { pinned.clear(); pinnedCmp = null; paint(); } return; }
  if (hit.cmp != null) {
    // clicking the pinned part again unpins it, matching how a net behaves
    pinnedCmp = pinnedCmp === hit.cmp ? null : hit.cmp;
    if (!additive) pinned.clear();
    paint();
    return;
  }
  if (!additive) pinnedCmp = null;
  toggle(hit.net, additive);
}

/* hover preview, mouse only -- there is no hovering on a touchscreen */
stage.addEventListener('pointermove', e => {
  if (e.pointerType !== 'mouse' || pointers.size || !BE) return;
  const hit = hitAt(e);
  const net = hit && hit.net != null ? hit.net : null;
  const cmp = hit && hit.cmp != null ? hit.cmp : null;
  if (net !== hovered || cmp !== hoveredCmp) { hovered = net; hoveredCmp = cmp; paint(); }
});
stage.addEventListener('pointerleave', e => {
  if (e.pointerType !== 'mouse' || !BE) return;
  if (hovered != null || hoveredCmp != null) { hovered = hoveredCmp = null; paint(); }
});

stage.addEventListener('wheel', e => {
  if (!BE) return;
  e.preventDefault();
  const r = stage.getBoundingClientRect();
  const at = [e.clientX - r.left, e.clientY - r.top];
  zoomAbout(clampScale(view.k * Math.exp(-e.deltaY * 0.0015)), at, at);
}, {passive: false});

/* ---- the nets / layers panel ----
   Below the sidebar breakpoint the board wants the whole viewport, so #side is
   moved into a modal <dialog> and moved back on close. Moving the live node
   (rather than duplicating the markup) keeps the layer checkboxes, the filter
   text and every listener exactly as they were. */
const panel = $('panel'), side = $('side');
const wide = matchMedia('(min-width:640px)');

function openPanel() {
  if (side.parentNode !== panel) panel.appendChild(side);
  panel.showModal();
}
panel.addEventListener('close', () => {
  if (side.parentNode === panel) $('app').insertBefore(side, $('main'));
  // drop any list-row preview
  if (hovered != null || hoveredCmp != null) { hovered = hoveredCmp = null; paint(); }
});
panel.addEventListener('click', e => { if (e.target === panel) panel.close(); });
$('panel-open').onclick = openPanel;
$('panel-close').onclick = () => panel.close();
wide.addEventListener('change', e => { if (e.matches && panel.open) panel.close(); });

/* ---- controls ---- */
$('q').addEventListener('input', e => {
  const q = e.target.value.toLowerCase();
  for (const row of netList.children)
    row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
});
$('flip').onclick = () => {
  if (!BE) return;
  flipped = !flipped;
  wrap.classList.toggle('flip', flipped);
  BE.onFlip(flipped);
  $('flip').classList.toggle('on', flipped);
  $('flip').textContent = flipped ? 'Back view' : 'Flip board';
  applyView();
};
$('fit').onclick = () => { if (BE) fit(); };
// no Clear button: tapping bare board already clears, and Esc does on a keyboard

addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') { if (e.key === 'Escape') e.target.blur(); return; }
  if (!BE) return;
  if (e.key === 'Escape') { pinned.clear(); pinnedCmp = null; paint(); }
  else if (e.key === 'f' || e.key === 'F') $('flip').click();
  else if (e.key === '1' || e.key === '2') {
    const cb = $('layers').querySelectorAll('input')[+e.key - 1];
    if (cb) cb.click();
  }
});
// Watching the stage rather than the window, because the stage also changes size
// with no resize event: the sidebar appearing when the panel closes on a rotate
// past the breakpoint, or mobile browser chrome sliding away.
new ResizeObserver(() => {
  if (!BE) return;
  const r = stage.getBoundingClientRect();
  // hold whatever was in the middle of the stage in the middle of it, so a
  // rotate or a reappearing sidebar doesn't shove the board off to one side
  if (lastBox) {
    view.x += (r.width - lastBox[0]) / 2;
    view.y += (r.height - lastBox[1]) / 2;
  }
  lastBox = [r.width, r.height];
  // a wider stage raises the fit scale, which can leave the current zoom below
  // the floor -- snap back rather than sit at an unreachable size
  if (view.k < fitScale()) fit(); else applyView();
}).observe(stage);
