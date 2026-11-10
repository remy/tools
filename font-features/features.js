// The OpenType feature registry, trimmed to what a web author needs: a human
// name, the group it belongs to, a sample string that shows it off, and the
// high-level CSS property that switches it on where one exists.

/** Features browsers enable without being asked. */
export const DEFAULT_ON = new Set([
  'abvm', 'abvs', 'akhn', 'blwm', 'blws', 'calt', 'ccmp', 'cjct', 'clig',
  'curs', 'dist', 'fina', 'half', 'haln', 'init', 'isol', 'kern', 'liga',
  'locl', 'mark', 'medi', 'mkmk', 'nukt', 'pref', 'pres', 'pstf', 'psts',
  'rclt', 'rkrf', 'rlig', 'rphf', 'rvrn', 'vatu',
]);

/** Features applied by the shaper for a script and not usefully toggled. */
export const SHAPING_ONLY = new Set([
  'abvf', 'abvm', 'abvs', 'akhn', 'blwf', 'blwm', 'blws', 'cfar', 'cjct',
  'curs', 'dist', 'dtls', 'fin2', 'fin3', 'fina', 'flac', 'half', 'haln',
  'init', 'isol', 'ljmo', 'mark', 'med2', 'medi', 'mkmk', 'mset', 'nukt',
  'pref', 'pres', 'pstf', 'psts', 'rkrf', 'rphf', 'rvrn', 'ssty', 'stch',
  'tjmo', 'vatu', 'vjmo',
]);

const G = {
  lig: 'Ligatures',
  case: 'Capitals & letterforms',
  num: 'Numerals & fractions',
  alt: 'Alternates & stylistic sets',
  pos: 'Kerning, spacing & position',
  cjk: 'CJK & vertical',
  script: 'Script shaping',
  other: 'Other',
};

const SAMPLES = {
  lig: 'fi fl ffi ffl st ct',
  case: 'Hamburgefonstiv',
  num: '0123456789',
  alt: 'Hamburgefonstiv 0123456789',
  pos: 'AVATAR To Wave 11',
  cjk: '日本語 カタカナ',
  script: 'Hamburgefonstiv',
  other: 'Hamburgefonstiv 0123456789',
};

/**
 * tag: [name, group, sample?, css?]
 * `css` is the equivalent high-level declaration, when one exists.
 */
