import { render, layout } from './render.js';
import { DEFAULT_FONT, FONT_GROUPS, ALL_FONTS, loadFont, loadPreviews, previewFamily } from './fonts.js';
import { loadState, saveState, loadImageBlob, saveImageBlob, clearImageBlob } from './store.js';

// LinkedIn accepts 3:1 to 4:5, at least 552 × 276, ideally 1080px wide or more.
const PRESETS = [
  { id: 'portrait', name: 'Portrait', w: 1080, h: 1350 },
  { id: 'square', name: 'Square', w: 1080, h: 1080 },
  { id: 'landscape', name: 'Landscape', w: 1200, h: 627 },
  { id: 'widescreen', name: '16:9', w: 1920, h: 1080 },
  { id: 'banner', name: 'Wide 3:1', w: 1620, h: 540 },
];

const CUSTOM_FONT = '__custom';

const $ = (id) => document.getElementById(id);
const canvas = $('canvas');
const ctx = canvas.getContext('2d');
const wrapEl = $('canvas-wrap');
const selectionEl = $('selection');
const editor = $('text-editor');

const newId = () => Math.random().toString(36).slice(2, 10);

function newLayer(overrides = {}) {
  return {
    id: newId(),
    text: 'Your headline goes here',
    font: DEFAULT_FONT,
    weight: 800,
    italic: false,
    size: 96,
    color: '#ffffff',
    align: 'center',
    x: 0.1,
    y: 0.4,
    width: 0.8,
    leading: 1.1,
    tracking: -0.02,
    shadow: false,
    box: false,
    boxColor: '#0a66c2',
    ...overrides,
  };
}

function defaultState() {
  const layer = newLayer();
  return {
    preset: 'portrait',
    format: 'image/png',
    bg: { fit: 'cover', zoom: 1, offsetX: 0, offsetY: 0, color: '#0f172a', tint: '#000000', tintAlpha: 0 },
    layers: [layer],
    selected: layer.id,
  };
}

const saved = loadState();
const state = saved ? { ...defaultState(), ...saved, bg: { ...defaultState().bg, ...saved.bg } } : defaultState();
state.layers = (state.layers ?? []).map((l) => newLayer(l));

let image = null;

const preset = () => PRESETS.find((p) => p.id === state.preset) ?? PRESETS[0];
const selectedLayer = () => state.layers.find((l) => l.id === state.selected) ?? null;

/* ---------- Drawing ---------- */

let frame = 0;
function draw() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    render(ctx, state, image);
    updateSelection();
  });
}

function update() {
  draw();
  saveState(state);
}

function updateSelection() {
  const layer = selectedLayer();
  if (!layer || !layer.text.trim()) {
    selectionEl.hidden = true;
    return;
  }
  const { width: W, height: H } = canvas;
  const box = layout(ctx, layer, W, H);
  Object.assign(selectionEl.style, {
    left: `${(box.x / W) * 100}%`,
    top: `${(box.y / H) * 100}%`,
    width: `${(box.w / W) * 100}%`,
    height: `${(box.h / H) * 100}%`,
  });
  selectionEl.hidden = false;
}

function applyPreset() {
  const { w, h } = preset();
  canvas.width = w;
  canvas.height = h;
  wrapEl.style.setProperty('--ratio', w / h);
  $('size-label').textContent = `${w} × ${h}`;
  for (const btn of $('presets').children) {
    btn.setAttribute('aria-checked', String(btn.dataset.id === state.preset));
  }
}

/* ---------- Fonts ---------- */

const fontStatus = $('font-status');
const loadedFonts = new Set();

async function ensureFont(layer) {
  const key = `${layer.font}:${layer.weight}:${layer.italic}`;
  if (loadedFonts.has(key)) return true;
  const isSelected = layer.id === state.selected;
  if (isSelected) {
    fontStatus.classList.remove('error');
    fontStatus.textContent = `Loading ${layer.font}…`;
  }
  try {
    await loadFont(layer.font, layer.weight, layer.italic);
    loadedFonts.add(key);
    if (isSelected) fontStatus.textContent = '';
    draw();
    return true;
  } catch {
    if (layer.id === state.selected) {
      fontStatus.classList.add('error');
      fontStatus.textContent = `Couldn't load “${layer.font}” from Google Fonts — check the spelling.`;
    }
    return false;
  }
}

