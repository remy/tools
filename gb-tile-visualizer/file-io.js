// ---- File Loading & Toolbar Handlers ----
import { state } from './state.js';
import { el } from './dom.js';
import { scanSource } from './scanner.js';
import { renderSource } from './source-view.js';
import { selectTile } from './tile-grid.js';

export function loadSource(text, fileName) {
  state.originalSource = text;
  state.currentSource = text;
  state.fileName = fileName || 'source.c';
  state.selectedArray = 0;
  state.selectedTile = 0;

  state.arrays = scanSource(text);

  el.fileName.textContent = state.fileName;
  el.dropZone.classList.add('compact');
  el.app.hidden = false;

  if (state.arrays.length > 0) {
    el.editorPanel.hidden = false;
    selectTile(0, 0);
  } else {
    el.editorPanel.hidden = true;
    el.editorInfo.textContent = 'No tile data found';
  }

  renderSource();
}

export function loadFile(file) {
  const reader = new FileReader();
  reader.onload = () => loadSource(reader.result, file.name);
  reader.readAsText(file);
}

export function handleCopy() {
  navigator.clipboard.writeText(state.currentSource).then(() => {
    el.copyBtn.textContent = 'Copied!';
    setTimeout(() => { el.copyBtn.textContent = 'Copy'; }, 1500);
  });
}

export function handleDownload() {
  const blob = new Blob([state.currentSource], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = state.fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export function handleReset() {
  loadSource(state.originalSource, state.fileName);
}
