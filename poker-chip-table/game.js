import {
  state, subscribe, current, denom, pendingTotal, breakdown,
  stage, unstage, allIn, commit, pass, award, undoBet, returnBets, resetStacks,
  endGame, setTurn, setStack,
} from './state.js';
import { fly, renderPile, pulse, chipEl } from './chips.js';

const seatsEl = document.getElementById('seats');
const potEl = document.getElementById('pot');
const potChipsEl = document.getElementById('pot-chips');
const potTotalEl = document.getElementById('pot-total');
const trayEl = document.getElementById('chip-tray');
const panelEl = document.getElementById('turn-panel');
const dlgAward = document.getElementById('dlg-award');
const dlgSettings = document.getElementById('dlg-settings');

const fmt = new Intl.NumberFormat();
let busy = false;
let potShown = 0;
let onExit = () => {};

export function initGame(exit) {
  onExit = exit;
  subscribe(render);
  wire();
  potShown = state.pot;
  render();
}

function seatEl(index) {
  return seatsEl.children[index];
}

function setBusy(value) {
  busy = value;
  panelEl.classList.toggle('busy', value);
}

/* ---------- rendering ---------- */

function render() {
  document.getElementById('round-no').textContent = state.round;
  renderSeats();
  renderPot();
  renderTray();
  renderTurn();
}

function renderSeats() {
  const n = state.players.length;
  if (seatsEl.children.length !== n) {
    seatsEl.textContent = '';
    state.players.forEach(() => {
      const seat = document.createElement('button');
      seat.type = 'button';
      seat.className = 'seat';
      seat.innerHTML = /* HTML */ `
        <span class="seat-dealer" hidden>D</span>
        <span class="seat-name"></span>
        <span class="seat-stack"></span>
        <span class="seat-bet" hidden></span>
      `;
      seatsEl.append(seat);
    });
  }

  state.players.forEach((player, i) => {
    const seat = seatEl(i);
    // Seat 0 sits at the bottom, nearest whoever is holding the phone.
    const angle = Math.PI / 2 + (i / n) * Math.PI * 2;
    seat.style.left = `${50 + Math.cos(angle) * 50}%`;
    seat.style.top = `${50 + Math.sin(angle) * 50}%`;
    seat.classList.toggle('active', i === state.turn);
    seat.classList.toggle('out', player.stack === 0 && player.bet === 0);
    seat.querySelector('.seat-name').textContent = player.name;
    seat.querySelector('.seat-stack').textContent = fmt.format(player.stack);
    seat.querySelector('.seat-dealer').hidden = i !== state.dealer;
    const bet = seat.querySelector('.seat-bet');
    bet.hidden = player.bet === 0;
    bet.textContent = `bet ${fmt.format(player.bet)}`;
    seat.onclick = () => !busy && setTurn(i);
  });
}

function renderPot(total = potShown) {
  potShown = total;
  potTotalEl.textContent = fmt.format(total);
  const counts = total === state.pot
    ? state.potChips
    : Object.fromEntries(breakdown(total).map(({ key, count }) => [key, count]));
  renderPile(potChipsEl, counts);
  potEl.classList.toggle('empty', total === 0);
}

function renderTray() {
  if (trayEl.children.length !== state.denoms.length) {
    trayEl.textContent = '';
    state.denoms.forEach((d) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tray-chip';
      btn.dataset.key = d.key;
      btn.append(chipEl(d.key));
      const count = document.createElement('span');
      count.className = 'tray-count';
      btn.append(count);
      btn.addEventListener('click', () => {
        if (busy) return;
        stage(d.key);
        pulse(btn);
      });
      trayEl.append(btn);
    });
  }

  const player = current();
  const staged = pendingTotal();
  [...trayEl.children].forEach((btn) => {
    const d = denom(btn.dataset.key);
    btn.querySelector('.chip').textContent = fmt.format(d.value);
    const count = state.pending.filter((k) => k === d.key).length;
    btn.querySelector('.tray-count').textContent = count ? `×${count}` : '';
    btn.classList.toggle('has-chips', count > 0);
    btn.disabled = !player || staged + d.value > player.stack;
  });
}

function renderTurn() {
  const player = current();
  const staged = pendingTotal();
  document.getElementById('turn-name').textContent = player ? player.name : '—';
  document.getElementById('turn-stack').textContent = player ? fmt.format(player.stack) : '0';
  document.getElementById('turn-bet').textContent = fmt.format(staged);
  document.getElementById('btn-commit').disabled = staged <= 0;
  document.getElementById('btn-commit').textContent = staged ? `Bet ${fmt.format(staged)}` : 'Bet';
  const undo = document.getElementById('btn-undo-chip');
  undo.disabled = !state.pending.length && !state.undo;
  undo.textContent = state.pending.length ? 'Take back' : 'Undo bet';
  document.getElementById('btn-allin').disabled = !player || player.stack === 0;
  document.getElementById('btn-award').disabled = state.pot === 0;
}

