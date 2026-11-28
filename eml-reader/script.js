import {
  binaryFromBuffer,
  decodeHeaderText,
  isAttachment,
  parseEml,
  partText,
  walkParts,
} from './parse.js';
import {
  bytesToBase64,
  copyToClipboard,
  download,
  formatBytes,
  renderLinkedText,
  safeFilename,
} from './format.js';
import { htmlToMarkdown } from './markdown.js';
import {
  attachmentFilename,
  buildExportGroups,
  headersText as buildHeadersText,
  partExportName,
} from './exports.js';

const el = (id) => document.getElementById(id);

const ui = {
  uploadZone: el('uploadZone'),
  errorBox: el('errorBox'),
  panel: el('toolPanel'),
  fileName: el('fileName'),
  fileMeta: el('fileMeta'),
  clearBtn: el('clearBtn'),
  exportBtn: el('exportBtn'),
  summary: el('summary'),
  tabs: el('tabs'),
  renderedPicker: el('renderedPicker'),
  renderedNotice: el('renderedNotice'),
  renderedEmpty: el('renderedEmpty'),
  remoteToggleWrap: el('remoteToggleWrap'),
  remoteImages: el('remoteImages'),
  htmlFrame: el('htmlFrame'),
  textBody: el('textBody'),
  plainSource: el('plainSource'),
  textNotice: el('textNotice'),
  textDownloadLabel: el('textDownloadLabel'),
  textMeta: el('textMeta'),
  htmlSource: el('htmlSource'),
  htmlMeta: el('htmlMeta'),
  headersBody: el('headersBody'),
  decodeHeaders: el('decodeHeaders'),
  attachmentList: el('attachmentList'),
  attachmentsEmpty: el('attachmentsEmpty'),
  structureTree: el('structureTree'),
  rawSource: el('rawSource'),
  rawMeta: el('rawMeta'),
  exportDialog: el('exportDialog'),
  exportBody: el('exportBody'),
};

const state = {
  message: null,
  file: null,
  bodyPart: null,
  /* Markdown stood in for a missing text/plain body, or null. */
  derivedText: null,
  objectUrls: [],
};

/* ------------------------------------------------------------- helpers */

function baseName() {
  const raw = state.file?.name || 'email';
  return safeFilename(raw.replace(/\.(eml|mht|mhtml|msg|txt)$/i, ''), 'email');
}

function resolveImageSrc(src) {
  if (!/^cid:/i.test(src)) return src;
  const id = decodeURIComponent(src.slice(4)).replace(/^<|>$/g, '');
  const part = state.message?.inlineById.get(id);
  return part?.filename || part?.contentId || src;
}

/* An HTML-only message still deserves a text version, so convert the body. */
function deriveText(message) {
  if (message.plain || !message.html) return null;
  const markdown = htmlToMarkdown(partText(message.html), { resolveImage: resolveImageSrc });
  return markdown.trim() ? markdown : null;
}

function trackUrl(url) {
  state.objectUrls.push(url);
  return url;
}

function releaseUrls() {
  state.objectUrls.forEach((url) => URL.revokeObjectURL(url));
  state.objectUrls = [];
}

function setText(node, text) {
  node.textContent = text;
}

/* ------------------------------------------------------- body rendering */

function dataUrlFor(part) {
  return `data:${part.mimeType};base64,${bytesToBase64(part.bytes)}`;
}

/* Builds the document shown in the sandboxed iframe: inline images are
 * resolved from their Content-ID, and a CSP keeps everything else out
 * unless remote images have been asked for. */
