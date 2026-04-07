import { PALETTE_CSS, ZOOM_STEPS } from './constants.js';
import { state } from './state.js';
import { el } from './dom.js';
import { resizeOverviewCanvas, renderOverview, renderTileGrid, renderTileZoom, applyZoom } from './render.js';
import { quantize } from './quantize.js';
import { updateOutput } from './output.js';
import { renderCharMap, updateTileNav } from './charmap.js';

// --- Image loading ---

function onImageLoaded(img, name) {
  state.image = img;
  state.imageFileName = name;
  state.offsetX = 0;
  state.offsetY = 0;
  state.imageScale = 1;
  state.varPrefix = el.varPrefix.value || 'font';

  resizeOverviewCanvas();
  renderOverview();
  quantize();
  updateOutput();

  el.dropOverlay.classList.add('loaded');
  el.resetPositionBtn.hidden = false;
  el.zoomControls.hidden = false;
  el.tileEditModeBtn.disabled = false;
  el.imageInfo.textContent = `${img.naturalWidth}\u00d7${img.naturalHeight}px \u2014 ${state.tilesX}\u00d7${state.tilesY} tiles`;

  renderCharMap();

  if (state.mode === 'editor') {
    renderTileGrid();
    renderTileZoom();
    updateTileNav();
  }
}

function loadImageFromBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => onImageLoaded(img, name);
  img.src = url;
}

function loadImageFile(file) {
  if (!file.type.match(/^image\//)) return;
  loadImageFromBlob(file, file.name.replace(/\.\w+$/, ''));
}

// Exposed for storage restore
export function loadImageFromDataURL(dataUrl, name) {
  const img = new Image();
  img.onload = () => onImageLoaded(img, name);
  img.src = dataUrl;
}

// --- Drag to reposition ---

function getPointerPos(e) {
  const rect = el.overviewCanvas.getBoundingClientRect();
  const scaleX = el.overviewCanvas.width / rect.width;
  const scaleY = el.overviewCanvas.height / rect.height;
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  };
}

function onDragStart(e) {
  if (!state.image) return;
  e.preventDefault();
  el.dropTarget.focus();
  const pos = getPointerPos(e);
  state.dragging = true;
  state.dragStartX = pos.x;
  state.dragStartY = pos.y;
  state.dragOffsetStartX = state.offsetX;
  state.dragOffsetStartY = state.offsetY;
  el.overviewCanvas.style.cursor = 'grabbing';
}

function onDragMove(e) {
  if (!state.dragging) return;
  e.preventDefault();
  const pos = getPointerPos(e);
  state.offsetX = Math.round(state.dragOffsetStartX + pos.x - state.dragStartX);
  state.offsetY = Math.round(state.dragOffsetStartY + pos.y - state.dragStartY);
  renderOverview();
}

function onDragEnd() {
  if (!state.dragging) return;
  state.dragging = false;
  el.overviewCanvas.style.cursor = state.image ? 'grab' : 'default';
  quantize();
  updateOutput();
  renderCharMap();
  if (state.mode === 'editor') {
    renderTileGrid();
    renderTileZoom();
  }
}

// --- Zoom ---

function setZoom(z) {
  state.zoom = Math.max(1, Math.min(8, z));
  applyZoom();
}

// --- Event binding ---

export function initInput() {
  // Drag on canvas
  el.overviewCanvas.addEventListener('mousedown', onDragStart);
  window.addEventListener('mousemove', onDragMove);
  window.addEventListener('mouseup', onDragEnd);
  el.overviewCanvas.addEventListener('touchstart', onDragStart, { passive: false });
  window.addEventListener('touchmove', onDragMove, { passive: false });
  window.addEventListener('touchend', onDragEnd);

  // File drop
  ['dragenter', 'dragover'].forEach(evt => {
    el.dropTarget.addEventListener(evt, e => {
      e.preventDefault();
      el.dropOverlay.classList.add('dragover');
      el.dropOverlay.classList.remove('loaded');
    });
  });

  el.dropTarget.addEventListener('dragleave', e => {
    e.preventDefault();
    el.dropOverlay.classList.remove('dragover');
    if (state.image) el.dropOverlay.classList.add('loaded');
  });

  el.dropTarget.addEventListener('drop', e => {
    e.preventDefault();
    el.dropOverlay.classList.remove('dragover');
    if (state.image) el.dropOverlay.classList.add('loaded');
    const file = e.dataTransfer.files[0];
    if (file) loadImageFile(file);
  });

  // File browse
  el.dropOverlay.addEventListener('click', () => el.fileInput.click());
  el.fileInput.addEventListener('change', () => {
    if (el.fileInput.files[0]) loadImageFile(el.fileInput.files[0]);
    el.fileInput.value = '';
  });

  // Clipboard paste
  document.addEventListener('paste', e => {
    if (state.mode !== 'overview') return;
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.match(/^image\//)) {
        e.preventDefault();
        const blob = item.getAsFile();
        if (blob) loadImageFromBlob(blob, 'pasted_font');
        return;
      }
    }
  });

  // Reset position
  el.resetPositionBtn.addEventListener('click', () => {
    state.offsetX = 0;
    state.offsetY = 0;
    state.imageScale = 1;
    renderOverview();
    quantize();
    updateOutput();
    renderCharMap();
    if (state.mode === 'editor') {
      renderTileGrid();
      renderTileZoom();
    }
  });

  // Zoom buttons
  el.zoomInBtn.addEventListener('click', () => {
    const idx = ZOOM_STEPS.indexOf(state.zoom);
    if (idx < ZOOM_STEPS.length - 1) setZoom(ZOOM_STEPS[idx + 1]);
    else setZoom(state.zoom + 1);
  });

  el.zoomOutBtn.addEventListener('click', () => {
    const idx = ZOOM_STEPS.indexOf(state.zoom);
    if (idx > 0) setZoom(ZOOM_STEPS[idx - 1]);
    else setZoom(state.zoom - 1);
  });

  el.zoomFitBtn.addEventListener('click', () => setZoom(1));

  el.dropTarget.addEventListener('wheel', e => {
    if (!state.image) return;
    e.preventDefault();
    if (e.deltaY < 0) el.zoomInBtn.click();
    else el.zoomOutBtn.click();
  }, { passive: false });
}
