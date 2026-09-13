// The Google Fonts family picker dialog.

import { loadCatalogue } from './google.js';

const MAX_ROWS = 120;

export function setupPicker({ dialog, trigger, search, list, note, onPick }) {
  let fonts = [];

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

  async function open() {
    dialog.showModal();
    search.focus();
    if (fonts.length) return;
    try {
      const catalogue = await loadCatalogue();
      fonts = catalogue.fonts;
      draw();
    } catch (error) {
      note.textContent = error.message;
    }
  }

  for (const button of trigger) button.addEventListener('click', open);
  search.addEventListener('input', draw);
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
}
