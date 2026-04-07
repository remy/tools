import { state, DMG_CSS } from './state.js';
import { el } from './dom.js';
import { resizeOverviewCanvas, renderOverview, quantize } from './overview.js';
import { renderTileGrid } from './tile-grid.js';
import { renderTileZoom } from './tile-zoom.js';
import { updateTileNav } from './tile-edit.js';

export const FONT_CHARS = Array.from({ length: 96 }, (_, i) => String.fromCharCode(32 + i));
const FONT_EXTENSIONS = /\.(ttf|otf|woff2?|TTF|OTF|WOFF2?)$/;
let fontFaceCounter = 0;

export function isFontFile(file) {
  return FONT_EXTENSIONS.test(file.name);
}

export async function loadFontFile(file) {
  try {
    const buffer = await file.arrayBuffer();
    const familyName = `gb-font-${++fontFaceCounter}`;
    const fontFace = new FontFace(familyName, buffer);
    await fontFace.load();
    document.fonts.add(fontFace);

    state.fontLoaded = true;
    state.fontFamily = familyName;
    state.image = null;
    state.imageFileName = file.name.replace(/\.\w+$/, '');

    el.varName.value = state.imageFileName.replace(/[^a-zA-Z0-9_]/g, '_') || 'font_data';
    state.varName = el.varName.value;

    el.fontControls.hidden = false;
    el.dropOverlay.classList.add('loaded');
    el.resetPositionBtn.hidden = true;

    generateFontTiles();
  } catch (err) {
    console.error('Failed to load font:', err);
  }
}

/**
 * Renders a pixel font glyph sheet onto a canvas.
 * @param {object} opts
 * @param {string} opts.fontFamily  - CSS font-family name (already loaded)
 * @param {number} opts.nativeSize  - The font's designed pixel size
 * @param {number} [opts.scale=1]   - Integer multiplier for output pixels
 * @param {number} [opts.cols=16]   - Columns per row
 * @param {number} [opts.cellW=8]   - Cell width in native pixels
 * @param {number} [opts.cellH=cellW] - Cell height in native pixels
 * @param {string} [opts.fg='#000'] - Foreground colour
 * @param {string} [opts.bg='#fff'] - Background colour
 * @returns {{ canvas: HTMLCanvasElement, cellW: number, cellH: number, rows: number }}
 */
export function renderPixelFontSheet(opts) {
  const {
    fontFamily,
    nativeSize,
    scale = 1,
    cols = 16,
    cellW = 8,
    cellH = cellW,
    fg = '#000',
    bg = '#fff',
  } = opts;

  const chars = FONT_CHARS;
  const rows = Math.ceil(chars.length / cols);

  function getGlyphBounds(char) {
    const c = document.createElement('canvas');
    const w = nativeSize * 2;
    const h = nativeSize * 2;
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    ctx.font = `${nativeSize}px ${fontFamily}`;
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'top';
    ctx.fillText(char, 0, 0);
    const data = ctx.getImageData(0, 0, w, h);

    let minX = w, maxX = 0, minY = h, maxY = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (data.data[(y * w + x) * 4] > 128) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < minX) return null;
    return { minX, maxX, minY, maxY, data, w };
  }

  function extractGlyph(bounds, globalMinY, cellH) {
    const cell = [];
    for (let y = 0; y < cellH; y++) cell.push(new Uint8Array(cellW));
    if (!bounds) return cell;
    const { minX, maxX, minY, maxY, data, w } = bounds;
    // shift glyph up if its bottom overflows the cell
    const bottom = maxY - globalMinY;
    const shift = Math.max(0, bottom - (cellH - 1));
    for (let y = minY; y <= maxY; y++) {
      const dy = y - globalMinY - shift;
      if (dy < 0 || dy >= cellH) continue;
      for (let x = minX; x <= maxX; x++) {
        const dx = x - minX;
        if (dx >= cellW) break;
        if (data.data[(y * w + x) * 4] > 128) cell[dy][dx] = 1;
      }
    }
    return cell;
  }

  // -- pass 1: measure --
  const allBounds = {};
  let globalMinY = Infinity, globalMaxY = 0;
  for (const ch of chars) {
    const b = getGlyphBounds(ch);
    allBounds[ch] = b;
    if (b) {
      if (b.minY < globalMinY) globalMinY = b.minY;
      if (b.maxY > globalMaxY) globalMaxY = b.maxY;
    }
  }
  if (globalMinY === Infinity) globalMinY = 0;

  // -- pass 2: render --
  const canvas = document.createElement('canvas');
  canvas.width = cols * cellW * scale;
  canvas.height = rows * cellH * scale;
  const ctx = canvas.getContext('2d');
  if (bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  for (let idx = 0; idx < chars.length; idx++) {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const pixels = extractGlyph(allBounds[chars[idx]], globalMinY, cellH);
    const ox = col * cellW;
    const oy = row * cellH;
    for (let y = 0; y < cellH; y++) {
      for (let x = 0; x < cellW; x++) {
        if (pixels[y][x]) {
          ctx.fillStyle = fg;
          ctx.fillRect((ox + x) * scale, (oy + y) * scale, scale, scale);
        }
      }
    }
  }

  return { canvas, cellW, cellH, rows };
}

