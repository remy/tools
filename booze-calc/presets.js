/**
 * Typical bottle strengths, in ABV. Picking a name from the datalist fills the
 * strength field in — they are starting points, not gospel; read your label.
 */

export const SPIRITS = [
  ['Vodka', 40],
  ['Gin', 40],
  ['London dry gin', 43],
  ['Navy strength gin', 57],
  ['White rum', 40],
  ['Dark rum', 40],
  ['Overproof rum', 63],
  ['Tequila blanco', 40],
  ['Mezcal', 45],
  ['Bourbon', 45],
  ['Rye whiskey', 45],
  ['Scotch whisky', 40],
  ['Irish whiskey', 40],
  ['Cask strength whisky', 58],
  ['Cognac', 40],
  ['Brandy', 40],
  ['Absinthe', 68],
  ['Everclear', 95],
];

export const ALCOHOLIC_MIXERS = [
  ['Triple sec / Cointreau', 40],
  ['Amaretto', 28],
  ['Coffee liqueur', 20],
  ['Cream liqueur', 17],
  ['Elderflower liqueur', 20],
  ['Sweet vermouth', 16],
  ['Dry vermouth', 18],
  ['Campari', 25],
  ['Aperol', 11],
  ['Port', 20],
  ['Sherry', 17],
  ['Prosecco', 11],
  ['Champagne', 12],
  ['Red wine', 13.5],
  ['White wine', 12],
  ['Lager', 4.5],
  ['Cider', 4.5],
  ['Ginger wine', 13.5],
  ['Angostura bitters', 44.7],
];

export const SOFT_MIXERS = [
  'Tonic water',
  'Soda water',
  'Cola',
  'Lemonade',
  'Ginger ale',
  'Ginger beer',
  'Orange juice',
  'Pineapple juice',
  'Cranberry juice',
  'Tomato juice',
  'Lime juice',
  'Lemon juice',
  'Simple syrup',
  'Grenadine',
  'Coconut cream',
  'Cold brew coffee',
  'Milk',
  'Cream',
  'Iced tea',
  'Water / melted ice',
];

/** Name → ABV, for auto-filling the strength when a preset is chosen. */
export const STRENGTH_BY_NAME = new Map(
  [...SPIRITS, ...ALCOHOLIC_MIXERS].map(([name, abv]) => [name.toLowerCase(), abv]),
);

/** Dilution presets — roughly what each technique melts into the glass. */
export const DILUTIONS = [
  ['0', 'No dilution'],
  ['25', 'Stirred (~25%)'],
  ['30', 'Shaken (~30%)'],
  ['40', 'Blended (~40%)'],
];
