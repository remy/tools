// The two timers: the elapsed/rest pill on rep-based workouts, and the
// interval timer that drives a circuit workout.

import { isRestTimerEnabled } from './prefs.js';
import { formatTime, formatElapsed } from './format.js';

/* ── Circuit timer state ── */
export const circuitState = {
  running: false,
  paused: false,
  exerciseIndex: 0,
  round: 0,
  totalRounds: 3,
  totalExercises: 0,
  phase: 'idle', // idle | active | rest | longRest | done
  phaseEndTime: 0,
  intervalId: null,
  panelEl: null,
};

let audioCtx = null;
let wakeLock = null;

/* ── Rep-workout elapsed timer ── */
export const repTimer = {
  startTime: 0,
  restStart: 0,
  intervalId: null,
  panelEl: null,
  stopped: false,
};

function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playBeep(type) {
  try {
    const ctx = getAudioCtx();
    const now = ctx.currentTime;
    if (type === 'active' || type === 'rest') {
      // Loud triple beep for both active start and rest start
      for (let i = 0; i < 3; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = type === 'active' ? 880 : 440;
        osc.type = 'square';
        gain.gain.setValueAtTime(0.6, now + i * 0.2);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.2 + 0.15);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now + i * 0.2);
        osc.stop(now + i * 0.2 + 0.15);
      }
    } else if (type === 'done') {
      // Victory fanfare: ascending triad played twice, loud
      const notes = [523, 659, 784, 523, 659, 784, 1047];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = freq;
        osc.type = 'square';
        const t = now + i * 0.15;
        gain.gain.setValueAtTime(0.5, t);
        gain.gain.setValueAtTime(0.5, t + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, t + (i === notes.length - 1 ? 0.5 : 0.14));
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + (i === notes.length - 1 ? 0.5 : 0.14));
      });
    }
  } catch { /* audio not available */ }
}

async function requestWakeLock() {
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch {}
}

function releaseWakeLock() {
  try { wakeLock?.release(); wakeLock = null; } catch {}
}

/* ── Rep-workout elapsed timer ──
   Starts the instant the first set is logged on a rep-based panel (the
   transition from nothing ticked to a first rep), and freezes once every
   exercise in that panel is marked done. */
export function renderRepTimer() {
  if (!repTimer.panelEl) return;
  const now = Date.now();
  const el = repTimer.panelEl.querySelector('.rep-timer-time');
  if (el) el.textContent = formatElapsed(now - repTimer.startTime);
  const restEl = repTimer.panelEl.querySelector('.rep-timer-rest-time');
  if (restEl) restEl.textContent = formatElapsed(now - repTimer.restStart);
}

export function startRepTimer(panelEl) {
  if (repTimer.intervalId || repTimer.stopped) return;
  repTimer.panelEl = panelEl;
  repTimer.startTime = Date.now();
  repTimer.restStart = repTimer.startTime;
  const pill = panelEl.querySelector('.rep-timer');
  if (pill) {
    pill.classList.remove('done');
    pill.querySelector('.rep-timer-label').textContent = 'Elapsed';
    pill.querySelector('.rep-timer-rest').hidden = !isRestTimerEnabled();
    pill.hidden = false;
  }
  renderRepTimer();
  repTimer.intervalId = setInterval(renderRepTimer, 1000);
}

export function stopRepTimer() {
  if (!repTimer.intervalId) return;
  clearInterval(repTimer.intervalId);
  repTimer.intervalId = null;
  repTimer.stopped = true;
  renderRepTimer();
  const pill = repTimer.panelEl?.querySelector('.rep-timer');
  if (pill) {
    pill.classList.add('done');
    pill.querySelector('.rep-timer-label').textContent = 'Total';
  }
}

export function resetRepTimer() {
  clearInterval(repTimer.intervalId);
  const pill = repTimer.panelEl?.querySelector('.rep-timer');
  if (pill) {
    pill.hidden = true;
    pill.classList.remove('done');
  }
  repTimer.intervalId = null;
  repTimer.startTime = 0;
  repTimer.stopped = false;
  repTimer.panelEl = null;
}

