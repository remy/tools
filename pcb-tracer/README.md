# PCB net tracer

Open a board in the browser, hover or click any trace, pad or via, and the whole
net it belongs to lights up — front and back, through vias.

Open **`index.html`** and drop a board on it:

| you drop | what happens |
|---|---|
| a **`.kicad_pcb`** | nets are read straight out of the file, with real net names and pad references |
| a **Gerber `.zip`** (or the loose files) | nets are recovered from the copper geometry and stitched between layers through the drill file |

Which one you dropped is detected automatically.

No build step, no dependencies, no server — double-click `index.html` and it
works. Nothing is uploaded; there is no network code in the project at all.

## Controls

| | |
|---|---|
| hover | preview a net |
| click | pin it (click again to unpin) |
| shift / ⌘ / ctrl-click | pin several at once |
| drag | pan |
| wheel | zoom at the cursor (won't zoom out past fit) |
| <kbd>F</kbd> | flip to the back view |
| <kbd>1</kbd> / <kbd>2</kbd> | toggle the copper layers |
| <kbd>Esc</kbd> | clear |

On a touchscreen: tap a trace to light up its net, tap it again (or tap bare
board) to clear, drag to pan, pinch to zoom. There is no hover, so a tap does
what a click does on the desktop.

The sidebar lists every net with a filter box, plus per-board layer toggles. Any
caveats about the board you loaded appear in the warning strip at the bottom of
the sidebar. Below 640px the board gets the whole viewport and the sidebar moves
behind the **Nets** button, opening as a full-screen dialog; picking a net closes
it again.

## Layout

```
index.html              markup + script tags, in dependency order
css/tracer.css
js/
  util.js               warnings, escaping
  kicad-sexpr.js        s-expression parser
  kicad-geometry.js     arcs, polygons, number formatting
  kicad-render.js       .kicad_pcb -> SVG, with data-net on every copper element
  gerber-zip.js         zip reader (central directory + DecompressionStream)
  gerber-parse.js       RS-274X and Excellon parsers
  gerber-raster.js      rasteriser and connected-component labelling
  backend-kicad.js      SVG backend
  backend-gerber.js     canvas backend, layer identification
  viewer.js             viewport, net list, highlight, pan/zoom/flip
  main.js               detect what was dropped, wire up input
KNOWLEDGE.md            format gotchas and design rationale — read before changing parsers
```

The scripts are plain classic `<script src>` tags, deliberately not ES modules:
modules are fetched with CORS, which fails on a `file://` origin, and the page has
to work without a server. See KNOWLEDGE.md §5.

Both board types sit behind one backend interface, so the viewer doesn't know
which it is drawing:

```js
{ kind, W, H, nets, mount(wrap), netAt(ev), setHighlight(Set),
  describe(id), toggles, stats, onFlip(bool) }
```

## What it handles

**KiCad** — board outline, poured copper, track segments and arcs, vias with drill
holes, pads (rect / roundrect / oval / circle / custom), silkscreen and mask
artwork, reference designators. Both the KiCad 6/7/8 syntax and KiCad 5 and
earlier. Verified against all six boards in the `NintendoPCBs` collection.

**Gerber** — apertures C/R/O/P and aperture macros, region fills, `LPD`/`LPC`
polarity, linear and circular interpolation (`G74` and `G75`), inch and millimetre
units. Excellon in metric and imperial, with `G85` slots. Gerber X2 net attributes
are used when present. Layer files are identified by content first, then by name,
covering EasyEDA, KiCad, Altium and JLCPCB conventions.

## Limits

Two copper layers only. Gerber connectivity comes from a raster, so resolution is
a correctness question — the page reports its mil/px and warns above 3. Without
Gerber X2 attributes there are no net names or reference designators, which is the
real reason to prefer a `.kicad_pcb` when you have one.

Full list, with the reasoning behind each, in KNOWLEDGE.md §8.
