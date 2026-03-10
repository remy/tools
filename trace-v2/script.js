/**
 * script.js — Main orchestrator for Trace v2
 *
 * Workflow:
 *  1. User drops/selects an image → drawn to hidden canvas
 *  2. Canvas base64 JPEG → Gemini Vision (analyzeImage) → optimal params
 *  3. Sliders updated → ImageTracerJS runs → raw SVG
 *  4. User clicks "AI Cleanup":
 *     a. Client-side: group paths by fill, round coordinates (no token limit)
 *     b. Gemini: only label each color group (tiny JSON in/out)
 *  5. Copy / Download buttons available
 */

import { loadImageToCanvas, traceCanvas, canvasToBase64Jpeg } from './tracer.js';
import {
  analyzeImage, getColorGroupLabels,
  getStoredKey, setStoredKey,
  getStoredModel, setStoredModel,
} from './ai.js';

// ─── Element refs ─────────────────────────────────────────────────────────────
const dropzone        = document.getElementById('dropzone');
const dropzoneContent = document.getElementById('dropzoneContent');
const fileInput       = document.getElementById('fileInput');
const sourceCanvas    = document.getElementById('sourceCanvas');
const imageMeta       = document.getElementById('imageMeta');

const settingsBtn    = document.getElementById('settingsBtn');
const settingsDialog = document.getElementById('settingsDialog');
const apiKeyInput    = document.getElementById('apiKeyInput');
const modelSelect    = document.getElementById('modelSelect');

const aiBadge     = document.getElementById('aiBadge');
const aiStatus    = document.getElementById('aiStatus');
const aiReasoning = document.getElementById('aiReasoning');

const retraceBtn   = document.getElementById('retraceBtn');
const aiCleanupBtn = document.getElementById('aiCleanupBtn');
const copyBtn      = document.getElementById('copyBtn');
const downloadBtn  = document.getElementById('downloadBtn');

const onionToggle   = document.getElementById('onionToggle');
const onionOpacity  = document.getElementById('onionOpacity');
const onionImage    = document.getElementById('onionImage');
const fitBtn        = document.getElementById('fitBtn');

const previewStage      = document.getElementById('previewStage');
const previewViewport   = document.getElementById('previewViewport');
const processingOverlay = document.getElementById('processingOverlay');
const processingMsg     = document.getElementById('processingMsg');
const svgSizeEl         = document.getElementById('svgSize');
const toastRoot         = document.getElementById('toastRoot');
const zoomLabel         = document.getElementById('zoomLabel');

// Slider elements
const sliders = {
  colorCount:     { el: document.getElementById('colorCount'),     val: document.getElementById('colorCountValue'),     fmt: v => v },
  blurRadius:     { el: document.getElementById('blurRadius'),     val: document.getElementById('blurRadiusValue'),     fmt: v => v },
  pathOmit:       { el: document.getElementById('pathOmit'),       val: document.getElementById('pathOmitValue'),       fmt: v => v },
  curveTolerance: { el: document.getElementById('curveTolerance'), val: document.getElementById('curveToleranceValue'), fmt: v => parseFloat(v).toFixed(1) },
  strokeWidth:    { el: document.getElementById('strokeWidth'),    val: document.getElementById('strokeWidthValue'),    fmt: v => v },
};

// Pipeline step elements
const pipelineSteps = {
  upload:    document.getElementById('step-upload'),
  'ai-pre':  document.getElementById('step-ai-pre'),
  trace:     document.getElementById('step-trace'),
  'ai-post': document.getElementById('step-ai-post'),
  done:      document.getElementById('step-done'),
};

// ─── State ────────────────────────────────────────────────────────────────────
let currentSvg   = '';
let hasImage     = false;
let lastImageType = 'unknown';

// ─── Slider wiring ────────────────────────────────────────────────────────────
for (const [, s] of Object.entries(sliders)) {
  s.el.addEventListener('input', () => { s.val.textContent = s.fmt(s.el.value); });
}

