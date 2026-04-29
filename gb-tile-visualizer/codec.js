// ---- 2BPP & 1BPP Encoding/Decoding ----

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

// 1BPP: 8 bytes per tile, one byte per row, MSB = leftmost pixel.
// Bit 0 → DMG color 0 (lightest), bit 1 → DMG color 3 (darkest) for contrast.
export function encode1bppTile(tile) {
  const bytes = new Uint8Array(8);
  for (let row = 0; row < 8; row++) {
    let b = 0;
    for (let col = 0; col < 8; col++) {
      if (tile[row][col]) b |= (1 << (7 - col));
    }
    bytes[row] = b;
  }
  return bytes;
}

export function decode1bppTile(bytes, offset) {
  const tile = [];
  for (let row = 0; row < 8; row++) {
    const tileRow = [];
    const b = bytes[offset + row];
    for (let col = 0; col < 8; col++) {
      tileRow.push(((b >> (7 - col)) & 1) ? 3 : 0);
    }
    tile.push(tileRow);
  }
  return tile;
}
