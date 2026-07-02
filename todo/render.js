import { state } from './state.js';

const $ = (id) => document.getElementById(id);

// ── Time formatting ──
export function relativeTime(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const abs = Math.abs(diff);
  const min = 60 * 1000, hour = 60 * min, day = 24 * hour;
  const fmt = (n, unit) => `${n} ${unit}${n === 1 ? '' : 's'} ago`;
  if (abs < min) return 'just now';
  if (abs < hour) return fmt(Math.round(abs / min), 'min');
  if (abs < day) return fmt(Math.round(abs / hour), 'hour');
  if (abs < 7 * day) return fmt(Math.round(abs / day), 'day');
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fullTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  });
}

function currentList() {
  return state.lists.find((l) => l.id === state.currentListId) || null;
}

// ── Main render ──
export function render() {
  const list = currentList();
  // Only stay in the single-list view when a valid list is selected; otherwise
  // fall back to the home view (e.g. the open list was just deleted).
  const onList = state.view === 'list' && !!list;

  $('header-title').textContent = onList ? list.name : 'Todo Lists';
  $('btn-back').hidden = !onList;

  $('home-view').hidden = onList;
  $('list-view').hidden = !onList;
  $('add-item-form').hidden = !onList;

  if (onList) renderItems();
  else renderHome();
}

// ── Home view: all lists ──
export function renderHome() {
  const hasLists = state.lists.length > 0;
  $('empty-app').hidden = hasLists;
  $('home-lists').hidden = !hasLists;
  if (!hasLists) return;

  const ul = $('home-list');
  ul.replaceChildren();
  for (const list of state.lists) {
    ul.appendChild(homeRow(list));
  }
}

function homeRow(list) {
  const li = document.createElement('li');
  li.className = 'pick-row';

  const pick = document.createElement('button');
  pick.type = 'button';
  pick.className = 'pick-main';
  pick.dataset.action = 'pick';
  pick.dataset.id = list.id;

  const name = document.createElement('span');
  name.className = 'pick-name';
  name.textContent = list.name;
  pick.appendChild(name);

  const c = state.counts[list.id];
  if (c && c.total) {
    const badge = document.createElement('span');
    badge.className = 'pick-count';
    if (c.done === c.total) badge.classList.add('complete');
    badge.textContent = `${c.done}/${c.total}`;
    pick.appendChild(badge);
  }
  li.appendChild(pick);

  const ren = document.createElement('button');
  ren.type = 'button';
  ren.className = 'icon-btn';
  ren.dataset.action = 'rename';
  ren.dataset.id = list.id;
  ren.setAttribute('aria-label', 'Rename list');
  ren.appendChild(svg('<path d="M11.5 3.5L14.5 6.5M3 15H6L13.5 7.5L10.5 4.5L3 12V15Z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>', 16));

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'icon-btn icon-danger';
  del.dataset.action = 'delete';
  del.dataset.id = list.id;
  del.setAttribute('aria-label', 'Delete list');
  del.appendChild(svg('<path d="M4 5H14M7 5V3.5H11V5M6 5V14H12V5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>', 16));

  li.append(ren, del);
  return li;
}

export function renderItems() {
  const items = state.items;
  const ul = $('todo-list');
  ul.replaceChildren();

  // Progress counts checkable tasks only — headings are structural.
  const tasks = items.filter((i) => i.kind !== 'heading');
  const done = tasks.filter((i) => i.checked).length;
  const total = tasks.length;

  // Progress summary + reset affordance
  const meter = $('progress-meter');
  const bar = $('progress-bar');
  const label = $('progress-label');
  if (total === 0) {
    meter.hidden = true;
  } else {
    meter.hidden = false;
    const pct = Math.round((done / total) * 100);
    bar.style.width = `${pct}%`;
    bar.classList.toggle('complete', done === total);
    label.textContent = `${done} of ${total} done`;
  }
  $('reset-checks').hidden = done === 0;

  const empty = $('empty-list');
  empty.hidden = items.length !== 0;

  items.forEach((item, i) => {
    const row = item.kind === 'heading' ? headingRow(item) : itemRow(item);
    if (i === 0) row.querySelector('[data-action="moveup"]')?.setAttribute('disabled', '');
    if (i === items.length - 1) row.querySelector('[data-action="movedown"]')?.setAttribute('disabled', '');
    ul.appendChild(row);
  });
}

function svg(paths, size = 18) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('width', size);
  s.setAttribute('height', size);
  s.setAttribute('viewBox', '0 0 18 18');
  s.setAttribute('fill', 'none');
  s.innerHTML = paths;
  return s;
}

