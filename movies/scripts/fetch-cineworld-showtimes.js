#!/usr/bin/env node

// Cineworld's site sits behind Cloudflare bot protection, so plain HTTP
// requests to its API get a 403. We drive a headless copy of the locally
// installed Chrome (via playwright-core) to load the site, then call the
// same JSON endpoints the site's own front end uses from inside the page.

const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright-core');

const SITE_ORIGIN = 'https://www.cineworld.co.uk';
const API_BASE = '/api/gatsby-source-boxofficeapi';
const DEFAULT_THEATER_ID = 'X079B'; // Cineworld Brighton
const DEFAULT_DAYS = 7;
const DEFAULT_OUTPUT = 'cineworld-movies.json';
const DEFAULT_RAW_DIR = 'cineworld-events';
const TIME_ZONE = 'Europe/London';
// The site treats a "day" as running from 03:00 to 03:00 the next morning
const BUSINESS_DAY_START = 'T03:00:00';
const MOVIE_ID_BATCH_SIZE = 30;
// Cloudflare rejects the default "HeadlessChrome" user agent
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

function parseArgs(argv) {
  const options = {
    days: DEFAULT_DAYS,
    startDate: null,
    theaterId: DEFAULT_THEATER_ID,
    output: DEFAULT_OUTPUT,
    rawDir: DEFAULT_RAW_DIR,
    noRaw: false,
    headed: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === '--days' && next) {
      options.days = Number(next);
      index += 1;
      continue;
    }
    if (arg === '--start' && next) {
      options.startDate = next;
      index += 1;
      continue;
    }
    if (arg === '--theater' && next) {
      options.theaterId = next.toUpperCase();
      index += 1;
      continue;
    }
    if (arg === '--out' && next) {
      options.output = next;
      index += 1;
      continue;
    }
    if (arg === '--raw-dir' && next) {
      options.rawDir = next;
      index += 1;
      continue;
    }
    if (arg === '--no-raw') {
      options.noRaw = true;
      continue;
    }
    if (arg === '--headed') {
      options.headed = true;
      continue;
    }
    if (arg === '--help') {
      printHelp();
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (
    !Number.isInteger(options.days) ||
    options.days < 1 ||
    options.days > 31
  ) {
    throw new Error('--days must be an integer between 1 and 31');
  }

  return options;
}

function printHelp() {
  console.log(
    `
Fetch Cineworld showtimes for multiple days and merge them for frontend consumption.

Requires Google Chrome to be installed and playwright-core (npm install).

Usage:
  node scripts/fetch-cineworld-showtimes.js [options]

Options:
  --start YYYY-MM-DD   Start date (default: today)
  --days N             Number of days to fetch, inclusive of start (default: 7)
  --theater ID         Theater ID (default: X079B, Cineworld Brighton)
  --out PATH           Output JSON path (default: cineworld-movies.json)
  --raw-dir PATH       Directory for raw API payloads (default: cineworld-events)
  --no-raw             Do not save raw API payloads
  --headed             Show the browser window (useful if Cloudflare blocks)
  --help               Show this help
`.trim()
  );
}

function getStartDate(startDateInput) {
  if (startDateInput) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDateInput)) {
      throw new Error('--start must be in YYYY-MM-DD format');
    }
    const explicit = new Date(`${startDateInput}T00:00:00`);
    if (Number.isNaN(explicit.getTime())) {
      throw new Error(`Invalid --start date: ${startDateInput}`);
    }
    return explicit;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function formatDateYmd(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(date, days) {
  const result = new Date(date.getTime());
  result.setDate(result.getDate() + days);
  return result;
}

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function fetchJsonInPage(page, apiPath) {
  const result = await page.evaluate(async (url) => {
    const response = await fetch(url, {
      headers: { accept: 'application/json' },
    });
    return { status: response.status, text: await response.text() };
  }, apiPath);

  if (result.status !== 200) {
    throw new Error(
      `HTTP ${result.status} while fetching ${apiPath}: ${result.text.slice(0, 200)}`
    );
  }

  return JSON.parse(result.text);
}

function fetchSchedule(page, theaterId, from, to) {
  const params = new URLSearchParams({
    from,
    to,
    nin: 'Showtime.Category.ExhibitorSelection',
    theaters: JSON.stringify({ id: theaterId, timeZone: TIME_ZONE }),
  });
  return fetchJsonInPage(page, `${API_BASE}/schedule?${params}`);
}

async function fetchMovies(page, movieIds) {
  const movies = [];
  for (const ids of chunk(movieIds, MOVIE_ID_BATCH_SIZE)) {
    const params = new URLSearchParams({ basic: 'false', castingLimit: '3' });
    for (const id of ids) params.append('ids', id);
    movies.push(...(await fetchJsonInPage(page, `${API_BASE}/movies?${params}`)));
  }
  return movies;
}

// Map the box office API movie onto the film shape the frontend reads
function toFilm(movie) {
  const release = movie.release || movie.releases?.[0]?.releasedAt || '';
  const certificate =
    movie.certificate || movie.releases?.[0]?.rating?.certificate || '';

  return {
    id: String(movie.id),
    name: movie.locale?.title || movie.title || movie.originalTitle || '',
    length: movie.runtime ? Math.round(movie.runtime / 60) : null,
    posterLink: movie.poster || movie.locale?.poster?.url || '',
    videoLink: movie.trailer?.SD || movie.trailer?.HD || '',
    link: '',
    weight: movie.orderIndex ?? 0,
    releaseYear: release ? release.slice(0, 4) : '',
    releaseDate: release ? release.slice(0, 10) : '',
    attributeIds: certificate ? [certificate.toLowerCase()] : [],
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const startDate = getStartDate(options.startDate);
  const from = `${formatDateYmd(startDate)}${BUSINESS_DAY_START}`;
  const to = `${formatDateYmd(addDays(startDate, options.days))}${BUSINESS_DAY_START}`;

  let browser;
  try {
    browser = await chromium.launch({
      channel: 'chrome',
      headless: !options.headed,
    });
  } catch (error) {
    throw new Error(
      `Could not launch Google Chrome (is it installed?): ${error.message || error}`
    );
  }

  let schedule;
  let movies;
  try {
    const page = await browser.newPage({ userAgent: USER_AGENT });
    await page.goto(`${SITE_ORIGIN}/`, { waitUntil: 'domcontentloaded' });

    const schedulePayload = await fetchSchedule(
      page,
      options.theaterId,
      from,
      to
    );
    schedule = schedulePayload?.[options.theaterId]?.schedule || {};
    movies = await fetchMovies(page, Object.keys(schedule));

    if (!options.noRaw) {
      await fs.mkdir(options.rawDir, { recursive: true });
      await fs.writeFile(
        path.join(options.rawDir, 'schedule.json'),
        JSON.stringify(schedulePayload, null, 2),
        'utf8'
      );
      await fs.writeFile(
        path.join(options.rawDir, 'movies.json'),
        JSON.stringify(movies, null, 2),
        'utf8'
      );
    }
  } finally {
    await browser.close();
  }

  const eventsDatesByFilmId = {};
  const requestedDates = new Set();
  for (const [movieId, showtimesByDate] of Object.entries(schedule)) {
    const startTimes = new Set();
    for (const [date, showtimes] of Object.entries(showtimesByDate)) {
      requestedDates.add(date);
      for (const showtime of showtimes) {
        if (showtime.startsAt) startTimes.add(showtime.startsAt);
      }
    }
    if (startTimes.size) {
      eventsDatesByFilmId[movieId] = [...startTimes].sort();
    }
  }

  const films = movies
    .map(toFilm)
    .filter((film) => eventsDatesByFilmId[film.id])
    .sort((left, right) => left.name.localeCompare(right.name));

  const merged = {
    source: 'cineworld-boxofficeapi',
    generatedAt: new Date().toISOString(),
    theaterId: options.theaterId,
    requestedDates: [...requestedDates].sort(),
    body: {
      films,
      eventsDatesByFilmId: Object.fromEntries(
        Object.entries(eventsDatesByFilmId).sort(([left], [right]) =>
          left.localeCompare(right)
        )
      ),
    },
  };

  await fs.writeFile(options.output, JSON.stringify(merged, null, 2), 'utf8');

  const eventsCount = Object.values(merged.body.eventsDatesByFilmId).reduce(
    (sum, times) => sum + times.length,
    0
  );
  console.log(
    `Saved ${films.length} films and ${eventsCount} showtimes to ${options.output}`
  );
  if (!options.noRaw) {
    console.log(`Saved raw API payloads to ${options.rawDir}/`);
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
