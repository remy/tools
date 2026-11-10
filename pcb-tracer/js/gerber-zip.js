"use strict";

/* ==========================================================================
   B1. Gerber: zip reader -- central directory + DecompressionStream('deflate-raw')
   ========================================================================== */

/* A file name is not always available (a URL can end in anything), so the
   local-file, empty-archive and spanned-archive signatures decide it. */
function looksLikeZip(buf) {
  if (buf.byteLength < 4) return false;
  const sig = new DataView(buf).getUint32(0, true);
  return sig === 0x04034b50 || sig === 0x06054b50 || sig === 0x08074b50;
}

async function readZip(buf) {
  const dv = new DataView(buf), u8 = new Uint8Array(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65558); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a zip archive');
  const count = dv.getUint16(eocd + 10, true);
  let off = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const out = [];
  for (let i = 0; i < count; i++) {
    if (off + 46 > buf.byteLength || dv.getUint32(off, true) !== 0x02014b50) break;
    const method = dv.getUint16(off + 10, true);
    const csize = dv.getUint32(off + 20, true);
    const nameLen = dv.getUint16(off + 28, true);
    const extraLen = dv.getUint16(off + 30, true);
    const cmtLen = dv.getUint16(off + 32, true);
    const lho = dv.getUint32(off + 42, true);
    const name = dec.decode(u8.subarray(off + 46, off + 46 + nameLen));
    off += 46 + nameLen + extraLen + cmtLen;
    if (name.endsWith('/') || /(^|\/)__MACOSX\//.test(name)) continue;
    const start = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
    const raw = u8.subarray(start, start + csize);
    let bytes;
    if (method === 0) bytes = raw;
    else if (method === 8) {
      const s = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      bytes = new Uint8Array(await new Response(s).arrayBuffer());
    } else { warn('skipped ' + name + ': unsupported zip compression'); continue; }
    out.push({name: name.replace(/^.*\//, ''), text: dec.decode(bytes)});
  }
  return out;
}
