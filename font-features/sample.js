// Choosing the text to demonstrate a feature with. The registry's suggestion
// is used when the font can render it and it actually contains characters the
// feature touches; otherwise the affected characters themselves are the
// sample, which is what makes character variants and stylistic sets legible.

import { rangesHave } from './tables.js';

const INVISIBLE = /[\p{M}\p{C}\p{Z}]/u;

export function makeSampler(font) {
  const has = (character) => rangesHave(font.characters.ranges, character.codePointAt(0));
  const renderable = (text) => [...text].every((character) => /\s/.test(character) || has(character));

  return function sampleFor(feature) {
    const visible = feature.characters.filter((character) => !INVISIBLE.test(character));
    const suggestion = feature.sample;
    const touches = [...suggestion].some((character) => visible.includes(character));

    // Ligature and contextual features only show themselves in running text,
    // so the suggested string is the only useful sample.
    if (renderable(suggestion) && (touches || feature.ligatures || feature.contextual)) {
      return { text: suggestion, fromFont: false };
    }
    if (visible.length) {
      return { text: visible.slice(0, 16).join(' '), fromFont: true };
    }
    return { text: suggestion, fromFont: false };
  };
}

/** A default for the big preview: a pangram the font can actually render. */
export function previewText(font) {
  const pangram = 'Sphinx of black quartz, judge my vow — 0123456789';
  const missing = [...pangram].filter(
    (character) => !/\s/.test(character) && !rangesHave(font.characters.ranges, character.codePointAt(0)),
  );
  if (missing.length < 3) return pangram;

  const sample = [];
  for (const [start, end] of font.characters.ranges) {
    for (let code = start; code <= end && sample.length < 48; code++) {
      const character = String.fromCodePoint(code);
      if (!INVISIBLE.test(character)) sample.push(character);
    }
    if (sample.length >= 48) break;
  }
  return sample.join('');
}
