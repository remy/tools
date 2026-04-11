import { state } from './state.js';
import { el } from './dom.js';
import { resizeOverviewCanvas, renderOverview, quantize } from './overview.js';

export function loadImageFromBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => {
    state.image = img;
    state.imageFileName = name;
    state.offsetX = 0;
    state.offsetY = 0;
    state.imageScale = 1;
    el.varName.value = name.replace(/[^a-zA-Z0-9_]/g, '_') || 'tile_data';
    state.varName = el.varName.value;
    resizeOverviewCanvas();
    renderOverview();
    quantize();
    el.dropOverlay.classList.add('loaded');
    el.resetPositionBtn.hidden = false;
    el.zoomControls.hidden = false;
    el.tileEditModeBtn.disabled = false;
  };
  img.src = url;
}

export function loadImageFile(file) {
  if (!file.type.match(/^image\//)) return;
  state.fontLoaded = false;
  el.fontControls.hidden = true;
  el.fontCharMap.innerHTML = '';
  loadImageFromBlob(file, file.name.replace(/\.\w+$/, ''));
}
