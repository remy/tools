// Shared application state
export const state = {
  image: null,
  imageFileName: '',
  offsetX: 0,
  offsetY: 0,
  dragging: false,
  dragStartX: 0,
  dragStartY: 0,
  dragOffsetStartX: 0,
  dragOffsetStartY: 0,
  canvasW: 256,
  canvasH: 256,
  tilesX: 0,
  tilesY: 0,
  tileData: [],       // array of tiles, each tile is [8][8] of 0-2
  glyphWidths: [],    // derived: width per glyph (0-8)
  mode: 'overview',
  selectedTile: 0,
  selectedColor: 1,   // default to dark (ink)
  varPrefix: 'font',
  painting: false,
  zoom: 1,
  imageScale: 1,
};
