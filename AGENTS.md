# AGENTS.md — Development Guide

This file describes the structure, conventions, and rules for building new tools in this collection. Read it before creating or modifying any project.

---

## What This Repo Is

A collection of standalone, self-contained web tools. Each tool lives in its own directory and is deployed as a static page. The root `index.html` is auto-generated from metadata found in each tool's `index.html`.

---

## Rules for New Projects

### 1. No React, No Tailwind

Do not use any UI frameworks or utility CSS libraries. Write plain HTML, CSS, and JavaScript.

- **CSS**: Use modern CSS — nesting, custom properties (variables), `@layer`, `color-mix()`, `:has()`, container queries, etc.
- **JS**: Vanilla JavaScript only. No bundlers, no npm, no build step (unless the project genuinely requires one, like `movies/`).
- **Fonts**: Use system font stacks. No web fonts loaded from external CDNs.

### 2. Mobile-First Design with Dark and Light Mode

- Write styles for mobile first, then add `@media (min-width: ...)` overrides for larger screens.
- Every project must support both dark and light colour schemes.
- **Follow the system setting.** The theme comes from the OS/browser light–dark control via `prefers-color-scheme` — nothing else.
- **Do not add a theme toggle.** A manual light/dark switch is not required and should not be built unless the author explicitly asks for one. Without an explicit request there is no toggle button, no `theme` value in `localStorage`, and no `?theme=` URL parameter — the system control is the only input.
- If a toggle *is* explicitly requested, layer it on top with a `[data-theme]` attribute on `<html>`, keeping `prefers-color-scheme` as the default when the attribute is absent.
- Define all colours as CSS custom properties in `:root` so themes can be swapped cleanly.
- Set `color-scheme: light dark` on `:root` so native controls, form fields, and scrollbars follow along too.

**Minimal theme pattern:**

```css
:root {
  color-scheme: light dark;

  --bg: #fafafa;
  --bg-secondary: #f4f4f5;
  --border: #d4d4d8;
  --text: #18181b;
  --text-secondary: #52525b;
  --accent: #2563eb;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #09090b;
    --bg-secondary: #18181b;
    --border: #3f3f46;
    --text: #fafafa;
    --text-secondary: #a1a1aa;
    --accent: #60a5fa;
  }
}
```

Every colour that differs between the two schemes belongs in this block as a custom property. Avoid one-off `body.light .thing { color: ... }` overrides scattered through the stylesheet — add a variable instead and give it a value in each scheme.

### 3. Each Project Lives in Its Own Directory

Create a subdirectory at the repo root named after the tool, using kebab-case:

```
repo-root/
└── my-new-tool/
    ├── index.html      ← required
    ├── style.css       ← preferred default
    └── script.js       ← preferred when JS is used
```

Keep the tool self-contained. Avoid referencing files outside the tool's directory.
Prefer smaller, focused files over one large file. Default to splitting HTML, CSS, and JS into separate files.
Inline `<style>`/`<script>` blocks should be treated as exceptions for very small throwaway prototypes only.

### 4. Required Meta Tags in `index.html`

The index generator (`scripts/generate_index.py`) reads each tool's `index.html` to build the main listing page. Two meta tags are **required**:

```html
<meta name="description" content="One or two sentence description of what this tool does.">
<meta name="category" content="CategoryName">
```

Without these the tool will appear as "Uncategorized" and may have no description on the index page.

**Valid categories** (match existing ones or add a new one consistently):

| Category          | Good fit when…                                                                                                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Developer Tools` | The primary user is a developer; the tool helps with code, data formats, APIs, dependencies, diffs, or hardware specs (e.g. JSON validator, package browser, merge tool, ESP32 comparison) |
| `Calculators`     | The tool takes numeric inputs and produces a computed result — rates, values, durations, or unit conversions (e.g. capacitor decoder, tax calculator, time adder)                          |
| `Game`            | The tool is an interactive game with scoring, winning, or challenge mechanics (e.g. quiz, puzzle, countdown numbers)                                                                       |
| `Home Assistant`  | The tool queries, debugs, or integrates with a Home Assistant instance or its config format                                                                                                |
| `Immich`          | The tool queries, manages, or integrates with an Immich photo library via its API                                                                                                          |
| `Productivity`    | The tool helps organise personal tasks, track progress, or plan real-world activities — not primarily a calculator or developer aid (e.g. cinema planner, reading tracker)                 |
| `Web Demos`       | The tool's main purpose is demonstrating a browser API or web platform feature, rather than solving a user problem (e.g. Popover API demo, Wake Lock demo)                                 |

**If you cannot confidently determine the category** from the tool's description and functionality during the agentic process, do not guess — ask the author:

> "Which category should I use for this tool? The options are: Developer Tools, Calculators, Game, Home Assistant, Immich, Productivity, Web Demos."

---

## HTML Boilerplate

Use this as the starting point for a new `index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="Short description of this tool.">
  <meta name="category" content="Developer Tools">
  <title>Tool Name</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div class="container">
    <h1>Tool Name</h1>
    <!-- content -->
  </div>
  <script src="script.js"></script>
  <script>navigator.serviceWorker?.register("/sw.js")</script>
