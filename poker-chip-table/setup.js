import { state, startGame, DEFAULT_DENOMS } from './state.js';

const form = document.getElementById('setup-form');
const stackInput = document.getElementById('start-stack');
const denomRows = document.getElementById('denom-rows');
const playerRows = document.getElementById('player-rows');

let names = [];
let denoms = [];

export function initSetup(onStart) {
  names = state.players.length
    ? state.players.map((p) => p.name)
    : ['Player 1', 'Player 2', 'Player 3', 'Player 4'];
  denoms = (state.denoms.length ? state.denoms : DEFAULT_DENOMS).map((d) => ({ ...d }));
  stackInput.value = state.startStack || 1000;

  renderDenoms();
  renderPlayers();

  document.getElementById('btn-add-player').addEventListener('click', () => {
    if (names.length >= 10) return;
    names.push(`Player ${names.length + 1}`);
    renderPlayers();
    playerRows.querySelector('li:last-child input')?.focus();
  });

  document.getElementById('btn-shuffle').addEventListener('click', () => {
    readNames();
    for (let i = names.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [names[i], names[j]] = [names[j], names[i]];
    }
    renderPlayers();
  });

  form.querySelectorAll('.preset').forEach((btn) => {
    btn.addEventListener('click', () => {
      stackInput.value = btn.dataset.stack;
    });
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    readNames();
    denoms = denoms.map((d, i) => ({
      ...d,
      value: Math.max(1, Number(denomRows.querySelectorAll('input')[i].value) || d.value),
    }));
    startGame({
      startStack: Math.max(0, Number(stackInput.value) || 0),
      denoms,
      names: names.map((n, i) => n.trim() || `Player ${i + 1}`),
    });
    onStart();
  });
}

function readNames() {
  names = [...playerRows.querySelectorAll('input')].map((input) => input.value);
}

function renderDenoms() {
  denomRows.textContent = '';
  denoms.forEach((d) => {
    const row = document.createElement('label');
    row.className = 'denom-row';
    row.innerHTML = /* HTML */ `
      <span class="chip chip-${d.key}" aria-hidden="true"></span>
      <span class="denom-name">${d.label}</span>
      <input type="number" min="1" step="1" inputmode="numeric" value="${d.value}" aria-label="${d.label} chip value">
    `;
    denomRows.append(row);
  });
}

function renderPlayers() {
  playerRows.textContent = '';
  names.forEach((name, i) => {
    const row = document.createElement('li');
    row.className = 'player-row';
    row.innerHTML = /* HTML */ `
      <span class="seat-no">${i + 1}</span>
      <input type="text" value="" maxlength="16" autocomplete="off" aria-label="Player ${i + 1} name">
      <button type="button" class="icon-btn" data-move="-1" aria-label="Move ${name} up">&#9650;</button>
      <button type="button" class="icon-btn" data-move="1" aria-label="Move ${name} down">&#9660;</button>
      <button type="button" class="icon-btn remove" data-remove aria-label="Remove ${name}">&times;</button>
    `;
    const input = row.querySelector('input');
    input.value = name;
    input.addEventListener('input', () => {
      names[i] = input.value;
    });

    row.querySelectorAll('[data-move]').forEach((btn) => {
      const dir = Number(btn.dataset.move);
      btn.disabled = (dir === -1 && i === 0) || (dir === 1 && i === names.length - 1);
      btn.addEventListener('click', () => {
        readNames();
        [names[i], names[i + dir]] = [names[i + dir], names[i]];
        renderPlayers();
      });
    });

    row.querySelector('[data-remove]').disabled = names.length <= 2;
    row.querySelector('[data-remove]').addEventListener('click', () => {
      readNames();
      names.splice(i, 1);
      renderPlayers();
    });

    playerRows.append(row);
  });
}
