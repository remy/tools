import { ZOOM_PX, GRID_TILE_SIZE } from './constants.js';
import { state } from './state.js';
import { el, zoomCtx } from './dom.js';
import { calcGlyphWidth } from './encode.js';
import { renderTileGrid, renderTileZoom, renderOverview } from './render.js';
import { updateOutput } from './output.js';
import { renderCharMap, updateTileNav } from './charmap.js';
import { quantize } from './quantize.js';

// --- Pixel painting ---

function paintPixel(e) {
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
  state.glyphWidths[state.selectedTile] = calcGlyphWidth(tile);
  renderTileZoom();
  renderTileGrid();
  renderCharMap();
  updateOutput();
}

// --- Tile selection ---

function selectTile(idx) {
  if (idx < 0 || idx >= state.tileData.length) return;
  state.selectedTile = idx;
  renderTileGrid();
  renderTileZoom();
  updateTileNav();
  renderCharMap();
}

function panTile(dx, dy) {
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
  state.glyphWidths[state.selectedTile] = calcGlyphWidth(fresh);
  renderTileZoom();
  renderTileGrid();
  renderCharMap();
  updateOutput();
}

// --- Event binding ---

export function initEditor() {
  // Zoom canvas painting
  el.tileZoomCanvas.addEventListener('mousedown', e => {
    state.painting = true;
    paintPixel(e);
  });
  window.addEventListener('mousemove', e => {
    if (state.painting) paintPixel(e);
  });
  window.addEventListener('mouseup', () => { state.painting = false; });

  el.tileZoomCanvas.addEventListener('touchstart', e => {
    e.preventDefault();
    state.painting = true;
    paintPixel(e);
  }, { passive: false });
  el.tileZoomCanvas.addEventListener('touchmove', e => {
    e.preventDefault();
    if (state.painting) paintPixel(e);
  }, { passive: false });
  el.tileZoomCanvas.addEventListener('touchend', () => { state.painting = false; });

  // Tile grid click
  el.tileGridCanvas.addEventListener('click', e => {
    if (!state.tileData.length) return;
    const rect = el.tileGridCanvas.getBoundingClientRect();
    const scaleX = el.tileGridCanvas.width / rect.width;
    const scaleY = el.tileGridCanvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    const tx = Math.floor(x / GRID_TILE_SIZE);
    const ty = Math.floor(y / GRID_TILE_SIZE);
    const idx = ty * state.tilesX + tx;
    if (idx >= 0 && idx < state.tileData.length) selectTile(idx);
  });

  // Prev / Next
  el.prevTileBtn.addEventListener('click', () => {
    if (state.selectedTile > 0) selectTile(state.selectedTile - 1);
  });
  el.nextTileBtn.addEventListener('click', () => {
    if (state.selectedTile < state.tileData.length - 1) selectTile(state.selectedTile + 1);
  });

  // Palette buttons
  el.paletteButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      state.selectedColor = parseInt(btn.dataset.color);
      el.paletteButtons.forEach(b => b.classList.toggle('active', b === btn));
    });
  });

  // Keyboard
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.target.isContentEditable) return;

    // Overview mode: arrow keys nudge image
    if (state.mode === 'overview' && state.image && document.activeElement === el.dropTarget) {
      const step = e.shiftKey ? 4 : 1;
      let handled = true;
      switch (e.key) {
        case 'ArrowLeft':  state.offsetX -= step; break;
        case 'ArrowRight': state.offsetX += step; break;
        case 'ArrowUp':    state.offsetY -= step; break;
        case 'ArrowDown':  state.offsetY += step; break;
        case '=': case '+':
          state.imageScale = Math.round((state.imageScale + 0.2) * 100) / 100;
          break;
        case '-':
          state.imageScale = Math.max(0.2, Math.round((state.imageScale - 0.2) * 100) / 100);
          break;
        case '0': state.imageScale = 1; break;
        default: handled = false;
      }
      if (handled) {
        e.preventDefault();
        renderOverview();
        quantize();
        updateOutput();
        renderCharMap();
        el.imageInfo.textContent = `${state.image.naturalWidth}\u00d7${state.image.naturalHeight}px \u2014 ${state.tilesX}\u00d7${state.tilesY} tiles` +
          (state.imageScale !== 1 ? ` \u2014 scale ${state.imageScale.toFixed(1)}x` : '');
        return;
      }
    }

    if (state.mode !== 'editor') return;
    if (!state.tileData.length) return;

    // Shift+arrow: pan pixel data
    if (e.shiftKey && e.key.startsWith('Arrow')) {
      e.preventDefault();
      const dx = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
      const dy = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
      panTile(dx, dy);
      return;
    }

    const cols = state.tilesX;
    const cur = state.selectedTile;
    const curX = cur % cols;
    const curY = Math.floor(cur / cols);

    switch (e.key) {
      case 'ArrowLeft':  e.preventDefault(); if (curX > 0) selectTile(cur - 1); break;
      case 'ArrowRight': e.preventDefault(); if (curX < cols - 1) selectTile(cur + 1); break;
      case 'ArrowUp':    e.preventDefault(); if (curY > 0) selectTile(cur - cols); break;
      case 'ArrowDown':  e.preventDefault(); if (curY < state.tilesY - 1) selectTile(cur + cols); break;
      case '1': case '2': case '3': {
        const c = parseInt(e.key) - 1;
        state.selectedColor = c;
        el.paletteButtons.forEach(b => b.classList.toggle('active', parseInt(b.dataset.color) === c));
        break;
      }
    }
  });
}
