// Core constants and palette.
export const W = 160;
export const H = 256;
export const WALL = 6;
export const L = WALL;
export const R = W - WALL;
export const PLAT_H = 6;
export const GRIND_Y = 15; // screen-space kill line under the grinder
export const STEP = 1 / 120;
export const GRAV = 540;
export const PX_PER_M = 16;

export const PAL = {
  bg: '#120a18',
  brick1: '#24152c', brick2: '#1d1124', brickN: '#2c1a35', mortar: '#0d0711',
  marker: '#3a2440',

  wallH: '#7a6a8a', wallL: '#5a4a6a', wallM: '#43354f', wallD: '#2b2133',

  platM: '#6f6488', platD: '#463d5c', rivet: '#241d33',

  steelL: '#e6e8ee', steelM: '#a7adb8', steelD: '#5d6573', steelK: '#23262e',

  blood: '#c8102e', bloodL: '#ff3048', bloodD: '#7a0a1c',
  bloodBg: '#3d0712', bloodBg2: '#520a18',

  gL: '#a6f05a', g: '#5fc83a', gD: '#2f7a25', gO: '#163d14',
  eye: '#fff6e8', pupil: '#140c1c', band: '#ffcc33', bandD: '#c98a14',
  bone: '#f4ecd8', boneD: '#bfb39a', flesh: '#ff8a7a',

  laser: '#5ef0ff', laserCore: '#ffffff', laserWarn: '#ff4f6e',
  hazard: '#ffcc33', dust: '#8a7f99', smoke: '#5a5060',

  text: '#fff6e8', textD: '#140c1c', hud: '#ffcc33', danger: '#ff3048',
};

export const BLOOD = [PAL.blood, PAL.blood, PAL.blood, PAL.bloodL, PAL.bloodD, PAL.bloodD];
export const BLOOD_BG = [PAL.bloodBg, PAL.bloodBg2, PAL.bloodD];
