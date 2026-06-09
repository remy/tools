# CLAUDE.md

## Service Worker

Every `index.html` in this project (root and each tool) must include the following line just before `</body>`:

```html
<script>navigator.serviceWorker?.register("/sw.js")</script>
```

When creating a new tool, always add this line. The service worker (`sw.js` at the repo root) provides offline support using a network-first strategy with cache fallback. Its version is stamped with the git commit SHA by the GitHub Actions workflow on each push to `main`.

## Hidden attribute

Every tool's CSS must include the following rule to ensure the `hidden` attribute works reliably across browsers (Firefox does not hide elements when a CSS `display` property like `flex` or `grid` overrides it):

```css
[hidden] {
  display: none !important;
}
```

Always add this rule near the top of the stylesheet (after the reset/box-sizing rules).

## Modal dialogs

For modal-type UI (command palettes, modals, drawers, confirmations) use the native `<dialog>` element opened with `.showModal()` rather than the popover API. `<dialog>` makes the rest of the page `inert` automatically (so background content is not focusable or interactive), is exposed correctly to assistive technology, traps focus, and provides built-in Escape-to-dismiss.

Wire up backdrop click-to-dismiss explicitly — `<dialog>` does not do this for you:

```js
dialog.addEventListener('click', (e) => {
  if (e.target === dialog) dialog.close();
});
```

This works as long as the dialog has no padding (or the inner content fills it), so the only clicks whose `target` is the dialog itself are the ones on the backdrop.

On mobile / narrow viewports, modals must fill the screen rather than float as a centred card or partial sheet. Add a media query that makes the `<dialog>` cover the full viewport with no rounded corners:

```css
@media (max-width: 639px) {
  dialog {
    inset: 0;
    margin: 0;
    width: 100vw;
    height: 100dvh;
    max-width: 100vw;
    max-height: 100dvh;
    border-radius: 0;
  }
}
```

Reserve `popover="auto"` for non-modal UI (menus, tooltips, dropdowns) where the rest of the page should remain interactive.

## Shared icons

Reusable icons live in `/icons` at the repo root (e.g. `/icons/settings.svg`) so every tool references the same asset. They are authored with `fill="currentColor"` and a `viewBox`.

Render them with a CSS mask rather than inline `<svg>` or `<img>` — masking lets the icon take `currentColor`, so it inherits text colour and adapts to light/dark mode (an `<img>` can't be recoloured by CSS):

```css
.icon-mask {
  display: inline-block;
  background-color: currentColor;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  -webkit-mask-position: center;
  mask-position: center;
  -webkit-mask-size: contain;
  mask-size: contain;
}

.icon-settings {
  width: 1.25rem;
  height: 1.25rem;
  -webkit-mask-image: url(/icons/settings.svg);
  mask-image: url(/icons/settings.svg);
}
```

```html
<span class="icon-mask icon-settings" aria-hidden="true"></span>
```

## Settings icon

Whenever a tool exposes a settings entry point, the trigger must be an icon button using a recognisable settings (cog/gear) icon — not a text label or some other glyph. Give it an `aria-label="Settings"` and use the shared `/icons/settings.svg` via the mask technique above:

```html
<button class="action-btn" id="btn-settings" aria-label="Settings">
  <span class="icon-mask icon-settings" aria-hidden="true"></span>
</button>
```

## Expandable sections

For expand/collapse UI (accordion panels, "show more", FAQ items, anything with a header that toggles a body) use the native `<details>`/`<summary>` element rather than wiring up a click handler and toggling `hidden` yourself. It handles keyboard activation, ARIA state, the `open` attribute, and emits a `toggle` event when the state changes — all for free.

```html
<details>
  <summary>Header content</summary>
  <div>Body content</div>
</details>
```

Strip the default disclosure marker in CSS:

```css
summary {
  list-style: none;
  &::-webkit-details-marker { display: none; }
}
```

Drive chevron / arrow rotation from `[open]` on the parent rather than tracking state in JS:

```css
details[open] .chevron { transform: rotate(180deg); }
```

If you need to preserve open state across a re-render, capture the open category keys into a `Set`, then set `details.open = true` when re-rendering and listen for the `toggle` event to keep the set in sync.

## Web Components

If HTML or CSS is included in the web component code, it should include a command before the template string as `/* HTML */` and `/* CSS */` (the spaces are important) for syntax highlighting.

The script should ALWAYS end in `.wc.js` - this way it can be served with CORS headers.