// ---- Entry Point ----
import { state } from './state.js';
import { el, initDOM } from './dom.js';
import { selectTile, tileGridPosition, renderTileGrid } from './tile-grid.js';
import { paintPixel, panTile } from './tile-zoom.js';
import { loadFile, loadSource, handleCopy, handleDownload, handleReset } from './file-io.js';

initDOM();

// ---- Drop zone ----
el.dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  el.dropZone.classList.add('drag-over');
});
el.dropZone.addEventListener('dragleave', () => {
  el.dropZone.classList.remove('drag-over');
});
el.dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  el.dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) loadFile(file);
});
el.fileInput.addEventListener('change', () => {
  if (el.fileInput.files[0]) loadFile(el.fileInput.files[0]);
});

// Also support drop on the whole page when app is visible
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => {
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  if (file) loadFile(file);
});

// ---- Toolbar buttons ----
el.copyBtn.addEventListener('click', handleCopy);
el.downloadBtn.addEventListener('click', handleDownload);
el.resetBtn.addEventListener('click', handleReset);

// ---- Tile grid click ----
el.tileGridCanvas.addEventListener('click', (e) => {
  const arr = state.arrays[state.selectedArray];
  if (!arr) return;
  const count = arr.tiles.length;
  const rect = el.tileGridCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const scale = 2;
  const tileSize = 8 * scale;
  const scaleX = el.tileGridCanvas.width / rect.width;
  const scaleY = el.tileGridCanvas.height / rect.height;
  const col = Math.floor((x * scaleX) / tileSize);
  const row = Math.floor((y * scaleY) / tileSize);

  let idx;
  if (state.cluster2x2) {
    const clusterCols = Math.min(Math.ceil(count / 4), 8);
    const cx = Math.floor(col / 2);
    const cy = Math.floor(row / 2);
    const ix = col % 2;
    const iy = row % 2;
    idx = (cy * clusterCols + cx) * 4 + iy * 2 + ix;
  } else {
    const cols = Math.min(count, 16);
    idx = row * cols + col;
  }
  if (idx >= 0 && idx < count) {
    selectTile(state.selectedArray, idx);
  }
});

// ---- Zoom canvas painting ----
el.tileZoomCanvas.addEventListener('mousedown', (e) => {
  e.preventDefault();
  state.painting = true;
  paintPixel(e);
});
el.tileZoomCanvas.addEventListener('mousemove', (e) => {
  if (state.painting) paintPixel(e);
});
window.addEventListener('mouseup', () => { state.painting = false; });

// Touch support for zoom canvas
el.tileZoomCanvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  state.painting = true;
  paintPixel(e);
});
el.tileZoomCanvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  if (state.painting) paintPixel(e);
});
el.tileZoomCanvas.addEventListener('touchend', () => { state.painting = false; });

// ---- Cluster toggle ----
el.clusterToggle.addEventListener('change', () => {
  state.cluster2x2 = el.clusterToggle.checked;
  renderTileGrid();
});

// ---- Palette buttons ----
document.querySelectorAll('.palette-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    state.selectedColor = parseInt(btn.dataset.color);
    document.querySelectorAll('.palette-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

// ---- Navigation buttons ----
el.prevTileBtn.addEventListener('click', () => {
  if (state.selectedTile > 0) {
    selectTile(state.selectedArray, state.selectedTile - 1);
  } else if (state.selectedArray > 0) {
    // Jump to previous array, last tile
    const prevArr = state.arrays[state.selectedArray - 1];
    selectTile(state.selectedArray - 1, prevArr.tiles.length - 1);
  }
});

el.nextTileBtn.addEventListener('click', () => {
  const arr = state.arrays[state.selectedArray];
  if (!arr) return;
  if (state.selectedTile < arr.tiles.length - 1) {
    selectTile(state.selectedArray, state.selectedTile + 1);
  } else if (state.selectedArray < state.arrays.length - 1) {
    // Jump to next array, first tile
    selectTile(state.selectedArray + 1, 0);
  }
});

// ---- Keyboard shortcuts ----
document.addEventListener('keydown', (e) => {
  if (el.app.hidden) return;

  // Color selection: 1-4
  if (e.key >= '1' && e.key <= '4' && !e.ctrlKey && !e.metaKey) {
    const colorIdx = parseInt(e.key) - 1;
    state.selectedColor = colorIdx;
    document.querySelectorAll('.palette-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`.palette-btn[data-color="${colorIdx}"]`).classList.add('active');
    return;
  }

  // Shift+arrow: pan pixel data within the selected tile
  if (e.shiftKey && e.key.startsWith('Arrow')) {
    if (!el.editorPanel.hidden) {
      e.preventDefault();
      const dx = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
      const dy = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
      panTile(dx, dy);
    }
    return;
  }

  // Tile navigation: arrow keys
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    if (!el.editorPanel.hidden) {
      e.preventDefault();
      const delta = e.key === 'ArrowLeft' ? -1 : 1;
      const arr = state.arrays[state.selectedArray];
      if (arr) {
        const newIdx = state.selectedTile + delta;
        if (newIdx >= 0 && newIdx < arr.tiles.length) {
          selectTile(state.selectedArray, newIdx);
        }
      }
    }
  }

  // Array navigation: [ and ]
  if (e.key === '[' && state.selectedArray > 0) {
    selectTile(state.selectedArray - 1, 0);
  }
  if (e.key === ']' && state.selectedArray < state.arrays.length - 1) {
    selectTile(state.selectedArray + 1, 0);
  }
});

// ---- Paste support ----
document.addEventListener('paste', (e) => {
  const text = e.clipboardData.getData('text');
  if (text && text.length > 10) {
    e.preventDefault();
    loadSource(text, 'pasted.c');
  }
});
