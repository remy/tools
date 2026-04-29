// ---- Source Code Rendering ----
import { state, DMG_CSS } from './state.js';
import { el } from './dom.js';
import { drawTileToCanvas, selectTile } from './tile-grid.js';
import { renderTileZoom, byteIdxToPixelRegion } from './tile-zoom.js';

export function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function renderSource() {
  const source = state.currentSource;
  const arrays = state.arrays;

  // Build a set of character ranges that are hex bytes in tile arrays
  const hexMap = new Map(); // charPos -> { arrayIdx, tileIdx, byteIdx }
  for (let ai = 0; ai < arrays.length; ai++) {
    const arr = arrays[ai];
    // Number of hex positions per tile (not expanded bytes)
    const valsPerTile = arr.mode === 'raw' ? 64
      : arr.mode === '1bpp' ? (arr.wide ? 4 : 8)
      : (arr.wide ? 8 : 16);
    for (let bi = 0; bi < arr.hexPositions.length; bi++) {
      const tileIdx = Math.floor(bi / valsPerTile);
      hexMap.set(arr.hexPositions[bi].pos, {
        arrayIdx: ai,
        tileIdx,
        byteIdx: bi,
        len: arr.hexPositions[bi].len,
      });
    }
  }

  // Build positions where we should insert tile preview rows (after closing brace of each array)
  const previewInsertions = new Map(); // charPos -> arrayIdx
  for (let ai = 0; ai < arrays.length; ai++) {
    // Insert preview at the line containing the closing brace
    // Find the semicolon after closing brace
    let semiPos = arrays[ai].endIdx;
    while (semiPos < source.length && source[semiPos] !== '\n') semiPos++;
    previewInsertions.set(semiPos, ai);
  }

  // Render source as HTML, character by character
  let html = '';
  let i = 0;
  while (i < source.length) {
    const hexInfo = hexMap.get(i);
    if (hexInfo) {
      const isActiveTile = hexInfo.arrayIdx === state.selectedArray &&
        hexInfo.tileIdx === state.selectedTile;
      const cls = isActiveTile ? 'hex-byte active-tile' : 'hex-byte';
      const raw = source.substring(i, i + hexInfo.len);
      html += `<span class="${cls}" data-array-idx="${hexInfo.arrayIdx}" data-tile-idx="${hexInfo.tileIdx}" data-byte-idx="${hexInfo.byteIdx}">${escapeHtml(raw)}</span>`;
      i += hexInfo.len;
    } else {
      // Check for preview insertion
      if (previewInsertions.has(i)) {
        const ai = previewInsertions.get(i);
        html += `<span class="tile-preview-anchor" data-array-idx="${ai}"></span>`;
      }
      html += escapeHtml(source[i]);
      i++;
    }
  }
  // Handle preview at end of file
  if (previewInsertions.has(source.length)) {
    const ai = previewInsertions.get(source.length);
    html += `<span class="tile-preview-anchor" data-array-idx="${ai}"></span>`;
  }

  el.sourceCode.innerHTML = html;

  // Line numbers
  const lineCount = source.split('\n').length;
  let lineHtml = '';
  for (let l = 1; l <= lineCount; l++) {
    lineHtml += l + '\n';
  }
  el.lineNumbers.textContent = lineHtml;

  // Insert tile preview canvases at anchor points
  const anchors = el.sourceCode.querySelectorAll('.tile-preview-anchor');
  for (const anchor of anchors) {
    const ai = parseInt(anchor.dataset.arrayIdx);
    const arr = arrays[ai];
    if (!arr || arr.tiles.length === 0) continue;

    const row = document.createElement('span');
    row.className = 'tile-preview-row';

    for (let ti = 0; ti < arr.tiles.length; ti++) {
      const c = document.createElement('canvas');
      c.width = 8;
      c.height = 8;
      c.style.width = '24px';
      c.style.height = '24px';
      if (ai === state.selectedArray && ti === state.selectedTile) {
        c.classList.add('selected');
      }
      drawTileToCanvas(c, arr.tiles[ti]);
      c.addEventListener('click', () => selectTile(ai, ti));
      row.appendChild(c);
    }

    anchor.appendChild(row);
  }

  // Click handler for hex bytes
  el.sourceCode.addEventListener('click', onSourceClick);

  // Hover handler: highlight corresponding pixel(s) in zoom canvas
  el.sourceCode.addEventListener('mouseover', (e) => {
    const span = e.target.closest('.hex-byte[data-array-idx]');
    if (!span) return;
    const ai = parseInt(span.dataset.arrayIdx);
    const ti = parseInt(span.dataset.tileIdx);
    const bi = parseInt(span.dataset.byteIdx);
    if (ai !== state.selectedArray || ti !== state.selectedTile) return;
    const arr = state.arrays[ai];
    if (!arr) return;
    state.hoveredPixels = byteIdxToPixelRegion(arr, bi);
    renderTileZoom();
  });
  el.sourceCode.addEventListener('mouseout', (e) => {
    const span = e.target.closest('.hex-byte[data-array-idx]');
    if (!span) return;
    if (state.hoveredPixels) {
      state.hoveredPixels = null;
      renderTileZoom();
    }
  });
}

export function updateSourceHighlights() {
  // Update active-tile classes without full re-render
  const allBytes = el.sourceCode.querySelectorAll('.hex-byte');
  for (const span of allBytes) {
    const ai = parseInt(span.dataset.arrayIdx);
    const ti = parseInt(span.dataset.tileIdx);
    span.classList.toggle('active-tile', ai === state.selectedArray && ti === state.selectedTile);
  }

  // Update preview canvas selections
  const previews = el.sourceCode.querySelectorAll('.tile-preview-row canvas');
  // We need to figure out which array each preview belongs to
  const anchors = el.sourceCode.querySelectorAll('.tile-preview-anchor');
  let canvasIdx = 0;
  for (const anchor of anchors) {
    const ai = parseInt(anchor.dataset.arrayIdx);
    const arr = state.arrays[ai];
    if (!arr) continue;
    for (let ti = 0; ti < arr.tiles.length; ti++) {
      if (canvasIdx < previews.length) {
        previews[canvasIdx].classList.toggle('selected', ai === state.selectedArray && ti === state.selectedTile);
        canvasIdx++;
      }
    }
  }

  // Scroll the first active-tile hex byte into view
  const first = el.sourceCode.querySelector('.hex-byte.active-tile');
  if (first) {
    first.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

export function onSourceClick(e) {
  const span = e.target.closest('.hex-byte[data-array-idx]');
  if (!span) return;
  const ai = parseInt(span.dataset.arrayIdx);
  const ti = parseInt(span.dataset.tileIdx);
  selectTile(ai, ti);
}