/* ---------- actions ---------- */

function wire() {
  document.getElementById('btn-undo-chip').addEventListener('click', () => {
    if (busy) return;
    // One button, two jobs: drop the last staged chip, or pull back the last bet.
    if (state.pending.length) return unstage();
    undoBet();
    renderPot(state.pot);
  });
  document.getElementById('btn-allin').addEventListener('click', () => !busy && allIn());
  document.getElementById('btn-pass').addEventListener('click', () => !busy && pass());
  document.getElementById('btn-commit').addEventListener('click', doCommit);
  document.getElementById('btn-award').addEventListener('click', openAward);
  document.getElementById('btn-settings').addEventListener('click', openSettings);
  document.getElementById('btn-split').addEventListener('click', () => {
    const inHand = state.players.filter((p) => p.bet > 0);
    doAward((inHand.length ? inHand : state.players).map((p) => p.id));
  });
  document.getElementById('btn-close-settings').addEventListener('click', () => dlgSettings.close());
  document.getElementById('btn-new-round').addEventListener('click', () => {
    returnBets();
    renderPot(0);
  });
  document.getElementById('btn-rebuy').addEventListener('click', () => {
    resetStacks();
    renderPot(0);
  });
  // Two taps rather than a second dialog on top of the settings one.
  const newGame = document.getElementById('btn-new-game');
  newGame.addEventListener('click', () => {
    if (newGame.dataset.armed !== 'yes') {
      newGame.dataset.armed = 'yes';
      newGame.textContent = 'Tap again to end this game';
      return;
    }
    dlgSettings.close();
    endGame();
    onExit();
  });
  dlgSettings.addEventListener('close', () => {
    delete newGame.dataset.armed;
    newGame.textContent = 'New game';
  });

  [dlgAward, dlgSettings].forEach((dlg) => {
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg) dlg.close();
    });
  });
}

async function doCommit() {
  const chips = state.pending.slice();
  const from = seatEl(state.turn);
  if (busy || !chips.length) return;
  setBusy(true);
  await fly(from, potEl, chips);
  commit();
  renderPot(state.pot);
  pulse(potEl);
  setBusy(false);
}

function openAward() {
  const list = document.getElementById('award-list');
  document.getElementById('award-total').textContent = fmt.format(state.pot);
  list.textContent = '';
  state.players.forEach((player, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'award-row';
    btn.innerHTML = /* HTML */ `
      <span class="award-name"></span>
      <span class="award-stack"></span>
    `;
    btn.querySelector('.award-name').textContent = player.name;
    btn.querySelector('.award-stack').textContent = `${fmt.format(player.stack)} → ${fmt.format(player.stack + state.pot)}`;
    btn.addEventListener('click', () => doAward([player.id], i));
    list.append(btn);
  });
  dlgAward.showModal();
}

async function doAward(ids, seatIndex) {
  dlgAward.close();
  const index = seatIndex ?? state.players.findIndex((p) => p.id === ids[0]);
  const chips = breakdown(state.pot).flatMap(({ key, count }) => Array(count).fill(key));
  setBusy(true);
  renderPile(potChipsEl, {});
  await fly(potEl, seatEl(index), chips, { spread: 40 });
  award(ids);
  renderPot(0);
  pulse(seatEl(index));
  setBusy(false);
}

function openSettings() {
  const wrap = document.getElementById('settings-stacks');
  wrap.textContent = '';
  state.players.forEach((player) => {
    const row = document.createElement('label');
    row.className = 'settings-row';
    row.innerHTML = /* HTML */ `
      <span class="settings-name"></span>
      <input type="number" min="0" step="10" inputmode="numeric">
    `;
    row.querySelector('.settings-name').textContent = player.name;
    const input = row.querySelector('input');
    input.value = player.stack;
    input.setAttribute('aria-label', `${player.name} stack`);
    input.addEventListener('change', () => setStack(player.id, Number(input.value)));
    wrap.append(row);
  });

  const legend = document.getElementById('settings-denoms');
  legend.textContent = '';
  state.denoms.forEach((d) => {
    const li = document.createElement('li');
    li.append(chipEl(d.key));
    const text = document.createElement('span');
    text.textContent = `${d.label} — ${fmt.format(d.value)}`;
    li.append(text);
    legend.append(li);
  });

  dlgSettings.showModal();
}
