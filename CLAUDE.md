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

Reserve `popover="auto"` for non-modal UI (menus, tooltips, dropdowns) where the rest of the page should remain interactive.

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