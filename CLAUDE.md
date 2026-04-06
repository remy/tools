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
