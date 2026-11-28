/*
 * .eml parser — RFC 5322 headers plus MIME bodies (RFC 2045/2046/2047/2231).
 *
 * Everything is handled as a "binary string": the file's bytes decoded as
 * latin1, which maps 0x00–0xFF one-to-one onto U+0000–U+00FF. Line and
 * boundary scanning can then use ordinary string methods without any byte
 * being lost, and each part is turned back into bytes only when it is
 * decoded.
 */

const LATIN1 = new TextDecoder('latin1');

export function binaryFromBuffer(buffer) {
  return LATIN1.decode(new Uint8Array(buffer));
}

export function bytesFromBinary(binary) {
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i) & 0xff;
  return out;
}

/* ------------------------------------------------------------------ text */

const CHARSET_ALIASES = {
  'utf8': 'utf-8',
  'utf-8': 'utf-8',
  'unicode-1-1-utf-8': 'utf-8',
  'us-ascii': 'windows-1252',
  'ascii': 'windows-1252',
  'ansi_x3.4-1968': 'windows-1252',
  'cp1252': 'windows-1252',
  'ks_c_5601-1987': 'euc-kr',
  'ks_c_5601-1989': 'euc-kr',
  'gb2312': 'gbk',
  'default': '',
  'unknown-8bit': '',
  'x-unknown': '',
};

