import { TMDBService } from './tmdb-service.js';
import { TMDB_API_KEY } from './constants.js';
import { loadAllMovieData, prefetchCineworldArtwork } from './data-loader.js';
import {
  escapeHtml,
  formatDayLabel,
  parseTimeQuery,
  buildDateWindow,
} from './utils.js';

export class MovieScheduleApp extends HTMLElement {
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
    this.tmdbService.setApiKey(TMDB_API_KEY);

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
            <summary class="tmdb-summary">TMDB settings</summary>
            <button id="reset-cache-btn" class="button" type="button">Reset cache</button>
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

    const resetCacheBtn = this.querySelector('#reset-cache-btn');
    resetCacheBtn?.addEventListener('click', async () => {
      if (confirm('Clear the TMDB cache? This will remove all cached movie data.')) {
        await this.tmdbService.idbCache.clear();
        this.tmdbService.detailsCache.clear();
        this.tmdbService.lookupCache.clear();
        this.refreshCards();
      }
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
      const { movies, days, cinemas } = await loadAllMovieData();

      this.movies = movies;
      this.days = days;
      this.cinemas = cinemas;

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
      this.doPrefetchArtwork();
    } catch (error) {
      this.loading = false;
      this.error = error.message || 'Failed to load movie data.';
      this.renderMovies();
    }
  }

  async doPrefetchArtwork() {
    if (this.prefetchingArtwork) return;
    this.prefetchingArtwork = true;

    try {
      await prefetchCineworldArtwork(
        this.movies,
        this.tmdbService,
        () => this.renderMovies()
      );
    } finally {
      this.prefetchingArtwork = false;
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
