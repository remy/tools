// ---- DOM element cache ----
export const el = {};
export let gridCtx;
export let zoomCtx;

export function initDOM() {
  el.dropZone = document.getElementById('dropZone');
  el.fileInput = document.getElementById('fileInput');
  el.app = document.getElementById('app');
  el.fileName = document.getElementById('fileName');
  el.copyBtn = document.getElementById('copyBtn');
  el.downloadBtn = document.getElementById('downloadBtn');
  el.resetBtn = document.getElementById('resetBtn');
  el.sourcePanel = document.getElementById('sourcePanel');
  el.sourceWrap = document.getElementById('sourceWrap');
  el.lineNumbers = document.getElementById('lineNumbers');
  el.sourceCode = document.getElementById('sourceCode');
  el.editorPanel = document.getElementById('editorPanel');
  el.editorInfo = document.getElementById('editorInfo');
  el.tileGridCanvas = document.getElementById('tileGridCanvas');
  el.tileZoomCanvas = document.getElementById('tileZoomCanvas');
  el.prevTileBtn = document.getElementById('prevTileBtn');
  el.nextTileBtn = document.getElementById('nextTileBtn');
  el.tileCounter = document.getElementById('tileCounter');
  el.clusterToggle = document.getElementById('clusterToggle');
  el.parserMode = document.getElementById('parserMode');

  gridCtx = el.tileGridCanvas.getContext('2d', { willReadFrequently: true });
  zoomCtx = el.tileZoomCanvas.getContext('2d', { willReadFrequently: true });
}
