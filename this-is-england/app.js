(() => {
  const view = document.getElementById('view');
  const backBtn = document.getElementById('backBtn');
  let TOPICS = [];

  const escapeHtml = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));

  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const renderHome = () => {
    backBtn.hidden = true;
    document.title = 'This is England — Stories for Curious Kids';
    window.scrollTo(0, 0);
    view.innerHTML = `
      <section class="hero">
        <h1>This is <em>England</em>.</h1>
        <p>Fifty tiny stories about the people, places, food, and feelings that make England what it is. Pick a card and wander in.</p>
      </section>
      <section class="grid">
        ${TOPICS.map((t) => `
          <a class="card" href="#/${encodeURIComponent(t.slug)}">
            <img class="card__img" src="images/${t.image}.avif" alt="" loading="lazy" width="400" height="300">
            <div class="card__body">
              <div class="card__num">№ ${t.number}</div>
              <h2 class="card__title">${escapeHtml(t.title)}</h2>
            </div>
          </a>
        `).join('')}
      </section>
    `;
  };

  const renderTopic = (slug) => {
    const idx = TOPICS.findIndex((t) => t.slug === slug);
    if (idx === -1) {
      view.innerHTML = `<p class="notfound">That story wandered off. <a href="#/">Back to the map.</a></p>`;
      return;
    }
    const t = TOPICS[idx];
    const prev = TOPICS[idx - 1];
    const next = TOPICS[idx + 1];

    backBtn.hidden = false;
    document.title = `${t.title} — This is England`;
    window.scrollTo(0, 0);

    view.innerHTML = `
      <article class="article">
        <div class="article__hero">
          <img src="images/${t.image}.avif" alt="${escapeHtml(t.title)}">
          <div class="article__headline">
            <div class="article__num">Story № ${t.number}</div>
            <h1 class="article__title">${escapeHtml(t.title)}</h1>
          </div>
        </div>

        <div class="article__body">
          ${t.summary.map((p, i) => `<p${i === 0 ? ' class="article__lede"' : ''}>${escapeHtml(p)}</p>`).join('')}
        </div>

        <aside class="callout">
          <div class="callout__label">Did you know?</div>
          <p>${escapeHtml(t.didYouKnow)}</p>
        </aside>

        <aside class="callout callout--history">
          <div class="callout__label">A moment from history</div>
          <h3 class="callout__subtitle">${escapeHtml(t.momentFromHistory.title)}</h3>
          <p>${escapeHtml(t.momentFromHistory.text)}</p>
        </aside>

        <section class="reading">
          <h2>Keep exploring</h2>
          <ul>
            ${t.furtherReading.map((r) => `
              <li><a href="${escapeHtml(r.url)}" target="_blank" rel="noopener">${escapeHtml(r.title)}</a></li>
            `).join('')}
          </ul>
        </section>

        <nav class="nextprev" aria-label="More stories">
          ${prev
        ? `<a class="prev" href="#/${encodeURIComponent(prev.slug)}">
                 <span class="mini">← Previous</span>${escapeHtml(prev.title)}
               </a>`
        : `<span class="prev disabled"><span class="mini">← Previous</span>The very first story</span>`}
          ${next
        ? `<a class="next" href="#/${encodeURIComponent(next.slug)}">
                 <span class="mini">Next →</span>${escapeHtml(next.title)}
               </a>`
        : `<span class="next disabled"><span class="mini">Next →</span>The very last story</span>`}
        </nav>
      </article>
    `;
  };

  const route = () => {
    const hash = decodeURIComponent(location.hash || '').replace(/^#\/?/, '');
    if (!hash) return renderHome();
    renderTopic(hash);
  };

  backBtn.addEventListener('click', () => { location.hash = '#/'; });
  window.addEventListener('hashchange', route);

  view.innerHTML = '<p class="loading">Loading stories…</p>';
  fetch('data.json', { cache: 'no-cache' })
    .then((r) => r.json())
    .then((data) => {
      TOPICS = shuffle(data.topics);
      route();
    })
    .catch((err) => {
      view.innerHTML = `<p class="notfound">Couldn't load the stories (${escapeHtml(err.message)}). If you opened this file with a double-click, try running a local web server instead.</p>`;
    });
})();
