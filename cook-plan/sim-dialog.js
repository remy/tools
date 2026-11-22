// =============================================
// Cook Planner — sim-dialog.js
//
// The controls for the fake clock: scrub to any point in the cook, step
// between stages, or let it run fast and watch the timeline work.
//
// Nothing here knows what the simulated time *does* -- it only sets it, and
// the rest of the app reacts because it reads the clock through sim-clock.js.
// =============================================

import { formatTime } from './utils.js';
import {
  nowSecsOfDay, isSimulated, isPaused, getRate,
  setSimMins, nudgeMins, setRate, setPaused, useRealClock, onSimChange,
} from './sim-clock.js';
import { resyncClock } from './clock.js';

const RATES = [1, 10, 60];
const NUDGES = [-30, -5, -1, 1, 5, 30];
const PAD = 20;   // minutes of slack either side of the cook on the scrubber

let events = [];
let ticker = null;
let dragging = false;
let wired = false;

// Called on every render of the schedule view: the cog and the simulate button
// are new elements each time, while the dialog and the status pill live in
// index.html and are wired once.
export function initSimUI(evs) {
  events = evs || [];
  document.getElementById('btn-simulate')?.addEventListener('click', openSimDialog);
  if (!wired) {
    wired = true;
    document.getElementById('sim-bar-open')?.addEventListener('click', openSimDialog);
    document.getElementById('sim-bar-exit')?.addEventListener('click', useRealClock);
    const dialog = document.getElementById('sim-dialog');
    document.getElementById('sim-close')?.addEventListener('click', () => dialog.close());
    dialog?.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
    dialog?.addEventListener('close', () => {
      clearInterval(ticker);
      ticker = null;
    });
    // One subscription drives everything downstream of a time change: the clock
    // and timeline resync, and both readouts repaint.
    onSimChange(() => { resyncClock(); paintBar(); paintDialog(); });
  }
  paintBar();
}

function eventTimes() {
  return [...new Set(events.map(ev => ev.time).filter(Number.isFinite))].sort((a, b) => a - b);
}

function span() {
  const times = eventTimes();
  if (times.length === 0) return { min: 0, max: 1439 };
  return {
    min: Math.max(0, times[0] - PAD),
    max: Math.min(1439, times[times.length - 1] + PAD),
  };
}

export function openSimDialog() {
  const dialog = document.getElementById('sim-dialog');
  const body = document.getElementById('sim-body');
  if (!dialog || !body) return;

  const { min, max } = span();
  body.innerHTML = `
    <div class="sim-readout">
      <span class="sim-readout-time" id="sim-readout-time">--:--:--</span>
      <span class="sim-readout-state" id="sim-readout-state"></span>
    </div>

    <input type="range" class="sim-range" id="sim-range"
      min="${min}" max="${max}" step="1" aria-label="Simulated time">
    <div class="sim-scale"><span>${formatTime(min)}</span><span>${formatTime(max)}</span></div>

    <div class="sim-row sim-nudges">
      ${NUDGES.map(n => `<button class="btn btn-secondary btn-sm" data-nudge="${n}">
        ${n < 0 ? '−' : '+'}${Math.abs(n)}m</button>`).join('')}
    </div>

    <div class="sim-row">
      <button class="btn btn-secondary btn-sm" id="sim-prev">⏮ Previous stage</button>
      <button class="btn btn-secondary btn-sm" id="sim-next">Next stage ⏭</button>
    </div>

    <div class="sim-row sim-rates">
      <button class="btn btn-secondary btn-sm" data-rate="pause">⏸ Pause</button>
      ${RATES.map(r => `<button class="btn btn-secondary btn-sm" data-rate="${r}">${r}×</button>`).join('')}
    </div>

    <div class="sim-row">
      <button class="btn btn-secondary btn-sm" id="sim-jump-start">Start of cook</button>
      <button class="btn btn-secondary btn-sm" id="sim-jump-serve">Serve</button>
      <button class="btn btn-ghost btn-sm" id="sim-real">↺ Real time</button>
    </div>

    <p class="settings-hint">Everything reads this clock, so the countdown, the
      highlighted stage and the chimes all follow it. Scrubbing pauses; pick a
      speed to let it run. Nothing here is saved — reload and the real clock
      is back.</p>
  `;

  const range = document.getElementById('sim-range');
  // Grabbing the scrubber pauses, or a 60x clock would drag itself out from
  // under the thumb.
  range.addEventListener('pointerdown', () => { dragging = true; setPaused(true); });
  range.addEventListener('keydown', () => setPaused(true));
  window.addEventListener('pointerup', () => { dragging = false; }, { once: false });
  range.addEventListener('input', () => setSimMins(Number(range.value)));

  body.querySelectorAll('[data-nudge]').forEach(btn =>
    btn.addEventListener('click', () => nudgeMins(Number(btn.dataset.nudge))));

  body.querySelectorAll('[data-rate]').forEach(btn =>
    btn.addEventListener('click', () => {
      if (btn.dataset.rate === 'pause') setPaused(!isPaused() || !isSimulated());
      else setRate(Number(btn.dataset.rate));
    }));

  document.getElementById('sim-prev').addEventListener('click', () => step(-1));
  document.getElementById('sim-next').addEventListener('click', () => step(1));
  document.getElementById('sim-jump-start').addEventListener('click', () => jumpTo(eventTimes()[0]));
  document.getElementById('sim-jump-serve').addEventListener('click', () => {
    const t = eventTimes();
    jumpTo(t[t.length - 1]);
  });
  document.getElementById('sim-real').addEventListener('click', () => {
    useRealClock();
    dialog.close();
  });

  paintDialog();
  clearInterval(ticker);
  // A running clock has to repaint itself; 200ms is smooth without being busy.
  ticker = setInterval(paintDialog, 200);
  dialog.showModal();
}

