// RSS Reader — parse an RSS 2.0 / Atom / RDF feed and render browsable items.
// Vanilla JS only, no dependencies.

(function () {
  const empty = document.getElementById('empty');
  const emptyError = document.getElementById('empty-error');
  const toolbar = document.getElementById('toolbar');
  const container = document.getElementById('container');
  const feedHeader = document.getElementById('feed-header');
  const itemsEl = document.getElementById('items');
  const feedCount = document.getElementById('feed-count');
  const btnExpand = document.getElementById('btn-expand');
  const btnCollapse = document.getElementById('btn-collapse');
  const btnClear = document.getElementById('btn-clear');
  const urlForm = document.getElementById('url-form');
  const urlInput = document.getElementById('url-input');
  const urlSubmit = document.getElementById('url-submit');

  const STORAGE_KEY = 'rss-reader:input';

  // Feeds are usually served without CORS headers, so a browser can't fetch
  // them directly. The site's generic CORS proxy (a Netlify function) fetches
  // the URL server-side and re-serves it with permissive CORS headers.
  const CORS_PROXY = '/cors-proxy';

  // ---- Feed parsing --------------------------------------------------------

  // Read the text content of the first matching child element. Handles both
  // namespaced (dc:creator, content:encoded) and plain tags by matching on the
  // local name, which sidesteps XML namespace lookups in querySelector.
  function firstText(parent, ...localNames) {
    for (const name of localNames) {
      for (const child of parent.children) {
        if (localName(child) === name) {
          const text = child.textContent;
          if (text && text.trim()) return text.trim();
        }
      }
    }
    return '';
  }

  function localName(el) {
    return (el.localName || el.nodeName).toLowerCase();
  }

  function childrenByName(parent, name) {
    const out = [];
    for (const child of parent.children) {
      if (localName(child) === name) out.push(child);
    }
    return out;
  }

  // Atom links carry the URL in an href attribute; prefer rel="alternate".
  function atomLink(entry) {
    const links = childrenByName(entry, 'link');
    if (!links.length) return '';
    const alt = links.find((l) => (l.getAttribute('rel') || 'alternate') === 'alternate');
    const chosen = alt || links[0];
    return chosen.getAttribute('href') || '';
  }

  function parseFeed(text) {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    const parseError = doc.querySelector('parsererror');
    if (parseError) {
      throw new Error('This file is not valid XML, so it could not be parsed as a feed.');
    }

    const root = doc.documentElement;
    const rootName = localName(root);

    if (rootName === 'rss') {
      const channel = childrenByName(root, 'channel')[0];
      if (!channel) throw new Error('RSS feed is missing its <channel> element.');
      return parseRss(channel);
    }
    if (rootName === 'feed') {
      return parseAtom(root);
    }
    if (rootName === 'rdf') {
      // RSS 1.0 / RDF: channel + sibling <item> elements.
      const channel = childrenByName(root, 'channel')[0] || root;
      return parseRdf(root, channel);
    }
    throw new Error('Unrecognised feed format. Expected RSS, Atom, or RDF.');
  }

  function parseRss(channel) {
    return {
      title: firstText(channel, 'title'),
      description: firstText(channel, 'description', 'subtitle'),
      link: firstText(channel, 'link'),
      items: childrenByName(channel, 'item').map((item) => ({
        title: firstText(item, 'title'),
        link: firstText(item, 'link') || firstText(item, 'guid'),
        date: firstText(item, 'pubdate', 'date', 'published'),
        author: firstText(item, 'creator', 'author'),
        html: firstText(item, 'encoded', 'description', 'summary'),
      })),
    };
  }

  function parseRdf(root, channel) {
    return {
      title: firstText(channel, 'title'),
      description: firstText(channel, 'description'),
      link: firstText(channel, 'link'),
      items: childrenByName(root, 'item').map((item) => ({
        title: firstText(item, 'title'),
        link: firstText(item, 'link'),
        date: firstText(item, 'date', 'pubdate'),
        author: firstText(item, 'creator'),
        html: firstText(item, 'encoded', 'description'),
      })),
    };
  }

  function parseAtom(feed) {
    return {
      title: firstText(feed, 'title'),
      description: firstText(feed, 'subtitle'),
      link: atomLink(feed),
      items: childrenByName(feed, 'entry').map((entry) => {
        const authorEl = childrenByName(entry, 'author')[0];
        return {
          title: firstText(entry, 'title'),
          link: atomLink(entry),
          date: firstText(entry, 'published', 'updated'),
          author: authorEl ? firstText(authorEl, 'name') : '',
          html: firstText(entry, 'content', 'summary'),
        };
      }),
    };
  }

  // ---- Sanitising ----------------------------------------------------------

  // Feed bodies are arbitrary HTML. Strip anything executable before injecting
  // it into the page: script/style elements, event-handler attributes, and
  // javascript: URLs.
  const URL_ATTRS = ['href', 'src', 'xlink:href', 'poster', 'background', 'action'];

  function sanitize(html) {
    const tpl = document.createElement('template');
    tpl.innerHTML = html;

    tpl.content.querySelectorAll('script, style, link, meta, base, object, embed').forEach((el) => el.remove());

    tpl.content.querySelectorAll('*').forEach((el) => {
      for (const attr of Array.from(el.attributes)) {
        const name = attr.name.toLowerCase();
        if (name.startsWith('on')) {
          el.removeAttribute(attr.name);
          continue;
        }
        if (URL_ATTRS.includes(name)) {
          const value = attr.value.trim();
          if (/^\s*javascript:/i.test(value)) el.removeAttribute(attr.name);
        }
      }
      // Open links in a new tab and neutralise referrer/opener leaks.
      if (localName(el) === 'a' && el.getAttribute('href')) {
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener noreferrer');
      }
    });

    return tpl.content;
  }

  // ---- Rendering -----------------------------------------------------------

  function formatDate(raw) {
    if (!raw) return '';
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return raw;
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  const CHEVRON = '<svg class="summary-chevron" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"></polyline></svg>';

  function renderFeed(feed) {
    // Header
    feedHeader.replaceChildren();
    if (feed.title) {
      const h1 = document.createElement('h1');
      if (feed.link) {
        const a = document.createElement('a');
        a.href = feed.link;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = feed.title;
        h1.appendChild(a);
      } else {
        h1.textContent = feed.title;
      }
      feedHeader.appendChild(h1);
    }
    if (feed.description) {
      const p = document.createElement('p');
      p.className = 'feed-desc';
      p.textContent = feed.description;
      feedHeader.appendChild(p);
    }

    // Items
    itemsEl.replaceChildren();
    for (const item of feed.items) {
      itemsEl.appendChild(renderItem(item));
    }

    const n = feed.items.length;
    feedCount.textContent = `${n} ${n === 1 ? 'item' : 'items'}`;
  }

  function renderItem(item) {
    const details = document.createElement('details');
    details.className = 'item';

    const summary = document.createElement('summary');
    summary.innerHTML = CHEVRON;

    const main = document.createElement('div');
    main.className = 'summary-main';

    const title = document.createElement('div');
    title.className = 'summary-title';
    title.textContent = item.title || '(untitled)';
    main.appendChild(title);

    const subParts = [];
    const date = formatDate(item.date);
    if (date) subParts.push(date);
    if (item.author) subParts.push(item.author);
    if (subParts.length) {
      const sub = document.createElement('div');
      sub.className = 'summary-sub';
      for (const part of subParts) {
        const span = document.createElement('span');
        span.textContent = part;
        sub.appendChild(span);
      }
      main.appendChild(sub);
    }
    summary.appendChild(main);
    details.appendChild(summary);

    const body = document.createElement('div');
    body.className = 'item-body';

    // Render the article body lazily on first open to keep the initial paint fast.
    let rendered = false;
    details.addEventListener('toggle', () => {
      if (details.open && !rendered) {
        rendered = true;
        body.appendChild(buildBody(item));
      }
    });
    details.appendChild(body);

    return details;
  }

  function buildBody(item) {
    const inner = document.createElement('div');
    inner.className = 'item-body-inner';

    const content = document.createElement('div');
    content.className = 'content';
    if (item.html && item.html.trim()) {
      content.appendChild(sanitize(item.html));
    } else {
      content.innerHTML = '<p class="content-empty">No content in this item.</p>';
    }
    inner.appendChild(content);

    if (item.link) {
      const actions = document.createElement('div');
      actions.className = 'item-actions';
      const a = document.createElement('a');
      a.href = item.link;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = 'Open original ↗';
      actions.appendChild(a);
      inner.appendChild(actions);
    }

    return inner;
  }

  // ---- App state -----------------------------------------------------------

  function showFeed(text, { persist = true } = {}) {
    let feed;
    try {
      feed = parseFeed(text);
    } catch (err) {
      showError(err.message || 'Could not parse this feed.');
      return;
    }
    if (!feed.items.length) {
      showError('That feed parsed, but it contains no items.');
      return;
    }

    renderFeed(feed);
    empty.classList.remove('loading');
    empty.hidden = true;
    emptyError.hidden = true;
    toolbar.hidden = false;
    container.hidden = false;

    if (persist) {
      try { localStorage.setItem(STORAGE_KEY, text); } catch (_) { /* ignore */ }
    }
  }

  function showError(message) {
    empty.classList.remove('loading');
    emptyError.textContent = message;
    emptyError.hidden = false;
  }

  function clearFeed() {
    itemsEl.replaceChildren();
    feedHeader.replaceChildren();
    empty.hidden = false;
    emptyError.hidden = true;
    toolbar.hidden = true;
    container.hidden = true;
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) { /* ignore */ }
  }

  function setAllOpen(open) {
    itemsEl.querySelectorAll('.item').forEach((d) => { d.open = open; });
  }

  btnExpand.addEventListener('click', () => setAllOpen(true));
  btnCollapse.addEventListener('click', () => setAllOpen(false));
  btnClear.addEventListener('click', clearFeed);

  // ---- Load a feed from a URL (via the CORS proxy) -------------------------

  async function loadFromUrl(rawUrl) {
    // Be forgiving about a missing scheme — people paste "example.com/feed".
    let target = rawUrl.trim();
    if (!target) return;
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(target)) target = 'https://' + target;

    empty.classList.add('loading');
    emptyError.hidden = true;
    urlSubmit.disabled = true;

    try {
      let res;
      try {
        res = await fetch(`${CORS_PROXY}?url=${encodeURIComponent(target)}`);
      } catch (_) {
        showError('Could not reach the feed. Check the address and your connection, then try again.');
        return;
      }

      if (!res.ok) {
        // The proxy returns a JSON { error } for its own failures; upstream
        // errors come through with the upstream status code.
        let message = `The feed could not be fetched (HTTP ${res.status}).`;
        try {
          const data = await res.clone().json();
          if (data && data.error) message = data.error;
        } catch (_) { /* not JSON — keep the generic message */ }
        showError(message);
        return;
      }

      const text = await res.text();
      showFeed(text);
    } finally {
      urlSubmit.disabled = false;
    }
  }

  urlForm.addEventListener('submit', (e) => {
    e.preventDefault();
    loadFromUrl(urlInput.value);
  });

  // ---- Wire up the early-capture handoff -----------------------------------

  window.__rssEarly.register((payload) => showFeed(payload.text));

  if (!window.__rssEarly.consumed) {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) showFeed(saved, { persist: false });
    } catch (_) { /* ignore */ }
  }
})();
