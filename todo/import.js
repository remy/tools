// Markdown → todo-list importer.
//
// parseMarkdown() turns a Markdown document into a flat, ordered list of
// entries the todo app understands: section headings and checklist items.
// It deliberately understands only the small subset the app needs and ignores
// everything else (prose, rules, struck-through lines) rather than trying to be
// a general Markdown parser.

// Strip inline Markdown markers (code, bold, italic, strikethrough) while
// keeping the visible words. `Grated Cheese `(Frozen)`` -> `Grated Cheese (Frozen)`.
export function stripInlineMarkdown(text) {
  return text
    .replace(/`([^`]*)`/g, '$1')      // `code`
    .replace(/~~([^~]*)~~/g, '$1')    // ~~strike~~ (any survivor)
    .replace(/\*\*([^*]+)\*\*/g, '$1') // **bold**
    .replace(/\*([^*]+)\*/g, '$1')    // *italic*
    .replace(/\b_([^_]+)_\b/g, '$1')  // _italic_
    .trim();
}

// A horizontal rule: three or more of the same -, * or _, optionally spaced,
// and nothing else on the line. Kept strict so a `- item` bullet never matches.
function isHorizontalRule(line) {
  const t = line.trim();
  return /^([-*_])(\s*\1){2,}$/.test(t);
}

// Parse Markdown into [{ kind: 'item' | 'heading', text, checked }].
export function parseMarkdown(md) {
  const out = [];
  let seenH1 = false;

  for (const raw of String(md).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;                // blank
    if (isHorizontalRule(line)) continue; // ---, ***, ___

    // Heading: # .. ######
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      // The document title (first H1) is dropped — the list is already named.
      if (level === 1 && !seenH1) { seenH1 = true; continue; }
      const text = stripInlineMarkdown(heading[2]);
      if (text) out.push({ kind: 'heading', text, checked: false });
      continue;
    }

    // Bullet list item (optionally a checkbox). Struck-through bullets are
    // ignored per the import rules.
    const bullet = line.match(/^[-*+]\s+(.*)$/);
    if (bullet) {
      let rest = bullet[1];
      if (/^~~/.test(rest.trim())) continue; // ~~struck~~ line -> ignore
      let checked = false;
      const box = rest.match(/^\[([ xX])\]\s+(.*)$/);
      if (box) {
        checked = box[1].toLowerCase() === 'x';
        rest = box[2];
      }
      const text = stripInlineMarkdown(rest);
      if (text) out.push({ kind: 'item', text, checked });
      continue;
    }

    // Ordered list item -> unchecked task.
    const ordered = line.match(/^\d+\.\s+(.*)$/);
    if (ordered) {
      const text = stripInlineMarkdown(ordered[1]);
      if (text) out.push({ kind: 'item', text, checked: false });
      continue;
    }

    // Anything else (prose paragraphs) is ignored.
  }

  return out;
}
