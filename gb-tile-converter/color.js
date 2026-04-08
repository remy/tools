import { DMG, FONT_PALETTE } from './state.js';

export function rgbToDmg(r, g, b, a) {
  if (a < 128) return 0;
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < 4; i++) {
    const dr = r - DMG[i].r;
    const dg = g - DMG[i].g;
    const db = b - DMG[i].b;
    const d = dr * dr + dg * dg + db * db;
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return best;
}

export function rgbToFont(r, g, b, a) {
  if (a < 128) return 0;
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < 3; i++) {
    const dr = r - FONT_PALETTE[i].r;
    const dg = g - FONT_PALETTE[i].g;
    const db = b - FONT_PALETTE[i].b;
    const d = dr * dr + dg * dg + db * db;
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return best;
}

export function encodeTile(tile) {
  const bytes = new Uint8Array(16);
  for (let row = 0; row < 8; row++) {
    let lo = 0, hi = 0;
    for (let col = 0; col < 8; col++) {
      const c = tile[row][col];
      lo |= ((c & 1) << (7 - col));
      hi |= (((c >> 1) & 1) << (7 - col));
    }
    bytes[row * 2] = lo;
    bytes[row * 2 + 1] = hi;
  }
  return bytes;
}

export function decodeTile(bytes, offset) {
  const tile = [];
  for (let row = 0; row < 8; row++) {
    const tileRow = [];
    const lo = bytes[offset + row * 2];
    const hi = bytes[offset + row * 2 + 1];
    for (let col = 0; col < 8; col++) {
      const bit = 7 - col;
      const color = ((hi >> bit) & 1) << 1 | ((lo >> bit) & 1);
      tileRow.push(color);
    }
    tile.push(tileRow);
  }
  return tile;
}

// Font-mode encode: magenta (2) → color 0 in output
export function encodeTileFont(tile) {
  const bytes = new Uint8Array(16);
  for (let row = 0; row < 8; row++) {
    let lo = 0, hi = 0;
    for (let col = 0; col < 8; col++) {
      const c = tile[row][col] === 1 ? 1 : 0;
      lo |= ((c & 1) << (7 - col));
      hi |= (((c >> 1) & 1) << (7 - col));
    }
    bytes[row * 2] = lo;
    bytes[row * 2 + 1] = hi;
  }
  return bytes;
}

// Font-mode decode: clamp to 0-1 (no magenta reconstruction)
export function decodeTileFont(bytes, offset) {
  const tile = [];
  for (let row = 0; row < 8; row++) {
    const tileRow = [];
    const lo = bytes[offset + row * 2];
    const hi = bytes[offset + row * 2 + 1];
    for (let col = 0; col < 8; col++) {
      const bit = 7 - col;
      const color = ((hi >> bit) & 1) << 1 | ((lo >> bit) & 1);
      tileRow.push(color > 1 ? 1 : color);
    }
    tile.push(tileRow);
  }
  return tile;
}

// Find glyph width by scanning for first magenta column
export function calcGlyphWidth(tile) {
  for (let col = 0; col < 8; col++) {
    for (let row = 0; row < 8; row++) {
      if (tile[row][col] === 2) return col;
    }
  }
  return 8;
}

export function calcAllWidths(tileData) {
  return tileData.map(calcGlyphWidth);
}
