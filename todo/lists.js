import { state } from './state.js';
import { db } from './db.js';
import { render } from './render.js';
import { applyListOrder } from './order.js';
import { sinkCheckedItems } from './sink.js';

const $ = (id) => document.getElementById(id);

// True when the open list has "move checked to the bottom" turned on.
export function sinksChecked() {
  return !!state.lists.find((l) => l.id === state.currentListId)?.sinkChecked;
}

// Every read of a list's items goes through here so the per-list display order
// is applied in one place — the stored order is never rewritten (see sink.js).
async function loadItems(listId) {
  const items = await db.getItems(listId);
  const list = state.lists.find((l) => l.id === listId);
  return list?.sinkChecked ? sinkCheckedItems(items) : items;
}

// Every read of the lists goes through here so the per-device ordering from
// localStorage is applied consistently — see order.js for why it isn't synced.
export async function loadLists() {
  state.lists = applyListOrder(await db.getLists());
  return state.lists;
}

// Load lists, templates and per-list counts into state, then paint. The
// current list's items are also refreshed when one is open. The active view
// ('home' vs 'list') is preserved so a background sync never yanks the user
// out of the list they're working in.
export async function refreshAll() {
  await loadLists();
  state.templates = await db.getTemplates();
  state.counts = await db.getCounts();

  const ids = new Set(state.lists.map((l) => l.id));
  if (state.currentListId && !ids.has(state.currentListId)) {
    state.currentListId = null;
  }
  state.items = state.currentListId ? await loadItems(state.currentListId) : [];
  render();
}

// Open a list (navigate into the single-list view).
export async function selectList(id) {
  state.currentListId = id;
  state.view = 'list';
  await db.setSetting('currentListId', id);
  state.items = await loadItems(id);
  render();
}

// Navigate back to the landing page listing every to-do list. Counts are
// refreshed so progress reflects any changes made inside a list.
export async function goHome() {
  state.view = 'home';
  state.counts = await db.getCounts();
  render();
}

export async function refreshItems() {
  if (!state.currentListId) { state.items = []; return; }
  state.items = await loadItems(state.currentListId);
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
  await loadLists();
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
  await loadLists();
  render();
}

export async function deleteList(id) {
  const list = state.lists.find((l) => l.id === id);
  if (!list) return;
  if (!confirm(`Delete "${list.name}" and all its items? This cannot be undone.`)) return;
  await db.deleteList(id);
  await loadLists();
  state.counts = await db.getCounts();
  if (state.currentListId === id) {
    state.currentListId = null;
    state.items = [];
    state.view = 'home';
  }
  render();
}
