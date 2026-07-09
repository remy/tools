import { state } from './state.js';
import { db, getSyncConfig, setSyncConfig, encodeSyncConfig, SHARE_PARAM } from './db.js';
import { refreshAll, refreshItems, selectList } from './lists.js';
import { renderItems } from './render.js';
import { parseMarkdown } from './import.js';

const $ = (id) => document.getElementById(id);

// Enable the share button only when there's a remote host to share.
function updateShareAvailability(url) {
  $('sync-share').disabled = !url;
}

// ── Sync status ──
// PouchDB errors are inconsistent about where the useful detail lives, so try
// message, then reason, then name, and append the HTTP status when present.
function errorText(err) {
  const detail = err?.message || err?.reason || err?.name || 'Unknown error';
  const status = err?.status ? ` (HTTP ${err.status})` : '';
  return `Sync error: ${detail}${status}`;
}

function statusText(s) {
  if (!s || s.state === 'disabled') return 'Sync disabled.';
  if (s.state === 'syncing') return 'Syncing…';
  if (s.state === 'error') return errorText(s.lastError);
  const last = s.lastSyncedAt
    ? ` · last synced ${new Date(s.lastSyncedAt).toLocaleTimeString()}`
    : '';
  return `Idle${last}`;
}

function renderSyncStatus(s) {
  const el = $('sync-status');
  if (!el) return;
  el.textContent = statusText(s);
  el.dataset.state = s?.state ?? 'disabled';
}

// Subscribe once at startup: keeps the settings-dialog status line current and
// drives the red badge on the header cog so a failing sync is visible without
// opening settings.
export function initSyncStatus() {
  db.onSyncStatus((s) => {
    renderSyncStatus(s);
    const failing = s?.state === 'error';
    $('sync-error-dot').hidden = !failing;
    $('btn-settings').title = failing ? statusText(s) : '';
  });
}

export function openSettings() {
  const cfg = getSyncConfig();
  $('sync-url').value = cfg.url;
  $('sync-token').value = cfg.token;
  updateShareAvailability(cfg.url);

  setupListSection();
  renderTemplates();
  $('settings-dialog').showModal();
}

// ── Per-list settings (shown at the top of the dialog while a list is open) ──

// Entries parsed from the last chosen file, held while the user decides
// between append and replace for a non-empty list.
let pendingEntries = null;

function setupListSection() {
  const onList = state.view === 'list' && !!state.currentListId;
  $('list-settings-section').hidden = !onList;
  resetImportChoice();
  $('print-choice').hidden = true;
  $('import-file').value = '';
  if (onList) {
    const list = state.lists.find((l) => l.id === state.currentListId);
    $('list-settings-name').textContent = list ? list.name : '';
  }
}

function resetImportChoice() {
  pendingEntries = null;
  $('import-choice').hidden = true;
  $('import-summary').textContent = '';
}

export async function handleImportFile(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  let entries;
  try {
    entries = parseMarkdown(await file.text());
  } catch {
    alert('Could not read that file.');
    return;
  }
  if (!entries.length) {
    alert('No headings or checklist items were found in that file.');
    return;
  }
  // An empty list imports straight away; otherwise ask append vs replace.
  if (!state.items.length) {
    await runImport(entries, false);
    return;
  }
  pendingEntries = entries;
  const headings = entries.filter((x) => x.kind === 'heading').length;
  const items = entries.length - headings;
  $('import-summary').textContent =
    `Found ${headings} section${headings === 1 ? '' : 's'} and ${items} item${items === 1 ? '' : 's'}. `
    + 'This list already has items — append the import or replace them?';
  $('import-choice').hidden = false;
}

async function runImport(entries, replace) {
  await db.importItems(state.currentListId, entries, { replace });
  await refreshItems();
  renderItems();
  resetImportChoice();
  $('settings-dialog').close();
}

