#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

curl -s -X POST  https://www.picturehouses.com/api/scheduled-movies-ajax > scheduled-movies.json # all picturehouses movies
curl -s -X POST https://www.picturehouses.com/api/get-movies-ajax -d "start_date=show_all_dates&cinema_id=008" > doy-movies.json
node scripts/fetch-cineworld-showtimes.js --days 7 --out cineworld-movies.json --raw-dir cineworld-events
curl -s "https://vwc.odeon.co.uk/WSVistaWebClient/ocapi/v1/showtimes/by-business-date/first?siteIds=824"> odeon-movies.json
