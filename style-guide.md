# Style Guide for Tools & Demos

## Core Principles

- **No frameworks**: Pure HTML, CSS, and vanilla JavaScript only
- **No external libraries**: No Tailwind, React, Storybook, or third-party dependencies
- **Mobile-first**: Design for mobile, enhance for desktop
- **Minimal padding**: Space-efficient for mobile screens
- **Theme support**: Colour variations through CSS custom properties

## Typography

### Font Stack

**Body text:**
```css
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
```

**Headings:**
```css
font-family: Georgia, "Times New Roman", Times, serif;
font-weight: 700;
letter-spacing: -0.01em;
```

**Monospace:**
```css
/* Option 1: System monospace (recommended) */
font-family: ui-monospace, "SF Mono", "Cascadia Code", "Cascadia Mono", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;

/* Option 2: Readable alternative */
font-family: "Berkeley Mono", "SF Mono", Menlo, Monaco, "Cascadia Code", Consolas, monospace;
```

### Type Scale
- **Body**: 16px / 1rem (line-height: 1.5)
- **Small**: 14px / 0.875rem (line-height: 1.4)
- **Tiny**: 12px / 0.75rem (line-height: 1.3)
- **H1**: 28px / 1.75rem (line-height: 1.2, weight: 700)
- **H2**: 24px / 1.5rem (line-height: 1.2, weight: 600)
- **H3**: 20px / 1.25rem (line-height: 1.3, weight: 600)
- **H4**: 18px / 1.125rem (line-height: 1.3, weight: 600)

### Typography Rules
- Use `rem` units for font sizes
- Headings should have `margin-top: 1.5em` and `margin-bottom: 0.5em`
- Paragraphs: `margin-bottom: 1em`
- Code: Use monospace font stack (see Typography section above)

## Colour System

### Theme Structure
Use CSS custom properties for theming. Define at `:root` level.

### Default Theme
```css
:root {
  /* Primary colours - main brand colour */
  --colour-primary: #2563eb;
  --colour-primary-hover: #1d4ed8;
  --colour-primary-light: #dbeafe;
  
  /* Accent colours - secondary emphasis */
  --colour-accent: #0891b2;
  --colour-accent-hover: #0e7490;
  --colour-accent-light: #cffafe;
  
  /* Tertiary colours - third level emphasis */
  --colour-tertiary: #f59e0b;
  --colour-tertiary-hover: #d97706;
  --colour-tertiary-light: #fef3c7;
  
  /* Neutral colours */
  --colour-bg: #fafafa;
  --colour-bg-secondary: #f4f4f5;
  --colour-bg-tertiary: #e4e4e7;
  --colour-border: #d4d4d8;
  --colour-text: #18181b;
  --colour-text-secondary: #52525b;
  --colour-text-tertiary: #a1a1aa;
  
  /* Semantic colours */
  --colour-success: #10b981;
  --colour-success-light: #d1fae5;
  --colour-warning: #f59e0b;
  --colour-warning-light: #fef3c7;
  --colour-error: #ef4444;
  --colour-error-light: #fee2e2;
  --colour-info: #3b82f6;
  --colour-info-light: #dbeafe;
  
  /* UI elements */
  --colour-input-border: #d4d4d8;
  --colour-input-focus: #2563eb;
  --colour-shadow: rgba(0, 0, 0, 0.1);
  
  /* Content blocks */
  --colour-block-bg: #ffffff;
  --colour-block-border: #e4e4e7;
}
```

### Dark Theme
```css
[data-theme="dark"] {
  --colour-bg: #0a0a0a;
  --colour-bg-secondary: #171717;
  --colour-bg-tertiary: #262626;
  --colour-border: #404040;
  --colour-text: #fafafa;
  --colour-text-secondary: #a1a1aa;
  --colour-text-tertiary: #71717a;
  --colour-input-border: #404040;
  --colour-shadow: rgba(0, 0, 0, 0.5);
  --colour-block-bg: #171717;
  --colour-block-border: #262626;
}
```

