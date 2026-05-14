const PLATFORMS = ['cldr', 'apple', 'windows', 'android'];

export function resolveRow(entry, overrides) {
  const o = overrides[entry.cp] ?? {};
  return {
    cldr: entry.cldr,
    apple: o.apple ?? entry.cldr,
    windows: o.windows ?? entry.cldr,
    android: o.android ?? entry.cldr,
    note: o._note ?? null,
  };
}

export function hasDiff(resolved) {
  return (
    resolved.apple !== resolved.cldr ||
    resolved.windows !== resolved.cldr ||
    resolved.android !== resolved.cldr
  );
}

export function buildRows(data, overrides) {
  const frag = document.createDocumentFragment();

  for (const entry of data) {
    const resolved = resolveRow(entry, overrides);
    const diff = hasDiff(resolved);

    const tr = document.createElement('tr');
    tr.dataset.grp = entry.grp;
    tr.dataset.hasDiff = diff ? '1' : '0';

    // Searchable haystack: glyph, codepoint (with and without dashes), cldr name, keywords, category.
    const haystack = [
      entry.g,
      entry.cp,
      entry.cp.replace(/-/g, ' '),
      entry.cldr,
      entry.tts,
      ...(entry.kw ?? []),
      entry.grp,
      entry.sub,
      resolved.apple,
      resolved.windows,
      resolved.android,
    ]
      .join(' ')
      .toLowerCase();
    tr.dataset.search = haystack;

    // Emoji glyph cell (row header)
    const emojiTh = document.createElement('th');
    emojiTh.scope = 'row';
    emojiTh.className = 'cell-emoji';
    emojiTh.setAttribute('aria-label', entry.cldr);
    emojiTh.textContent = entry.g;
    tr.appendChild(emojiTh);

    // Codepoint
    const cpTd = document.createElement('td');
    cpTd.className = 'cell-cp';
    cpTd.textContent = entry.cp.split('-').map((c) => `U+${c}`).join(' ');
    tr.appendChild(cpTd);

    // Category
    const catTd = document.createElement('td');
    catTd.className = 'cell-cat';
    catTd.textContent = entry.sub || entry.grp;
    catTd.title = `${entry.grp} → ${entry.sub}`;
    tr.appendChild(catTd);

    // Platform cells
    for (const p of PLATFORMS) {
      const td = document.createElement('td');
      td.className = 'cell-platform';
      if (p !== 'cldr' && resolved[p] !== resolved.cldr) {
        td.classList.add('diff');
      }
      td.textContent = resolved[p];

      if (p === 'cldr' && resolved.note) {
        const icon = document.createElement('span');
        icon.className = 'note-icon';
        icon.title = resolved.note;
        icon.setAttribute('aria-label', `Note: ${resolved.note}`);
        icon.textContent = '!';
        td.appendChild(icon);
      }

      tr.appendChild(td);
    }

    frag.appendChild(tr);
  }

  return frag;
}

export function uniqueCategories(data) {
  const seen = new Set();
  const out = [];
  for (const entry of data) {
    if (!seen.has(entry.grp)) {
      seen.add(entry.grp);
      out.push(entry.grp);
    }
  }
  return out;
}
