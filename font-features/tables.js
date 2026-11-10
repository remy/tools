// Readers for the individual SFNT tables this tool cares about: names, layout
// features (GSUB/GPOS), variation axes (fvar), and a little metadata.

const F16D16 = 65536;

const tagAt = (view, offset) =>
  String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );

/* -------------------------------------------------------------- name ---- */

const MAC_ROMAN_HIGH = 'ÄÅÇÉÑÖÜáàâäãåçéè';

function decodeName(view, offset, length, platformID) {
  if (platformID === 3 || platformID === 0) {
    let out = '';
    for (let i = 0; i < length - 1; i += 2) out += String.fromCharCode(view.getUint16(offset + i));
    return out;
  }
  let out = '';
  for (let i = 0; i < length; i++) {
    const code = view.getUint8(offset + i);
    out += code < 0x80 ? String.fromCharCode(code)
      : (code < 0x90 ? MAC_ROMAN_HIGH[code - 0x80] : String.fromCharCode(code));
  }
  return out;
}

/**
 * All strings from the `name` table, keyed by name ID. Windows/English wins
 * over Mac when both are present.
 * @returns {Map<number, string>}
 */
export function readNames(view) {
  const names = new Map();
  if (!view) return names;
  const count = view.getUint16(2);
  const storage = view.getUint16(4);
  for (let i = 0; i < count; i++) {
    const record = 6 + i * 12;
    if (record + 12 > view.byteLength) break;
    const platformID = view.getUint16(record);
    const languageID = view.getUint16(record + 4);
    const nameID = view.getUint16(record + 6);
    const length = view.getUint16(record + 8);
    const offset = storage + view.getUint16(record + 10);
    if (offset + length > view.byteLength) continue;
    const preferred = platformID === 3 && languageID === 0x0409;
    if (names.has(nameID) && !preferred) continue;
    const value = decodeName(view, offset, length, platformID).trim();
    if (value) names.set(nameID, value);
  }
  return names;
}

/* ---------------------------------------------------------- GSUB/GPOS ---- */

function readScriptList(view, offset) {
  // → Map<featureIndex, Set<"scrp/lang">>
  const usage = new Map();
  const scripts = [];
  if (offset === 0 || offset >= view.byteLength) return { usage, scripts };
  const count = view.getUint16(offset);
  for (let i = 0; i < count; i++) {
    const record = offset + 2 + i * 6;
    const script = tagAt(view, record);
    const scriptOffset = offset + view.getUint16(record + 4);
    scripts.push(script);
    const langSystems = [];
    const defaultOffset = view.getUint16(scriptOffset);
    if (defaultOffset) langSystems.push(['dflt', scriptOffset + defaultOffset]);
    const langCount = view.getUint16(scriptOffset + 2);
    for (let j = 0; j < langCount; j++) {
      const langRecord = scriptOffset + 4 + j * 6;
      langSystems.push([
        tagAt(view, langRecord),
        scriptOffset + view.getUint16(langRecord + 4),
      ]);
    }
    for (const [lang, langOffset] of langSystems) {
      const required = view.getUint16(langOffset + 2);
      const featureCount = view.getUint16(langOffset + 4);
      const indices = required === 0xffff ? [] : [required];
      for (let k = 0; k < featureCount; k++) indices.push(view.getUint16(langOffset + 6 + k * 2));
      for (const index of indices) {
        if (!usage.has(index)) usage.set(index, new Set());
        usage.get(index).add(lang === 'dflt' ? script : `${script}/${lang}`);
      }
    }
  }
  return { usage, scripts };
}

/**
 * Feature tags declared by a GSUB or GPOS table.
 * @returns {{features: Array<{tag: string, lookupIndices: number[], scripts: string[]}>, scripts: string[]}}
 */
export function readLayoutTable(view) {
  if (!view || view.byteLength < 10) return { features: [], scripts: [] };
  const { usage, scripts } = readScriptList(view, view.getUint16(4));
  const featureListOffset = view.getUint16(6);
  const features = new Map();
  if (!featureListOffset || featureListOffset >= view.byteLength) return { features: [], scripts };
  const count = view.getUint16(featureListOffset);
  for (let i = 0; i < count; i++) {
    const record = featureListOffset + 2 + i * 6;
    if (record + 6 > view.byteLength) break;
    const featureTag = tagAt(view, record);
    const featureOffset = featureListOffset + view.getUint16(record + 4);
    const existing = features.get(featureTag)
      ?? { tag: featureTag, lookupIndices: new Set(), scripts: new Set() };
    if (featureOffset + 4 <= view.byteLength) {
      const lookupCount = view.getUint16(featureOffset + 2);
      for (let j = 0; j < lookupCount; j++) {
        existing.lookupIndices.add(view.getUint16(featureOffset + 4 + j * 2));
      }
    }
    for (const script of usage.get(i) ?? []) existing.scripts.add(script);
    features.set(featureTag, existing);
  }
  return {
    features: [...features.values()].map((f) => ({
      tag: f.tag,
      lookupIndices: [...f.lookupIndices],
      scripts: [...f.scripts].sort(),
    })),
    scripts,
  };
}

/* -------------------------------------------------------------- fvar ---- */

/**
 * Variation axes and named instances.
 * @returns {{axes: Array, instances: Array}}
 */
