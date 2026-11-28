/* Works out everything in a message that can be saved, and what to call it. */

import { decodeHeaderText, partText, walkParts } from './parse.js';
import { bytesToBase64, download, formatBytes, safeFilename } from './format.js';

const EXTENSIONS = {
  'text/plain': 'txt',
  'text/html': 'html',
  'text/csv': 'csv',
  'text/calendar': 'ics',
  'application/json': 'json',
  'application/pdf': 'pdf',
  'message/rfc822': 'eml',
  'image/jpeg': 'jpg',
};

export function attachmentFilename(part, index) {
  if (part.filename) return safeFilename(part.filename, `part-${index + 1}`);
  const ext = EXTENSIONS[part.mimeType]
    || part.mimeType.split('/')[1]?.replace(/[^a-z0-9.+-]/gi, '')
    || 'bin';
  return `attachment-${index + 1}.${ext}`;
}

export function partExportName(part, stem) {
  if (part.filename) return safeFilename(part.filename, 'part');
  const ext = EXTENSIONS[part.mimeType]
    || part.mimeType.split('/')[1]?.replace(/[^a-z0-9]/gi, '')
    || 'bin';
  return `${stem}-${part.mimeType.replace('/', '-')}.${ext}`;
}

export function headersText(headers, decode) {
  return headers
    .map(({ name, value }) => `${name}: ${decode ? decodeHeaderText(value) : value}`)
    .join('\n');
}

export function messageAsJson(message, fileName) {
  const { summary, headers, bodies, attachments } = message;
  return JSON.stringify({
    file: fileName || null,
    subject: summary.subject,
    from: summary.from,
    to: summary.to,
    cc: summary.cc,
    bcc: summary.bcc,
    replyTo: summary.replyTo,
    date: summary.date ? summary.date.toISOString() : null,
    dateRaw: summary.dateRaw,
    messageId: summary.messageId,
    headers: headers.map(({ name, value }) => ({
      name,
      value: decodeHeaderText(value),
      raw: value,
    })),
    bodies: bodies.map((part) => ({
      mimeType: part.mimeType,
      charset: part.charset || null,
      encoding: part.encoding,
      size: part.size,
      content: partText(part),
    })),
    attachments: attachments.map((part, index) => ({
      filename: attachmentFilename(part, index),
      mimeType: part.mimeType,
      size: part.size,
      contentId: part.contentId || null,
      disposition: part.disposition || null,
      base64: bytesToBase64(part.bytes || new Uint8Array()),
    })),
  }, null, 2);
}

/* Everything on offer in the Export dialog, grouped for display. */
export function buildExportGroups({ message, stem, rawBlob, fileName, fileSize, derivedText }) {
  const groups = [];

  const bodyItems = message.bodies.map((part) => {
    const html = part.mimeType === 'text/html';
    const name = html ? `${stem}.html` : `${stem}.txt`;
    return {
      name,
      meta: `${part.mimeType}${part.charset ? `; charset=${part.charset}` : ''} · ${formatBytes(part.size)}`,
      run: () => download(name, partText(part), `${part.mimeType};charset=utf-8`),
    };
  });
  if (derivedText) {
    const name = `${stem}.md`;
    bodyItems.push({
      name,
      meta: `Markdown, converted from the HTML body · ${formatBytes(derivedText.length)}`,
      run: () => download(name, derivedText, 'text/markdown;charset=utf-8'),
    });
  }
  if (bodyItems.length) groups.push({ title: 'Body', items: bodyItems });

  groups.push({
    title: 'Whole message',
    items: [
      {
        name: `${stem}.eml`,
        meta: `original source · ${formatBytes(fileSize ?? message.raw.length)}`,
        run: () => download(`${stem}.eml`, rawBlob, 'message/rfc822'),
      },
      {
        name: `${stem}-headers.txt`,
        meta: `${message.headers.length} headers, decoded`,
        run: () => download(
          `${stem}-headers.txt`,
          headersText(message.headers, true),
          'text/plain;charset=utf-8',
        ),
      },
      {
        name: `${stem}.json`,
        meta: 'headers, bodies and attachments as JSON',
        run: () => download(`${stem}.json`, messageAsJson(message, fileName), 'application/json'),
      },
    ],
  });

  if (message.attachments.length) {
    groups.push({
      title: `Attachments (${message.attachments.length})`,
      items: message.attachments.map((part, index) => {
        const name = attachmentFilename(part, index);
        return {
          name,
          meta: `${part.mimeType} · ${formatBytes(part.size)}`,
          run: () => download(name, part.bytes, part.mimeType),
        };
      }),
    });
  }

  const others = [];
  walkParts(message.root, (part) => {
    if (part.type === 'multipart' || !part.bytes?.length) return;
    if (message.bodies.includes(part) || message.attachments.includes(part)) return;
    others.push(part);
  });
  if (others.length) {
    groups.push({
      title: 'Other MIME parts',
      items: others.map((part) => {
        const name = partExportName(part, stem);
        return {
          name,
          meta: `${part.mimeType} · ${formatBytes(part.size)}`,
          run: () => download(name, part.bytes, part.mimeType),
        };
      }),
    });
  }

  return groups;
}
