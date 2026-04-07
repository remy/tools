import { FIRST_CHAR, GLYPH_COUNT } from './constants.js';
import { state } from './state.js';
import { el } from './dom.js';
import { encodeTile, decodeTile, calcAllWidths } from './encode.js';

let updatingFromCode = false;

function glyphLabel(index) {
  const code = FIRST_CHAR + index;
  const ch = String.fromCharCode(code);
  if (code === 32) return 'space';
  return `'${ch}'`;
}

/**
 * Generate the C header containing font_bitmap_data and font_glyph_widths.
 */
function generateHeader() {
  if (!state.tileData.length) return '// Upload a font image to generate data';

  const prefix = state.varPrefix || 'font';
  const count = state.tileData.length;

  // --- font_bitmap_data ---
  const bitmapLines = [];
  for (let i = 0; i < count; i++) {
    const enc = encodeTile(state.tileData[i]);
    const hex = [];
    for (let j = 0; j < 16; j++) {
      hex.push('0x' + enc[j].toString(16).toUpperCase().padStart(2, '0'));
    }
    bitmapLines.push(`    /* ${glyphLabel(i)} */\n    ${hex.join(', ')}`);
  }

  const bitmapArr = `static const uint8_t ${prefix}_bitmap_data[] = {\n${bitmapLines.join(',\n')}\n};`;

  // --- font_glyph_widths ---
  const widthRows = [];
  for (let i = 0; i < count; i += 16) {
    const slice = state.glyphWidths.slice(i, Math.min(i + 16, count));
    widthRows.push('    ' + slice.join(', '));
  }

  const widthArr = `static const uint8_t ${prefix}_glyph_widths[] = {\n${widthRows.join(',\n')}\n};`;

  const comment = `// ${count} glyphs, ${count * 16} bitmap bytes`;

  return `${bitmapArr}\n\n${widthArr}\n${comment}`;
}

export function updateOutput() {
  if (updatingFromCode) return;
  el.headerOutput.textContent = generateHeader();
  el.headerOutput.classList.remove('parse-error');
  el.parseStatus.textContent = '';
  el.parseStatus.className = 'parse-status';
}

/**
 * Parse edited C header text back into tile data.
 */
function parseHeader(text) {
  // Split into bitmap and widths sections
  const bitmapMatch = text.match(/bitmap_data\s*\[\s*\]\s*=\s*\{([\s\S]*?)\};/);
  const widthMatch = text.match(/glyph_widths\s*\[\s*\]\s*=\s*\{([\s\S]*?)\};/);

  if (!bitmapMatch) return { error: 'No bitmap_data array found' };

  const hexMatches = bitmapMatch[1].match(/0x[0-9a-fA-F]{1,2}/g);
  if (!hexMatches || hexMatches.length === 0) return { error: 'No hex bytes found in bitmap_data' };

  const bytes = hexMatches.map(h => parseInt(h, 16));
  if (bytes.length % 16 !== 0) {
    return { error: `${bytes.length} bytes — must be a multiple of 16` };
  }

  const tiles = [];
  for (let i = 0; i < bytes.length; i += 16) {
    tiles.push(decodeTile(bytes, i));
  }

  // Parse widths if present
  let widths = null;
  if (widthMatch) {
    const nums = widthMatch[1].match(/\d+/g);
    if (nums) widths = nums.map(Number);
  }

  // Extract prefix
  const prefixMatch = text.match(/uint8_t\s+(\w+)_bitmap_data/);
  const prefix = prefixMatch ? prefixMatch[1] : null;

  return { tiles, widths, prefix };
}

export function onHeaderInput() {
  const text = el.headerOutput.textContent;
  const result = parseHeader(text);
  if (result.error) {
    el.headerOutput.classList.add('parse-error');
    el.parseStatus.textContent = result.error;
    el.parseStatus.className = 'parse-status error';
    return;
  }

  el.headerOutput.classList.remove('parse-error');
  el.parseStatus.textContent = `Parsed ${result.tiles.length} glyph${result.tiles.length !== 1 ? 's' : ''}`;
  el.parseStatus.className = 'parse-status ok';

  updatingFromCode = true;
  state.tileData = result.tiles;

  // If widths were parsed, apply magenta markers to tiles
  if (result.widths) {
    for (let i = 0; i < state.tileData.length && i < result.widths.length; i++) {
      const w = result.widths[i];
      if (w < 8) {
        for (let row = 0; row < 8; row++) {
          for (let col = w; col < 8; col++) {
            if (state.tileData[i][row][col] === 0) {
              state.tileData[i][row][col] = 2; // magenta
            }
          }
        }
      }
    }
  }

  state.glyphWidths = calcAllWidths(state.tileData);

  if (result.prefix) {
    state.varPrefix = result.prefix;
    el.varPrefix.value = result.prefix;
  }

  const count = state.tileData.length;
  if (count > 0) {
    if (state.tilesX <= 0 || state.tilesX > count) {
      state.tilesX = Math.ceil(Math.sqrt(count));
    }
    state.tilesY = Math.ceil(count / state.tilesX);
  }
  if (state.selectedTile >= count) {
    state.selectedTile = Math.max(0, count - 1);
  }

  el.tileEditModeBtn.disabled = !count;
  updatingFromCode = false;
}