export async function handleImportAppend() {
  if (pendingEntries) await runImport(pendingEntries, false);
}

export async function handleImportReplace() {
  if (pendingEntries) await runImport(pendingEntries, true);
}

export function handleImportCancel() {
  resetImportChoice();
}

// ── Clone list ──
// Copy the open list (items, headings, check state) into a brand new list,
// asking for its name first, then navigate straight into the clone.
export async function handleCloneList() {
  const list = state.lists.find((l) => l.id === state.currentListId);
  if (!list) return;
  const name = prompt('Name for the new list', `${list.name} copy`);
  if (name == null) return;
  const trimmed = name.trim();
  if (!trimmed) return;
  const newId = await db.cloneList(list.id, trimmed);
  $('settings-dialog').close();
  state.lists = await db.getLists();
  state.counts = await db.getCounts();
  await selectList(newId);
}

// ── Print ──
// Fill the hidden print sheet with the open list. `unchecked` prints every
// task with an empty box regardless of its current state.
function buildPrintSheet(unchecked) {
  const list = state.lists.find((l) => l.id === state.currentListId);
  const sheet = $('print-sheet');
  sheet.replaceChildren();

  const title = document.createElement('h1');
  title.textContent = list ? list.name : 'Todo list';
  sheet.appendChild(title);

  const ul = document.createElement('ul');
  for (const item of state.items) {
    const li = document.createElement('li');
    if (item.kind === 'heading') {
      li.className = 'print-heading';
      li.textContent = item.text;
    } else {
      li.className = 'print-item';
      if (!unchecked && item.checked) li.classList.add('checked');
      const box = document.createElement('span');
      box.className = 'print-box';
      const text = document.createElement('span');
      text.className = 'print-text';
      text.textContent = item.text;
      li.append(box, text);
    }
    ul.appendChild(li);
  }
  sheet.appendChild(ul);
}

export function handlePrint(unchecked) {
  buildPrintSheet(unchecked);
  $('print-choice').hidden = true;
  // Close the dialog first — print styles hide it, but leaving a modal open
  // behind the print preview would be confusing once printing finishes.
  $('settings-dialog').close();
  window.print();
}

// Build a link that encodes the current sync config and copy it to the
// clipboard. Opening it on another device saves the config and reloads.
let shareResetTimer = null;
export async function handleShareLink() {
  const cfg = getSyncConfig();
  if (!cfg.url) return;
  const link = `${location.origin}${location.pathname}?${SHARE_PARAM}=${encodeSyncConfig(cfg)}`;

  const btn = $('sync-share');
  const flash = (msg) => {
    btn.textContent = msg;
    clearTimeout(shareResetTimer);
    shareResetTimer = setTimeout(() => { btn.textContent = 'Copy share link'; }, 2000);
  };
  try {
    await navigator.clipboard.writeText(link);
    flash('Copied!');
  } catch {
    // Clipboard blocked (e.g. insecure context) — surface the link to copy by hand.
    prompt('Copy this sync link:', link);
  }
}

// ── Templates ──
function renderTemplates() {
  const ul = $('templates-list');
  ul.replaceChildren();
  if (!state.templates.length) {
    const li = document.createElement('li');
    li.className = 'muted-row';
    li.textContent = 'No templates yet. Create one to quickly spin up new lists.';
    ul.appendChild(li);
    return;
  }
  for (const t of state.templates) {
    const li = document.createElement('li');
    li.className = 'pick-row';

    const main = document.createElement('div');
    main.className = 'template-info';
    const name = document.createElement('span');
    name.className = 'template-name';
    name.textContent = t.name;
    const count = document.createElement('span');
    count.className = 'template-count';
    count.textContent = `${t.items.length} item${t.items.length === 1 ? '' : 's'}`;
    main.append(name, count);

    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'icon-btn';
    edit.dataset.action = 'edit-template';
    edit.dataset.id = t.id;
    edit.setAttribute('aria-label', 'Edit template');
    edit.innerHTML = '<svg width="16" height="16" viewBox="0 0 18 18" fill="none"><path d="M11.5 3.5L14.5 6.5M3 15H6L13.5 7.5L10.5 4.5L3 12V15Z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'icon-btn icon-danger';
    del.dataset.action = 'delete-template';
    del.dataset.id = t.id;
    del.setAttribute('aria-label', 'Delete template');
    del.innerHTML = '<svg width="16" height="16" viewBox="0 0 18 18" fill="none"><path d="M4 5H14M7 5V3.5H11V5M6 5V14H12V5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    li.append(main, edit, del);
    ul.appendChild(li);
  }
}

