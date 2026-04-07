import { state, DMG_CSS } from './state.js';
import { el, zoomCtx } from './dom.js';
import { renderTileGrid } from './tile-grid.js';
import { updateOutput } from './header.js';
import { updateTileNav } from './tile-edit.js';

export const ZOOM_PX = 40; // size of each pixel in the zoom view

export function renderTileZoom() {
  if (!state.tileData.length) return;
  const tile = state.tileData[state.selectedTile];
  const s = ZOOM_PX;
  el.tileZoomCanvas.width = 8 * s;
  el.tileZoomCanvas.height = 8 * s;

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      zoomCtx.fillStyle = DMG_CSS[tile[r][c]];
      zoomCtx.fillRect(c * s, r * s, s, s);
    }
  }

  // Grid lines
  zoomCtx.strokeStyle = 'rgba(128, 128, 128, 0.3)';
  zoomCtx.lineWidth = 1;
  zoomCtx.beginPath();
  for (let i = 1; i < 8; i++) {
    zoomCtx.moveTo(i * s, 0);
    zoomCtx.lineTo(i * s, 8 * s);
    zoomCtx.moveTo(0, i * s);
    zoomCtx.lineTo(8 * s, i * s);
  }
  zoomCtx.stroke();
}

export function paintPixel(e) {
  if (!state.tileData.length) return;
  const rect = el.tileZoomCanvas.getBoundingClientRect();
  const scaleX = el.tileZoomCanvas.width / rect.width;
  const scaleY = el.tileZoomCanvas.height / rect.height;
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  const x = (clientX - rect.left) * scaleX;
  const y = (clientY - rect.top) * scaleY;
  const col = Math.floor(x / ZOOM_PX);
  const row = Math.floor(y / ZOOM_PX);
  if (col < 0 || col > 7 || row < 0 || row > 7) return;

  const tile = state.tileData[state.selectedTile];
  if (tile[row][col] === state.selectedColor) return;
  tile[row][col] = state.selectedColor;
  renderTileZoom();
  renderTileGrid();
  updateOutput();
}

export function selectTile(idx) {
  if (idx < 0 || idx >= state.tileData.length) return;
  state.selectedTile = idx;
  renderTileGrid();
  renderTileZoom();
  updateTileNav();
}

export function panTile(dx, dy) {
  const tile = state.tileData[state.selectedTile];
  if (!tile) return;
  const fresh = Array.from({ length: 8 }, () => new Array(8).fill(0));
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sr = r - dy;
      const sc = c - dx;
      if (sr >= 0 && sr < 8 && sc >= 0 && sc < 8) {
        fresh[r][c] = tile[sr][sc];
      }
    }
  }
  state.tileData[state.selectedTile] = fresh;
  renderTileZoom();
  renderTileGrid();
  updateOutput();
}

export function invertPalette() {
  if (!state.tileData.length) return;
  for (const tile of state.tileData) {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        tile[r][c] = tile[r][c] === 0 ? 3 : tile[r][c] === 3 ? 0 : tile[r][c];
      }
    }
  }
  renderTileZoom();
  renderTileGrid();
  updateOutput();
}
