// 6-colour palettes — index order matches device spec:
// 0=Black, 1=White, 2=Red, 3=Green, 4=Blue, 5=Yellow.
//
// "Saturated" uses the pure RGB corners (what the spec labels each index).
// "Measured" uses real Spectra-6 panel values (sampled from hardware), which
// models what the screen will actually render and gives visibly better dither
// targeting for mid-tones, skin, skies etc. Index mapping is preserved so the
// packed .data output is identical regardless of which palette was used.
const PALETTE_SATURATED = [
  [0, 0, 0],
  [255, 255, 255],
  [255, 0, 0],
  [0, 255, 0],
  [0, 0, 255],
  [255, 255, 0],
];
const PALETTE_MEASURED = [
  [46, 44, 66],   // black   #2e2c42
  [211, 214, 205],   // white   #d3d6cd
  [177, 29, 25],   // red     #b11d19
  [92, 138, 91],   // green   #5c8a5b
  [49, 106, 193],   // blue    #316ac1
  [217, 199, 1],   // yellow  #d9c701
];
function paletteByName(name) {
  return name === 'measured' ? PALETTE_MEASURED : PALETTE_SATURATED;
}

// Spectra 6 wire format is 4 bits per pixel, two pixels per byte (high
// nibble = left). Our internal palette indices are
// [0=Black, 1=White, 2=Red, 3=Green, 4=Blue, 5=Yellow]; the device wants a
// different code per colour. Two encodings observed in the wild:
//
//   ACEP-compatible (mattcarter11/eink-dithering-tester, confirmed against
//     real hardware): black=0x0, white=0x1, yellow=0x2, red=0x3, blue=0x5,
//     green=0x6 — index 0x4 is skipped.
//   Contiguous (some Spectra 6 reference docs): the same colour order but
//     packed into 0x0..0x5 with no gaps.
//
// If the panel renders wrong colours with the default, switch encodings in
// the UI; the test-pattern download makes it trivial to identify which
// nibble code shows which colour.
const NIBBLE_MAPS = {
  // index → device nibble code (in our [black, white, red, green, blue, yellow] order)
  el073tf1: [0xF, 0x0, 0x6, 0x2, 0xD, 0xB], // hardware-verified on EL073TF1
  acep: [0x0, 0x1, 0x3, 0x6, 0x5, 0x2],
  contiguous: [0x0, 0x1, 0x3, 0x5, 0x4, 0x2],
};

function indexToNibbleLut(name) {
  return NIBBLE_MAPS[name] || NIBBLE_MAPS.el073tf1;
}

// Build the inverse LUT (16-entry array). Unmapped nibbles fall back to 0
// so a stray byte won't crash decoding.
function nibbleToIndexLut(name) {
  const fwd = indexToNibbleLut(name);
  const inv = new Uint8Array(16); // defaults to 0 (black)
  for (let i = 0; i < fwd.length; i++) inv[fwd[i]] = i;
  return inv;
}

// DOM
const presetSelect = document.getElementById('presetSelect');
const widthInput = document.getElementById('widthInput');
const heightInput = document.getElementById('heightInput');
const fitSelect = document.getElementById('fitSelect');
const bgSelect = document.getElementById('bgSelect');
const ditherSelect = document.getElementById('ditherSelect');
const spaceSelect = document.getElementById('spaceSelect');
const paletteSelect = document.getElementById('paletteSelect');
const strengthInput = document.getElementById('strengthInput');
const strengthValue = document.getElementById('strengthValue');
const nibbleSelect = document.getElementById('nibbleSelect');
const testPatternBtn = document.getElementById('testPatternBtn');
const brightnessInput = document.getElementById('brightnessInput');
const contrastInput = document.getElementById('contrastInput');
const saturationInput = document.getElementById('saturationInput');
const brightnessValue = document.getElementById('brightnessValue');
const contrastValue = document.getElementById('contrastValue');
const saturationValue = document.getElementById('saturationValue');
const adjustResetBtn = document.getElementById('adjustResetBtn');
const uploadZone = document.getElementById('uploadZone');
const fileInput = document.getElementById('fileInput');
const results = document.getElementById('results');
const resultCount = document.getElementById('resultCount');
const fileList = document.getElementById('fileList');
const clearBtn = document.getElementById('clearBtn');
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

