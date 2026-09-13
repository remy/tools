// Container decoding: turn a TTF / OTF / TTC / WOFF / WOFF2 buffer into a map
// of SFNT tables. Only the container is handled here — see tables.js for the
// contents of individual tables.

/** Tags a WOFF2 table directory can reference by index instead of by name. */
const WOFF2_KNOWN_TAGS = [
  'cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post',
  'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ', 'VORG', 'EBDT',
  'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea',
  'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH',
  'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar',
  'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar',
  'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop',
  'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill',
];

const tag = (view, offset) =>
  String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );

/**
 * @param {ArrayBuffer} buffer
 * @returns {Promise<{format: string, flavour: string, tables: Map<string, DataView>}>}
 */
export async function readFont(buffer) {
  const view = new DataView(buffer);
  if (buffer.byteLength < 12) throw new Error('Not a font file — too small.');

  const signature = tag(view, 0);
  if (signature === 'wOFF') return readWoff(view);
  if (signature === 'wOF2') return readWoff2(view);
  if (signature === 'ttcf') return readSfnt(view, view.getUint32(12));
  if (signature === 'OTTO' || signature === 'true' || signature === 'typ1' ||
      view.getUint32(0) === 0x00010000) {
    return readSfnt(view, 0);
  }
  throw new Error(`Unrecognised font format (starts with "${signature}").`);
}

function readSfnt(view, start) {
  const flavour = tag(view, start);
  const numTables = view.getUint16(start + 4);
  const tables = new Map();
  for (let i = 0; i < numTables; i++) {
    const entry = start + 12 + i * 16;
    const name = tag(view, entry);
    const offset = view.getUint32(entry + 8);
    const length = view.getUint32(entry + 12);
    if (offset + length > view.byteLength) continue;
    tables.set(name, new DataView(view.buffer, view.byteOffset + offset, length));
  }
  return {
    format: flavour === 'OTTO' ? 'otf' : 'ttf',
    flavour,
    tables,
  };
}

async function readWoff(view) {
  const flavour = tag(view, 4);
  const numTables = view.getUint16(12);
  const tables = new Map();
  for (let i = 0; i < numTables; i++) {
    const entry = 44 + i * 20;
    const name = tag(view, entry);
    const offset = view.getUint32(entry + 4);
    const compLength = view.getUint32(entry + 8);
    const origLength = view.getUint32(entry + 12);
    const raw = new Uint8Array(view.buffer, view.byteOffset + offset, compLength);
    const bytes = compLength < origLength ? await inflate(raw) : raw;
    tables.set(name, new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  }
  return { format: 'woff', flavour, tables };
}

async function readWoff2(view) {
  const flavour = tag(view, 4);
  const numTables = view.getUint16(12);
  let cursor = 48;

  if (flavour === 'ttcf') {
    // Collection header: version, numFonts, then one directory per font. Only
    // the table directory that follows is needed, so skip over it.
    cursor += 4;
    const [numFonts, afterCount] = readBase128(view, cursor);
    cursor = afterCount;
    for (let i = 0; i < numFonts; i++) {
      const [entryCount, afterEntries] = readBase128(view, cursor);
      cursor = afterEntries + 4; // flavour
      for (let j = 0; j < entryCount; j++) cursor = readBase128(view, cursor)[1];
    }
  }

  const directory = [];
  for (let i = 0; i < numTables; i++) {
    const flags = view.getUint8(cursor++);
    const index = flags & 0x3f;
    let name;
    if (index === 0x3f) {
      name = tag(view, cursor);
      cursor += 4;
    } else {
      name = WOFF2_KNOWN_TAGS[index];
    }
    const transform = (flags >> 6) & 0x03;
    let length;
    [length, cursor] = readBase128(view, cursor);
    const transformed = (name === 'glyf' || name === 'loca')
      ? transform === 0
      : transform !== 0;
    if (transformed) [length, cursor] = readBase128(view, cursor);
    directory.push({ name, length });
  }

  // The file is padded to a four-byte boundary, and the Brotli decoder
  // rejects the trailing bytes, so trust the declared compressed size.
  const declared = view.getUint32(20);
  const available = view.byteLength - cursor;
  const compressed = new Uint8Array(
    view.buffer,
    view.byteOffset + cursor,
    declared > 0 ? Math.min(declared, available) : available,
  );
  const data = await brotliDecode(compressed);

  const tables = new Map();
  let offset = 0;
  for (const entry of directory) {
    if (offset + entry.length > data.byteLength) break;
    tables.set(
      entry.name,
      new DataView(data.buffer, data.byteOffset + offset, entry.length),
    );
    offset += entry.length;
  }
  // glyf and loca may be stored transformed; nothing here reads outlines, so
  // they are left as-is and simply reported as present.
  return { format: 'woff2', flavour, tables };
}

/** UIntBase128 — up to five 7-bit groups, high bit marks continuation. */
function readBase128(view, offset) {
  let value = 0;
  for (let i = 0; i < 5; i++) {
    const byte = view.getUint8(offset++);
    value = (value << 7) | (byte & 0x7f);
    if ((byte & 0x80) === 0) return [value >>> 0, offset];
  }
  throw new Error('Malformed WOFF2 table directory.');
}

async function inflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(
    new DecompressionStream('deflate'),
  );
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

let brotli;
async function brotliDecode(bytes) {
  // 200kB of decoder, so only fetched when a WOFF2 actually turns up.
  brotli ??= (await import('/vendor/brotli/decode.js')).BrotliDecode;
  const out = brotli(new Int8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  return new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
}
