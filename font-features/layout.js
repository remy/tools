// Walks GSUB/GPOS lookups far enough to answer two questions the UI asks of
// every feature: which glyphs does it act on, and how many alternates does it
// offer? Outlines and the actual substitutions are of no interest here.

/** Coverage table → array of glyph IDs. */
function readCoverage(view, offset) {
  if (!offset || offset + 4 > view.byteLength) return [];
  const format = view.getUint16(offset);
  const glyphs = [];
  if (format === 1) {
    const count = view.getUint16(offset + 2);
    for (let i = 0; i < count; i++) glyphs.push(view.getUint16(offset + 4 + i * 2));
  } else if (format === 2) {
    const count = view.getUint16(offset + 2);
    for (let i = 0; i < count; i++) {
      const record = offset + 4 + i * 6;
      const start = view.getUint16(record);
      const end = view.getUint16(record + 2);
      for (let glyph = start; glyph <= end && glyph - start < 0xffff; glyph++) glyphs.push(glyph);
    }
  }
  return glyphs;
}

/**
 * Coverage offsets that describe a subtable's *input* glyphs. Contextual and
 * chaining subtables in format 3 list several; everything else has one at a
 * fixed position.
 */
function inputCoverages(view, type, offset) {
  const format = view.getUint16(offset);
  switch (type) {
    case 5: // (chained) context — GSUB 5/6 and GPOS 7/8 share their layout
    case 6:
      if (format === 3) {
        if (type === 5) {
          const count = view.getUint16(offset + 2);
          return Array.from({ length: count }, (_, i) => offset + view.getUint16(offset + 6 + i * 2));
        }
        const backtrack = view.getUint16(offset + 2);
        const inputOffset = offset + 4 + backtrack * 2;
        const inputCount = view.getUint16(inputOffset);
        return Array.from(
          { length: inputCount },
          (_, i) => offset + view.getUint16(inputOffset + 2 + i * 2),
        );
      }
      return [offset + view.getUint16(offset + 2)];
    default:
      return [offset + view.getUint16(offset + 2)];
  }
}

/** Alternates offered per glyph by a GSUB type 3 subtable. */
function alternateCounts(view, offset) {
  const count = view.getUint16(offset + 4);
  let most = 0;
  for (let i = 0; i < count; i++) {
    const setOffset = offset + view.getUint16(offset + 6 + i * 2);
    if (setOffset + 2 > view.byteLength) continue;
    most = Math.max(most, view.getUint16(setOffset));
  }
  return most;
}

/**
 * Read one lookup, following extension subtables, and fold what it covers
 * into `result`.
 */
function walkLookup(view, offset, kind, result) {
  if (offset + 6 > view.byteLength) return;
  const type = view.getUint16(offset);
  const subtableCount = view.getUint16(offset + 4);

  for (let i = 0; i < subtableCount; i++) {
    let subtable = offset + view.getUint16(offset + 6 + i * 2);
    let subtableType = type;
    const extensionType = kind === 'GSUB' ? 7 : 9;
    if (subtableType === extensionType) {
      if (subtable + 8 > view.byteLength) continue;
      subtableType = view.getUint16(subtable + 2);
      subtable += view.getUint32(subtable + 4);
    }
    if (subtable + 4 > view.byteLength) continue;

    // Normalise GPOS context/chaining types onto the GSUB numbering.
    const normalised = kind === 'GPOS'
      ? (subtableType === 7 ? 5 : subtableType === 8 ? 6 : subtableType)
      : subtableType;
    const contextual = normalised === 5 || normalised === 6;

    try {
      for (const coverage of inputCoverages(view, normalised, subtable)) {
        for (const glyph of readCoverage(view, coverage)) result.glyphs.add(glyph);
      }
      if (kind === 'GSUB' && normalised === 3) {
        result.alternates = Math.max(result.alternates, alternateCounts(view, subtable));
      }
      if (kind === 'GSUB' && normalised === 4) result.ligatures = true;
      if (contextual) result.contextual = true;
    } catch {
      // A malformed subtable should not take the whole report down.
    }
  }
}

/**
 * @param {DataView} view a GSUB or GPOS table
 * @param {'GSUB'|'GPOS'} kind
 * @returns {(indices: number[]) => {glyphs: Set<number>, alternates: number, ligatures: boolean, contextual: boolean}}
 */
export function makeLookupReader(view, kind) {
  const lookupListOffset = view.getUint16(8);
  const offsets = [];
  if (lookupListOffset && lookupListOffset + 2 <= view.byteLength) {
    const count = view.getUint16(lookupListOffset);
    for (let i = 0; i < count; i++) {
      offsets.push(lookupListOffset + view.getUint16(lookupListOffset + 2 + i * 2));
    }
  }
  return (indices) => {
    const result = { glyphs: new Set(), alternates: 0, ligatures: false, contextual: false };
    for (const index of indices) {
      if (offsets[index] === undefined) continue;
      walkLookup(view, offsets[index], kind, result);
    }
    return result;
  };
}
