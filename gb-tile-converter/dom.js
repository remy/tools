// Cached DOM references and canvas contexts

export let ovCtx;
export let gridCtx;
export let zoomCtx;

export const el = {};

export function initDOM() {
  el.overviewModeBtn = document.getElementById('overviewModeBtn');
  el.tileEditModeBtn = document.getElementById('tileEditModeBtn');
  el.overviewSection = document.getElementById('overviewSection');
  el.tileEditorSection = document.getElementById('tileEditorSection');
  el.dropTarget = document.getElementById('dropTarget');
  el.dropOverlay = document.getElementById('dropOverlay');
  el.fileInput = document.getElementById('fileInput');
  el.overviewCanvas = document.getElementById('overviewCanvas');
  el.resetPositionBtn = document.getElementById('resetPositionBtn');
  el.zoomControls = document.getElementById('zoomControls');
  el.zoomInBtn = document.getElementById('zoomInBtn');
  el.zoomOutBtn = document.getElementById('zoomOutBtn');
  el.zoomFitBtn = document.getElementById('zoomFitBtn');
  el.zoomLevel = document.getElementById('zoomLevel');
  el.imageInfo = document.getElementById('imageInfo');
  el.tileGridCanvas = document.getElementById('tileGridCanvas');
  el.tileZoomCanvas = document.getElementById('tileZoomCanvas');
  el.prevTileBtn = document.getElementById('prevTileBtn');
  el.nextTileBtn = document.getElementById('nextTileBtn');
  el.addTileBtn = document.getElementById('addTileBtn');
  el.deleteTileBtn = document.getElementById('deleteTileBtn');
  el.tileIndex = document.getElementById('tileIndex');
  el.paletteButtons = document.querySelectorAll('.palette-btn');
  el.varName = document.getElementById('varName');
  el.clusterW = document.getElementById('clusterW');
  el.clusterH = document.getElementById('clusterH');
  el.formatToggleBtn = document.getElementById('formatToggleBtn');
  el.copyOutputBtn = document.getElementById('copyOutputBtn');
  el.headerOutput = document.getElementById('headerOutput');
  el.parseStatus = document.getElementById('parseStatus');
  el.fontInput = document.getElementById('fontInput');
  el.loadFontLink = document.getElementById('loadFontLink');
  el.fontControls = document.getElementById('fontControls');
  el.fontSize = document.getElementById('fontSize');
  el.fontSizeVal = document.getElementById('fontSizeVal');
  el.fontBold = document.getElementById('fontBold');
  el.fontCharMap = document.getElementById('fontCharMap');
  el.fontDebugPanel = document.getElementById('fontDebugPanel');
  el.fontDebugInfo = document.getElementById('fontDebugInfo');
  el.fontDebugHtmlWrap = document.getElementById('fontDebugHtmlWrap');
  el.fontModeToggle = document.getElementById('fontModeToggle');
  el.glyphInfo = document.getElementById('glyphInfo');
  el.charMapWrap = document.getElementById('charMapWrap');

  ovCtx = el.overviewCanvas.getContext('2d', { willReadFrequently: true });
  gridCtx = el.tileGridCanvas.getContext('2d');
  zoomCtx = el.tileZoomCanvas.getContext('2d');
}
