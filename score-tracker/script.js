const KEY = 'score-tracker.players';

const $ = (id) => document.getElementById(id);
const listEl = $('players');
const emptyEl = $('empty');
const editListEl = $('edit-list');
const dialog = $('dlg-settings');
const nameInput = $('new-name');
const amountDialog = $('dlg-amount');
const amountInput = $('amount');

/** Persisted: [{ id, name }]. Scores are deliberately not stored. */
let players = load();

/** id -> array of adjustments, oldest first. The score is their sum. */
const history = new Map();

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (!Array.isArray(raw)) return [];
    return raw
      .map((p) => ({ id: String(p?.id ?? crypto.randomUUID()), name: String(p?.name ?? '').trim() }))
      .filter((p) => p.name);
  } catch {
    return [];
  }
}

function save() {
  localStorage.setItem(KEY, JSON.stringify(players));
}

const entriesOf = (id) => history.get(id) ?? [];
const scoreOf = (id) => entriesOf(id).reduce((sum, n) => sum + n, 0);
const signed = (n) => (n > 0 ? `+${n}` : `−${Math.abs(n)}`);

function render() {
  const leader = Math.max(...players.map((p) => scoreOf(p.id)));
  const hasLead = players.some((p) => scoreOf(p.id) !== 0);

  listEl.replaceChildren(...players.map((p) => {
    const score = scoreOf(p.id);

    const li = document.createElement('li');
    li.className = 'player';
    li.dataset.id = p.id;
    if (hasLead && score === leader) li.classList.add('is-leader');

    const row = document.createElement('button');
    row.className = 'row';
    row.setAttribute('aria-label', `${p.name}, ${score}. Add or subtract points`);

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = p.name;

    const total = document.createElement('span');
    total.className = 'score';
    total.textContent = score;

    const entries = document.createElement('span');
    entries.className = 'history';
    entries.append(...entriesOf(p.id).map((n) => {
      const chip = document.createElement('span');
      chip.className = `chip ${n < 0 ? 'down' : 'up'}`;
      chip.textContent = signed(n);
      return chip;
    }));

    row.append(name, total, entries);
    li.append(row);
    return li;
  }));

  emptyEl.hidden = players.length > 0;
}

function adjust(id, delta) {
  history.set(id, [...entriesOf(id), delta]);
  render();
}

listEl.addEventListener('click', (e) => {
  const row = e.target.closest('.row');
  if (row) openAmount(row.closest('.player').dataset.id);
});

/* Arbitrary amounts */

let amountFor = null;

function openAmount(id) {
  const player = players.find((p) => p.id === id);
  if (!player) return;
  amountFor = id;
  $('amount-title').textContent = `${player.name} — ${scoreOf(id)}`;
  amountInput.value = '';
  amountDialog.showModal();
  amountInput.focus();
}

function applyAmount(sign) {
  const value = Number(amountInput.value);
  if (!amountFor || !Number.isFinite(value) || value === 0) return amountDialog.close();
  adjust(amountFor, sign * value);
  amountDialog.close();
}

$('btn-amount-add').addEventListener('click', () => applyAmount(1));
$('btn-amount-subtract').addEventListener('click', () => applyAmount(-1));
$('btn-amount-cancel').addEventListener('click', () => amountDialog.close());

amountInput.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  applyAmount(1);
});

amountDialog.addEventListener('click', (e) => {
  if (e.target === amountDialog) amountDialog.close();
});

amountDialog.addEventListener('close', () => { amountFor = null; });

$('btn-reset').addEventListener('click', () => {
  history.clear();
  render();
});

/* Settings */

function renderEditList() {
  editListEl.replaceChildren(...players.map((p) => {
    const li = document.createElement('li');
    li.dataset.id = p.id;

    const input = document.createElement('input');
    input.className = 'edit-name';
    input.value = p.name;
    input.setAttribute('aria-label', 'Player name');

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove';
    remove.textContent = 'Remove';
    remove.setAttribute('aria-label', `Remove ${p.name}`);

    li.append(input, remove);
    return li;
  }));
}

function openSettings() {
  renderEditList();
  dialog.showModal();
  nameInput.focus();
}

function addPlayer() {
  const name = nameInput.value.trim();
  if (!name) return;
  players.push({ id: crypto.randomUUID(), name });
  save();
  nameInput.value = '';
  nameInput.focus();
  renderEditList();
  render();
}

$('btn-settings').addEventListener('click', openSettings);
$('btn-empty-add').addEventListener('click', openSettings);
$('btn-add').addEventListener('click', addPlayer);

nameInput.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  addPlayer();
});

editListEl.addEventListener('click', (e) => {
  if (!e.target.closest('.remove')) return;
  const li = e.target.closest('li');
  players = players.filter((p) => p.id !== li.dataset.id);
  history.delete(li.dataset.id);
  save();
  renderEditList();
  render();
});

editListEl.addEventListener('input', (e) => {
  const input = e.target.closest('.edit-name');
  if (!input) return;
  const player = players.find((p) => p.id === input.closest('li').dataset.id);
  if (!player) return;
  player.name = input.value.trim();
  save();
  render();
});

$('btn-clear').addEventListener('click', () => {
  if (!players.length || !confirm('Remove all players?')) return;
  players = [];
  history.clear();
  save();
  renderEditList();
  render();
});

dialog.addEventListener('click', (e) => {
  if (e.target === dialog) dialog.close();
});

/* Keyboard inset

   The on-screen keyboard resizes the visual viewport, not the layout one, so
   dvh does not shrink and a full-screen dialog's footer ends up behind the
   keyboard. interactive-widget=resizes-content fixes that in Chromium; these
   custom properties cover the browsers that ignore it. */

const viewport = window.visualViewport;

if (viewport) {
  const trackViewport = () => {
    const style = document.documentElement.style;
    style.setProperty('--keyboard-height', `${viewport.height}px`);
    style.setProperty('--keyboard-top', `${viewport.offsetTop}px`);
  };

  viewport.addEventListener('resize', trackViewport);
  viewport.addEventListener('scroll', trackViewport);
  trackViewport();
}

render();
