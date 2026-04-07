import { state } from './state.js';
import { el } from './dom.js';
import { renderTileGrid, renderTileZoom } from './render.js';
import { updateOutput, onHeaderInput } from './output.js';
import { renderCharMap, updateTileNav } from './charmap.js';
import { initEditor } from './editor.js';
import { initInput } from './input.js';
import { initStorage } from './storage.js';

// --- Mode switching ---

function setMode(mode) {
  state.mode = mode;
  el.overviewSection.classList.toggle('hidden', mode !== 'overview');
  el.tileEditorSection.classList.toggle('hidden', mode !== 'editor');
  el.overviewModeBtn.classList.toggle('active', mode === 'overview');
  el.tileEditModeBtn.classList.toggle('active', mode === 'editor');

  if (mode === 'editor') {
    renderTileGrid();
    renderTileZoom();
    updateTileNav();
  }
}

el.overviewModeBtn.addEventListener('click', () => setMode('overview'));
el.tileEditModeBtn.addEventListener('click', () => {
  if (!state.tileData.length) return;
  setMode('editor');
});

// --- Variable prefix ---

el.varPrefix.addEventListener('input', () => {
  state.varPrefix = el.varPrefix.value.replace(/[^a-zA-Z0-9_]/g, '_') || 'font';
  updateOutput();
});

// --- Copy ---

el.copyOutputBtn.addEventListener('click', async () => {
  const text = el.headerOutput.innerText;
  try {
    await navigator.clipboard.writeText(text);
    el.copyOutputBtn.textContent = 'Copied!';
    setTimeout(() => { el.copyOutputBtn.textContent = 'Copy'; }, 1500);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    el.copyOutputBtn.textContent = 'Copied!';
    setTimeout(() => { el.copyOutputBtn.textContent = 'Copy'; }, 1500);
  }
});

// --- Header editing ---

el.headerOutput.addEventListener('input', () => {
  onHeaderInput();
  // Re-render after parse
  if (state.tileData.length) {
    renderCharMap();
    if (state.mode === 'editor') {
      renderTileGrid();
      renderTileZoom();
      updateTileNav();
    }
  }
});

// --- Init ---

el.overviewCanvas.style.cursor = 'default';
initInput();
initEditor();
initStorage();
