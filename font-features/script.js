// Entry point: holds the state, wires the controls, and keeps the preview and
// the CSS output in step with it.

import { analyseFont } from './analyse.js';
import { makeSampler, previewText } from './sample.js';
import { renderSummary, renderAxes, renderFeatures } from './render.js';
import { buildCss } from './css-output.js';
import { setupPicker } from './google-picker.js';
import { findFamilySources, findServedFallback, fetchFont } from './google.js';

const PREVIEW_FAMILY = 'FontFeaturesPreview';
const STORE_KEY = 'font-features.preview';

const dom = {
  empty: document.getElementById('empty'),
  status: document.getElementById('status'),
  error: document.getElementById('error'),
  report: document.getElementById('report'),
  summary: document.getElementById('summary'),
  preview: document.getElementById('preview'),
  size: document.getElementById('preview-size'),
  sizeValue: document.getElementById('preview-size-value'),
  reset: document.getElementById('btn-reset'),
  axesPanel: document.getElementById('axes-panel'),
  axes: document.getElementById('axes'),
  instances: document.getElementById('instances'),
  instancesControl: document.getElementById('instances-control'),
  features: document.getElementById('features'),
  featureCount: document.getElementById('feature-count'),
  noFeatures: document.getElementById('no-features'),
  showShaping: document.getElementById('show-shaping'),
  cssOutput: document.getElementById('css-output'),
  copyCss: document.getElementById('btn-copy-css'),
  footer: document.getElementById('footer'),
  dialog: document.getElementById('google-dialog'),
};

const state = {
  font: null,
  origin: null,
  features: new Map(),
  axes: new Map(),
  size: 52,
  text: null,
  showShaping: false,
};

let loadedFace = null;
let sampler = null;

/* ------------------------------------------------------------ loading --- */

function setStatus(message) {
  dom.status.textContent = message ?? '';
  dom.status.hidden = !message;
}

function setError(message) {
  dom.error.textContent = message ?? '';
  dom.error.hidden = !message;
}

async function showFont(buffer, origin) {
  const font = await analyseFont(buffer, origin);

  if (loadedFace) document.fonts.delete(loadedFace);
  loadedFace = new FontFace(PREVIEW_FAMILY, buffer);
  await loadedFace.load();
  document.fonts.add(loadedFace);

  state.font = font;
  state.origin = origin;
  state.features = new Map();
  state.axes = new Map(font.axes.map((axis) => [axis.tag, axis.default]));
  sampler = makeSampler(font);

  dom.empty.hidden = true;
  dom.report.hidden = false;
  dom.footer.hidden = false;
  setStatus(null);
  setError(null);

  renderSummary(dom.summary, font, origin);
  dom.preview.textContent = state.text ?? previewText(font);

  dom.axesPanel.hidden = font.axes.length === 0;
  if (font.axes.length) {
    drawAxes();
    renderInstances(font);
  }

  drawFeatures();
  apply();
}

function drawAxes() {
  renderAxes(dom.axes, state.font, state, (tag, value) => {
    state.axes.set(tag, value);
    dom.instances.value = '';
    apply();
  });
}

function renderInstances(font) {
  dom.instancesControl.hidden = font.instances.length < 2;
  dom.instances.replaceChildren();
  const blank = document.createElement('option');
  blank.value = '';
  blank.textContent = 'Custom';
  dom.instances.append(blank);
  font.instances.forEach((instance, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = instance.name;
    dom.instances.append(option);
  });
}

function drawFeatures() {
  const shown = renderFeatures(dom.features, state.font, state, sampler, {
    onToggle(feature, on) {
      const isDefault = on === feature.defaultOn;
      if (isDefault) state.features.delete(feature.tag);
      else state.features.set(feature.tag, on ? 1 : 0);
      apply();
    },
    onValue(feature, value) {
      state.features.set(feature.tag, value);
      drawFeatures();
      apply();
    },
    onCopy: copy,
  });
  dom.featureCount.textContent = shown ? `${shown} of ${state.font.features.length}` : '';
  dom.noFeatures.hidden = state.font.features.length > 0;
}

/* ----------------------------------------------------------- applying --- */

function featureSettings() {
  const settings = [...state.features.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([tag, value]) => `"${tag}" ${value}`);
  return settings.join(', ') || 'normal';
}

function variationSettings() {
  if (!state.font.axes.length) return 'normal';
  return state.font.axes
    .map((axis) => `"${axis.tag}" ${state.axes.get(axis.tag) ?? axis.default}`)
    .join(', ');
}

