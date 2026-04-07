// ---- Source Code Scanning ----
import { decodeTile } from './codec.js';

export function findArrayBody(source, matchIndex, matchLength) {
  const braceStart = matchIndex + matchLength - 1;
  let depth = 1;
  let i = braceStart + 1;
  while (i < source.length && depth > 0) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') depth--;
    i++;
  }
  if (depth !== 0) return null;
  return { braceStart, endIdx: i, body: source.substring(braceStart, i) };
}

export function extractValues(body, braceStart) {
  // Try hex first: 0xNN or 0xNNNN patterns (8-bit or 16-bit)
  const hexPattern = /0[xX][0-9a-fA-F]{1,4}/g;
  const hexPositions = [];
  let m;
  while ((m = hexPattern.exec(body)) !== null) {
    const hexDigits = m[0].length - 2; // minus "0x" prefix
    hexPositions.push({
      pos: braceStart + m.index,
      len: m[0].length,
      value: parseInt(m[0], 16),
      wide: hexDigits > 2, // true for 16-bit values
    });
  }
  if (hexPositions.length > 0) {
    const hasWide = hexPositions.some(p => p.wide);
    return { positions: hexPositions, format: 'hex', wide: hasWide };
  }

  // Fall back to bare decimal integers (match numbers not inside words/identifiers)
  // We need to be careful: only match numbers that appear as array values
  // i.e. preceded by {, comma, or whitespace and followed by comma, }, or whitespace
  const decPattern = /(?<=[\s,{])(\d{1,3})(?=\s*[,}])/g;
  const decPositions = [];
  while ((m = decPattern.exec(body)) !== null) {
    const val = parseInt(m[1], 10);
    if (val > 255) continue; // not a byte
    decPositions.push({
      pos: braceStart + m.index,
      len: m[1].length,
      value: val,
    });
  }
  if (decPositions.length > 0) return { positions: decPositions, format: 'decimal' };

  return null;
}

export function scanSource(source) {
  const arrays = [];
  const arrayPattern = /(?:(?:static|const|extern)\s+)*(?:(?:static|const)\s+)*(?:unsigned\s+char|uint8_t|UINT8|UBYTE|BYTE|u8)\s+(\w+)\s*\[[\w\s]*\]\s*(?:\[[\w\s]*\]\s*)*=\s*\{/g;
  let match;

  while ((match = arrayPattern.exec(source)) !== null) {
    const name = match[1];
    const found = findArrayBody(source, match.index, match[0].length);
    if (!found) continue;

    const { braceStart, endIdx, body } = found;
    const extracted = extractValues(body, braceStart);
    if (!extracted) continue;

    const { positions, format, wide } = extracted;
    // For 16-bit hex values, expand each to a lo/hi byte pair
    let values;
    if (wide) {
      values = [];
      for (const p of positions) {
        if (p.wide) {
          values.push(p.value & 0xFF);         // lo byte
          values.push((p.value >> 8) & 0xFF);  // hi byte
        } else {
          values.push(p.value);
        }
      }
    } else {
      values = positions.map(p => p.value);
    }

    // Determine if this is 2BPP encoded tile data or raw pixel data
    // 2BPP: 16 bytes per 8×8 tile, values can be 0-255
    // Raw pixels: 64 values per 8×8 tile, all values 0-3
    const allPixelRange = values.every(v => v >= 0 && v <= 3);
    const count = values.length;

    let tiles = [];
    let mode; // '2bpp' or 'raw'

    if (count % 16 === 0 && !allPixelRange) {
      // Standard 2BPP tile data
      mode = '2bpp';
      for (let t = 0; t < count; t += 16) {
        tiles.push(decodeTile(values, t));
      }
    } else if (count % 64 === 0 && allPixelRange) {
      // Raw pixel data: 64 values = one 8×8 tile
      mode = 'raw';
      for (let t = 0; t < count; t += 64) {
        const tile = [];
        for (let r = 0; r < 8; r++) {
          tile.push(values.slice(t + r * 8, t + r * 8 + 8));
        }
        tiles.push(tile);
      }
    } else if (count % 16 === 0) {
      // Values are all 0-3 but count is multiple of 16 — could be either
      // Heuristic: if multiple of 64, prefer raw; otherwise 2BPP
      if (count % 64 === 0) {
        mode = 'raw';
        for (let t = 0; t < count; t += 64) {
          const tile = [];
          for (let r = 0; r < 8; r++) {
            tile.push(values.slice(t + r * 8, t + r * 8 + 8));
          }
          tiles.push(tile);
        }
      } else {
        mode = '2bpp';
        for (let t = 0; t < count; t += 16) {
          tiles.push(decodeTile(values, t));
        }
      }
    } else {
      continue; // not tile data
    }

    if (tiles.length === 0) continue;

    arrays.push({
      name,
      startIdx: match.index,
      endIdx,
      hexPositions: positions,
      tiles,
      mode,       // '2bpp' or 'raw'
      format,     // 'hex' or 'decimal'
      wide: !!wide, // true if 16-bit hex values
    });
  }

  return arrays;
}
