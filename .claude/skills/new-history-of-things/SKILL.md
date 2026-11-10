---
name: new-history-of-things
description: Research a subject on the web and publish it as a new entry in the History of Things project (history-of-things/). Use when asked for "/new-history-of-things <subject>", "add a history of X", "write up the history of X for the site", or "new entry for History of Things".
---

# New History of Things entry

Research one subject properly, then publish it as an entry in `history-of-things/`.

The subject is whatever followed the command — "the web browser", "concrete",
"the paperclip", "the QWERTY keyboard". If no subject was given, ask for one and stop.

## Before anything else: the hero image

Every entry is led by one very large photograph, so settle this first — the
research is wasted if there is no picture to hang it on.

Ask the author: **"Do you have a hero image for this, or should I find one?"**

- **They have one.** Take the path. Anything from about 1600px on the long edge
  is fine; larger is better. Landscape works best (the hero crops to 16:9 on
  desktop, 3:2 on mobile), so warn them if it is portrait or square.
- **They want you to find one.** Search Wikimedia Commons, museum and archive
  open-access collections (Rijksmuseum, the Met, Science Museum Group, Library
  of Congress, NASA), or Unsplash. **Only use images you have confirmed the
  licence for**, and prefer something specific and physical over a generic stock
  shot. Report the licence and the source URL and let them approve it before you
  spend time on the write-up.

Do not generate an image, and do not ship an entry without one.

## Research

Research the subject genuinely — do not write from memory. Use `WebSearch` and
`WebFetch`, read several independent sources, and prefer primary and
institutional ones (museums, universities, national archives, standards bodies,
the original papers or patents) over listicles and content farms. Wikipedia is a
fine index into the primary sources; it is not sufficient on its own.

You are looking for:

- **The origin.** Who, where, when, and — most importantly — *what problem were
  they actually trying to solve?* Almost nothing was invented for the reason
  people assume.
- **The turn.** The moment it stopped being a curiosity and became ordinary.
  There is usually one specific decision, product or accident.
- **The fight.** Rivals, lawsuits, standards wars, suppressed alternatives.
  Conflict is what makes a history readable rather than a list of dates.
- **The cost.** Who lost out, what it displaced, what it did to the world. Do not
  sand this off — a fifteen-year-old can handle it, and leaving it out makes the
  piece feel like an advert.
- **The now.** Where the thing stands today, and what is still unresolved.
- **One genuinely surprising fact** for the Did You Know, and **one vivid scene**
  — a specific day, a room, a named person doing something — for the Moment From
  History. **Both must be citable.** Note the source URL as you find them; if you
  cannot cite it, you cannot use it (see below).

Pin down exact dates, full names and real numbers. If sources disagree, say so
in the prose ("nobody agrees on…") rather than picking one and sounding certain.
If you cannot verify a good story, cut it — a charming anecdote that turns out to
be a myth is worse than no anecdote.

### Citing the two callouts

The Did You Know and the Moment From History are the two parts readers will
repeat to somebody else, so they are the two parts that have to be traceable.
Both carry a `sources` array, and it is **not optional** — the page renders a
"Source:" line under each.

- **Write the claim to fit the source, not the other way round.** If the source
  says "late on the night of 30 September", do not round it to "in October"
  because it scans better.
- **Cite two sources when one does not cover the whole anecdote.** A common
  case: a trade-press piece pins the date and the place, and a reference work
  carries the detail that makes the story. Cite both rather than blending them
  into a single unattributed telling.
- **Prefer the most primary source you actually read.** The inventor's own page
  beats an encyclopedia; a contemporaneous news report beats a modern listicle.
  Do not cite something you only saw quoted somewhere else.
- **Fetch every URL before you cite it.** A dead or wrong link is worse than no
  citation, because it looks checked.
- If the only support you can find for a great fact is a blog post repeating an
  unsourced claim, **replace the fact**. There is always another one.

## Voice

Written for a curious fifteen-year-old: assume intelligence, assume no prior
knowledge, and never talk down. Concretely that means:

- Explain jargon in the sentence that uses it, then use it freely afterwards.
- Concrete over abstract. "About the weight of a small car", not "considerable mass".
- Vary sentence length. A long, winding sentence that carries an idea, then a short one.
- Dry wit is welcome. Exclamation marks, "amazing!", and "fun fact" are not.
- No second-person life advice, no moral at the end, no "and the rest is history".
- British English, Oxford-free comma style, `—` em dashes, curly quotes.
- Aim for **700–950 words** across the `summary` paragraphs: 6–9 paragraphs.
  The first is a self-contained summary of the whole story — it is set in serif
  with a drop cap and has to work alone. The rest run chronologically.
- Read the published entries in `history-of-things/entries/` first and match them.

## Publish

1. **Slug.** Kebab-case, no leading article unless it reads wrong without one
   (`the-web-browser`, `concrete`, `the-shipping-container`).

2. **Image.** From the repo root:

   ```bash
   history-of-things/bin/import-image.sh <source-image> <slug>
   ```

   It resizes, strips EXIF and writes `history-of-things/images/<slug>.avif`.

3. **Entry file.** Write `history-of-things/entries/<slug>.json`. Every field is
   required except `imageCredit`, which is required whenever the image came from
   somewhere that asks for attribution.

   ```json
   {
     "slug": "the-web-browser",
     "title": "The Web Browser",
     "image": "the-web-browser.avif",
     "imageAlt": "Describe what is in the photograph, for screen readers",
     "imageCredit": { "text": "Photographer, Source (Licence)", "url": "https://…" },
     "published": "YYYY-MM-DD",
     "summary": ["Lede paragraph…", "…", "…"],
     "didYouKnow": {
       "text": "One surprising, verifiable fact. Two or three sentences.",
       "sources": [{ "title": "Publication — Headline", "url": "https://…" }]
     },
     "momentFromHistory": {
       "title": "A scene, not a topic",
       "text": "One vivid, dated, specific incident. Three to five sentences.",
       "sources": [{ "title": "Publication — Headline", "url": "https://…" }]
     },
     "furtherReading": [
       { "title": "Where to go next", "url": "https://…", "note": "Why this one is worth the click" }
     ]
   }
   ```

   Write it with a script (`python3` + `json.dump`) rather than by hand, so the
   escaping and encoding are right.

   Both `sources` arrays are required and must be non-empty; one or two entries
   each. Title them "Publication — Headline" so the reader can see at a glance
   whether it is a museum, a newspaper or an encyclopedia.

   `furtherReading` wants 4–6 links, ordered best-first, mixing a primary source,
   an institutional overview, and something you can actually *do* or watch. Every
   URL must be one you fetched successfully during research — check them, do not
   guess them. The `note` is one short clause, not a summary.

4. **Manifest.** Append to `history-of-things/entries/index.json`, with `number`
   one higher than the current maximum. Order in this file is the reading order;
   the home page shows it newest-first.

   ```json
   { "number": 2, "slug": "…", "title": "…", "image": "….avif" }
   ```

5. **Check it.** Serve the repo (`.claude/launch.json` has a `tools` config on
   port 8111) and open `/history-of-things/#/<slug>`. Confirm the hero fills the
   frame without an awkward crop, the drop cap looks right, both callouts render
   **with their Source line**, every Keep Exploring link resolves, and there is
   no horizontal overflow at 325px wide. Check dark mode too.

6. **Pull request.** Create it automatically — do not ask. Title it
   `[history-of-things] Add <Title>`. Commit only the entry JSON, the manifest
   and the image; leave unrelated working-tree changes alone.

Do not run `scripts/generate_index.py` — it runs on merge.