function iconBtn(action, label, paths, extraClass = '') {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `icon-btn${extraClass ? ' ' + extraClass : ''}`;
  btn.dataset.action = action;
  btn.setAttribute('aria-label', label);
  btn.appendChild(svg(paths, 16));
  return btn;
}

// A drag handle (native drag source) — reorder on desktop via pointer drag.
function dragHandle() {
  const btn = iconBtn('drag', 'Drag to reorder',
    '<path d="M6 4.5h.02M6 9h.02M6 13.5h.02M12 4.5h.02M12 9h.02M12 13.5h.02" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>',
    'todo-drag');
  btn.setAttribute('draggable', 'true');
  return btn;
}

// Up/down buttons — the accessible / touch reorder path.
function moveButtons() {
  const up = iconBtn('moveup', 'Move up',
    '<path d="M4.5 11L9 6.5L13.5 11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
    'todo-move');
  const down = iconBtn('movedown', 'Move down',
    '<path d="M4.5 7L9 11.5L13.5 7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
    'todo-move');
  return [up, down];
}

const EDIT_PATHS = '<path d="M11.5 3.5L14.5 6.5M3 15H6L13.5 7.5L10.5 4.5L3 12V15Z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>';
const DELETE_PATHS = '<path d="M4 5H14M7 5V3.5H11V5M6 5V14H12V5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>';

function itemRow(item) {
  const li = document.createElement('li');
  li.className = 'todo-item';
  li.dataset.id = item.id;
  if (item.checked) li.classList.add('checked');

  // Checkbox toggle
  const toggle = document.createElement('button');
  toggle.className = 'todo-check';
  toggle.type = 'button';
  toggle.setAttribute('role', 'checkbox');
  toggle.setAttribute('aria-checked', String(item.checked));
  toggle.setAttribute('aria-label', item.checked ? 'Mark as not done' : 'Mark as done');
  toggle.dataset.action = 'toggle';
  toggle.appendChild(svg('<path d="M4.5 9.5L7.5 12.5L13.5 5.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>', 16));

  // Text + meta
  const body = document.createElement('div');
  body.className = 'todo-body';

  const text = document.createElement('span');
  text.className = 'todo-text';
  text.textContent = item.text;
  text.dataset.action = 'toggle';
  body.appendChild(text);

  if (item.checkedAt) {
    const meta = document.createElement('button');
    meta.className = 'todo-meta';
    meta.type = 'button';
    meta.dataset.action = 'history';
    meta.title = 'View check history';
    const verb = item.checked ? 'Checked' : 'Unchecked';
    meta.textContent = `${verb} ${relativeTime(item.checkedAt)}`;
    body.appendChild(meta);
  }

  // Row actions
  const actions = document.createElement('div');
  actions.className = 'todo-actions';
  const [up, down] = moveButtons();
  actions.append(up, down,
    iconBtn('edit', 'Edit item', EDIT_PATHS),
    iconBtn('delete', 'Delete item', DELETE_PATHS, 'icon-danger'));

  li.append(dragHandle(), toggle, body, actions);
  return li;
}

// A section heading — a flat list item without a checkbox, rendered as a
// divider. Shares the drag / reorder / edit / delete controls with tasks.
function headingRow(item) {
  const li = document.createElement('li');
  li.className = 'todo-heading';
  li.dataset.id = item.id;

  const body = document.createElement('div');
  body.className = 'todo-body';
  const text = document.createElement('span');
  text.className = 'todo-heading-text';
  text.textContent = item.text;
  body.appendChild(text);

  const actions = document.createElement('div');
  actions.className = 'todo-actions';
  const [up, down] = moveButtons();
  actions.append(up, down,
    iconBtn('edit', 'Edit heading', EDIT_PATHS),
    iconBtn('delete', 'Delete heading', DELETE_PATHS, 'icon-danger'));

  li.append(dragHandle(), body, actions);
  return li;
}

// Swap an item's text for an inline editor.
export function beginEdit(li, item, onSave) {
  if (li.querySelector('.todo-edit-input')) return;
  const body = li.querySelector('.todo-body');
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'todo-edit-input';
  input.value = item.text;
  body.replaceChildren(input);
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);

  let done = false;
  const commit = (save) => {
    if (done) return;
    done = true;
    const val = input.value.trim();
    if (save && val && val !== item.text) onSave(val);
    else renderItems();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(true); }
    else if (e.key === 'Escape') { e.preventDefault(); commit(false); }
  });
  input.addEventListener('blur', () => commit(true));
}