### Alternative Themes
Create theme variations by changing primary, accent, and tertiary colours:

```css
[data-theme="orange"] {
  --colour-primary: #ea580c;
  --colour-primary-hover: #c2410c;
  --colour-primary-light: #ffedd5;
  --colour-accent: #f59e0b;
  --colour-accent-hover: #d97706;
  --colour-accent-light: #fef3c7;
}

[data-theme="green"] {
  --colour-primary: #059669;
  --colour-primary-hover: #047857;
  --colour-primary-light: #d1fae5;
  --colour-accent: #10b981;
  --colour-accent-hover: #059669;
  --colour-accent-light: #d1fae5;
}
```

## Spacing System

Use consistent spacing scale with CSS custom properties:

```css
:root {
  --space-xs: 0.25rem;   /* 4px */
  --space-sm: 0.5rem;    /* 8px */
  --space-md: 0.75rem;   /* 12px */
  --space-lg: 1rem;      /* 16px */
  --space-xl: 1.5rem;    /* 24px */
  --space-2xl: 2rem;     /* 32px */
  --space-3xl: 3rem;     /* 48px */
}
```

### Mobile Spacing Rules
- **Body padding**: `var(--space-lg)` (16px)
- **Section spacing**: `var(--space-xl)` (24px) between sections
- **Element spacing**: `var(--space-sm)` to `var(--space-md)` between related elements
- **Increase spacing on desktop**: Use media queries to add more breathing room

## Layout

### Container
```css
.container {
  width: 100%;
  max-width: 1200px;
  margin-inline: auto;
  padding-inline: var(--space-lg);
}

@media (min-width: 768px) {
  .container {
    padding-inline: var(--space-xl);
  }
}
```

### Grid System
Use CSS Grid for layouts, not frameworks:

```css
.grid {
  display: grid;
  gap: var(--space-lg);
  grid-template-columns: 1fr;
}

@media (min-width: 640px) {
  .grid-sm-2 {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (min-width: 768px) {
  .grid-md-2 {
    grid-template-columns: repeat(2, 1fr);
  }
  .grid-md-3 {
    grid-template-columns: repeat(3, 1fr);
  }
}
```

### Flexbox Patterns
```css
.flex {
  display: flex;
  gap: var(--space-md);
}

.flex-col {
  flex-direction: column;
}

.flex-center {
  align-items: center;
  justify-content: center;
}

.flex-between {
  justify-content: space-between;
  align-items: center;
}
```

## Components

### Buttons

```css
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  padding: 0.625rem var(--space-lg);
  font-size: 1rem;
  font-weight: 500;
  line-height: 1;
  border: none;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: all 0.15s ease;
  text-decoration: none;
}

.btn-primary {
  background: var(--colour-primary);
  color: white;
}

.btn-primary:hover {
  background: var(--colour-primary-hover);
}

.btn-secondary {
  background: var(--colour-bg-secondary);
  color: var(--colour-text);
  border: 1px solid var(--colour-border);
}

.btn-secondary:hover {
  background: var(--colour-border);
}

.btn-accent {
  background: var(--colour-accent);
  color: white;
}

.btn-accent:hover {
  background: var(--colour-accent-hover);
}

.btn-tertiary {
  background: var(--colour-tertiary);
  color: white;
}

.btn-tertiary:hover {
  background: var(--colour-tertiary-hover);
}

.btn-ghost {
  background: transparent;
  color: var(--colour-text);
}

.btn-ghost:hover {
  background: var(--colour-bg-secondary);
}

.btn-sm {
  padding: 0.375rem 0.75rem;
  font-size: 0.875rem;
}

.btn-lg {
  padding: 0.875rem 1.5rem;
  font-size: 1.125rem;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

### Input Fields

```css
.input {
  width: 100%;
  padding: var(--space-sm) var(--space-md);
  font-size: 1rem;
  line-height: 1.5;
  color: var(--colour-text);
  background: var(--colour-bg);
  border: 1px solid var(--colour-input-border);
  border-radius: 0.375rem;
  transition: border-color 0.15s ease;
}