function getOpts() {
  return {
    colors:         parseInt(sliders.colorCount.el.value, 10),
    blurRadius:     parseFloat(sliders.blurRadius.el.value),
    pathOmit:       parseInt(sliders.pathOmit.el.value, 10),
    curveTolerance: parseFloat(sliders.curveTolerance.el.value),
    strokeWidth:    parseFloat(sliders.strokeWidth.el.value),
  };
}

function applySliders(settings) {
  if (settings.colors         != null) { sliders.colorCount.el.value     = settings.colors;         sliders.colorCount.val.textContent     = settings.colors; }
  if (settings.blurRadius     != null) { sliders.blurRadius.el.value     = settings.blurRadius;     sliders.blurRadius.val.textContent     = settings.blurRadius; }
  if (settings.pathOmit       != null) { sliders.pathOmit.el.value       = settings.pathOmit;       sliders.pathOmit.val.textContent       = settings.pathOmit; }
  if (settings.curveTolerance != null) { sliders.curveTolerance.el.value = settings.curveTolerance; sliders.curveTolerance.val.textContent = parseFloat(settings.curveTolerance).toFixed(1); }
}

// ─── Pan / Zoom ───────────────────────────────────────────────────────────────
let panX = 0, panY = 0, zoom = 1;
let isPanning = false, panStartX = 0, panStartY = 0, panOriginX = 0, panOriginY = 0;

const MIN_ZOOM = 0.1, MAX_ZOOM = 20;

function applyTransform() {
  const t = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  previewStage.style.transform = t;
  onionImage.style.transform = t;
  if (zoomLabel) zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
}

function fitToViewport() {
  panX = 0;
  panY = 0;
  zoom = 1;
  applyTransform();
}

// Wheel zoom (centered on cursor)
previewViewport.addEventListener('wheel', e => {
  e.preventDefault();
  const rect = previewViewport.getBoundingClientRect();
  const cx = e.clientX - rect.left;
  const cy = e.clientY - rect.top;

  const delta = e.deltaY < 0 ? 1.12 : 1 / 1.12;
  const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * delta));

  // Adjust pan so the cursor stays over the same point
  panX = cx - (cx - panX) * (newZoom / zoom);
  panY = cy - (cy - panY) * (newZoom / zoom);
  zoom = newZoom;

  applyTransform();
}, { passive: false });

// Drag pan (mouse)
previewViewport.addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  isPanning = true;
  panStartX = e.clientX;
  panStartY = e.clientY;
  panOriginX = panX;
  panOriginY = panY;
  previewViewport.style.cursor = 'grabbing';
});

window.addEventListener('mousemove', e => {
  if (!isPanning) return;
  panX = panOriginX + (e.clientX - panStartX);
  panY = panOriginY + (e.clientY - panStartY);
  applyTransform();
});

window.addEventListener('mouseup', () => {
  if (!isPanning) return;
  isPanning = false;
  previewViewport.style.cursor = '';
});

// Touch pan + pinch zoom
let lastTouchDist = null;
let touchPanStartX = 0, touchPanStartY = 0, touchPanOriginX = 0, touchPanOriginY = 0;

previewViewport.addEventListener('touchstart', e => {
  if (e.touches.length === 1) {
    touchPanStartX = e.touches[0].clientX;
    touchPanStartY = e.touches[0].clientY;
    touchPanOriginX = panX;
    touchPanOriginY = panY;
    lastTouchDist = null;
  } else if (e.touches.length === 2) {
    lastTouchDist = Math.hypot(
      e.touches[1].clientX - e.touches[0].clientX,
      e.touches[1].clientY - e.touches[0].clientY,
    );
  }
}, { passive: true });

previewViewport.addEventListener('touchmove', e => {
  e.preventDefault();
  if (e.touches.length === 1 && lastTouchDist === null) {
    panX = touchPanOriginX + (e.touches[0].clientX - touchPanStartX);
    panY = touchPanOriginY + (e.touches[0].clientY - touchPanStartY);
    applyTransform();
  } else if (e.touches.length === 2) {
    const dist = Math.hypot(
      e.touches[1].clientX - e.touches[0].clientX,
      e.touches[1].clientY - e.touches[0].clientY,
    );
    if (lastTouchDist !== null) {
      const delta = dist / lastTouchDist;
      zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * delta));
      applyTransform();
    }
    lastTouchDist = dist;
  }
}, { passive: false });

