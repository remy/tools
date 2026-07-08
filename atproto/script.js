// AT Protocol glossary — search, filter, cross-link rendering.
// Depends on CATEGORIES and TERMS from terms.js.

const glossaryEl = document.getElementById('glossary');
const searchEl = document.getElementById('search');
const clearBtn = document.getElementById('clear-search');
const countEl = document.getElementById('count');
const emptyEl = document.getElementById('empty');

// --- helpers -------------------------------------------------------------

const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

// Build a lookup so [[cross-links]] can resolve to a term's anchor id.
const termIndex = new Map();
for (const t of TERMS) {
  termIndex.set(t.term.toLowerCase(), t);
  for (const alt of t.aka || []) termIndex.set(alt.toLowerCase(), t);
  if (t.abbr) termIndex.set(t.abbr.toLowerCase(), t);
}

const escapeHtml = (s) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

// Render our tiny markup subset to HTML: **bold**, `code`, [[Term]] / [[Term|label]].
function renderDef(text) {
  // Split on code spans first so we don't format inside them.
  const parts = text.split(/(`[^`]+`)/g);
  return parts
    .map((part) => {
      if (part.startsWith('`') && part.endsWith('`')) {
        return `<code>${escapeHtml(part.slice(1, -1))}</code>`;
      }
      let out = escapeHtml(part);
      // Cross-links: [[Term]] or [[Term|label]]
      out = out.replace(/\[\[([^\]]+)\]\]/g, (_, inner) => {
        const [target, label] = inner.split('|');
        const key = target.trim().toLowerCase();
        const match = termIndex.get(key);
        const display = (label || target).trim();
        if (match) {
          return `<a class="xlink" href="#${slug(match.term)}" data-jump="${slug(
            match.term
          )}">${display}</a>`;
        }
        return display;
      });
      // Bold
      out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      return out;
    })
    .join('');
}

// Highlight a query inside already-rendered HTML, skipping tags.
function highlight(html, query) {
  if (!query) return html;
  const re = new RegExp(
    '(' + query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')',
    'gi'
  );
  // Only touch text between tags.
  return html.replace(/>([^<]+)</g, (m, txt) => {
    return '>' + txt.replace(re, '<mark>$1</mark>') + '<';
  });
}

// --- state ---------------------------------------------------------------

let query = '';

// --- matching ------------------------------------------------------------

function matches(term, q) {
  if (!q) return true;
  const hay = [
    term.term,
    term.abbr || '',
    (term.aka || []).join(' '),
    term.def,
  ]
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}

// --- render --------------------------------------------------------------

function render() {
  const q = query.trim().toLowerCase();
  let total = 0;

  const sections = CATEGORIES.map((cat) => {
    const items = TERMS.filter((t) => t.cat === cat.id && matches(t, q));
    if (!items.length) return '';
    total += items.length;

    const cards = items
      .map((t) => {
        const id = slug(t.term);
        let name = escapeHtml(t.term);
        if (q) name = highlight('>' + name + '<', q).slice(1, -1);

        const abbr = t.abbr
          ? `<span class="term-abbr">${escapeHtml(t.abbr)}</span>`
          : '';
        const aka =
          t.aka && t.aka.length
            ? `<span class="term-aka">also: ${escapeHtml(
                t.aka.join(', ')
              )}</span>`
            : '';

        let def = renderDef(t.def);
        if (q) def = highlight(def, q);

        const refLabel = t.refLabel || 'Read more';
        return `
          <article class="term-card" id="${id}">
            <div class="term-top">
              <span class="term-name">${name}</span>
              ${abbr}
              ${aka}
            </div>
            <p class="term-def">${def}</p>
            <div class="term-ref">
              <a href="${t.ref}" target="_blank" rel="noopener">${escapeHtml(
          refLabel
        )}</a>
            </div>
          </article>`;
      })
      .join('');

    return `
      <section class="cat-section" id="cat-${cat.id}">
        <div class="cat-head">
          <h2>${escapeHtml(cat.name)} <span class="cat-count">${
      items.length
    }</span></h2>
          <p class="cat-blurb">${escapeHtml(cat.blurb)}</p>
        </div>
        <div class="term-list">${cards}</div>
      </section>`;
  }).join('');

  glossaryEl.innerHTML = sections;
  emptyEl.hidden = total > 0;

  const grand = TERMS.length;
  if (q) {
    countEl.textContent = `Showing ${total} of ${grand} terms`;
  } else {
    countEl.textContent = `${grand} terms across ${CATEGORIES.length} categories`;
  }

  clearBtn.hidden = !query;
}

// Clear any active search and scroll a target anchor into view.
function jumpTo(target) {
  if (query) {
    query = '';
    searchEl.value = '';
    clearBtn.hidden = true;
    render();
  }
  const el = document.getElementById(target);
  if (el) {
    history.replaceState(null, '', '#' + target);
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// --- command palette (quick jump) ---------------------------------------

function buildPaletteCommands() {
  const catName = (id) => (CATEGORIES.find((c) => c.id === id) || {}).name || '';
  const terms = TERMS.map((t) => {
    const extra = [t.abbr, ...(t.aka || [])].filter(Boolean).join(' · ');
    const desc = `${t.term}${extra ? ' · ' + extra : ''}  —  ${catName(t.cat)}`;
    return { name: 'navigate', description: desc, target: slug(t.term) };
  });
  const cats = CATEGORIES.map((c) => ({
    name: 'navigate',
    description: `▸ ${c.name} (category)`,
    target: 'cat-' + c.id,
  }));
  return [...terms, ...cats];
}

function initPalette() {
  const palette = document.querySelector('command-palette');
  if (palette) {
    palette.setBaseCommands(buildPaletteCommands());
    palette.addEventListener('navigate', (e) => jumpTo(e.detail.command.target));
  }
  const jumpBtn = document.getElementById('quick-jump');
  if (jumpBtn) jumpBtn.addEventListener('click', () => palette && palette.open());
}

// --- events --------------------------------------------------------------

searchEl.addEventListener('input', () => {
  query = searchEl.value;
  render();
});

clearBtn.addEventListener('click', () => {
  query = '';
  searchEl.value = '';
  searchEl.focus();
  render();
});

// Clicking a cross-link: clear any active search so the target is visible.
glossaryEl.addEventListener('click', (e) => {
  const link = e.target.closest('.xlink');
  if (!link) return;
  if (query) {
    e.preventDefault();
    jumpTo(link.dataset.jump);
  }
});

// Keyboard shortcut: "/" focuses search.
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement !== searchEl) {
    e.preventDefault();
    searchEl.focus();
  }
});

// --- init ----------------------------------------------------------------

render();
initPalette();

// Deep-link on load (e.g. #pds).
if (location.hash) {
  const el = document.getElementById(location.hash.slice(1));
  if (el) el.scrollIntoView({ block: 'start' });
}
