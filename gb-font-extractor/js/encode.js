// GB 2bpp tile encoding and glyph width extraction

/**
 * Encode an 8x8 tile (values 0-2) into 16 bytes of GB 2bpp format.
 * Magenta (2) is treated as color 0 (light/transparent) in output.
 */
export function encodeTile(tile) {
  const bytes = new Uint8Array(16);
  for (let row = 0; row < 8; row++) {
    let lo = 0, hi = 0;
    for (let col = 0; col < 8; col++) {
      // Map: 0 (light) -> 0, 1 (dark) -> 1, 2 (magenta) -> 0
      const c = tile[row][col] === 1 ? 1 : 0;
      lo |= ((c & 1) << (7 - col));
      hi |= (((c >> 1) & 1) << (7 - col));
    }
    bytes[row * 2] = lo;
    bytes[row * 2 + 1] = hi;
  }
  return bytes;
}

/**
 * Decode 16 bytes of GB 2bpp back into an 8x8 tile.
 * Only colors 0 and 1 are produced (no magenta reconstruction).
 */
export function decodeTile(bytes, offset) {
  const tile = [];
  for (let row = 0; row < 8; row++) {
    const tileRow = [];
    const lo = bytes[offset + row * 2];
    const hi = bytes[offset + row * 2 + 1];
    for (let col = 0; col < 8; col++) {
      const bit = 7 - col;
      const color = ((hi >> bit) & 1) << 1 | ((lo >> bit) & 1);
      // Clamp to 0-1 since font only uses 2 colors
      tileRow.push(color > 1 ? 1 : color);
    }
    tile.push(tileRow);
  }
  return tile;
}

/**
 * Calculate glyph width from tile data by finding the leftmost
 * magenta (color 2) column. If no magenta, width is 8.
 */
export function calcGlyphWidth(tile) {
  let width = 8;
  for (let col = 0; col < 8; col++) {
    for (let row = 0; row < 8; row++) {
      if (tile[row][col] === 2) return col;
    }
  }
  return width;
}

/**
 * Recalculate all glyph widths from tile data.
 */
export function calcAllWidths(tileData) {
  return tileData.map(calcGlyphWidth);
}