[widthInput, heightInput, fitSelect, bgSelect, ditherSelect, spaceSelect, paletteSelect, nibbleSelect]
  .forEach(el => el.addEventListener('change', reprocessAll));

strengthInput.addEventListener('input', () => { strengthValue.textContent = strengthInput.value; });
strengthInput.addEventListener('change', reprocessAll);

// Adjustment sliders: update readout live, reprocess on release.
[
  [brightnessInput, brightnessValue],
  [contrastInput, contrastValue],
  [saturationInput, saturationValue],
].forEach(([input, valueEl]) => {
  input.addEventListener('input', () => { valueEl.textContent = input.value; });
  input.addEventListener('change', reprocessAll);
});

adjustResetBtn.addEventListener('click', () => {
  let changed = false;
  for (const [input, valueEl] of [
    [brightnessInput, brightnessValue],
    [contrastInput, contrastValue],
    [saturationInput, saturationValue],
  ]) {
    if (input.value !== '0') { input.value = '0'; valueEl.textContent = '0'; changed = true; }
  }
  if (changed) reprocessAll();
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
  for (const file of fileList) {
    const isData = isDataFile(file);
    if (!isData && !file.type.startsWith('image/')) continue;
    const item = createItem(file, isData);
    items.push(item);
  }
  updateResultsVisibility();
  processQueue();
}

function isDataFile(file) {
  return /\.data$/i.test(file.name);
}

function createItem(file, isData) {
  const fragment = resultTemplate.content.cloneNode(true);
  const card = fragment.querySelector('.file-card');
  card.querySelector('[data-name]').textContent = file.name;
  const tag = isData ? '.data' : 'source';
  card.querySelector('[data-meta]').textContent = `${formatBytes(file.size)} ${tag}`;
  if (isData) card.classList.add('is-data');
  const id = nextId++;
  card.querySelector('[data-remove]').addEventListener('click', () => removeItem(id));
  card.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => setPreviewMode(id, btn.dataset.mode));
  });
  document.getElementById('fileList').appendChild(card);
  return { id, file, card, blob: null, url: null, mode: 'dithered', isData: !!isData, processed: false };
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
      const next = items.find(it => !it.processed && !it.error && !it.inFlight);
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
    item.processed = false;
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

  if (item.isData) {
    await processDataItem(item, targetW, targetH);
    return;
  }

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

  const imageData = ctx.getImageData(0, 0, targetW, targetH);
  applyAdjustments(imageData);

  // Snapshot the adjusted source for the compare view (this is what feeds the dither).
  ctx.putImageData(imageData, 0, 0);
  const sourceCanvas = item.card.querySelector('[data-canvas-source]');
  sourceCanvas.width = targetW;
  sourceCanvas.height = targetH;
  sourceCanvas.getContext('2d').drawImage(canvas, 0, 0);

  const renderPalette = paletteByName(paletteSelect.value);
  const indices = ditherToPalette(imageData, {
    algorithm: ditherSelect.value,
    space: spaceSelect.value,
    palette: renderPalette,
    strength: Math.max(0, Math.min(1, Number(strengthInput.value) / 100)),
  });

  writeIndicesToImageData(indices, imageData, renderPalette);
  ctx.putImageData(imageData, 0, 0);

  const ditheredCanvas = item.card.querySelector('[data-canvas-dithered]');
  ditheredCanvas.width = targetW;
  ditheredCanvas.height = targetH;
  ditheredCanvas.getContext('2d').drawImage(canvas, 0, 0);
  setPreviewMode(item.id, item.mode || 'dithered');

  // Pack 4bpp Spectra 6 nibble data using the selected encoding.
  const packed = packNibbles(indices, indexToNibbleLut(nibbleSelect.value));
  const blob = new Blob([packed], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);

  item.blob = blob;
  item.url = url;
  item.processed = true;

  const dl = item.card.querySelector('[data-download]');
  dl.href = url;
  dl.download = item.file.name + '.data';
  dl.hidden = false;

  item.card.querySelector('[data-meta]').textContent =
    `${targetW}×${targetH} • ${formatBytes(blob.size)} .data`;

  hideStatus(item);
}

