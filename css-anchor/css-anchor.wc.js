const state = {
  area: 'bottom',
  fallbacks: [],
  visibility: 'always',
  sizeWidth: false,
  sizeHeight: false,
  margin: 8,
  anchorX: 50,
  anchorY: 50,
};

let _dragging = null;

const $canvasWrap = document.querySelector('[data-canvas-wrap]');
const $canvas     = document.querySelector('[data-canvas]');
const $anchor     = document.querySelector('[data-anchor]');
const $popup      = document.querySelector('[data-popup]');
const $popupMeta  = document.querySelector('[data-popup-meta]');
const $currentArea = document.querySelector('[data-current-area]');
const $marginInput = document.querySelector('[data-margin]');
const $marginOut  = document.querySelector('[data-margin-out]');
const $code       = document.querySelector('[data-code]');
const $copyBtn    = document.querySelector('[data-copy]');
const $support    = document.querySelector('[data-support]');

document.querySelectorAll('[data-area]').forEach(btn => {
  btn.addEventListener('click', () => setArea(btn.dataset.area));
});

document.querySelectorAll('[data-fallback]').forEach(cb => {
  cb.addEventListener('change', () => {
    state.fallbacks = [...document.querySelectorAll('[data-fallback]:checked')].map(el => el.value);
    render();
  });
});

document.querySelectorAll('input[name="vis"]').forEach(r => {
  r.addEventListener('change', () => { state.visibility = r.value; render(); });
});

document.querySelectorAll('[data-size]').forEach(cb => {
  cb.addEventListener('change', () => {
    if (cb.dataset.size === 'width')  state.sizeWidth  = cb.checked;
    if (cb.dataset.size === 'height') state.sizeHeight = cb.checked;
    render();
  });
});

$marginInput.addEventListener('input', () => {
  state.margin = Number($marginInput.value);
  $marginOut.textContent = `${state.margin}px`;
  render();
});

document.querySelector('[data-reset]').addEventListener('click', () => {
  state.anchorX = 50;
  state.anchorY = 50;
  positionAnchor();
  centerOnAnchor();
});

$copyBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($code.textContent);
    $copyBtn.textContent = 'Copied!';
    setTimeout(() => ($copyBtn.textContent = 'Copy'), 1200);
  } catch {
    $copyBtn.textContent = 'Failed';
    setTimeout(() => ($copyBtn.textContent = 'Copy'), 1200);
  }
});

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
  $popup.style.positionArea       = state.area;
  $popup.style.margin             = `${state.margin}px`;
  $popup.style.positionTryFallbacks = state.fallbacks.length ? state.fallbacks.join(', ') : '';
  $popup.style.positionVisibility = state.visibility;
  $popup.style.width  = state.sizeWidth  ? 'anchor-size(width)'  : '';
  $popup.style.height = state.sizeHeight ? 'anchor-size(height)' : '';
  $popupMeta.textContent = state.area;

  const lines = [
    `.anchor {`,
    `  anchor-name: --pg-anchor;`,
    `}`,
    ``,
    `.popup {`,
    `  position: absolute;`,
    `  position-anchor: --pg-anchor;`,
    `  position-area: ${state.area};`,
  ];
  if (state.margin)          lines.push(`  margin: ${state.margin}px;`);
  if (state.fallbacks.length) lines.push(`  position-try-fallbacks: ${state.fallbacks.join(', ')};`);
  if (state.visibility !== 'always') lines.push(`  position-visibility: ${state.visibility};`);
  if (state.sizeWidth)       lines.push(`  width: anchor-size(width);`);
  if (state.sizeHeight)      lines.push(`  height: anchor-size(height);`);
  lines.push(`}`);
  $code.textContent = lines.join('\n');
}

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

setArea(state.area);
positionAnchor();
render();
checkSupport();
