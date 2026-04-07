import { TMDBIndexedDBCache } from './tmdb-cache.js';
import { stripTitle, stripBracketedContent, normalizeTitleForMerge } from './utils.js';

export class TMDBService {
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
    let titleToSearch = movie.title;

    // If title starts with £, immediately split on colon and use 2nd part
    const stripped = stripTitle(titleToSearch);
    if (stripped.startsWith('£') && stripped.includes(':')) {
      titleToSearch = stripped.split(':').slice(1).join(':').trim();
    }


    let year = movie.releaseYear;

    if (/\(\d{4}\)/.test(titleToSearch)) {
      const match = titleToSearch.match(/\((\d{4})\)/);
      if (match) {
        year = Number(match[1]);
        titleToSearch = titleToSearch.replace(/\(\d{4}\)/, '').trim();
      }
    }

    const primaryResult = await this.searchMovie(
      titleToSearch,
      year,
    );
    if (primaryResult) return primaryResult;

    const fallbackTitle = stripBracketedContent(titleToSearch);
    if (
      fallbackTitle &&
      fallbackTitle.toLowerCase() !== stripTitle(titleToSearch).toLowerCase()
    ) {
      const bracketResult = await this.searchMovie(
        fallbackTitle,
        // year
      );
      if (bracketResult) return bracketResult;
    }

    const strippedForColon = stripTitle(titleToSearch);
    if (strippedForColon.includes(':')) {
      const afterColon = stripBracketedContent(
        strippedForColon.split(':').slice(1).join(':')
      );
      if (afterColon) {
        return this.searchMovie(afterColon, year);
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

    const [detailsResp, creditsResp, videosResp] = await Promise.all([
      fetch(
        `https://api.themoviedb.org/3/movie/${result.id}?api_key=${this.apiKey}`
      ),
      fetch(
        `https://api.themoviedb.org/3/movie/${result.id}/credits?api_key=${this.apiKey}`
      ),
      fetch(
        `https://api.themoviedb.org/3/movie/${result.id}/videos?api_key=${this.apiKey}`
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

    const detailsPayload = {
      tmdbId: result.id,
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

    const lookupPayload = {
      tmdbId: result.id,
      posterPath: detailsPayload.posterPath,
      backdropPath: detailsPayload.backdropPath,
      details: detailsPayload,
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
