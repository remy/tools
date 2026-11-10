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
works. A board you open from disk is never uploaded.

## Loading a board from a URL

Paste a link into the box on the drop screen, or put it on the query string:

```
index.html?url=https://github.com/HDR/NintendoPCBs/blob/master/DMG-KFDN-01/DMG-KFDN-01.kicad_pcb
```

so a link to a board is a link to it already open. Repeat `?url=` for a loose
Gerber set; a `.zip` behind a URL is unpacked the same as a dropped one, and is
recognised by its bytes, so the URL doesn't have to end in `.zip`.

A GitHub file page is rewritten to `raw.githubusercontent.com`, which is the part
that actually permits a cross-origin read — pasting the `/blob/` URL is fine.
Any other host works if it sends `access-control-allow-origin`, and says so
plainly if it doesn't. This works from `file://` as well as over http.

Opening a board over the network is the only request the page ever makes; the
board itself is still parsed and traced entirely in the browser.

## Controls

| | |
|---|---|
| hover | preview a net, or a component with **Components** on |
| click | pin it (click again to unpin) |
| shift / ⌘ / ctrl-click | pin several at once |
| drag | pan |
| wheel | zoom at the cursor (won't zoom out past fit) |
| <kbd>F</kbd> | flip to the back view |
| <kbd>1</kbd> / <kbd>2</kbd> | toggle the copper layers |
| <kbd>Esc</kbd> | clear |

On a touchscreen: tap a trace to light up its net, tap it again (or tap bare
board) to clear, drag to pan, pinch to zoom. There is no hover, so a tap does
what a click does on the desktop. There is no Clear button — tapping bare board
is already the gesture for it, and on a keyboard so is <kbd>Esc</kbd>.

## View options

Two switches under **View** in the sidebar:

| | |
|---|---|
| **Dim board on highlight** | Off by default: lighting a net leaves the board at full strength and picks the net out by the yellow alone, with a wide glow to carry it against live copper. Tick it to drop everything else to 10% opacity instead, which isolates the net completely — good on a monitor, less so on a phone where the dimmed-back board disappears in daylight. Remembered between visits. |
| **Keep the screen awake** | Holds a screen wake lock so the device doesn't lock while you're looking at a board and not touching it. Deliberately not remembered — it starts off every time, including after a refresh. The pill beside it says what is actually held (**holding** / **not held**) rather than what was asked for, because the system can drop the lock on its own. The row is hidden where the browser has no Wake Lock API. |

The sidebar carries the View switches, per-board layer toggles, and every net
with a filter box, in that order. Any caveats about the board you loaded appear
in the warning strip at the bottom.

## Components

Tick **Components** under Layers on a `.kicad_pcb` and every footprint becomes
something you can point at. Hover one and the info box tells you what it is:

> **C5 — 0.1pF**
> SMD capacitor · 0603 (1608 metric) · front · 2 pads
> `Nintendo:C_0603_Pad_HandSolder`
> Capacitor SMD 0603, square (rectangular) end terminal, IPC_7351 nominal…
> `1 VOUT`  `2 GND`

Click to pin it so the card stays while you look elsewhere; Esc or bare board
clears it, exactly as for a net.

Nothing in the file actually says "0402 SMD capacitor" — that line is assembled
from the reference designator, the `(attr smd)`, and the package size written
into the footprint's name, so the library name and the description are always
shown verbatim underneath it. Where a footprint gives nothing to go on, the
line simply says less.

A pad or via inside a footprint still resolves to its **net**, not the part —
that copper is what you meant to click. Tracks and pours crossing under a part
lose to it while the layer is on; untick it and they come back.

Gerbers have no components: the switch and everything behind it only appear for
a `.kicad_pcb`.

Below 640px the board gets the whole viewport and the sidebar moves behind the
**Options** button, opening as a full-screen dialog; picking a net closes it
again. In the dialog the whole body scrolls as one, rather than the net list
scrolling inside a fixed frame — with the switches and toggles above it, a
self-scrolling list is only a couple of rows tall on a phone. The title bar and
the warning strip stay put at either end while it scrolls.

## Layout

```
index.html              markup + script tags, in dependency order
css/tracer.css
js/
  util.js               warnings, escaping
  kicad-sexpr.js        s-expression parser
  kicad-geometry.js     arcs, polygons, number formatting
  kicad-parts.js        what a footprint is: designator, package, value, boxes
  kicad-render.js       .kicad_pcb -> SVG, with data-net on every copper element
  gerber-zip.js         zip reader (central directory + DecompressionStream)
  gerber-parse.js       RS-274X and Excellon parsers
  gerber-raster.js      rasteriser and connected-component labelling
  backend-kicad.js      SVG backend
  backend-gerber.js     canvas backend, layer identification
  viewer.js             viewport, net list, highlight, pan/zoom/flip
  options.js            the two View switches: dim (stored, off), wake lock
  remote.js             ?url= loading: GitHub blob -> raw, fetch, CORS errors
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

plus, where a backend has components to offer — only KiCad does — an optional
`{ parts, componentAt(ev), setComponentHighlight(Set), describeComponent(i) }`.

## What it handles

**KiCad** — board outline, poured copper, track segments and arcs, vias with drill
holes, pads (rect / roundrect / oval / circle / custom), silkscreen and mask
artwork, reference designators, and per-footprint component detail. Both the
KiCad 6/7/8 syntax and KiCad 5 and earlier — including the KiCad 8 move of the
reference out of `fp_text` and into `(property …)`. Verified against all six
boards in the `NintendoPCBs` collection.

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
