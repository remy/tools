# Vibed tools

> **⚠️ Responsible disclaimer: every project in this repository was generated using AI.**
>
> All of the tools here were written by large language models — prompted, steered
> and reviewed by a human, but not hand-authored. Treat the code accordingly:
> it has not been through the review, testing or hardening you would expect of
> production software. Nothing here is audited, guaranteed or supported. If you
> use one of these tools for anything that matters — money, health, data you
> care about — verify the result yourself. Read the source before you trust it.

---

## What this is

A collection of small, standalone web tools. Each one lives in its own directory
at the repo root, is served as a static page, and solves exactly one problem:
decoding a capacitor marking, adjusting subtitle timings, planning a cook,
comparing ESP32 boards, tracking workouts, browsing an Immich library.

There are currently 61 of them, spread across categories like Developer Tools,
Productivity, Calculators, Web Demos, Immich, Home Assistant, Game, Learning,
Audio and Maps.

The root [`index.html`](index.html) is the directory of everything, and it is
generated rather than maintained by hand.

## How it's built

The constraints are deliberate and they shape everything else:

- **No frameworks.** No React, Vue or Svelte. No Tailwind or Bootstrap. Plain
  HTML, CSS and JavaScript.
- **No build step.** Files are served exactly as they sit in the repo. Two tools
  (`movies/`, `emoji-accessibility/`) fetch or precompute data via
  [`build.sh`](build.sh), but nothing is compiled or bundled.
- **No CDNs.** Third-party libraries are vendored into [`/vendor`](vendor);
  fonts are self-hosted or system stacks.
- **Self-contained tools.** A tool is `index.html` + `style.css` + `script.js`,
  referencing nothing outside its own directory except the shared roots below.

The full set of rules for adding a tool is in [AGENTS.md](AGENTS.md), with the
design system in [style-guide.md](style-guide.md).

## Methods used

**Modern CSS instead of tooling.** Nesting, custom properties, `color-mix()`
and `:has()` do the work a preprocessor or utility framework would otherwise
do. Every colour is a custom property in
`:root`, so light and dark themes are a single `prefers-color-scheme` block —
the theme follows the OS setting, and there is no toggle.

**Mobile-first, down to 325px.** Base styles target small screens;
`@media (min-width: …)` adds the wider layouts. `dvh`/`svh` handle mobile
viewport chrome.

**Native platform elements over re-implementations.** Modal UI is always
`<dialog>` opened with `.showModal()` (17 tools), which gives inert background
content, focus trapping and Escape-to-dismiss for free; `popover="auto"` is
reserved for non-modal menus. Expand/collapse UI is `<details>`/`<summary>`
rather than a click handler toggling `hidden`.

**Web components where a widget repeats.** Custom elements are defined in files
ending `.wc.js` — a naming convention that [`_headers`](_headers) uses to serve
them with permissive CORS, so they can be embedded from elsewhere.

**Offline by default.** Tools register the root [`sw.js`](sw.js) — a
network-first service worker with cache fallback — 59 of the 61 do today. On a
cache miss it retries ignoring the query string, so state-carrying links like `/todo/?list=<id>` still
resolve offline. Its cache is versioned by git SHA, stamped in CI on every push
to `main`.

**Local-first storage, optional sync.** Most tools persist to `localStorage`;
the larger ones (todo, workout, cook-plan, subscriptions, family-games) use
PouchDB in IndexedDB with live replication to a user-supplied CouchDB. The
shared plumbing lives in [`/lib`](lib) — `PouchStore` for the local database and
replication lifecycle, plus modules for sync config, status rendering and
deep links. Connection details are namespaced per tool under one
`tools.sync` key, because every tool shares a single origin and therefore a
single `localStorage`.

**Browser APIs, used directly.** Canvas 2D (and `OffscreenCanvas`) for image and
tile work, Web Audio for the synthesis tools, Screen Wake Lock for anything
meant to stay on screen, `crypto.subtle` for content hashing, and drag-and-drop
file input wired up early so file capture doesn't wait on the rest of the page
loading.

**Shared icons via CSS masks.** SVGs in [`/icons`](icons) are rendered as
`mask-image` on a `currentColor` background rather than inline `<svg>` or
`<img>`, so a single asset inherits text colour and adapts to the colour scheme.

**One serverless function.** [`netlify/functions/cors-proxy.mjs`](netlify/functions/cors-proxy.mjs)
re-serves arbitrary public URLs with CORS headers so tools can read feeds and
APIs that don't send their own. It applies basic SSRF guards; it is not a
hardened gateway.

## The generated index

[`scripts/generate_index.py`](scripts/generate_index.py) walks the repo for
directories containing an `index.html`, reads each one's `<title>`,
`meta[name=description]` and `meta[name=category]`, writes
[`projects.json`](projects.json), and regenerates the listing between the
`<!-- PROJECTS:START -->` / `<!-- PROJECTS:END -->` markers in the root page
using the `<template>` elements defined there.

It runs automatically on every push to `main` via
[`.github/workflows/update_index.yml`](.github/workflows/update_index.yml), which
also stamps the service worker version, so a new tool only needs its two meta
tags to appear on the index.

## Running locally

There is nothing to install. Serve the repo root with any static server and
visit it:

```bash
python3 -m http.server 8000
```

Absolute paths (`/lib/…`, `/icons/…`, `/vendor/…`, `/sw.js`) mean the server has
to be rooted at the repo, not inside a single tool's directory. The Netlify
function and its redirects only apply on a deploy.

## Licence

No licence is declared. See the disclaimer at the top before reusing anything
here.
