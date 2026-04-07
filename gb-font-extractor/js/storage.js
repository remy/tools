import { state } from './state.js';
import { el } from './dom.js';
import { applyZoom, renderOverview, renderTileGrid, renderTileZoom } from './render.js';
import { updateOutput } from './output.js';
import { renderCharMap, updateTileNav } from './charmap.js';
import { loadImageFromDataURL } from './input.js';

const STORAGE_KEY = 'gb-font-extractor';

function saveState() {
  try {
    const data = {
      tileData: state.tileData,
      glyphWidths: state.glyphWidths,
      varPrefix: state.varPrefix,
      selectedTile: state.selectedTile,
      selectedColor: state.selectedColor,
      offsetX: state.offsetX,
      offsetY: state.offsetY,
      imageScale: state.imageScale,
      zoom: state.zoom,
      tilesX: state.tilesX,
      tilesY: state.tilesY,
      canvasW: state.canvasW,
      canvasH: state.canvasH,
      imageFileName: state.imageFileName,
    };
    if (state.image) {
      const c = document.createElement('canvas');
      c.width = state.image.naturalWidth;
      c.height = state.image.naturalHeight;
      c.getContext('2d').drawImage(state.image, 0, 0);
      try { data.imageDataURL = c.toDataURL('image/png'); }
      catch { /* tainted */ }
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch { /* quota */ }
}

function restoreState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (!data.tileData || !data.tileData.length) return;

    state.tileData = data.tileData;
    state.glyphWidths = data.glyphWidths || [];
    state.varPrefix = data.varPrefix || 'font';
    state.selectedTile = data.selectedTile || 0;
    state.selectedColor = data.selectedColor ?? 1;
    state.offsetX = data.offsetX || 0;
    state.offsetY = data.offsetY || 0;
    state.imageScale = data.imageScale || 1;
    state.zoom = data.zoom || 1;
    state.tilesX = data.tilesX || 0;
    state.tilesY = data.tilesY || 0;
    state.canvasW = data.canvasW || 256;
    state.canvasH = data.canvasH || 256;
    state.imageFileName = data.imageFileName || '';

    el.varPrefix.value = state.varPrefix;
    el.paletteButtons.forEach(b =>
      b.classList.toggle('active', parseInt(b.dataset.color) === state.selectedColor)
    );

    if (state.selectedTile >= state.tileData.length) {
      state.selectedTile = Math.max(0, state.tileData.length - 1);
    }

    el.tileEditModeBtn.disabled = false;
    updateOutput();
    renderCharMap();

    if (data.imageDataURL) {
      loadImageFromDataURL(data.imageDataURL, state.imageFileName);
    }
  } catch { /* corrupted */ }
}

export function initStorage() {
  restoreState();

  let timer = null;
  function scheduleSave() {
    clearTimeout(timer);
    timer = setTimeout(saveState, 500);
  }

  new MutationObserver(scheduleSave).observe(el.headerOutput, {
    childList: true, characterData: true, subtree: true,
  });
  document.addEventListener('mouseup', scheduleSave);
  document.addEventListener('keyup', scheduleSave);
}