function normaliseCharset(charset) {
  if (!charset) return '';
  const key = String(charset).trim().replace(/^["']|["']$/g, '').toLowerCase();
  if (key in CHARSET_ALIASES) return CHARSET_ALIASES[key];
  return key;
}

/* True when the bytes contain at least one well-formed multi-byte UTF-8
 * sequence and nothing that contradicts UTF-8 — used when a part declares no
 * charset, or declares one that turns out to be a lie. */
function looksLikeUtf8(binary) {
  let i = 0;
  let sawMultiByte = false;
  while (i < binary.length) {
    const c = binary.charCodeAt(i);
    if (c < 0x80) { i += 1; continue; }
    let need;
    if (c >= 0xc2 && c <= 0xdf) need = 1;
    else if (c >= 0xe0 && c <= 0xef) need = 2;
    else if (c >= 0xf0 && c <= 0xf4) need = 3;
    else return false;
    for (let k = 1; k <= need; k += 1) {
      const next = binary.charCodeAt(i + k);
      if (Number.isNaN(next) || next < 0x80 || next > 0xbf) return false;
    }
    sawMultiByte = true;
    i += need + 1;
  }
  return sawMultiByte;
}

export function decodeText(bytes, charset) {
  const label = normaliseCharset(charset);
  if (label) {
    try {
      return new TextDecoder(label).decode(bytes);
    } catch (_) { /* unknown label — fall through to sniffing */ }
  }
  const binary = LATIN1.decode(bytes);
  if (looksLikeUtf8(binary)) {
    try {
      return new TextDecoder('utf-8').decode(bytes);
    } catch (_) { /* ignore */ }
  }
  return binary;
}

function decodeBinaryText(binary, charset) {
  return decodeText(bytesFromBinary(binary), charset);
}

/* ------------------------------------------------- transfer encodings */

function base64ToBinary(input) {
  const clean = input.replace(/[^A-Za-z0-9+/=]/g, '').replace(/=+$/, '');
  const padded = clean + '='.repeat((4 - (clean.length % 4)) % 4);
  try {
    return atob(padded);
  } catch (_) {
    // Salvage as much as possible from a truncated or corrupt body.
    let out = '';
    for (let i = 0; i + 4 <= padded.length; i += 4) {
      try {
        out += atob(padded.slice(i, i + 4));
      } catch (_) { /* skip the bad quantum */ }
    }
    return out;
  }
}

function quotedPrintableToBinary(input) {
  return input
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

export function decodeTransfer(binary, encoding) {
  const enc = String(encoding || '7bit').trim().toLowerCase();
  if (enc === 'base64') return base64ToBinary(binary);
  if (enc === 'quoted-printable') return quotedPrintableToBinary(binary);
  return binary;
}

/* ------------------------------------------------------- encoded words */

const ENCODED_WORD = /=\?([^?\s]+)\?([bBqQ])\?([^?]*)\?=/g;

function decodeEncodedWord(charset, encoding, text) {
  const binary = encoding.toLowerCase() === 'b'
    ? base64ToBinary(text)
    : quotedPrintableToBinary(text.replace(/_/g, ' '));
  return decodeBinaryText(binary, charset);
}

/* RFC 2047: whitespace between two adjacent encoded words is not part of the
 * text and must be dropped. */
export function decodeHeaderText(value) {
  if (value == null) return '';
  const raw = String(value);
  if (!raw) return '';
  let out = '';
  let cursor = 0;
  let previousWasWord = false;
  ENCODED_WORD.lastIndex = 0;
  let match = ENCODED_WORD.exec(raw);
  while (match) {
    const gap = raw.slice(cursor, match.index);
    if (!(previousWasWord && /^[ \t]*$/.test(gap))) {
      out += decodeBinaryText(gap, '');
    }
    out += decodeEncodedWord(match[1], match[2], match[3]);
    cursor = match.index + match[0].length;
    previousWasWord = true;
    match = ENCODED_WORD.exec(raw);
  }
  out += decodeBinaryText(raw.slice(cursor), '');
  return out;
}

/* ------------------------------------------------------------- headers */

function splitHeadAndBody(raw) {
  const match = /\r?\n\r?\n/.exec(raw);
  if (!match) return { head: raw, body: '' };
  return {
    head: raw.slice(0, match.index),
    body: raw.slice(match.index + match[0].length),
  };
}

/* RFC 5322 field-name: printable US-ASCII except the colon. Checking this
 * keeps a file that merely happens to contain a colon — an SVG, say — from
 * being read as an email. */
const FIELD_NAME = /^[!-9;-~]+$/;

export function parseHeaderList(head) {
  const unfolded = head.replace(/\r?\n([ \t])/g, '$1');
  const list = [];
  for (const line of unfolded.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const colon = line.indexOf(':');
    if (colon < 1) continue;
    const name = line.slice(0, colon);
    if (!FIELD_NAME.test(name)) continue;
    list.push({ name, value: line.slice(colon + 1).trim() });
  }
  return list;
}

function headerValue(list, name) {
  const wanted = name.toLowerCase();
  const found = list.find((h) => h.name.toLowerCase() === wanted);
  return found ? found.value : '';
}

function headerValues(list, name) {
  const wanted = name.toLowerCase();
  return list.filter((h) => h.name.toLowerCase() === wanted).map((h) => h.value);
}

/* ---------------------------------------------- structured header values */

/* Splits `value; a=b; c="d;e"` honouring quoted strings. */
function splitSemicolons(value) {
  const out = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    if (ch === '"' && value[i - 1] !== '\\') {
      inQuotes = !inQuotes;
      current += ch;
    } else if (ch === ';' && !inQuotes) {
      out.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out.map((s) => s.trim()).filter(Boolean);
}

function unquote(value) {
  const trimmed = value.trim();
  if (trimmed.length > 1 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/\\(.)/g, '$1');
  }
  return trimmed;
}

function decodeExtendedValue(value) {
  // RFC 2231: charset'language'percent-encoded
  const parts = value.split("'");
  if (parts.length < 3) return decodeHeaderText(value);
  const charset = parts[0];
  const encoded = parts.slice(2).join("'");
  const binary = encoded.replace(/%([0-9A-Fa-f]{2})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16)));
  return decodeBinaryText(binary, charset);
}

/* Parses a header into its main value plus parameters, resolving RFC 2231
 * continuations (`name*0*=`, `name*1=`) and RFC 2047 encoded words. */
export function parseParameterHeader(raw) {
  const segments = splitSemicolons(raw || '');
  const main = (segments.shift() || '').trim();
  const simple = Object.create(null);
  const continued = Object.create(null);

  for (const segment of segments) {
    const eq = segment.indexOf('=');
    if (eq === -1) continue;
    const key = segment.slice(0, eq).trim().toLowerCase();
    const value = segment.slice(eq + 1).trim();
    const match = /^([^*]+)\*(\d+)(\*)?$/.exec(key);
    if (match) {
      const [, base, index, extended] = match;
      continued[base] ??= { chunks: [], extended: false };
      continued[base].chunks[Number(index)] = unquote(value);
      if (extended && Number(index) === 0) continued[base].extended = true;
      continue;
    }
    if (key.endsWith('*')) {
      simple[key.slice(0, -1)] = decodeExtendedValue(unquote(value));
      continue;
    }
    if (!(key in simple)) simple[key] = decodeHeaderText(unquote(value));
  }

  for (const [base, info] of Object.entries(continued)) {
    const joined = info.chunks.filter((c) => c != null).join('');
    simple[base] = info.extended ? decodeExtendedValue(joined) : decodeHeaderText(joined);
  }

  return { value: main, params: simple };
}

/* ----------------------------------------------------------- addresses */

export function parseAddressList(raw) {
  if (!raw) return [];
  const decoded = decodeHeaderText(raw);
  const out = [];
  let current = '';
  let inQuotes = false;
  let depth = 0;
  for (let i = 0; i < decoded.length; i += 1) {
    const ch = decoded[i];
    if (ch === '"' && decoded[i - 1] !== '\\') inQuotes = !inQuotes;
    if (!inQuotes && ch === '<') depth += 1;
    if (!inQuotes && ch === '>') depth = Math.max(0, depth - 1);
    if (ch === ',' && !inQuotes && depth === 0) {
      out.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  out.push(current);

  return out
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const angle = /^(.*)<([^>]*)>\s*$/.exec(entry);
      if (angle) {
        return { name: unquote(angle[1].trim()), address: angle[2].trim() };
      }
      return { name: '', address: entry };
    });
}

export function formatAddress({ name, address }) {
  if (name && address) return `${name} <${address}>`;
  return address || name || '';
}

/* ---------------------------------------------------------- multipart */

function boundaryPositions(body, boundary) {
  const delimiter = `--${boundary}`;
  const positions = [];
  let cursor = 0;
  while (cursor <= body.length) {
    const found = body.indexOf(delimiter, cursor);
    if (found === -1) break;
    if (found === 0 || body[found - 1] === '\n') positions.push(found);
    cursor = found + delimiter.length;
  }
  return positions;
}

function splitMultipart(body, boundary) {
  const delimiter = `--${boundary}`;
  const positions = boundaryPositions(body, boundary);
  const chunks = [];
  for (let i = 0; i < positions.length; i += 1) {
    const afterDelimiter = positions[i] + delimiter.length;
    const rest = body.slice(afterDelimiter);
    if (rest.startsWith('--')) break; // closing delimiter
    const newline = /\r?\n/.exec(rest);
    if (!newline) break;
    const start = afterDelimiter + newline.index + newline[0].length;
    const end = i + 1 < positions.length ? positions[i + 1] : body.length;
    chunks.push(body.slice(start, end).replace(/\r?\n$/, ''));
  }
  return chunks;
}

/* ------------------------------------------------------------- parsing */

let nextId = 0;

const MAX_DEPTH = 12;

function parsePart(raw, depth, isRoot) {
  const { head, body } = splitHeadAndBody(raw);
  const headers = parseHeaderList(head);

  const contentType = parseParameterHeader(
    headerValue(headers, 'content-type') || (isRoot ? 'text/plain' : 'text/plain'),
  );
  const [typeRaw, subtypeRaw] = contentType.value.toLowerCase().split('/');
  const type = (typeRaw || 'text').trim();
  const subtype = (subtypeRaw || 'plain').trim();

  const disposition = parseParameterHeader(headerValue(headers, 'content-disposition'));
  const encoding = (headerValue(headers, 'content-transfer-encoding') || '7bit')
    .trim().toLowerCase();

  const contentId = headerValue(headers, 'content-id').trim().replace(/^<|>$/g, '');
  const filename = disposition.params.filename || contentType.params.name || '';

  const node = {
    id: `part-${nextId += 1}`,
    depth,
    isRoot: Boolean(isRoot),
    raw,
    head,
    bodyRaw: body,
    headers,
    mimeType: `${type}/${subtype}`,
    type,
    subtype,
    params: contentType.params,
    charset: contentType.params.charset || '',
    encoding,
    disposition: disposition.value.toLowerCase(),
    filename: decodeHeaderText(filename),
    description: decodeHeaderText(headerValue(headers, 'content-description')),
    contentId,
    parts: [],
    bytes: null,
    truncated: false,
  };

  const boundary = contentType.params.boundary;
  if (type === 'multipart' && boundary && depth < MAX_DEPTH) {
    node.parts = splitMultipart(body, boundary).map((chunk) => parsePart(chunk, depth + 1, false));
    node.size = body.length;
    return node;
  }

  if (type === 'message' && (subtype === 'rfc822' || subtype === 'news') && depth < MAX_DEPTH) {
    const inner = decodeTransfer(body, encoding);
    node.parts = [parsePart(inner, depth + 1, true)];
    node.bytes = bytesFromBinary(inner);
    node.size = node.bytes.length;
    return node;
  }

  const decoded = decodeTransfer(body, encoding);
  node.bytes = bytesFromBinary(decoded);
  node.size = node.bytes.length;
  return node;
}

function isTextual(node) {
  return node.type === 'text';
}

export function isAttachment(node) {
  if (node.type === 'multipart') return false;
  if (node.disposition === 'attachment') return true;
  if (node.filename) return true;
  if (node.type === 'message') return false;
  return !isTextual(node);
}

export function walkParts(node, visit, parent = null) {
  visit(node, parent);
  for (const child of node.parts) walkParts(child, visit, node);
}

/* The text parts a mail client would show. Every alternative is kept — the
 * reader renders the richest one but still offers the others for export — and
 * an attached message's own body never counts as this message's body. */
function collectBodies(node, out, isRootCall) {
  if (!isRootCall && (node.disposition === 'attachment' || (node.type === 'message' && node.filename))) {
    return;
  }
  if (node.type === 'multipart' || node.type === 'message') {
    node.parts.forEach((child) => collectBodies(child, out, false));
    return;
  }
  if (isTextual(node)) out.push(node);
}

function bodyRank(node) {
  if (node.mimeType === 'text/html') return 3;
  if (node.mimeType === 'text/plain') return 2;
  return 1;
}

export function partText(node) {
  if (!node.bytes) return '';
  return decodeText(node.bytes, node.charset);
}

const SUMMARY_HEADERS = [
  ['subject', 'Subject'],
  ['from', 'From'],
  ['to', 'To'],
  ['cc', 'Cc'],
  ['bcc', 'Bcc'],
  ['reply-to', 'Reply-To'],
  ['date', 'Date'],
];

export function parseEml(binary) {
  nextId = 0;
  const normalised = binary.replace(/^\s*From \S+.*?\r?\n/, ''); // mbox "From " line
  const root = parsePart(normalised, 0, true);

  const bodies = [];
  collectBodies(root, bodies, true);
  const preferred = [...bodies].sort((a, b) => bodyRank(b) - bodyRank(a))[0] || null;

  const attachments = [];
  walkParts(root, (node) => {
    if (node !== root && isAttachment(node)) attachments.push(node);
  });

  const inlineById = new Map();
  walkParts(root, (node) => {
    if (node.contentId) inlineById.set(node.contentId, node);
  });

  const headers = root.headers;
  const summary = {
    subject: decodeHeaderText(headerValue(headers, 'subject')),
    from: parseAddressList(headerValue(headers, 'from')),
    to: parseAddressList(headerValue(headers, 'to')),
    cc: parseAddressList(headerValue(headers, 'cc')),
    bcc: parseAddressList(headerValue(headers, 'bcc')),
    replyTo: parseAddressList(headerValue(headers, 'reply-to')),
    dateRaw: headerValue(headers, 'date'),
    messageId: headerValue(headers, 'message-id'),
    received: headerValues(headers, 'received'),
  };
  const parsedDate = summary.dateRaw ? new Date(summary.dateRaw) : null;
  summary.date = parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : null;

  return {
    raw: normalised,
    root,
    headers,
    summary,
    bodies,
    attachments,
    inlineById,
    html: bodies.find((p) => p.mimeType === 'text/html') || null,
    plain: bodies.find((p) => p.mimeType === 'text/plain') || null,
    preferred,
    summaryHeaderOrder: SUMMARY_HEADERS,
  };
}
