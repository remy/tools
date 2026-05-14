#!/usr/bin/env node
// Build data.json from Unicode CLDR annotations and emoji-test.txt.
// Run from repo root or tool dir; output is written next to this script's parent.

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, '..', 'data.json');

const EMOJI_VERSION = '15.1';

const URLS = {
  emojiTest: `https://unicode.org/Public/emoji/${EMOJI_VERSION}/emoji-test.txt`,
  annotations: 'https://cdn.jsdelivr.net/npm/cldr-annotations-full/annotations/en/annotations.json',
  derived: 'https://cdn.jsdelivr.net/npm/cldr-annotations-derived-full/annotationsDerived/en/annotations.json',
};

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed ${res.status} ${url}`);
  return res.text();
}

async function fetchJSON(url) {
  return JSON.parse(await fetchText(url));
}

// CLDR JSON nests annotations under annotations.annotations[<emoji char>].
function loadAnnotations(json) {
  return json?.annotations?.annotations ?? json?.annotationsDerived?.annotations ?? {};
}

function codepointKey(emojiChar) {
  // Convert an emoji string to canonical hex-joined codepoint key, e.g. "1F600" or "1F468-200D-1F4BB".
  const parts = [];
  for (const cp of emojiChar) {
    parts.push(cp.codePointAt(0).toString(16).toUpperCase());
  }
  return parts.join('-');
}

function parseEmojiTest(text) {
  // Lines look like:
  //   1F600                                                  ; fully-qualified     # 😀 E1.0 grinning face
  //   1F636 200D 1F32B FE0F                                  ; fully-qualified     # 😶‍🌫️ E13.1 face in clouds
  //
  // Group/subgroup markers:
  //   # group: Smileys & Emotion
  //   # subgroup: face-smiling
  let group = '';
  let subgroup = '';
  const rows = [];

  for (const line of text.split('\n')) {
    if (line.startsWith('# group:')) {
      group = line.slice('# group:'.length).trim();
      continue;
    }
    if (line.startsWith('# subgroup:')) {
      subgroup = line.slice('# subgroup:'.length).trim();
      continue;
    }
    if (!line || line.startsWith('#')) continue;

    const semi = line.indexOf(';');
    const hash = line.indexOf('#');
    if (semi < 0 || hash < 0) continue;

    const status = line.slice(semi + 1, hash).trim();
    if (status !== 'fully-qualified') continue;

    const cps = line.slice(0, semi).trim().split(/\s+/);
    const cpKey = cps.join('-').toUpperCase();
    const emojiChar = String.fromCodePoint(...cps.map((c) => parseInt(c, 16)));

    // After the hash: "😀 E1.0 grinning face" — strip the emoji + version token.
    const afterHash = line.slice(hash + 1).trim();
    const tokens = afterHash.split(/\s+/);
    // tokens[0] = the emoji glyph itself; tokens[1] looks like "E1.0"; rest = name.
    const name = tokens.slice(2).join(' ');

    rows.push({
      g: emojiChar,
      cp: cpKey,
      grp: group,
      sub: subgroup,
      name, // fallback name from emoji-test.txt
    });
  }
  return rows;
}

function pickFirst(arr) {
  if (!arr) return '';
  if (Array.isArray(arr)) return arr[0] ?? '';
  return String(arr);
}

async function main() {
  console.log(`Fetching emoji-test.txt (Unicode ${EMOJI_VERSION})...`);
  const emojiTestText = await fetchText(URLS.emojiTest);

  console.log('Fetching CLDR annotations (full)...');
  const annotationsJSON = await fetchJSON(URLS.annotations);

  console.log('Fetching CLDR annotations (derived)...');
  const derivedJSON = await fetchJSON(URLS.derived);

  const annotations = loadAnnotations(annotationsJSON);
  const derived = loadAnnotations(derivedJSON);

  console.log('Parsing emoji-test.txt...');
  const rows = parseEmojiTest(emojiTestText);
  console.log(`  ${rows.length} fully-qualified entries`);

  console.log('Merging annotations...');
  // CLDR keys use the minimally-qualified form (no U+FE0F variation selector).
  // emoji-test.txt fully-qualified entries include FE0F where applicable,
  // so we strip it for the lookup.
  const stripFE0F = (s) => s.replace(/️/g, '');

  let matched = 0;
  let missing = 0;
  const out = rows.map((r) => {
    const key = stripFE0F(r.g);
    const ann = annotations[key] ?? derived[key] ?? annotations[r.g] ?? derived[r.g];
    let cldr = '';
    let tts = '';
    let kw = [];
    if (ann) {
      matched++;
      cldr = pickFirst(ann.tts) || pickFirst(ann.default) || r.name;
      tts = pickFirst(ann.tts) || cldr;
      kw = Array.isArray(ann.default) ? ann.default : (ann.default ? [ann.default] : []);
    } else {
      missing++;
      cldr = r.name;
      tts = r.name;
    }
    return {
      g: r.g,
      cp: r.cp,
      grp: r.grp,
      sub: r.sub,
      cldr,
      tts,
      kw,
    };
  });

  console.log(`  matched: ${matched}, missing: ${missing}`);

  console.log(`Writing ${OUT_PATH}...`);
  await writeFile(OUT_PATH, JSON.stringify(out));
  console.log(`Done. ${out.length} rows.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
