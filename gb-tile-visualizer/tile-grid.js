// ---- Tile Grid (all tiles in selected array) ----
import { state, DMG_CSS } from './state.js';
import { el, gridCtx } from './dom.js';
import { renderTileZoom } from './tile-zoom.js';
import { updateSourceHighlights } from './source-view.js';

export function drawTileToCanvas(canvas, tile) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const px = w / 8;
  const py = h / 8;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      ctx.fillStyle = DMG_CSS[tile[r][c]];
      ctx.fillRect(c * px, r * py, px, py);
    }
  }
}

// Map tile index to {x, y} pixel position on the grid canvas
export function tileGridPosition(t, count) {
  const scale = 2;
  const tileSize = 8 * scale;
  if (state.cluster2x2) {
    const clusterIdx = Math.floor(t / 4);
    const inner = t % 4; // 0=TL, 1=TR, 2=BL, 3=BR
    const clusterCols = Math.min(Math.ceil(count / 4), 8);
    const cx = clusterIdx % clusterCols;
    const cy = Math.floor(clusterIdx / clusterCols);
    const ix = inner % 2;
    const iy = Math.floor(inner / 2);
    return { x: (cx * 2 + ix) * tileSize, y: (cy * 2 + iy) * tileSize };
  }
  const cols = Math.min(count, 16);
  return { x: (t % cols) * tileSize, y: Math.floor(t / cols) * tileSize };
}

export function renderTileGrid() {
  const arr = state.arrays[state.selectedArray];
  if (!arr) return;

  const count = arr.tiles.length;
  const scale = 2; // 2px per pixel
  const tileSize = 8 * scale;
  let cols, rows;

  if (state.cluster2x2) {
    const clusterCols = Math.min(Math.ceil(count / 4), 8);
    const clusterRows = Math.ceil(Math.ceil(count / 4) / clusterCols);
    cols = clusterCols * 2;
    rows = clusterRows * 2;
  } else {
    cols = Math.min(count, 16);
    rows = Math.ceil(count / cols);
  }

  el.tileGridCanvas.width = cols * tileSize;
  el.tileGridCanvas.height = rows * tileSize;

  for (let t = 0; t < count; t++) {
    const pos = tileGridPosition(t, count);
    const tile = arr.tiles[t];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        gridCtx.fillStyle = DMG_CSS[tile[r][c]];
        gridCtx.fillRect(pos.x + c * scale, pos.y + r * scale, scale, scale);
      }
    }
  }

  // Draw selection border
  const selPos = tileGridPosition(state.selectedTile, count);
  gridCtx.strokeStyle = '#e74c3c';
  gridCtx.lineWidth = 1;
  gridCtx.strokeRect(selPos.x + 0.5, selPos.y + 0.5, tileSize - 1, tileSize - 1);

  // Grid lines
  gridCtx.strokeStyle = 'rgba(128,128,128,0.3)';
  gridCtx.lineWidth = 0.5;
  for (let x = 0; x <= cols; x++) {
    gridCtx.beginPath();
    gridCtx.moveTo(x * tileSize, 0);
    gridCtx.lineTo(x * tileSize, rows * tileSize);
    gridCtx.stroke();
  }
  for (let y = 0; y <= rows; y++) {
    gridCtx.beginPath();
    gridCtx.moveTo(0, y * tileSize);
    gridCtx.lineTo(cols * tileSize, y * tileSize);
    gridCtx.stroke();
  }

  // Cluster borders (thicker lines between 2x2 groups)
  if (state.cluster2x2) {
    gridCtx.strokeStyle = 'rgba(128,128,128,0.7)';
    gridCtx.lineWidth = 1;
    for (let x = 0; x <= cols; x += 2) {
      gridCtx.beginPath();
      gridCtx.moveTo(x * tileSize, 0);
      gridCtx.lineTo(x * tileSize, rows * tileSize);
      gridCtx.stroke();
    }
    for (let y = 0; y <= rows; y += 2) {
      gridCtx.beginPath();
      gridCtx.moveTo(0, y * tileSize);
      gridCtx.lineTo(cols * tileSize, y * tileSize);
      gridCtx.stroke();
    }
  }
}

export function selectTile(arrayIdx, tileIdx) {
  const arr = state.arrays[arrayIdx];
  if (!arr) return;
  tileIdx = Math.max(0, Math.min(tileIdx, arr.tiles.length - 1));

  state.selectedArray = arrayIdx;
  state.selectedTile = tileIdx;

  el.editorPanel.hidden = false;
  el.editorInfo.textContent = `${arr.name} — tile ${tileIdx + 1} / ${arr.tiles.length}`;
  el.tileCounter.textContent = `${tileIdx + 1} / ${arr.tiles.length}`;

  renderTileGrid();
  renderTileZoom();
  updateSourceHighlights();
}
