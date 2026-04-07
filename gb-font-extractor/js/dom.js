// Cached DOM element references
export const el = {
  overviewModeBtn: document.getElementById('overviewModeBtn'),
  tileEditModeBtn: document.getElementById('tileEditModeBtn'),
  overviewSection: document.getElementById('overviewSection'),
  tileEditorSection: document.getElementById('tileEditorSection'),
  dropTarget: document.getElementById('dropTarget'),
  dropOverlay: document.getElementById('dropOverlay'),
  fileInput: document.getElementById('fileInput'),
  overviewCanvas: document.getElementById('overviewCanvas'),
  resetPositionBtn: document.getElementById('resetPositionBtn'),
  zoomControls: document.getElementById('zoomControls'),
  zoomInBtn: document.getElementById('zoomInBtn'),
  zoomOutBtn: document.getElementById('zoomOutBtn'),
  zoomFitBtn: document.getElementById('zoomFitBtn'),
  zoomLevel: document.getElementById('zoomLevel'),
  imageInfo: document.getElementById('imageInfo'),
  charMapWrap: document.getElementById('charMapWrap'),
  fontCharMap: document.getElementById('fontCharMap'),
  tileGridCanvas: document.getElementById('tileGridCanvas'),
  tileZoomCanvas: document.getElementById('tileZoomCanvas'),
  prevTileBtn: document.getElementById('prevTileBtn'),
  nextTileBtn: document.getElementById('nextTileBtn'),
  deleteTileBtn: document.getElementById('deleteTileBtn'),
  tileIndex: document.getElementById('tileIndex'),
  glyphInfo: document.getElementById('glyphInfo'),
  paletteButtons: document.querySelectorAll('.palette-btn'),
  varPrefix: document.getElementById('varPrefix'),
  copyOutputBtn: document.getElementById('copyOutputBtn'),
  headerOutput: document.getElementById('headerOutput'),
  parseStatus: document.getElementById('parseStatus'),
};

export const ovCtx = el.overviewCanvas.getContext('2d', { willReadFrequently: true });
export const gridCtx = el.tileGridCanvas.getContext('2d');
export const zoomCtx = el.tileZoomCanvas.getContext('2d');
