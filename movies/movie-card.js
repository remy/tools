import { escapeHtml, formatDayLabel, formatTime24, normalizeRatingAsset } from './utils.js';

export class MovieCard extends HTMLElement {
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
      console.error(error)
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

    // Update just the details section
    let detailsEl = this.querySelector('.card-details');

    if (this.expanded) {
      const detailsHtml = this.renderCardDetails();
      if (!detailsEl) {
        detailsEl = document.createElement('div');
        this.querySelector('.card-top').after(detailsEl);
      }
      detailsEl.innerHTML = detailsHtml;

      // Update toggle indicator
      const toggleIndicator = this.querySelector('.toggle-indicator');
      if (toggleIndicator) toggleIndicator.textContent = 'Hide details';

      // Update aria-expanded
      const cardTop = this.querySelector('.card-top');
      if (cardTop) cardTop.setAttribute('aria-expanded', 'true');

      await this.loadTmdbDetails();
    } else {
      if (detailsEl) {
        detailsEl.remove();
      }

      // Update toggle indicator
      const toggleIndicator = this.querySelector('.toggle-indicator');
      if (toggleIndicator) toggleIndicator.textContent = 'Show details';

      // Update aria-expanded
      const cardTop = this.querySelector('.card-top');
      if (cardTop) cardTop.setAttribute('aria-expanded', 'false');
    }
  }

  renderCardDetails() {
    if (!this.movie) return '';

    const timesByDay = this.groupedTimes();
    const showCount = this.getFilteredTimes().length;
    const hasTimes = showCount > 0;

    return `
      <div class="card-details">
        <div class="time-grid">
          ${hasTimes
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
                  return `<span class="time-pill">${escapeHtml(timeText)}${show.screen
                    ? ` <span class="tmdb-muted">${escapeHtml(show.screen)}</span>`
                    : ''
                    }</span>`;
                }

                return `<a class="time-pill time-pill-link" href="${ticketUrl}" target="_blank" rel="noreferrer" title="Book ${escapeHtml(timeText)}">${escapeHtml(timeText)}${show.screen
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
    `;
  }

  render() {
    if (!this.movie) return;

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
          ${cardImageUrl
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
            <p class="next-time">${hasTimes
        ? `Next: ${escapeHtml(formatDayLabel(nextShow.dayKey))} at ${escapeHtml(nextShowLabel)}`
        : 'No shows for selected day.'
      }</p>
          </div>
          <span class="toggle-indicator">${this.expanded ? 'Hide details' : 'Show details'}</span>
        </div>
        ${this.expanded ? this.renderCardDetails() : ''}
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