.input:focus {
  outline: none;
  border-color: var(--colour-input-focus);
  box-shadow: 0 0 0 3px var(--colour-primary-light);
}

.input::placeholder {
  color: var(--colour-text-tertiary);
}

.input:disabled {
  background: var(--colour-bg-secondary);
  cursor: not-allowed;
}

textarea.input {
  resize: vertical;
  min-height: 5rem;
}
```

### Form Groups

```css
.form-group {
  margin-bottom: var(--space-lg);
}

.form-label {
  display: block;
  margin-bottom: var(--space-xs);
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--colour-text);
}

.form-hint {
  display: block;
  margin-top: var(--space-xs);
  font-size: 0.875rem;
  color: var(--colour-text-secondary);
}

.form-error {
  display: block;
  margin-top: var(--space-xs);
  font-size: 0.875rem;
  color: var(--colour-error);
}
```

### Cards

```css
.card {
  background: var(--colour-block-bg);
  border: 1px solid var(--colour-block-border);
  border-radius: 0.5rem;
  padding: var(--space-lg);
  box-shadow: 0 1px 3px var(--colour-shadow);
}

.card-header {
  margin-bottom: var(--space-md);
  padding-bottom: var(--space-md);
  border-bottom: 1px solid var(--colour-border);
}

.card-title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
}

.card-body {
  margin-bottom: var(--space-md);
}

.card-footer {
  margin-top: var(--space-md);
  padding-top: var(--space-md);
  border-top: 1px solid var(--colour-border);
}
```

### Content Blocks

For main content areas, articles, and reading content:

```css
.content-block {
  background: var(--colour-block-bg);
  border: 1px solid var(--colour-block-border);
  border-radius: 0.5rem;
  padding: var(--space-xl);
  box-shadow: 0 1px 2px var(--colour-shadow);
}

@media (min-width: 768px) {
  .content-block {
    padding: var(--space-2xl);
  }
}

/* Article/reading content */
.prose {
  max-width: 65ch;
  line-height: 1.7;
}

.prose h1,
.prose h2,
.prose h3 {
  margin-top: 1.5em;
  margin-bottom: 0.5em;
  line-height: 1.3;
}

.prose h1:first-child,
.prose h2:first-child,
.prose h3:first-child {
  margin-top: 0;
}

.prose p {
  margin-bottom: 1.25em;
}

.prose ul,
.prose ol {
  margin-bottom: 1.25em;
  padding-left: 1.5em;
}

.prose li {
  margin-bottom: 0.5em;
}

.prose blockquote {
  margin: 1.5em 0;
  padding-left: var(--space-lg);
  border-left: 4px solid var(--colour-border);
  color: var(--colour-text-secondary);
  font-style: italic;
}

.prose img {
  margin: 1.5em 0;
  border-radius: 0.5rem;
}

.prose hr {
  margin: 2em 0;
  border: none;
  border-top: 1px solid var(--colour-border);
}

/* Section blocks with clear visual separation */
.section-block {
  background: var(--colour-block-bg);
  border-radius: 0.5rem;
  padding: var(--space-lg);
  margin-bottom: var(--space-xl);
}

@media (min-width: 768px) {
  .section-block {
    padding: var(--space-xl);
  }
}

.section-block-title {
  margin: 0 0 var(--space-lg) 0;
  font-size: 1.25rem;
  font-weight: 600;
  padding-bottom: var(--space-sm);
  border-bottom: 2px solid var(--colour-border);
}

/* Well - subtle inset style for nested content */
.well {
  background: var(--colour-bg-secondary);
  border: 1px solid var(--colour-border);
  border-radius: 0.375rem;
  padding: var(--space-md);
}