previewViewport.addEventListener('touchend', () => { lastTouchDist = null; });

if (fitBtn) fitBtn.addEventListener('click', fitToViewport);

// ─── Onion / overlay ──────────────────────────────────────────────────────────
function updateOnion() {
  const on = onionToggle.checked;
  const pct = parseInt(onionOpacity.value, 10);
  onionImage.style.opacity = on ? pct / 100 : 0;
}

onionToggle.addEventListener('change', updateOnion);
onionOpacity.addEventListener('input', updateOnion);
updateOnion();

// ─── Settings dialog ──────────────────────────────────────────────────────────
function loadSettings() {
  const key = getStoredKey();
  if (key) apiKeyInput.value = key;
  modelSelect.value = getStoredModel();
}

settingsBtn.addEventListener('click', () => {
  loadSettings();
  settingsDialog.showModal();
});

settingsDialog.addEventListener('close', () => {
  setStoredKey(apiKeyInput.value.trim() || null);
  setStoredModel(modelSelect.value);
});

// ─── Dropzone / file handling ─────────────────────────────────────────────────
dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') fileInput.click(); });

dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('drag-over'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
dropzone.addEventListener('drop', e => {
  e.preventDefault();
  dropzone.classList.remove('drag-over');
  const file = e.dataTransfer?.files?.[0];
  if (file) handleFile(file);
});

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) handleFile(file);
  fileInput.value = '';
});

async function handleFile(file) {
  if (!file.type.startsWith('image/')) {
    toast('Please upload a PNG, JPG, or WebP image.', 'error');
    return;
  }

  setStep('upload', 'active');

  try {
    const { width, height } = await loadImageToCanvas(file, sourceCanvas);

    sourceCanvas.classList.remove('is-hidden');
    dropzoneContent.classList.add('is-hidden');
    dropzone.classList.add('has-image');
    hasImage = true;

    imageMeta.textContent = `${width} × ${height} px — ${formatBytes(file.size)}`;

    onionImage.src = sourceCanvas.toDataURL('image/jpeg', 0.8);
    onionImage.style.display = 'block';

    setStep('upload', 'done');
    retraceBtn.disabled = false;

    await runPipeline();
  } catch (err) {
    setStep('upload', 'error');
    toast(`Failed to load image: ${err.message}`, 'error');
  }
}

// ─── Main pipeline ────────────────────────────────────────────────────────────
async function runPipeline() {
  if (!hasImage) return;
  if (getStoredKey()) await runAIPreflight();
  await runTrace();
}

async function runAIPreflight() {
  setStep('ai-pre', 'active');
  setAIBadge('loading', 'Analyzing…');
  setAIStatus('<p class="ai-hint">Sending image to Gemini for parameter analysis…</p>');

  try {
    const base64 = canvasToBase64Jpeg(sourceCanvas, 0.65, 512);
    const result = await analyzeImage(base64);

    lastImageType = result.imageType;
    applySliders(result.recommendedSettings);

    setAIStatus(`
      <div class="ai-status-row"><strong>Image type</strong><span>${escHtml(result.imageType.replace(/_/g, ' '))}</span></div>
      <div class="ai-status-row"><strong>Colors</strong><span>${result.recommendedSettings.colors}</span></div>
      <div class="ai-status-row"><strong>Blur</strong><span>${result.recommendedSettings.blurRadius}</span></div>
      <div class="ai-status-row"><strong>Path omit</strong><span>${result.recommendedSettings.pathOmit} px²</span></div>
      <div class="ai-status-row"><strong>Curve tol.</strong><span>${parseFloat(result.recommendedSettings.curveTolerance).toFixed(1)}</span></div>
    `);

    if (result.reasoning) {
      aiReasoning.textContent = result.reasoning;
      aiReasoning.classList.remove('is-hidden');
    }

    setAIBadge('done', 'Done');
    setStep('ai-pre', 'done');
  } catch (err) {
    setAIBadge('error', 'Error');
    setStep('ai-pre', 'error');
    setAIStatus(`<p class="ai-hint" style="color:var(--danger)">${escHtml(err.message)}</p>`);
    toast(`AI pre-flight failed: ${err.message}`, 'error');
  }
}

