import { PALETTE_CSS, FIRST_CHAR } from './constants.js';
import { state } from './state.js';
import { el } from './dom.js';
import { renderTileGrid, renderTileZoom } from './render.js';

export function renderCharMap() {
  el.fontCharMap.innerHTML = '';
  if (!state.tileData.length) {
    el.charMapWrap.hidden = true;
    return;
  }
  el.charMapWrap.hidden = false;

  for (let i = 0; i < state.tileData.length; i++) {
    const code = FIRST_CHAR + i;
    const ch = String.fromCharCode(code);
    const cell = document.createElement('div');
    cell.className = 'char-cell' + (i === state.selectedTile ? ' selected' : '');
    cell.title = code === 32 ? 'Space (0x20)' : `${ch} (0x${code.toString(16).toUpperCase()})`;

    const cvs = document.createElement('canvas');
    cvs.width = 8;
    cvs.height = 8;
    const ctx = cvs.getContext('2d');
    const tile = state.tileData[i];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        ctx.fillStyle = PALETTE_CSS[tile[r][c]];
        ctx.fillRect(c, r, 1, 1);
      }
    }
    cell.appendChild(cvs);

    cell.addEventListener('click', () => {
      state.selectedTile = i;
      renderCharMap();
      if (state.mode === 'editor') {
        renderTileGrid();
        renderTileZoom();
        updateTileNav();
      }
    });

    el.fontCharMap.appendChild(cell);
  }
}

export function updateTileNav() {
  const total = state.tileData.length;
  if (!total) {
    el.tileIndex.textContent = 'No glyphs';
    el.prevTileBtn.disabled = true;
    el.nextTileBtn.disabled = true;
    return;
  }
  const code = FIRST_CHAR + state.selectedTile;
  const ch = code === 32 ? 'Space' : `'${String.fromCharCode(code)}'`;
  el.tileIndex.textContent = `${ch} — ${state.selectedTile + 1} / ${total}`;
  el.prevTileBtn.disabled = state.selectedTile <= 0;
  el.nextTileBtn.disabled = state.selectedTile >= total - 1;
}
