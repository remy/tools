// Font palette: light (bg), dark (ink), magenta (width marker)
export const PALETTE = [
  { r: 224, g: 248, b: 208 }, // 0 - Light
  { r:   8, g:  24, b:  32 }, // 1 - Dark
  { r: 255, g:   0, b: 255 }, // 2 - Magenta
];

export const PALETTE_CSS = ['#e0f8d0', '#081820', '#ff00ff'];

// ASCII 32 (space) through 126 (~) = 95 printable characters
export const FIRST_CHAR = 32;
export const LAST_CHAR = 126;
export const GLYPH_COUNT = LAST_CHAR - FIRST_CHAR + 1;

export const GRID_TILE_SIZE = 16; // px per tile in grid overview
export const ZOOM_PX = 40;       // px per pixel in zoom editor
export const ZOOM_STEPS = [1, 2, 3, 4, 6, 8];
