const canvas = document.getElementById('wave');
const ctx = canvas.getContext('2d');
const status = document.getElementById('status');
const baseTypeSelect = document.getElementById('base-type');
const freqSlider = document.getElementById('freq');
const freqReadout = document.getElementById('freq-readout');
const connectBtn = document.getElementById('connect');
const resetBtn = document.getElementById('reset');

const dialog = document.getElementById('point-dialog');
const dialogClose = document.getElementById('dialog-close');
const pointTypeSelect = document.getElementById('point-type');
const pointXSlider = document.getElementById('point-x');
const pointYSlider = document.getElementById('point-y');
const pointXReadout = document.getElementById('point-x-readout');
const pointYReadout = document.getElementById('point-y-readout');
const pointDeleteBtn = document.getElementById('point-delete');

const HIT_RADIUS = 14;
const HANDLE_RADIUS = 7;
const SAMPLE_COUNT = 512;
const HARMONICS = 128;
const DEFAULT_GAIN = 0.15;

const POINT_COLOURS = {
  smooth: '#10b981',
  corner: '#f59e0b',
  hold: '#a78bfa',
};

const state = {
  points: [],
  baseType: 'sine',
  nextId: 1,
};

let audio = null;
let connected = false;
let dpr = Math.max(1, window.devicePixelRatio || 1);

let pointer = {
  active: false,
  draggingId: null,
  movedSinceDown: false,
  downId: null,
  downAt: 0,
};

let editingId = null;

function ensureAudio() {
  if (audio) return audio;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const context = new Ctx();
  const osc = context.createOscillator();
  const gain = context.createGain();
  gain.gain.value = DEFAULT_GAIN;
  osc.frequency.value = Number(freqSlider.value);
  osc.type = state.baseType;
  osc.connect(gain);
  osc.start();
  audio = { context, osc, gain };
  applyWaveToOscillator();
  return audio;
}

async function toggleConnect() {
  const a = ensureAudio();
  if (connected) {
    a.gain.disconnect();
    connected = false;
    connectBtn.textContent = 'Connect to speakers';
    connectBtn.classList.remove('is-active');
  } else {
    if (a.context.state === 'suspended') {
      await a.context.resume();
    }
    a.gain.connect(a.context.destination);
    connected = true;
    connectBtn.textContent = 'Disconnect';
    connectBtn.classList.add('is-active');
  }
}

function setCanvasSize() {
  const rect = canvas.getBoundingClientRect();
  dpr = Math.max(1, window.devicePixelRatio || 1);
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
}

function getStyle(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function sortedPoints() {
  return [...state.points].sort((a, b) => a.x - b.x);
}

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function interpolatedSample(x, pts) {
  if (pts.length === 0) return baseSample(x);
  const wrappedRight = { ...pts[0], x: pts[0].x + 1 };
  const seq = [...pts, wrappedRight];

  let leftIdx = -1;
  for (let i = 0; i < seq.length - 1; i++) {
    if (x >= seq[i].x && x <= seq[i + 1].x) {
      leftIdx = i;
      break;
    }
  }
  if (leftIdx === -1) {
    const last = pts[pts.length - 1];
    const first = pts[0];
    const span = (1 - last.x) + first.x;
    const offset = x >= last.x ? x - last.x : (1 - last.x) + x;
    const t = span === 0 ? 0 : offset / span;
    return interpBetween(last, first, t);
  }
  const a = seq[leftIdx];
  const b = seq[leftIdx + 1];
  const span = b.x - a.x;
  const t = span === 0 ? 0 : (x - a.x) / span;
  return interpBetween(a, b, t);
}

function interpBetween(a, b, t) {
  switch (a.type) {
    case 'hold':
      return a.y;
    case 'corner':
      return a.y + (b.y - a.y) * t;
    case 'smooth':
    default:
      return a.y + (b.y - a.y) * smoothstep(t);
  }
}

function baseSample(x) {
  const tau = 2 * Math.PI * x;
  switch (state.baseType) {
    case 'square':
      return x < 0.5 ? 1 : -1;
    case 'sawtooth':
      return 2 * x - 1;
    case 'triangle':
      return x < 0.5 ? (4 * x - 1) : (3 - 4 * x);
    case 'sine':
    default:
      return Math.sin(tau);
  }
}

function buildSamples() {
  const pts = sortedPoints();
  const samples = new Float32Array(SAMPLE_COUNT);
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    samples[i] = interpolatedSample(i / SAMPLE_COUNT, pts);
  }
  return samples;
}