function apply() {
  document.documentElement.style.setProperty('--preview-size', `${state.size}px`);
  document.documentElement.style.setProperty('--preview-family', PREVIEW_FAMILY);
  dom.preview.style.fontFeatureSettings = featureSettings();
  dom.preview.style.fontVariationSettings = variationSettings();
  dom.cssOutput.textContent = buildCss({
    font: state.font,
    origin: state.origin,
    features: state.features,
    axes: state.axes,
  });
  save();
}

async function copy(button, text) {
  try {
    await navigator.clipboard.writeText(text);
    const previous = button.textContent;
    button.textContent = 'Copied';
    setTimeout(() => { button.textContent = previous; }, 1200);
  } catch {
    setError('The browser would not let us write to the clipboard.');
  }
}

/* -------------------------------------------------------------- input --- */

async function handleFile(file) {
  setError(null);
  setStatus(`Reading ${file.name}…`);
  try {
    const buffer = await file.arrayBuffer();
    await showFont(buffer, {
      kind: 'file',
      fileName: file.name,
      description: `${file.name} — read locally`,
    });
  } catch (error) {
    setStatus(null);
    setError(`${file.name}: ${error.message}`);
  }
}

async function loadGoogleFile(family, sources, file) {
  setStatus(`Downloading ${file.filename}…`);
  const buffer = await fetchFont(file.url);
  await showFont(buffer, {
    kind: 'google',
    family,
    fileName: file.filename,
    description: `Google Fonts — ${sources.dir}/${sources.id}/${file.filename}`,
    files: sources.files,
    selected: file.url,
    onSelectFile: (url) => {
      const next = sources.files.find((candidate) => candidate.url === url);
      if (next) loadGoogleFile(family, sources, next).catch(reportGoogleError(family));
    },
  });
}

const reportGoogleError = (family) => (error) => {
  setStatus(null);
  setError(`${family}: ${error.message}`);
};

async function handleGooglePick(family) {
  setError(null);
  setStatus(`Looking up ${family}…`);
  try {
    const sources = await findFamilySources(family);
    if (sources) {
      await loadGoogleFile(family, sources, sources.files[0]);
      return;
    }
    setStatus(`${family} is not in the Google Fonts repository — falling back to the served file…`);
    const fallback = await findServedFallback(family);
    const buffer = await fetchFont(fallback.url);
    await showFont(buffer, {
      kind: 'google',
      family,
      fileName: null,
      subset: true,
      description: 'Google Fonts — the subset WOFF2 served by their CDN',
    });
  } catch (error) {
    reportGoogleError(family)(error);
  }
}

/* ------------------------------------------------------------ storage --- */

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      size: state.size,
      // Only text the reader typed themselves — otherwise the default sample
      // for one font would follow them to the next.
      text: state.text ?? '',
    }));
  } catch {
    // Private browsing, or storage is full — the preview is not worth failing for.
  }
}

function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null');
    if (!saved) return;
    if (typeof saved.size === 'number') state.size = saved.size;
    if (typeof saved.text === 'string' && saved.text.trim()) state.text = saved.text;
  } catch {
    // Ignore anything unreadable.
  }
}

/* -------------------------------------------------------------- wiring -- */

restore();
dom.size.value = String(state.size);
dom.sizeValue.textContent = `${state.size}px`;
document.documentElement.style.setProperty('--preview-size', `${state.size}px`);

dom.size.addEventListener('input', () => {
  state.size = Number(dom.size.value);
  dom.sizeValue.textContent = `${state.size}px`;
  if (state.font) apply();
  else document.documentElement.style.setProperty('--preview-size', `${state.size}px`);
});

dom.preview.addEventListener('input', () => {
  state.text = dom.preview.textContent;
  save();
});

dom.reset.addEventListener('click', () => {
  state.features.clear();
  state.axes = new Map(state.font.axes.map((axis) => [axis.tag, axis.default]));
  dom.instances.value = '';
  drawAxes();
  drawFeatures();
  apply();
});

dom.showShaping.addEventListener('change', () => {
  state.showShaping = dom.showShaping.checked;
  drawFeatures();
});

dom.instances.addEventListener('change', () => {
  const instance = state.font.instances[Number(dom.instances.value)];
  if (!instance) return;
  for (const [tag, value] of Object.entries(instance.coords)) state.axes.set(tag, value);
  const selected = dom.instances.value;
  drawAxes();
  dom.instances.value = selected;
  apply();
});

dom.copyCss.addEventListener('click', () => copy(dom.copyCss, dom.cssOutput.textContent));

setupPicker({
  dialog: dom.dialog,
  trigger: [document.getElementById('btn-google'), document.getElementById('btn-google-2')],
  search: document.getElementById('google-search'),
  list: document.getElementById('google-list'),
  note: document.getElementById('google-note'),
  onPick: handleGooglePick,
});

window.__fontDrop.register(handleFile);
