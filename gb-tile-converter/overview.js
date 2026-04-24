import { state, DMG_CSS, FONT_CSS } from './state.js';
import { el, ovCtx } from './dom.js';
import { rgbToFont, rgbToDmgMapped, detectDominantColors, defaultPaletteMapping, calcAllWidths } from './color.js';
import { dedupeTiles } from './dedupe.js';
import { updateOutput } from './header.js';

export function updateImageInfo() {
  if (!state.image) {
    el.imageInfo.textContent = '';
    return;
  }
  const img = state.image;
  let info = `${img.naturalWidth}×${img.naturalHeight}px — ${state.tilesX}×${state.tilesY} tiles`;
  if (state.imageScale !== 1) {
    info += ` — scale ${state.imageScale.toFixed(1)}x`;
  }
  if (!state.fontMode && state.tileData.length) {
    const { uniqueTiles } = dedupeTiles(state.tileData);
    info += ` — ${uniqueTiles.length} unique`;
  }
  el.imageInfo.textContent = info;
}

export function resizeOverviewCanvas() {
  if (!state.image) return;
  const img = state.image;
  let w = img.naturalWidth;
  let h = img.naturalHeight;
  w = Math.ceil(w / 8) * 8;
  h = Math.ceil(h / 8) * 8;
  w = Math.max(w, 8);
  h = Math.max(h, 8);
  state.canvasW = w;
  state.canvasH = h;
  el.overviewCanvas.width = w;
  el.overviewCanvas.height = h;
  applyZoom();
}

export function applyZoom() {
  const z = state.zoom;
  el.overviewCanvas.style.width = (state.canvasW * z) + 'px';
  el.overviewCanvas.style.height = (state.canvasH * z) + 'px';
  el.zoomLevel.textContent = z + 'x';
}

export function renderOverview() {
  const w = state.canvasW;
  const h = state.canvasH;
  const palette = state.fontMode ? FONT_CSS : DMG_CSS;
  ovCtx.fillStyle = palette[0];
  ovCtx.fillRect(0, 0, w, h);

  if (state.image) {
    const s = state.imageScale;
    const sw = state.image.naturalWidth * s;
    const sh = state.image.naturalHeight * s;
    ovCtx.drawImage(state.image, state.offsetX, state.offsetY, sw, sh);
  }

  // Grid overlay
  ovCtx.strokeStyle = 'rgba(0, 0, 0, 0.18)';
  ovCtx.lineWidth = 0.5;
  ovCtx.beginPath();
  for (let x = 0; x <= w; x += 8) {
    ovCtx.moveTo(x, 0);
    ovCtx.lineTo(x, h);
  }
  for (let y = 0; y <= h; y += 8) {
    ovCtx.moveTo(0, y);
    ovCtx.lineTo(w, y);
  }
  ovCtx.stroke();
}

export function quantize({ detect = false } = {}) {
  if (!state.image) return;
  const w = state.canvasW;
  const h = state.canvasH;
  // Draw image to a temp canvas at positioned offset to sample pixels.
  // Leave uncovered areas transparent so they quantize to DMG 0 (white) via alpha.
  const tmpCanvas = document.createElement('canvas');
  tmpCanvas.width = w;
  tmpCanvas.height = h;
  const tmpCtx = tmpCanvas.getContext('2d', { willReadFrequently: true });
  if (state.fontMode) {
    tmpCtx.fillStyle = FONT_CSS[0];
    tmpCtx.fillRect(0, 0, w, h);
  }
  const sc = state.imageScale;
  tmpCtx.drawImage(state.image, state.offsetX, state.offsetY, state.image.naturalWidth * sc, state.image.naturalHeight * sc);
  const imgData = tmpCtx.getImageData(0, 0, w, h);
  const pixels = imgData.data;

  if (!state.fontMode && (detect || !state.sourceColors.length)) {
    state.sourceColors = detectDominantColors(pixels, 4);
    state.paletteMapping = defaultPaletteMapping(state.sourceColors);
  }

  state.tilesX = w / 8;
  state.tilesY = h / 8;
  state.tileData = [];

  for (let ty = 0; ty < state.tilesY; ty++) {
    for (let tx = 0; tx < state.tilesX; tx++) {
      const tile = [];
      for (let row = 0; row < 8; row++) {
        const tileRow = [];
        for (let col = 0; col < 8; col++) {
          const px = (ty * 8 + row) * w + (tx * 8 + col);
          const i = px * 4;
          const c = state.fontMode
            ? rgbToFont(pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3])
            : rgbToDmgMapped(pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3], state.sourceColors, state.paletteMapping);
          tileRow.push(c);
        }
        tile.push(tileRow);
      }
      state.tileData.push(tile);
    }
  }

  if (state.fontMode) {
    state.glyphWidths = calcAllWidths(state.tileData);
  }

  if (state.selectedTile >= state.tileData.length) {
    state.selectedTile = 0;
  }

  updateOutput();
  updateImageInfo();
}
