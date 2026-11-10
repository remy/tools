import { state } from './state.js';
import { loadPlan } from './plan.js';
import { renderWorkouts, restoreTab } from './render.js';
import { recordProgress, updateDayControls, clearDay } from './progress.js';
import { setCircuitSetting } from './prefs.js';
import {
  repTimer, startRepTimer, stopRepTimer, resetRepTimer, renderRepTimer,
  startCircuit, resetCircuit, onCircuitSettingChange,
} from './timers.js';
import { bindDialogs } from './dialogs.js';
import { bindGestures } from './gestures.js';
import { initSync } from './sync.js';
import { setSyncConfig } from './db.js';
import { consumeLinkParams } from '/lib/deep-link.js';

/* ── Event delegation ── */
function bindEvents() {
  document.addEventListener('click', (e) => {
    // Reset / clear the current day
    const resetBtn = e.target.closest('.day-reset');
    if (resetBtn) {
      const panel = resetBtn.closest('.day-panel');
      if (panel) clearDay(panel);
      return;
    }

    // Circuit controls
    const circuitBtn = e.target.closest('.circuit-btn');
    if (circuitBtn) {
      const panelEl = circuitBtn.closest('.circuit-panel');
      const action = circuitBtn.dataset.action;
      if (action === 'start') startCircuit(panelEl);
      else if (action === 'reset') resetCircuit(panelEl);
      return;
    }

    // Rep-based row clicks — skip if inside circuit panel
    const row = e.target.closest('.exercise-row');
    if (!row || row.closest('.circuit-panel')) return;

    const total = parseInt(row.dataset.totalSets, 10);
    let completed = parseInt(row.dataset.completedSets, 10);

    const wasDone = row.classList.contains('done');
    const setLogged = !wasDone;

    if (wasDone) {
      completed = 0;
      row.classList.remove('done');
    } else {
      completed++;
      if (completed >= total) row.classList.add('done');
    }

    row.dataset.completedSets = completed;
    row.querySelector('.ex-sets-current').textContent = completed;

    // Persist the new set count for this day.
    recordProgress(row);

    // Elapsed timer: start on first rep, freeze when the whole panel is done.
    const panel = row.closest('.day-panel');
    if (panel) {
      const rows = [...panel.querySelectorAll('.exercise-row')];
      const anyTicked = rows.some((r) => parseInt(r.dataset.completedSets, 10) > 0 || r.classList.contains('done'));
      const allDone = rows.length > 0 && rows.every((r) => r.classList.contains('done'));

      if (!anyTicked) resetRepTimer();
      else if (allDone) stopRepTimer();
      else startRepTimer(panel);

      // Rest timer resets each time a set is logged.
      if (setLogged && repTimer.intervalId && !repTimer.stopped) {
        repTimer.restStart = Date.now();
        renderRepTimer();
      }

      updateDayControls(panel);
    }
  });

  // Circuit settings persistence
  document.addEventListener('input', (e) => {
    const input = e.target.closest('.circuit-setting input');
    if (!input) return;
    const key = input.dataset.key;
    const val = parseInt(input.value, 10);
    if (!key || !(val > 0)) return;
    setCircuitSetting(key, val);
    onCircuitSettingChange(input, key, val);
  });
}

async function init() {
  try {
    await loadPlan();
    renderWorkouts(state.plan.workouts);
    restoreTab();
  } catch (error) {
    console.error('Error loading workouts:', error);
  }
  bindEvents();
  bindDialogs();
  bindGestures();
  initSync();
}

// A ?sync= link has to be applied before anything boots, and reloads the page —
// skip the normal init when one is on its way. There is no per-workout deep
// link: the whole plan is three tabs on one screen, so there is nothing to link
// to that the app doesn't already open.
if (!consumeLinkParams({ setConfig: setSyncConfig })) init();
