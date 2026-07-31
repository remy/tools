"use strict";

/* ==========================================================================
   D. viewer -- one shell over either backend
   ========================================================================== */

const $ = id => document.getElementById(id);
const stage = $('stage'), wrap = $('wrap'), hud = $('hud'), netList = $('nets');
const drop = $('drop'), errBox = $('err');

let BE = null;
let view = {x: 0, y: 0, k: 1};
let flipped = false;
let pinned = new Set(), hovered = null;

function activate(be, title) {
  BE = be;
  flipped = false;
  pinned.clear();
  hovered = null;

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
    cb.addEventListener('change', apply);
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
    d.onmouseenter = () => { hovered = nn.id; paint(); };
    d.onmouseleave = () => { hovered = null; paint(); };
    d.onclick = e => toggle(nn.id, e.shiftKey || e.metaKey || e.ctrlKey);
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
  wrap.classList.toggle('dim', want.size > 0);
  for (const row of netList.children)
    row.classList.toggle('on', pinned.has(+row.dataset.net));

  const show = hovered ?? (pinned.size ? [...pinned][pinned.size - 1] : null);
  if (show == null) {
    hud.className = 'empty';
    hud.textContent = pinned.size ? pinned.size + ' nets pinned'
      : 'Hover a trace, pad or via — click to pin the net.';
  } else {
    hud.className = '';
    hud.innerHTML = BE.describe(show);
  }
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

function fit() {
  const r = stage.getBoundingClientRect();
  const k = fitScale();
  view = {k, x: (r.width - BE.W * k) / 2, y: (r.height - BE.H * k) / 2};
  applyView();
}

let dragging = false, moved = false, last = null;
stage.addEventListener('mousedown', e => {
  if (e.button !== 0 || !BE) return;
  dragging = true; moved = false; last = [e.clientX, e.clientY];
  stage.style.cursor = 'grabbing';
});
addEventListener('mousemove', e => {
  if (!dragging) return;
  if (Math.abs(e.clientX - last[0]) + Math.abs(e.clientY - last[1]) > 2) moved = true;
  view.x += e.clientX - last[0];
  view.y += e.clientY - last[1];
  last = [e.clientX, e.clientY];
  applyView();
});
addEventListener('mouseup', () => {
  if (!dragging) return;
  dragging = false;
  stage.style.cursor = 'crosshair';
});

stage.addEventListener('mousemove', e => {
  if (dragging || !BE) return;
  const id = BE.netAt(e);
  if (id !== hovered) { hovered = id; paint(); }
});
stage.addEventListener('mouseleave', () => { if (BE) { hovered = null; paint(); } });

stage.addEventListener('click', e => {
  if (moved || !BE) return;
  const id = BE.netAt(e);
  if (id == null) { if (!e.shiftKey) { pinned.clear(); paint(); } return; }
  toggle(id, e.shiftKey || e.metaKey || e.ctrlKey);
});

stage.addEventListener('wheel', e => {
  if (!BE) return;
  e.preventDefault();
  const r = stage.getBoundingClientRect();
  const mx = e.clientX - r.left, my = e.clientY - r.top;
  // floor at fit: zooming out past "the whole board on screen" is never useful.
  // When clamped the ratio is 1, so the pan anchor below leaves x/y untouched.
  const k = Math.min(400, Math.max(fitScale(), view.k * Math.exp(-e.deltaY * 0.0015)));
  view.x = mx - (mx - view.x) * (k / view.k);
  view.y = my - (my - view.y) * (k / view.k);
  view.k = k;
  applyView();
}, {passive: false});

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
$('clear').onclick = () => { pinned.clear(); paint(); };

addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') { if (e.key === 'Escape') e.target.blur(); return; }
  if (!BE) return;
  if (e.key === 'Escape') { pinned.clear(); paint(); }
  else if (e.key === 'f' || e.key === 'F') $('flip').click();
  else if (e.key === '1' || e.key === '2') {
    const cb = $('layers').querySelectorAll('input')[+e.key - 1];
    if (cb) cb.click();
  }
});
addEventListener('resize', () => {
  if (!BE) return;
  // a wider stage raises the fit scale, which can leave the current zoom below
  // the floor -- snap back rather than sit at an unreachable size
  if (view.k < fitScale()) fit(); else applyView();
});
