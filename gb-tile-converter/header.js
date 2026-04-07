import { state } from './state.js';
import { el } from './dom.js';
import { encodeTile, decodeTile } from './color.js';
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

export function generateHeader() {
  if (!state.tileData.length) return '// Upload an image to generate tile data';
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

let updatingFromCode = false;

export function updateOutput() {
  if (updatingFromCode) return;
  el.headerOutput.textContent = generateHeader();
  el.headerOutput.classList.remove('parse-error');
  el.parseStatus.textContent = '';
  el.parseStatus.className = 'parse-status';
}

export function parseHeader(text) {
  // Extract hex bytes from the text: match 0xNN patterns
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
  // Try to extract variable name from various C declarations
  const nameMatch = text.match(/(?:static\s+)?(?:const\s+)?(?:unsigned\s+char|uint8_t)\s+(\w+)\s*\[/);
  return { tiles, varName: nameMatch ? nameMatch[1] : null };
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
