#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");

const DEFAULT_QUICKBOOK_ID = "10108";
const DEFAULT_CINEMA_ID = "014";
const DEFAULT_DAYS = 7;
const DEFAULT_OUTPUT = "cineworld-movies.json";
const DEFAULT_RAW_DIR = "cineworld-events";

function parseArgs(argv) {
  const options = {
    days: DEFAULT_DAYS,
    startDate: null,
    quickbookId: DEFAULT_QUICKBOOK_ID,
    cinemaId: DEFAULT_CINEMA_ID,
    output: DEFAULT_OUTPUT,
    rawDir: DEFAULT_RAW_DIR,
    noRaw: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--days" && next) {
      options.days = Number(next);
      index += 1;
      continue;
    }
    if (arg === "--start" && next) {
      options.startDate = next;
      index += 1;
      continue;
    }
    if (arg === "--cinema" && next) {
      options.cinemaId = next;
      index += 1;
      continue;
    }
    if (arg === "--quickbook" && next) {
      options.quickbookId = next;
      index += 1;
      continue;
    }
    if (arg === "--out" && next) {
      options.output = next;
      index += 1;
      continue;
    }
    if (arg === "--raw-dir" && next) {
      options.rawDir = next;
      index += 1;
      continue;
    }
    if (arg === "--no-raw") {
      options.noRaw = true;
      continue;
    }
    if (arg === "--help") {
      printHelp();
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!Number.isInteger(options.days) || options.days < 1 || options.days > 31) {
    throw new Error("--days must be an integer between 1 and 31");
  }

  return options;
}

function printHelp() {
  console.log(`
Fetch Cineworld film events for multiple days and merge them for frontend consumption.

Usage:
  node scripts/fetch-cineworld-showtimes.js [options]

Options:
  --start YYYY-MM-DD   Start date (default: today)
  --days N             Number of days to fetch, inclusive of start (default: 7)
  --cinema ID          Cinema ID (default: 014)
  --quickbook ID       Quickbook ID (default: 10108)
  --out PATH           Output JSON path (default: cineworld-movies.json)
  --raw-dir PATH       Directory for per-day raw payloads (default: cineworld-events)
  --no-raw             Do not save per-day raw payloads
  --help               Show this help
`.trim());
}

