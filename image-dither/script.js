// 6-colour palette — index order matters (matches device spec).
// 0=Black, 1=White, 2=Red, 3=Green, 4=Blue, 5=Yellow
const PALETTE = [
  [0,   0,   0  ],
  [255, 255, 255],
  [255, 0,   0  ],
  [0,   255, 0  ],
  [0,   0,   255],
  [255, 255, 0  ],
];

// DOM
const presetSelect   = document.getElementById('presetSelect');
const widthInput     = document.getElementById('widthInput');
const heightInput    = document.getElementById('heightInput');
const fitSelect      = document.getElementById('fitSelect');
const bgSelect       = document.getElementById('bgSelect');
const ditherSelect   = document.getElementById('ditherSelect');
const uploadZone     = document.getElementById('uploadZone');
const fileInput      = document.getElementById('fileInput');
const results        = document.getElementById('results');
const resultCount    = document.getElementById('resultCount');
const fileList       = document.getElementById('fileList');
const clearBtn       = document.getElementById('clearBtn');
const downloadAllBtn = document.getElementById('downloadAllBtn');
const resultTemplate = document.getElementById('resultTemplate');

// State
const items = []; // { id, file, card, url, blob, width, height }
let nextId = 1;

// ── Preset & resolution wiring ───────────────────────────────────────────────
function applyPreset() {
  const v = presetSelect.value;
  const custom = v === 'custom';
  widthInput.disabled = !custom;
  heightInput.disabled = !custom;
  if (!custom) {
    const [w, h] = v.split('x').map(Number);
    widthInput.value = w;
    heightInput.value = h;
  }
}

presetSelect.addEventListener('change', () => {
  applyPreset();
  reprocessAll();
});

[widthInput, heightInput, fitSelect, bgSelect, ditherSelect].forEach(el => {
  el.addEventListener('change', reprocessAll);
});

applyPreset();

// ── File input & drag-drop ───────────────────────────────────────────────────
uploadZone.addEventListener('click', (e) => {
  if (e.target.closest('.file-label')) return;
  fileInput.click();
});

fileInput.addEventListener('change', (e) => {
  addFiles(e.target.files);
  fileInput.value = '';
});

['dragenter', 'dragover'].forEach(evt => {
  uploadZone.addEventListener(evt, (e) => {
    e.preventDefault();
    uploadZone.classList.add('drag-over');
  });
});

['dragleave', 'drop'].forEach(evt => {
  uploadZone.addEventListener(evt, (e) => {
    e.preventDefault();
    if (evt === 'dragleave' && e.target !== uploadZone) return;
    uploadZone.classList.remove('drag-over');
  });
});

uploadZone.addEventListener('drop', (e) => {
  if (e.dataTransfer?.files) addFiles(e.dataTransfer.files);
});

// ── Bulk buttons ─────────────────────────────────────────────────────────────
clearBtn.addEventListener('click', () => {
  for (const item of items) revokeItem(item);
  items.length = 0;
  fileList.innerHTML = '';
  updateResultsVisibility();
});

downloadAllBtn.addEventListener('click', () => {
  // Staggered triggering so browsers don't suppress as popup.
  items.forEach((item, i) => {
    if (!item.blob) return;
    setTimeout(() => triggerDownload(item), i * 150);
  });
});

// ── File handling ────────────────────────────────────────────────────────────
function addFiles(fileList) {
  const images = Array.from(fileList).filter(f => f.type.startsWith('image/'));
  for (const file of images) {
    const item = createItem(file);
    items.push(item);
  }
  updateResultsVisibility();
  processQueue();
}

function createItem(file) {
  const fragment = resultTemplate.content.cloneNode(true);
  const card = fragment.querySelector('.file-card');
  card.querySelector('[data-name]').textContent = file.name;
  card.querySelector('[data-meta]').textContent = formatBytes(file.size) + ' source';
  const id = nextId++;
  card.querySelector('[data-remove]').addEventListener('click', () => removeItem(id));
  card.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => setPreviewMode(id, btn.dataset.mode));
  });
  document.getElementById('fileList').appendChild(card);
  return { id, file, card, blob: null, url: null, mode: 'dithered' };
}

function setPreviewMode(id, mode) {
  const item = items.find(it => it.id === id);
  if (!item) return;
  item.mode = mode;
  const ditheredCanvas = item.card.querySelector('[data-canvas-dithered]');
  const sourceCanvas = item.card.querySelector('[data-canvas-source]');
  ditheredCanvas.hidden = mode !== 'dithered';
  sourceCanvas.hidden = mode !== 'source';
  item.card.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.setAttribute('aria-pressed', btn.dataset.mode === mode ? 'true' : 'false');
  });
}

function removeItem(id) {
  const idx = items.findIndex(it => it.id === id);
  if (idx === -1) return;
  const item = items[idx];
  revokeItem(item);
  item.card.remove();
  items.splice(idx, 1);
  updateResultsVisibility();
}

function revokeItem(item) {
  if (item.url) URL.revokeObjectURL(item.url);
  item.url = null;
  item.blob = null;
}