function buildFrameDocument(html, allowRemote) {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  doc.querySelectorAll('script, iframe, object, embed, meta[http-equiv]').forEach((n) => n.remove());

  let blocked = 0;
  let inlined = 0;
  for (const img of doc.querySelectorAll('img[src], img[background]')) {
    const src = img.getAttribute('src') || '';
    if (/^cid:/i.test(src)) {
      const id = decodeURIComponent(src.slice(4)).replace(/^<|>$/g, '');
      const part = state.message.inlineById.get(id);
      if (part?.bytes) {
        img.setAttribute('src', dataUrlFor(part));
        inlined += 1;
      } else {
        img.removeAttribute('src');
      }
      continue;
    }
    if (/^https?:/i.test(src) && !allowRemote) blocked += 1;
  }

  const csp = doc.createElement('meta');
  csp.setAttribute('http-equiv', 'Content-Security-Policy');
  csp.setAttribute(
    'content',
    [
      "default-src 'none'",
      `img-src data:${allowRemote ? ' https: http:' : ''}`,
      "style-src 'unsafe-inline' data:",
      'font-src data:',
      "form-action 'none'",
    ].join('; '),
  );

  const base = doc.createElement('base');
  base.setAttribute('target', '_blank');

  const style = doc.createElement('style');
  style.textContent =
    'html{color-scheme:light}body{margin:0;padding:16px;font-family:-apple-system,' +
    'BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;background:#fff;color:#18181b;' +
    'overflow-wrap:break-word}img{max-width:100%;height:auto}table{max-width:100%}';

  const head = doc.head || doc.documentElement;
  head.prepend(csp, base);
  head.appendChild(style);

  return { html: `<!DOCTYPE html>${doc.documentElement.outerHTML}`, blocked, inlined };
}

function renderBody() {
  const part = state.bodyPart;
  ui.htmlFrame.hidden = true;
  ui.textBody.hidden = true;
  ui.renderedEmpty.hidden = true;
  ui.renderedNotice.hidden = true;
  ui.remoteToggleWrap.hidden = true;

  if (!part) {
    ui.renderedEmpty.hidden = false;
    return;
  }

  if (part.mimeType === 'text/html') {
    const allowRemote = ui.remoteImages.checked;
    const { html, blocked, inlined } = buildFrameDocument(partText(part), allowRemote);
    ui.htmlFrame.srcdoc = html;
    ui.htmlFrame.hidden = false;
    ui.remoteToggleWrap.hidden = false;

    const notes = [];
    if (inlined) notes.push(`${inlined} inline image${inlined === 1 ? '' : 's'} resolved from the message`);
    if (blocked) notes.push(`${blocked} remote image${blocked === 1 ? '' : 's'} blocked`);
    if (notes.length) {
      setText(ui.renderedNotice, `${notes.join(' · ')}.`);
      ui.renderedNotice.hidden = false;
    }
    return;
  }

  renderLinkedText(ui.textBody, partText(part));
  ui.textBody.hidden = false;
}

function bodyLabel(part, index) {
  const name = part.mimeType + (part.charset ? `; ${part.charset}` : '');
  return `${index + 1}. ${name} (${formatBytes(part.size)})`;
}

function renderBodyPicker() {
  ui.renderedPicker.textContent = '';
  const bodies = state.message.bodies;
  if (bodies.length < 2) {
    const label = document.createElement('span');
    label.className = 'pane-label';
    label.textContent = state.bodyPart
      ? `${state.bodyPart.mimeType}${state.bodyPart.charset ? `; charset=${state.bodyPart.charset}` : ''}`
      : 'no body part';
    ui.renderedPicker.appendChild(label);
    return;
  }

  const wrap = document.createElement('label');
  wrap.className = 'body-pick';
  wrap.append('Body part');
  const select = document.createElement('select');
  bodies.forEach((part, index) => {
    const option = document.createElement('option');
    option.value = part.id;
    option.textContent = bodyLabel(part, index);
    option.selected = part === state.bodyPart;
    select.appendChild(option);
  });
  select.addEventListener('change', () => {
    state.bodyPart = bodies.find((p) => p.id === select.value) || null;
    renderBody();
  });
  wrap.appendChild(select);
  ui.renderedPicker.appendChild(wrap);
}

