// =============================================
// Cook Planner — sim-clock.js
//
// A fake clock, so the timeline can be watched at half past without standing
// in the kitchen until half past. Everything in the app that asks the time
// asks here, which is what makes one setting move the whole thing at once: the
// countdown, the current-stage band, the chimes and the next-up panel.
//
// Simulated time is *derived* from real time rather than counted up, so a
// missed tick or a backgrounded tab can't make it drift: an anchor pair (the
// real clock when it was set, the simulated second-of-day it was set to) and a
// rate are enough to work out the answer at any later moment. Pausing drops
// the real term and leaves the anchor.
// =============================================

const listeners = new Set();

let anchorReal = 0;     // Date.now() when the simulated time was last set
let anchorSim = null;   // second-of-day it was set to; null means the real clock
let rate = 1;           // simulated seconds per real second
let paused = false;

const DAY = 86400;

export function isSimulated() { return anchorSim !== null; }
export function getRate()     { return rate; }
export function isPaused()    { return paused; }

export function nowSecsOfDay() {
  if (anchorSim === null) return realSecsOfDay();
  if (paused) return anchorSim;
  return anchorSim + (Date.now() - anchorReal) / 1000 * rate;
}

// A real Date carrying the simulated time of day, so every existing caller —
// toLocaleTimeString, getHours() — keeps working untouched.
export function now() {
  if (anchorSim === null) return new Date();
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  return new Date(midnight.getTime() + nowSecsOfDay() * 1000);
}

function realSecsOfDay() {
  const d = new Date();
  return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
}

// Re-anchoring on every change is what keeps `rate` honest: without it the
// seconds already elapsed would be re-counted at the new rate.
function reanchor(simSecs) {
  anchorSim = ((simSecs % DAY) + DAY) % DAY;
  anchorReal = Date.now();
}

export function setSimSecs(secs) { reanchor(secs); emit(); }
export function setSimMins(mins) { setSimSecs(mins * 60); }
export function nudgeMins(delta) { setSimSecs(nowSecsOfDay() + delta * 60); }

export function setRate(r) {
  reanchor(nowSecsOfDay());
  rate = r;
  paused = false;
  emit();
}

// Pausing (or nudging) while the real clock is in charge is itself a request to
// simulate — it freezes wherever the real clock had got to.
export function setPaused(p) {
  reanchor(nowSecsOfDay());
  paused = p;
  emit();
}

export function useRealClock() {
  anchorSim = null;
  paused = false;
  rate = 1;
  emit();
}

export function onSimChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) fn();
}
