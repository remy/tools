const state = {
  anchorName: '--my-anchor',
  area: 'bottom',
  fallbacks: [],
  tryOrder: 'normal',
  visibility: 'always',
  sizeW: '',
  sizeH: '',
  margin: 8,
  anchorX: 50,
  anchorY: 50,
};

let _dragging = null;
let _activeTab = 'css';
let _suppressCssWrite = false;
let _suppressHtmlWrite = false;

const $canvasWrap  = document.querySelector('[data-canvas-wrap]');
const $canvas      = document.querySelector('[data-canvas]');
const $anchor      = document.querySelector('[data-anchor]');
const $popup       = document.querySelector('[data-popup]');
const $currentArea = document.querySelector('[data-current-area]');
const $marginInput = document.querySelector('[data-margin]');
const $marginOut   = document.querySelector('[data-margin-out]');
const $code        = document.querySelector('[data-code]');
const $htmlCode    = document.querySelector('[data-html-code]');
const $copyBtn     = document.querySelector('[data-copy]');
const $support     = document.querySelector('[data-support]');
const $anchorNameInput = document.querySelector('[data-anchor-name]');
const $presetSelect    = document.querySelector('[data-preset]');

const PRESETS = {
  tooltip: {
    area: 'top',
    fallbacks: ['flip-block'],
    tryOrder: 'normal',
    visibility: 'always',
    sizeW: '',
    sizeH: '',
    margin: 6,
  },
  dropdown: {
    area: 'bottom span-right',
    fallbacks: ['flip-block'],
    tryOrder: 'normal',
    visibility: 'always',
    sizeW: 'width',
    sizeH: '',
    margin: 4,
  },
  submenu: {
    area: 'right span-bottom',
    fallbacks: ['flip-inline'],
    tryOrder: 'normal',
    visibility: 'always',
    sizeW: '',
    sizeH: '',
    margin: 4,
  },
  caption: {
    area: 'bottom',
    fallbacks: [],
    tryOrder: 'normal',
    visibility: 'always',
    sizeW: 'width',
    sizeH: '',
    margin: 8,
  },
  'side-panel': {
    area: 'right',
    fallbacks: ['flip-inline'],
    tryOrder: 'normal',
    visibility: 'always',
    sizeW: '',
    sizeH: 'height',
    margin: 8,
  },
  'auto-flip': {
    area: 'bottom',
    fallbacks: ['flip-block', 'flip-inline', 'flip-start'],
    tryOrder: 'most-height',
    visibility: 'anchors-visible',
    sizeW: '',
    sizeH: '',
    margin: 8,
  },
};

function applyPreset(key) {
  const p = PRESETS[key];
  if (!p) return;
  Object.assign(state, p);
  syncControlsFromState();
  setArea(state.area);
}

function syncControlsFromState() {
  // fallbacks
  document.querySelectorAll('[data-fallback]').forEach(cb => {
    cb.checked = state.fallbacks.includes(cb.value);
  });
  // try-order
  document.querySelectorAll('input[name="try-order"]').forEach(r => {
    r.checked = r.value === state.tryOrder;
  });
  // visibility
  document.querySelectorAll('input[name="vis"]').forEach(r => {
    r.checked = r.value === state.visibility;
  });
  // size width
  document.querySelectorAll('input[name="size-w"]').forEach(r => {
    r.checked = r.value === state.sizeW;
  });
  // size height
  document.querySelectorAll('input[name="size-h"]').forEach(r => {
    r.checked = r.value === state.sizeH;
  });
  // margin
  $marginInput.value = state.margin;
  $marginOut.textContent = `${state.margin}px`;
}

$presetSelect.addEventListener('change', () => {
  if ($presetSelect.value) applyPreset($presetSelect.value);
});

// anchor-name input
$anchorNameInput.addEventListener('input', () => {
  const raw = $anchorNameInput.value.trim();
  const name = raw.startsWith('--') ? raw : '--' + raw;
  state.anchorName = name;
  render();
});

// position-area grid
document.querySelectorAll('[data-area]').forEach(btn => {
  btn.addEventListener('click', () => setArea(btn.dataset.area));
});