/* -------------------------------------------------------------- summary */

function addressDd(list) {
  const dd = document.createElement('dd');
  if (!list.length) {
    dd.textContent = '—';
    return dd;
  }
  for (const entry of list) {
    const row = document.createElement('span');
    row.className = 'addr';
    if (entry.name) {
      row.append(`${entry.name} `);
      const email = document.createElement('span');
      email.className = 'addr-email';
      email.textContent = `<${entry.address}>`;
      row.appendChild(email);
    } else {
      const email = document.createElement('span');
      email.className = 'addr-email';
      email.textContent = entry.address;
      row.appendChild(email);
    }
    dd.appendChild(row);
  }
  return dd;
}

function renderSummary() {
  const { summary } = state.message;
  ui.summary.textContent = '';

  const addRow = (label, dd) => {
    const dt = document.createElement('dt');
    dt.textContent = label;
    ui.summary.append(dt, dd);
  };

  const subject = document.createElement('dd');
  subject.className = 'subject';
  subject.textContent = summary.subject || '(no subject)';
  addRow('Subject', subject);

  addRow('From', addressDd(summary.from));
  if (summary.to.length) addRow('To', addressDd(summary.to));
  if (summary.cc.length) addRow('Cc', addressDd(summary.cc));
  if (summary.bcc.length) addRow('Bcc', addressDd(summary.bcc));
  if (summary.replyTo.length) addRow('Reply-To', addressDd(summary.replyTo));

  if (summary.dateRaw) {
    const dd = document.createElement('dd');
    dd.textContent = summary.date
      ? summary.date.toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' })
      : summary.dateRaw;
    addRow('Date', dd);
  }
}

/* -------------------------------------------------------------- headers */

function headersText(decode) {
  return buildHeadersText(state.message.headers, decode);
}

function renderHeaders() {
  const decode = ui.decodeHeaders.checked;
  ui.headersBody.textContent = '';
  for (const { name, value } of state.message.headers) {
    const tr = document.createElement('tr');
    const th = document.createElement('td');
    th.textContent = name;
    const td = document.createElement('td');
    td.textContent = decode ? decodeHeaderText(value) : value;
    tr.append(th, td);
    ui.headersBody.appendChild(tr);
  }
}

/* ---------------------------------------------------------- attachments */

function renderAttachments() {
  const { attachments } = state.message;
  ui.attachmentList.textContent = '';
  ui.attachmentsEmpty.hidden = attachments.length > 0;

  attachments.forEach((part, index) => {
    const name = attachmentFilename(part, index);
    const li = document.createElement('li');
    li.className = 'attachment';

    const thumb = document.createElement('div');
    thumb.className = 'attachment-thumb';
    if (part.type === 'image' && part.bytes?.length) {
      const img = document.createElement('img');
      img.src = trackUrl(URL.createObjectURL(new Blob([part.bytes], { type: part.mimeType })));
      img.alt = '';
      thumb.appendChild(img);
    } else {
      thumb.textContent = (name.split('.').pop() || 'bin').slice(0, 4);
    }

    const text = document.createElement('div');
    text.className = 'attachment-text';
    const title = document.createElement('div');
    title.className = 'attachment-name';
    title.textContent = part.filename || name;
    const meta = document.createElement('div');
    meta.className = 'attachment-meta';
    const bits = [part.mimeType, formatBytes(part.size), part.encoding];
    if (part.disposition === 'inline' || part.contentId) bits.push('inline');
    meta.textContent = bits.filter(Boolean).join(' · ');
    text.append(title, meta);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-sm';
    const icon = document.createElement('span');
    icon.className = 'icon-mask icon-download';
    icon.setAttribute('aria-hidden', 'true');
    button.append(icon, document.createTextNode('Download'));
    button.addEventListener('click', () => {
      download(name, part.bytes, part.mimeType);
    });

    li.append(thumb, text, button);
    ui.attachmentList.appendChild(li);
  });
}