function getStartDate(startDateInput) {
  if (startDateInput) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDateInput)) {
      throw new Error("--start must be in YYYY-MM-DD format");
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
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toIsoLocal(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const second = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}:${second}`;
}

function getDates(startDate, days) {
  return Array.from({ length: days }, (_, offset) => {
    const date = new Date(startDate.getTime());
    date.setDate(date.getDate() + offset);
    return formatDateYmd(date);
  });
}

function normalizeFilmId(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeDateTime(value, fallbackDate) {
  if (value == null || value === "") return null;

  if (typeof value === "number" && Number.isFinite(value)) {
    const millis = value > 1e12 ? value : value > 1e9 ? value * 1000 : null;
    if (!millis) return null;
    return toIsoLocal(new Date(millis));
  }

  const raw = String(value).trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(raw) && fallbackDate) {
    const candidate = new Date(`${fallbackDate}T${raw}`);
    return Number.isNaN(candidate.getTime()) ? null : toIsoLocal(candidate);
  }

  const candidate = new Date(raw);
  if (!Number.isNaN(candidate.getTime())) {
    return toIsoLocal(candidate);
  }

  return null;
}

function mergeFilm(existingFilm, incomingFilm) {
  if (!existingFilm) return { ...incomingFilm };

  const merged = { ...existingFilm };
  const scalarFields = [
    "name",
    "title",
    "length",
    "posterLink",
    "videoLink",
    "link",
    "releaseYear",
    "releaseDate",
    "weight"
  ];

  for (const field of scalarFields) {
    if ((merged[field] == null || merged[field] === "") && incomingFilm[field] != null && incomingFilm[field] !== "") {
      merged[field] = incomingFilm[field];
    }
  }

  if ((!Array.isArray(merged.attributeIds) || merged.attributeIds.length === 0) && Array.isArray(incomingFilm.attributeIds)) {
    merged.attributeIds = [...incomingFilm.attributeIds];
  }

  return merged;
}

function addFilm(filmsById, rawFilm) {
  if (!rawFilm || typeof rawFilm !== "object") return;

  const id = normalizeFilmId(rawFilm.id || rawFilm.filmId || rawFilm.film_id || rawFilm.scheduledFilmId || rawFilm.ScheduledFilmId);
  if (!id) return;

  const canonicalFilm = {
    id,
    name: rawFilm.name || rawFilm.title || "",
    length: rawFilm.length ?? rawFilm.runtime ?? null,
    posterLink: rawFilm.posterLink || rawFilm.poster || rawFilm.image || rawFilm.imageUrl || "",
    videoLink: rawFilm.videoLink || rawFilm.trailer || rawFilm.trailerUrl || "",
    link: rawFilm.link || rawFilm.url || "",
    weight: rawFilm.weight ?? 0,
    releaseYear: rawFilm.releaseYear || "",
    releaseDate: rawFilm.releaseDate || "",
    attributeIds: Array.isArray(rawFilm.attributeIds) ? rawFilm.attributeIds : []
  };

  filmsById.set(id, mergeFilm(filmsById.get(id), canonicalFilm));
}

function getFilmIdFromObject(node, inheritedFilmId = "") {
  const explicit = node.filmId || node.film_id || node.scheduledFilmId || node.ScheduledFilmId;
  if (explicit) return normalizeFilmId(explicit);

  if (node.film && typeof node.film === "object") {
    const nested = node.film.id || node.film.filmId || node.film.film_id || node.film.scheduledFilmId;
    if (nested) return normalizeFilmId(nested);
  }

  if (node.id && (node.name || node.title || node.posterLink || node.releaseDate || node.releaseYear)) {
    return normalizeFilmId(node.id);
  }

  return inheritedFilmId;
}

function getEventDateTimeFromObject(node, fallbackDate) {
  const directFields = [
    "eventDateTime",
    "dateTime",
    "datetime",
    "showTime",
    "showtime",
    "startDateTime",
    "startTime",
    "performanceDateTime"
  ];

  for (const field of directFields) {
    if (node[field] != null) {
      const normalized = normalizeDateTime(node[field], fallbackDate);
      if (normalized) return normalized;
    }
  }

  const datePart = node.businessDate || node.eventDate || node.showDate || null;
  const timePart = node.businessTime || node.eventTime || null;
  if (datePart && timePart) {
    const combined = normalizeDateTime(`${datePart}T${timePart}`, fallbackDate);
    if (combined) return combined;
  }

  return null;
}

function addEvent(eventsByFilmId, filmId, dateTime) {
  if (!filmId || !dateTime) return;
  if (!eventsByFilmId.has(filmId)) {
    eventsByFilmId.set(filmId, new Set());
  }
  eventsByFilmId.get(filmId).add(dateTime);
}

function mergeEventsMap(eventsByFilmId, eventsMapLike) {
  if (!eventsMapLike || typeof eventsMapLike !== "object") return;

  for (const [rawFilmId, values] of Object.entries(eventsMapLike)) {
    const filmId = normalizeFilmId(rawFilmId);
    if (!filmId) continue;

    if (Array.isArray(values)) {
      for (const value of values) {
        const normalized = normalizeDateTime(value);
        if (normalized) addEvent(eventsByFilmId, filmId, normalized);
      }
    }
  }
}

function walkPayload(node, context, seen) {
  if (node == null) return;
  if (typeof node !== "object") return;
  if (seen.has(node)) return;
  seen.add(node);

  if (Array.isArray(node)) {
    for (const item of node) {
      walkPayload(item, context, seen);
    }
    return;
  }

  addFilm(context.filmsById, node);

  const filmId = getFilmIdFromObject(node, context.currentFilmId);
  const eventDateTime = getEventDateTimeFromObject(node, context.fallbackDate);
  if (filmId && eventDateTime) {
    addEvent(context.eventsByFilmId, filmId, eventDateTime);
  }

  const nextContext = { ...context, currentFilmId: filmId || context.currentFilmId };
  for (const value of Object.values(node)) {
    walkPayload(value, nextContext, seen);
  }
}

function mapToSortedObject(mapOfSets) {
  return Object.fromEntries(
    [...mapOfSets.entries()]
      .sort(([filmA], [filmB]) => filmA.localeCompare(filmB))
      .map(([filmId, values]) => {
        const sortedValues = [...values].sort((left, right) => {
          const leftTs = Date.parse(left);
          const rightTs = Date.parse(right);
          if (Number.isNaN(leftTs) || Number.isNaN(rightTs)) {
            return left.localeCompare(right);
          }
          return leftTs - rightTs;
        });
        return [filmId, sortedValues];
      })
  );
}

async function fetchDayPayload(baseUrl, date) {
  const response = await fetch(baseUrl, {
    headers: {
      "accept": "application/json",
      "user-agent": "movies-local-cineworld-fetch/1.0"
    }
  });

  if (!response.ok) {
    const snippet = await response.text();
    throw new Error(`HTTP ${response.status} while fetching ${date}: ${snippet.slice(0, 200)}`);
  }

  return response.json();
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const startDate = getStartDate(options.startDate);
  const dates = getDates(startDate, options.days);

  const filmsById = new Map();
  const eventsByFilmId = new Map();
  const fetchedDates = [];

  if (!options.noRaw) {
    await fs.mkdir(options.rawDir, { recursive: true });
  }

  for (const date of dates) {
    const url = `https://www.cineworld.co.uk/uk/data-api-service/v1/quickbook/${encodeURIComponent(options.quickbookId)}/film-events/in-cinema/${encodeURIComponent(options.cinemaId)}/at-date/${date}?attr=&lang=en_GB`;
    const payload = await fetchDayPayload(url, date);
    fetchedDates.push(date);

    if (!options.noRaw) {
      const rawPath = path.join(options.rawDir, `${date}.json`);
      await fs.writeFile(rawPath, JSON.stringify(payload, null, 2), "utf8");
    }

    const body = payload?.body || payload;
    if (body?.films && Array.isArray(body.films)) {
      for (const film of body.films) {
        addFilm(filmsById, film);
      }
    }

    mergeEventsMap(eventsByFilmId, body?.eventsDatesByFilmId);

    walkPayload(
      body,
      {
        filmsById,
        eventsByFilmId,
        fallbackDate: date,
        currentFilmId: ""
      },
      new WeakSet()
    );
  }

  const merged = {
    source: "cineworld-film-events",
    generatedAt: new Date().toISOString(),
    requestedDates: fetchedDates,
    body: {
      films: [...filmsById.values()].sort((left, right) => {
        const leftName = (left.name || left.title || left.id).toString();
        const rightName = (right.name || right.title || right.id).toString();
        return leftName.localeCompare(rightName);
      }),
      eventsDatesByFilmId: mapToSortedObject(eventsByFilmId)
    }
  };

  await fs.writeFile(options.output, JSON.stringify(merged, null, 2), "utf8");

  const eventsCount = Object.values(merged.body.eventsDatesByFilmId).reduce((sum, times) => sum + times.length, 0);
  console.log(`Saved ${merged.body.films.length} films and ${eventsCount} showtimes to ${options.output}`);
  if (!options.noRaw) {
    console.log(`Saved raw daily payloads to ${options.rawDir}/`);
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
