import {
  state, subscribe, current, facingBet, toCall, topBet, validStake, settled, soleWinner, STREETS,
  denom, pendingTotal, breakdown, stakeChips, unit,
  stage, unstage, allIn, setStake, commit, pass, award, undo, returnBets, nextStreet,
  resetStacks, endGame, setTurn, setStack,
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
const betInput = document.getElementById('bet-input');

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
  document.getElementById('street-name').textContent = STREETS[state.street];
  renderSeats();
  renderPot();
  renderTray();
  renderTurn();
}

function renderSeats() {
  if (seatsEl.children.length !== state.players.length) {
    seatsEl.textContent = '';
    state.players.forEach(() => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'player-card';
      row.innerHTML = /* HTML */ `
        <span class="pc-pos"></span>
        <span class="pc-name"></span>
        <span class="pc-bet"></span>
        <span class="pc-stack"></span>
      `;
      seatsEl.append(row);
    });
  }

  state.players.forEach((player, i) => {
    const row = seatEl(i);
    row.classList.toggle('active', i === state.turn);
    row.classList.toggle('out', (player.stack === 0 && player.bet === 0) || player.folded);
    row.querySelector('.pc-pos').textContent = i === state.dealer ? 'D' : i + 1;
    row.querySelector('.pc-pos').classList.toggle('dealer', i === state.dealer);
    row.querySelector('.pc-name').textContent = player.name;
    row.querySelector('.pc-stack').textContent = fmt.format(player.stack);
    const [label, owes] = status(player);
    const bet = row.querySelector('.pc-bet');
    bet.hidden = !label;
    bet.textContent = label;
    bet.classList.toggle('owes', owes);
    row.onclick = () => !busy && setTurn(i);
    if (i === state.turn) row.scrollIntoView({ block: 'nearest' });
  });
}

/** Pill text for a seat, and whether that player still has to act. */
function status(player) {
  if (player.folded) return ['folded', false];
  if (!player.stack && !player.bet) return ['', false];
  if (!player.stack) return [`all in ${fmt.format(player.bet)}`, false];
  const owed = topBet() - player.street;
  if (!settled() && owed > 0) return [`to call ${fmt.format(Math.min(owed, player.stack))}`, true];
  const amount = fmt.format(player.street);
  return {
    check: ['checked', false],
    call: [`called ${amount}`, false],
    bet: [`bet ${amount}`, false],
    raise: [`raised to ${amount}`, false],
  }[player.action] ?? ['', false];
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
  const done = settled();
  panelEl.classList.toggle('settled', done);
  document.getElementById('turn-name').textContent = player ? player.name : `${STREETS[state.street]} betting done`;
  document.getElementById('turn-stack').textContent = player ? fmt.format(player.stack) : '0';
  if (document.activeElement !== betInput) betInput.value = staged;
  betInput.max = player ? player.stack : 0;
  betInput.step = unit();

  const owed = toCall();
  const commitBtn = document.getElementById('btn-commit');
  commitBtn.disabled = staged ? !validStake() : !owed;
  commitBtn.textContent = commitLabel(player, staged, owed);

  const undoBtn = document.getElementById('btn-undo-chip');
  undoBtn.disabled = !state.pending.length && !state.undo;
  undoBtn.textContent = state.pending.length ? 'Take back' : 'Undo';
  document.getElementById('btn-allin').disabled = !player || player.stack === 0;
  document.getElementById('btn-pass').textContent = facingBet() ? 'Fold' : 'Pass';
  document.getElementById('btn-award').disabled = state.pot === 0;
  document.getElementById('btn-street').textContent = streetLabel();
}

function commitLabel(player, staged, owed) {
  if (!player) return 'Bet';
  // Nothing tapped while facing a bet: the button calls.
  if (!staged) return owed ? `Call ${fmt.format(owed)}` : 'Bet';
  if (staged === player.stack) return `All in ${fmt.format(staged)}`;
  if (staged < owed) return `Call ${fmt.format(owed)}`;
  if (staged === owed) return `Call ${fmt.format(staged)}`;
  return topBet() ? `Raise to ${fmt.format(player.street + staged)}` : `Bet ${fmt.format(staged)}`;
}

function streetLabel() {
  const winner = soleWinner();
  if (winner) return `${winner.name} wins ${fmt.format(state.pot)}`;
  return state.street < STREETS.length - 1 ? `Deal the ${STREETS[state.street + 1].toLowerCase()}` : 'Showdown';
}

/* ---------- actions ---------- */

function wire() {
  betInput.addEventListener('input', () => {
    if (betInput.value !== '') setStake(Number(betInput.value));
  });
  betInput.addEventListener('blur', () => {
    setStake(Number(betInput.value), { snap: true });
    betInput.value = pendingTotal();
  });

  document.getElementById('btn-undo-chip').addEventListener('click', () => {
    if (busy) return;
    // One button, two jobs: drop the last staged chip, or pull back the last bet.
    if (state.pending.length) return unstage();
    undo();
    renderPot(state.pot);
  });
  document.getElementById('btn-allin').addEventListener('click', () => !busy && allIn());
  document.getElementById('btn-pass').addEventListener('click', () => !busy && pass());
  document.getElementById('btn-commit').addEventListener('click', doCommit);
  document.getElementById('btn-street').addEventListener('click', () => {
    if (busy) return;
    const winner = soleWinner();
    if (winner) return doAward([winner.id]);
    if (state.street < STREETS.length - 1) return nextStreet();
    openAward();
  });
  document.getElementById('btn-award').addEventListener('click', openAward);
  document.getElementById('btn-settings').addEventListener('click', openSettings);
  document.getElementById('btn-split').addEventListener('click', () => {
    const inHand = state.players.filter((p) => p.bet > 0 && !p.folded);
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
  if (busy) return;
  // Nothing staged: the button is a call.
  if (!pendingTotal()) setStake(toCall());
  if (!validStake()) return;
  const chips = stakeChips();
  const from = seatEl(state.turn);
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
    if (player.folded) return;
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
