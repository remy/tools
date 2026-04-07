import { state } from './state.js';
import { el, zoomCtx } from './dom.js';
import { renderTileGrid } from './tile-grid.js';
import { renderTileZoom } from './tile-zoom.js';
import { updateOutput } from './header.js';

export function updateTileNav() {
  const total = state.tileData.length;
  el.tileIndex.textContent = total ? `Tile ${state.selectedTile + 1} / ${total}` : 'No tiles';
  el.prevTileBtn.disabled = state.selectedTile <= 0;
  el.nextTileBtn.disabled = !total || state.selectedTile >= total - 1;
  el.deleteTileBtn.disabled = !total;
}

export function addTile() {
  const blank = Array.from({ length: 8 }, () => new Array(8).fill(0));
  const insertAt = state.tileData.length ? state.selectedTile + 1 : 0;
  state.tileData.splice(insertAt, 0, blank);
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