function buildFontSelect() {
  const select = $('font');
  for (const [label, fonts] of FONT_GROUPS) {
    const group = document.createElement('optgroup');
    group.label = label;
    for (const font of fonts) {
      const opt = new Option(font, font);
      opt.style.fontFamily = `"${previewFamily(font)}", system-ui`;
      group.append(opt);
    }
    select.append(group);
  }
  select.append(new Option('Other Google Font…', CUSTOM_FONT));
}

/* ---------- Controls ---------- */

function buildPresets() {
  const container = $('presets');
  for (const p of PRESETS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'preset';
    btn.setAttribute('role', 'radio');
    btn.dataset.id = p.id;
    btn.innerHTML = `<span class="shape"><i style="aspect-ratio:${p.w}/${p.h}"></i></span><span class="name"></span><span class="dims"></span>`;
    btn.querySelector('.name').textContent = p.name;
    btn.querySelector('.dims').textContent = `${p.w} × ${p.h}`;
    btn.addEventListener('click', () => {
      state.preset = p.id;
      applyPreset();
      update();
    });
    container.append(btn);
  }
}

function renderLayerList() {
  const list = $('layer-list');
  list.replaceChildren(
    ...state.layers.map((layer, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'layer';
      btn.setAttribute('role', 'radio');
      btn.setAttribute('aria-checked', String(layer.id === state.selected));
      const firstLine = layer.text.trim().split('\n')[0];
      btn.textContent = firstLine || `Text ${i + 1} (empty)`;
      btn.classList.toggle('empty-text', !firstLine);
      btn.addEventListener('click', () => selectLayer(layer.id));
      return btn;
    }),
  );
  $('btn-delete-text').disabled = !selectedLayer();
}

function selectLayer(id) {
  state.selected = id;
  renderLayerList();
  syncEditor();
  update();
}

function syncEditor() {
  const layer = selectedLayer();
  editor.setAttribute('aria-disabled', String(!layer));
  editor.inert = !layer;
  fontStatus.textContent = '';
  if (!layer) return;

  $('text').value = layer.text;
  const known = ALL_FONTS.includes(layer.font);
  $('font').value = known ? layer.font : CUSTOM_FONT;
  $('custom-font-field').hidden = known;
  $('custom-font').value = known ? '' : layer.font;
  $('weight').value = String(layer.weight);
  $('italic').checked = layer.italic;
  $('size').value = layer.size;
  $('color').value = layer.color;
  editor.querySelector(`input[name="align"][value="${layer.align}"]`).checked = true;
  $('width').value = Math.round(layer.width * 100);
  $('leading').value = layer.leading;
  $('tracking').value = layer.tracking;
  $('shadow').checked = layer.shadow;
  $('box').checked = layer.box;
  $('box-color').value = layer.boxColor;
  $('box-color-field').hidden = !layer.box;
  syncOutputs();
  ensureFont(layer);
}

function syncOutputs() {
  const layer = selectedLayer();
  $('zoom-out').textContent = `${Math.round(state.bg.zoom * 100)}%`;
  $('tint-out').textContent = `${Math.round(state.bg.tintAlpha * 100)}%`;
  if (!layer) return;
  $('size-out').textContent = `${layer.size}px`;
  $('width-out').textContent = `${Math.round(layer.width * 100)}%`;
  $('leading-out').textContent = layer.leading.toFixed(2);
  $('tracking-out').textContent = layer.tracking.toFixed(2);
}

function syncBackgroundControls() {
  document.querySelector(`input[name="fit"][value="${state.bg.fit}"]`).checked = true;
  $('zoom').value = Math.round(state.bg.zoom * 100);
  $('bg-color').value = state.bg.color;
  $('tint-color').value = state.bg.tint;
  $('tint').value = Math.round(state.bg.tintAlpha * 100);
  $('format').value = state.format;
  syncOutputs();
}

/** Binds an input to a property of the selected text layer. */
function bindLayer(id, prop, parse = (v) => v, event = 'input') {
  $(id).addEventListener(event, (e) => {
    const layer = selectedLayer();
    if (!layer) return;
    layer[prop] = parse(e.target.value);
    syncOutputs();
    update();
  });
}