export function generateFontTiles() {
  if (!state.fontLoaded) return;

  const fontSize = state.fontSize;
  const bold = state.fontBold ? 'bold ' : '';

  // Render the full glyph sheet at 1x scale
  const { canvas: sheetCanvas, cellW, cellH } = renderPixelFontSheet({
    fontFamily: `${bold}"${state.fontFamily}"`,
    nativeSize: fontSize,
    scale: 1,
    cols: 16,
    cellW: 8,
    fg: DMG_CSS[3],
    bg: DMG_CSS[0],
  });

  // Convert the sheet canvas to an Image and feed it into the
  // existing image pipeline (same as dropping an image)
  const dataUrl = sheetCanvas.toDataURL('image/png');
  const img = new Image();
  img.onload = () => {
    state.image = img;
    state.offsetX = 0;
    state.offsetY = 0;
    state.imageScale = 1;
    resizeOverviewCanvas();
    renderOverview();
    quantize();
    el.dropOverlay.classList.add('loaded');
    el.resetPositionBtn.hidden = false;
    el.zoomControls.hidden = false;
    el.tileEditModeBtn.disabled = false;
    el.imageInfo.textContent = `${FONT_CHARS.length} characters — ${state.tilesX}×${state.tilesY} tiles (cell ${cellW}×${cellH})`;

    renderFontCharMap();
    renderFontDebug(fontSize, bold, cellW, cellH);

    if (state.mode === 'editor') {
      renderTileGrid();
      renderTileZoom();
    }
    updateTileNav();
  };
  img.src = dataUrl;
}

export function renderFontCharMap() {
  el.fontCharMap.innerHTML = '';
  for (let i = 0; i < FONT_CHARS.length; i++) {
    const cell = document.createElement('div');
    cell.className = 'char-cell' + (i === state.selectedTile ? ' selected' : '');
    cell.title = FONT_CHARS[i] === ' ' ? 'Space (0x20)' : `${FONT_CHARS[i]} (0x${(32 + i).toString(16).toUpperCase()})`;

    const cvs = document.createElement('canvas');
    cvs.width = 8;
    cvs.height = 8;
    const ctx = cvs.getContext('2d');
    const tile = state.tileData[i];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        ctx.fillStyle = DMG_CSS[tile[r][c]];
        ctx.fillRect(c, r, 1, 1);
      }
    }
    cell.appendChild(cvs);

    cell.addEventListener('click', () => {
      state.selectedTile = i;
      renderFontCharMap();
      if (state.mode === 'editor') {
        renderTileGrid();
        renderTileZoom();
        updateTileNav();
      }
    });

    el.fontCharMap.appendChild(cell);
  }
}

export function renderFontDebug(fontSize, bold, cellW, cellH) {
  el.fontDebugPanel.hidden = false;
  el.fontDebugInfo.innerHTML = `<strong>${bold}${fontSize}px</strong> — cell ${cellW}×${cellH}`;

  el.fontDebugHtmlWrap.innerHTML = '';
  const glyphScale = 4;
  const grid = document.createElement('div');
  grid.className = 'font-debug-grid';

  for (let i = 0; i < FONT_CHARS.length; i++) {
    const cell = document.createElement('div');
    cell.className = 'glyph-cell';
    cell.style.width = (fontSize * glyphScale) + 'px';
    cell.style.height = (fontSize * glyphScale) + 'px';

    const span = document.createElement('span');
    span.style.fontFamily = `"${state.fontFamily}"`;
    span.style.fontSize = fontSize + 'px';
    span.style.lineHeight = '1';
    span.style.display = 'block';
    span.style.width = fontSize + 'px';
    span.style.height = fontSize + 'px';
    span.style.transformOrigin = 'top left';
    span.style.transform = `scale(${glyphScale})`;
    if (state.fontBold) span.style.fontWeight = 'bold';
    span.textContent = FONT_CHARS[i] === ' ' ? '\u00A0' : FONT_CHARS[i];

    cell.appendChild(span);
    grid.appendChild(cell);
  }

  el.fontDebugHtmlWrap.appendChild(grid);
}
