import { state, FIRST_CHAR } from './state.js';
import { el } from './dom.js';
import { encodeTile, decodeTile, encodeTileFont, decodeTileFont, calcAllWidths } from './color.js';
import { dedupeTiles } from './dedupe.js';
import { renderTileGrid } from './tile-grid.js';
import { renderTileZoom } from './tile-zoom.js';
import { updateTileNav } from './tile-edit.js';

export function getClusteredOrder() {
  const cw = state.clusterW;
  const ch = state.clusterH;
  const tw = state.tilesX || state.tileData.length;
  const th = state.tilesY || 1;
  const order = [];
  const clustersX = Math.ceil(tw / cw);
  const clustersY = Math.ceil(th / ch);
  for (let cy = 0; cy < clustersY; cy++) {
    for (let cx = 0; cx < clustersX; cx++) {
      for (let dy = 0; dy < ch; dy++) {
        for (let dx = 0; dx < cw; dx++) {
          const tx = cx * cw + dx;
          const ty = cy * ch + dy;
          if (tx < tw && ty < th) {
            order.push(ty * tw + tx);
          }
        }
      }
    }
  }
  return order;
}

function glyphLabel(index) {
  const code = FIRST_CHAR + index;
  const ch = String.fromCharCode(code);
  if (code === 32) return 'space';
  return `'${ch}'`;
}

function generateFontHeader() {
  if (!state.tileData.length) return '// Upload a font image to generate data';
  const prefix = state.varName ? state.varName + '_' : '';
  const count = state.tileData.length;

  // bitmap_data
  const bitmapLines = [];
  for (let i = 0; i < count; i++) {
    const enc = encodeTileFont(state.tileData[i]);
    const hex = [];
    for (let j = 0; j < 16; j++) {
      hex.push('0x' + enc[j].toString(16).toUpperCase().padStart(2, '0'));
    }
    bitmapLines.push(`    /* ${glyphLabel(i)} */\n    ${hex.join(', ')}`);
  }
  const bitmapArr = `static const uint8_t ${prefix}font_bitmap_data[] = {\n${bitmapLines.join(',\n')}\n};`;

  // glyph_widths
  const widthRows = [];
  for (let i = 0; i < count; i += 16) {
    const slice = state.glyphWidths.slice(i, Math.min(i + 16, count));
    widthRows.push('    ' + slice.join(', '));
  }
  const widthArr = `static const uint8_t ${prefix}font_glyph_widths[] = {\n${widthRows.join(',\n')}\n};`;

  const comment = `// ${count} glyphs, ${count * 16} bitmap bytes`;
  return `${bitmapArr}\n\n${widthArr}\n${comment}`;
}

function hexBytes(enc) {
  const hex = [];
  for (let j = 0; j < 16; j++) {
    hex.push('0x' + enc[j].toString(16).toUpperCase().padStart(2, '0'));
  }
  return hex;
}

function generateTileMapHeader() {
  const name = state.varName || 'tile_data';
  const { uniqueTiles, tileMap: mapIndices } = dedupeTiles(state.tileData);
  const count = uniqueTiles.length;
  const totalBytes = count * 16;

  // Unique tile data (flat hex format)
  const tileLines = [];
  for (let i = 0; i < count; i++) {
    const enc = encodeTile(uniqueTiles[i]);
    tileLines.push(`    /* tile ${i} */\n    ${hexBytes(enc).join(', ')}`);
  }
  const tileArr = `static const uint8_t ${name}[] = {\n${tileLines.join(',\n')}\n};`;
  const tileComment = `// ${count} unique tile${count !== 1 ? 's' : ''}, ${totalBytes} bytes`;

  // Tilemap — laid out row-by-row matching the image grid
  const tw = state.tilesX || mapIndices.length;
  const th = state.tilesY || 1;
  const pad = count > 99 ? 3 : count > 9 ? 2 : 1;
  const mapLines = [];
  for (let y = 0; y < th; y++) {
    const row = [];
    for (let x = 0; x < tw; x++) {
      row.push(mapIndices[y * tw + x].toString().padStart(pad));
    }
    mapLines.push('    ' + row.join(', '));
  }
  const mapType = count > 256 ? 'uint16_t' : 'uint8_t';
  const mapArr = `static const ${mapType} ${name}_map[] = {\n${mapLines.join(',\n')}\n};`;
  const mapComment = `// ${tw}x${th} = ${tw * th} entries`;

  const total = mapIndices.length;
  const savedPct = total > 0 ? Math.round(((total - count) / total) * 100) : 0;
  const savings = `// tilemap: ${count}/${total} unique tiles (${savedPct}% saved)`;

  return `${tileArr}\n${tileComment}\n\n${mapArr}\n${mapComment}\n${savings}`;
}