function wireControls() {
  $('text').addEventListener('input', (e) => {
    const layer = selectedLayer();
    if (!layer) return;
    layer.text = e.target.value;
    renderLayerList();
    update();
  });

  $('font').addEventListener('change', (e) => {
    const layer = selectedLayer();
    if (!layer) return;
    const custom = e.target.value === CUSTOM_FONT;
    $('custom-font-field').hidden = !custom;
    if (custom) {
      $('custom-font').focus();
      return;
    }
    layer.font = e.target.value;
    ensureFont(layer);
    update();
  });

  $('custom-font').addEventListener('change', (e) => {
    const layer = selectedLayer();
    const name = e.target.value.trim();
    if (!layer || !name) return;
    layer.font = name;
    ensureFont(layer);
    update();
  });

  $('weight').addEventListener('change', (e) => {
    const layer = selectedLayer();
    if (!layer) return;
    layer.weight = Number(e.target.value);
    ensureFont(layer);
    update();
  });

  $('italic').addEventListener('change', (e) => {
    const layer = selectedLayer();
    if (!layer) return;
    layer.italic = e.target.checked;
    ensureFont(layer);
    update();
  });

  bindLayer('size', 'size', Number);
  bindLayer('color', 'color');
  bindLayer('width', 'width', (v) => Number(v) / 100);
  bindLayer('leading', 'leading', Number);
  bindLayer('tracking', 'tracking', Number);
  bindLayer('box-color', 'boxColor');

  $('align').addEventListener('change', (e) => {
    const layer = selectedLayer();
    if (!layer) return;
    layer.align = e.target.value;
    update();
  });

  $('shadow').addEventListener('change', (e) => {
    const layer = selectedLayer();
    if (!layer) return;
    layer.shadow = e.target.checked;
    update();
  });

  $('box').addEventListener('change', (e) => {
    const layer = selectedLayer();
    if (!layer) return;
    layer.box = e.target.checked;
    $('box-color-field').hidden = !layer.box;
    update();
  });

  $('place').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-place]');
    const layer = selectedLayer();
    if (!btn || !layer) return;
    const [col, row] = btn.dataset.place.split(',').map(Number);
    const { width: W, height: H } = canvas;
    const box = layout(ctx, layer, W, H);
    const margin = Math.min(W, H) * 0.07;
    const left = [margin, (W - box.w) / 2, W - margin - box.w][col];
    const top = [margin, (H - box.h) / 2, H - margin - box.h][row];
    layer.x = left / W;
    layer.y = top / H;
    layer.align = ['left', 'center', 'right'][col];
    editor.querySelector(`input[name="align"][value="${layer.align}"]`).checked = true;
    update();
  });

  $('btn-add-text').addEventListener('click', () => {
    const layer = newLayer({ text: 'New text', weight: 500, size: 48, y: 0.6, tracking: 0, leading: 1.25 });
    const current = selectedLayer();
    if (current) Object.assign(layer, { font: current.font, color: current.color });
    state.layers.push(layer);
    selectLayer(layer.id);
    $('text').select();
  });

  $('btn-delete-text').addEventListener('click', () => {
    const i = state.layers.findIndex((l) => l.id === state.selected);
    if (i === -1) return;
    state.layers.splice(i, 1);
    selectLayer(state.layers[Math.min(i, state.layers.length - 1)]?.id ?? null);
  });

  // Background
  $('fit').addEventListener('change', (e) => {
    state.bg.fit = e.target.value;
    update();
  });
  $('zoom').addEventListener('input', (e) => {
    state.bg.zoom = Number(e.target.value) / 100;
    syncOutputs();
    update();
  });
  $('btn-reset-bg').addEventListener('click', () => {
    Object.assign(state.bg, { zoom: 1, offsetX: 0, offsetY: 0 });
    syncBackgroundControls();
    update();
  });
  $('bg-color').addEventListener('input', (e) => {
    state.bg.color = e.target.value;
    update();
  });
  $('tint-color').addEventListener('input', (e) => {
    state.bg.tint = e.target.value;
    update();
  });
  $('tint').addEventListener('input', (e) => {
    state.bg.tintAlpha = Number(e.target.value) / 100;
    syncOutputs();
    update();
  });
  $('format').addEventListener('change', (e) => {
    state.format = e.target.value;
    saveState(state);
  });

  $('btn-choose').addEventListener('click', () => $('file-input').click());
  $('btn-clear-image').addEventListener('click', () => {
    setImage(null);
    clearImageBlob();
  });

  $('btn-download').addEventListener('click', download);
  $('btn-copy').addEventListener('click', copy);
}

/* ---------- Background image ---------- */

function setImage(bitmap) {
  image?.close?.();
  image = bitmap;
  document.body.classList.toggle('has-image', Boolean(image));
  $('btn-clear-image').hidden = !image;
  $('btn-choose').textContent = image ? 'Replace image…' : 'Choose image…';
  draw();
}

