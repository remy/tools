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
- Use `prefers-color-scheme` media query and/or a `[data-theme]` attribute on `<html>` for manual toggling.
- Define all colours as CSS custom properties in `:root` so themes can be swapped cleanly.

**Minimal theme pattern:**

```css
:root {
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

/* Manual toggle support */
[data-theme="light"] { /* light values */ }
[data-theme="dark"]  { /* dark values */  }
```

### 3. Each Project Lives in Its Own Directory

Create a subdirectory at the repo root named after the tool, using kebab-case:

```
repo-root/
└── my-new-tool/
    ├── index.html      ← required
    ├── style.css       ← optional (can be inline)
    └── script.js       ← optional (can be inline)
```

Keep the tool self-contained. Avoid referencing files outside the tool's directory.

### 4. Required Meta Tags in `index.html`

The index generator (`scripts/generate_index.py`) reads each tool's `index.html` to build the main listing page. Two meta tags are **required**:

```html
<meta name="description" content="One or two sentence description of what this tool does.">
<meta name="category" content="CategoryName">
```

Without these the tool will appear as "Uncategorized" and may have no description on the index page.

**Valid categories** (match existing ones or add a new one consistently):

| Category | Used for |
|---|---|
| `Demos` | API demonstrations, proof-of-concept pages |
| `Game` | Interactive games |
| `Home Assistant` | Tools that integrate with Home Assistant |
| `Immich` | Tools that integrate with Immich |
| `Utilities` | General-purpose tools and calculators |

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
  <meta name="category" content="Utilities">
  <title>Tool Name</title>
  <style>
    :root {
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
  </style>
</head>
<body>
  <div class="container">
    <h1>Tool Name</h1>
    <!-- content -->
  </div>
  <script>
    // vanilla JS only
  </script>
</body>
</html>
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

**Required CSS** (include in the project's `<style>`):

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

- Keep tools small and focused. A single `index.html` under 50 KB is the target.
- If a separate CSS or JS file genuinely improves maintainability (e.g. a complex module), that's fine — but do not split files just for the sake of it.
- External network requests from the tool itself (APIs, data fetches) are fine. External CSS/JS CDN dependencies are not.

---

## Summary Checklist for New Projects

- [ ] Directory created at repo root using kebab-case
- [ ] `index.html` present in the directory
- [ ] `<meta name="description">` present with a clear description
- [ ] `<meta name="category">` present with a valid category
- [ ] Dark **and** light mode implemented (via `prefers-color-scheme`)
- [ ] Mobile-first CSS (base styles for small screens, `@media (min-width:...)` for larger)
- [ ] No React, Vue, Svelte, or other UI frameworks
- [ ] No Tailwind, Bootstrap, or utility CSS libraries
- [ ] No external font or icon CDN imports
- [ ] `python scripts/generate_index.py` run before committing
- [ ] Root `index.html` and `projects.json` updated and committed