/* ── Circuit timer ── */
export function startCircuit(panelEl) {
  const s = circuitState;
  if (s.running && !s.paused) {
    pauseCircuit();
    return;
  }
  if (s.paused) {
    resumeCircuit();
    return;
  }

  s.panelEl = panelEl;
  s.totalRounds = parseInt(panelEl.querySelector('[data-key="rounds"]').value, 10) || 3;
  s.totalExercises = panelEl.querySelectorAll('.exercise-row').length;
  s.exerciseIndex = 0;
  s.round = 1;
  s.phase = 'active';
  s.running = true;
  s.paused = false;

  const activeSec = parseInt(panelEl.querySelector('[data-key="active"]').value, 10) || 30;
  s.phaseEndTime = Date.now() + activeSec * 1000;

  requestWakeLock();
  playBeep('active');
  updateCircuitUI();

  s.intervalId = setInterval(() => tickCircuit(), 250);
  panelEl.querySelector('.circuit-btn-start').textContent = 'PAUSE';
}

function pauseCircuit() {
  const s = circuitState;
  if (!s.running) return;
  s.paused = true;
  clearInterval(s.intervalId);
  s.intervalId = null;
  // Store remaining ms
  s._remainingMs = Math.max(0, s.phaseEndTime - Date.now());
  s.panelEl.querySelector('.circuit-btn-start').textContent = 'RESUME';
  releaseWakeLock();
}

function resumeCircuit() {
  const s = circuitState;
  if (!s.paused) return;
  s.paused = false;
  s.phaseEndTime = Date.now() + (s._remainingMs || 0);
  s.intervalId = setInterval(() => tickCircuit(), 250);
  s.panelEl.querySelector('.circuit-btn-start').textContent = 'PAUSE';
  requestWakeLock();
}

export function resetCircuit(panelEl) {
  const s = circuitState;
  clearInterval(s.intervalId);

  const target = panelEl || s.panelEl;
  s.running = false;
  s.paused = false;
  s.phase = 'idle';
  s.intervalId = null;
  s.exerciseIndex = 0;
  s.round = 0;
  s.panelEl = null;

  document.body.classList.remove('circuit-border', 'circuit-phase-active', 'circuit-phase-rest', 'circuit-phase-longRest');
  releaseWakeLock();

  if (target) {
    const activeSec = parseInt(target.querySelector('[data-key="active"]')?.value, 10) || 30;
    const rounds = parseInt(target.querySelector('[data-key="rounds"]')?.value, 10) || 3;
    target.querySelector('.circuit-timer-time').textContent = formatTime(activeSec);
    target.querySelector('.circuit-timer-phase').textContent = 'READY';
    target.querySelector('.circuit-round').textContent = `Round 1 of ${rounds}`;
    target.querySelector('.circuit-btn-start').textContent = 'START';
    target.querySelectorAll('.exercise-row').forEach((r) => {
      r.classList.remove('circuit-current', 'circuit-done');
    });
  }
}

function tickCircuit() {
  const s = circuitState;
  if (!s.running || s.paused) return;

  const remaining = Math.max(0, Math.ceil((s.phaseEndTime - Date.now()) / 1000));
  updateCircuitUI(remaining);

  if (remaining <= 0) {
    advancePhase();
  }
}

