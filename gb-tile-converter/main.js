import { state, FONT_CSS, FIRST_CHAR } from './state.js';
import { el, initDOM } from './dom.js';
import { calcAllWidths, analyze1bpp } from './color.js';
import { onHeaderInput, updateOutput } from './header.js';
import { applyZoom, renderOverview, quantize, updateImageInfo } from './overview.js';
import { loadImageFromBlob, loadImageFile } from './image-io.js';
import { isFontFile, loadFontFile, generateFontTiles } from './font.js';
import { onDragStart, onDragMove, onDragEnd } from './canvas-drag.js';
import { renderTileGrid, setMode, GRID_TILE_SIZE } from './tile-grid.js';
import { renderTileZoom, paintPixel, selectTile, panTile, invertPalette } from './tile-zoom.js';
import { addTile, deleteTile, updateTileNav } from './tile-edit.js';
import { renderSourcePalette, resetSourcePalette, setEditorTab } from './source-palette.js';
import { restoreState, scheduleSave, updateFormatToggle } from './persistence.js';

// ---- Init ----

initDOM();

// ---- Header editing ----

el.headerOutput.addEventListener('input', onHeaderInput);

// ---- Drag to reposition ----

el.overviewCanvas.addEventListener('mousedown', onDragStart);
window.addEventListener('mousemove', onDragMove);
window.addEventListener('mouseup', onDragEnd);
el.overviewCanvas.addEventListener('touchstart', onDragStart, { passive: false });
window.addEventListener('touchmove', onDragMove, { passive: false });
window.addEventListener('touchend', onDragEnd);

// ---- File drop ----

['dragenter', 'dragover'].forEach(evt => {
  el.dropTarget.addEventListener(evt, e => {
    e.preventDefault();
    el.dropOverlay.classList.add('dragover');
    el.dropOverlay.classList.remove('loaded');
  });
});

['dragleave'].forEach(evt => {
  el.dropTarget.addEventListener(evt, e => {
    e.preventDefault();
    el.dropOverlay.classList.remove('dragover');
    if (state.image || state.fontLoaded) el.dropOverlay.classList.add('loaded');
  });
});

el.dropTarget.addEventListener('drop', e => {
  e.preventDefault();
  el.dropOverlay.classList.remove('dragover');
  if (state.image || state.fontLoaded) el.dropOverlay.classList.add('loaded');
  const file = e.dataTransfer.files[0];
  if (file) {
    if (isFontFile(file)) loadFontFile(file);
    else loadImageFile(file);
  }
});

el.dropOverlay.addEventListener('click', () => el.fileInput.click());
el.fileInput.addEventListener('change', () => {
  if (el.fileInput.files[0]) loadImageFile(el.fileInput.files[0]);
  el.fileInput.value = '';
});

// ---- Clipboard paste ----

document.addEventListener('paste', e => {
  if (state.mode !== 'overview') return;
  const items = e.clipboardData && e.clipboardData.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.match(/^image\//)) {
      e.preventDefault();
      const blob = item.getAsFile();
      if (blob) {
        const ext = item.type.replace('image/', '');
        loadImageFromBlob(blob, 'pasted_image_' + ext);
      }
      return;
    }
  }
});

// ---- Reset position ----

el.resetPositionBtn.addEventListener('click', () => {
  state.offsetX = 0;
  state.offsetY = 0;
  state.imageScale = 1;
  state.sourceColors = [];
  state.paletteMapping = [];
  renderOverview();
  quantize({ detect: true });
  renderCharMap();
  renderSourcePalette();
  if (state.mode === 'editor') {
    renderTileGrid();
    renderTileZoom();
  }
});

// ---- Zoom ----

const ZOOM_STEPS = [1, 2, 3, 4, 6, 8];

function setZoom(z) {
  state.zoom = Math.max(1, Math.min(8, z));
  applyZoom();
}

el.zoomInBtn.addEventListener('click', () => {
  const idx = ZOOM_STEPS.indexOf(state.zoom);
  if (idx < ZOOM_STEPS.length - 1) setZoom(ZOOM_STEPS[idx + 1]);
  else setZoom(state.zoom + 1);
});

el.zoomOutBtn.addEventListener('click', () => {
  const idx = ZOOM_STEPS.indexOf(state.zoom);
  if (idx > 0) setZoom(ZOOM_STEPS[idx - 1]);
  else setZoom(state.zoom - 1);
});

