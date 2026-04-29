// ---- Update Source from Tile Edit ----
import { state } from './state.js';
import { el } from './dom.js';
import { encodeTile, encode1bppTile } from './codec.js';
import { scanSource } from './scanner.js';
import { renderSource } from './source-view.js';
import { drawTileToCanvas } from './tile-grid.js';

export function updateSourceFromTile(arrayIdx, tileIdx) {
  const arr = state.arrays[arrayIdx];
  const tile = arr.tiles[tileIdx];

  let newValues;
  let startVal, valCount;

  if (arr.mode === '2bpp') {
    const encoded = encodeTile(tile);
    if (arr.wide) {
      // 16-bit: combine lo/hi byte pairs into 16-bit values
      startVal = tileIdx * 8;
      valCount = 8;
      newValues = [];
      for (let r = 0; r < 8; r++) {
        newValues.push(encoded[r * 2] | (encoded[r * 2 + 1] << 8));
      }
    } else {
      startVal = tileIdx * 16;
      valCount = 16;
      newValues = Array.from(encoded);
    }
  } else if (arr.mode === '1bpp') {
    const encoded = encode1bppTile(tile);
    if (arr.wide) {
      startVal = tileIdx * 4;
      valCount = 4;
      newValues = [];
      for (let r = 0; r < 4; r++) {
        newValues.push(encoded[r * 2] | (encoded[r * 2 + 1] << 8));
      }
    } else {
      startVal = tileIdx * 8;
      valCount = 8;
      newValues = Array.from(encoded);
    }
  } else {
    // Raw pixel mode: 64 values per tile
    startVal = tileIdx * 64;
    valCount = 64;
    newValues = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        newValues.push(tile[r][c]);
      }
    }
  }

  let src = state.currentSource;
  let lengthChanged = false;

  // Replace values from end to start to preserve earlier positions
  for (let b = valCount - 1; b >= 0; b--) {
    const hp = arr.hexPositions[startVal + b];
    let newStr;
    if (arr.format === 'hex') {
      const hp_wide = hp.wide;
      const padLen = hp_wide ? 4 : 2;
      newStr = '0x' + newValues[b].toString(16).toUpperCase().padStart(padLen, '0');
    } else {
      newStr = String(newValues[b]);
    }
    src = src.substring(0, hp.pos) + newStr + src.substring(hp.pos + hp.len);
    if (hp.len !== newStr.length) lengthChanged = true;
    hp.len = newStr.length;
    hp.value = newValues[b];
  }

  state.currentSource = src;

  // If any value changed length, re-scan to fix all positions
  if (lengthChanged) {
    const savedArrays = state.arrays.map(a => ({ tiles: a.tiles, mode: a.mode, format: a.format, wide: a.wide }));
    state.arrays = scanSource(src, state.parserMode);
    for (let i = 0; i < state.arrays.length && i < savedArrays.length; i++) {
      state.arrays[i].tiles = savedArrays[i].tiles;
      state.arrays[i].mode = savedArrays[i].mode;
      state.arrays[i].format = savedArrays[i].format;
      state.arrays[i].wide = savedArrays[i].wide;
    }
    renderSource();
    return;
  }

  // Update value text in DOM without full re-render
  const hexSpans = el.sourceCode.querySelectorAll(
    `.hex-byte[data-array-idx="${arrayIdx}"]`
  );
  for (const span of hexSpans) {
    const bi = parseInt(span.dataset.byteIdx);
    if (bi >= startVal && bi < startVal + valCount) {
      const localIdx = bi - startVal;
      if (arr.format === 'hex') {
        span.textContent = '0x' + newValues[localIdx].toString(16).toUpperCase().padStart(2, '0');
      } else {
        span.textContent = String(newValues[localIdx]);
      }
    }
  }
}

export function updateInlinePreviews(arrayIdx) {
  const arr = state.arrays[arrayIdx];
  if (!arr) return;
  const anchor = el.sourceCode.querySelector(`.tile-preview-anchor[data-array-idx="${arrayIdx}"]`);
  if (!anchor) return;
  const canvases = anchor.querySelectorAll('canvas');
  for (let ti = 0; ti < arr.tiles.length && ti < canvases.length; ti++) {
    drawTileToCanvas(canvases[ti], arr.tiles[ti]);
  }
}
