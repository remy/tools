/**
 * script.js — Main orchestrator for Trace v2
 *
 * Workflow:
 *  1. User drops/selects an image → drawn to hidden canvas
 *  2. Canvas base64 JPEG → Gemini Vision (analyzeImage) → optimal params
 *  3. Sliders updated → ImageTracerJS runs → raw SVG
 *  4. User clicks "AI Cleanup" → Gemini text (cleanupSVG) → polished SVG
 *  5. Copy / Download buttons available
 */

import { loadImageToCanvas, traceCanvas, canvasToBase64Jpeg } from './tracer.js';
import {
  analyzeImage, cleanupSVG,
  getStoredKey, setStoredKey,
  getStoredModel, setStoredModel,
} from './ai.js';

// ─── Element refs ────────────────────────────────────────────────────────────
const dropzone        = document.getElementById('dropzone');
const dropzoneContent = document.getElementById('dropzoneContent');
const fileInput       = document.getElementById('fileInput');
const sourceCanvas    = document.getElementById('sourceCanvas');
const imageMeta       = document.getElementById('imageMeta');

const settingsBtn    = document.getElementById('settingsBtn');
const settingsDialog = document.getElementById('settingsDialog');
const apiKeyInput    = document.getElementById('apiKeyInput');
const modelSelect    = document.getElementById('modelSelect');

const aiPanel      = document.getElementById('aiPanel');
const aiBadge      = document.getElementById('aiBadge');
const aiStatus     = document.getElementById('aiStatus');
const aiReasoning  = document.getElementById('aiReasoning');

const retraceBtn   = document.getElementById('retraceBtn');
const aiCleanupBtn = document.getElementById('aiCleanupBtn');
const copyBtn      = document.getElementById('copyBtn');
const downloadBtn  = document.getElementById('downloadBtn');

const onionToggle  = document.getElementById('onionToggle');
const onionOpacity = document.getElementById('onionOpacity');
const onionImage   = document.getElementById('onionImage');

const previewStage       = document.getElementById('previewStage');
const processingOverlay  = document.getElementById('processingOverlay');
const processingMsg      = document.getElementById('processingMsg');
const svgSizeEl          = document.getElementById('svgSize');
const toastRoot          = document.getElementById('toastRoot');

// Slider elements
const sliders = {
  colorCount:      { el: document.getElementById('colorCount'),      val: document.getElementById('colorCountValue'),     fmt: v => v },
  blurRadius:      { el: document.getElementById('blurRadius'),      val: document.getElementById('blurRadiusValue'),     fmt: v => v },
  pathOmit:        { el: document.getElementById('pathOmit'),        val: document.getElementById('pathOmitValue'),       fmt: v => v },
  curveTolerance:  { el: document.getElementById('curveTolerance'),  val: document.getElementById('curveToleranceValue'), fmt: v => parseFloat(v).toFixed(1) },
  strokeWidth:     { el: document.getElementById('strokeWidth'),     val: document.getElementById('strokeWidthValue'),    fmt: v => v },
};

// Pipeline step elements
const pipelineSteps = {
  upload:   document.getElementById('step-upload'),
  'ai-pre': document.getElementById('step-ai-pre'),
  trace:    document.getElementById('step-trace'),
  'ai-post':document.getElementById('step-ai-post'),
  done:     document.getElementById('step-done'),
};

// ─── State ───────────────────────────────────────────────────────────────────
let currentSvg = '';
let hasImage   = false;

// ─── Slider wiring ───────────────────────────────────────────────────────────
for (const [, s] of Object.entries(sliders)) {
  s.el.addEventListener('input', () => {
    s.val.textContent = s.fmt(s.el.value);
  });
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
  if (settings.colors        != null) { sliders.colorCount.el.value = settings.colors;         sliders.colorCount.val.textContent     = settings.colors; }
  if (settings.blurRadius    != null) { sliders.blurRadius.el.value = settings.blurRadius;     sliders.blurRadius.val.textContent     = settings.blurRadius; }
  if (settings.pathOmit      != null) { sliders.pathOmit.el.value   = settings.pathOmit;       sliders.pathOmit.val.textContent       = settings.pathOmit; }
  if (settings.curveTolerance!= null) { sliders.curveTolerance.el.value = settings.curveTolerance; sliders.curveTolerance.val.textContent = parseFloat(settings.curveTolerance).toFixed(1); }
}