el.zoomFitBtn.addEventListener('click', () => {
  setZoom(1);
});

el.dropTarget.addEventListener('wheel', e => {
  if (!state.image) return;
  e.preventDefault();
  if (e.deltaY < 0) el.zoomInBtn.click();
  else el.zoomOutBtn.click();
}, { passive: false });

// ---- Mode switching ----

el.overviewModeBtn.addEventListener('click', () => setMode('overview'));
el.tileEditModeBtn.addEventListener('click', () => {
  if (!state.tileData.length) return;
  setMode('editor');
  renderSourcePalette();
});

el.sourcePaletteReset.addEventListener('click', resetSourcePalette);
el.tabPixels.addEventListener('click', () => setEditorTab('pixels'));
el.tabColours.addEventListener('click', () => setEditorTab('colours'));

// ---- Tile grid click ----

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
  if (idx >= 0 && idx < state.tileData.length) {
    state.selectedTile = idx;
    renderTileGrid();
    renderTileZoom();
    updateTileNav();
    renderCharMap();
  }
});

// ---- Tile zoom painting ----

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

// ---- Tile navigation buttons ----

el.addTileBtn.addEventListener('click', addTile);
el.deleteTileBtn.addEventListener('click', deleteTile);

el.prevTileBtn.addEventListener('click', () => {
  if (state.selectedTile > 0) {
    state.selectedTile--;
    renderTileGrid();
    renderTileZoom();
    updateTileNav();
    renderCharMap();
  }
});

el.nextTileBtn.addEventListener('click', () => {
  if (state.selectedTile < state.tileData.length - 1) {
    state.selectedTile++;
    renderTileGrid();
    renderTileZoom();
    updateTileNav();
    renderCharMap();
  }
});

// ---- Keyboard navigation ----

document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.target.isContentEditable) return;

  // Overview mode: arrow keys nudge image, =/- scale image in canvas
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
      case '0':
        state.imageScale = 1;
        break;
      default: handled = false;
    }
    if (handled) {
      e.preventDefault();
      renderOverview();
      quantize();
      renderCharMap();
      return;
    }
  }

  // Tile editor mode
  if (state.mode !== 'editor') return;

  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    deleteTile();
    return;
  }

  if (e.key === 'a') {
    e.preventDefault();
    addTile();
    return;
  }

  if (e.key === 'i') {
    e.preventDefault();
    invertPalette();
    return;
  }

  if (!state.tileData.length) return;

  // Shift+arrow: pan pixel data within the selected tile
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
    case 'ArrowLeft':
      e.preventDefault();
      if (curX > 0) selectTile(cur - 1);
      break;
    case 'ArrowRight':
      e.preventDefault();
      if (curX < cols - 1) selectTile(cur + 1);
      break;
    case 'ArrowUp':
      e.preventDefault();
      if (curY > 0) selectTile(cur - cols);
      break;
    case 'ArrowDown':
      e.preventDefault();
      if (curY < state.tilesY - 1) selectTile(cur + cols);
      break;
    case '1': case '2': case '3': case '4': {
      const c = parseInt(e.key) - 1;
      if (state.fontMode && c > 2) break;
      state.selectedColor = c;
      el.paletteButtons.forEach(b => b.classList.toggle('active', parseInt(b.dataset.color) === c));
      break;
    }
  }
});

// ---- Palette ----

el.paletteButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    state.selectedColor = parseInt(btn.dataset.color);
    el.paletteButtons.forEach(b => b.classList.toggle('active', b === btn));
  });
});

// ---- Variable name ----

el.varName.addEventListener('input', () => {
  state.varName = el.varName.value.replace(/[^a-zA-Z0-9_]/g, '_') || 'tile_data';
  updateOutput();
});

// ---- Cluster ----

el.clusterW.addEventListener('input', () => {
  state.clusterW = Math.max(1, parseInt(el.clusterW.value) || 1);
  updateOutput();
});

el.clusterH.addEventListener('input', () => {
  state.clusterH = Math.max(1, parseInt(el.clusterH.value) || 1);
  updateOutput();
});

// ---- TileMap toggle ----

el.tileMapToggle.addEventListener('change', () => {
  state.tileMap = el.tileMapToggle.checked;
  applyTileMapMode();
  updateOutput();
  updateImageInfo();
});

