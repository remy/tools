// AT Protocol glossary — renders the full listing and wires the
// command-palette as the search / quick-jump feature.
// Depends on CATEGORIES and TERMS from terms.js.

const glossaryEl = document.getElementById('glossary');
const countEl = document.getElementById('count');

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

// --- render --------------------------------------------------------------

function render() {
  const sections = CATEGORIES.map((cat) => {
    const items = TERMS.filter((t) => t.cat === cat.id);
    if (!items.length) return '';

    const cards = items
      .map((t) => {
        const id = slug(t.term);
        const abbr = t.abbr
          ? `<span class="term-abbr">${escapeHtml(t.abbr)}</span>`
          : '';
        const aka =
          t.aka && t.aka.length
            ? `<span class="term-aka">also: ${escapeHtml(
                t.aka.join(', ')
              )}</span>`
            : '';

        const refLabel = t.refLabel || 'Read more';
        return `
          <article class="term-card" id="${id}">
            <div class="term-top">
              <span class="term-name">${escapeHtml(t.term)}</span>
              ${abbr}
              ${aka}
            </div>
            <p class="term-def">${renderDef(t.def)}</p>
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
  countEl.textContent = `${TERMS.length} terms across ${CATEGORIES.length} categories`;
}

// Scroll a target anchor into view, offset for the sticky header. Smooth when
// motion is allowed, instant otherwise (respects prefers-reduced-motion).
const prefersReducedMotion = window.matchMedia(
  '(prefers-reduced-motion: reduce)'
);

function jumpTo(target) {
  const el = document.getElementById(target);
  if (!el) return;
  history.replaceState(null, '', '#' + target);
  const controls = document.querySelector('.controls');
  const offset = (controls ? controls.offsetHeight : 0) + 12;
  const top = el.getBoundingClientRect().top + window.scrollY - offset;
  window.scrollTo({
    top,
    behavior: prefersReducedMotion.matches ? 'auto' : 'smooth',
  });
}

// --- command palette (search / quick jump) ------------------------------

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
    // Dynamic base commands: (re)built each time the palette opens so the
    // list always reflects the current glossary data.
    palette.onBeforeOpen = () => palette.setBaseCommands(buildPaletteCommands());
    palette.setBaseCommands(buildPaletteCommands());
    palette.addEventListener('navigate', (e) => jumpTo(e.detail.command.target));
  }
  const jumpBtn = document.getElementById('quick-jump');
  if (jumpBtn) jumpBtn.addEventListener('click', () => palette && palette.open());
}

// --- events --------------------------------------------------------------

// Cross-links jump within the page (the browser handles the #hash too, but
// this keeps the smooth-scroll behaviour consistent with palette jumps).
glossaryEl.addEventListener('click', (e) => {
  const link = e.target.closest('.xlink');
  if (link && link.dataset.jump) {
    e.preventDefault();
    jumpTo(link.dataset.jump);
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