// position-try-fallbacks
document.querySelectorAll('[data-fallback]').forEach(cb => {
  cb.addEventListener('change', () => {
    state.fallbacks = [...document.querySelectorAll('[data-fallback]:checked')].map(el => el.value);
    render();
  });
});

// position-try-order
document.querySelectorAll('input[name="try-order"]').forEach(r => {
  r.addEventListener('change', () => { state.tryOrder = r.value; render(); });
});

// position-visibility
document.querySelectorAll('input[name="vis"]').forEach(r => {
  r.addEventListener('change', () => { state.visibility = r.value; render(); });
});

// anchor-size width axis
document.querySelectorAll('input[name="size-w"]').forEach(r => {
  r.addEventListener('change', () => { state.sizeW = r.value; render(); });
});

// anchor-size height axis
document.querySelectorAll('input[name="size-h"]').forEach(r => {
  r.addEventListener('change', () => { state.sizeH = r.value; render(); });
});

// margin
$marginInput.addEventListener('input', () => {
  state.margin = Number($marginInput.value);
  $marginOut.textContent = `${state.margin}px`;
  render();
});

// reset
document.querySelector('[data-reset]').addEventListener('click', () => {
  state.anchorX = 50;
  state.anchorY = 50;
  positionAnchor();
  centerOnAnchor();
});

// copy button
$copyBtn.addEventListener('click', async () => {
  const text = _activeTab === 'css' ? $code.value : $htmlCode.value;
  try {
    await navigator.clipboard.writeText(text);
    $copyBtn.textContent = 'Copied!';
    setTimeout(() => ($copyBtn.textContent = 'Copy'), 1200);
  } catch {
    $copyBtn.textContent = 'Failed';
    setTimeout(() => ($copyBtn.textContent = 'Copy'), 1200);
  }
});

// tabs
document.querySelectorAll('[data-tab]').forEach(btn => {
  btn.addEventListener('click', () => {
    _activeTab = btn.dataset.tab;
    document.querySelectorAll('[data-tab]').forEach(b => {
      b.classList.toggle('is-active', b.dataset.tab === _activeTab);
      b.setAttribute('aria-selected', b.dataset.tab === _activeTab);
    });
    document.querySelectorAll('[data-panel]').forEach(p => {
      p.hidden = p.dataset.panel !== _activeTab;
    });
  });
});

// drag
$anchor.addEventListener('pointerdown', startDrag);
window.addEventListener('pointermove', onDrag);
window.addEventListener('pointerup', endDrag);

$anchor.addEventListener('keydown', (e) => {
  const step = e.shiftKey ? 5 : 1;
  let handled = true;
  if      (e.key === 'ArrowLeft')  state.anchorX = Math.max(0,   state.anchorX - step);
  else if (e.key === 'ArrowRight') state.anchorX = Math.min(100, state.anchorX + step);
  else if (e.key === 'ArrowUp')    state.anchorY = Math.max(0,   state.anchorY - step);
  else if (e.key === 'ArrowDown')  state.anchorY = Math.min(100, state.anchorY + step);
  else handled = false;
  if (handled) { e.preventDefault(); positionAnchor(); }
});

function startDrag(e) {
  _dragging = { pointerId: e.pointerId };
  $anchor.setPointerCapture?.(e.pointerId);
  $anchor.style.cursor = 'grabbing';
  e.preventDefault();
}

function onDrag(e) {
  if (!_dragging || e.pointerId !== _dragging.pointerId) return;
  const rect = $canvas.getBoundingClientRect();
  state.anchorX = Math.max(0, Math.min(100, ((e.clientX - rect.left)  / rect.width)  * 100));
  state.anchorY = Math.max(0, Math.min(100, ((e.clientY - rect.top)   / rect.height) * 100));
  positionAnchor();
}

function endDrag(e) {
  if (!_dragging || e.pointerId !== _dragging.pointerId) return;
  $anchor.releasePointerCapture?.(e.pointerId);
  $anchor.style.cursor = '';
  _dragging = null;
}

function positionAnchor() {
  $anchor.style.left = `${state.anchorX}%`;
  $anchor.style.top  = `${state.anchorY}%`;
}