// Preview an already-packed .data file. Uses the current W/H — the file size
// must match the expected byte count for those dimensions or we surface an
// error so the user can pick the right preset.
async function processDataItem(item, targetW, targetH) {
  const totalPixels = targetW * targetH;
  const expectedBytes = Math.ceil(totalPixels / 2);
  const bytes = new Uint8Array(await item.file.arrayBuffer());
  if (bytes.length !== expectedBytes) {
    throw new Error(
      `Expected ${expectedBytes} bytes for ${targetW}×${targetH} (4bpp), got ${bytes.length}`
    );
  }

  const indices = unpackNibbles(bytes, totalPixels, nibbleToIndexLut(nibbleSelect.value));

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const imageData = ctx.createImageData(targetW, targetH);
  writeIndicesToImageData(indices, imageData, paletteByName(paletteSelect.value));
  ctx.putImageData(imageData, 0, 0);

  // Both preview canvases show the decoded image — there's no "before dither"
  // for a packed file, but keeping both in sync makes the toggle a no-op
  // instead of showing a blank canvas.
  const ditheredCanvas = item.card.querySelector('[data-canvas-dithered]');
  const sourceCanvas = item.card.querySelector('[data-canvas-source]');
  for (const c of [ditheredCanvas, sourceCanvas]) {
    c.width = targetW;
    c.height = targetH;
    c.getContext('2d').drawImage(canvas, 0, 0);
  }
  setPreviewMode(item.id, item.mode || 'dithered');

  item.card.querySelector('[data-meta]').textContent =
    `${targetW}×${targetH} • ${formatBytes(bytes.length)} .data (preview)`;

  // No export — the file is already in device format. Keep the download button
  // hidden for data-source items so we don't double-wrap it.
  item.blob = null;
  item.url = null;
  item.processed = true;
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

// ── Pre-dither image adjustments ────────────────────────────────────────────
// Slider values are -100..100 and map to intuitive "percent change" ranges:
//   brightness: -100 subtracts 128, +100 adds 128
//   contrast:   -100 flattens to mid-grey, +100 doubles contrast
//   saturation: -100 greyscale,           +100 doubles saturation
function applyAdjustments(imageData) {
  const b = Number(brightnessInput.value) || 0;   // -100..100
  const c = Number(contrastInput.value) || 0;   // -100..100
  const s = Number(saturationInput.value) || 0;   // -100..100
  if (b === 0 && c === 0 && s === 0) return;

  const brightnessAdd = b * 1.28;                  // 0..±128
  const contrastFactor = 1 + c / 100;              // 0..2
  const saturationFactor = 1 + s / 100;            // 0..2
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i], g = data[i + 1], bl = data[i + 2];

    // Brightness — simple additive.
    r += brightnessAdd;
    g += brightnessAdd;
    bl += brightnessAdd;

    // Contrast — scale around 128.
    if (contrastFactor !== 1) {
      r = (r - 128) * contrastFactor + 128;
      g = (g - 128) * contrastFactor + 128;
      bl = (bl - 128) * contrastFactor + 128;
    }

    // Saturation — push channels away from (or toward) rec-709 luma.
    if (saturationFactor !== 1) {
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * bl;
      r = luma + (r - luma) * saturationFactor;
      g = luma + (g - luma) * saturationFactor;
      bl = luma + (bl - luma) * saturationFactor;
    }

    data[i] = clamp255(r);
    data[i + 1] = clamp255(g);
    data[i + 2] = clamp255(bl);
  }
}

function clamp255(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0;
}

// ── Colour space helpers ─────────────────────────────────────────────────────
// sRGB byte → linear RGB in 0..1. Precomputed LUT for the common int path.
const SRGB_TO_LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const v = i / 255;
  SRGB_TO_LIN[i] = v > 0.04045 ? Math.pow((v + 0.055) / 1.055, 2.4) : v / 12.92;
}
function srgbByteToLin(v) {
  if (v >= 0 && v <= 255 && (v | 0) === v) return SRGB_TO_LIN[v];
  const c = Math.max(0, Math.min(255, v)) / 255;
  return c > 0.04045 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92;
}

