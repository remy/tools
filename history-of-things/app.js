(() => {
  const view = document.getElementById('view');
  const backBtn = document.getElementById('backBtn');
  const SITE_TITLE = 'The History of Things';

  /** Manifest rows: { number, slug, title, image }, ordered oldest first. */
  let INDEX = [];
  /** Fetched entry bodies, keyed by slug. */
  const cache = new Map();

  const escapeHtml = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));

  const entryUrl = (slug) => `#/${encodeURIComponent(slug)}`;

  const renderHome = () => {
    backBtn.hidden = true;
    document.title = SITE_TITLE;
    window.scrollTo(0, 0);

    const intro = `
      <section class="hero">
        <h1>The History of <em>Things</em>.</h1>
        <p>Everything around you was invented by somebody, argued over, improved, copied and very
          nearly forgotten. These are the stories of how ordinary things came to be — researched
          properly, written to be enjoyed.</p>
      </section>
    `;

    if (!INDEX.length) {
      view.innerHTML = `
        ${intro}
        <p class="empty">No histories yet. Add the first one with
          <code>/new-history-of-things &lt;subject&gt;</code>.</p>
      `;
      return;
    }

    // Newest first: the most recently researched entry leads the page.
    const order = INDEX.slice().reverse();

    view.innerHTML = `
      ${intro}
      <section class="grid">
        ${order.map((e) => `
          <a class="card" href="${entryUrl(e.slug)}">
            <img class="card__img" src="images/${escapeHtml(e.image)}" alt="" loading="lazy" width="400" height="300">
            <div class="card__body">
              <div class="card__num">№ ${e.number}</div>
              <h2 class="card__title">${escapeHtml(e.title)}</h2>
            </div>
          </a>
        `).join('')}
      </section>
    `;
  };

  const renderNotFound = () => {
    backBtn.hidden = false;
    document.title = `Not found — ${SITE_TITLE}`;
    view.innerHTML = `<p class="notfound">That history hasn't been written yet. <a href="#/">Back to the shelf.</a></p>`;
  };

  const renderEntry = (meta, entry) => {
    const idx = INDEX.indexOf(meta);
    const prev = INDEX[idx - 1];
    const next = INDEX[idx + 1];

    backBtn.hidden = false;
    document.title = `${entry.title} — ${SITE_TITLE}`;
    window.scrollTo(0, 0);

    const credit = entry.imageCredit
      ? `<p class="article__credit">Image: ${entry.imageCredit.url
        ? `<a href="${escapeHtml(entry.imageCredit.url)}" target="_blank" rel="noopener">${escapeHtml(entry.imageCredit.text)}</a>`
        : escapeHtml(entry.imageCredit.text)}</p>`
      : '';

    // Both callouts must cite where they came from; a claim without a source
    // is the one thing a history like this cannot afford.
    const didYouKnow = typeof entry.didYouKnow === 'string'
      ? { text: entry.didYouKnow, sources: [] }
      : entry.didYouKnow;

    const sources = (list) => {
      if (!list || !list.length) return '';
      const links = list.map((s) =>
        `<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener">${escapeHtml(s.title)}</a>`);
      return `<p class="callout__source">${links.length > 1 ? 'Sources' : 'Source'}: ${links.join(' · ')}</p>`;
    };

    const nav = (dir, item, fallback) => item
      ? `<a class="${dir}" href="${entryUrl(item.slug)}">
           <span class="mini">${dir === 'prev' ? '← Previous' : 'Next →'}</span>${escapeHtml(item.title)}
         </a>`
      : `<span class="${dir} disabled">
           <span class="mini">${dir === 'prev' ? '← Previous' : 'Next →'}</span>${fallback}
         </span>`;

    view.innerHTML = `
      <article class="article">
        <div class="article__hero">
          <img src="images/${escapeHtml(entry.image)}" alt="${escapeHtml(entry.imageAlt || entry.title)}">
          <div class="article__headline">
            <div class="article__num">№ ${meta.number}</div>
            <h1 class="article__title">${escapeHtml(entry.title)}</h1>
          </div>
        </div>

        <div class="article__content">
          ${credit}

          <div class="article__body">
            ${entry.summary.map((p, i) => `<p${i === 0 ? ' class="article__lede"' : ''}>${escapeHtml(p)}</p>`).join('')}
          </div>

          <aside class="callout">
            <div class="callout__label">Did you know?</div>
            <p>${escapeHtml(didYouKnow.text)}</p>
            ${sources(didYouKnow.sources)}
          </aside>

          <aside class="callout callout--history">
            <div class="callout__label">A moment from history</div>
            <h3 class="callout__subtitle">${escapeHtml(entry.momentFromHistory.title)}</h3>
            <p>${escapeHtml(entry.momentFromHistory.text)}</p>
            ${sources(entry.momentFromHistory.sources)}
          </aside>

          <section class="reading">
            <h2>Keep exploring</h2>
            <ul>
              ${entry.furtherReading.map((r) => `
                <li>
                  <a href="${escapeHtml(r.url)}" target="_blank" rel="noopener">
                    ${escapeHtml(r.title)}
                    ${r.note ? `<span class="reading__source">${escapeHtml(r.note)}</span>` : ''}
                  </a>
                </li>
              `).join('')}
            </ul>
          </section>

          <nav class="nextprev" aria-label="More histories">
            ${nav('prev', prev, 'The very first entry')}
            ${nav('next', next, 'The latest entry')}
          </nav>
        </div>
      </article>
    `;
  };

  const showEntry = async (slug) => {
    // Only slugs listed in the manifest are ever fetched.
    const meta = INDEX.find((e) => e.slug === slug);
    if (!meta) return renderNotFound();

    if (cache.has(slug)) return renderEntry(meta, cache.get(slug));

    view.innerHTML = '<p class="loading">Opening…</p>';
    try {
      const res = await fetch(`entries/${encodeURIComponent(slug)}.json`, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const entry = await res.json();
      cache.set(slug, entry);
      if (currentSlug() === slug) renderEntry(meta, entry);
    } catch (err) {
      view.innerHTML = `<p class="notfound">Couldn't open that history (${escapeHtml(err.message)}). <a href="#/">Back to the shelf.</a></p>`;
    }
  };

  const currentSlug = () =>
    decodeURIComponent(location.hash || '').replace(/^#\/?/, '');

  const route = () => {
    const slug = currentSlug();
    if (!slug) return renderHome();
    showEntry(slug);
  };

  backBtn.addEventListener('click', () => { location.hash = '#/'; });
  window.addEventListener('hashchange', route);

  view.innerHTML = '<p class="loading">Loading histories…</p>';
  fetch('entries/index.json', { cache: 'no-cache' })
    .then((r) => r.json())
    .then((data) => {
      INDEX = (data.entries || []).slice().sort((a, b) => a.number - b.number);
      route();
    })
    .catch((err) => {
      view.innerHTML = `<p class="notfound">Couldn't load the index (${escapeHtml(err.message)}). If you opened this file with a double-click, try running a local web server instead.</p>`;
    });
})();
