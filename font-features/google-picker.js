// The list inside the Google Fonts dialog. Opening and closing the dialog is
// handled by the inline script in index.html, so the button still answers
// while this module is loading; this only fills the list in.

import { loadCatalogue } from './google.js';

const MAX_ROWS = 120;

export function setupPicker({ dialog, search, list, note, onPick }) {
  let fonts = [];
  let loading = null;

  function draw() {
    const query = search.value.trim().toLowerCase();
    const matches = query
      ? fonts.filter((font) => font.search.includes(query))
      : fonts;

    list.replaceChildren();
    for (const font of matches.slice(0, MAX_ROWS)) {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'font-row';
      const name = document.createElement('span');
      name.className = 'font-name';
      name.textContent = font.family;
      const tags = document.createElement('span');
      tags.className = 'font-tags';
      tags.textContent = font.variable ? `${font.category} · variable` : font.category;
      button.append(name, tags);
      button.addEventListener('click', () => {
        dialog.close();
        onPick(font.family);
      });
      item.append(button);
      list.append(item);
    }

    note.textContent = matches.length > MAX_ROWS
      ? `${matches.length.toLocaleString()} matches — showing the first ${MAX_ROWS}. Keep typing to narrow it down.`
      : `${matches.length.toLocaleString()} ${matches.length === 1 ? 'family' : 'families'}`;
  }

  function opened() {
    if (fonts.length || loading) return;
    loading = loadCatalogue()
      .then((catalogue) => {
        fonts = catalogue.fonts;
        draw();
      })
      .catch((error) => {
        note.textContent = error.message;
      })
      .finally(() => { loading = null; });
  }

  search.addEventListener('input', draw);
  window.__fontPicker = { opened };
  // The dialog can already be open — the reader may have clicked before this
  // module finished loading.
  if (dialog.open) opened();
}