.well-lg {
  padding: var(--space-lg);
}
```

### Alerts

```css
.alert {
  padding: var(--space-md);
  border-radius: 0.375rem;
  border-left: 4px solid;
  margin-bottom: var(--space-lg);
}

.alert-success {
  background: var(--colour-success-light);
  border-color: var(--colour-success);
  color: #065f46;
}

.alert-warning {
  background: var(--colour-warning-light);
  border-color: var(--colour-warning);
  color: #92400e;
}

.alert-error {
  background: var(--colour-error-light);
  border-color: var(--colour-error);
  color: #991b1b;
}

.alert-info {
  background: var(--colour-info-light);
  border-color: var(--colour-info);
  color: #1e40af;
}
```

### Badges

```css
.badge {
  display: inline-flex;
  align-items: center;
  padding: var(--space-xs) var(--space-sm);
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1;
  border-radius: 0.25rem;
}

.badge-primary {
  background: var(--colour-primary-light);
  color: var(--colour-primary);
}

.badge-accent {
  background: var(--colour-accent-light);
  color: var(--colour-accent);
}

.badge-tertiary {
  background: var(--colour-tertiary-light);
  color: var(--colour-tertiary);
}

.badge-success {
  background: var(--colour-success-light);
  color: var(--colour-success);
}

.badge-warning {
  background: var(--colour-warning-light);
  color: var(--colour-warning);
}

.badge-error {
  background: var(--colour-error-light);
  color: var(--colour-error);
}
```

### Lists

```css
.list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.list-item {
  padding: var(--space-md);
  border-bottom: 1px solid var(--colour-border);
}

.list-item:last-child {
  border-bottom: none;
}

.list-item:hover {
  background: var(--colour-bg-secondary);
}
```

### Tables

```css
.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.table th {
  padding: var(--space-md);
  text-align: left;
  font-weight: 600;
  color: var(--colour-text);
  background: var(--colour-bg-secondary);
  border-bottom: 2px solid var(--colour-border);
}

.table td {
  padding: var(--space-md);
  border-bottom: 1px solid var(--colour-border);
}

.table tr:last-child td {
  border-bottom: none;
}

.table tr:hover {
  background: var(--colour-bg-secondary);
}

/* Mobile: Stack tables */
@media (max-width: 639px) {
  .table-responsive {
    display: block;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
}
```

### Checkboxes and Radio Buttons

```css
.checkbox,
.radio {
  display: inline-flex;
  align-items: center;
  gap: var(--space-sm);
  cursor: pointer;
}

.checkbox input[type="checkbox"],
.radio input[type="radio"] {
  width: 1rem;
  height: 1rem;
  cursor: pointer;
  accent-color: var(--colour-primary);
}
```

### Toggle Switch

```css
.toggle {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
}

.toggle input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  cursor: pointer;
  inset: 0;
  background: var(--colour-border);
  border-radius: 24px;
  transition: 0.2s;
}

.toggle-slider::before {
  position: absolute;
  content: "";
  height: 18px;
  width: 18px;
  left: 3px;
  bottom: 3px;
  background: white;
  border-radius: 50%;
  transition: 0.2s;
}

.toggle input:checked + .toggle-slider {
  background: var(--colour-primary);
}

.toggle input:checked + .toggle-slider::before {
  transform: translateX(20px);
}
```

### Select Dropdown

```css
.select {
  position: relative;
  display: block;
}

.select select {
  width: 100%;
  padding: var(--space-sm) var(--space-md);
  padding-right: var(--space-2xl);
  font-size: 1rem;
  color: var(--colour-text);
  background: var(--colour-bg);
  border: 1px solid var(--colour-input-border);
  border-radius: 0.375rem;
  cursor: pointer;
  appearance: none;
}

