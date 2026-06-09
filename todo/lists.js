import { state } from './state.js';
import { db } from './db.js';
import { render } from './render.js';

const $ = (id) => document.getElementById(id);

// Load lists + the current list's items into state, then paint.
export async function refreshAll() {
  state.lists = await db.getLists();
  state.templates = await db.getTemplates();

  // Resolve the selected list: keep it if still present, else fall back to the
  // stored preference, else the first list.
  const saved = await db.getSetting('currentListId');
  const ids = new Set(state.lists.map((l) => l.id));
  if (!state.currentListId || !ids.has(state.currentListId)) {
    state.currentListId = ids.has(saved) ? saved : (state.lists[0]?.id ?? null);
  }
  state.items = state.currentListId ? await db.getItems(state.currentListId) : [];
  render();
}

export async function selectList(id) {
  state.currentListId = id;
  await db.setSetting('currentListId', id);
  state.items = await db.getItems(id);
  render();
}

export async function refreshItems() {
  if (!state.currentListId) { state.items = []; return; }
  state.items = await db.getItems(state.currentListId);
}

// ── Lists picker dialog ──
export function openListsDialog() {
  renderListsDialog();
  $('lists-dialog').showModal();
}

function renderListsDialog() {
  const ul = $('lists-dialog-list');
  ul.replaceChildren();
  if (!state.lists.length) {
    const li = document.createElement('li');
    li.className = 'muted-row';
    li.textContent = 'No lists yet.';
    ul.appendChild(li);
  }
  for (const list of state.lists) {
    const li = document.createElement('li');
    li.className = 'pick-row';
    if (list.id === state.currentListId) li.classList.add('active');

    const pick = document.createElement('button');
    pick.type = 'button';
    pick.className = 'pick-main';
    pick.dataset.action = 'pick';
    pick.dataset.id = list.id;
    pick.textContent = list.name;
    li.appendChild(pick);

    const ren = document.createElement('button');
    ren.type = 'button';
    ren.className = 'icon-btn';
    ren.dataset.action = 'rename';
    ren.dataset.id = list.id;
    ren.setAttribute('aria-label', 'Rename list');
    ren.innerHTML = '<svg width="16" height="16" viewBox="0 0 18 18" fill="none"><path d="M11.5 3.5L14.5 6.5M3 15H6L13.5 7.5L10.5 4.5L3 12V15Z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'icon-btn icon-danger';
    del.dataset.action = 'delete';
    del.dataset.id = list.id;
    del.setAttribute('aria-label', 'Delete list');
    del.innerHTML = '<svg width="16" height="16" viewBox="0 0 18 18" fill="none"><path d="M4 5H14M7 5V3.5H11V5M6 5V14H12V5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    li.append(ren, del);
    ul.appendChild(li);
  }
}

// ── New list dialog (blank or from template) ──
export function openNewListDialog() {
  const sel = $('new-list-template');
  sel.replaceChildren();
  const blank = new Option('Blank list', '');
  sel.appendChild(blank);
  for (const t of state.templates) {
    sel.appendChild(new Option(`${t.name} (${t.items.length})`, t.id));
  }
  $('new-list-name').value = '';
  $('new-list-dialog').showModal();
  setTimeout(() => $('new-list-name').focus(), 50);
}

// When a template is chosen and the name is empty, prefill with template name.
export function onNewListTemplateChange() {
  const tId = $('new-list-template').value;
  const nameEl = $('new-list-name');
  if (tId && !nameEl.value.trim()) {
    const t = state.templates.find((x) => x.id === tId);
    if (t) nameEl.value = t.name;
  }
}

export async function createList() {
  const name = $('new-list-name').value.trim();
  const tId = $('new-list-template').value;
  if (!name && !tId) { $('new-list-name').focus(); return; }

  let newId;
  if (tId) {
    newId = await db.createListFromTemplate(tId, name);
  } else {
    newId = crypto.randomUUID();
    const now = Date.now();
    await db.putList({ id: newId, name, order: now, createdAt: now });
  }
  $('new-list-dialog').close();
  state.lists = await db.getLists();
  state.templates = await db.getTemplates();
  await selectList(newId);
}

export async function renameList(id) {
  const list = state.lists.find((l) => l.id === id);
  if (!list) return;
  const name = prompt('Rename list', list.name);
  if (name == null) return;
  const trimmed = name.trim();
  if (!trimmed || trimmed === list.name) return;
  await db.putList({ ...list, name: trimmed });
  state.lists = await db.getLists();
  renderListsDialog();
  render();
}

export async function deleteList(id) {
  const list = state.lists.find((l) => l.id === id);
  if (!list) return;
  if (!confirm(`Delete "${list.name}" and all its items? This cannot be undone.`)) return;
  await db.deleteList(id);
  state.lists = await db.getLists();
  if (state.currentListId === id) {
    state.currentListId = state.lists[0]?.id ?? null;
    await db.setSetting('currentListId', state.currentListId);
    state.items = state.currentListId ? await db.getItems(state.currentListId) : [];
  }
  renderListsDialog();
  render();
}