function buildPeriodicWave(context) {
  const samples = buildSamples();
  const N = samples.length;
  const K = Math.min(HARMONICS, Math.floor(N / 2));
  const real = new Float32Array(K + 1);
  const imag = new Float32Array(K + 1);
  for (let k = 1; k <= K; k++) {
    let re = 0;
    let im = 0;
    const w = (2 * Math.PI * k) / N;
    for (let n = 0; n < N; n++) {
      const s = samples[n];
      re += s * Math.cos(w * n);
      im += s * Math.sin(w * n);
    }
    real[k] = (2 / N) * re;
    imag[k] = (2 / N) * im;
  }
  return context.createPeriodicWave(real, imag, { disableNormalization: false });
}

function applyWaveToOscillator() {
  if (!audio) return;
  if (state.points.length === 0) {
    audio.osc.type = state.baseType;
  } else {
    const wave = buildPeriodicWave(audio.context);
    audio.osc.setPeriodicWave(wave);
  }
}

function dataToCanvas(x, y) {
  return {
    px: x * canvas.width,
    py: (0.5 - y / 2) * canvas.height,
  };
}

function canvasToData(px, py) {
  return {
    x: Math.max(0, Math.min(1, px / canvas.width)),
    y: Math.max(-1, Math.min(1, (0.5 - py / canvas.height) * 2)),
  };
}

function eventToCanvas(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    px: (e.clientX - rect.left) * (canvas.width / rect.width),
    py: (e.clientY - rect.top) * (canvas.height / rect.height),
  };
}

function findPointAt(px, py) {
  const radius = HIT_RADIUS * dpr;
  for (let i = state.points.length - 1; i >= 0; i--) {
    const p = state.points[i];
    const c = dataToCanvas(p.x, p.y);
    const dx = c.px - px;
    const dy = c.py - py;
    if (dx * dx + dy * dy <= radius * radius) {
      return p;
    }
  }
  return null;
}

function drawGrid() {
  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = getStyle('--surface-2');
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = getStyle('--grid');
  ctx.lineWidth = 1 * dpr;
  ctx.beginPath();
  for (let i = 1; i < 8; i++) {
    const x = (w * i) / 8;
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
  }
  for (let i = 1; i < 4; i++) {
    const y = (h * i) / 4;
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
  }
  ctx.stroke();

  ctx.strokeStyle = getStyle('--axis');
  ctx.lineWidth = 1.5 * dpr;
  ctx.beginPath();
  ctx.moveTo(0, h / 2);
  ctx.lineTo(w, h / 2);
  ctx.stroke();
}

function drawWave() {
  const w = canvas.width;
  const h = canvas.height;
  const pts = sortedPoints();
  ctx.strokeStyle = getStyle('--wave');
  ctx.lineWidth = 2.5 * dpr;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  const steps = Math.min(w, 720);
  for (let i = 0; i <= steps; i++) {
    const x = i / steps;
    const y = pts.length === 0 ? baseSample(x) : interpolatedSample(x, pts);
    const c = dataToCanvas(x, y);
    if (i === 0) ctx.moveTo(c.px, c.py);
    else ctx.lineTo(c.px, c.py);
  }
  ctx.stroke();
}

function drawHandles() {
  const r = HANDLE_RADIUS * dpr;
  for (const p of state.points) {
    const c = dataToCanvas(p.x, p.y);
    ctx.beginPath();
    ctx.arc(c.px, c.py, r + 2 * dpr, 0, Math.PI * 2);
    ctx.fillStyle = getStyle('--surface');
    ctx.fill();

    ctx.beginPath();
    ctx.arc(c.px, c.py, r, 0, Math.PI * 2);
    ctx.fillStyle = POINT_COLOURS[p.type] || POINT_COLOURS.smooth;
    ctx.fill();
    ctx.strokeStyle = getStyle('--handle');
    ctx.lineWidth = 1.5 * dpr;
    ctx.stroke();
  }
}

function render() {
  drawGrid();
  drawWave();
  drawHandles();
  updateStatus();
}

function updateStatus() {
  if (state.points.length === 0) {
    status.innerHTML = `No control points yet — using <strong>${state.baseType}</strong>.`;
  } else {
    const n = state.points.length;
    status.innerHTML = `${n} control point${n === 1 ? '' : 's'} shaping the wave. Tap a point to edit, drag to move.`;
  }
}

function addPoint(x, y) {
  const p = {
    id: state.nextId++,
    x,
    y,
    type: 'smooth',
  };
  state.points.push(p);
  applyWaveToOscillator();
  render();
  return p;
}