function updateResultsVisibility() {
  results.hidden = items.length === 0;
  resultCount.textContent = items.length ? `(${items.length})` : '';
  const done = items.filter(it => it.blob).length;
  downloadAllBtn.disabled = done === 0;
}

// ── Queue — processes one image at a time to avoid blocking the UI ──────────
let processing = false;
async function processQueue() {
  if (processing) return;
  processing = true;
  try {
    while (true) {
      const next = items.find(it => !it.blob && !it.error && !it.inFlight);
      if (!next) break;
      next.inFlight = true;
      try {
        await processItem(next);
      } catch (err) {
        console.error(err);
        showError(next, err?.message || 'Processing failed');
      } finally {
        next.inFlight = false;
      }
      // Yield to the event loop so the UI can update.
      await new Promise(r => setTimeout(r, 0));
    }
  } finally {
    processing = false;
    updateResultsVisibility();
  }
}

function reprocessAll() {
  for (const item of items) {
    revokeItem(item);
    item.error = false;
    const dl = item.card.querySelector('[data-download]');
    dl.hidden = true;
    showStatus(item, 'Processing…');
  }
  updateResultsVisibility();
  processQueue();
}

function showStatus(item, text) {
  const overlay = item.card.querySelector('[data-status]');
  overlay.classList.remove('error');
  overlay.removeAttribute('data-hidden');
  overlay.querySelector('.spinner').hidden = false;
  overlay.querySelector('.status-text').textContent = text;
}

function hideStatus(item) {
  const overlay = item.card.querySelector('[data-status]');
  overlay.setAttribute('data-hidden', '');
}

function showError(item, text) {
  item.error = true;
  const overlay = item.card.querySelector('[data-status]');
  overlay.classList.add('error');
  overlay.removeAttribute('data-hidden');
  overlay.querySelector('.spinner').hidden = true;
  overlay.querySelector('.status-text').textContent = text;
}

// ── Main processing pipeline ────────────────────────────────────────────────
async function processItem(item) {
  showStatus(item, 'Processing…');

  const targetW = Math.max(1, Math.floor(Number(widthInput.value) || 0));
  const targetH = Math.max(1, Math.floor(Number(heightInput.value) || 0));
  if (!targetW || !targetH) throw new Error('Invalid size');

  const bitmap = await loadBitmap(item.file);
  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  // Background fill (used in contain mode, and also safeguards transparent PNGs).
  ctx.fillStyle = bgSelect.value === 'black' ? '#000000' : '#ffffff';
  ctx.fillRect(0, 0, targetW, targetH);

  const { sx, sy, sw, sh, dx, dy, dw, dh } = computeFit(
    bitmap.width, bitmap.height, targetW, targetH, fitSelect.value
  );
  ctx.drawImage(bitmap, sx, sy, sw, sh, dx, dy, dw, dh);
  if (bitmap.close) bitmap.close();

  // Snapshot the source (resized) image for the compare view.
  const sourceCanvas = item.card.querySelector('[data-canvas-source]');
  sourceCanvas.width = targetW;
  sourceCanvas.height = targetH;
  sourceCanvas.getContext('2d').drawImage(canvas, 0, 0);

  const imageData = ctx.getImageData(0, 0, targetW, targetH);
  const indices = ditherToPalette(imageData, ditherSelect.value);

  writeIndicesToImageData(indices, imageData);
  ctx.putImageData(imageData, 0, 0);

  const ditheredCanvas = item.card.querySelector('[data-canvas-dithered]');
  ditheredCanvas.width = targetW;
  ditheredCanvas.height = targetH;
  ditheredCanvas.getContext('2d').drawImage(canvas, 0, 0);
  setPreviewMode(item.id, item.mode || 'dithered');

  // Pack 3-bit data.
  const packed = pack3Bit(indices);
  const blob = new Blob([packed], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);

  item.blob = blob;
  item.url = url;

  const dl = item.card.querySelector('[data-download]');
  dl.href = url;
  dl.download = item.file.name + '.data';
  dl.hidden = false;

  item.card.querySelector('[data-meta]').textContent =
    `${targetW}×${targetH} • ${formatBytes(blob.size)} .data`;

  hideStatus(item);
}

function loadBitmap(file) {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file).catch(() => loadViaImage(file));
  }
  return loadViaImage(file);
}

function loadViaImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(new Error('Could not decode image')); };
    img.src = url;
  });
}

function computeFit(srcW, srcH, dstW, dstH, fit) {
  if (fit === 'stretch') {
    return { sx: 0, sy: 0, sw: srcW, sh: srcH, dx: 0, dy: 0, dw: dstW, dh: dstH };
  }
  const srcRatio = srcW / srcH;
  const dstRatio = dstW / dstH;
  if (fit === 'cover') {
    // Crop the source so its aspect matches the destination.
    let sw = srcW, sh = srcH;
    if (srcRatio > dstRatio) {
      sw = srcH * dstRatio;
    } else {
      sh = srcW / dstRatio;
    }
    const sx = (srcW - sw) / 2;
    const sy = (srcH - sh) / 2;
    return { sx, sy, sw, sh, dx: 0, dy: 0, dw: dstW, dh: dstH };
  }
  // contain — letterbox
  let dw = dstW, dh = dstH;
  if (srcRatio > dstRatio) {
    dh = dstW / srcRatio;
  } else {
    dw = dstH * srcRatio;
  }
  const dx = (dstW - dw) / 2;
  const dy = (dstH - dh) / 2;
  return { sx: 0, sy: 0, sw: srcW, sh: srcH, dx, dy, dw, dh };
}

