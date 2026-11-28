/*
 * HTML to Markdown, for messages that ship an HTML body and no text/plain
 * alternative. Aimed squarely at email: layout tables are flattened rather
 * than forced into Markdown grids, and only tables that genuinely hold
 * tabular data become tables.
 */

const BLOCK_TAGS = new Set([
  'address', 'article', 'aside', 'blockquote', 'center', 'dd', 'div', 'dl', 'dt',
  'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4',
  'h5', 'h6', 'header', 'hr', 'li', 'main', 'nav', 'ol', 'p', 'pre', 'section',
  'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'ul',
]);

const DROP_TAGS = 'script, style, noscript, template, head, title, meta, link, object, embed, iframe';

function collapse(text) {
  return text.replace(/ /g, ' ').replace(/[\t\r\n]+/g, ' ').replace(/ {2,}/g, ' ');
}

function escapeText(text) {
  return text.replace(/([\\`*[\]])/g, '\\$1');
}

/* Keeps the emphasis markers tight against the words, with any surrounding
 * whitespace left outside them. */
function wrap(text, marker) {
  const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(text);
  if (!match || !match[2]) return text;
  return match[1] + marker + match[2] + marker + match[3];
}

function encodeTarget(url) {
  const trimmed = url.trim().replace(/\s/g, '%20');
  return /[()]/.test(trimmed) ? `<${trimmed}>` : trimmed;
}

function isSafeHref(href) {
  return !/^\s*(javascript|data|vbscript):/i.test(href);
}

/* ------------------------------------------------------------------ inline */

function renderInline(node, ctx) {
  let out = '';
  for (const child of node.childNodes) out += renderInlineNode(child, ctx);
  return out;
}

function renderInlineNode(node, ctx) {
  if (node.nodeType === Node.TEXT_NODE) return escapeText(collapse(node.nodeValue));
  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const tag = node.tagName.toLowerCase();
  switch (tag) {
    case 'br':
      return '  \n';
    case 'strong':
    case 'b':
      return wrap(renderInline(node, ctx), '**');
    case 'em':
    case 'i':
    case 'cite':
      return wrap(renderInline(node, ctx), '*');
    case 'del':
    case 's':
    case 'strike':
      return wrap(renderInline(node, ctx), '~~');
    case 'code':
    case 'tt':
    case 'kbd':
    case 'samp': {
      const text = collapse(node.textContent).trim();
      return text ? `\`${text}\`` : '';
    }
    case 'a': {
      const text = renderInline(node, ctx).trim();
      const href = (node.getAttribute('href') || '').trim();
      if (!href || !isSafeHref(href)) return text;
      if (!text || text === href) return `<${href}>`;
      return `[${text}](${encodeTarget(href)})`;
    }
    case 'img': {
      const alt = collapse(node.getAttribute('alt') || '').trim();
      const raw = (node.getAttribute('src') || '').trim();
      const src = ctx.resolveImage ? ctx.resolveImage(raw) : raw;
      if (!src || !isSafeHref(src)) return alt ? `![${alt}]` : '';
      return `![${alt}](${encodeTarget(src)})`;
    }
    default:
      return renderInline(node, ctx);
  }
}

/* ------------------------------------------------------------------ blocks */

function renderBlocks(node, ctx) {
  const blocks = [];
  let buffer = '';

  const flush = () => {
    const text = buffer.replace(/^[ \t]+$/gm, '').trim();
    if (text) blocks.push(text);
    buffer = '';
  };

  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      buffer += escapeText(collapse(child.nodeValue));
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;

    const tag = child.tagName.toLowerCase();
    if (!BLOCK_TAGS.has(tag)) {
      buffer += renderInlineNode(child, ctx);
      continue;
    }
    flush();
    blocks.push(...renderBlockElement(child, tag, ctx));
  }

  flush();
  return blocks.filter(Boolean);
}

function renderList(node, tag, ctx) {
  const ordered = tag === 'ol';
  let counter = Number(node.getAttribute('start') || 1);
  if (!Number.isFinite(counter)) counter = 1;

  const items = [];
  for (const li of node.children) {
    if (li.tagName.toLowerCase() !== 'li') continue;
    const marker = ordered ? `${counter++}. ` : '- ';
    const pad = ' '.repeat(marker.length);
    const body = renderBlocks(li, ctx).join('\n\n');
    if (!body) continue;
    const indented = body
      .split('\n')
      .map((line, i) => (i === 0 || !line ? line : pad + line))
      .join('\n');
    items.push(marker + indented);
  }
  return items.length ? [items.join('\n')] : [];
}

/* Email uses tables for layout far more often than for data, and a layout
 * table forced into a Markdown grid is unreadable. Only a table with real
 * header cells, or a consistent grid of inline-only cells, is kept as one. */
function isDataTable(table) {
  if (table.querySelector('table')) return false;
  const rows = [...table.querySelectorAll('tr')];
  if (rows.length < 2) return false;

  const widths = rows.map((row) => row.children.length);
  if (widths[0] < 2 || widths.some((w) => w !== widths[0])) return false;
  if (table.querySelector('th')) return true;

  return rows.every((row) => [...row.children].every(
    (cell) => !cell.querySelector('p, div, ul, ol, table, blockquote, h1, h2, h3, h4, h5, h6, pre'),
  ));
}

function renderTable(table, ctx) {
  const rows = [...table.querySelectorAll('tr')].map((row) => [...row.children].map(
    (cell) => renderInline(cell, ctx).replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|').trim(),
  ));
  const [header, ...body] = rows;
  const line = (cells) => `| ${cells.join(' | ')} |`;
  return [[
    line(header),
    line(header.map(() => '---')),
    ...body.map(line),
  ].join('\n')];
}

function renderBlockElement(node, tag, ctx) {
  switch (tag) {
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6': {
      const text = renderInline(node, ctx).replace(/\s*\n\s*/g, ' ').trim();
      return text ? [`${'#'.repeat(Number(tag[1]))} ${text}`] : [];
    }
    case 'hr':
      return ['---'];
    case 'pre': {
      const text = node.textContent.replace(/\n+$/, '');
      if (!text.trim()) return [];
      const fence = text.includes('```') ? '~~~' : '```';
      return [`${fence}\n${text}\n${fence}`];
    }
    case 'blockquote': {
      const inner = renderBlocks(node, ctx).join('\n\n');
      if (!inner) return [];
      return [inner.split('\n').map((l) => (l ? `> ${l}` : '>')).join('\n')];
    }
    case 'ul':
    case 'ol':
      return renderList(node, tag, ctx);
    case 'table':
      return isDataTable(node) ? renderTable(node, ctx) : renderBlocks(node, ctx);
    default:
      return renderBlocks(node, ctx);
  }
}

/* --------------------------------------------------------------- entry point */

export function htmlToMarkdown(html, options = {}) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll(DROP_TAGS).forEach((n) => n.remove());
  doc.querySelectorAll('[hidden], [style*="display:none"], [style*="display: none"]')
    .forEach((n) => n.remove());

  const root = doc.body || doc.documentElement;
  const markdown = renderBlocks(root, options)
    .join('\n\n')
    .replace(/^[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return markdown ? `${markdown}\n` : '';
}