function updatePoint(id, patch) {
  const p = state.points.find(p => p.id === id);
  if (!p) return;
  Object.assign(p, patch);
  if (typeof patch.x === 'number') p.x = Math.max(0, Math.min(1, patch.x));
  if (typeof patch.y === 'number') p.y = Math.max(-1, Math.min(1, patch.y));
  applyWaveToOscillator();
  render();
}

function deletePoint(id) {
  state.points = state.points.filter(p => p.id !== id);
  applyWaveToOscillator();
  render();
}

function openDialogFor(id) {
  const p = state.points.find(p => p.id === id);
  if (!p) return;
  editingId = id;
  pointTypeSelect.value = p.type;
  pointXSlider.value = p.x;
  pointYSlider.value = p.y;
  pointXReadout.textContent = `${Math.round(p.x * 100)}%`;
  pointYReadout.textContent = p.y.toFixed(2);
  dialog.showModal();
}

dialog.addEventListener('click', (e) => {
  if (e.target === dialog) dialog.close();
});
dialog.addEventListener('close', () => {
  editingId = null;
});
dialogClose.addEventListener('click', () => dialog.close());

pointTypeSelect.addEventListener('change', () => {
  if (editingId == null) return;
  updatePoint(editingId, { type: pointTypeSelect.value });
});

pointXSlider.addEventListener('input', () => {
  if (editingId == null) return;
  const x = Number(pointXSlider.value);
  pointXReadout.textContent = `${Math.round(x * 100)}%`;
  updatePoint(editingId, { x });
});

pointYSlider.addEventListener('input', () => {
  if (editingId == null) return;
  const y = Number(pointYSlider.value);
  pointYReadout.textContent = y.toFixed(2);
  updatePoint(editingId, { y });
});

pointDeleteBtn.addEventListener('click', () => {
  if (editingId == null) return;
  deletePoint(editingId);
  dialog.close();
});

canvas.addEventListener('pointerdown', (e) => {
  ensureAudio();
  canvas.setPointerCapture(e.pointerId);
  const { px, py } = eventToCanvas(e);
  const hit = findPointAt(px, py);
  pointer.active = true;
  pointer.movedSinceDown = false;
  pointer.downAt = performance.now();
  if (hit) {
    pointer.downId = hit.id;
    pointer.draggingId = hit.id;
  } else {
    pointer.downId = null;
    pointer.draggingId = null;
  }
});

canvas.addEventListener('pointermove', (e) => {
  if (!pointer.active) return;
  const { px, py } = eventToCanvas(e);
  if (pointer.draggingId != null) {
    const moveThreshold = 3 * dpr;
    const data = canvasToData(px, py);
    const p = state.points.find(p => p.id === pointer.draggingId);
    if (p) {
      const c = dataToCanvas(p.x, p.y);
      if (!pointer.movedSinceDown) {
        if (Math.abs(c.px - px) > moveThreshold || Math.abs(c.py - py) > moveThreshold) {
          pointer.movedSinceDown = true;
        }
      }
      if (pointer.movedSinceDown) {
        updatePoint(pointer.draggingId, { x: data.x, y: data.y });
      }
    }
  }
});

canvas.addEventListener('pointerup', (e) => {
  if (!pointer.active) return;
  const { px, py } = eventToCanvas(e);
  const elapsed = performance.now() - pointer.downAt;
  const wasTap = !pointer.movedSinceDown && elapsed < 500;

  if (wasTap) {
    if (pointer.downId != null) {
      openDialogFor(pointer.downId);
    } else {
      const data = canvasToData(px, py);
      addPoint(data.x, data.y);
    }
  }
  pointer.active = false;
  pointer.draggingId = null;
  pointer.downId = null;
  pointer.movedSinceDown = false;
});

canvas.addEventListener('pointercancel', () => {
  pointer.active = false;
  pointer.draggingId = null;
  pointer.downId = null;
  pointer.movedSinceDown = false;
});

baseTypeSelect.addEventListener('change', () => {
  state.baseType = baseTypeSelect.value;
  applyWaveToOscillator();
  render();
});

freqSlider.addEventListener('input', () => {
  const hz = Number(freqSlider.value);
  freqReadout.textContent = `${hz} Hz`;
  if (audio) audio.osc.frequency.value = hz;
});

connectBtn.addEventListener('click', () => {
  toggleConnect();
});

resetBtn.addEventListener('click', () => {
  state.points = [];
  applyWaveToOscillator();
  render();
});

const ro = new ResizeObserver(() => {
  setCanvasSize();
  render();
});
ro.observe(canvas);

setCanvasSize();
render();

try { ensureAudio(); } catch { /* deferred until first user gesture */ }