/* ------------------------------------------------------------ structure */

function partDisplayName(part, index) {
  if (part.filename) return part.filename;
  if (part.type === 'multipart') return `${part.mimeType} (${part.parts.length} parts)`;
  return part.mimeType;
}

function buildTreeNode(part, index) {
  const li = document.createElement('li');

  const row = document.createElement('div');
  row.className = 'tree-node';

  const type = document.createElement('span');
  type.className = 'tree-type';
  type.textContent = partDisplayName(part, index);
  row.appendChild(type);

  const tags = document.createElement('span');
  tags.className = 'tree-tags';
  const addTag = (label, extra) => {
    const tag = document.createElement('span');
    tag.className = extra ? `tag ${extra}` : 'tag';
    tag.textContent = label;
    tags.appendChild(tag);
  };
  if (part.filename) addTag(part.mimeType);
  addTag(formatBytes(part.size));
  if (part.encoding && part.encoding !== '7bit') addTag(part.encoding);
  if (part.charset) addTag(part.charset);
  if (state.message.bodies.includes(part)) addTag('body', 'tag-body');
  if (part !== state.message.root && isAttachment(part)) addTag('attachment');
  if (part.contentId) addTag(`cid:${part.contentId}`);
  row.appendChild(tags);

  if (part.bytes?.length) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-sm btn-ghost';
    button.textContent = 'Download';
    button.addEventListener('click', () => {
      download(partExportName(part, baseName()), part.bytes, part.mimeType);
    });
    row.appendChild(button);
  }

  li.appendChild(row);

  if (part.parts.length) {
    const ul = document.createElement('ul');
    part.parts.forEach((child, i) => ul.appendChild(buildTreeNode(child, i)));
    li.appendChild(ul);
  }

  return li;
}

function renderStructure() {
  ui.structureTree.textContent = '';
  const ul = document.createElement('ul');
  ul.appendChild(buildTreeNode(state.message.root, 0));
  ui.structureTree.appendChild(ul);
}

/* ----------------------------------------------------------------- tabs */

const TAB_DEFINITIONS = [
  { key: 'rendered', label: 'Rendered' },
  { key: 'text', label: 'Plain text', when: (m) => Boolean(m.plain) || Boolean(state.derivedText) },
  { key: 'html', label: 'HTML source', when: (m) => Boolean(m.html) },
  { key: 'headers', label: 'Headers', count: (m) => m.headers.length },
  { key: 'attachments', label: 'Attachments', count: (m) => m.attachments.length },
  { key: 'structure', label: 'Structure', count: (m) => countParts(m.root) },
  { key: 'raw', label: 'Raw source' },
];

function countParts(root) {
  let total = 0;
  walkParts(root, () => { total += 1; });
  return total;
}

