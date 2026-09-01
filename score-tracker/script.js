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
const scores = new Map();

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

const step = () => Number(document.querySelector('input[name="step"]:checked').value);
const scoreOf = (id) => scores.get(id) ?? 0;

function render() {
  const leader = Math.max(...players.map((p) => scoreOf(p.id)));
  const hasLead = players.some((p) => scoreOf(p.id) !== 0);

  listEl.replaceChildren(...players.map((p) => {
    const li = document.createElement('li');
    li.className = 'player';
    li.dataset.id = p.id;
    if (hasLead && scoreOf(p.id) === leader) li.classList.add('is-leader');

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = p.name;

    const score = document.createElement('button');
    score.className = 'score';
    score.textContent = scoreOf(p.id);
    score.setAttribute('aria-label', `Add or subtract an amount for ${p.name}`);

    li.append(name, score, button('minus', '−', `Subtract from ${p.name}`), button('plus', '+', `Add to ${p.name}`));
    return li;
  }));

  emptyEl.hidden = players.length > 0;
}

function button(kind, glyph, label) {
  const btn = document.createElement('button');
  btn.className = `adjust ${kind}`;
  btn.dataset.dir = kind === 'plus' ? '1' : '-1';
  btn.setAttribute('aria-label', label);
  btn.textContent = glyph;
  return btn;
}

function adjust(id, delta) {
  scores.set(id, scoreOf(id) + delta);
  render();
}

listEl.addEventListener('click', (e) => {
  const btn = e.target.closest('.adjust');
  if (btn) {
    adjust(btn.closest('.player').dataset.id, Number(btn.dataset.dir) * step());
    return;
  }
  const score = e.target.closest('.score');
  if (score) openAmount(score.closest('.player').dataset.id);
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
  scores.clear();
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
  scores.delete(li.dataset.id);
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
  scores.clear();
  save();
  renderEditList();
  render();
});

dialog.addEventListener('click', (e) => {
  if (e.target === dialog) dialog.close();
});

render();