function applyTileMapMode() {
  // Cluster ordering has no meaning when tiles are deduplicated.
  clusterLabel.hidden = state.tileMap || state.fontMode;
  // Flat/grouped formatting is replaced by a fixed layout in TileMap or 1bpp mode.
  el.formatToggleBtn.hidden = state.tileMap || state.fontMode || state.bpp1;
}

// ---- Output options popover positioning ----

el.optionsPopover.addEventListener('beforetoggle', e => {
  if (e.newState !== 'open') return;
  const rect = el.optionsBtn.getBoundingClientRect();
  el.optionsPopover.style.top = `${rect.bottom + 4}px`;
  el.optionsPopover.style.left = `${rect.left}px`;
  // After the popover renders, nudge it back if it overflows the right edge.
  requestAnimationFrame(() => {
    const pr = el.optionsPopover.getBoundingClientRect();
    const overflow = pr.right - (window.innerWidth - 8);
    if (overflow > 0) {
      el.optionsPopover.style.left = `${Math.max(8, rect.left - overflow)}px`;
    }
  });
});

// ---- 1bpp toggle ----

function validate1bpp() {
  const { badTiles } = analyze1bpp(state.tileData);
  if (badTiles.length) {
    const list = badTiles.length > 20
      ? badTiles.slice(0, 20).join(', ') + `, … (+${badTiles.length - 20} more)`
      : badTiles.join(', ');
    alert(`1bpp output requires no more than 2 distinct colors across the tile set.\n\nTile${badTiles.length === 1 ? '' : 's'} introducing extra colors: ${list}`);
    return false;
  }
  return true;
}

el.bpp1Toggle.addEventListener('change', () => {
  if (el.bpp1Toggle.checked && !validate1bpp()) {
    el.bpp1Toggle.checked = false;
    return;
  }
  state.bpp1 = el.bpp1Toggle.checked;
  applyTileMapMode();
  updateOutput();
});

// ---- Format toggle ----

el.formatToggleBtn.addEventListener('click', () => {
  state.outputFormat = state.outputFormat === 'grouped' ? 'flat' : 'grouped';
  updateFormatToggle();
  updateOutput();
});

updateFormatToggle();

// ---- VWF (Variable Width Font) mode ----

const tileNavHint = document.querySelector('.tile-nav-hint');
const clusterLabel = document.querySelector('.cluster-label');

function renderCharMap() {
  el.fontCharMap.innerHTML = '';
  if (!state.fontMode || !state.tileData.length) {
    el.charMapWrap.hidden = true;
    return;
  }
  el.charMapWrap.hidden = false;

  for (let i = 0; i < state.tileData.length; i++) {
    const code = FIRST_CHAR + i;
    const ch = String.fromCharCode(code);
    const cell = document.createElement('div');
    cell.className = 'char-cell' + (i === state.selectedTile ? ' selected' : '');
    cell.title = code === 32 ? 'Space (0x20)' : `${ch} (0x${code.toString(16).toUpperCase()})`;

    const cvs = document.createElement('canvas');
    cvs.width = 8;
    cvs.height = 8;
    const ctx = cvs.getContext('2d');
    const tile = state.tileData[i];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        ctx.fillStyle = FONT_CSS[tile[r][c]];
        ctx.fillRect(c, r, 1, 1);
      }
    }
    cell.appendChild(cvs);

    cell.addEventListener('click', () => {
      state.selectedTile = i;
      renderCharMap();
      if (state.mode === 'editor') {
        renderTileGrid();
        renderTileZoom();
        updateTileNav();
      }
    });

    el.fontCharMap.appendChild(cell);
  }
}