const REGISTRY = {
  aalt: ['Access All Alternates', G.alt, 'Hamburgefonstiv'],
  abvf: ['Above-base Forms', G.script],
  abvm: ['Above-base Mark Positioning', G.script],
  abvs: ['Above-base Substitutions', G.script],
  afrc: ['Alternative (stacked) Fractions', G.num, '1/2 3/4 5/8', 'font-variant-numeric: stacked-fractions'],
  akhn: ['Akhand', G.script],
  apkn: ['Kerning for Alternate Proportional Widths', G.cjk],
  blwf: ['Below-base Forms', G.script],
  blwm: ['Below-base Mark Positioning', G.script],
  blws: ['Below-base Substitutions', G.script],
  calt: ['Contextual Alternates', G.alt, 'Hamburgefonstiv 1/2', 'font-variant-ligatures: contextual'],
  case: ['Case-Sensitive Forms', G.case, '¿HOLA? (H-A-M) [1–2]'],
  ccmp: ['Glyph Composition / Decomposition', G.script],
  cfar: ['Conjunct Form After Ro', G.script],
  chws: ['Contextual Half-width Spacing', G.cjk],
  cjct: ['Conjunct Forms', G.script],
  clig: ['Contextual Ligatures', G.lig, 'fi fl act stay', 'font-variant-ligatures: contextual'],
  cpct: ['Centred CJK Punctuation', G.cjk],
  cpsp: ['Capital Spacing', G.pos, 'HAMBURGEFONSTIV'],
  cswh: ['Contextual Swash', G.alt, 'Quick Jazzy Waltz'],
  curs: ['Cursive Positioning', G.script],
  c2pc: ['Petite Capitals From Capitals', G.case, 'Hamburgefonstiv', 'font-variant-caps: all-petite-caps'],
  c2sc: ['Small Capitals From Capitals', G.case, 'Hamburgefonstiv', 'font-variant-caps: all-small-caps'],
  dist: ['Distances', G.script],
  dlig: ['Discretionary Ligatures', G.lig, 'st ct sp Th ligature', 'font-variant-ligatures: discretionary-ligatures'],
  dnom: ['Denominators', G.num, '1/2 3/4'],
  dtls: ['Dotless Forms', G.script],
  expt: ['Expert Forms', G.cjk],
  falt: ['Final Glyph on Line Alternates', G.alt],
  fin2: ['Terminal Forms #2', G.script],
  fin3: ['Terminal Forms #3', G.script],
  fina: ['Terminal Forms', G.script],
  flac: ['Flattened Accent Forms', G.script],
  frac: ['Fractions', G.num, '1/2 3/4 7/16', 'font-variant-numeric: diagonal-fractions'],
  fwid: ['Full Widths', G.cjk, 'ABC 123', 'font-variant-east-asian: full-width'],
  half: ['Half Forms', G.script],
  haln: ['Halant Forms', G.script],
  halt: ['Alternate Half Widths', G.cjk],
  hist: ['Historical Forms', G.case, 'Massachusetts', 'font-variant-alternates: historical-forms'],
  hkna: ['Horizontal Kana Alternates', G.cjk],
  hlig: ['Historical Ligatures', G.lig, 'ct st sp aſſiſt', 'font-variant-ligatures: historical-ligatures'],
  hngl: ['Hangul', G.cjk],
  hojo: ['Hojo Kanji Forms', G.cjk],
  hwid: ['Half Widths', G.cjk, 'ABC 123', 'font-variant-east-asian: proportional-width'],
  init: ['Initial Forms', G.script],
  isol: ['Isolated Forms', G.script],
  ital: ['Italics', G.case, 'Hamburgefonstiv'],
  jalt: ['Justification Alternates', G.alt],
  jp78: ['JIS78 Forms', G.cjk, '辻餌', 'font-variant-east-asian: jis78'],
  jp83: ['JIS83 Forms', G.cjk, '辻餌', 'font-variant-east-asian: jis83'],
  jp90: ['JIS90 Forms', G.cjk, '辻餌', 'font-variant-east-asian: jis90'],
  jp04: ['JIS2004 Forms', G.cjk, '辻餌', 'font-variant-east-asian: jis04'],
  kern: ['Kerning', G.pos, 'AVATAR To Wave LY', 'font-kerning: normal'],
  lfbd: ['Left Bounds', G.pos],
  liga: ['Standard Ligatures', G.lig, 'fi fl ffi ffl fj', 'font-variant-ligatures: common-ligatures'],
  ljmo: ['Leading Jamo Forms', G.script],
  lnum: ['Lining Figures', G.num, '0123456789', 'font-variant-numeric: lining-nums'],
  locl: ['Localised Forms', G.alt, 'Ştiţi çğı'],
  ltra: ['Left-to-right Alternates', G.script],
  ltrm: ['Left-to-right Mirrored Forms', G.script],
  mark: ['Mark Positioning', G.script],
  med2: ['Medial Forms #2', G.script],
  medi: ['Medial Forms', G.script],
  mgrk: ['Mathematical Greek', G.other, 'Δ Σ Ω π'],
  mkmk: ['Mark to Mark Positioning', G.script],
  mset: ['Mark Positioning via Substitution', G.script],
  nalt: ['Alternate Annotation Forms', G.alt, '1 2 3 A B C'],
  nlck: ['NLC Kanji Forms', G.cjk],
  nukt: ['Nukta Forms', G.script],
  numr: ['Numerators', G.num, '1/2 3/4'],
  onum: ['Oldstyle Figures', G.num, '0123456789', 'font-variant-numeric: oldstyle-nums'],
  opbd: ['Optical Bounds', G.pos, '“Quoted” text'],
  ordn: ['Ordinals', G.num, '1st 2nd 3o 4a No', 'font-variant-numeric: ordinal'],
  ornm: ['Ornaments', G.alt, 'a b c d e f'],
  palt: ['Proportional Alternate Widths', G.cjk],
  pcap: ['Petite Capitals', G.case, 'Hamburgefonstiv', 'font-variant-caps: petite-caps'],
  pkna: ['Proportional Kana', G.cjk],
  pnum: ['Proportional Figures', G.num, '0123456789\n1111 0000', 'font-variant-numeric: proportional-nums'],
  pref: ['Pre-base Forms', G.script],
  pres: ['Pre-base Substitutions', G.script],
  pstf: ['Post-base Forms', G.script],
  psts: ['Post-base Substitutions', G.script],
  pwid: ['Proportional Widths', G.cjk, 'ABC 123', 'font-variant-east-asian: proportional-width'],
  qwid: ['Quarter Widths', G.cjk],
  rand: ['Randomise', G.alt, 'aaaa bbbb cccc'],
  rclt: ['Required Contextual Alternates', G.script],
  rkrf: ['Rakar Forms', G.script],
  rlig: ['Required Ligatures', G.lig],
  rphf: ['Reph Forms', G.script],
  rtbd: ['Right Bounds', G.pos],
  rtla: ['Right-to-left Alternates', G.script],
  rtlm: ['Right-to-left Mirrored Forms', G.script],
  ruby: ['Ruby Notation Forms', G.cjk, 'かな', 'font-variant-east-asian: ruby'],
  rvrn: ['Required Variation Alternates', G.script],
  salt: ['Stylistic Alternates', G.alt, 'Hamburgefonstiv 1234'],
  sinf: ['Scientific Inferiors', G.num, 'H2O CO2', 'font-variant-position: sub'],
  size: ['Optical Size', G.other],
  smcp: ['Small Capitals', G.case, 'Hamburgefonstiv', 'font-variant-caps: small-caps'],
  smpl: ['Simplified Forms', G.cjk, '説麹', 'font-variant-east-asian: simplified'],
  ssty: ['Math Script Style Alternates', G.script],
  stch: ['Stretching Glyph Decomposition', G.script],
  subs: ['Subscript', G.num, 'H2O x1 CO2', 'font-variant-position: sub'],
  sups: ['Superscript', G.num, 'x2 1st 30o', 'font-variant-position: super'],
  swsh: ['Swash', G.alt, 'Quick Jazzy Waltz'],
  titl: ['Titling', G.case, 'HAMBURGEFONSTIV', 'font-variant-caps: titling-caps'],
  tjmo: ['Trailing Jamo Forms', G.script],
  tnam: ['Traditional Name Forms', G.cjk, '説麹', 'font-variant-east-asian: traditional'],
  tnum: ['Tabular Figures', G.num, '0123456789\n1111 0000', 'font-variant-numeric: tabular-nums'],
  trad: ['Traditional Forms', G.cjk, '説麹', 'font-variant-east-asian: traditional'],
  twid: ['Third Widths', G.cjk],
  unic: ['Unicase', G.case, 'Hamburgefonstiv', 'font-variant-caps: unicase'],
  valt: ['Alternate Vertical Metrics', G.cjk],
  vatu: ['Vattu Variants', G.script],
  vchw: ['Vertical Contextual Half-width Spacing', G.cjk],
  vert: ['Vertical Alternates', G.cjk],
  vhal: ['Alternate Vertical Half Metrics', G.cjk],
  vjmo: ['Vowel Jamo Forms', G.script],
  vkna: ['Vertical Kana Alternates', G.cjk],
  vkrn: ['Vertical Kerning', G.cjk],
  vpal: ['Proportional Alternate Vertical Metrics', G.cjk],
  vrt2: ['Vertical Alternates and Rotation', G.cjk],
  vrtr: ['Vertical Alternates for Rotation', G.cjk],
  zero: ['Slashed Zero', G.num, '0 1000 0.05', 'font-variant-numeric: slashed-zero'],
};