function generateTileHeader() {
  if (!state.tileData.length) return '// Upload an image to generate tile data';
  if (state.tileMap) return generateTileMapHeader();
  const name = state.varName || 'tile_data';
  const order = (state.clusterW > 1 || state.clusterH > 1)
    ? getClusteredOrder()
    : null;
  const count = order ? order.length : state.tileData.length;
  const totalBytes = count * 16;
  const comment = `// ${count} tile${count !== 1 ? 's' : ''}, ${totalBytes} bytes`;

  if (state.outputFormat === 'grouped') {
    const tileLines = [];
    for (let i = 0; i < count; i++) {
      const t = order ? order[i] : i;
      const enc = encodeTile(state.tileData[t]);
      const rows = [];
      for (let r = 0; r < 2; r++) {
        const row = [];
        for (let j = r * 8; j < r * 8 + 8; j++) {
          row.push('0x' + enc[j].toString(16).toUpperCase().padStart(2, '0'));
        }
        rows.push('    {' + row.join(',') + '}');
      }
      tileLines.push(`    /* tile ${t} */\n${rows.join(',\n')}`);
    }
    return `static const uint8_t ${name}[][8] = {\n${tileLines.join(',\n')}\n};\n${comment}`;
  }

  // Flat format
  const tileLines = [];
  for (let i = 0; i < count; i++) {
    const t = order ? order[i] : i;
    const enc = encodeTile(state.tileData[t]);
    const hex = [];
    for (let j = 0; j < 16; j++) {
      hex.push('0x' + enc[j].toString(16).toUpperCase().padStart(2, '0'));
    }
    tileLines.push(`    /* tile ${t} */\n    ${hex.join(', ')}`);
  }
  return `static const uint8_t ${name}[] = {\n${tileLines.join(',\n')}\n};\n${comment}`;
}

export function generateHeader() {
  return state.fontMode ? generateFontHeader() : generateTileHeader();
}

let updatingFromCode = false;

export function updateOutput() {
  if (updatingFromCode) return;
  el.headerOutput.textContent = generateHeader();
  el.headerOutput.classList.remove('parse-error');
  el.parseStatus.textContent = '';
  el.parseStatus.className = 'parse-status';
}

function parseFontHeader(text) {
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
    tiles.push(decodeTileFont(bytes, i));
  }

  let widths = null;
  if (widthMatch) {
    const nums = widthMatch[1].match(/\d+/g);
    if (nums) widths = nums.map(Number);
  }

  // Match optional prefix before font_bitmap_data
  const prefixMatch = text.match(/uint8_t\s+(?:(\w+)_)?font_bitmap_data/);
  const varName = prefixMatch && prefixMatch[1] ? prefixMatch[1] : null;

  return { tiles, widths, varName };
}

function parseTileHeader(text) {
  const hexMatches = text.match(/0x[0-9a-fA-F]{1,2}/g);
  if (!hexMatches || hexMatches.length === 0) {
    return { error: 'No hex bytes found' };
  }
  const bytes = hexMatches.map(h => parseInt(h, 16));
  if (bytes.length % 16 !== 0) {
    return { error: `${bytes.length} bytes found — must be a multiple of 16 (16 bytes per tile)` };
  }
  const tiles = [];
  for (let i = 0; i < bytes.length; i += 16) {
    tiles.push(decodeTile(bytes, i));
  }
  const nameMatch = text.match(/(?:static\s+)?(?:const\s+)?(?:unsigned\s+char|uint8_t)\s+(\w+)\s*\[/);
  return { tiles, varName: nameMatch ? nameMatch[1] : null };
}

export function parseHeader(text) {
  return state.fontMode ? parseFontHeader(text) : parseTileHeader(text);
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
  el.parseStatus.textContent = `Parsed ${result.tiles.length} tile${result.tiles.length !== 1 ? 's' : ''}`;
  el.parseStatus.className = 'parse-status ok';

  updatingFromCode = true;
  state.tileData = result.tiles;

  // In font mode, reconstruct magenta markers from parsed widths
  if (state.fontMode && result.widths) {
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

  if (state.fontMode) {
    state.glyphWidths = calcAllWidths(state.tileData);
  }

  if (result.varName) {
    state.varName = result.varName;
    el.varName.value = result.varName;
  }
  // Recalculate grid dimensions for the parsed tile count
  const count = state.tileData.length;
  if (count > 0) {
    if (state.tilesX <= 0 || state.tilesX > count) {
      state.tilesX = Math.ceil(Math.sqrt(count));
    }
    state.tilesY = Math.ceil(count / state.tilesX);
  }
  if (state.selectedTile >= state.tileData.length) {
    state.selectedTile = Math.max(0, state.tileData.length - 1);
  }
  renderTileGrid();
  if (state.tileData.length) renderTileZoom();
  updateTileNav();
  el.tileEditModeBtn.disabled = !state.tileData.length;
  updatingFromCode = false;
}
