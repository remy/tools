import { state } from './state.js';
import { getCircuitSetting, getActiveTab, setActiveTab } from './prefs.js';
import { formatTime } from './format.js';
import { resetCircuit, resetRepTimer } from './timers.js';
import { applyStoredProgress } from './progress.js';

// Rows carry both the exercise's position (which drives the circuit timer's
// ordering) and its stable id (which keys progress, so reordering or deleting
// an exercise can't reattach recorded sets to the wrong one).
function exerciseRow(workoutIndex, ex, i, isCircuit) {
  if (isCircuit) {
    return `
      <div class="exercise-row" data-workout-index="${workoutIndex}" data-exercise-index="${i}" data-exercise-id="${ex.id}">
        <div class="ex-name">${ex.name}</div>
      </div>
    `;
  }
  return `
    <div class="exercise-row" data-workout-index="${workoutIndex}" data-exercise-index="${i}" data-exercise-id="${ex.id}" data-total-sets="${ex.sets}" data-completed-sets="0">
      <div class="ex-name">${ex.name}</div>
      <div class="ex-sets"><span class="ex-sets-current">0</span>/<span class="ex-sets-total">${ex.sets}</span><span class="ex-sets-label">sets</span></div>
      <div class="ex-reps">${ex.reps}<span class="ex-reps-label">reps</span></div>
    </div>
  `;
}

function focusBar(workout) {
  return `
    <div class="focus-bar">
      <div>
        <div class="focus-sub">Day ${workout.id}</div>
        <div class="focus-text">${workout.focus}</div>
      </div>
      <div class="bar-actions">
        <a href="manage.html" class="manage-link" aria-label="Settings">
          <span class="icon-mask icon-settings" aria-hidden="true"></span>
        </a>
      </div>
    </div>
  `;
}

function cardioBlock(workout, index) {
  if (!workout.cardio) return '';
  return `
    <div class="cardio-block" data-workout-index="${index}">
      <div class="cardio-icon">${workout.cardio.icon}</div>
      <div>
        <div class="cardio-title">${workout.cardio.title}</div>
        <div class="cardio-desc">${workout.cardio.description}</div>
      </div>
    </div>`;
}

function circuitPanel(workout, index) {
  const rounds = getCircuitSetting('rounds', workout.rounds || 3);
  const active = getCircuitSetting('active', 30);
  const rest = getCircuitSetting('rest', 30);
  const longRest = getCircuitSetting('longRest', 60);

  return `
    ${focusBar(workout)}
    <div class="circuit-panel" data-workout-index="${index}">
      <div class="circuit-settings">
        <div class="circuit-setting">
          <label>Active</label>
          <input type="number" min="5" max="300" value="${active}" data-key="active">
        </div>
        <div class="circuit-setting">
          <label>Rest</label>
          <input type="number" min="5" max="300" value="${rest}" data-key="rest">
        </div>
        <div class="circuit-setting">
          <label>Long Rest</label>
          <input type="number" min="5" max="600" value="${longRest}" data-key="longRest">
        </div>
        <div class="circuit-setting">
          <label>Rounds</label>
          <input type="number" min="1" max="20" value="${rounds}" data-key="rounds">
        </div>
      </div>
      <div class="circuit-round">Round 1 of ${rounds}</div>
      <div class="exercise-list">
        ${workout.exercises.map((ex, i) => exerciseRow(index, ex, i, true)).join('')}
      </div>
      <div class="circuit-timer">
        <div class="circuit-timer-time">${formatTime(active)}</div>
        <div class="circuit-timer-phase">READY</div>
      </div>
      <div class="circuit-controls">
        <button class="circuit-btn circuit-btn-start" data-action="start">START</button>
        <button class="circuit-btn circuit-btn-reset" data-action="reset">RESET</button>
      </div>
      ${cardioBlock(workout, index)}
    </div>
  `;
}

function repPanel(workout, index) {
  return `
    ${focusBar(workout)}
    <div class="col-headers">
      <span>Exercise</span><span>Sets</span><span>Reps</span>
    </div>
    <div class="exercise-list">
      ${workout.exercises.map((ex, i) => exerciseRow(index, ex, i, false)).join('')}
    </div>
    ${cardioBlock(workout, index)}
    <div class="panel-spacer"></div>
    <div class="rep-timer" hidden>
      <div class="rep-timer-seg">
        <span class="rep-timer-label">Elapsed</span>
        <span class="rep-timer-time">0:00</span>
      </div>
      <div class="rep-timer-seg rep-timer-rest" hidden>
        <span class="rep-timer-label">Rest</span>
        <span class="rep-timer-rest-time">0:00</span>
      </div>
    </div>
    <button type="button" class="day-reset" hidden>Reset day</button>
  `;
}

export function renderWorkouts(workouts) {
  const contentContainer = document.querySelector('.content');
  const tabsContainer = document.querySelector('.tabs');

  contentContainer.innerHTML = '';
  tabsContainer.innerHTML = '';

  workouts.forEach((workout, index) => {
    const panel = document.createElement('div');
    panel.className = `day-panel ${index === 0 ? 'active' : ''}`;
    panel.id = `panel-${index}`;
    panel.innerHTML = workout.type === 'circuit'
      ? circuitPanel(workout, index)
      : repPanel(workout, index);
    contentContainer.appendChild(panel);

    const tab = document.createElement('button');
    tab.className = `tab ${index === 0 ? 'active' : ''}`;
    tab.onclick = () => switchTab(index);
    tab.innerHTML = `${workout.id}<span class="day-label">${workout.label}</span>`;
    tabsContainer.appendChild(tab);
  });

  applyStoredProgress();
}

export function reRenderPreservingTab() {
  const activeIndex = Math.max(0, [...document.querySelectorAll('.tab')].findIndex((t) => t.classList.contains('active')));
  renderWorkouts(state.plan.workouts);
  document.querySelectorAll('.tab').forEach((t, i) => t.classList.toggle('active', i === activeIndex));
  document.querySelectorAll('.day-panel').forEach((p, i) => p.classList.toggle('active', i === activeIndex));
}

/* ── Tabs ── */
export function switchTab(index) {
  // Stop any running circuit / elapsed timer, but keep the logged sets — they
  // are persisted per day and restored so switching tabs never loses progress.
  resetCircuit();
  resetRepTimer();

  document.querySelectorAll('.tab').forEach((t, i) => t.classList.toggle('active', i === index));
  document.querySelectorAll('.day-panel').forEach((p, i) => p.classList.toggle('active', i === index));
  setActiveTab(index);
}

export function restoreTab() {
  const index = getActiveTab();
  if (index > 0) switchTab(index);
}
