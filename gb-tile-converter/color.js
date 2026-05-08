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

export function luminance(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

// Find up to maxK dominant colors in the pixel buffer via k-means.
// Returns [{r,g,b,count}, ...] sorted by luminance ascending (darkest first).
export function detectDominantColors(pixels, maxK = 4) {
  // Histogram of 5-bit-per-channel quantized colors, skipping transparent
  const hist = new Map();
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue;
    const r = pixels[i] >> 3;
    const g = pixels[i + 1] >> 3;
    const b = pixels[i + 2] >> 3;
    const key = (r << 10) | (g << 5) | b;
    hist.set(key, (hist.get(key) || 0) + 1);
  }
  if (hist.size === 0) return [];

  const unique = [];
  for (const [key, count] of hist) {
    unique.push({
      r: (((key >> 10) & 31) << 3) | 4,
      g: (((key >> 5) & 31) << 3) | 4,
      b: ((key & 31) << 3) | 4,
      count,
    });
  }

  // If fewer than maxK unique colors, return them directly
  if (unique.length <= maxK) {
    return unique.sort((a, b) => luminance(a.r, a.g, a.b) - luminance(b.r, b.g, b.b));
  }

  // Seed k-means with maxK points evenly spread across the luminance-sorted list
  const byLum = unique.slice().sort((a, b) => luminance(a.r, a.g, a.b) - luminance(b.r, b.g, b.b));
  const centroids = [];
  for (let k = 0; k < maxK; k++) {
    const idx = Math.floor((k * (byLum.length - 1)) / (maxK - 1));
    centroids.push({ r: byLum[idx].r, g: byLum[idx].g, b: byLum[idx].b });
  }

  for (let iter = 0; iter < 10; iter++) {
    const sums = Array.from({ length: maxK }, () => ({ r: 0, g: 0, b: 0, count: 0 }));
    for (const c of unique) {
      let best = 0, bestDist = Infinity;
      for (let k = 0; k < maxK; k++) {
        const dr = c.r - centroids[k].r;
        const dg = c.g - centroids[k].g;
        const db = c.b - centroids[k].b;
        const d = dr * dr + dg * dg + db * db;
        if (d < bestDist) { bestDist = d; best = k; }
      }
      sums[best].r += c.r * c.count;
      sums[best].g += c.g * c.count;
      sums[best].b += c.b * c.count;
      sums[best].count += c.count;
    }
    let changed = false;
    for (let k = 0; k < maxK; k++) {
      if (sums[k].count === 0) continue;
      const nr = Math.round(sums[k].r / sums[k].count);
      const ng = Math.round(sums[k].g / sums[k].count);
      const nb = Math.round(sums[k].b / sums[k].count);
      if (nr !== centroids[k].r || ng !== centroids[k].g || nb !== centroids[k].b) {
        centroids[k] = { r: nr, g: ng, b: nb };
        changed = true;
      }
    }
    if (!changed) break;
  }

  // Final count pass, drop empty clusters
  const finalCounts = new Array(maxK).fill(0);
  for (const c of unique) {
    let best = 0, bestDist = Infinity;
    for (let k = 0; k < maxK; k++) {
      const dr = c.r - centroids[k].r;
      const dg = c.g - centroids[k].g;
      const db = c.b - centroids[k].b;
      const d = dr * dr + dg * dg + db * db;
      if (d < bestDist) { bestDist = d; best = k; }
    }
    finalCounts[best] += c.count;
  }

  return centroids
    .map((c, i) => ({ r: c.r, g: c.g, b: c.b, count: finalCounts[i] }))
    .filter(c => c.count > 0)
    .sort((a, b) => luminance(a.r, a.g, a.b) - luminance(b.r, b.g, b.b));
}

// Pick a DMG index for each source color.
// Prefer nearest-DMG when it assigns a distinct index per source color.
// Otherwise fall back to luminance-rank assignment (darkest → 3, lightest → 0).
// sourceColors must be sorted by luminance ascending.
export function defaultPaletteMapping(sourceColors) {
  const n = sourceColors.length;
  if (n === 0) return [];

  const nearest = sourceColors.map(c => rgbToDmg(c.r, c.g, c.b, 255));
  if (new Set(nearest).size === n) return nearest;

  const mapping = new Array(n);
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 1 : 1 - i / (n - 1);
    mapping[i] = Math.round(t * 3);
  }
  return mapping;
}

export function rgbToDmgMapped(r, g, b, a, sourceColors, paletteMapping) {
  if (a < 128) return 0;
  if (!sourceColors.length) return rgbToDmg(r, g, b, a);
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < sourceColors.length; i++) {
    const dr = r - sourceColors[i].r;
    const dg = g - sourceColors[i].g;
    const db = b - sourceColors[i].b;
    const d = dr * dr + dg * dg + db * db;
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return paletteMapping[best] ?? 0;
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

// 1bpp encode: 8 bytes per tile, one byte per row.
// hiColor maps to bit 1; everything else (typically the one other color in use) maps to bit 0.
export function encodeTile1bpp(tile, hiColor) {
  const bytes = new Uint8Array(8);
  for (let row = 0; row < 8; row++) {
    let b = 0;
    for (let col = 0; col < 8; col++) {
      if (tile[row][col] === hiColor) b |= (1 << (7 - col));
    }
    bytes[row] = b;
  }
  return bytes;
}

// Inspect tileData for 1bpp output:
// - hiColor: the color that maps to bit 1 (highest-valued color in use, i.e. darkest in DMG).
// - badTiles: indices of tiles introducing a 3rd/4th color (only set when > 2 distinct
//   colors are used across the whole set; the 2 most-used colors are kept).
export function analyze1bpp(tileData) {
  const counts = [0, 0, 0, 0];
  for (const tile of tileData) {
    for (const row of tile) {
      for (const c of row) counts[c]++;
    }
  }
  const used = [];
  for (let i = 0; i < 4; i++) if (counts[i] > 0) used.push(i);

  if (used.length <= 2) {
    return { hiColor: used.length ? used[used.length - 1] : 3, badTiles: [] };
  }

  const sortedByFreq = [...used].sort((a, b) => counts[b] - counts[a]);
  const keep = new Set([sortedByFreq[0], sortedByFreq[1]]);
  const hiColor = Math.max(...keep);

  const badTiles = [];
  for (let i = 0; i < tileData.length; i++) {
    const tile = tileData[i];
    let invalid = false;
    for (let r = 0; r < 8 && !invalid; r++) {
      for (let c = 0; c < 8; c++) {
        if (!keep.has(tile[r][c])) { invalid = true; break; }
      }
    }
    if (invalid) badTiles.push(i);
  }
  return { hiColor, badTiles };
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
