import { state, DMG_CSS } from './state.js';
import { el } from './dom.js';
import { defaultPaletteMapping } from './color.js';
import { quantize } from './overview.js';
import { renderTileGrid } from './tile-grid.js';
import { renderTileZoom } from './tile-zoom.js';

const DMG_TITLES = ['White', 'Light', 'Dark', 'Black'];

export function renderSourcePalette() {
  if (!el.sourcePalette) return;

  // The Colours tab is only meaningful in tile mode once an image has
  // produced detected source colours. In font mode the DMG palette isn't
  // used, so the tab is hidden entirely and we fall back to the Pixels tab.
  const available = !state.fontMode && state.sourceColors.length > 0;
  if (el.editorTabs) el.editorTabs.hidden = !available;
  if (!available) {
    setEditorTab('pixels');
    return;
  }

  el.sourcePaletteRows.innerHTML = '';
  for (let i = 0; i < state.sourceColors.length; i++) {
    const c = state.sourceColors[i];
    const row = document.createElement('div');
    row.className = 'source-palette-row';

    const swatch = document.createElement('span');
    swatch.className = 'source-swatch';
    swatch.style.background = `rgb(${c.r}, ${c.g}, ${c.b})`;
    swatch.title = `rgb(${c.r}, ${c.g}, ${c.b}) — ${c.count} px`;
    row.appendChild(swatch);

    const arrow = document.createElement('span');
    arrow.className = 'source-arrow';
    arrow.textContent = '→';
    row.appendChild(arrow);

    const choices = document.createElement('div');
    choices.className = 'source-dmg-choices';
    for (let k = 0; k < 4; k++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'source-dmg-btn';
      btn.dataset.sourceIdx = i;
      btn.dataset.dmg = k;
      btn.style.background = DMG_CSS[k];
      btn.title = DMG_TITLES[k];
      if (state.paletteMapping[i] === k) btn.classList.add('active');
      btn.addEventListener('click', () => assignMapping(i, k));
      choices.appendChild(btn);
    }
    row.appendChild(choices);

    el.sourcePaletteRows.appendChild(row);
  }
}

export function setEditorTab(which) {
  if (!el.tabPixels) return;
  const colours = which === 'colours';
  el.tabPixels.classList.toggle('active', !colours);
  el.tabColours.classList.toggle('active', colours);
  el.pixelsPanel.hidden = colours;
  el.coloursPanel.hidden = !colours;
}

function assignMapping(sourceIdx, dmgIdx) {
  if (state.paletteMapping[sourceIdx] === dmgIdx) return;
  state.paletteMapping[sourceIdx] = dmgIdx;
  reapply();
}

export function resetSourcePalette() {
  state.paletteMapping = defaultPaletteMapping(state.sourceColors);
  reapply();
}

function reapply() {
  quantize();
  renderSourcePalette();
  if (state.mode === 'editor') {
    renderTileGrid();
    renderTileZoom();
  }
}
