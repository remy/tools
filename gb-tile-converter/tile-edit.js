import { state, FIRST_CHAR } from './state.js';
import { el, zoomCtx } from './dom.js';
import { calcGlyphWidth } from './color.js';
import { renderTileGrid } from './tile-grid.js';
import { renderTileZoom } from './tile-zoom.js';
import { updateOutput } from './header.js';

export function updateTileNav() {
  const total = state.tileData.length;
  if (!total) {
    el.tileIndex.textContent = state.fontMode ? 'No glyphs' : 'No tiles';
    el.prevTileBtn.disabled = true;
    el.nextTileBtn.disabled = true;
    el.deleteTileBtn.disabled = true;
    return;
  }
  if (state.fontMode) {
    const code = FIRST_CHAR + state.selectedTile;
    const ch = code === 32 ? 'Space' : `'${String.fromCharCode(code)}'`;
    el.tileIndex.textContent = `${ch} — ${state.selectedTile + 1} / ${total}`;
  } else {
    el.tileIndex.textContent = `Tile ${state.selectedTile + 1} / ${total}`;
  }
  el.prevTileBtn.disabled = state.selectedTile <= 0;
  el.nextTileBtn.disabled = state.selectedTile >= total - 1;
  el.deleteTileBtn.disabled = false;
}

export function addTile() {
  const blank = Array.from({ length: 8 }, () => new Array(8).fill(0));
  const insertAt = state.tileData.length ? state.selectedTile + 1 : 0;
  state.tileData.splice(insertAt, 0, blank);
  if (state.fontMode) {
    state.glyphWidths.splice(insertAt, 0, 8);
  }
  if (state.tilesX === 0) state.tilesX = 1;
  state.tilesY = Math.ceil(state.tileData.length / state.tilesX);
  state.selectedTile = insertAt;
  renderTileGrid();
  renderTileZoom();
  updateTileNav();
  updateOutput();
}

export function deleteTile() {
  if (!state.tileData.length) return;
  state.tileData.splice(state.selectedTile, 1);
  if (state.fontMode) {
    state.glyphWidths.splice(state.selectedTile, 1);
  }
  if (state.selectedTile >= state.tileData.length) {
    state.selectedTile = Math.max(0, state.tileData.length - 1);
  }
  state.tilesY = state.tilesX ? Math.ceil(state.tileData.length / state.tilesX) : 0;
  renderTileGrid();
  if (state.tileData.length) {
    renderTileZoom();
  } else {
    zoomCtx.clearRect(0, 0, el.tileZoomCanvas.width, el.tileZoomCanvas.height);
  }
  updateTileNav();
  updateOutput();
}