function centerOnAnchor() {
  const a = $anchor.getBoundingClientRect();
  const w = $canvasWrap.getBoundingClientRect();
  $canvasWrap.scrollBy({
    left: a.left - w.left - w.width  / 2 + a.width  / 2,
    top:  a.top  - w.top  - w.height / 2 + a.height / 2,
    behavior: 'smooth',
  });
}

function setArea(area) {
  state.area = area;
  document.querySelectorAll('[data-area]').forEach(btn => {
    btn.classList.toggle('is-active', btn.dataset.area === area);
  });
  $currentArea.textContent = area;
  render();
}

function render() {
  const name = state.anchorName;

  // apply styles to anchor element
  $anchor.style.anchorName = name;

  // apply styles to popup element
  $popup.style.positionAnchor       = name;
  $popup.style.positionArea         = state.area;
  $popup.style.margin               = `${state.margin}px`;
  $popup.style.positionTryFallbacks = state.fallbacks.length ? state.fallbacks.join(', ') : '';
  $popup.style.positionTryOrder     = state.tryOrder !== 'normal' ? state.tryOrder : '';
  $popup.style.positionVisibility   = state.visibility;
  $popup.style.width  = state.sizeW ? `anchor-size(${state.sizeW})`  : '';
  $popup.style.height = state.sizeH ? `anchor-size(${state.sizeH})` : '';
  const meta = $popup.querySelector('.popup-meta');
  if (meta) meta.textContent = state.area;

  // generate CSS
  const cssLines = [
    `.anchor {`,
    `  anchor-name: ${name};`,
    `}`,
    ``,
    `.popup {`,
    `  position: absolute;`,
    `  position-anchor: ${name};`,
    `  position-area: ${state.area};`,
  ];
  if (state.margin)            cssLines.push(`  margin: ${state.margin}px;`);
  if (state.fallbacks.length)  cssLines.push(`  position-try-fallbacks: ${state.fallbacks.join(', ')};`);
  if (state.tryOrder !== 'normal') cssLines.push(`  position-try-order: ${state.tryOrder};`);
  if (state.visibility !== 'always') cssLines.push(`  position-visibility: ${state.visibility};`);
  if (state.sizeW)             cssLines.push(`  width: anchor-size(${state.sizeW});`);
  if (state.sizeH)             cssLines.push(`  height: anchor-size(${state.sizeH});`);
  cssLines.push(`}`);
  if (!_suppressCssWrite) $code.value = cssLines.join('\n');

  // generate HTML
  if (!_suppressHtmlWrite) {
    const htmlLines = [
      `<!-- Anchor element -->`,
      `<div class="anchor">`,
      `  <span>⚓</span>`,
      `  <span class="anchor-label">anchor</span>`,
      `</div>`,
      ``,
      `<!-- Popup (positioned relative to anchor) -->`,
      `<div class="popup">`,
      `  <strong>Anchored popup</strong>`,
      `  <span class="popup-meta"></span>`,
      `</div>`,
    ];
    $htmlCode.value = htmlLines.join('\n');
  }
}

// ─── CSS edit → controls sync ───

function findBlock(text, selector) {
  const re = new RegExp(`\\.${selector}\\s*\\{`, 'g');
  const m = re.exec(text);
  if (!m) return null;
  let depth = 1;
  let i = m.index + m[0].length;
  while (i < text.length && depth > 0) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') depth--;
    if (depth === 0) return text.slice(m.index + m[0].length, i);
    i++;
  }
  return null;
}

function getDecl(body, prop) {
  const re = new RegExp(`(?:^|;|\\s)${prop}\\s*:\\s*([^;}]+)`, 'i');
  const m = body.match(re);
  return m ? m[1].trim() : null;
}

