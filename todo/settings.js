import { state } from './state.js';
import { db, getSyncConfig, setSyncConfig, encodeSyncConfig, SHARE_PARAM } from './db.js';
import { refreshAll } from './lists.js';

const $ = (id) => document.getElementById(id);

// Enable the share button only when there's a remote host to share.
function updateShareAvailability(url) {
  $('sync-share').disabled = !url;
}

// ── Sync status ──
function statusText(s) {
  if (!s || s.state === 'disabled') return 'Sync disabled.';
  if (s.state === 'syncing') return 'Syncing…';
  if (s.state === 'error') return `Error: ${s.lastError?.message || 'Unknown error'}`;
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

let unsubStatus = null;

export function openSettings() {
  const cfg = getSyncConfig();
  $('sync-url').value = cfg.url;
  $('sync-token').value = cfg.token;
  updateShareAvailability(cfg.url);

  if (unsubStatus) unsubStatus();
  unsubStatus = db.onSyncStatus(renderSyncStatus);

  renderTemplates();
  $('settings-dialog').showModal();
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