async function runTrace() {
  setStep('trace', 'active');
  showProcessing('Tracing image…');

  try {
    await microtask();
    const svg = traceCanvas(sourceCanvas, getOpts());
    currentSvg = svg;

    renderSVG(svg);
    setStep('trace', 'done');

    aiCleanupBtn.disabled = !getStoredKey();
    copyBtn.disabled = false;
    downloadBtn.disabled = false;

    if (!getStoredKey()) {
      setStep('ai-post', 'done');
      setStep('done', 'done');
    }
  } catch (err) {
    setStep('trace', 'error');
    toast(`Tracing failed: ${err.message}`, 'error');
  } finally {
    hideProcessing();
  }
}

retraceBtn.addEventListener('click', () => runTrace());

// ─── AI Cleanup ───────────────────────────────────────────────────────────────
// Strategy: do ALL structural work client-side (grouping, rounding, fill dedup).
// Ask Gemini only for semantic labels per unique color — tiny JSON in/out,
// no SVG reproduction → never hits output token limits regardless of SVG size.

aiCleanupBtn.addEventListener('click', async () => {
  if (!currentSvg) return;

  setStep('ai-post', 'active');
  aiCleanupBtn.disabled = true;

  try {
    // Step 1: extract color groups client-side
    showProcessing('Grouping paths by color…');
    await microtask();
    const { colorList, groups } = extractColorGroups(currentSvg);

    // Step 2: ask Gemini only for labels (compact JSON)
    showProcessing(`Asking Gemini to label ${colorList.length} color group${colorList.length !== 1 ? 's' : ''}…`);
    const labels = await getColorGroupLabels(colorList, lastImageType);

    // Step 3: client-side restructure + coordinate rounding
    showProcessing('Restructuring SVG…');
    await microtask();
    const cleaned = buildGroupedSVG(currentSvg, groups, labels);
    currentSvg = cleaned;
    renderSVG(cleaned);

    setStep('ai-post', 'done');
    setStep('done', 'done');
    toast(`SVG grouped into ${colorList.length} semantic layers.`, 'success');
  } catch (err) {
    setStep('ai-post', 'error');
    toast(`AI cleanup failed: ${err.message}`, 'error');
    aiCleanupBtn.disabled = false;
  } finally {
    hideProcessing();
  }
});

// ─── Client-side SVG restructuring ───────────────────────────────────────────

/**
 * Parse the SVG, extract all <path> elements grouped by fill color.
 * Returns { colorList: string[], groups: Map<fill, Element[]> }
 * colorList preserves document order of first appearance (back → front).
 */
function extractColorGroups(svgString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, 'image/svg+xml');
  const svgEl = doc.documentElement;

  const groups = new Map(); // fill → path[]

  for (const path of svgEl.querySelectorAll('path')) {
    const fill = getPathFill(path);
    if (!groups.has(fill)) groups.set(fill, []);
    groups.get(fill).push(path);
  }

  return { colorList: [...groups.keys()], groups };
}

function getPathFill(el) {
  const style = el.getAttribute('style') || '';
  const styleMatch = style.match(/fill\s*:\s*([^;]+)/);
  if (styleMatch) return styleMatch[1].trim();
  return el.getAttribute('fill') || 'none';
}

/**
 * Rebuild the SVG with paths grouped into <g fill="color" id="label"> elements,
 * then round all coordinate decimals to 2 places.
 */
