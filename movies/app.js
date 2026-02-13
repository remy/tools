const DAY_MS = 24 * 60 * 60 * 1000;
const BRIGHTON_CINEMAS = [
  {
    id: '008',
    name: "Duke of York's",
    address: 'Preston Circus, Brighton, BN1 4NA',
  },
  {
    id: '019',
    name: "Duke's at Komedia",
    address: '44-47 Gardner Street, Brighton, BN1 1UN',
  },
];
const CINEWORLD_BRIGHTON = {
  id: 'CW-014',
  name: 'Cineworld Brighton',
  address: 'Brighton Marina Village, Brighton, BN2 5UF',
};

function stripTitle(title) {
  return (title || '').replace(/^\"+|\"+$/g, '').trim();
}

function stripBracketedContent(title) {
  return stripTitle(title)
    .replace(/\s*[\(\[\{][^\)\]\}]*[\)\]\}]\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function toDayKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDayLabel(dateKey) {
  const date = new Date(`${dateKey}T00:00:00`);
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  }).format(date);
}

function formatTime24(date) {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function normalizeMovieId(value) {
  return String(value || '')
    .trim()
    .toUpperCase();
}

function parseTimeQuery(query) {
  const match12 = query.match(/^(\d{1,2})\s*(am|pm)$/i);
  if (match12) {
    let hour = parseInt(match12[1], 10);
    const period = match12[2].toLowerCase();
    if (period === 'am' && hour === 12) hour = 0;
    else if (period === 'pm' && hour !== 12) hour += 12;
    if (hour >= 0 && hour <= 23) return hour;
  }

  const match24 = query.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    const hour = parseInt(match24[1], 10);
    if (hour >= 0 && hour <= 23) return hour;
  }

  return null;
}

function parseShowDateValue(value) {
  if (!value) return null;

  let raw = '';
  if (typeof value === 'string') {
    raw = value.trim();
  } else if (typeof value === 'object') {
    raw = String(
      value.Showtime ||
        value.showtime ||
        value.startsAt ||
        value.startTime ||
        value.dateTime ||
        value.datetime ||
        value.date ||
        ''
    ).trim();
  }

  if (!raw) return null;

  const hasExplicitTime = /T\d{2}:\d{2}/.test(raw) || /\d{1,2}:\d{2}/.test(raw);
  const parseableValue = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? `${raw}T12:00:00`
    : raw;
  const date = new Date(parseableValue);

  if (Number.isNaN(date.getTime())) return null;

  return { date, hasExplicitTime };
}

function normalizeTitleForMerge(title) {
  return stripTitle(title)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function extractCineworldRating(attributeIds) {
  const knownRatings = new Set(['u', 'pg', '12a', '15', '18']);
  for (const attributeId of attributeIds || []) {
    const normalized = String(attributeId || '')
      .trim()
      .toLowerCase();
    if (knownRatings.has(normalized)) return normalized;
  }
  return '';
}

function normalizeRatingAsset(rating) {
  const normalized = String(rating || '')
    .trim()
    .toLowerCase();
  return new Set(['u', 'pg', '12a', '15', '18']).has(normalized)
    ? normalized
    : '';
}

function dedupeShowtimes(showtimes) {
  const uniqueShowtimes = new Map();
  for (const show of showtimes || []) {
    const key = [
      show.dayKey || '',
      String(show.startsAt || ''),
      show.cinemaId || '',
      show.sessionId || '',
      show.bookingUrl || '',
      show.screen || '',
    ].join('|');

    if (!uniqueShowtimes.has(key)) {
      uniqueShowtimes.set(key, show);
    }
  }
  return [...uniqueShowtimes.values()].sort((a, b) => a.startsAt - b.startsAt);
}

function mergeMoviesAcrossCinemas(movies) {
  const groupsByTitle = new Map();

  for (const movie of movies || []) {
    const titleKey =
      normalizeTitleForMerge(movie.title) || normalizeMovieId(movie.id);
    const candidates = groupsByTitle.get(titleKey) || [];

    const matchedMovie = candidates.find(
      (existingMovie) =>
        !existingMovie.releaseYear ||
        !movie.releaseYear ||
        existingMovie.releaseYear === movie.releaseYear
    );

    if (!matchedMovie) {
      candidates.push({
        ...movie,
        showtimes: [...(movie.showtimes || [])],
      });
      groupsByTitle.set(titleKey, candidates);
      continue;
    }

    matchedMovie.showtimes.push(...(movie.showtimes || []));
    matchedMovie.imageUrl ||= movie.imageUrl;
    matchedMovie.landscapeImageUrl ||= movie.landscapeImageUrl;
    matchedMovie.trailerUrl ||= movie.trailerUrl;
    matchedMovie.rating ||= movie.rating;
    matchedMovie.runtime ||= movie.runtime;
    matchedMovie.releaseYear ||= movie.releaseYear;

    if (!matchedMovie.title && movie.title) {
      matchedMovie.title = movie.title;
    }
  }

  const mergedMovies = [];
  for (const group of groupsByTitle.values()) {
    mergedMovies.push(...group);
  }
  return mergedMovies;
}

function buildDateWindow(days = 14) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + DAY_MS * days);
  return { start, end };
}