function parseCss(text) {
  const out = {};
  const anchorBody = findBlock(text, 'anchor');
  if (anchorBody) {
    const v = getDecl(anchorBody, 'anchor-name');
    if (v) out.anchorName = v;
  }
  const popupBody = findBlock(text, 'popup');
  if (popupBody) {
    const area = getDecl(popupBody, 'position-area');
    if (area) out.area = area;

    const margin = getDecl(popupBody, 'margin');
    if (margin !== null) {
      const mm = margin.match(/-?\d+(\.\d+)?/);
      out.margin = mm ? Math.max(0, Math.min(40, Math.round(Number(mm[0])))) : 0;
    } else {
      out.margin = 0;
    }

    const fb = getDecl(popupBody, 'position-try-fallbacks');
    out.fallbacks = fb
      ? fb.split(',').map(s => s.trim()).filter(s => ['flip-block', 'flip-inline', 'flip-start'].includes(s))
      : [];

    out.tryOrder = getDecl(popupBody, 'position-try-order') || 'normal';
    out.visibility = getDecl(popupBody, 'position-visibility') || 'always';

    const w = getDecl(popupBody, 'width');
    const wm = w && w.match(/anchor-size\(\s*([a-z-]+)\s*\)/i);
    out.sizeW = wm ? wm[1] : '';

    const h = getDecl(popupBody, 'height');
    const hm = h && h.match(/anchor-size\(\s*([a-z-]+)\s*\)/i);
    out.sizeH = hm ? hm[1] : '';
  }
  return out;
}

function syncAreaUI() {
  document.querySelectorAll('[data-area]').forEach(btn => {
    btn.classList.toggle('is-active', btn.dataset.area === state.area);
  });
  $currentArea.textContent = state.area;
  $presetSelect.value = '';
}

$code.addEventListener('input', () => {
  let parsed;
  try { parsed = parseCss($code.value); } catch { return; }
  if (parsed.anchorName) {
    state.anchorName = parsed.anchorName;
    $anchorNameInput.value = parsed.anchorName;
  }
  if (parsed.area) state.area = parsed.area;
  if (typeof parsed.margin === 'number') state.margin = parsed.margin;
  if (parsed.fallbacks)  state.fallbacks  = parsed.fallbacks;
  if (parsed.tryOrder)   state.tryOrder   = parsed.tryOrder;
  if (parsed.visibility) state.visibility = parsed.visibility;
  if (parsed.sizeW !== undefined) state.sizeW = parsed.sizeW;
  if (parsed.sizeH !== undefined) state.sizeH = parsed.sizeH;

  syncControlsFromState();
  syncAreaUI();

  _suppressCssWrite = true;
  render();
  _suppressCssWrite = false;
});

// ─── HTML edit → canvas sync ───

$htmlCode.addEventListener('input', () => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<body>${$htmlCode.value}</body>`, 'text/html');
  const newAnchor = doc.querySelector('.anchor');
  const newPopup  = doc.querySelector('.popup');
  if (newAnchor) $anchor.innerHTML = newAnchor.innerHTML;
  if (newPopup)  $popup.innerHTML  = newPopup.innerHTML;

  _suppressHtmlWrite = true;
  render();
  _suppressHtmlWrite = false;
});

function checkSupport() {
  const supported = CSS.supports?.('anchor-name', '--x') && CSS.supports?.('position-area', 'top');
  const label  = $support.querySelector('.support-label');
  const detail = $support.querySelector('.support-detail');
  const icon   = $support.querySelector('.support-icon');
  if (supported) {
    $support.classList.add('supported');
    icon.textContent  = '✓';
    label.textContent = 'CSS Anchor Positioning supported';
    detail.textContent = 'All controls on this page are live.';
  } else {
    $support.classList.add('unsupported');
    icon.textContent  = '⚠';
    label.textContent = 'Not supported in this browser';
    detail.innerHTML  = 'Try Chrome 125+ or Edge 125+. Firefox & Safari do not yet ship anchor positioning. Controls still update the generated CSS.';
  }
}

// init
setArea(state.area);
positionAnchor();
render();
checkSupport();

// center canvas on the anchor after layout settles
requestAnimationFrame(() => {
  const canvasW = $canvas.offsetWidth;
  const canvasH = $canvas.offsetHeight;
  const wrapW   = $canvasWrap.offsetWidth;
  const wrapH   = $canvasWrap.offsetHeight;
  $canvasWrap.scrollLeft = (canvasW * state.anchorX / 100) - wrapW / 2;
  $canvasWrap.scrollTop  = (canvasH * state.anchorY / 100) - wrapH / 2;
});
