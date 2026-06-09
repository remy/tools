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

## Settings icon

Whenever a tool exposes a settings entry point, the trigger must be an icon button using a recognisable settings (cog/gear) icon — not a text label or some other glyph. Give it an `aria-label="Settings"`. A consistent inline SVG cog to reuse:

```html
<button class="action-btn" id="btn-settings" aria-label="Settings">
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="3.25" stroke="currentColor" stroke-width="1.6" />
    <path d="M19.4 13a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
      stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
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