</body>
</html>
```

**Companion `style.css` starter:**

```css
:root {
  color-scheme: light dark;

  --bg: #fafafa;
  --bg-secondary: #f4f4f5;
  --border: #d4d4d8;
  --text: #18181b;
  --text-secondary: #52525b;
  --accent: #2563eb;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #09090b;
    --bg-secondary: #18181b;
    --border: #3f3f46;
    --text: #fafafa;
    --text-secondary: #a1a1aa;
    --accent: #60a5fa;
  }
}

*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  background: var(--bg);
  color: var(--text);
  min-height: 100dvh;
  padding: 1rem;
}

/* Mobile-first layout — wider styles below */
.container {
  width: 100%;
  max-width: 48rem;
  margin-inline: auto;
}

@media (min-width: 640px) {
  body { padding: 2rem; }
}
```

**Companion `script.js` starter:**

```js
// vanilla JS only
```

---

## CSS Conventions

See `style-guide.md` for the full design system (colours, typography, spacing, components). Key points:

- Use **CSS nesting** instead of BEM or preprocessors.
- Use **CSS custom properties** for every colour and size that repeats.
- Prefer `rem` for font sizes and spacing; `px` is fine for borders and small fixed values.
- Use `dvh`/`svh` instead of `vh` for full-height layouts on mobile.
- Avoid `!important`. If you need it, restructure the selectors.

**Example of modern CSS nesting:**

```css
.card {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  padding: 1rem;

  & h2 {
    font-size: 1.25rem;
    margin-bottom: 0.5rem;
  }

  &:hover {
    border-color: var(--accent);
  }

  & .card-actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 1rem;
  }
}
```

---

## Code Snippet Blocks

When a project needs to show example code (e.g. a demo or reference page), use a `<pre class="code-hint"><code>` combo. The `<pre>` preserves whitespace and newlines natively; the inner `<code>` is purely semantic.

**HTML pattern:**

```html
<pre class="code-hint"><code><span class="tag">&lt;button</span> <span class="attr">popovertarget</span>=<span class="val">"my-pop"</span><span class="tag">&gt;</span>Open<span class="tag">&lt;/button&gt;</span>
<span class="tag">&lt;div</span> <span class="attr">id</span>=<span class="val">"my-pop"</span> <span class="attr">popover</span><span class="tag">&gt;</span>Hello<span class="tag">&lt;/div&gt;</span></code></pre>
```

- Start content **immediately** after `<code>` — no newline, or a blank line will appear at the top.
- End content **immediately** before `</code></pre>` — same reason.
- Inline `<span>` classes for syntax colouring: `.tag`, `.attr`, `.val`, `.kw`, `.cm`.

**Required CSS** (include in `style.css`; inline `<style>` only if truly necessary):

```css
.code-hint {
  margin-top: 1rem;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.75rem 1rem;
  font-size: 0.82rem;
  color: var(--text-secondary);
  font-family: 'Cascadia Code', 'Fira Code', ui-monospace, monospace;
  overflow-x: auto;
  line-height: 1.7;

  /* Reset inline <code> styling so it doesn't inherit borders/padding */
  & code {
    background: none;
    border: none;
    border-radius: 0;
    padding: 0;
    font-size: inherit;
    color: inherit;
  }

  & .tag  { color: #f87171; }
  & .attr { color: #60a5fa; }
  & .val  { color: #86efac; }
  & .kw   { color: #a78bfa; }
  & .cm   { color: #6b7280; }
}
```

---

## Adding a Project to the Index

The index is maintained automatically. After creating `my-new-tool/index.html` with the required meta tags, run:

```bash
python scripts/generate_index.py
```

This will:
1. Discover all directories containing an `index.html`
2. Read the `<title>`, `meta[name=description]`, and `meta[name=category]` from each
3. Update `projects.json`
4. Regenerate the `<!-- PROJECTS:START --> … <!-- PROJECTS:END -->` section in the root `index.html`

Commit both the new tool directory and the updated `projects.json` / root `index.html`.

---

## File Size & Dependency Policy

- Keep tools small and focused.
- Prefer many smaller files with clear responsibilities over one large file.
- Default structure is `index.html` + `style.css` + `script.js`; split further (for example, `trace.js`, `ui.js`) when complexity grows.
- As a guideline, keep individual files compact and readable (never over 1000 lines of code) rather than allowing one file to balloon.
- External network requests from the tool itself (APIs, data fetches) are fine. External CSS/JS CDN dependencies are not.

---

## Summary Checklist for New Projects

- [ ] Directory created at repo root using kebab-case
- [ ] `index.html` present in the directory
- [ ] `style.css` present in the directory (preferred default)
- [ ] `script.js` present when JavaScript is needed
- [ ] `<meta name="description">` present with a clear description
- [ ] `<meta name="category">` present with a valid category
- [ ] Dark **and** light mode implemented, following the system setting via `prefers-color-scheme` (no theme toggle unless explicitly requested)
- [ ] Mobile-first CSS (base styles for small screens, `@media (min-width:...)` for larger)
- [ ] No React, Vue, Svelte, or other UI frameworks
- [ ] No Tailwind, Bootstrap, or utility CSS libraries
- [ ] No external font or icon CDN imports
- [ ] Service worker registration added before `</body>`: `<script>navigator.serviceWorker?.register("/sw.js")</script>`
- [ ] Root `index.html` and `projects.json` updated and committed
