import { state, DMG_CSS } from './state.js';
import { el, gridCtx } from './dom.js';
import { renderTileZoom } from './tile-zoom.js';
import { updateTileNav } from './tile-edit.js';

export const GRID_TILE_SIZE = 16; // px per tile in the grid overview

export function renderTileGrid() {
  if (!state.tileData.length) return;
  const cols = state.tilesX;
  const rows = state.tilesY;
  const s = GRID_TILE_SIZE;
  el.tileGridCanvas.width = cols * s;
  el.tileGridCanvas.height = rows * s;

  for (let idx = 0; idx < state.tileData.length; idx++) {
    const tx = idx % cols;
    const ty = Math.floor(idx / cols);
    const tile = state.tileData[idx];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        gridCtx.fillStyle = DMG_CSS[tile[r][c]];
        gridCtx.fillRect(tx * s + c * 2, ty * s + r * 2, 2, 2);
      }
    }
  }

  // Grid lines between tiles
  gridCtx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
  gridCtx.lineWidth = 0.5;
  gridCtx.beginPath();
  for (let x = 0; x <= cols; x++) {
    gridCtx.moveTo(x * s, 0);
    gridCtx.lineTo(x * s, rows * s);
  }
  for (let y = 0; y <= rows; y++) {
    gridCtx.moveTo(0, y * s);
    gridCtx.lineTo(cols * s, y * s);
  }
  gridCtx.stroke();

  // Highlight selected tile
  const selX = state.selectedTile % cols;
  const selY = Math.floor(state.selectedTile / cols);
  gridCtx.strokeStyle = '#ef4444';
  gridCtx.lineWidth = 2;
  gridCtx.strokeRect(selX * s + 1, selY * s + 1, s - 2, s - 2);
}

export function setMode(mode) {
  state.mode = mode;
  el.overviewSection.classList.toggle('hidden', mode !== 'overview');
  el.tileEditorSection.classList.toggle('hidden', mode !== 'editor');
  el.overviewModeBtn.classList.toggle('active', mode === 'overview');
  el.tileEditModeBtn.classList.toggle('active', mode === 'editor');

  if (mode === 'editor') {
    renderTileGrid();
    renderTileZoom();
    updateTileNav();
  }
}
