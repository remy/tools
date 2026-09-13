// Puts the container reader, the table readers and the feature registry
// together into the single object the UI renders.

import { readFont } from './sfnt.js';
import {
  readNames, readLayoutTable, readFvar, readCmapRanges, countRanges, readMetadata,
} from './tables.js';
import { makeLookupReader } from './layout.js';
import { describeFeature, DEFAULT_ON, SHAPING_ONLY } from './features.js';

const COLOUR_TABLES = ['COLR', 'CPAL', 'SVG ', 'sbix', 'CBDT', 'CBLC'];

/** Glyph → the lowest codepoint that maps to it. */
function reverseCmap(toGlyph) {
  const reverse = new Map();
  for (const [code, glyph] of toGlyph) {
    if (!reverse.has(glyph)) reverse.set(glyph, code);
  }
  return reverse;
}

/**
 * @param {ArrayBuffer} buffer
 * @param {{source?: string, fileName?: string, subset?: boolean}} [origin]
 */
export async function analyseFont(buffer, origin = {}) {
  const { format, flavour, tables } = await readFont(buffer);
  const names = readNames(tables.get('name'));
  const { ranges, toGlyph } = readCmapRanges(tables.get('cmap'));
  const toCharacter = reverseCmap(toGlyph);

  const byTag = new Map();
  for (const kind of ['GSUB', 'GPOS']) {
    const view = tables.get(kind);
    if (!view || view.byteLength < 10) continue;
    const { features } = readLayoutTable(view);
    const read = makeLookupReader(view, kind);

    for (const feature of features) {
      const coverage = read(feature.lookupIndices);
      const existing = byTag.get(feature.tag) ?? {
        ...describeFeature(feature.tag),
        tables: [],
        scripts: new Set(),
        characters: [],
        alternates: 0,
        contextual: false,
        ligatures: false,
        glyphCount: 0,
      };
      existing.tables.push(kind);
      existing.alternates = Math.max(existing.alternates, coverage.alternates);
      existing.contextual ||= coverage.contextual;
      existing.ligatures ||= coverage.ligatures;
      existing.glyphCount += coverage.glyphs.size;
      for (const script of feature.scripts) existing.scripts.add(script);

      // A CJK font can put tens of thousands of glyphs behind one feature;
      // a few hundred is already more than the UI will ever show.
      const characters = new Set(existing.characters);
      for (const glyph of coverage.glyphs) {
        if (characters.size >= 400) break;
        const code = toCharacter.get(glyph);
        if (code !== undefined && code > 0x20) characters.add(String.fromCodePoint(code));
      }
      existing.characters = [...characters];
      byTag.set(feature.tag, existing);
    }
  }

  const features = [...byTag.values()]
    .map((feature) => ({
      ...feature,
      scripts: [...feature.scripts].sort(),
      characters: feature.characters.sort((a, b) => a.localeCompare(b)),
      defaultOn: DEFAULT_ON.has(feature.tag),
      shapingOnly: SHAPING_ONLY.has(feature.tag),
    }))
    .sort((a, b) => a.tag.localeCompare(b.tag));

  const { axes, instances } = readFvar(tables.get('fvar'), names);

  return {
    format,
    flavour,
    source: origin.source ?? 'file',
    fileName: origin.fileName ?? null,
    subset: origin.subset === true,
    byteLength: buffer.byteLength,
    names: {
      family: names.get(16) ?? names.get(1) ?? origin.fileName ?? 'Unnamed font',
      subfamily: names.get(17) ?? names.get(2) ?? null,
      full: names.get(4) ?? null,
      version: names.get(5) ?? null,
      designer: names.get(9) ?? null,
      manufacturer: names.get(8) ?? null,
      licence: names.get(13) ?? null,
      licenceURL: names.get(14) ?? null,
      copyright: names.get(0) ?? null,
    },
    metadata: readMetadata(tables),
    features,
    axes,
    instances,
    characters: { ranges, count: countRanges(ranges) },
    tableTags: [...tables.keys()].sort(),
    colour: COLOUR_TABLES.filter((table) => tables.has(table)).map((table) => table.trim()),
    hasKernTable: tables.has('kern'),
  };
}
