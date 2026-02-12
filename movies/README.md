# Brighton Cinema Planner

Small vanilla web app for browsing upcoming Brighton movie showtimes from local JSON files.

## Run

From this folder:

```bash
python -m http.server 8080
```

Then open:

- `http://localhost:8080/`

## Features

- Shows Brighton cinema movies in the next 7 days (based on today).
- Day picker to filter movies and showtimes by a specific day.
- Expandable movie cards with grouped showtimes and screen names.
- Includes Cineworld Brighton listings from `cineworld-movies.json`.
- Merges same-title films across cinemas into one card with combined showtimes.
- Uses TMDB backdrop (landscape) artwork for Cineworld titles when a TMDB key is set.
- Optional TMDB enrichment (overview, cast, director, genres, rating, trailer).

## Refreshing Cineworld data

Fetch 7 days of Cineworld events (today + next 6 days), save daily raw payloads, and write a merged frontend-ready file:

```bash
node scripts/fetch-cineworld-showtimes.js --days 7 --out cineworld-movies.json --raw-dir cineworld-events
```

This produces:

- `cineworld-movies.json` in the same structure the app already reads (`body.films` + `body.eventsDatesByFilmId`)
- `cineworld-events/YYYY-MM-DD.json` raw daily responses (useful for debugging or audits)

## TMDB key (optional)

1. Create an API key at TMDB.
2. Paste it into the `TMDB API key` field in the app.
3. Expand a movie card to fetch details.

The key is stored in `localStorage` in your browser.
TMDB lookup/artwork results are cached in IndexedDB to reduce repeat requests.