async function takeFile(file) {
  try {
    const bitmap = await createImageBitmap(file);
    Object.assign(state.bg, { zoom: 1, offsetX: 0, offsetY: 0 });
    syncBackgroundControls();
    setImage(bitmap);
    saveState(state);
    saveImageBlob(file);
  } catch {
    alert("That file couldn't be read as an image.");
  }
}

/* ---------- Dragging on the canvas ---------- */

function toCanvas(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((e.clientX - rect.left) / rect.width) * canvas.width,
    y: ((e.clientY - rect.top) / rect.height) * canvas.height,
  };
}

function hitLayer(pt) {
  const { width: W, height: H } = canvas;
  for (let i = state.layers.length - 1; i >= 0; i--) {
    const layer = state.layers[i];
    if (!layer.text.trim()) continue;
    const b = layout(ctx, layer, W, H);
    if (pt.x >= b.x && pt.x <= b.x + b.w && pt.y >= b.y && pt.y <= b.y + b.h) return layer;
  }
  return null;
}

function wireDragging() {
  let drag = null;

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const pt = toCanvas(e);
    const layer = hitLayer(pt);
    if (layer) {
      if (layer.id !== state.selected) selectLayer(layer.id);
      drag = { kind: 'layer', layer, start: pt, x: layer.x, y: layer.y };
    } else if (image) {
      drag = { kind: 'bg', start: pt, x: state.bg.offsetX, y: state.bg.offsetY };
    } else {
      return;
    }
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('dragging');
  });

  canvas.addEventListener('pointermove', (e) => {
    const pt = toCanvas(e);
    const { width: W, height: H } = canvas;
    if (!drag) {
      canvas.classList.toggle('over-text', Boolean(hitLayer(pt)));
      return;
    }
    const dx = (pt.x - drag.start.x) / W;
    const dy = (pt.y - drag.start.y) / H;
    if (drag.kind === 'layer') {
      const { layer } = drag;
      layer.x = drag.x + dx;
      layer.y = drag.y + dy;
      // Snap to the horizontal and vertical centre lines.
      const box = layout(ctx, layer, W, H);
      const snap = Math.min(W, H) * 0.012;
      if (Math.abs(box.x + box.w / 2 - W / 2) < snap) layer.x = (W - box.w) / 2 / W;
      if (Math.abs(box.y + box.h / 2 - H / 2) < snap) layer.y = (H - box.h) / 2 / H;
    } else {
      state.bg.offsetX = drag.x + dx;
      state.bg.offsetY = drag.y + dy;
    }
    draw();
  });

  const end = () => {
    if (!drag) return;
    drag = null;
    canvas.classList.remove('dragging');
    saveState(state);
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  canvas.addEventListener('keydown', (e) => {
    const layer = selectedLayer();
    const step = e.shiftKey ? 10 : 1;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (!layer || !moves[e.key]) return;
    e.preventDefault();
    layer.x += moves[e.key][0] / canvas.width;
    layer.y += moves[e.key][1] / canvas.height;
    update();
  });
}

/* ---------- Export ---------- */

async function renderFinal() {
  await Promise.all(state.layers.map(ensureFont));
  render(ctx, state, image);
}

function toBlob(type) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Export failed'))), type, 0.92);
  });
}

function flash(btn, text) {
  const original = btn.dataset.label ?? btn.textContent;
  btn.dataset.label = original;
  btn.textContent = text;
  clearTimeout(btn._t);
  btn._t = setTimeout(() => (btn.textContent = original), 1600);
}

async function download() {
  await renderFinal();
  const blob = await toBlob(state.format);
  const { w, h } = preset();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `linkedin-card-${w}x${h}.${state.format === 'image/jpeg' ? 'jpg' : 'png'}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  flash($('btn-download'), 'Saved');
}

async function copy() {
  const btn = $('btn-copy');
  try {
    // Safari needs the ClipboardItem created synchronously inside the click.
    const blob = renderFinal().then(() => toBlob('image/png'));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    flash(btn, 'Copied');
  } catch {
    flash(btn, 'Copy failed');
  }
}

/* ---------- Boot ---------- */

buildPresets();
buildFontSelect();
wireControls();
wireDragging();
applyPreset();
syncBackgroundControls();
renderLayerList();
syncEditor();
draw();
loadPreviews();

const blob = await loadImageBlob();
if (blob) {
  try {
    setImage(await createImageBitmap(blob));
  } catch {
    clearImageBlob();
  }
}
window.__cardEarly.register(takeFile);