// Linear RGB 0..1 → OKLAB. Matrix constants from Björn Ottosson's reference.
function lrgbToOklab(r, g, b, out) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  out[0] = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
  out[1] = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  out[2] = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
}

// ── Dithering ────────────────────────────────────────────────────────────────
// Returns a Uint8Array of palette indices (one per pixel, length = w*h).
// Options:
//   algorithm: 'floyd' | 'atkinson' | 'none'
//   space:     'srgb' | 'oklab'   (nearest-match + error-diffusion space)
//   palette:   PALETTE_SATURATED | PALETTE_MEASURED
//   strength:  0..1 — Floyd/Atkinson error scaling (reduces worm artifacts)
function ditherToPalette(imageData, opts) {
  const { data, width: w, height: h } = imageData;
  const { algorithm, space, palette, strength } = opts;
  const pixels = w * h;
  const indices = new Uint8Array(pixels);
  const useOklab = space === 'oklab';

  // Precompute palette in the chosen working space.
  //   srgb:  keep 0..255 ints for distance & error
  //   oklab: store linear RGB (for error subtraction) + OKLAB (for distance)
  const palLin = palette.map(([r, g, b]) => [srgbByteToLin(r), srgbByteToLin(g), srgbByteToLin(b)]);
  const palOk = useOklab
    ? palLin.map(([r, g, b]) => { const o = new Float32Array(3); lrgbToOklab(r, g, b, o); return o; })
    : null;

  // Working buffer: floats in whichever space we diffuse error in.
  const buf = new Float32Array(pixels * 3);
  if (useOklab) {
    for (let p = 0; p < pixels; p++) {
      const i = p * 4;
      buf[p * 3] = srgbByteToLin(data[i]);
      buf[p * 3 + 1] = srgbByteToLin(data[i + 1]);
      buf[p * 3 + 2] = srgbByteToLin(data[i + 2]);
    }
  } else {
    for (let p = 0; p < pixels; p++) {
      const i = p * 4;
      buf[p * 3] = data[i];
      buf[p * 3 + 1] = data[i + 1];
      buf[p * 3 + 2] = data[i + 2];
    }
  }

  const weightSets = {
    floyd: [
      { dx: 1, dy: 0, w: 7 / 16 },
      { dx: -1, dy: 1, w: 3 / 16 },
      { dx: 0, dy: 1, w: 5 / 16 },
      { dx: 1, dy: 1, w: 1 / 16 },
    ],
    atkinson: [
      { dx: 1, dy: 0, w: 1 / 8 },
      { dx: 2, dy: 0, w: 1 / 8 },
      { dx: -1, dy: 1, w: 1 / 8 },
      { dx: 0, dy: 1, w: 1 / 8 },
      { dx: 1, dy: 1, w: 1 / 8 },
      { dx: 0, dy: 2, w: 1 / 8 },
    ],
  };
  const weights = weightSets[algorithm] || null;
  const effStrength = weights ? strength : 0;

  const okPix = useOklab ? new Float32Array(3) : null;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      const r = buf[p * 3], g = buf[p * 3 + 1], b = buf[p * 3 + 2];

      let idx;
      if (useOklab) {
        // Clamp to the lRGB unit cube before projecting into OKLAB — error
        // diffusion can otherwise push values outside the displayable range
        // and distort the distance metric.
        const lr = r < 0 ? 0 : r > 1 ? 1 : r;
        const lg = g < 0 ? 0 : g > 1 ? 1 : g;
        const lb = b < 0 ? 0 : b > 1 ? 1 : b;
        lrgbToOklab(lr, lg, lb, okPix);
        idx = nearestOklab(okPix, palOk);
      } else {
        idx = nearestSrgb(r, g, b, palette);
      }
      indices[p] = idx;

      if (effStrength > 0) {
        const ref = useOklab ? palLin[idx] : palette[idx];
        const er = (r - ref[0]) * effStrength;
        const eg = (g - ref[1]) * effStrength;
        const eb = (b - ref[2]) * effStrength;
        for (const { dx, dy, w: wt } of weights) {
          diffuse(buf, w, h, x + dx, y + dy, er, eg, eb, wt);
        }
      }
    }
  }

  return indices;
}

