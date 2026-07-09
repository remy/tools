import { state } from './state.js';
import { db } from './db.js';
import { render, renderItems, refreshItemRow, beginEdit, relativeTime, fullTime } from './render.js';
import {
  goHome, openNewListDialog, onNewListTemplateChange,
  createList, renameList, deleteList, selectList, refreshItems,
} from './lists.js';
import {
  openSettings, openTemplateEditor, saveTemplate, deleteTemplate,
  handleSyncSave, handleSyncNow, handleSyncPull, handleShareLink,
  handleImportFile, handleImportAppend, handleImportReplace, handleImportCancel,
  handleCloneList, handlePrint,
} from './settings.js';

const $ = (id) => document.getElementById(id);

// Native <dialog>: dismiss when the backdrop (the dialog element itself) is
// clicked. Relies on the dialog having no padding so only backdrop clicks
// target the element directly.
function wireBackdropDismiss(id) {
  const dlg = $(id);
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) dlg.close();
  });
}

function findItem(id) {
  return state.items.find((i) => i.id === id);
}

// ── Item interactions (event-delegated on the list) ──
function wireTodoList() {
  const ul = $('todo-list');
  ul.addEventListener('click', async (e) => {
    const actionEl = e.target.closest('[data-action]');
    if (!actionEl) return;
    const li = e.target.closest('.todo-item, .todo-heading');
    if (!li) return;
    const item = findItem(li.dataset.id);
    if (!item) return;
    const action = actionEl.dataset.action;

    if (action === 'toggle') {
      await db.setItemChecked(item.listId, item.id, !item.checked);
      await refreshItems();
      // Update just this row so the page doesn't jump to the top.
      refreshItemRow(item.id);
    } else if (action === 'delete') {
      if (!confirm(`Delete "${item.text}"? This cannot be undone.`)) return;
      await db.deleteItem(item.listId, item.id);
      await refreshItems();
      renderItems();
    } else if (action === 'edit') {
      beginEdit(li, item, async (newText) => {
        await db.putItem({ ...item, text: newText });
        await refreshItems();
        renderItems();
      });
    } else if (action === 'history') {
      openHistory(item);
    }
  });

  wireReorderDnD(ul);
}

// The first row whose vertical midpoint sits below the pointer (drop target).
function rowAfter(ul, y) {
  const rows = [...ul.querySelectorAll('[data-id]:not(.dragging)')];
  for (const row of rows) {
    const box = row.getBoundingClientRect();
    if (y < box.top + box.height / 2) return row;
  }
  return null;
}

// Pointer-based drag reordering. Uses Pointer Events (not native HTML5
// drag-and-drop) so it works on touch as well as mouse — the drag handle has
// touch-action:none so dragging it reorders rather than scrolling the page.
function wireReorderDnD(ul) {
  let dragging = null;

  const onMove = (e) => {
    if (!dragging) return;
    e.preventDefault();
    const after = rowAfter(ul, e.clientY);
    if (after == null) ul.appendChild(dragging);
    else if (after !== dragging.nextSibling) ul.insertBefore(dragging, after);
  };

  const onEnd = async () => {
    if (!dragging) return;
    dragging.classList.remove('dragging');
    dragging = null;
    document.body.classList.remove('reordering');
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onEnd);
    window.removeEventListener('pointercancel', onEnd);
    if (!state.currentListId) return;
    const ids = [...ul.querySelectorAll('[data-id]')].map((li) => li.dataset.id);
    await db.reorderItems(state.currentListId, ids);
    await refreshItems();
    renderItems();
  };

  ul.addEventListener('pointerdown', (e) => {
    const handle = e.target.closest('.todo-drag');
    if (!handle) return;
    const li = handle.closest('[data-id]');
    if (!li) return;
    e.preventDefault();
    dragging = li;
    li.classList.add('dragging');
    document.body.classList.add('reordering');
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
  });
}

// ── Add item ──
function wireAddItem() {
  const form = $('add-item-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('add-item-input');
    const raw = input.value.trim();
    if (!raw || !state.currentListId) return;
    // A leading "#" (markdown heading syntax) adds a section heading instead of
    // a checkable task. The hashes are stripped from the stored text; a line of
    // hashes with no text is ignored.
    const isHeading = raw.startsWith('#');
    const text = isHeading ? raw.replace(/^#+\s*/, '').trim() : raw;
    if (!text) return;
    const now = Date.now();
    const newId = crypto.randomUUID();
    await db.putItem({
      id: newId,
      listId: state.currentListId,
      kind: isHeading ? 'heading' : 'item',
      text,
      checked: false,
      checkedAt: null,
      order: now,
      createdAt: now,
      history: [],
    });
    input.value = '';
    await refreshItems();
    renderItems();
    // Bring the freshly added row into view — it's appended at the bottom, so
    // in a long list it can land below the fold.
    $('todo-list').querySelector(`[data-id="${newId}"]`)?.scrollIntoView({ block: 'nearest' });
    input.focus();
  });
}

