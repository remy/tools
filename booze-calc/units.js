/** Volume and strength unit conversion, plus the number formatting helpers. */

export const VOLUME_UNITS = {
  ml: { label: 'ml', ml: 1 },
  cl: { label: 'cl', ml: 10 },
  oz: { label: 'fl oz', ml: 29.5735295625 },
};

export const toMl = (amount, unit) => amount * VOLUME_UNITS[unit].ml;
export const fromMl = (ml, unit) => ml / VOLUME_UNITS[unit].ml;

/** Strength inputs hold either proof or ABV; internally everything is ABV. */
export const strengthToAbv = (value, unit) => (unit === 'proof' ? value / 2 : value);
export const abvToStrength = (abv, unit) => (unit === 'proof' ? abv * 2 : abv);

/** Trim trailing zeros so converted values read like something a person typed. */
export function tidy(value, places = 2) {
  if (!Number.isFinite(value)) return '';
  return String(Number(value.toFixed(places)));
}

export function round(value, places = 1) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
