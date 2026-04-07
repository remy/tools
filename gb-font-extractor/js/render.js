import { PALETTE_CSS, GRID_TILE_SIZE, ZOOM_PX } from './constants.js';
import { state } from './state.js';
import { el, ovCtx, gridCtx, zoomCtx } from './dom.js';
import { calcGlyphWidth } from './encode.js';

// --- Overview canvas ---

export function applyZoom() {
  el.overviewCanvas.style.width = (state.canvasW * state.zoom) + 'px';
  el.overviewCanvas.style.height = (state.canvasH * state.zoom) + 'px';
  el.zoomLevel.textContent = state.zoom + 'x';
}

export function resizeOverviewCanvas() {
  if (!state.image) return;
  const img = state.image;
  const maxDim = 512;
  let w = Math.ceil(img.naturalWidth / 8) * 8;
  let h = Math.ceil(img.naturalHeight / 8) * 8;
  if (w > maxDim) w = maxDim;
  if (h > maxDim) h = maxDim;
  w = Math.max(w, 8);
  h = Math.max(h, 8);
  state.canvasW = w;
  state.canvasH = h;
  el.overviewCanvas.width = w;
  el.overviewCanvas.height = h;
  applyZoom();
}

export function renderOverview() {
  const w = state.canvasW;
  const h = state.canvasH;
  ovCtx.fillStyle = PALETTE_CSS[0];
  ovCtx.fillRect(0, 0, w, h);

  if (state.image) {
    const s = state.imageScale;
    ovCtx.drawImage(state.image, state.offsetX, state.offsetY,
      state.image.naturalWidth * s, state.image.naturalHeight * s);
  }

  // Grid overlay
  ovCtx.strokeStyle = 'rgba(0, 0, 0, 0.18)';
  ovCtx.lineWidth = 0.5;
  ovCtx.beginPath();
  for (let x = 0; x <= w; x += 8) { ovCtx.moveTo(x, 0); ovCtx.lineTo(x, h); }
  for (let y = 0; y <= h; y += 8) { ovCtx.moveTo(0, y); ovCtx.lineTo(w, y); }
  ovCtx.stroke();
}

// --- Tile grid ---

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
        gridCtx.fillStyle = PALETTE_CSS[tile[r][c]];
        gridCtx.fillRect(tx * s + c * 2, ty * s + r * 2, 2, 2);
      }
    }
  }

  // Grid lines
  gridCtx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
  gridCtx.lineWidth = 0.5;
  gridCtx.beginPath();
  for (let x = 0; x <= cols; x++) { gridCtx.moveTo(x * s, 0); gridCtx.lineTo(x * s, rows * s); }
  for (let y = 0; y <= rows; y++) { gridCtx.moveTo(0, y * s); gridCtx.lineTo(cols * s, y * s); }
  gridCtx.stroke();

  // Highlight selected
  const selX = state.selectedTile % cols;
  const selY = Math.floor(state.selectedTile / cols);
  gridCtx.strokeStyle = '#ef4444';
  gridCtx.lineWidth = 2;
  gridCtx.strokeRect(selX * s + 1, selY * s + 1, s - 2, s - 2);
}

// --- Tile zoom editor ---

export function renderTileZoom() {
  if (!state.tileData.length) return;
  const tile = state.tileData[state.selectedTile];
  const s = ZOOM_PX;
  el.tileZoomCanvas.width = 8 * s;
  el.tileZoomCanvas.height = 8 * s;

  const width = calcGlyphWidth(tile);

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      zoomCtx.fillStyle = PALETTE_CSS[tile[r][c]];
      zoomCtx.fillRect(c * s, r * s, s, s);
    }
  }

  // Width boundary line
  if (width < 8) {
    zoomCtx.strokeStyle = 'rgba(255, 0, 255, 0.6)';
    zoomCtx.lineWidth = 2;
    zoomCtx.setLineDash([4, 4]);
    zoomCtx.beginPath();
    zoomCtx.moveTo(width * s, 0);
    zoomCtx.lineTo(width * s, 8 * s);
    zoomCtx.stroke();
    zoomCtx.setLineDash([]);
  }

  // Grid lines
  zoomCtx.strokeStyle = 'rgba(128, 128, 128, 0.3)';
  zoomCtx.lineWidth = 1;
  zoomCtx.beginPath();
  for (let i = 1; i < 8; i++) {
    zoomCtx.moveTo(i * s, 0); zoomCtx.lineTo(i * s, 8 * s);
    zoomCtx.moveTo(0, i * s); zoomCtx.lineTo(8 * s, i * s);
  }
  zoomCtx.stroke();

  updateGlyphInfo();
}

export function updateGlyphInfo() {
  if (!state.tileData.length) {
    el.glyphInfo.textContent = '';
    return;
  }
  const idx = state.selectedTile;
  const code = 32 + idx;
  const ch = code === 32 ? 'Space' : String.fromCharCode(code);
  const w = state.glyphWidths[idx] ?? calcGlyphWidth(state.tileData[idx]);
  el.glyphInfo.textContent = `${ch} (0x${code.toString(16).toUpperCase()}) — width: ${w}px`;
}