export const GROUP_ORDER = [G.lig, G.case, G.num, G.alt, G.pos, G.cjk, G.script, G.other];

/**
 * Features reachable through font-variant-alternates, which needs a name
 * declared in an @font-feature-values block rather than a plain keyword.
 */
const VARIANT_FUNCTIONS = {
  swsh: { kind: 'swash' },
  salt: { kind: 'stylistic' },
  nalt: { kind: 'annotation' },
  ornm: { kind: 'ornaments' },
};

/**
 * Describe a feature tag, including the numbered ranges (ss01–ss20,
 * cv01–cv99) that are not listed individually.
 * @param {string} tag
 */
export function describeFeature(tag) {
  const entry = REGISTRY[tag];
  if (entry) {
    const [name, group, sample, css] = entry;
    return {
      tag,
      name,
      group,
      sample: sample ?? SAMPLES[group] ?? SAMPLES.other,
      css: css ?? null,
      variantFunction: VARIANT_FUNCTIONS[tag] ?? null,
    };
  }
  if (/^ss[0-9]{2}$/.test(tag)) {
    const index = Number(tag.slice(2));
    return {
      tag,
      name: `Stylistic Set ${index}`,
      group: G.alt,
      sample: 'Hamburgefonstiv 0123456789',
      css: null,
      variantFunction: { kind: 'styleset', index },
    };
  }
  if (/^cv[0-9]{2}$/.test(tag)) {
    const index = Number(tag.slice(2));
    return {
      tag,
      name: `Character Variant ${index}`,
      group: G.alt,
      sample: 'Hamburgefonstiv 0123456789',
      css: null,
      variantFunction: { kind: 'character-variant', index },
    };
  }
  return {
    tag,
    name: 'Unregistered feature',
    group: G.other,
    sample: SAMPLES.other,
    css: null,
    variantFunction: null,
  };
}

const AXIS_NAMES = {
  wght: 'Weight',
  wdth: 'Width',
  slnt: 'Slant',
  ital: 'Italic',
  opsz: 'Optical Size',
  GRAD: 'Grade',
  XTRA: 'Counter Width',
  XOPQ: 'Thick Stroke',
  YOPQ: 'Thin Stroke',
  YTLC: 'Lowercase Height',
  YTUC: 'Uppercase Height',
  YTAS: 'Ascender Height',
  YTDE: 'Descender Depth',
  YTFI: 'Figure Height',
  MONO: 'Monospace',
  CASL: 'Casual',
  CRSV: 'Cursive',
  SOFT: 'Softness',
  WONK: 'Wonky',
  FILL: 'Fill',
  ROND: 'Roundness',
};

/** The CSS property that maps to a registered axis, if any. */
export const AXIS_CSS = {
  wght: 'font-weight',
  wdth: 'font-stretch',
  slnt: 'font-style: oblique',
  ital: 'font-style: italic',
  opsz: 'font-optical-sizing',
};

export const describeAxis = (tag) => AXIS_NAMES[tag] ?? null;