export function readFvar(view, names) {
  if (!view || view.byteLength < 16) return { axes: [], instances: [] };
  const axesOffset = view.getUint16(4);
  const axisCount = view.getUint16(8);
  const axisSize = view.getUint16(10);
  const instanceCount = view.getUint16(12);
  const instanceSize = view.getUint16(14);

  const axes = [];
  for (let i = 0; i < axisCount; i++) {
    const record = axesOffset + i * axisSize;
    if (record + 20 > view.byteLength) break;
    const nameID = view.getUint16(record + 18);
    axes.push({
      tag: tagAt(view, record),
      min: view.getInt32(record + 4) / F16D16,
      default: view.getInt32(record + 8) / F16D16,
      max: view.getInt32(record + 12) / F16D16,
      hidden: (view.getUint16(record + 16) & 0x0001) === 1,
      name: names.get(nameID) ?? null,
    });
  }

  const instances = [];
  const instancesOffset = axesOffset + axisCount * axisSize;
  for (let i = 0; i < instanceCount; i++) {
    const record = instancesOffset + i * instanceSize;
    if (record + 4 + axisCount * 4 > view.byteLength) break;
    const coords = {};
    for (let j = 0; j < axes.length; j++) {
      coords[axes[j].tag] = view.getInt32(record + 4 + j * 4) / F16D16;
    }
    instances.push({
      name: names.get(view.getUint16(record)) ?? `Instance ${i + 1}`,
      coords,
    });
  }
  return { axes, instances };
}

/* -------------------------------------------------------------- cmap ---- */

/** Character coverage: sorted [start, end] ranges plus a codepoint → glyph map. */
export function readCmapRanges(view) {
  if (!view || view.byteLength < 4) return { ranges: [], toGlyph: new Map() };
  const numTables = view.getUint16(2);
  let best = 0;
  let bestScore = -1;
  for (let i = 0; i < numTables; i++) {
    const record = 4 + i * 8;
    if (record + 8 > view.byteLength) break;
    const platformID = view.getUint16(record);
    const encodingID = view.getUint16(record + 2);
    const offset = view.getUint32(record + 4);
    // Prefer a full-repertoire Unicode subtable, then a BMP one.
    const score = (platformID === 3 && encodingID === 10) ? 4
      : (platformID === 0 && encodingID >= 4) ? 3
        : (platformID === 3 && encodingID === 1) ? 2
          : (platformID === 0) ? 1 : 0;
    if (score > bestScore && offset < view.byteLength) {
      bestScore = score;
      best = offset;
    }
  }
  if (bestScore < 0) return { ranges: [], toGlyph: new Map() };

  const format = view.getUint16(best);
  const ranges = [];
  const toGlyph = new Map();
  if (format === 4) {
    const segCount = view.getUint16(best + 6) / 2;
    const endBase = best + 14;
    const startBase = endBase + segCount * 2 + 2;
    const deltaBase = startBase + segCount * 2;
    const rangeOffsetBase = deltaBase + segCount * 2;
    for (let i = 0; i < segCount; i++) {
      const end = view.getUint16(endBase + i * 2);
      const start = view.getUint16(startBase + i * 2);
      if (start > end || start === 0xffff) continue;
      ranges.push([start, end]);
      const delta = view.getInt16(deltaBase + i * 2);
      const rangeOffset = view.getUint16(rangeOffsetBase + i * 2);
      for (let code = start; code <= end; code++) {
        let glyph;
        if (rangeOffset === 0) {
          glyph = (code + delta) & 0xffff;
        } else {
          const at = rangeOffsetBase + i * 2 + rangeOffset + (code - start) * 2;
          if (at + 2 > view.byteLength) continue;
          glyph = view.getUint16(at);
          if (glyph) glyph = (glyph + delta) & 0xffff;
        }
        if (glyph) toGlyph.set(code, glyph);
      }
    }
  } else if (format === 12) {
    const groups = view.getUint32(best + 12);
    for (let i = 0; i < groups; i++) {
      const record = best + 16 + i * 12;
      if (record + 12 > view.byteLength) break;
      const start = view.getUint32(record);
      const end = view.getUint32(record + 4);
      const startGlyph = view.getUint32(record + 8);
      ranges.push([start, end]);
      for (let code = start; code <= end; code++) toGlyph.set(code, startGlyph + (code - start));
    }
  } else if (format === 6) {
    const first = view.getUint16(best + 6);
    const count = view.getUint16(best + 8);
    if (count) ranges.push([first, first + count - 1]);
    for (let i = 0; i < count; i++) toGlyph.set(first + i, view.getUint16(best + 10 + i * 2));
  }
  ranges.sort((a, b) => a[0] - b[0]);
  return { ranges, toGlyph };
}

export function rangesHave(ranges, codepoint) {
  let low = 0;
  let high = ranges.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (codepoint < ranges[mid][0]) high = mid - 1;
    else if (codepoint > ranges[mid][1]) low = mid + 1;
    else return true;
  }
  return false;
}

export function countRanges(ranges) {
  return ranges.reduce((total, [start, end]) => total + (end - start + 1), 0);
}

/* ---------------------------------------------------------- metadata ---- */

const WIDTH_CLASS = [
  null, 'Ultra-condensed', 'Extra-condensed', 'Condensed', 'Semi-condensed',
  'Normal', 'Semi-expanded', 'Expanded', 'Extra-expanded', 'Ultra-expanded',
];

export function readMetadata(tables) {
  const head = tables.get('head');
  const os2 = tables.get('OS/2');
  const maxp = tables.get('maxp');
  const post = tables.get('post');
  return {
    unitsPerEm: head && head.byteLength >= 20 ? head.getUint16(18) : null,
    glyphCount: maxp && maxp.byteLength >= 6 ? maxp.getUint16(4) : null,
    weightClass: os2 && os2.byteLength >= 6 ? os2.getUint16(4) : null,
    widthClass: os2 && os2.byteLength >= 8 ? (WIDTH_CLASS[os2.getUint16(6)] ?? null) : null,
    italic: head && head.byteLength >= 46 ? (head.getUint16(44) & 0x0002) !== 0 : null,
    monospaced: post && post.byteLength >= 16 ? post.getUint32(12) !== 0 : null,
  };
}