.select::after {
  content: "▼";
  position: absolute;
  right: var(--space-md);
  top: 50%;
  transform: translateY(-50%);
  pointer-events: none;
  font-size: 0.75rem;
  color: var(--colour-text-secondary);
}
```

### Loading Spinner

```css
.spinner {
  width: 2rem;
  height: 2rem;
  border: 3px solid var(--colour-border);
  border-top-color: var(--colour-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.spinner-sm {
  width: 1rem;
  height: 1rem;
  border-width: 2px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
```

### Modal/Dialog

```css
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-lg);
  z-index: 1000;
}

.modal {
  background: var(--colour-bg);
  border-radius: 0.5rem;
  max-width: 32rem;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
}

.modal-header {
  padding: var(--space-lg);
  border-bottom: 1px solid var(--colour-border);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
}

.modal-close {
  background: transparent;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  padding: 0;
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--colour-text-secondary);
}

.modal-body {
  padding: var(--space-lg);
}

.modal-footer {
  padding: var(--space-lg);
  border-top: 1px solid var(--colour-border);
  display: flex;
  gap: var(--space-sm);
  justify-content: flex-end;
}
```

## Utilities

### Display

```css
.hidden { display: none; }
.block { display: block; }
.inline { display: inline; }
.inline-block { display: inline-block; }
.flex { display: flex; }
.grid { display: grid; }
```

### Text Alignment

```css
.text-left { text-align: left; }
.text-center { text-align: center; }
.text-right { text-align: right; }
```

### Text Styles

```css
.font-bold { font-weight: 700; }
.font-semibold { font-weight: 600; }
.font-medium { font-weight: 500; }
.font-normal { font-weight: 400; }

.text-sm { font-size: 0.875rem; }
.text-lg { font-size: 1.125rem; }
.text-xl { font-size: 1.25rem; }

.uppercase { text-transform: uppercase; }
.lowercase { text-transform: lowercase; }
.capitalize { text-transform: capitalize; }
```

### Colour Utilities

```css
.text-primary { color: var(--colour-primary); }
.text-accent { color: var(--colour-accent); }
.text-tertiary { color: var(--colour-tertiary); }
.text-secondary { color: var(--colour-text-secondary); }
.text-success { color: var(--colour-success); }
.text-warning { color: var(--colour-warning); }
.text-error { color: var(--colour-error); }

.bg-primary { background: var(--colour-primary); color: white; }
.bg-accent { background: var(--colour-accent); color: white; }
.bg-tertiary { background: var(--colour-tertiary); color: white; }
.bg-secondary { background: var(--colour-bg-secondary); }
.bg-block { background: var(--colour-block-bg); }
```

### Spacing Utilities

```css
.m-0 { margin: 0; }
.mt-sm { margin-top: var(--space-sm); }
.mt-md { margin-top: var(--space-md); }
.mt-lg { margin-top: var(--space-lg); }
.mb-sm { margin-bottom: var(--space-sm); }
.mb-md { margin-bottom: var(--space-md); }
.mb-lg { margin-bottom: var(--space-lg); }

.p-0 { padding: 0; }
.p-sm { padding: var(--space-sm); }
.p-md { padding: var(--space-md); }
.p-lg { padding: var(--space-lg); }
```

### Width

```css
.w-full { width: 100%; }
.w-auto { width: auto; }
.max-w-sm { max-width: 24rem; }
.max-w-md { max-width: 28rem; }
.max-w-lg { max-width: 32rem; }
.max-w-xl { max-width: 36rem; }
```

### Borders

```css
.border { border: 1px solid var(--colour-border); }
.border-top { border-top: 1px solid var(--colour-border); }
.border-bottom { border-bottom: 1px solid var(--colour-border); }
.rounded { border-radius: 0.375rem; }
.rounded-lg { border-radius: 0.5rem; }
.rounded-full { border-radius: 9999px; }
```

### Shadow

```css
.shadow-sm {
  box-shadow: 0 1px 2px var(--colour-shadow);
}

.shadow {
  box-shadow: 0 1px 3px var(--colour-shadow);
}

.shadow-lg {
  box-shadow: 0 10px 15px -3px var(--colour-shadow);
}
```

## Responsive Design

### Breakpoints

```css
/* Mobile first - base styles above */