// ── Dithering ────────────────────────────────────────────────────────────────
// Returns a Uint8Array of palette indices (one per pixel, length = w*h).
function ditherToPalette(imageData, algorithm) {
  const { data, width: w, height: h } = imageData;
  const pixels = w * h;
  const indices = new Uint8Array(pixels);

  if (algorithm === 'none') {
    for (let p = 0; p < pixels; p++) {
      const i = p * 4;
      indices[p] = nearestPaletteIndex(data[i], data[i+1], data[i+2]);
    }
    return indices;
  }

  // Working buffer (Float32) so errors can be diffused cleanly.
  const buf = new Float32Array(pixels * 3);
  for (let p = 0; p < pixels; p++) {
    const i = p * 4;
    buf[p*3  ] = data[i];
    buf[p*3+1] = data[i+1];
    buf[p*3+2] = data[i+2];
  }

  if (algorithm === 'floyd') {
    // Floyd–Steinberg: 7/16 right, 3/16 bottom-left, 5/16 bottom, 1/16 bottom-right.
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = y * w + x;
        const r = buf[p*3], g = buf[p*3+1], b = buf[p*3+2];
        const idx = nearestPaletteIndex(r, g, b);
        indices[p] = idx;
        const [pr, pg, pb] = PALETTE[idx];
        const er = r - pr, eg = g - pg, eb = b - pb;
        diffuse(buf, w, h, x + 1, y,     er, eg, eb, 7/16);
        diffuse(buf, w, h, x - 1, y + 1, er, eg, eb, 3/16);
        diffuse(buf, w, h, x,     y + 1, er, eg, eb, 5/16);
        diffuse(buf, w, h, x + 1, y + 1, er, eg, eb, 1/16);
      }
    }
  } else if (algorithm === 'atkinson') {
    // Atkinson (1/8 each to 6 neighbours, 6/8 of error preserved = softer).
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = y * w + x;
        const r = buf[p*3], g = buf[p*3+1], b = buf[p*3+2];
        const idx = nearestPaletteIndex(r, g, b);
        indices[p] = idx;
        const [pr, pg, pb] = PALETTE[idx];
        const er = r - pr, eg = g - pg, eb = b - pb;
        const k = 1/8;
        diffuse(buf, w, h, x + 1, y,     er, eg, eb, k);
        diffuse(buf, w, h, x + 2, y,     er, eg, eb, k);
        diffuse(buf, w, h, x - 1, y + 1, er, eg, eb, k);
        diffuse(buf, w, h, x,     y + 1, er, eg, eb, k);
        diffuse(buf, w, h, x + 1, y + 1, er, eg, eb, k);
        diffuse(buf, w, h, x,     y + 2, er, eg, eb, k);
      }
    }
  }

  return indices;
}

function diffuse(buf, w, h, x, y, er, eg, eb, weight) {
  if (x < 0 || x >= w || y < 0 || y >= h) return;
  const p = (y * w + x) * 3;
  buf[p    ] += er * weight;
  buf[p + 1] += eg * weight;
  buf[p + 2] += eb * weight;
}

function nearestPaletteIndex(r, g, b) {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < PALETTE.length; i++) {
    const [pr, pg, pb] = PALETTE[i];
    const dr = r - pr, dg = g - pg, db = b - pb;
    const d = dr*dr + dg*dg + db*db;
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return best;
}

function writeIndicesToImageData(indices, imageData) {
  const { data } = imageData;
  for (let p = 0; p < indices.length; p++) {
    const [r, g, b] = PALETTE[indices[p]];
    const i = p * 4;
    data[i    ] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  }
}

// ── 3-bit packing ────────────────────────────────────────────────────────────
// Concatenates palette indices (3 bits each, MSB-first) into a continuous bit
// stream, then splits into bytes (MSB-first). Any trailing partial byte is
// zero-padded on the right.
function pack3Bit(indices) {
  const totalBits  = indices.length * 3;
  const totalBytes = Math.ceil(totalBits / 8);
  const out = new Uint8Array(totalBytes);
  let buf = 0;        // up to 10 bits live
  let bits = 0;
  let bi = 0;
  for (let i = 0; i < indices.length; i++) {
    buf = (buf << 3) | (indices[i] & 0b111);
    bits += 3;
    if (bits >= 8) {
      bits -= 8;
      out[bi++] = (buf >> bits) & 0xff;
      buf &= (1 << bits) - 1;
    }
  }
  if (bits > 0) {
    out[bi++] = (buf << (8 - bits)) & 0xff;
  }
  return out;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function triggerDownload(item) {
  const a = document.createElement('a');
  a.href = item.url;
  a.download = item.file.name + '.data';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