function buildGroupedSVG(svgString, groups, labels) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, 'image/svg+xml');
  const svgEl = doc.documentElement;

  // Remove all existing children (paths, groups, etc.)
  while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);

  for (const [fill, paths] of groups) {
    const g = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('fill', fill);

    const rawLabel = labels?.[fill];
    if (rawLabel) {
      const id = rawLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      if (id) g.setAttribute('id', id);
    }

    for (const path of paths) {
      // Remove fill from individual paths — it's now on the parent <g>
      path.removeAttribute('fill');
      const style = path.getAttribute('style');
      if (style) {
        const cleaned = style.replace(/fill\s*:[^;]+;?\s*/g, '').trim();
        if (cleaned) path.setAttribute('style', cleaned);
        else path.removeAttribute('style');
      }
      g.appendChild(path);
    }

    svgEl.appendChild(g);
  }

  // outerHTML avoids the duplicate-xmlns problem of XMLSerializer in browsers
  return roundSvgCoords(svgEl.outerHTML);
}

/**
 * Round long decimal numbers in SVG path d attributes to 2 decimal places.
 * Only touches the d="..." attribute value to avoid mangling other numbers.
 */
function roundSvgCoords(svgString) {
  return svgString.replace(/\bd="([^"]*)"/g, (_, d) =>
    `d="${d.replace(/-?\d+\.\d{3,}/g, n => parseFloat(n).toFixed(2))}"`,
  );
}

// ─── Copy / Download ──────────────────────────────────────────────────────────
copyBtn.addEventListener('click', async () => {
  if (!currentSvg) return;
  try {
    await navigator.clipboard.writeText(currentSvg);
    toast('SVG copied to clipboard.', 'success');
  } catch {
    toast('Copy failed — try downloading instead.', 'error');
  }
});

downloadBtn.addEventListener('click', () => {
  if (!currentSvg) return;
  const blob = new Blob([currentSvg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'trace-v2.svg';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
});

// ─── Render SVG ───────────────────────────────────────────────────────────────
function renderSVG(svg) {
  previewStage.innerHTML = svg;

  const svgEl = previewStage.querySelector('svg');
  if (svgEl) {
    // Let the SVG fill its container naturally; pan/zoom handles the rest
    svgEl.style.cssText = 'width:100%;height:100%;display:block;';
  }

  const bytes = new TextEncoder().encode(svg).length;
  svgSizeEl.textContent = formatBytes(bytes);
  fitToViewport();
}

// ─── Pipeline steps ───────────────────────────────────────────────────────────
function setStep(id, state) {
  const el = pipelineSteps[id];
  if (!el) return;
  el.classList.remove('is-active', 'is-done', 'is-error');
  if (state === 'active') el.classList.add('is-active');
  if (state === 'done')   el.classList.add('is-done');
  if (state === 'error')  el.classList.add('is-error');
}

// ─── AI badge ─────────────────────────────────────────────────────────────────
function setAIBadge(state, text) {
  aiBadge.textContent = text;
  aiBadge.className = 'ai-badge';
  if (state) aiBadge.classList.add(`badge-${state}`);
}

function setAIStatus(html) {
  aiStatus.innerHTML = html;
}

// ─── Processing overlay ───────────────────────────────────────────────────────
function showProcessing(msg) {
  processingMsg.textContent = msg;
  processingOverlay.classList.remove('is-hidden');
}

function hideProcessing() {
  processingOverlay.classList.add('is-hidden');
}

// ─── Toasts ───────────────────────────────────────────────────────────────────
function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  toastRoot.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function microtask() {
  return new Promise(resolve => setTimeout(resolve, 16));
}

// ─── Init ─────────────────────────────────────────────────────────────────────
(function init() {
  const key = getStoredKey();
  if (key) {
    setAIStatus('<p class="ai-hint">Gemini key configured. Upload an image to start AI analysis.</p>');
    setAIBadge('idle', '');
  }

  for (const [, s] of Object.entries(sliders)) {
    s.val.textContent = s.fmt(s.el.value);
  }

  if (!key) {
    aiCleanupBtn.title = 'Add a Gemini API key in Settings to enable AI cleanup';
  }

  applyTransform();
})();