// Land on the whole minute of a stage, paused, so the moment can be looked at.
function jumpTo(mins) {
  if (!Number.isFinite(mins)) return;
  setSimMins(mins);
  setPaused(true);
}

function step(dir) {
  const times = eventTimes();
  if (times.length === 0) return;
  const nowM = Math.floor(nowSecsOfDay() / 60);
  const target = dir > 0
    ? times.find(t => t > nowM)
    : [...times].reverse().find(t => t < nowM);
  jumpTo(target ?? (dir > 0 ? times[times.length - 1] : times[0]));
}

function stateLabel() {
  if (!isSimulated()) return 'real clock';
  if (isPaused()) return 'paused';
  return `running ${getRate()}×`;
}

function clockText(secs) {
  const s = Math.floor(((secs % 86400) + 86400) % 86400);
  return [s / 3600, (s % 3600) / 60, s % 60]
    .map(n => String(Math.floor(n)).padStart(2, '0')).join(':');
}

function paintDialog() {
  const timeEl = document.getElementById('sim-readout-time');
  if (!timeEl) return;
  const secs = nowSecsOfDay();
  timeEl.textContent = clockText(secs);
  document.getElementById('sim-readout-state').textContent = stateLabel();

  const range = document.getElementById('sim-range');
  if (range && !dragging) range.value = String(Math.round(secs / 60));

  const rate = isSimulated() && !isPaused() ? String(getRate()) : null;
  document.querySelectorAll('#sim-dialog [data-rate]').forEach(btn => {
    const isPauseBtn = btn.dataset.rate === 'pause';
    btn.classList.toggle('active',
      isPauseBtn ? (isSimulated() && isPaused()) : btn.dataset.rate === rate);
  });
}

// The pill that sits above the page whenever the clock is a lie. It is the only
// thing on screen that says so, so it stays put while the timeline scrolls.
function paintBar() {
  const bar = document.getElementById('sim-bar');
  document.body.classList.toggle('simulating', isSimulated());
  if (!bar) return;
  bar.hidden = !isSimulated();
  if (!isSimulated()) return;
  document.getElementById('sim-bar-time').textContent = clockText(nowSecsOfDay());
  document.getElementById('sim-bar-rate').textContent = isPaused() ? 'paused' : `${getRate()}×`;
}

// While the clock is running the pill has to keep up with it.
setInterval(() => { if (isSimulated()) paintBar(); }, 500);
