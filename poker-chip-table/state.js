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
    stake: 0, // amount the player to act is putting in
    pending: [], // chips they tapped, in tap order — typed amounts leave this empty
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
  return state.stake;
}

/** The smallest chip value, which every bet is a multiple of. */
export function unit() {
  return Math.min(...state.denoms.map((d) => d.value));
}

/** The chips a bet is made of: the tapped ones, or a breakdown of a typed amount. */
export function stakeChips(amount = state.stake) {
  const tapped = state.pending.reduce((sum, key) => sum + denom(key).value, 0);
  return tapped === amount
    ? state.pending.slice()
    : breakdown(amount).flatMap(({ key, count }) => Array(count).fill(key));
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
  const value = denom(key).value;
  if (state.stake + value > player.stack) return;
  state.pending.push(key);
  state.stake += value;
  changed();
}

/**
 * Typed amount, capped at the player's stack. `snap` rounds to whole chips —
 * left off while the field is being typed into, applied when it is left.
 */
export function setStake(amount, { snap = false } = {}) {
  const player = current();
  if (!player) return;
  let value = Math.max(0, Math.round(amount) || 0);
  if (snap) value = Math.round(value / unit()) * unit();
  state.stake = Math.min(value, player.stack);
  state.pending = [];
  changed();
}

export function unstage() {
  if (state.pending.length) {
    state.stake -= denom(state.pending.pop()).value;
  } else {
    state.stake = 0;
  }
  changed();
}

export function allIn() {
  const player = current();
  if (!player) return;
  state.stake = player.stack;
  state.pending = [];
  changed();
}

/** Moves the staged chips into the pot and passes play on. */
export function commit() {
  const player = current();
  if (!player) return null;
  // Bets are whole chips, but never more than the player actually has.
  const amount = Math.min(Math.round(state.stake / unit()) * unit(), player.stack);
  if (amount <= 0) return null;
  const chips = stakeChips(amount);

  state.undo = { type: 'bet', turn: state.turn, chips, amount };
  player.stack -= amount;
  player.bet += amount;
  state.pot += amount;
  chips.forEach((key) => {
    state.potChips[key] = (state.potChips[key] || 0) + 1;
  });
  reset();
  advance();
  changed();
  return { player, chips, amount };
}

export function pass() {
  reset();
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
  reset();
  state.turn = index;
  changed();
}

function reset() {
  state.stake = 0;
  state.pending = [];
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
  const step = unit();
  const share = Math.floor(state.pot / winners.length / step) * step;
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
  reset();
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
  reset();
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
  reset();
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