/* Small devices (landscape phones, 640px and up) */
@media (min-width: 640px) {
  /* sm: styles */
}

/* Medium devices (tablets, 768px and up) */
@media (min-width: 768px) {
  /* md: styles */
}

/* Large devices (desktops, 1024px and up) */
@media (min-width: 1024px) {
  /* lg: styles */
}

/* Extra large devices (large desktops, 1280px and up) */
@media (min-width: 1280px) {
  /* xl: styles */
}
```

### Mobile-First Padding Pattern

```css
/* Mobile: Minimal padding */
.section {
  padding: var(--space-lg);
}

/* Tablet and up: More breathing room */
@media (min-width: 768px) {
  .section {
    padding: var(--space-2xl);
  }
}

/* Desktop: Maximum comfort */
@media (min-width: 1024px) {
  .section {
    padding: var(--space-3xl);
  }
}
```

## Base Styles

### CSS Reset

```css
*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html {
  -webkit-text-size-adjust: 100%;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 16px;
  line-height: 1.5;
  color: var(--colour-text);
  background: var(--colour-bg);
}

img,
picture,
video,
canvas,
svg {
  display: block;
  max-width: 100%;
}

input,
button,
textarea,
select {
  font: inherit;
}

button {
  cursor: pointer;
}

a {
  color: var(--colour-primary);
  text-decoration: underline;
}

a:hover {
  color: var(--colour-primary-hover);
}

code,
pre {
  font-family: ui-monospace, "SF Mono", "Cascadia Code", "Cascadia Mono", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}

pre {
  padding: var(--space-md);
  background: var(--colour-bg-secondary);
  border-radius: 0.375rem;
  overflow-x: auto;
}

code {
  padding: var(--space-xs);
  background: var(--colour-bg-secondary);
  border-radius: 0.25rem;
  font-size: 0.875em;
}

pre code {
  padding: 0;
  background: transparent;
}
```

## Accessibility

### Focus States

Always provide visible focus indicators:

```css
*:focus {
  outline: 2px solid var(--colour-primary);
  outline-offset: 2px;
}

button:focus,
a:focus,
input:focus,
select:focus,
textarea:focus {
  outline: 2px solid var(--colour-primary);
  outline-offset: 2px;
}
```

### Screen Reader Only Content

```css
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}
```

### ARIA Labels

Always include appropriate ARIA attributes:
- `aria-label` for icon-only buttons
- `aria-describedby` for input hints
- `role` attributes for custom components
- `aria-hidden` for decorative elements

## JavaScript Patterns

### Event Handling

```javascript
// Use event delegation
document.addEventListener('click', (e) => {
  if (e.target.matches('.btn-delete')) {
    // Handle delete
  }
});

// Debounce for input events
function debounce(fn, delay = 300) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

const handleSearch = debounce((value) => {
  // Search logic
}, 300);
```

### State Management

```javascript
// Simple state object
const state = {
  items: [],
  filter: 'all',
  theme: 'default'
};

// Update and render
function setState(updates) {
  Object.assign(state, updates);
  render();
}

// Persist to localStorage
function saveState() {
  localStorage.setItem('appState', JSON.stringify(state));
}

function loadState() {
  const saved = localStorage.getItem('appState');
  return saved ? JSON.parse(saved) : null;
}
```

### Theme Switching

```javascript
function setTheme(themeName) {
  document.documentElement.setAttribute('data-theme', themeName);
  localStorage.setItem('theme', themeName);
}

// Load saved theme on page load
const savedTheme = localStorage.getItem('theme') || 'default';
setTheme(savedTheme);
```

## File Structure

Organize projects like this:

```
project/
├── index.html
├── css/
│   ├── reset.css
│   ├── variables.css
│   ├── components.css
│   └── utilities.css
├── js/
│   ├── app.js
│   └── utils.js
└── assets/
    └── (images, icons, etc.)
