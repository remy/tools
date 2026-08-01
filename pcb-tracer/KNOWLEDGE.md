# KNOWLEDGE

Things that cost time to work out, and the reasons the code is shaped the way it
is. `README.md` covers what the tool does; this covers why.

---

## 1. The fact the whole project hinges on

**A `.kicad_pcb` states its own connectivity. A Gerber set does not.**

KiCad tags every `segment`, `via` and `pad` with `(net N)`, computed at route
time, and `(net N "NAME")` maps ids to names. Tracing is a dictionary lookup —
there is no geometry involved and no guessing about where copper touches copper.

Gerber is a *plotter* format. It describes shapes to expose on film; a trace and a
piece of silkscreen artwork are the same kind of object to it. Nothing in a plain
RS-274X set says two shapes are the same conductor. That has to be recovered from
the geometry, which is why there are two backends rather than one renderer.

This asymmetry drives everything else: the KiCad path is exact and gives you real
net names and pad references; the Gerber path is an inference with failure modes
you need to know about (§4).

---

## 2. KiCad format notes

**Pad angles are absolute, not relative to the footprint.** `(pad "1" smd rect
(at -5.75 -8.255 90) …)` — the `-5.75 -8.255` is relative to the footprint origin
in its *unrotated* frame, but the `90` already includes the footprint's own
rotation. So a pad's own rotation is `pad_angle − footprint_angle`. Verified
empirically across the sample boards: every standard footprint has pads whose
angle equals the footprint's, i.e. a relative rotation of zero, which is correct.

**KiCad rotates with `[[c,s],[-s,c]]` in a y-down space**, which is SVG's
`rotate(-angle)`. Get the sign wrong and rotated footprints mirror rather than
turn. The same fact sets the sweep flag on KiCad 5 arcs (below).

**Two syntaxes, and the differences bite.** KiCad 5 and earlier (`version
20171130`) vs KiCad 6+ (`20211014` onward):

| | v5 and earlier | v6+ |
|---|---|---|
| footprints | `(module …)` | `(footprint …)` |
| atoms | unquoted — `(pad 1 smd rect …)` | quoted — `(pad "1" …)` |
| arcs | centre + start point + swept angle | start + mid + end |
| stroke width | `(width …)` | `(stroke (width …))` |

Two of the six sample boards are v5. They initially parsed with **zero pads**
because the parser only looked for `footprint`.

For a v5 arc, the end point is the start rotated about the centre by `−angle`
using KiCad's own matrix, which in SVG's y-down space is a positive rotation by
`+angle`. So the SVG sweep flag simply follows the sign of the angle.

**Some boards use mask layers as artwork.** The Nintendo boards put reference
designators and logos on `F.Mask`/`B.Mask` rather than `F.SilkS`. The renderer
treats mask graphics like silkscreen for that reason — otherwise those boards
render with no labels at all.

**Embedded bitmaps can dominate the file.** `(image …)` nodes hold base64 PNGs
used as silkscreen art. One AGB board is 15.6 MB, of which 14 MB is PNG data.
It's already compressed, so gzip only gets it to 10.2 MB. The tracer doesn't
render bitmaps, so they're simply skipped at parse time.

---

## 3. Gerber and Excellon format notes

**Aperture dimensions are in the file's unit, exactly like coordinates.** This
was the single worst bug in the project. Coordinates were being scaled by `%MOIN%`
→ 25.4 but aperture definitions were not, so an inch board rendered with
millimetre-sized pads. The symptom was not "everything is tiny" — it was **234
nets on a small interposer, 231 of them a few pixels each, with everything else
merged into one blob**. Undersized pads left slivers everywhere and failed to
bridge what they should have. After the fix: 26 sensible nets.

The tell was aperture sizes like `R:0.0787` and `C:0.122` — those are inches
(2.0 mm and 3.1 mm). If nets ever look absurd, print the aperture table first.

`%MO` always precedes `%AD` per spec, so scaling at definition time is safe. For
aperture macros, scale the *expanded geometry*, not the arguments — some
arguments are angles.

**Skip whitespace before checking for `%`.** Commands are `*`-terminated words, and
extended commands are `%…%` blocks that contain `*` characters internally. If the
splitter doesn't skip the newline before a `%`, it takes the word branch and
swallows a `*` from inside the block, corrupting everything after it.

**`LPC` clear polarity is real and load-bearing.** Pour clearances and keepouts are
often expressed as clear-polarity regions that knock copper out. Rendered with
`destination-out` on canvas. Ignore it and separate nets merge into one.

**Region contours are keyholes, and the fill rule turned out not to matter.** A
pour arrives as a single contour of several hundred points that weaves in and out
around its clearances. Worth knowing: nonzero and evenodd gave *identical*
coverage (45.2%) on the test board, because the inner loops are wound opposite to
the outer. Don't assume that holds for every exporter — if a pour renders solid,
the fill rule is the first thing to check.

