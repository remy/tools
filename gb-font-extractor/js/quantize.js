import { PALETTE, PALETTE_CSS } from './constants.js';
import { state } from './state.js';
import { el } from './dom.js';
import { calcAllWidths } from './encode.js';

/**
 * Map an RGB(A) pixel to the nearest palette index (0=light, 1=dark, 2=magenta).
 */
function rgbToFont(r, g, b, a) {
  if (a < 128) return 0;
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < PALETTE.length; i++) {
    const dr = r - PALETTE[i].r;
    const dg = g - PALETTE[i].g;
    const db = b - PALETTE[i].b;
    const d = dr * dr + dg * dg + db * db;
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return best;
}

/**
 * Sample the overview canvas and extract 8x8 tiles + glyph widths.
 */
export function quantize() {
  if (!state.image) return;
  const w = state.canvasW;
  const h = state.canvasH;

  const tmp = document.createElement('canvas');
  tmp.width = w;
  tmp.height = h;
  const ctx = tmp.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = PALETTE_CSS[0];
  ctx.fillRect(0, 0, w, h);
  const sc = state.imageScale;
  ctx.drawImage(state.image, state.offsetX, state.offsetY,
    state.image.naturalWidth * sc, state.image.naturalHeight * sc);
  const imgData = ctx.getImageData(0, 0, w, h);
  const pixels = imgData.data;

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
          tileRow.push(rgbToFont(pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]));
        }
        tile.push(tileRow);
      }
      state.tileData.push(tile);
    }
  }

  state.glyphWidths = calcAllWidths(state.tileData);

  if (state.selectedTile >= state.tileData.length) {
    state.selectedTile = 0;
  }
}