```

Or for single-file demos:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tool Name</title>
  <style>
    /* All styles here */
  </style>
</head>
<body>
  <!-- HTML here -->
  <script>
    // JavaScript here
  </script>
</body>
</html>
```

## HTML Template

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="Tool description">
  <title>Tool Name</title>
  <style>
    /* Include CSS custom properties and base styles */
    :root {
      /* Colour system */
      --colour-primary: #2563eb;
      --colour-bg: #ffffff;
      --colour-text: #111827;
      /* Spacing */
      --space-sm: 0.5rem;
      --space-md: 0.75rem;
      --space-lg: 1rem;
      /* etc. */
    }
    
    /* Reset and base styles */
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: var(--colour-text);
      background: var(--colour-bg);
      line-height: 1.5;
    }
    
    /* Component styles */
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>Tool Name</h1>
    </header>
    <main>
      <!-- Content -->
    </main>
    <footer>
      <!-- Footer if needed -->
    </footer>
  </div>
  
  <script>
    // JavaScript
  </script>
</body>
</html>
```

## Best Practices

1. **Always mobile-first**: Write base styles for mobile, add complexity with media queries
2. **Semantic HTML**: Use appropriate elements (`<button>`, `<nav>`, `<article>`, etc.)
3. **Progressive enhancement**: Start with working HTML, enhance with CSS and JS
4. **Touch targets**: Minimum 44×44px for interactive elements on mobile
5. **Readable text**: Minimum 16px font size, good contrast ratios
6. **Consistent spacing**: Use the spacing scale, don't create arbitrary values
7. **Theme-aware**: Always use CSS custom properties for colours
8. **Accessible forms**: Labels, hints, error messages, proper ARIA
9. **Performance**: Minimise reflows, use CSS transforms for animations
10. **No inline styles**: Keep all CSS in `<style>` blocks or external files

## Common Patterns

### Loading States

```javascript
function showLoading() {
  button.disabled = true;
  button.innerHTML = '<span class="spinner spinner-sm"></span> Loading...';
}

function hideLoading() {
  button.disabled = false;
  button.innerHTML = 'Submit';
}
```

### Error Handling

```javascript
function showError(message) {
  const alert = document.createElement('div');
  alert.className = 'alert alert-error';
  alert.textContent = message;
  container.prepend(alert);
  
  setTimeout(() => alert.remove(), 5000);
}
```

### Form Validation

```javascript
function validateForm(formData) {
  const errors = {};
  
  if (!formData.email) {
    errors.email = 'Email is required';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
    errors.email = 'Invalid email format';
  }
  
  return Object.keys(errors).length === 0 ? null : errors;
}
```

### API Calls

```javascript
async function fetchData(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Network response was not ok');
    return await response.json();
  } catch (error) {
    showError('Failed to load data');
    console.error('Fetch error:', error);
  }
}
```

## Animation

Use CSS transitions and animations, keep them subtle:

```css
/* Transitions for interactive elements */
.btn,
.input,
a {
  transition: all 0.15s ease;
}

/* Fade in animation */
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-0.5rem);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.fade-in {
  animation: fadeIn 0.2s ease;
}

/* Slide in animation */
@keyframes slideIn {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(0);
  }
}
```

## Print Styles

```css
@media print {
  body {
    color: #000;
    background: #fff;
  }
  
  .no-print {
    display: none;
  }
  
  a {
    text-decoration: underline;
  }
  
  a[href]::after {
    content: " (" attr(href) ")";
  }
}
```

---

## Quick Reference

When building a new tool/demo:

1. Start with semantic HTML structure
2. Define colour system using CSS custom properties
3. Apply mobile-first responsive design
4. Use the spacing system consistently
5. Ensure all interactive elements meet touch target sizes
6. Add proper focus states and ARIA labels
7. Test across viewport sizes
8. Keep JavaScript vanilla - no frameworks
9. Theme support via `data-theme` attribute
10. Single-file or organised structure as needed

The goal is clean, accessible, responsive interfaces that work everywhere without dependencies.
