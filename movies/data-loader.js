import { CINEWORLD_BRIGHTON } from './constants.js';
import {
  stripTitle,
  normalizeMovieId,
  toDayKey,
  formatTime24,
  parseShowDateValue,
  extractCineworldRating,
  dedupeShowtimes,
  mergeMoviesAcrossCinemas,
  buildDateWindow,
  getBrightonCinemas,
} from './utils.js';

export async function fetchScheduledData() {
  const resp = await fetch('./scheduled-movies.json');
  if (!resp.ok) {
    throw new Error('Could not load scheduled-movies.json. Run via a local web server.');
  }
  return resp.json();
}

export async function fetchDoyData() {
  const resp = await fetch('./doy-movies.json');
  if (!resp.ok) {
    throw new Error('Could not load doy-movies.json. Run via a local web server.');
  }
  return resp.json();
}

export async function fetchCineworldData() {
  try {
    const resp = await fetch('./cineworld-movies.json');
    if (resp.ok) {
      return resp.json();
    }
  } catch { }
  return null;
}

function buildCinemaNameMap(cinemaMap) {
  return new Map([
    ...[...cinemaMap.values()].map((cinema) => [cinema.id, cinema.name]),
    [CINEWORLD_BRIGHTON.id, CINEWORLD_BRIGHTON.name],
  ]);
}

function processScheduledMovies(scheduledData, doyData, cinemaMap, cinemaNameById, start, end) {
  const cinemaIds = new Set([...cinemaMap.keys()]);
  const cinemaLabel = [...cinemaMap.values(), CINEWORLD_BRIGHTON]
    .map((cinema) => cinema.name)
    .join(', ');

  const metadataMap = new Map(
    (doyData.movies || []).map((movie) => [movie.ScheduledFilmId, movie])
  );

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

  return movieMap;
}

function processCineworldMovies(cineworldData, movieMap, cinemaNameById, start, end) {
  if (!cineworldData?.body) return;

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

export function mergeAllMovies(movieMap) {
  return mergeMoviesAcrossCinemas([...movieMap.values()])
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
    .filter((movie) => movie.showtimes.length > 0)
    .sort(
      (a, b) =>
        a.showtimes[0].startsAt - b.showtimes[0].startsAt ||
        a.title.localeCompare(b.title)
    );
}

export async function loadAllMovieData() {
  const [scheduledData, doyData] = await Promise.all([
    fetchScheduledData(),
    fetchDoyData(),
  ]);

  const cinemaMap = getBrightonCinemas();
  const cinemaNameById = buildCinemaNameMap(cinemaMap);
  const { start, end } = buildDateWindow();

  const movieMap = processScheduledMovies(
    scheduledData, doyData, cinemaMap, cinemaNameById, start, end
  );

  const cineworldData = await fetchCineworldData();
  processCineworldMovies(cineworldData, movieMap, cinemaNameById, start, end);

  const movies = mergeAllMovies(movieMap);

  const days = [
    ...new Set(
      movies.flatMap((movie) =>
        movie.showtimes.map((show) => show.dayKey)
      )
    ),
  ].sort();

  const cinemas = [...cinemaMap.values(), CINEWORLD_BRIGHTON];

  return { movies, days, cinemas };
}

export function prefetchCineworldArtwork(movies, tmdbService, onChanged) {
  if (!tmdbService.hasKey || !movies.length) {
    return Promise.resolve();
  }

  const cineworldMovies = movies.filter((movie) =>
    (movie.showtimes || []).some(
      (show) => show.cinemaId === CINEWORLD_BRIGHTON.id
    )
  );

  let changed = false;

  return (async () => {
    for (const movie of cineworldMovies) {
      if (movie.landscapeImageUrl) continue;

      try {
        const artwork = await tmdbService.getMovieArtwork(movie);
        if (artwork?.backdropPath) {
          movie.landscapeImageUrl = artwork.backdropPath;
          changed = true;
        }
      } catch { }
    }

    if (changed && onChanged) {
      onChanged();
    }
  })();
}