function applyFontMode() {
  const on = state.fontMode;

  // Toggle visibility of font-only vs tile-only controls
  el.glyphInfo.hidden = !on;
  clusterLabel.hidden = on || state.tileMap;
  el.formatToggleBtn.hidden = on || state.tileMap;
  el.tileMapToggle.parentElement.hidden = on;
  el.bpp1Toggle.parentElement.hidden = on;

  // Update palette buttons: show 3 in font mode, 4 in tile mode
  el.paletteButtons.forEach(btn => {
    const c = parseInt(btn.dataset.color);
    if (on) {
      btn.hidden = c === 3;
      btn.style.background = c < 3 ? FONT_CSS[c] : '';
      btn.title = c === 0 ? 'Light (bg)' : c === 1 ? 'Dark (ink)' : 'Magenta (width marker)';
    } else {
      btn.hidden = false;
      btn.style.background = '';
      btn.title = c === 0 ? 'White' : c === 1 ? 'Light' : c === 2 ? 'Dark' : 'Black';
    }
  });

  // Fix selected color if out of range
  if (on && state.selectedColor > 2) {
    state.selectedColor = 1;
  }
  el.paletteButtons.forEach(b =>
    b.classList.toggle('active', parseInt(b.dataset.color) === state.selectedColor)
  );

  // Update keyboard hint
  if (tileNavHint) {
    tileNavHint.innerHTML = on
      ? '<kbd>&larr;</kbd><kbd>&rarr;</kbd><kbd>&uarr;</kbd><kbd>&darr;</kbd> navigate &middot; <kbd>Shift</kbd>+arrows pan tile &middot; <kbd>1</kbd>-<kbd>3</kbd> colour &middot; <kbd>Del</kbd> remove &middot; <kbd>a</kbd> add tile'
      : '<kbd>&larr;</kbd><kbd>&rarr;</kbd><kbd>&uarr;</kbd><kbd>&darr;</kbd> navigate &middot; <kbd>Shift</kbd>+arrows pan tile &middot; <kbd>1</kbd>-<kbd>4</kbd> colour &middot; <kbd>Del</kbd> remove &middot; <kbd>a</kbd> add tile';
  }

  // Compute glyph widths if switching to font mode with existing tiles
  if (on && state.tileData.length && !state.glyphWidths.length) {
    state.glyphWidths = calcAllWidths(state.tileData);
  }

  // Re-quantize if image loaded (palette changed)
  if (state.image) {
    renderOverview();
    quantize();
  }

  renderCharMap();
  renderSourcePalette();
  renderTileGrid();
  if (state.tileData.length) renderTileZoom();
  updateTileNav();
  updateOutput();
}

el.fontModeToggle.addEventListener('change', () => {
  const wantFont = el.fontModeToggle.checked;

  // Warn when turning OFF font mode if any tile uses magenta (width markers)
  if (!wantFont && state.tileData.length) {
    const hasMagenta = state.tileData.some(tile =>
      tile.some(row => row.includes(2))
    );
    if (hasMagenta && !confirm('Tiles contain width markers (magenta). Switching off VWF mode will lose this information. Continue?')) {
      el.fontModeToggle.checked = true;
      return;
    }
  }

  state.fontMode = wantFont;
  applyFontMode();
});

// ---- Copy ----

el.copyOutputBtn.addEventListener('click', async () => {
  const text = el.headerOutput.innerText;
  try {
    await navigator.clipboard.writeText(text);
    el.copyOutputBtn.textContent = 'Copied!';
    setTimeout(() => { el.copyOutputBtn.textContent = 'Copy'; }, 1500);
  } catch {
    // Fallback
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    el.copyOutputBtn.textContent = 'Copied!';
    setTimeout(() => { el.copyOutputBtn.textContent = 'Copy'; }, 1500);
  }
});

// ---- Font control event listeners ----

el.loadFontLink.addEventListener('click', e => {
  e.preventDefault();
  e.stopPropagation();
  el.fontInput.click();
});

el.fontInput.addEventListener('change', () => {
  if (el.fontInput.files[0]) loadFontFile(el.fontInput.files[0]);
  el.fontInput.value = '';
});

el.fontSize.addEventListener('input', () => {
  state.fontSize = parseFloat(el.fontSize.value);
  el.fontSizeVal.textContent = state.fontSize;
  generateFontTiles();
});

el.fontBold.addEventListener('change', () => {
  state.fontBold = el.fontBold.checked;
  generateFontTiles();
});

// ---- Persistence ----

new MutationObserver(scheduleSave).observe(el.headerOutput, { childList: true, characterData: true, subtree: true });
document.addEventListener('mouseup', scheduleSave);
document.addEventListener('keyup', scheduleSave);

// ---- Start ----

el.overviewCanvas.style.cursor = 'default';
restoreState();
if (state.fontMode) applyFontMode();
applyTileMapMode();
updateImageInfo();
renderSourcePalette();