function showTab(key) {
  for (const tab of ui.tabs.querySelectorAll('.tab')) {
    const selected = tab.dataset.key === key;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
  for (const def of TAB_DEFINITIONS) {
    const pane = el(`pane-${def.key}`);
    if (pane) pane.hidden = def.key !== key;
  }
}

function renderTabs() {
  ui.tabs.textContent = '';
  const message = state.message;
  let first = null;
  for (const def of TAB_DEFINITIONS) {
    if (def.when && !def.when(message)) continue;
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'tab';
    tab.id = `tab-${def.key}`;
    tab.dataset.key = def.key;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', `pane-${def.key}`);
    tab.textContent = def.key === 'text' && state.derivedText ? 'Markdown' : def.label;
    if (def.count) {
      const count = document.createElement('span');
      count.className = 'tab-count';
      count.textContent = String(def.count(message));
      tab.appendChild(count);
    }
    tab.addEventListener('click', () => showTab(def.key));
    ui.tabs.appendChild(tab);
    first ??= def.key;
  }
  showTab(first);
}

ui.tabs.addEventListener('keydown', (event) => {
  const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
  if (!keys.includes(event.key)) return;
  const tabs = [...ui.tabs.querySelectorAll('.tab')];
  const current = tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true');
  let next = current;
  if (event.key === 'ArrowLeft') next = (current - 1 + tabs.length) % tabs.length;
  if (event.key === 'ArrowRight') next = (current + 1) % tabs.length;
  if (event.key === 'Home') next = 0;
  if (event.key === 'End') next = tabs.length - 1;
  event.preventDefault();
  showTab(tabs[next].dataset.key);
  tabs[next].focus();
});

/* --------------------------------------------------------------- export */

function openExportDialog() {
  ui.exportBody.textContent = '';
  const groups = buildExportGroups({
    message: state.message,
    stem: baseName(),
    rawBlob: state.rawBlob,
    fileName: state.file?.name,
    fileSize: state.file?.size,
    derivedText: state.derivedText,
  });
  for (const group of groups) {
    const title = document.createElement('div');
    title.className = 'export-group-title';
    title.textContent = group.title;
    ui.exportBody.appendChild(title);

    for (const item of group.items) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'export-row';

      const icon = document.createElement('span');
      icon.className = 'icon-mask icon-download';
      icon.setAttribute('aria-hidden', 'true');

      const text = document.createElement('span');
      text.className = 'export-row-text';
      const name = document.createElement('span');
      name.className = 'export-row-name';
      name.textContent = item.name;
      const meta = document.createElement('span');
      meta.className = 'export-row-meta';
      meta.textContent = item.meta;
      text.append(name, meta);

      row.append(icon, text);
      row.addEventListener('click', item.run);
      ui.exportBody.appendChild(row);
    }
  }
  ui.exportDialog.showModal();
}

ui.exportDialog.addEventListener('click', (event) => {
  if (event.target === ui.exportDialog) ui.exportDialog.close();
});

/* ------------------------------------------------- per-pane actions */

function currentFor(kind) {
  const message = state.message;
  const stem = baseName();
  if (kind === 'rendered') {
    const part = state.bodyPart;
    if (!part) return null;
    const html = part.mimeType === 'text/html';
    return {
      text: partText(part),
      filename: html ? `${stem}.html` : `${stem}.txt`,
      type: `${part.mimeType};charset=utf-8`,
    };
  }
  if (kind === 'text') {
    if (message.plain) {
      return { text: partText(message.plain), filename: `${stem}.txt`, type: 'text/plain;charset=utf-8' };
    }
    return state.derivedText
      ? { text: state.derivedText, filename: `${stem}.md`, type: 'text/markdown;charset=utf-8' }
      : null;
  }
  if (kind === 'html') {
    return message.html
      ? { text: partText(message.html), filename: `${stem}.html`, type: 'text/html;charset=utf-8' }
      : null;
  }
  if (kind === 'headers') {
    return {
      text: headersText(ui.decodeHeaders.checked),
      filename: `${stem}-headers.txt`,
      type: 'text/plain;charset=utf-8',
    };
  }
  if (kind === 'raw') {
    return { text: null, filename: `${stem}.eml`, type: 'message/rfc822' };
  }
  return null;
}

document.addEventListener('click', (event) => {
  const downloadBtn = event.target.closest('[data-download]');
  if (downloadBtn && state.message) {
    const item = currentFor(downloadBtn.dataset.download);
    if (!item) return;
    if (downloadBtn.dataset.download === 'raw') download(item.filename, state.rawBlob, item.type);
    else download(item.filename, item.text, item.type);
    return;
  }

  const copyBtn = event.target.closest('[data-copy]');
  if (copyBtn && state.message) {
    const kind = copyBtn.dataset.copy;
    const text = kind === 'raw' ? state.message.raw : currentFor(kind)?.text;
    if (text != null) copyToClipboard(text, copyBtn);
  }
});

