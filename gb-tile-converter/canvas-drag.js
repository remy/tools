import { state } from './state.js';
import { el } from './dom.js';
import { renderOverview, quantize } from './overview.js';
import { renderTileGrid } from './tile-grid.js';
import { renderTileZoom } from './tile-zoom.js';

export function getPointerPos(e) {
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

export function onDragStart(e) {
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

export function onDragMove(e) {
  if (!state.dragging) return;
  e.preventDefault();
  const pos = getPointerPos(e);
  state.offsetX = Math.round(state.dragOffsetStartX + pos.x - state.dragStartX);
  state.offsetY = Math.round(state.dragOffsetStartY + pos.y - state.dragStartY);
  renderOverview();
}

export function onDragEnd() {
  if (!state.dragging) return;
  state.dragging = false;
  el.overviewCanvas.style.cursor = state.image ? 'grab' : 'default';
  quantize();
  if (state.mode === 'editor') {
    renderTileGrid();
    renderTileZoom();
  }
}