function getBrightonCinemas() {
  return new Map(BRIGHTON_CINEMAS.map((cinema) => [cinema.id, cinema]));
}

class TMDBIndexedDBCache {
  constructor() {
    this.dbName = 'brighton-cinema-planner';
    this.storeName = 'tmdb-movie-cache';
    this.dbPromise = null;
    this.supported = typeof indexedDB !== 'undefined';
  }

  async openDb() {
    if (!this.supported) return null;
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'id' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }).catch(() => null);

    return this.dbPromise;
  }

  async get(id) {
    const db = await this.openDb();
    if (!db) return null;

    return new Promise((resolve) => {
      const tx = db.transaction(this.storeName, 'readonly');
      const request = tx.objectStore(this.storeName).get(id);
      request.onsuccess = () => resolve(request.result?.value || null);
      request.onerror = () => resolve(null);
    });
  }

  async set(id, value) {
    const db = await this.openDb();
    if (!db) return;

    await new Promise((resolve) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      tx.objectStore(this.storeName).put({
        id,
        value,
        updatedAt: Date.now(),
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  }
}

class TMDBService {
  constructor() {
    this.apiKey = '';
    this.detailsCache = new Map();
    this.lookupCache = new Map();
    this.idbCache = new TMDBIndexedDBCache();
  }

  setApiKey(apiKey) {
    const trimmed = (apiKey || '').trim();
    if (this.apiKey === trimmed) return;
    this.apiKey = trimmed;
    this.detailsCache.clear();
  }

  get hasKey() {
    return Boolean(this.apiKey);
  }

  getLookupKey(movie) {
    const titleKey = normalizeTitleForMerge(movie?.title || '');
    const yearKey = movie?.releaseYear ? String(movie.releaseYear) : '';
    return `${titleKey}|${yearKey}`;
  }

  async getCachedLookup(movie) {
    const lookupKey = this.getLookupKey(movie);
    if (!lookupKey) return null;

    if (this.lookupCache.has(lookupKey)) {
      return this.lookupCache.get(lookupKey);
    }

    const stored = await this.idbCache.get(lookupKey);
    if (stored) {
      this.lookupCache.set(lookupKey, stored);
    }
    return stored || null;
  }

  async setCachedLookup(movie, value) {
    const lookupKey = this.getLookupKey(movie);
    if (!lookupKey || !value) return;

    this.lookupCache.set(lookupKey, value);
    await this.idbCache.set(lookupKey, value);
  }

  async searchMovie(query, releaseYear) {
    const normalizedQuery = stripTitle(query);
    if (!normalizedQuery) return null;

    const searchParams = new URLSearchParams({
      api_key: this.apiKey,
      query: normalizedQuery,
    });

    if (releaseYear) {
      searchParams.set('year', String(releaseYear));
    }

    const searchResp = await fetch(
      `https://api.themoviedb.org/3/search/movie?${searchParams.toString()}`
    );
    if (!searchResp.ok) {
      throw new Error(`tmdb_search_${searchResp.status}`);
    }

    const searchJson = await searchResp.json();
    return searchJson.results?.[0] || null;
  }

  async findMovieResult(movie) {
    const primaryResult = await this.searchMovie(
      movie.title,
      movie.releaseYear
    );
    if (primaryResult) return primaryResult;

    const fallbackTitle = stripBracketedContent(movie.title);
    if (
      fallbackTitle &&
      fallbackTitle.toLowerCase() !== stripTitle(movie.title).toLowerCase()
    ) {
      const bracketResult = await this.searchMovie(
        fallbackTitle,
        movie.releaseYear
      );
      if (bracketResult) return bracketResult;
    }

    const stripped = stripTitle(movie.title);
    if (stripped.includes(':')) {
      const afterColon = stripBracketedContent(
        stripped.split(':').slice(1).join(':')
      );
      if (afterColon) {
        return this.searchMovie(afterColon, movie.releaseYear);
      }
    }

    return null;
  }

  async getMovieArtwork(movie) {
    if (!this.apiKey) {
      throw new Error('missing_key');
    }

    const cachedLookup = await this.getCachedLookup(movie);
    if (cachedLookup?.backdropPath || cachedLookup?.posterPath) {
      return cachedLookup;
    }

    const result = await this.findMovieResult(movie);
    if (!result) {
      throw new Error('tmdb_not_found');
    }

    const detailsResp = await fetch(
      `https://api.themoviedb.org/3/movie/${result.id}?api_key=${this.apiKey}`
    );
    if (!detailsResp.ok) {
      throw new Error('tmdb_details_failed');
    }

    const details = await detailsResp.json();
    const lookupPayload = {
      tmdbId: result.id,
      posterPath: details.poster_path
        ? `https://image.tmdb.org/t/p/w500${details.poster_path}`
        : '',
      backdropPath: details.backdrop_path
        ? `https://image.tmdb.org/t/p/w780${details.backdrop_path}`
        : '',
      details: cachedLookup?.details || null,
    };

    await this.setCachedLookup(movie, lookupPayload);
    return lookupPayload;
  }

  async getMovieDetails(movie) {
    if (!this.apiKey) {
      throw new Error('missing_key');
    }

    const cacheKey = `${movie.id}|${movie.title}|${movie.releaseYear || ''}`;
    if (this.detailsCache.has(cacheKey)) {
      return this.detailsCache.get(cacheKey);
    }

    const cachedLookup = await this.getCachedLookup(movie);
    if (cachedLookup?.details) {
      const details = { ...cachedLookup.details, tmdbId: cachedLookup.tmdbId };
      this.detailsCache.set(cacheKey, details);
      return details;
    }

    let tmdbId = cachedLookup?.tmdbId || null;
    if (!tmdbId) {
      const result = await this.findMovieResult(movie);
      if (!result) {
        throw new Error('tmdb_not_found');
      }
      tmdbId = result.id;
    }

    if (!tmdbId) {
      throw new Error('tmdb_not_found');
    }

    const [detailsResp, creditsResp, videosResp] = await Promise.all([
      fetch(
        `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${this.apiKey}`
      ),
      fetch(
        `https://api.themoviedb.org/3/movie/${tmdbId}/credits?api_key=${this.apiKey}`
      ),
      fetch(
        `https://api.themoviedb.org/3/movie/${tmdbId}/videos?api_key=${this.apiKey}`
      ),
    ]);

    if (!detailsResp.ok || !creditsResp.ok || !videosResp.ok) {
      throw new Error('tmdb_details_failed');
    }

    const [details, credits, videos] = await Promise.all([
      detailsResp.json(),
      creditsResp.json(),
      videosResp.json(),
    ]);

    const director = (credits.crew || [])
      .filter((person) => person.job === 'Director')
      .map((person) => person.name);
    const cast = (credits.cast || []).slice(0, 6).map((person) => person.name);
    const trailer = (videos.results || []).find(
      (video) => video.site === 'YouTube' && video.type === 'Trailer'
    );

    const payload = {
      tmdbId,
      overview: details.overview || '',
      genres: (details.genres || []).map((genre) => genre.name),
      runtime: details.runtime,
      cast,
      director,
      trailerUrl: trailer
        ? `https://www.youtube.com/watch?v=${trailer.key}`
        : '',
      voteAverage: details.vote_average,
      posterPath: details.poster_path
        ? `https://image.tmdb.org/t/p/w500${details.poster_path}`
        : '',
      backdropPath: details.backdrop_path
        ? `https://image.tmdb.org/t/p/w780${details.backdrop_path}`
        : '',
    };

    this.detailsCache.set(cacheKey, payload);
    await this.setCachedLookup(movie, {
      tmdbId,
      posterPath: payload.posterPath,
      backdropPath: payload.backdropPath,
      details: payload,
    });
    return payload;
  }
}

class DayPicker extends HTMLElement {
  connectedCallback() {
    this.render();
  }

  setData(days, selectedDay) {
    this.days = days;
    this.selectedDay = selectedDay || '';
    this.render();
  }

  render() {
    const days = this.days || [];
    const selected = this.selectedDay || '';

    this.innerHTML = `
      <label class="field" for="day-select">
        <span class="field-label">Pick day</span>
        <select id="day-select" class="select">
          <option value="next-7-days" ${selected === 'next-7-days' || selected === '' ? 'selected' : ''}>Next 7 days</option>
          <option value="next-14-days" ${selected === 'next-14-days' ? 'selected' : ''}>Next 2 weeks</option>
          <option disabled>────────────────────</option>
          ${days
            .map((day) => {
              const optionLabel = formatDayLabel(day);
              const isSelected = selected === day ? 'selected' : '';
              return `<option value="${escapeHtml(day)}" ${isSelected}>${escapeHtml(optionLabel)}</option>`;
            })
            .join('')}
        </select>
      </label>
    `;

    const selectEl = this.querySelector('#day-select');
    selectEl?.addEventListener('change', (event) => {
      this.dispatchEvent(
        new CustomEvent('day-change', {
          bubbles: true,
          detail: { value: event.target.value || '' },
        })
      );
    });
  }
}

class MovieCard extends HTMLElement {
  connectedCallback() {
    this.expanded = false;
    this.tmdbState = { loading: false, error: '', data: null };
    this.render();
  }

  setData(movie, selectedDay, tmdbService) {
    this.movie = movie;
    this.selectedDay = selectedDay || '';
    this.tmdbService = tmdbService;
    this.render();
  }

  getFilteredTimes() {
    if (!this.movie) return [];
    if (!this.selectedDay) return this.movie.showtimes;
    return this.movie.showtimes.filter(
      (time) => time.dayKey === this.selectedDay
    );
  }

  groupedTimes() {
    const groups = new Map();

    for (const show of this.getFilteredTimes()) {
      if (!groups.has(show.dayKey)) {
        groups.set(show.dayKey, []);
      }
      groups.get(show.dayKey).push(show);
    }

    return [...groups.entries()];
  }

  async loadTmdbDetails() {
    if (!this.movie || this.tmdbState.loading || this.tmdbState.data) return;
    if (!this.tmdbService?.hasKey) {
      this.tmdbState.error =
        'Add a TMDB API key above to load full movie details.';
      this.render();
      return;
    }

    this.tmdbState.loading = true;
    this.tmdbState.error = '';
    this.render();

    try {
      const details = await this.tmdbService.getMovieDetails(this.movie);
      this.tmdbState.data = details;
      this.tmdbState.loading = false;
    } catch (error) {
      this.tmdbState.loading = false;
      this.tmdbState.error =
        error.message === 'missing_key'
          ? 'Add a TMDB API key above to load full movie details.'
          : 'Could not load TMDB details for this title.';
    }

    this.render();
  }

  renderTmdbPanel() {
    if (this.tmdbState.loading) {
      return `<div class="tmdb-panel"><p class="tmdb-muted">Loading TMDB details...</p></div>`;
    }

    if (this.tmdbState.error) {
      return `<div class="tmdb-panel"><p class="tmdb-muted">${escapeHtml(this.tmdbState.error)}</p></div>`;
    }

    const details = this.tmdbState.data;
    if (!details) {
      return `<div class="tmdb-panel"><p class="tmdb-muted">Expand this card to fetch description, cast, director and trailer.</p></div>`;
    }

    const trailer = details.trailerUrl || this.movie.trailerUrl;

    return `
      <div class="tmdb-panel">
        <h4 class="tmdb-title">Movie details</h4>
        <p class="tmdb-overview">${escapeHtml(details.overview || 'No synopsis available.')}</p>
        <div class="tmdb-list">
          <p><strong>Director:</strong> ${escapeHtml(details.director.join(', ') || 'N/A')}</p>
          <p><strong>Actors:</strong> ${escapeHtml(details.cast.join(', ') || 'N/A')}</p>
          <p><strong>Genres:</strong> ${escapeHtml(details.genres.join(', ') || 'N/A')}</p>
          <p><strong>Runtime:</strong> ${details.runtime ? `${escapeHtml(details.runtime)} min` : 'N/A'}</p>
          <p><strong>TMDB rating:</strong> ${details.voteAverage ? escapeHtml(details.voteAverage.toFixed(1)) : 'N/A'}</p>
          ${trailer ? `<p><a class="tmdb-link" href="${escapeHtml(trailer)}" target="_blank" rel="noreferrer">Watch trailer</a></p>` : ''}
          ${details.tmdbId ? `<p><a class="tmdb-link" href="https://www.themoviedb.org/movie/${encodeURIComponent(details.tmdbId)}" target="_blank" rel="noreferrer">View on TMDB</a></p>` : ''}
        </div>
      </div>
    `;
  }

  async toggleExpanded() {
    this.expanded = !this.expanded;
    this.render();
    if (this.expanded) {
      await this.loadTmdbDetails();
    }
  }

  render() {
    if (!this.movie) return;

    const timesByDay = this.groupedTimes();
    const showCount = this.getFilteredTimes().length;
    const hasTimes = showCount > 0;
    const nextShow = this.getFilteredTimes()[0];
    const nextShowLabel =
      nextShow?.hasExactTime === false ? 'Times TBC' : nextShow?.timeLabel;
    const certAsset = normalizeRatingAsset(this.movie.rating);
    const cardImageUrl = this.movie.landscapeImageUrl || this.movie.imageUrl;

    this.innerHTML = `
      <article class="movie-card">
        <div class="card-top" role="button" tabindex="0" aria-expanded="${this.expanded ? 'true' : 'false'}">
          ${
            cardImageUrl
              ? `<img class="poster" src="${escapeHtml(cardImageUrl)}" alt="${escapeHtml(this.movie.title)}" loading="lazy" />`
              : `<div class="poster-placeholder">No poster</div>`
          }
          <div class="movie-main">
            <h3 class="movie-title">
              ${certAsset ? `<img class="cert-icon" src="certs/${encodeURIComponent(certAsset)}.svg" alt="Rated ${escapeHtml(this.movie.rating)}" />` : ''}
              ${escapeHtml(this.movie.title)}
            </h3>
            <div class="movie-meta">
              ${this.movie.runtime ? `<span>${escapeHtml(this.movie.runtime)} min</span>` : ''}
              ${this.movie.releaseYear ? `<span>${escapeHtml(this.movie.releaseYear)}</span>` : ''}
              <span>${escapeHtml(this.movie.cinemaLabel)}</span>
            </div>
            <p class="next-time">${
              hasTimes
                ? `Next: ${escapeHtml(formatDayLabel(nextShow.dayKey))} at ${escapeHtml(nextShowLabel)}`
                : 'No shows for selected day.'
            }</p>
          </div>
          <span class="toggle-indicator">${this.expanded ? 'Hide details' : 'Show details'}</span>
        </div>
        ${
          this.expanded
            ? `
            <div class="card-details">
              <div class="time-grid">
                ${
                  hasTimes
                    ? timesByDay
                        .map(([dayKey, shows]) => {
                          const pills = shows
                            .map((show) => {
                              const ticketUrl =
                                show.bookingUrl ||
                                (show.sessionId
                                  ? `https://web.picturehouses.com/order/showtimes/${encodeURIComponent(show.cinemaId)}-${encodeURIComponent(show.sessionId)}/seats`
                                  : '');
                              const timeText =
                                show.hasExactTime === false
                                  ? 'Times TBC'
                                  : show.timeLabel;

                              if (!ticketUrl) {
                                return `<span class="time-pill">${escapeHtml(timeText)}${
                                  show.screen
                                    ? ` <span class="tmdb-muted">${escapeHtml(show.screen)}</span>`
                                    : ''
                                }</span>`;
                              }

                              return `<a class="time-pill time-pill-link" href="${ticketUrl}" target="_blank" rel="noreferrer" title="Book ${escapeHtml(timeText)}">${escapeHtml(timeText)}${
                                show.screen
                                  ? ` <span class="tmdb-muted">${escapeHtml(show.screen)}</span>`
                                  : ''
                              }</a>`;
                            })
                            .join('');

                          return `
                            <section class="day-block">
                              <h4 class="day-title">${escapeHtml(formatDayLabel(dayKey))}</h4>
                              <div class="time-row">${pills}</div>
                            </section>
                          `;
                        })
                        .join('')
                    : `<section class="day-block"><p class="tmdb-muted">No showtimes for this day.</p></section>`
                }
              </div>
              ${this.renderTmdbPanel()}
            </div>
          `
            : ''
        }
      </article>
    `;

    const cardTop = this.querySelector('.card-top');
    cardTop?.addEventListener('click', async () => {
      await this.toggleExpanded();
    });
    cardTop?.addEventListener('keydown', async (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        await this.toggleExpanded();
      }
    });
  }
}

class MovieScheduleApp extends HTMLElement {
  connectedCallback() {
    this.selectedDay = '';
    this.searchQuery = '';
    this.movies = [];
    this.days = [];
    this.cinemas = [];
    this.prefetchingArtwork = false;
    this.loading = true;
    this.error = '';
    this.tmdbService = new TMDBService();

    const storedKey = localStorage.getItem('tmdb_api_key') || '';
    this.tmdbService.setApiKey(storedKey);

    this.renderShell();
    this.loadData();
  }

  renderShell() {
    this.innerHTML = `
      <main class="app-shell">
        <header class="hero">
          <h1 class="title">Brighton Cinema Planner</h1>
          <p class="subtitle" id="cinema-subtitle">Loading cinema data...</p>
        </header>

        <section class="controls">
          <day-picker id="day-picker"></day-picker>

          <label class="field" for="search-input">
            <span class="field-label">Search</span>
            <input id="search-input" class="input" type="text" placeholder="Film title or time, e.g. &quot;amelie&quot; or &quot;2pm&quot;" />
          </label>

          <details class="tmdb-config" id="tmdb-config">
            <summary class="tmdb-summary">TMDB settings (optional)</summary>
            <label class="field" for="tmdb-key">
              <input id="tmdb-key" class="input" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Optional: for descriptions, cast, director" />
            </label>
          </details>

        </section>

        <p class="status" id="status-line"></p>
        <section class="movie-list" id="movie-list"></section>
        <footer class="app-footer">
          <p>This website uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.</p>
        </footer>
      </main>
    `;

    const dayPicker = this.querySelector('#day-picker');
    dayPicker?.addEventListener('day-change', (event) => {
      this.selectedDay = event.detail.value;
      this.renderMovies();
    });

    const searchInput = this.querySelector('#search-input');
    searchInput?.addEventListener('input', (event) => {
      this.searchQuery = event.target.value;
      this.renderMovies();
    });

    const tmdbConfig = this.querySelector('#tmdb-config');
    const tmdbInput = this.querySelector('#tmdb-key');
    tmdbInput.value = this.tmdbService.apiKey;

    const updateTmdbKey = (rawValue, { refresh = false } = {}) => {
      const key = rawValue.trim();
      const hadKey = this.tmdbService.hasKey;
      localStorage.setItem('tmdb_api_key', key);
      this.tmdbService.setApiKey(key);
      if (tmdbConfig) {
        tmdbConfig.open = Boolean(key);
      }
      if (!hadKey && key) {
        this.prefetchCineworldArtwork();
      }
      if (refresh) {
        this.refreshCards();
      }
    };

    tmdbInput.addEventListener('input', (event) => {
      updateTmdbKey(event.target.value, { refresh: false });
    });

    tmdbInput.addEventListener('change', (event) => {
      updateTmdbKey(event.target.value, { refresh: true });
    });

    customElements.whenDefined('day-picker').then(() => {
      this.querySelector('#day-picker')?.setData(this.days, this.selectedDay);
    });

    this.renderMovies();
  }

  async loadData() {
    this.loading = true;
    this.error = '';
    this.renderMovies();

    try {
      const [scheduledResp, doyResp] = await Promise.all([
        fetch('./scheduled-movies.json'),
        fetch('./doy-movies.json'),
      ]);

      if (!scheduledResp.ok || !doyResp.ok) {
        throw new Error(
          'Could not load JSON files. Run via a local web server.'
        );
      }

      const [scheduledData, doyData] = await Promise.all([
        scheduledResp.json(),
        doyResp.json(),
      ]);

      const cinemaMap = getBrightonCinemas();
      const cinemaIds = new Set([...cinemaMap.keys()]);
      const cinemaNameById = new Map([
        ...[...cinemaMap.values()].map((cinema) => [cinema.id, cinema.name]),
        [CINEWORLD_BRIGHTON.id, CINEWORLD_BRIGHTON.name],
      ]);
      const cinemaLabel = [...cinemaMap.values(), CINEWORLD_BRIGHTON]
        .map((cinema) => cinema.name)
        .join(', ');

      const metadataMap = new Map(
        (doyData.movies || []).map((movie) => [movie.ScheduledFilmId, movie])
      );
      const { start, end } = buildDateWindow();

      const movieMap = new Map();

      for (const sourceMovie of scheduledData.movies || []) {
        const showtimes = (sourceMovie.show_times || []).filter((show) =>
          cinemaIds.has(show.CinemaId)
        );

        const weekShows = showtimes
          .map((show) => {
            const date = new Date(show.Showtime);
            if (Number.isNaN(date.getTime())) return null;
            if (date < start || date >= end) return null;

            const dayKey = toDayKey(date);
            const timeLabel = formatTime24(date);

            return {
              dayKey,
              timeLabel,
              startsAt: date.getTime(),
              cinemaId: show.CinemaId,
              sessionId: show.SessionId || '',
              cinemaName:
                cinemaNameById.get(show.CinemaId) || `Cinema ${show.CinemaId}`,
              screen: show.ScreenName || '',
            };
          })
          .filter(Boolean)
          .sort((a, b) => a.startsAt - b.startsAt);

        if (!weekShows.length) continue;

        const movieId = sourceMovie.ScheduledFilmId;
        const detailMovie = metadataMap.get(movieId) || sourceMovie;

        if (!movieMap.has(movieId)) {
          const releaseYear = detailMovie.OpeningDateOriginal
            ? new Date(detailMovie.OpeningDateOriginal).getFullYear()
            : undefined;

          movieMap.set(movieId, {
            id: movieId,
            title: stripTitle(sourceMovie.Title || detailMovie.Title),
            imageUrl: sourceMovie.image_url || detailMovie.image_url || '',
            landscapeImageUrl: '',
            trailerUrl: sourceMovie.TrailerUrl || detailMovie.TrailerUrl || '',
            rating: detailMovie.Rating || '',
            runtime: detailMovie.RunTime ? Number(detailMovie.RunTime) : null,
            releaseYear: Number.isFinite(releaseYear) ? releaseYear : null,
            cinemaLabel,
            showtimes: [],
          });
        }

        movieMap.get(movieId).showtimes.push(...weekShows);
      }

      let cineworldData = null;
      try {
        const cineworldResp = await fetch('./cineworld-movies.json');
        if (cineworldResp.ok) {
          cineworldData = await cineworldResp.json();
        }
      } catch {}

      if (cineworldData?.body) {
        const cineworldFilmMap = new Map(
          (cineworldData.body.films || []).map((film) => [
            normalizeMovieId(film.id),
            film,
          ])
        );

        for (const [rawFilmId, dateTimes] of Object.entries(
          cineworldData.body.eventsDatesByFilmId || {}
        )) {
          const filmId = normalizeMovieId(rawFilmId);
          const film = cineworldFilmMap.get(filmId);
          if (!film || !Array.isArray(dateTimes)) continue;

          const movieId = `CW-${filmId}`;

          if (!movieMap.has(movieId)) {
            const releaseYear = Number(film.releaseYear);

            movieMap.set(movieId, {
              id: movieId,
              title: stripTitle(film.name),
              imageUrl: film.posterLink || '',
              landscapeImageUrl: '',
              trailerUrl: film.videoLink || '',
              rating: extractCineworldRating(film.attributeIds),
              runtime: film.length ? Number(film.length) : null,
              releaseYear: Number.isFinite(releaseYear) ? releaseYear : null,
              cinemaLabel:
                cinemaNameById.get(CINEWORLD_BRIGHTON.id) ||
                CINEWORLD_BRIGHTON.name,
              showtimes: [],
            });
          }

          for (const dateTimeStr of dateTimes) {
            const parsed = parseShowDateValue(dateTimeStr);
            if (!parsed) continue;

            const { date, hasExplicitTime } = parsed;
            if (date < start || date >= end) continue;

            movieMap.get(movieId).showtimes.push({
              dayKey: toDayKey(date),
              timeLabel: hasExplicitTime ? formatTime24(date) : 'TBC',
              startsAt: date.getTime(),
              cinemaId: CINEWORLD_BRIGHTON.id,
              sessionId: '',
              bookingUrl: '',
              cinemaName:
                cinemaNameById.get(CINEWORLD_BRIGHTON.id) ||
                CINEWORLD_BRIGHTON.name,
              screen: '',
              hasExactTime: hasExplicitTime,
            });
          }
        }
      }

      this.movies = mergeMoviesAcrossCinemas([...movieMap.values()])
        .map((movie) => {
          movie.showtimes = dedupeShowtimes(movie.showtimes);
          const cinemaNames = [
            ...new Set(
              movie.showtimes.map((show) => show.cinemaName).filter(Boolean)
            ),
          ];
          movie.cinemaLabel = cinemaNames.join(', ');
          return movie;
        })
        .sort(
          (a, b) =>
            a.showtimes[0].startsAt - b.showtimes[0].startsAt ||
            a.title.localeCompare(b.title)
        );

      this.days = [
        ...new Set(
          this.movies.flatMap((movie) =>
            movie.showtimes.map((show) => show.dayKey)
          )
        ),
      ].sort();
      this.cinemas = [...cinemaMap.values(), CINEWORLD_BRIGHTON];
      if (this.selectedDay && !this.days.includes(this.selectedDay)) {
        this.selectedDay = '';
      }
      this.loading = false;

      this.querySelector('#cinema-subtitle').textContent =
        this.cinemas.length > 0
          ? `Upcoming showtimes for ${this.cinemas.map((cinema) => cinema.name).join(', ')} in Brighton.`
          : 'Upcoming Brighton showtimes.';

      this.querySelector('#day-picker')?.setData(this.days, this.selectedDay);
      this.renderMovies();
      this.prefetchCineworldArtwork();
    } catch (error) {
      this.loading = false;
      this.error = error.message || 'Failed to load movie data.';
      this.renderMovies();
    }
  }

  hasCineworldShowtimes(movie) {
    return (movie?.showtimes || []).some(
      (show) => show.cinemaId === CINEWORLD_BRIGHTON.id
    );
  }

  async prefetchCineworldArtwork() {
    if (
      !this.tmdbService.hasKey ||
      this.prefetchingArtwork ||
      !this.movies.length
    ) {
      return;
    }

    this.prefetchingArtwork = true;
    let changed = false;

    try {
      const cineworldMovies = this.movies.filter((movie) =>
        this.hasCineworldShowtimes(movie)
      );

      for (const movie of cineworldMovies) {
        if (movie.landscapeImageUrl) continue;

        try {
          const artwork = await this.tmdbService.getMovieArtwork(movie);
          if (artwork?.backdropPath) {
            movie.landscapeImageUrl = artwork.backdropPath;
            changed = true;
          }
        } catch {}
      }
    } finally {
      this.prefetchingArtwork = false;
    }

    if (changed) {
      this.renderMovies();
    }
  }

  getVisibleMovies() {
    let filteredMovies = this.movies;
    let getSortStartsAt = (movie) =>
      movie.showtimes[0]?.startsAt ?? Number.MAX_SAFE_INTEGER;

    if (this.selectedDay === 'next-7-days') {
      const { start, end } = buildDateWindow(7);
      const startMs = start.getTime();
      const endMs = end.getTime();

      filteredMovies = this.movies.filter((movie) =>
        movie.showtimes.some(
          (show) => show.startsAt >= startMs && show.startsAt < endMs
        )
      );
      getSortStartsAt = (movie) =>
        movie.showtimes.find(
          (show) => show.startsAt >= startMs && show.startsAt < endMs
        )?.startsAt ?? Number.MAX_SAFE_INTEGER;
    } else if (this.selectedDay && this.selectedDay !== 'next-14-days') {
      filteredMovies = this.movies.filter((movie) =>
        movie.showtimes.some((show) => show.dayKey === this.selectedDay)
      );
      getSortStartsAt = (movie) =>
        movie.showtimes.find((show) => show.dayKey === this.selectedDay)
          ?.startsAt ?? Number.MAX_SAFE_INTEGER;
    }

    const query = (this.searchQuery || '').trim();
    if (query) {
      const timeHour = parseTimeQuery(query);
      if (timeHour !== null) {
        filteredMovies = filteredMovies.filter((movie) =>
          movie.showtimes.some(
            (show) => new Date(show.startsAt).getHours() === timeHour
          )
        );
      } else {
        const lowerQuery = query.toLowerCase();
        filteredMovies = filteredMovies.filter((movie) =>
          movie.title.toLowerCase().includes(lowerQuery)
        );
      }
    }

    return [...filteredMovies].sort(
      (a, b) =>
        getSortStartsAt(a) - getSortStartsAt(b) ||
        a.title.localeCompare(b.title)
    );
  }

  refreshCards() {
    const cards = this.querySelectorAll('movie-card');
    for (const card of cards) {
      card.tmdbState = { loading: false, error: '', data: null };
      card.setData(card.movie, this.selectedDay, this.tmdbService);
    }
  }

  renderMovies() {
    const listEl = this.querySelector('#movie-list');
    const statusEl = this.querySelector('#status-line');
    if (!listEl || !statusEl) return;

    listEl.innerHTML = '';

    if (this.loading) {
      statusEl.textContent = 'Loading schedule...';
      listEl.innerHTML = `<div class="loading">Loading movie schedules...</div>`;
      return;
    }

    if (this.error) {
      statusEl.textContent = '';
      listEl.innerHTML = `<div class="error">${escapeHtml(this.error)}</div>`;
      return;
    }

    const visible = this.getVisibleMovies();
    const totalShows = visible.reduce((sum, movie) => {
      if (!this.selectedDay || this.selectedDay === 'next-14-days') {
        return sum + movie.showtimes.length;
      }
      if (this.selectedDay === 'next-7-days') {
        const { start, end } = buildDateWindow(7);
        return (
          sum +
          movie.showtimes.filter((show) => {
            const showDate = new Date(show.startsAt);
            return showDate >= start && showDate < end;
          }).length
        );
      }
      return (
        sum +
        movie.showtimes.filter((show) => show.dayKey === this.selectedDay)
          .length
      );
    }, 0);

    let timePeriod = 'in next 2 weeks';
    if (this.selectedDay === 'next-7-days') timePeriod = 'in next 7 days';
    else if (this.selectedDay && this.selectedDay !== 'next-14-days')
      timePeriod = `on ${formatDayLabel(this.selectedDay)}`;

    statusEl.textContent = `${visible.length} movie${visible.length === 1 ? '' : 's'} | ${totalShows} showtimes ${timePeriod}`;

    if (!visible.length) {
      listEl.innerHTML = `<div class="empty">No movies found for this day. Pick a different date.</div>`;
      return;
    }

    for (const movie of visible) {
      const card = document.createElement('movie-card');
      card.setData(movie, this.selectedDay, this.tmdbService);
      listEl.appendChild(card);
    }
  }
}

customElements.define('day-picker', DayPicker);
customElements.define('movie-card', MovieCard);
customElements.define('movie-schedule-app', MovieScheduleApp);
