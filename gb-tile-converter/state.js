// DMG palette (classic green shades)
export const DMG = [
  { r: 224, g: 248, b: 208 }, // 0 - White
  { r: 136, g: 192, b: 112 }, // 1 - Light
  { r:  52, g: 104, b:  86 }, // 2 - Dark
  { r:   8, g:  24, b:  32 }, // 3 - Black
];

export const DMG_CSS = ['#e0f8d0', '#88c070', '#346856', '#081820'];

// Shared mutable state
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
  tileData: [],   // flat array of tiles, each tile is [8][8] of 0-3
  mode: 'overview',
  selectedTile: 0,
  selectedColor: 3,
  varName: 'tile_data',
  outputFormat: 'grouped',  // 'grouped' or 'flat'
  clusterW: 1,
  clusterH: 1,
  painting: false,
  zoom: 1,
  imageScale: 1,
  fontLoaded: false,
  fontFamily: null,
  fontSize: 8,
  fontBold: false,
};