function advancePhase() {
  const s = circuitState;
  const panelEl = s.panelEl;
  if (!panelEl) return;

  const activeSec = parseInt(panelEl.querySelector('[data-key="active"]').value, 10) || 30;
  const restSec = parseInt(panelEl.querySelector('[data-key="rest"]').value, 10) || 30;
  const longRestSec = parseInt(panelEl.querySelector('[data-key="longRest"]').value, 10) || 60;

  if (s.phase === 'active') {
    // End of active: is this the last exercise in the round?
    if (s.exerciseIndex >= s.totalExercises - 1) {
      // End of round
      if (s.round >= s.totalRounds) {
        // All done!
        s.phase = 'done';
        clearInterval(s.intervalId);
        s.intervalId = null;
        s.running = false;
        playBeep('done');
        document.body.classList.remove('circuit-border', 'circuit-phase-active', 'circuit-phase-rest', 'circuit-phase-longRest');
        releaseWakeLock();
        panelEl.querySelector('.circuit-timer-time').textContent = '✓';
        panelEl.querySelector('.circuit-timer-phase').textContent = 'COMPLETE';
        panelEl.querySelector('.circuit-btn-start').textContent = 'START';
        // Mark last exercise done
        panelEl.querySelectorAll('.exercise-row').forEach((r) => r.classList.add('circuit-done'));
        panelEl.querySelectorAll('.exercise-row').forEach((r) => r.classList.remove('circuit-current'));
        return;
      }
      // Long rest before next round
      s.phase = 'longRest';
      s.phaseEndTime = Date.now() + longRestSec * 1000;
      playBeep('rest');
    } else {
      // Normal rest between exercises
      s.phase = 'rest';
      s.phaseEndTime = Date.now() + restSec * 1000;
      playBeep('rest');
    }
  } else if (s.phase === 'rest') {
    // Move to next exercise
    s.exerciseIndex++;
    s.phase = 'active';
    s.phaseEndTime = Date.now() + activeSec * 1000;
    playBeep('active');
  } else if (s.phase === 'longRest') {
    // Start next round
    s.round++;
    s.exerciseIndex = 0;
    s.phase = 'active';
    s.phaseEndTime = Date.now() + activeSec * 1000;
    playBeep('active');
    // Clear done state for new round
    s.panelEl.querySelectorAll('.exercise-row').forEach((r) => r.classList.remove('circuit-done'));
  }

  updateCircuitUI();
}

function updateCircuitUI(remainingOverride) {
  const s = circuitState;
  const panelEl = s.panelEl;
  if (!panelEl) return;

  const remaining = remainingOverride != null ? remainingOverride : Math.max(0, Math.ceil((s.phaseEndTime - Date.now()) / 1000));

  // Timer display
  panelEl.querySelector('.circuit-timer-time').textContent = formatTime(remaining);

  // Phase label
  const phaseLabels = { active: 'GO!', rest: 'REST', longRest: 'LONG REST', done: 'COMPLETE' };
  panelEl.querySelector('.circuit-timer-phase').textContent = phaseLabels[s.phase] || 'READY';

  // Round counter
  const rounds = s.totalRounds;
  panelEl.querySelector('.circuit-round').textContent = `Round ${s.round} of ${rounds}`;

  // Highlight current exercise
  panelEl.querySelectorAll('.exercise-row').forEach((row, i) => {
    row.classList.toggle('circuit-current', i === s.exerciseIndex && (s.phase === 'active' || s.phase === 'rest'));
    // Mark exercises before current as done in this round
    if (s.phase === 'active' || s.phase === 'rest') {
      row.classList.toggle('circuit-done', i < s.exerciseIndex);
    }
  });

  // Body border
  document.body.classList.toggle('circuit-border', s.phase === 'active' || s.phase === 'rest' || s.phase === 'longRest');
  document.body.classList.toggle('circuit-phase-active', s.phase === 'active');
  document.body.classList.toggle('circuit-phase-rest', s.phase === 'rest');
  document.body.classList.toggle('circuit-phase-longRest', s.phase === 'longRest');
}

// Reflect a changed circuit setting in the panel without restarting it.
export function onCircuitSettingChange(input, key, val) {
  if (key === 'rounds') {
    const panelEl = input.closest('.circuit-panel');
    if (panelEl) panelEl.querySelector('.circuit-round').textContent = `Round 1 of ${val}`;
  }
  if (key === 'active' && !circuitState.running) {
    const panelEl = input.closest('.circuit-panel');
    if (panelEl) panelEl.querySelector('.circuit-timer-time').textContent = formatTime(val);
  }
}