// ── Reset check state ──
function wireReset() {
  $('reset-checks').addEventListener('click', async () => {
    if (!state.currentListId) return;
    if (!confirm('Reset all items to unchecked? This clears their check history for this list.')) return;
    await db.resetList(state.currentListId);
    await refreshItems();
    renderItems();
  });
}

// ── History dialog ──
function openHistory(item) {
  $('history-title').textContent = item.text;
  const ul = $('history-list');
  ul.replaceChildren();
  const events = [...(item.history || [])].reverse();
  if (!events.length) {
    const li = document.createElement('li');
    li.className = 'muted-row';
    li.textContent = 'No recorded changes yet.';
    ul.appendChild(li);
  }
  for (const ev of events) {
    const li = document.createElement('li');
    li.className = 'history-row';
    li.dataset.checked = String(ev.checked);
    const verb = document.createElement('span');
    verb.className = 'history-verb';
    verb.textContent = ev.checked ? 'Checked' : 'Unchecked';
    const when = document.createElement('span');
    when.className = 'history-when';
    when.textContent = `${fullTime(ev.at)} · ${relativeTime(ev.at)}`;
    li.append(verb, when);
    ul.appendChild(li);
  }
  $('history-dialog').showModal();
}

// ── Home view: list of all lists ──
function wireHomeList() {
  $('home-list').addEventListener('click', async (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const id = el.dataset.id;
    const action = el.dataset.action;
    if (action === 'pick') await selectList(id);
    else if (action === 'rename') await renameList(id);
    else if (action === 'delete') await deleteList(id);
  });
  $('home-new-list').addEventListener('click', openNewListDialog);
}

// ── Templates section in settings ──
function wireTemplates() {
  $('templates-list').addEventListener('click', async (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    if (el.dataset.action === 'edit-template') openTemplateEditor(el.dataset.id);
    else if (el.dataset.action === 'delete-template') await deleteTemplate(el.dataset.id);
  });
  $('template-new').addEventListener('click', () => openTemplateEditor(null));
  $('template-save').addEventListener('click', saveTemplate);
}

export function bindEvents() {
  // Header
  $('btn-back').addEventListener('click', goHome);
  $('btn-settings').addEventListener('click', openSettings);
  $('empty-new-list').addEventListener('click', openNewListDialog);

  // Settings: Markdown import (per-list section)
  $('import-open').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', handleImportFile);
  $('import-append').addEventListener('click', handleImportAppend);
  $('import-replace').addEventListener('click', handleImportReplace);
  $('import-cancel').addEventListener('click', handleImportCancel);

  // Settings: clone & print (per-list section)
  $('clone-list').addEventListener('click', handleCloneList);
  $('print-open').addEventListener('click', () => { $('print-choice').hidden = false; });
  $('print-unchecked').addEventListener('click', () => handlePrint(true));
  $('print-current').addEventListener('click', () => handlePrint(false));

  // New list dialog — the submit button is type="submit", so the form's submit
  // event is the single source of truth (a separate click handler would fire
  // createList twice and create duplicate lists).
  $('new-list-template').addEventListener('change', onNewListTemplateChange);
  $('new-list-form').addEventListener('submit', (e) => { e.preventDefault(); createList(); });

  // Settings: sync
  $('sync-save').addEventListener('click', handleSyncSave);
  $('sync-now').addEventListener('click', handleSyncNow);
  $('sync-pull').addEventListener('click', handleSyncPull);
  $('sync-share').addEventListener('click', handleShareLink);

  // Close buttons (any element with data-close pointing at a dialog id)
  document.querySelectorAll('[data-close]').forEach((btn) => {
    btn.addEventListener('click', () => $(btn.dataset.close).close());
  });

  ['new-list-dialog', 'history-dialog', 'settings-dialog', 'template-dialog']
    .forEach(wireBackdropDismiss);

  wireTodoList();
  wireAddItem();
  wireReset();
  wireHomeList();
  wireTemplates();
}