export function openTemplateEditor(id) {
  const tpl = id ? state.templates.find((t) => t.id === id) : null;
  $('template-editor-title').textContent = tpl ? 'Edit Template' : 'New Template';
  $('template-edit-id').value = tpl ? tpl.id : '';
  $('template-name').value = tpl ? tpl.name : '';
  $('template-items').value = tpl ? tpl.items.join('\n') : '';
  $('template-dialog').showModal();
  setTimeout(() => $('template-name').focus(), 50);
}

export async function saveTemplate() {
  const id = $('template-edit-id').value || crypto.randomUUID();
  const name = $('template-name').value.trim();
  const items = $('template-items').value
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!name) { $('template-name').focus(); return; }
  const existing = state.templates.find((t) => t.id === id);
  await db.putTemplate({
    id,
    name,
    items,
    createdAt: existing?.createdAt ?? Date.now(),
  });
  state.templates = await db.getTemplates();
  $('template-dialog').close();
  renderTemplates();
}

export async function deleteTemplate(id) {
  const tpl = state.templates.find((t) => t.id === id);
  if (!tpl) return;
  if (!confirm(`Delete template "${tpl.name}"?`)) return;
  await db.deleteTemplate(id);
  state.templates = await db.getTemplates();
  renderTemplates();
}

// ── Sync controls ──
export async function handleSyncSave() {
  const url = $('sync-url').value.trim();
  const token = $('sync-token').value.trim();
  const btn = $('sync-save');
  btn.disabled = true;
  try {
    // Decide BEFORE writing config so the check reflects current local data.
    const hasLocal = url ? await db.hasData() : false;
    if (url && hasLocal) {
      const ok = confirm(
        'Local lists exist on this device. Saving will merge them with the '
        + "server's data (last write wins per item).\n\n"
        + 'To REPLACE local data with the server instead, cancel and use '
        + '"Pull from server".\n\nContinue with merge?',
      );
      if (!ok) { btn.disabled = false; return; }
    }
    setSyncConfig({ url, token });
    updateShareAvailability(url);
    // pullFirst when local has nothing to lose — protects a fresh client from
    // racing an empty push against the initial pull.
    await db.reopen({ pullFirst: !hasLocal });
    await refreshAll();
    renderTemplates();
  } catch (err) {
    renderSyncStatus({ state: 'error', lastError: err });
  } finally {
    btn.disabled = false;
  }
}

export async function handleSyncNow() {
  const btn = $('sync-now');
  btn.disabled = true;
  try {
    await db.syncNow();
    await refreshAll();
    renderTemplates();
  } catch (err) {
    renderSyncStatus({ state: 'error', lastError: err });
  } finally {
    btn.disabled = false;
  }
}

export async function handleSyncPull() {
  const ok = confirm(
    'Pull from the server and overwrite local data? Any local changes that '
    + "haven't been pushed will be discarded. The remote server is not modified.",
  );
  if (!ok) return;
  const btn = $('sync-pull');
  btn.disabled = true;
  try {
    await db.pullFromRemote();
    await refreshAll();
    renderTemplates();
  } catch (err) {
    renderSyncStatus({ state: 'error', lastError: err });
  } finally {
    btn.disabled = false;
  }
}