ui.decodeHeaders.addEventListener('change', renderHeaders);
ui.remoteImages.addEventListener('change', renderBody);
ui.exportBtn.addEventListener('click', openExportDialog);
ui.clearBtn.addEventListener('click', reset);

/* ----------------------------------------------------------- lifecycle */

const RAW_LIMIT = 400_000;

function reset() {
  releaseUrls();
  state.message = null;
  state.file = null;
  state.bodyPart = null;
  state.derivedText = null;
  state.rawBlob = null;
  ui.panel.hidden = true;
  ui.errorBox.hidden = true;
  ui.uploadZone.hidden = false;
  ui.htmlFrame.removeAttribute('srcdoc');
  window.scrollTo({ top: 0 });
}

function showError(text) {
  setText(ui.errorBox, text);
  ui.errorBox.hidden = false;
  ui.uploadZone.hidden = false;
  ui.uploadZone.classList.remove('loading');
  ui.panel.hidden = true;
}

function render() {
  const message = state.message;
  const file = state.file;

  setText(ui.fileName, file?.name || 'Pasted message');
  const parts = countParts(message.root);
  setText(ui.fileMeta, [
    formatBytes(file?.size ?? message.raw.length),
    `${parts} MIME part${parts === 1 ? '' : 's'}`,
    `${message.attachments.length} attachment${message.attachments.length === 1 ? '' : 's'}`,
    message.root.mimeType,
  ].join(' · '));

  renderSummary();
  renderBodyPicker();
  renderBody();

  if (message.plain) {
    setText(ui.textMeta, `text/plain${message.plain.charset ? `; charset=${message.plain.charset}` : ''} · ${message.plain.encoding}`);
    renderLinkedText(ui.plainSource, partText(message.plain));
    ui.textNotice.hidden = true;
    setText(ui.textDownloadLabel, 'Download .txt');
  } else if (state.derivedText) {
    setText(ui.textMeta, `text/markdown · ${formatBytes(new Blob([state.derivedText]).size)}`);
    renderLinkedText(ui.plainSource, state.derivedText);
    ui.textNotice.hidden = false;
    setText(ui.textDownloadLabel, 'Download .md');
  }
  if (message.html) {
    setText(ui.htmlMeta, `text/html${message.html.charset ? `; charset=${message.html.charset}` : ''} · ${message.html.encoding}`);
    setText(ui.htmlSource, partText(message.html));
  }

  renderHeaders();
  renderAttachments();
  renderStructure();

  const raw = message.raw;
  const truncated = raw.length > RAW_LIMIT;
  setText(ui.rawMeta, truncated
    ? `showing the first ${formatBytes(RAW_LIMIT)} of ${formatBytes(raw.length)}`
    : `${formatBytes(raw.length)}`);
  setText(ui.rawSource, truncated ? `${raw.slice(0, RAW_LIMIT)}\n\n…truncated…` : raw);

  renderTabs();

  ui.uploadZone.hidden = true;
  ui.uploadZone.classList.remove('loading');
  ui.errorBox.hidden = true;
  ui.panel.hidden = false;
}

async function loadFile(file) {
  if (!file) return;
  ui.errorBox.hidden = true;
  ui.uploadZone.classList.add('loading');
  try {
    const buffer = await file.arrayBuffer();
    if (!buffer.byteLength) throw new Error('That file is empty.');
    releaseUrls();
    const binary = binaryFromBuffer(buffer);
    const message = parseEml(binary);
    if (!message.headers.length) {
      throw new Error('No email headers found — is this really a .eml / MIME message?');
    }
    state.file = file;
    state.message = message;
    state.bodyPart = message.preferred;
    state.derivedText = deriveText(message);
    state.rawBlob = new Blob([buffer], { type: 'message/rfc822' });
    render();
  } catch (error) {
    showError(error instanceof Error ? error.message : 'Could not read that file.');
  }
}

window.__emlEarly.register(loadFile);
