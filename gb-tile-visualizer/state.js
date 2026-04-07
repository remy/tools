// ---- DMG Palette ----
export const DMG_CSS = ['#e0f8d0', '#88c070', '#346856', '#081820'];

// ---- Shared mutable state ----
export const state = {
  originalSource: '',
  currentSource: '',
  fileName: '',
  arrays: [],        // [{ name, startIdx, endIdx, hexPositions: [{pos,len}], tiles: [8x8 arrays] }]
  selectedArray: 0,
  selectedTile: 0,
  selectedColor: 3,
  painting: false,
  hoveredPixels: null, // { row, col, w, h } region to highlight on zoom canvas
  cluster2x2: false,
};
