// Turns the current selection into the CSS a reader can paste.

const SINGLE_VALUE = new Set(['font-variant-caps', 'font-variant-position', 'font-kerning']);

/** The few features that can also be switched *off* with a keyword. */
const SWITCHED_OFF = {
  liga: 'font-variant-ligatures: no-common-ligatures',
  clig: 'font-variant-ligatures: no-contextual',
  calt: 'font-variant-ligatures: no-contextual',
  dlig: 'font-variant-ligatures: no-discretionary-ligatures',
  hlig: 'font-variant-ligatures: no-historical-ligatures',
  kern: 'font-kerning: none',
};

const quote = (family) => (/^[A-Za-z][A-Za-z0-9\- ]*$/.test(family) ? `"${family}"` : JSON.stringify(family));

const round = (value) => (Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2))));

/** Google's css2 API wants axis tags sorted, then their ranges in the same order. */
function axisQuery(axes) {
  if (!axes.length) return '';
  const sorted = [...axes].sort((a, b) => (a.tag < b.tag ? -1 : 1));
  const tags = sorted.map((axis) => axis.tag).join(',');
  const ranges = sorted.map((axis) => `${round(axis.min)}..${round(axis.max)}`).join(',');
  return `:${tags}@${ranges}`;
}

function loadingBlock(origin, family, font) {
  if (origin.kind === 'google') {
    const axes = axisQuery(font.axes);
    return [
      `@import url("https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}${axes}&display=swap");`,
      '/* Google serves a subset — features listed here may not survive it.',
      '   Self-host the original file if you need all of them. */',
    ].join('\n');
  }
  const file = origin.fileName ?? `${family.replace(/\s+/g, '')}.woff2`;
  const format = file.endsWith('.woff2') ? 'woff2'
    : file.endsWith('.woff') ? 'woff'
      : file.endsWith('.otf') ? 'opentype' : 'truetype';
  return [
    '@font-face {',
    `  font-family: ${quote(family)};`,
    `  src: url("${file}") format("${format}");`,
    '  font-display: swap;',
    '}',
  ].join('\n');
}

/**
 * @param {object} options
 * @param {object} options.font analysis result
 * @param {object} options.origin {kind, fileName, family}
 * @param {Map<string, number>} options.features tag → value
 * @param {Map<string, number>} options.axes tag → value
 */
export function buildCss({ font, origin, features, axes }) {
  const family = font.names.family;
  const lines = [loadingBlock(origin, family, font), '', '.your-text {', `  font-family: ${quote(family)};`];

  const changedAxes = font.axes.filter((axis) => {
    const value = axes.get(axis.tag);
    return value !== undefined && value !== axis.default;
  });
  if (changedAxes.length) {
    lines.push(`  font-variation-settings: ${changedAxes
      .map((axis) => `"${axis.tag}" ${round(axes.get(axis.tag))}`)
      .join(', ')};`);
  }

  const settings = [...features.entries()].sort(([a], [b]) => a.localeCompare(b));
  if (settings.length) {
    lines.push(`  font-feature-settings: ${settings
      .map(([tag, value]) => `"${tag}" ${value}`)
      .join(', ')};`);
  }
  lines.push('}');

  const alternates = variantAlternates(font, features);
  const higher = higherLevel(font, features, changedAxes, axes);
  if (alternates.use) higher.push(`font-variant-alternates: ${alternates.use};`);

  if (higher.length) {
    lines.push('', '/* The same thing, said with the high-level properties: */');
    if (alternates.block) lines.push(...alternatesBlock(family, alternates.block));
    lines.push('.your-text {', ...higher.map((line) => `  ${line}`), '}');
  }

  return lines.join('\n');
}

const IDENT_PREFIX = {
  styleset: 'set',
  'character-variant': 'variant',
  swash: 'swash',
  stylistic: 'stylistic',
  annotation: 'annotation',
  ornaments: 'ornament',
};

/**
 * font-variant-alternates names its features rather than numbering them, so
 * anything reached through it needs an @font-feature-values block to go with
 * the declaration.
 */
function variantAlternates(font, features) {
  const declared = new Map();
  const used = new Map();

  for (const [tag, value] of [...features.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (value === 0) continue;
    const feature = font.features.find((candidate) => candidate.tag === tag);
    const variant = feature?.variantFunction;
    if (!variant) continue;

    const { kind, index } = variant;
    const ident = `${IDENT_PREFIX[kind]}-${index ?? value}`;
    const definition = index === undefined
      ? String(value)
      : (value > 1 ? `${index} ${value}` : String(index));

    if (!declared.has(kind)) declared.set(kind, new Map());
    declared.get(kind).set(ident, definition);
    if (!used.has(kind)) used.set(kind, []);
    if (!used.get(kind).includes(ident)) used.get(kind).push(ident);
  }

  if (!declared.size) return { block: null, use: null };
  return {
    block: declared,
    use: [...used.entries()].map(([kind, idents]) => `${kind}(${idents.join(', ')})`).join(' '),
  };
}

function alternatesBlock(family, declared) {
  const lines = [`@font-feature-values ${quote(family)} {`];
  for (const [kind, entries] of declared) {
    const body = [...entries].map(([ident, definition]) => `${ident}: ${definition};`).join(' ');
    lines.push(`  @${kind} { ${body} }`);
  }
  lines.push('}', '');
  return lines;
}

function higherLevel(font, features, changedAxes, axes) {
  const byProperty = new Map();
  const add = (property, value) => {
    if (SINGLE_VALUE.has(property) && byProperty.has(property)) return;
    const values = byProperty.get(property) ?? [];
    if (!values.includes(value)) values.push(value);
    byProperty.set(property, values);
  };

  for (const [tag, value] of features) {
    const feature = font.features.find((candidate) => candidate.tag === tag);
    const declaration = value === 0 ? SWITCHED_OFF[tag] : feature?.css;
    if (!declaration) continue;
    const [property, ...rest] = declaration.split(':');
    add(property.trim(), rest.join(':').trim());
  }

  for (const axis of changedAxes) {
    const value = axes.get(axis.tag);
    if (axis.tag === 'wght') add('font-weight', round(value));
    else if (axis.tag === 'wdth') add('font-stretch', `${round(value)}%`);
    else if (axis.tag === 'slnt') add('font-style', `oblique ${round(-value)}deg`);
    else if (axis.tag === 'opsz') add('font-optical-sizing', 'auto');
  }

  return [...byProperty.entries()].map(([property, values]) => `${property}: ${values.join(' ')};`);
}
