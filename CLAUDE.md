# CLAUDE.md

## Service Worker

Every `index.html` in this project (root and each tool) must include the following line just before `</body>`:

```html
<script>navigator.serviceWorker?.register("/sw.js")</script>
```

When creating a new tool, always add this line. The service worker (`sw.js` at the repo root) provides offline support using a network-first strategy with cache fallback. Its version is stamped with the git commit SHA by the GitHub Actions workflow on each push to `main`.

## Shared CSS

Two stylesheets at the repo root hold the common CSS so it is not copied
into every tool. **Always link one of them** rather than re-declaring the
colour/spacing tokens, CSS reset, `[hidden]` rule or body defaults:

- **`/shared.css`** — the full design system: tokens, themes, reset,
  base element styles **and** the component library (`.btn`, `.card`,
  `.alert`, `.modal`, `.table`, utilities, …). Use this for **new tools**.
  It is the extracted, single source of `kitchen-sink.html` /
  `style-guide.md`.
- **`/shared-base.css`** — minimal, unopinionated: tokens, themes, reset,
  `[hidden]` and body defaults only (no heading fonts, link styling,
  focus rings or components). Use this for tools that have their own
  bespoke look and only want the shared foundation without inheriting
  opinionated component/base styles.

Link the shared file **before** any tool-specific stylesheet so the
tool's own rules win via the cascade:

```html
<link rel="stylesheet" href="/shared.css">       <!-- or /shared-base.css -->
<link rel="stylesheet" href="style.css">
```

For new tools, prefer `/shared.css` and the `--colour-*` / `--space-*`
tokens it defines; only override tokens in a local `:root` when the tool
genuinely needs a different palette.

## Hidden attribute

The `[hidden] { display: none !important; }` rule (needed because
Firefox does not hide elements when a CSS `display` value like `flex` or
`grid` overrides the attribute) is provided by **both** `/shared.css`
and `/shared-base.css`. Linking either one satisfies this requirement —
do not duplicate the rule in the tool's own stylesheet. If a tool for
some reason links neither shared file, it must still include this rule
near the top of its stylesheet (after the reset/box-sizing rules).

## Modal dialogs

For modal-type UI (command palettes, modals, drawers, confirmations) use the native `<dialog>` element opened with `.showModal()` rather than the popover API. `<dialog>` makes the rest of the page `inert` automatically (so background content is not focusable or interactive), is exposed correctly to assistive technology, traps focus, and provides built-in Escape-to-dismiss.

Wire up backdrop click-to-dismiss explicitly — `<dialog>` does not do this for you:

```js
dialog.addEventListener('click', (e) => {
  if (e.target === dialog) dialog.close();
});
```

This works as long as the dialog has no padding (or the inner content fills it), so the only clicks whose `target` is the dialog itself are the ones on the backdrop.

Reserve `popover="auto"` for non-modal UI (menus, tooltips, dropdowns) where the rest of the page should remain interactive.

## Web Components

If HTML or CSS is included in the web component code, it should include a command before the template string as `/* HTML */` and `/* CSS */` (the spaces are important) for syntax highlighting.

The script should ALWAYS end in `.wc.js` - this way it can be served with CORS headers.