**Modal D-codes.** A coordinate word with no `D01`/`D02`/`D03` repeats the previous
operation. Tracking `lastD` matters for files that lean on this.

**Single-quadrant arcs (`G74`)** have unsigned I/J, so the centre is ambiguous. The
parser tries all four sign combinations and picks the one where start and end are
equidistant from the candidate centre. `G75` (multi-quadrant, signed) is the
modern default and is exact.

**Gerber X2** (`%TO.N,<net>*%`) does attach net names to objects — if the exporter
wrote them. Neither EasyEDA set tested had any. When present, the geometry still
does the connecting; names are attached afterwards by sampling each tagged
object's start point, so there's only one connectivity code path.

**Excellon**: the header line carries the coordinate format (`METRIC,LZ,000.000`
→ 3 integer, 3 decimal digits), sometimes also as `;FILE_FORMAT=3:3`. Inch files
need ×25.4 on both tool diameters and coordinates. `G85` slots are two points on
one line and are sampled along their length, so both ends stitch.

**Identify layers by content before name.** `How-to-order-PCB.txt` sits in JLCPCB
zips and matches a naive `.txt` → drill rule. Check for `M48`/tool tables and
`%FS` first, then fall back to filename conventions.

---

## 4. Recovering nets from pixels

The Gerber pipeline is: rasterise each copper layer → connected-component label
it → union the two layers wherever a drill hit lands in copper on both sides.

**Resolution is a correctness question, not a display one.** This is the thing to
internalise. Too coarse a raster bridges two traces passing close together, or
breaks a thin neck in two — and the result *looks* perfectly plausible either way.
The page reports its mil/px and warns above 3. Current target is ~0.6–0.8 mil/px.

**4-connected, not 8.** A diagonal pixel touch is not a conductor. 8-connectivity
would merge traces that merely graze diagonally. Any real conductor has width and
so is 4-connected at a sane resolution.

**Alpha threshold 128** — half coverage, which approximates the true shape edge.
Higher would shrink shapes and risk breaking thin necks; lower would grow
anti-aliased fringes and risk bridging.

**Drill hits are sampled over a small disc**, not a single pixel. A drill lands in
the middle of a hole, where there is *no copper* — the copper is the annular ring
around it. Sampling one pixel finds nothing and stitches nothing.

**Raster is capped at 12 Mpx.** Two `Int32Array` label arrays plus an `ImageData`
at that size is already ~150 MB. Large boards therefore get coarser, which is
exactly when the resolution warning matters most.

**Why raster rather than exact polygon booleans:** Gerber is draws, flashes,
region fills, aperture macros and clear polarity. Getting an exact union of all
that requires real boolean geometry; flood-filling a rendered bitmap is a fraction
of the code and handles `LPC` knockouts for free. The cost is §4's first point.

---

## 5. Browser constraints

**No ES modules.** A module is fetched with CORS, and a `file://` origin is
`null`, so a stock browser refuses. The page must work by double-clicking it with
no server, so `index.html` loads plain classic `<script src>` tags in dependency
order. Top-level `const` in a classic script goes into the shared global lexical
environment, so cross-file references work; every cross-file use is inside a
function, so load order only has to be right for `main.js` (last, since it runs
immediately).

Beware when testing this: **the embedded preview browser runs with relaxed file
access** — it allows `fetch()` of `file://` URLs and loads `file://` ES modules,
neither of which a stock browser does. Verify file-protocol behaviour by checking
whether `fetch('./something.js')` succeeds; if it does, that browser is not
telling you the truth about what a user's browser will do.

**`DecompressionStream` does both compression jobs**: `deflate-raw` for zip
entries, `gzip` if a payload ever needs it. No zip library required — the central
directory is about 40 lines to walk.

**`new Response(stream)` is not a network call.** It appears in the zip reader
purely as a stream-to-text/arrayBuffer adapter, which is the standard way to drain
a `DecompressionStream`.

**Canvas stays untainted** because everything is drawn as shapes, never as loaded
images, so `getImageData` works from `file://`.

**No board ever leaves the machine.** There is no upload path, no analytics, no
external script, style, font or image. The single outbound request in the project
is the `fetch` in `remote.js`: a GET of a board URL the user typed or put on the
query string, and nothing else.

**`?url=` and CORS.** A cross-origin read needs the *host's* permission, and
github.com doesn't give it; `raw.githubusercontent.com` sends
`access-control-allow-origin: *`, so a `/blob/` URL is rewritten to its raw form
before fetching. Two things that would break it:

