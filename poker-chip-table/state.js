const KEY = 'tools.poker-chip-table';

export const DEFAULT_DENOMS = [
  { key: 'white', label: 'White', value: 10 },
  { key: 'blue', label: 'Blue', value: 20 },
  { key: 'red', label: 'Red', value: 50 },
  { key: 'black', label: 'Black', value: 100 },
];

const listeners = new Set();

export const state = blank();

function blank() {
  return {
    started: false,
    startStack: 1000,
    denoms: DEFAULT_DENOMS.map((d) => ({ ...d })),
    players: [],
    round: 1,
    dealer: 0,
    turn: 0,
    pot: 0,
    potChips: {},
    pending: [], // chip keys staged by the player to act, in tap order
    undo: null, // snapshot of the last committed action
  };
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function changed() {
  save();
  listeners.forEach((fn) => fn(state));
}

function assign(next) {
  Object.keys(state).forEach((k) => delete state[k]);
  Object.assign(state, next);
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    const saved = JSON.parse(raw);
    if (!saved?.players?.length) return false;
    assign({ ...blank(), ...saved });
    return state.started;
  } catch {
    return false;
  }
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage full or blocked — the game still runs in memory */
  }
}

export function denom(key) {
  return state.denoms.find((d) => d.key === key);
}

export function pendingTotal() {
  return state.pending.reduce((sum, key) => sum + denom(key).value, 0);
}

export function current() {
  return state.players[state.turn];
}

export function activePlayers() {
  return state.players.filter((p) => p.stack > 0 || p.bet > 0);
}

/** Smallest set of chips that adds up to `amount`, largest first. */
export function breakdown(amount) {
  const out = [];
  let left = amount;
  [...state.denoms]
    .sort((a, b) => b.value - a.value)
    .forEach((d) => {
      const n = Math.floor(left / d.value);
      if (n > 0) out.push({ key: d.key, count: n });
      left -= n * d.value;
    });
  return out;
}

export function startGame({ startStack, denoms, names }) {
  assign({
    ...blank(),
    started: true,
    startStack,
    denoms,
    players: names.map((name, i) => ({ id: `p${i}-${Date.now()}`, name, stack: startStack, bet: 0 })),
  });
  changed();
}

export function stage(key) {
  const player = current();
  if (!player) return;
  if (pendingTotal() + denom(key).value > player.stack) return;
  state.pending.push(key);
  changed();
}

export function unstage() {
  state.pending.pop();
  changed();
}

export function allIn() {
  const player = current();
  if (!player) return;
  state.pending = breakdown(player.stack).flatMap(({ key, count }) => Array(count).fill(key));
  changed();
}

export function clearPending() {
  if (!state.pending.length) return;
  state.pending = [];
  changed();
}

/** Moves the staged chips into the pot and passes play on. */
export function commit() {
  const player = current();
  const amount = pendingTotal();
  if (!player || amount <= 0) return null;
  const chips = state.pending.slice();

  state.undo = { type: 'bet', turn: state.turn, chips, amount };
  player.stack -= amount;
  player.bet += amount;
  state.pot += amount;
  chips.forEach((key) => {
    state.potChips[key] = (state.potChips[key] || 0) + 1;
  });
  state.pending = [];
  advance();
  changed();
  return { player, chips, amount };
}

export function pass() {
  state.pending = [];
  state.undo = null;
  advance();
  changed();
}

export function undoBet() {
  const last = state.undo;
  if (!last || last.type !== 'bet') return;
  const player = state.players[last.turn];
  player.stack += last.amount;
  player.bet -= last.amount;
  state.pot -= last.amount;
  last.chips.forEach((key) => {
    state.potChips[key] = Math.max(0, (state.potChips[key] || 0) - 1);
  });
  state.turn = last.turn;
  state.undo = null;
  changed();
}

export function setTurn(index) {
  if (index < 0 || index >= state.players.length) return;
  state.pending = [];
  state.turn = index;
  changed();
}

function advance() {
  const total = state.players.length;
  for (let step = 1; step <= total; step++) {
    const next = (state.turn + step) % total;
    if (state.players[next].stack > 0) {
      state.turn = next;
      return;
    }
  }
  state.turn = (state.turn + 1) % total;
}

/** Hands the pot to one or more winners and deals the next round. */
export function award(ids) {
  const winners = state.players.filter((p) => ids.includes(p.id));
  if (!winners.length || state.pot <= 0) return null;
  // Split in whole chips of the smallest denomination; the odd chips go to the last winner.
  const unit = Math.min(...state.denoms.map((d) => d.value));
  const share = Math.floor(state.pot / winners.length / unit) * unit;
  let left = state.pot;
  winners.forEach((p, i) => {
    const amount = i === winners.length - 1 ? left : share;
    p.stack += amount;
    left -= amount;
  });
  const won = state.pot;
  nextRound();
  changed();
  return { winners, won };
}

/** Pulls every bet back out of the pot — for a misdeal or a wrong tap. */
export function returnBets() {
  state.players.forEach((p) => {
    p.stack += p.bet;
    p.bet = 0;
  });
  state.pot = 0;
  state.potChips = {};
  state.pending = [];
  state.undo = null;
  changed();
}

export function resetStacks() {
  state.players.forEach((p) => {
    p.stack = state.startStack;
    p.bet = 0;
  });
  state.pot = 0;
  state.potChips = {};
  state.pending = [];
  state.round = 1;
  state.dealer = 0;
  state.turn = 0;
  state.undo = null;
  changed();
}

export function endGame() {
  assign({ ...blank(), startStack: state.startStack, denoms: state.denoms, players: state.players });
  changed();
}

function nextRound() {
  state.players.forEach((p) => (p.bet = 0));
  state.pot = 0;
  state.potChips = {};
  state.pending = [];
  state.undo = null;
  state.round += 1;
  state.dealer = (state.dealer + 1) % state.players.length;
  state.turn = state.dealer;
  if (!state.players[state.turn].stack) advance();
}

export function setStack(id, value) {
  const player = state.players.find((p) => p.id === id);
  if (!player) return;
  player.stack = Math.max(0, Math.round(value) || 0);
  changed();
}
