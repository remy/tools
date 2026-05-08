// DMG palette (classic green shades)
export const DMG = [
  { r: 224, g: 248, b: 208 }, // 0 - White
  { r: 136, g: 192, b: 112 }, // 1 - Light
  { r:  52, g: 104, b:  86 }, // 2 - Dark
  { r:   8, g:  24, b:  32 }, // 3 - Black
];

export const DMG_CSS = ['#e0f8d0', '#88c070', '#346856', '#081820'];

// Font palette: light (bg), dark (ink), magenta (width marker)
export const FONT_PALETTE = [
  { r: 224, g: 248, b: 208 }, // 0 - Light
  { r:   8, g:  24, b:  32 }, // 1 - Dark
  { r: 255, g:   0, b: 255 }, // 2 - Magenta
];

export const FONT_CSS = ['#e0f8d0', '#081820', '#ff00ff'];

export const FIRST_CHAR = 32; // ASCII space

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
  tileMap: false,       // TileMap mode: emit unique tiles + tilemap
  bpp1: false,          // 1bpp output: 8 bytes per tile (colors 0 & 3 only)
  painting: false,
  zoom: 1,
  imageScale: 1,
  fontLoaded: false,
  fontFamily: null,
  fontSize: 8,
  fontBold: false,
  fontMode: false,      // VWF mode toggle
  glyphWidths: [],      // per-tile width (0-8), only used in fontMode
  sourceColors: [],     // detected dominant colors in the source image: [{r,g,b,count}, ...]
  paletteMapping: [],   // DMG index (0-3) for each entry in sourceColors
};