* **Don't set a request header.** Any custom header makes the GET a preflighted
  request, and `raw.githubusercontent.com` answers `OPTIONS` with a 403 — so the
  fetch would fail before it started. Nothing in `fetchBoard` sets one.
* **Don't fetch the `/blob/` URL as given.** It's an HTML page wrapping the file,
  and the parsers would choke on markup a long way from the actual cause. A
  response starting `<!doctype html` is rejected up front with that as the error.

This works from a `file://` origin too, which is not obvious: the origin is
`null`, and `null` is what `*` allows. Verified in Chromium — the page double
clicked off the disk still loads a board from GitHub, even though a `fetch` of its
own sibling files is blocked.

The service worker ignores it: `sw.js` returns early for any request whose origin
isn't its own, so board URLs are never cached or intercepted.

---

## 6. Architecture

Both board types sit behind one interface so the viewer doesn't know which it's
drawing:

```js
{ kind, W, H, nets, mount(wrap), netAt(ev), setHighlight(Set),
  describe(id), toggles, stats, onFlip(bool) }
```

Shared once: viewport, pan/zoom, flip, net list, pinning, the dim-the-rest
highlight, drop handling, errors. The backends differ only where they must —
KiCad is an SVG whose elements carry `data-net` and highlights by toggling a
class; Gerber is stacked canvases plus label arrays and highlights by repainting
an overlay. Layer toggles come *from* the backend, so the sidebar reconfigures
itself when you switch board types.

The viewport is a CSS transform on `#wrap` for both, rather than an SVG `viewBox`
for one and a transform for the other. That makes pan, zoom and flip one
implementation. The flip mirrors the wrapper and counter-flips `.lbl` text so
labels stay readable.

A `.kicad_pcb` anywhere in a drop beats Gerbers in the same drop, with a warning:
it states its own connectivity, so it's strictly better.

**Pointer events, not mouse events.** Pan, pinch and pick are one code path for
mouse and touch. Two details make it work and are easy to break:

* `#stage` must keep `touch-action:none`. Without it the browser claims the
  gesture for scrolling and sends `pointercancel` mid-drag, so panning dies after
  a few pixels.
* Touch gets *implicit* pointer capture, so `pointerup` reports the element the
  finger went down on. That is what the KiCad backend's `netAt` reads to find the
  net, so nothing here may call `setPointerCapture` on `#stage` — that would
  retarget every event to the stage and `netAt` would always return null.

A press that moved less than a few pixels is the pick; a second finger sets the
moved flag so a pinch can never end in a pick.

**The sidebar is one element in two places.** Below 640px the board wants the
whole viewport, so `#side` is *moved* into a modal `<dialog>` and moved back when
it closes, rather than duplicated. Moving the live node keeps the layer
checkboxes, the filter text and every listener intact; two copies would drift.
`#app>#side` / `#panel>#side` selectors do the rest, so no JS decides how it
looks.

---

## 7. How this was tested, and how to test changes

Rendering can look completely convincing while the *tracing* is wrong, so eyeballing
a board proves very little. Two things that actually catch errors:

**A known-answer board.** Hand-write a small Gerber set: two top traces, one of
them bridged to a bottom trace through a single drilled pad. Correct output is
2 nets, one spanning both sides with 1 stitched hole.

**A negative control.** The same board with the drill hole moved into open board
must give 3 unstitched nets. Without this, a bug that stitches everything to
everything still passes the positive test.

**Unit equivalence.** The same synthetic board written in inches must give a result
identical to the millimetre version. This is what the aperture-scaling bug (§3)
would have been caught by.

Beyond that: all six boards in the `NintendoPCBs` collection (KiCad `20171130`
through `20221018`, 239–3,145 track segments) and two EasyEDA Gerber sets — a
92 × 46 mm cart-reader adapter (64 nets, 192 stitched holes) and a 22 × 49 mm
RP2040 interposer (26 nets, 18 stitched holes).

One trap when reading console output during a session: the console buffer persists
across navigations, so errors from an earlier build of a same-named file keep
reappearing. Check the stack frames name functions that still exist before
believing them.

---

## 8. Deliberate limits

- **Two copper layers.** Inner layers of a 4-layer board parse but aren't drawn,
  and their nets look disconnected.
- **No bitmaps.** KiCad `(image …)` nodes are skipped.
- **`%SR%` step-repeat ignored** — a panelised Gerber set renders one copy.
- **`%IPNEG%` negative image polarity unsupported.**
- **Aperture macro primitives 6 and 7** (moiré, thermal) are skipped. A thermal
  relief drawn that way is missing, which could split a net that is really joined.
- **Zone fills are drawn without the `min_thickness` outset**, so pour edges sit a
  hair inside where KiCad draws them.

All of these warn in the sidebar when they're actually hit, rather than failing
silently.
