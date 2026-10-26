const KEY = 'tools.poker-chip-table';

export const DEFAULT_DENOMS = [
  { key: 'white', label: 'White', value: 10 },
  { key: 'blue', label: 'Blue', value: 20 },
  { key: 'red', label: 'Red', value: 50 },
  { key: 'black', label: 'Black', value: 100 },
];

export const STREETS = ['Pre-flop', 'Flop', 'Turn', 'River'];

const listeners = new Set();

export const state = blank();

function blank() {
  return {
    started: false,
    startStack: 1000,
    blinds: { small: 10, big: 20 },
    denoms: DEFAULT_DENOMS.map((d) => ({ ...d })),
    players: [],
    round: 1,
    dealer: 0,
    street: 0, // index into STREETS
    lastRaise: 0, // size of the last full raise this street — the next must be at least as big
    turn: 0, // -1 once the betting round is settled
    pot: 0,
    potChips: {},
    stake: 0, // amount the player to act is putting in
    pending: [], // chips they tapped, in tap order — typed amounts leave this empty
    undo: null, // snapshot taken before the last bet, pass or fold
    log: [], // what has happened this hand
    history: [], // earlier hands, newest first: { round, lines }
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
    state.players = state.players.map((p) => ({ ...seat(p.name), ...p }));
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
  return state.players[state.turn] ?? null;
}

function seat(name, stack = 0) {
  // bet: total in the pot this hand; street: put in during this betting round
  return { id: `p-${crypto.randomUUID()}`, name, stack, bet: 0, street: 0, acted: false, folded: false, action: '' };
}

/** Highest amount anyone has put in this betting round — the minimum to stay in. */
export function topBet() {
  return Math.max(0, ...state.players.map((p) => p.street));
}

export function toCall(player = current()) {
  return player ? Math.min(topBet() - player.street, player.stack) : 0;
}

/** Smallest total a player can raise this street to: the top bet plus the last raise (at least the big blind). */
export function minRaiseTo() {
  return topBet() + Math.max(state.lastRaise, state.blinds.big || unit());
}

export function facingBet() {
  return toCall() > 0;
}

export function livePlayers() {
  return state.players.filter((p) => !p.folded && (p.stack > 0 || p.bet > 0));
}

function canAct(p) {
  return !p.folded && p.stack > 0;
}

function needsToAct(p) {
  return canAct(p) && (!p.acted || p.street < topBet());
}

/** Everyone still in has matched the top bet (or is all in), or only one player is left. */
export function settled() {
  const live = livePlayers();
  if (live.length <= 1) return true;
  const actors = live.filter(canAct);
  if (actors.length <= 1) return actors.every((p) => p.street >= topBet());
  return !actors.some(needsToAct);
}

/** Only one player hasn't folded, so the pot is theirs without a showdown. */
export function soleWinner() {
  const live = livePlayers();
  return live.length === 1 ? live[0] : null;
}

/**
 * The pot split into a main pot and side pots. Each player can only win as much
 * from each opponent as they put in themselves, so an all-in player is only
 * eligible for the pots their bet reached. Folded bets count, but folded players
 * can't win.
 */
export function pots() {
  const live = state.players.filter((p) => !p.folded && p.bet > 0);
  const levels = [...new Set(live.map((p) => p.bet))].sort((a, b) => a - b);
  const out = [];
  let prev = 0;
  levels.forEach((level) => {
    const amount = state.players.reduce((sum, p) => sum + Math.max(0, Math.min(p.bet, level) - prev), 0);
    const ids = live.filter((p) => p.bet >= level).map((p) => p.id);
    // Same players as the pot below (a folded bet sat between levels): merge them.
    const last = out.at(-1);
    if (last && last.ids.length === ids.length) last.amount += amount;
    else out.push({ amount, ids });
    prev = level;
  });
  // Folded bets above the highest live bet still belong to the last pot.
  const rest = state.pot - out.reduce((sum, pot) => sum + pot.amount, 0);
  if (out.length) out.at(-1).amount += rest;
  else if (state.pot) out.push({ amount: state.pot, ids: state.players.map((p) => p.id) });
  return out;
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

export function startGame({ startStack, denoms, names, blinds }) {
  assign({
    ...blank(),
    started: true,
    startStack,
    denoms,
    blinds,
    players: names.map((name) => seat(name, startStack)),
  });
  newHand();
  changed();
}

export function setBlinds(blinds) {
  state.blinds = blinds;
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

/** A bet is a call or at least a minimum raise — unless it puts the player all in. */
export function validStake(amount = state.stake) {
  const player = current();
  if (!player || amount <= 0) return false;
  if (amount === player.stack) return true;
  return amount === toCall(player) || player.street + amount >= minRaiseTo();
}

/** Moves the staged chips into the pot and passes play on. */
export function commit() {
  const player = current();
  if (!player) return null;
  // Bets are whole chips, but never more than the player actually has.
  const amount = Math.min(Math.round(state.stake / unit()) * unit(), player.stack);
  if (!validStake(amount)) return null;
  const chips = stakeChips(amount);
  const top = topBet();

  snapshot();
  player.stack -= amount;
  player.bet += amount;
  player.street += amount;
  player.acted = true;
  state.pot += amount;
  chips.forEach((key) => {
    state.potChips[key] = (state.potChips[key] || 0) + 1;
  });
  if (player.street > top) {
    // A raise: everyone else has to meet it or fold.
    state.players.forEach((p) => p !== player && (p.acted = false));
    // A short all-in doesn't set a new minimum raise.
    state.lastRaise = Math.max(state.lastRaise, player.street - top);
    player.action = top ? 'raise' : 'bet';
  } else {
    player.action = 'call';
  }
  const words = { raise: `raises to ${player.street}`, bet: `bets ${amount}`, call: `calls ${amount}` };
  note(`${player.name} ${words[player.action]}${player.stack ? '' : ' (all in)'}`);
  if (!player.stack) player.action = 'all in';
  reset();
  advance();
  changed();
  return { player, chips, amount };
}

/** Check when nothing is owed, otherwise fold. */
export function pass() {
  const player = current();
  if (!player) return;
  snapshot();
  if (facingBet()) {
    player.folded = true;
    player.action = 'fold';
  } else {
    player.action = 'check';
  }
  note(`${player.name} ${player.action}s`);
  player.acted = true;
  reset();
  advance();
  changed();
}

function snapshot() {
  const { players, pot, potChips, turn, lastRaise, log } = state;
  state.undo = structuredClone({ players, pot, potChips, turn, lastRaise, log });
}

export function undo() {
  if (!state.undo) return;
  Object.assign(state, state.undo);
  state.undo = null;
  reset();
  changed();
}

/** Hand the turn to someone else, e.g. when play went out of order. */
export function setTurn(index) {
  const player = state.players[index];
  if (!player || !canAct(player)) return;
  reset();
  state.turn = index;
  changed();
}

function reset() {
  state.stake = 0;
  state.pending = [];
}

/** Next player clockwise who still owes an action, or -1 once the round is settled. */
function advance() {
  if (settled()) {
    state.turn = -1;
    return;
  }
  const total = state.players.length;
  for (let step = 1; step <= total; step++) {
    const next = (state.turn + step + total) % total;
    if (needsToAct(state.players[next])) {
      state.turn = next;
      return;
    }
  }
  state.turn = -1;
}

/** Play opens left of the dealer, so the dealer acts last. Pre-flop it opens left of the big blind. */
function firstTurn(from = state.dealer) {
  state.turn = from;
  advance();
}

function note(line) {
  state.log.push(line);
}

/** Next seat clockwise after `index` that still has chips. */
function nextWithChips(index) {
  const total = state.players.length;
  for (let step = 1; step <= total; step++) {
    const i = (index + step) % total;
    if (state.players[i].stack > 0) return i;
  }
  return index;
}

function postBlind(index, size, name) {
  const player = state.players[index];
  const amount = Math.min(size, player.stack);
  if (amount <= 0) return;
  player.stack -= amount;
  player.bet += amount;
  player.street += amount;
  state.pot += amount;
  breakdown(amount).forEach(({ key, count }) => {
    state.potChips[key] = (state.potChips[key] || 0) + count;
  });
  player.action = player.stack ? (name === 'big blind' ? 'bb' : 'sb') : 'all in';
  note(`${player.name} posts ${name} ${amount}${player.stack ? '' : ' (all in)'}`);
}

/** Posts the blinds and returns the big blind's seat, so play starts after it. */
function postBlinds() {
  const { small, big } = state.blinds;
  if (!big) return state.dealer;
  const seated = state.players.filter((p) => p.stack > 0).length;
  if (seated < 2) return state.dealer;
  // Heads up, the dealer is the small blind.
  const sb = seated === 2 ? (state.players[state.dealer].stack ? state.dealer : nextWithChips(state.dealer)) : nextWithChips(state.dealer);
  const bb = nextWithChips(sb);
  if (small) postBlind(sb, small, 'small blind');
  postBlind(bb, big, 'big blind');
  return bb;
}

function clearStreet() {
  state.players.forEach((p) => {
    p.street = 0;
    p.acted = false;
    if (!p.folded) p.action = '';
  });
}

/** Deals the next street and reopens betting. */
export function nextStreet() {
  if (!settled() || soleWinner() || state.street >= STREETS.length - 1) return;
  state.street += 1;
  state.lastRaise = 0;
  note(STREETS[state.street]);
  clearStreet();
  reset();
  state.undo = null;
  firstTurn();
  changed();
}

/**
 * Pays out the pot and deals the next round. `splits` is one entry per pot:
 * { amount, ids } — the pot's size and who won it.
 */
export function award(splits) {
  if (state.pot <= 0 || !splits.length) return null;
  // Split in whole chips of the smallest denomination; the odd chips go to the last winner.
  const step = unit();
  splits.forEach(({ amount, ids }) => {
    const winners = state.players.filter((p) => ids.includes(p.id));
    const share = Math.floor(amount / winners.length / step) * step;
    let left = amount;
    winners.forEach((p, i) => {
      const won = i === winners.length - 1 ? left : share;
      p.stack += won;
      left -= won;
      note(`${p.name} wins ${won}`);
    });
  });
  nextRound();
  changed();
  return splits;
}

function newHand() {
  state.players.forEach((p) => {
    p.bet = 0;
    p.folded = false;
  });
  clearStreet();
  state.pot = 0;
  state.potChips = {};
  state.street = 0;
  state.lastRaise = 0;
  reset();
  state.undo = null;
  state.log = [STREETS[0]];
  firstTurn(postBlinds());
}

/** Pulls every bet back out of the pot — for a misdeal or a wrong tap. */
export function returnBets() {
  state.players.forEach((p) => (p.stack += p.bet));
  archive('bets returned');
  newHand();
  changed();
}

export function resetStacks() {
  state.players.forEach((p) => (p.stack = state.startStack));
  state.history = [];
  state.round = 1;
  state.dealer = 0;
  newHand();
  changed();
}

export function endGame() {
  // Keep only the table setup; every stack, bet and log goes.
  const { startStack, denoms, blinds, players } = state;
  assign({ ...blank(), startStack, denoms, blinds, players: players.map((p) => seat(p.name, startStack)) });
  changed();
}

/** Moves this hand's log into the history, keeping the last few hands. */
function archive(end) {
  if (end) note(end);
  if (state.log.length) state.history = [{ round: state.round, lines: state.log }, ...state.history].slice(0, 20);
  state.log = [];
}

function nextRound() {
  archive();
  state.round += 1;
  state.dealer = (state.dealer + 1) % state.players.length;
  newHand();
}

export function setStack(id, value) {
  const player = state.players.find((p) => p.id === id);
  if (!player) return;
  player.stack = Math.max(0, Math.round(value) || 0);
  changed();
}