// ─── Onion / overlay ─────────────────────────────────────────────────────────
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
  const key = apiKeyInput.value.trim();
  setStoredKey(key || null);
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

    // Show canvas, hide dropzone text
    sourceCanvas.classList.remove('is-hidden');
    dropzoneContent.classList.add('is-hidden');
    dropzone.classList.add('has-image');
    hasImage = true;

    imageMeta.textContent = `${width} × ${height} px — ${formatBytes(file.size)}`;

    // Set onion source
    onionImage.src = sourceCanvas.toDataURL('image/jpeg', 0.8);
    onionImage.style.display = 'block';

    setStep('upload', 'done');
    retraceBtn.disabled = false;

    // Run the full pipeline
    await runPipeline();
  } catch (err) {
    setStep('upload', 'error');
    toast(`Failed to load image: ${err.message}`, 'error');
  }
}

// ─── Main pipeline ────────────────────────────────────────────────────────────
async function runPipeline() {
  if (!hasImage) return;

  // Phase 1: AI pre-flight (if key available)
  const apiKey = getStoredKey();
  if (apiKey) {
    await runAIPreflight();
  }

  // Phase 2: Trace
  await runTrace();
}

async function runAIPreflight() {
  setStep('ai-pre', 'active');
  setAIBadge('loading', 'Analyzing…');
  setAIStatus('<p class="ai-hint">Sending image to Gemini for parameter analysis…</p>');

  try {
    const base64 = canvasToBase64Jpeg(sourceCanvas, 0.65, 512);
    const result = await analyzeImage(base64);

    applySliders(result.recommendedSettings);

    setAIStatus(`
      <div class="ai-status-row"><strong>Image type</strong><span>${escHtml(result.imageType.replace('_', ' '))}</span></div>
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
    // Don't abort — fall through to trace with current (or default) settings
  }
}

async function runTrace() {
  setStep('trace', 'active');
  showProcessing('Tracing image…');

  try {
    // Small yield so the UI can update before the (synchronous) tracing
    await microtask();

    const svg = traceCanvas(sourceCanvas, getOpts());
    currentSvg = svg;

    renderSVG(svg);
    setStep('trace', 'done');

    aiCleanupBtn.disabled = !getStoredKey();
    copyBtn.disabled = false;
    downloadBtn.disabled = false;

    // If no AI key, mark pipeline done here
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
aiCleanupBtn.addEventListener('click', async () => {
  if (!currentSvg) return;

  setStep('ai-post', 'active');
  showProcessing('Sending SVG to Gemini for cleanup…\nThis may take a moment.');
  aiCleanupBtn.disabled = true;

  try {
    const cleaned = await cleanupSVG(currentSvg);
    currentSvg = cleaned;
    renderSVG(cleaned);

    setStep('ai-post', 'done');
    setStep('done', 'done');
    toast('SVG cleaned and semantically grouped by Gemini.', 'success');
  } catch (err) {
    setStep('ai-post', 'error');
    toast(`AI cleanup failed: ${err.message}`, 'error');
    aiCleanupBtn.disabled = false;
  } finally {
    hideProcessing();
  }
});

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

  // Make the SVG fill the preview viewport
  const svgEl = previewStage.querySelector('svg');
  if (svgEl) {
    svgEl.style.cssText = 'width:100%;height:100%;object-fit:contain;';
  }

  const bytes = new TextEncoder().encode(svg).length;
  svgSizeEl.textContent = formatBytes(bytes);
}

// ─── Pipeline steps ────────────────────────────────────────────────────────────
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

// ─── Processing overlay ────────────────────────────────────────────────────────
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

// ─── Tiny helpers ─────────────────────────────────────────────────────────────
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
  // Restore settings indicators
  const key = getStoredKey();
  if (key) {
    setAIStatus(`<p class="ai-hint">Gemini key configured. Upload an image to start AI analysis.</p>`);
    setAIBadge('idle', '');
  }

  // Sync slider display values to initial HTML defaults
  for (const [, s] of Object.entries(sliders)) {
    s.val.textContent = s.fmt(s.el.value);
  }

  // Update AI cleanup button state based on key presence
  if (!key) {
    aiCleanupBtn.title = 'Add a Gemini API key in Settings to enable AI cleanup';
  }
})();
