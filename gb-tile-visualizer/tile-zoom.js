// ---- Tile Zoom (editor canvas) ----
import { state, DMG_CSS } from './state.js';
import { el, zoomCtx } from './dom.js';
import { updateSourceFromTile, updateInlinePreviews } from './source-update.js';
import { renderTileGrid } from './tile-grid.js';

export function renderTileZoom() {
  const arr = state.arrays[state.selectedArray];
  if (!arr) return;
  const tile = arr.tiles[state.selectedTile];
  if (!tile) return;

  const size = 320;
  const px = size / 8;
  el.tileZoomCanvas.width = size;
  el.tileZoomCanvas.height = size;

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      zoomCtx.fillStyle = DMG_CSS[tile[r][c]];
      zoomCtx.fillRect(c * px, r * px, px, px);
    }
  }

  // Grid lines
  zoomCtx.strokeStyle = 'rgba(128,128,128,0.25)';
  zoomCtx.lineWidth = 1;
  for (let i = 0; i <= 8; i++) {
    zoomCtx.beginPath();
    zoomCtx.moveTo(i * px, 0);
    zoomCtx.lineTo(i * px, size);
    zoomCtx.stroke();
    zoomCtx.beginPath();
    zoomCtx.moveTo(0, i * px);
    zoomCtx.lineTo(size, i * px);
    zoomCtx.stroke();
  }

  drawZoomHighlight();
}

export function drawZoomHighlight() {
  if (!state.hoveredPixels) return;
  const { row, col, w, h } = state.hoveredPixels;
  const size = 320;
  const px = size / 8;
  zoomCtx.save();
  zoomCtx.fillStyle = 'rgba(255, 255, 255, 0.45)';
  zoomCtx.fillRect(col * px, row * px, w * px, h * px);
  zoomCtx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
  zoomCtx.lineWidth = 2;
  zoomCtx.strokeRect(col * px + 1, row * px + 1, w * px - 2, h * px - 2);
  zoomCtx.restore();
}

export function byteIdxToPixelRegion(arr, byteIdx) {
  const valsPerTile = arr.mode === 'raw' ? 64
    : arr.mode === '1bpp' ? (arr.wide ? 4 : 8)
    : (arr.wide ? 8 : 16);
  const localIdx = byteIdx % valsPerTile;
  if (arr.mode === 'raw') {
    // Each value is one pixel
    return { row: Math.floor(localIdx / 8), col: localIdx % 8, w: 1, h: 1 };
  }
  if (arr.mode === '1bpp') {
    // 8-bit: 1 byte per row; 16-bit: 1 value per 2 rows
    return arr.wide
      ? { row: localIdx * 2, col: 0, w: 8, h: 2 }
      : { row: localIdx, col: 0, w: 8, h: 1 };
  }
  if (arr.wide) {
    // 16-bit value: lo+hi byte pair = one full row of 8 pixels
    return { row: localIdx, col: 0, w: 8, h: 1 };
  }
  // 8-bit 2BPP: two bytes per row, each byte → 4 pixels (left or right half)
  const row = Math.floor(localIdx / 2);
  const isHiByte = localIdx % 2 === 1;
  return { row, col: isHiByte ? 4 : 0, w: 4, h: 1 };
}

export function getZoomPixel(e) {
  const rect = el.tileZoomCanvas.getBoundingClientRect();
  const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
  const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
  const px = rect.width / 8;
  const col = Math.floor(x / px);
  const row = Math.floor(y / px);
  if (col < 0 || col > 7 || row < 0 || row > 7) return null;
  return { row, col };
}

export function paintPixel(e) {
  const p = getZoomPixel(e);
  if (!p) return;
  const arr = state.arrays[state.selectedArray];
  if (!arr) return;
  const tile = arr.tiles[state.selectedTile];
  if (!tile) return;

  if (tile[p.row][p.col] === state.selectedColor) return;
  tile[p.row][p.col] = state.selectedColor;

  renderTileZoom();
  renderTileGrid();
  updateSourceFromTile(state.selectedArray, state.selectedTile);
  updateInlinePreviews(state.selectedArray);
}

export function panTile(dx, dy) {
  const arr = state.arrays[state.selectedArray];
  if (!arr) return;
  const tile = arr.tiles[state.selectedTile];
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
  arr.tiles[state.selectedTile] = fresh;
  renderTileZoom();
  renderTileGrid();
  updateSourceFromTile(state.selectedArray, state.selectedTile);
  updateInlinePreviews(state.selectedArray);
}
