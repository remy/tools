import { state } from './state.js';
import { el } from './dom.js';
import { applyZoom, renderOverview, updateImageInfo } from './overview.js';
import { updateOutput } from './header.js';

const STORAGE_KEY = 'gb-tile-converter';

export function updateFormatToggle() {
  el.formatToggleBtn.textContent = state.outputFormat === 'grouped' ? 'Flat' : 'Grouped';
}

export function saveState() {
  try {
    const data = {
      tileData: state.tileData,
      varName: state.varName,
      selectedTile: state.selectedTile,
      selectedColor: state.selectedColor,
      offsetX: state.offsetX,
      offsetY: state.offsetY,
      imageScale: state.imageScale,
      zoom: state.zoom,
      outputFormat: state.outputFormat,
      clusterW: state.clusterW,
      clusterH: state.clusterH,
      tileMap: state.tileMap,
      bpp1: state.bpp1,
      tilesX: state.tilesX,
      tilesY: state.tilesY,
      canvasW: state.canvasW,
      canvasH: state.canvasH,
      imageFileName: state.imageFileName,
      fontLoaded: state.fontLoaded,
      fontSize: state.fontSize,
      fontBold: state.fontBold,
      fontMode: state.fontMode,
      glyphWidths: state.glyphWidths,
      sourceColors: state.sourceColors,
      paletteMapping: state.paletteMapping,
    };
    // Store image as data URL if present
    if (state.image) {
      const c = document.createElement('canvas');
      c.width = state.image.naturalWidth;
      c.height = state.image.naturalHeight;
      c.getContext('2d').drawImage(state.image, 0, 0);
      try {
        data.imageDataURL = c.toDataURL('image/png');
      } catch { /* tainted canvas, skip image */ }
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch { /* quota exceeded or private mode, ignore */ }
}

export function restoreState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (!data.tileData || !data.tileData.length) return;

    state.tileData = data.tileData;
    state.varName = data.varName || 'tile_data';
    state.selectedTile = data.selectedTile || 0;
    state.selectedColor = data.selectedColor || 3;
    state.offsetX = data.offsetX || 0;
    state.offsetY = data.offsetY || 0;
    state.imageScale = data.imageScale || 1;
    state.zoom = data.zoom || 1;
    state.outputFormat = data.outputFormat || 'grouped';
    state.clusterW = data.clusterW || 1;
    state.clusterH = data.clusterH || 1;
    state.tileMap = !!data.tileMap;
    state.bpp1 = !!data.bpp1;
    el.clusterW.value = state.clusterW;
    el.clusterH.value = state.clusterH;
    el.tileMapToggle.checked = state.tileMap;
    el.bpp1Toggle.checked = state.bpp1;
    updateFormatToggle();
    state.tilesX = data.tilesX || 0;
    state.tilesY = data.tilesY || 0;
    state.canvasW = data.canvasW || 256;
    state.canvasH = data.canvasH || 256;
    state.imageFileName = data.imageFileName || '';
    state.fontMode = data.fontMode || false;
    state.glyphWidths = data.glyphWidths || [];
    state.sourceColors = Array.isArray(data.sourceColors) ? data.sourceColors : [];
    state.paletteMapping = Array.isArray(data.paletteMapping) ? data.paletteMapping : [];

    el.varName.value = state.varName;
    el.fontModeToggle.checked = state.fontMode;
    el.paletteButtons.forEach(b =>
      b.classList.toggle('active', parseInt(b.dataset.color) === state.selectedColor)
    );

    if (state.selectedTile >= state.tileData.length) {
      state.selectedTile = Math.max(0, state.tileData.length - 1);
    }

    el.tileEditModeBtn.disabled = false;
    updateOutput();

    // Restore image if saved
    if (data.imageDataURL) {
      const img = new Image();
      img.onload = () => {
        state.image = img;
        el.overviewCanvas.width = state.canvasW;
        el.overviewCanvas.height = state.canvasH;
        applyZoom();
        renderOverview();
        el.dropOverlay.classList.add('loaded');
        el.resetPositionBtn.hidden = false;
        el.zoomControls.hidden = false;
        el.overviewCanvas.style.cursor = 'grab';
        updateImageInfo();
      };
      img.src = data.imageDataURL;
    }
  } catch { /* corrupted data, ignore */ }
}

let saveTimer = null;
export function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveState, 500);
}