function diffuse(buf, w, h, x, y, er, eg, eb, weight) {
  if (x < 0 || x >= w || y < 0 || y >= h) return;
  const p = (y * w + x) * 3;
  buf[p] += er * weight;
  buf[p + 1] += eg * weight;
  buf[p + 2] += eb * weight;
}

function nearestSrgb(r, g, b, palette) {
  let best = 0, bestDist = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const [pr, pg, pb] = palette[i];
    const dr = r - pr, dg = g - pg, db = b - pb;
    const d = dr * dr + dg * dg + db * db;
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return best;
}

function nearestOklab(pix, palOk) {
  let best = 0, bestDist = Infinity;
  for (let i = 0; i < palOk.length; i++) {
    const pL = palOk[i][0], pA = palOk[i][1], pB = palOk[i][2];
    const dL = pL - pix[0], dA = pA - pix[1], dB = pB - pix[2];
    const d = dL * dL + dA * dA + dB * dB;
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return best;
}

function writeIndicesToImageData(indices, imageData, palette) {
  const pal = palette || PALETTE_SATURATED;
  const { data } = imageData;
  for (let p = 0; p < indices.length; p++) {
    const [r, g, b] = pal[indices[p]];
    const i = p * 4;
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  }
}

// ── 4bpp nibble packing (Spectra 6 wire format) ──────────────────────────────
// Two pixels per byte: high nibble = left pixel, low nibble = right pixel,
// scanning left-to-right, top-to-bottom. Each palette index is mapped through
// `indexToNibble` to the device colour code before packing.
//
// If an odd pixel count is given (it shouldn't be for any real Spectra 6
// resolution) the last nibble is padded with the device code for black.
function packNibbles(indices, indexToNibble) {
  const totalBytes = Math.ceil(indices.length / 2);
  const out = new Uint8Array(totalBytes);
  for (let p = 0, bi = 0; p < indices.length; p += 2, bi++) {
    const hi = indexToNibble[indices[p]] & 0xf;
    const lo = (p + 1 < indices.length) ? indexToNibble[indices[p + 1]] & 0xf : 0x0;
    out[bi] = (hi << 4) | lo;
  }
  return out;
}

// Inverse of packNibbles. Returns palette indices (length = totalPixels).
function unpackNibbles(bytes, totalPixels, nibbleToIndex) {
  const indices = new Uint8Array(totalPixels);
  for (let p = 0, bi = 0; p < totalPixels; p += 2, bi++) {
    const byte = bytes[bi];
    indices[p] = nibbleToIndex[(byte >> 4) & 0xf];
    if (p + 1 < totalPixels) {
      indices[p + 1] = nibbleToIndex[byte & 0xf];
    }
  }
  return indices;
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

// Synthesise six equal horizontal bands (one per palette index) at the
// current target resolution and pack them with the active nibble encoding.
// The user uploads this to the panel, then reads off which colour appears in
// each band — top-to-bottom, the bands are 0=Black, 1=White, 2=Red, 3=Green,
// 4=Blue, 5=Yellow. Anything else means the nibble encoding is wrong.
testPatternBtn.addEventListener('click', () => {
  const w = Math.max(1, Math.floor(Number(widthInput.value) || 0));
  const h = Math.max(1, Math.floor(Number(heightInput.value) || 0));
  if (!w || !h) return;

  const indices = new Uint8Array(w * h);
  const bandHeight = h / 6;
  for (let y = 0; y < h; y++) {
    const band = Math.min(5, Math.floor(y / bandHeight));
    const rowStart = y * w;
    indices.fill(band, rowStart, rowStart + w);
  }

  const packed = packNibbles(indices, indexToNibbleLut(nibbleSelect.value));
  const blob = new Blob([packed], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `spectra6-test-${w}x${h}-${nibbleSelect.value}.data`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
