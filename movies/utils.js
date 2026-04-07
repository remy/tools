import { DAY_MS, BRIGHTON_CINEMAS } from './constants.js';

export function stripTitle(title) {
  return (title || '').replace(/^\"+|\"+$/g, '').trim();
}

export function stripBracketedContent(title) {
  return stripTitle(title)
    .replace(/\s*[\(\[\{][^\)\]\}]*[\)\]\}]\s.*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function toDayKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatDayLabel(dateKey) {
  const date = new Date(`${dateKey}T00:00:00`);
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  }).format(date);
}

export function formatTime24(date) {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function normalizeMovieId(value) {
  return String(value || '')
    .trim()
    .toUpperCase();
}

export function normalizeTitleForMerge(title) {
  return stripTitle(title)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function normalizeRatingAsset(rating) {
  const normalized = String(rating || '')
    .trim()
    .toLowerCase();
  return new Set(['u', 'pg', '12a', '15', '18']).has(normalized)
    ? normalized
    : '';
}

export function parseTimeQuery(query) {
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

export function parseShowDateValue(value) {
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

export function extractCineworldRating(attributeIds) {
  const knownRatings = new Set(['u', 'pg', '12a', '15', '18']);
  for (const attributeId of attributeIds || []) {
    const normalized = String(attributeId || '')
      .trim()
      .toLowerCase();
    if (knownRatings.has(normalized)) return normalized;
  }
  return '';
}

export function dedupeShowtimes(showtimes) {
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

export function mergeMoviesAcrossCinemas(movies) {
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

export function buildDateWindow(days = 14) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + DAY_MS * days);
  return { start, end };
}

export function getBrightonCinemas() {
  return new Map(BRIGHTON_CINEMAS.map((cinema) => [cinema.id, cinema]));
}
