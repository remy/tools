/* ── Circuit timer state ── */
let circuitState = {
  running: false,
  paused: false,
  exerciseIndex: 0,
  round: 0,
  totalRounds: 3,
  totalExercises: 0,
  phase: 'idle', // idle | active | rest | longRest | done
  phaseEndTime: 0,
  intervalId: null,
  panelEl: null
};
let audioCtx = null;
let wakeLock = null;

/* ── Rep-workout elapsed timer ── */
let repTimer = {
  startTime: 0,
  restStart: 0,
  intervalId: null,
  panelEl: null,
  stopped: false
};

function isRestTimerEnabled() {
  try { return localStorage.getItem('rep-rest-timer') === '1'; }
  catch (e) { return false; }
}

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
  } catch (e) { /* audio not available */ }
}

function getCircuitSetting(key, fallback) {
  try { return parseInt(localStorage.getItem('circuit-' + key), 10) || fallback; }
  catch (e) { return fallback; }
}

function setCircuitSetting(key, val) {
  try { localStorage.setItem('circuit-' + key, val); } catch (e) {}
}

async function requestWakeLock() {
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch (e) {}
}

function releaseWakeLock() {
  try { wakeLock?.release(); wakeLock = null; } catch (e) {}
}

let currentData = null;

/* ── Init ── */
async function init() {
  try {
    let data = await WorkoutDB.load();
    if (!data) {
      const response = await fetch('workouts.json');
      data = await response.json();
    }
    currentData = data;
    renderWorkouts(data.workouts);
    restoreTab();
    restoreTheme();
  } catch (error) {
    console.error('Error loading workouts:', error);
  }
}

function reRenderPreservingTab() {
  const activeIndex = Math.max(0, [...document.querySelectorAll('.tab')].findIndex(t => t.classList.contains('active')));
  renderWorkouts(currentData.workouts);
  document.querySelectorAll('.tab').forEach((t, i) => t.classList.toggle('active', i === activeIndex));
  document.querySelectorAll('.day-panel').forEach((p, i) => p.classList.toggle('active', i === activeIndex));
}

/* ── Render ── */
function renderWorkouts(workouts) {
  const contentContainer = document.querySelector('.content');
  const tabsContainer = document.querySelector('.tabs');

  contentContainer.innerHTML = '';
  tabsContainer.innerHTML = '';

  workouts.forEach((workout, index) => {
    const isCircuit = workout.type === 'circuit';
    const panel = document.createElement('div');
    panel.className = `day-panel ${index === 0 ? 'active' : ''}`;
    panel.id = `panel-${index}`;

    if (isCircuit) {
      const rounds = getCircuitSetting('rounds', workout.rounds || 3);
      const active = getCircuitSetting('active', 30);
      const rest = getCircuitSetting('rest', 30);
      const longRest = getCircuitSetting('longRest', 60);

      panel.innerHTML = `
        <div class="focus-bar">
          <div>
            <div class="focus-sub">Day ${workout.id}</div>
            <div class="focus-text">${workout.focus}</div>
          </div>
          <div class="bar-actions">
            <a href="manage.html" class="manage-link" title="Manage workouts">⚙</a>
            <button class="theme-toggle" onclick="toggleTheme()">☀️ Light</button>
          </div>
        </div>
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
            ${workout.exercises.map((ex, i) => `
              <div class="exercise-row" data-workout-index="${index}" data-exercise-index="${i}">
                <div class="ex-name">${ex.name}</div>
              </div>
            `).join('')}
          </div>
          <div class="circuit-timer">
            <div class="circuit-timer-time">${formatTime(active)}</div>
            <div class="circuit-timer-phase">READY</div>
          </div>
          <div class="circuit-controls">
            <button class="circuit-btn circuit-btn-start" data-action="start">START</button>
            <button class="circuit-btn circuit-btn-reset" data-action="reset">RESET</button>
          </div>
          ${workout.cardio ? `
          <div class="cardio-block" data-workout-index="${index}">
            <div class="cardio-icon">${workout.cardio.icon}</div>
            <div>
              <div class="cardio-title">${workout.cardio.title}</div>
              <div class="cardio-desc">${workout.cardio.description}</div>
            </div>
          </div>` : ''}
        </div>
      `;
    } else {
      panel.innerHTML = `
        <div class="focus-bar">
          <div>
            <div class="focus-sub">Day ${workout.id}</div>
            <div class="focus-text">${workout.focus}</div>
          </div>
          <div class="bar-actions">
            <a href="manage.html" class="manage-link" title="Manage workouts">⚙</a>
            <button class="theme-toggle" onclick="toggleTheme()">☀️ Light</button>
          </div>
        </div>
        <div class="col-headers">
          <span>Exercise</span><span>Sets</span><span>Reps</span>
        </div>
        <div class="exercise-list">
          ${workout.exercises.map((ex, i) => `
            <div class="exercise-row" data-workout-index="${index}" data-exercise-index="${i}" data-total-sets="${ex.sets}" data-completed-sets="0">
              <div class="ex-name">${ex.name}</div>
              <div class="ex-sets"><span class="ex-sets-current">0</span>/<span class="ex-sets-total">${ex.sets}</span><span class="ex-sets-label">sets</span></div>
              <div class="ex-reps">${ex.reps}<span class="ex-reps-label">reps</span></div>
            </div>
          `).join('')}
        </div>
        ${workout.cardio ? `
        <div class="cardio-block" data-workout-index="${index}">
          <div class="cardio-icon">${workout.cardio.icon}</div>
          <div>
            <div class="cardio-title">${workout.cardio.title}</div>
            <div class="cardio-desc">${workout.cardio.description}</div>
          </div>
        </div>` : ''}
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
      `;
    }

    contentContainer.appendChild(panel);

    const tab = document.createElement('button');
    tab.className = `tab ${index === 0 ? 'active' : ''}`;
    tab.onclick = () => switchTab(index);
    tab.innerHTML = `${workout.id}<span class="day-label">${workout.label}</span>`;
    tabsContainer.appendChild(tab);
  });
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `0:${String(s).padStart(2, '0')}`;
}

function formatElapsed(ms) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/* ── Rep-workout elapsed timer ──
   Starts the instant the first set is logged on a rep-based panel (the
   transition from nothing ticked to a first rep), and freezes once every
   exercise in that panel is marked done. */
function renderRepTimer() {
  if (!repTimer.panelEl) return;
  const now = Date.now();
  const el = repTimer.panelEl.querySelector('.rep-timer-time');
  if (el) el.textContent = formatElapsed(now - repTimer.startTime);
  const restEl = repTimer.panelEl.querySelector('.rep-timer-rest-time');
  if (restEl) restEl.textContent = formatElapsed(now - repTimer.restStart);
}

function startRepTimer(panelEl) {
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

function stopRepTimer() {
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

function resetRepTimer() {
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
function startCircuit(panelEl) {
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

function resetCircuit(panelEl) {
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
    target.querySelectorAll('.exercise-row').forEach(r => {
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
        panelEl.querySelectorAll('.exercise-row').forEach(r => r.classList.add('circuit-done'));
        panelEl.querySelectorAll('.exercise-row').forEach(r => r.classList.remove('circuit-current'));
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
    s.panelEl.querySelectorAll('.exercise-row').forEach(r => r.classList.remove('circuit-done'));
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

/* ── Theme ── */
function setTheme(light) {
  document.body.classList.toggle('light', light);
  const label = light ? '🌙 Dark' : '☀️ Light';
  document.querySelectorAll('.theme-toggle').forEach(b => b.textContent = label);
}

function toggleTheme() {
  const light = !document.body.classList.contains('light');
  setTheme(light);
  try {
    localStorage.setItem('theme', light ? 'light' : 'dark');
  } catch (e) {}
  const url = new URL(location.href);
  url.searchParams.set('theme', light ? 'light' : 'dark');
  history.replaceState(null, '', url);
}

function restoreTheme() {
  const urlTheme = new URLSearchParams(location.search).get('theme');
  let stored;
  try {
    stored = localStorage.getItem('theme');
  } catch (e) {}
  const pref = urlTheme || stored;
  if (pref === 'light') setTheme(true);
}

/* ── Tabs ── */
function switchTab(index) {
  // Stop any running circuit timer
  resetCircuit();
  resetRepTimer();

  // Reset ticks on previous tab (rep-based)
  document.querySelectorAll('.day-panel.active .exercise-row').forEach(r => {
    r.classList.remove('done');
    r.dataset.completedSets = 0;
    const setsEl = r.querySelector('.ex-sets-current');
    if (setsEl) setsEl.textContent = '0';
  });
  document.querySelectorAll('.tab').forEach((t, i) => t.classList.toggle('active', i === index));
  document.querySelectorAll('.day-panel').forEach((p, i) => p.classList.toggle('active', i === index));
  try { localStorage.setItem('activeTab', index); } catch (e) {}
}

function restoreTab() {
  let index;
  try { index = parseInt(localStorage.getItem('activeTab'), 10); } catch (e) {}
  if (index > 0) switchTab(index);
}

/* ── Event delegation ── */
document.addEventListener('click', function(e) {
  // Circuit controls
  const circuitBtn = e.target.closest('.circuit-btn');
  if (circuitBtn) {
    const panelEl = circuitBtn.closest('.circuit-panel');
    const action = circuitBtn.dataset.action;
    if (action === 'start') {
      startCircuit(panelEl);
    } else if (action === 'reset') {
      resetCircuit(panelEl);
    }
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
    if (completed >= total) {
      row.classList.add('done');
    }
  }

  row.dataset.completedSets = completed;
  row.querySelector('.ex-sets-current').textContent = completed;

  // Elapsed timer: start on first rep, freeze when the whole panel is done.
  const panel = row.closest('.day-panel');
  if (panel) {
    const rows = [...panel.querySelectorAll('.exercise-row')];
    const anyTicked = rows.some(r => parseInt(r.dataset.completedSets, 10) > 0 || r.classList.contains('done'));
    const allDone = rows.length > 0 && rows.every(r => r.classList.contains('done'));

    if (!anyTicked) {
      resetRepTimer();
    } else if (allDone) {
      stopRepTimer();
    } else {
      startRepTimer(panel);
    }

    // Rest timer resets each time a set is logged.
    if (setLogged && repTimer.intervalId && !repTimer.stopped) {
      repTimer.restStart = Date.now();
      renderRepTimer();
    }
  }
});

// Circuit settings persistence
document.addEventListener('input', function(e) {
  const input = e.target.closest('.circuit-setting input');
  if (!input) return;
  const key = input.dataset.key;
  const val = parseInt(input.value, 10);
  if (key && val > 0) {
    setCircuitSetting(key, val);
    // Update round display if rounds changed
    if (key === 'rounds') {
      const panelEl = input.closest('.circuit-panel');
      if (panelEl) {
        panelEl.querySelector('.circuit-round').textContent = `Round 1 of ${val}`;
      }
    }
    // Update timer display if active changed and not running
    if (key === 'active' && !circuitState.running) {
      const panelEl = input.closest('.circuit-panel');
      if (panelEl) {
        panelEl.querySelector('.circuit-timer-time').textContent = formatTime(val);
      }
    }
  }
});

/* ── Scroll gating ──
   Prevent accidental scroll on mobile during a tap on the radio-style
   bullet at the start of an exercise row. Scroll is unlocked when either
   (a) the finger has been held for HOLD_MS, or (b) the finger has moved
   more than FLICK_PX — so deliberate swipes still scroll immediately while
   tap jitter does not cause scroll. Only the bullet gets gated; tapping
   the exercise name/text scrolls normally. */
(function() {
  const HOLD_MS = 180;
  const FLICK_PX = 14;
  // Bullet is 18px + 2×2 border ≈ 22px; give a small margin so the edge of
  // the circle isn't impossible to hit, but stop well before the text.
  const BULLET_HIT_PX = 30;
  let startTime = 0;
  let startX = 0;
  let startY = 0;
  let scrollUnlocked = false;
  let tracking = false;

  document.addEventListener('touchstart', function(e) {
    tracking = false;
    if (e.touches.length !== 1) return;
    const row = e.target.closest('.exercise-row');
    if (!row) return;
    const nameEl = row.querySelector('.ex-name');
    if (!nameEl) return;
    const t = e.touches[0];
    const rect = nameEl.getBoundingClientRect();
    if (t.clientX > rect.left + BULLET_HIT_PX) return;
    startTime = Date.now();
    startX = t.clientX;
    startY = t.clientY;
    scrollUnlocked = false;
    tracking = true;
  }, { passive: true });

  document.addEventListener('touchmove', function(e) {
    if (!tracking || e.touches.length !== 1) return;
    if (scrollUnlocked) return;
    const t = e.touches[0];
    const moved = Math.hypot(t.clientX - startX, t.clientY - startY);
    if (moved > FLICK_PX || Date.now() - startTime >= HOLD_MS) {
      scrollUnlocked = true;
      return;
    }
    e.preventDefault();
  }, { passive: false });

  document.addEventListener('touchend', function() { tracking = false; }, { passive: true });
  document.addEventListener('touchcancel', function() { tracking = false; }, { passive: true });
})();

/* ── Edit-exercise dialog ── */
let editTarget = null; // { workoutIndex, exerciseIndex }

function openEditDialog(row) {
  const workoutIndex = parseInt(row.dataset.workoutIndex, 10);
  const exerciseIndex = parseInt(row.dataset.exerciseIndex, 10);
  const workout = currentData?.workouts?.[workoutIndex];
  const exercise = workout?.exercises?.[exerciseIndex];
  if (!exercise) return;

  editTarget = { workoutIndex, exerciseIndex };

  const dialog = document.getElementById('edit-exercise-dialog');
  const isCircuit = workout.type === 'circuit';
  dialog.querySelector('#edit-ex-name').value = exercise.name || '';
  dialog.querySelector('#edit-ex-sets').value = exercise.sets || '';
  dialog.querySelector('#edit-ex-reps').value = exercise.reps || '';
  dialog.querySelector('#edit-sets-reps-row').hidden = isCircuit;

  const total = workout.exercises.length;
  const positionSelect = dialog.querySelector('#edit-ex-position');
  positionSelect.innerHTML = Array.from({ length: total }, (_, i) =>
    `<option value="${i}">${i + 1} of ${total}</option>`
  ).join('');
  positionSelect.value = exerciseIndex;

  dialog.showModal();
}

function closeEditDialog() {
  document.getElementById('edit-exercise-dialog').close();
  editTarget = null;
}

async function saveEditedExercise() {
  if (!editTarget) return;
  const { workoutIndex, exerciseIndex } = editTarget;
  const workout = currentData.workouts[workoutIndex];
  const exercise = workout?.exercises?.[exerciseIndex];
  if (!exercise) return;

  const dialog = document.getElementById('edit-exercise-dialog');
  const name = dialog.querySelector('#edit-ex-name').value.trim();
  if (!name) return;
  exercise.name = name;

  if (workout.type !== 'circuit') {
    exercise.sets = dialog.querySelector('#edit-ex-sets').value.trim();
    exercise.reps = dialog.querySelector('#edit-ex-reps').value.trim();
  }

  const newIndex = parseInt(dialog.querySelector('#edit-ex-position').value, 10);
  if (!Number.isNaN(newIndex) && newIndex !== exerciseIndex) {
    workout.exercises.splice(exerciseIndex, 1);
    workout.exercises.splice(newIndex, 0, exercise);
  }

  editTarget = null;
  document.getElementById('edit-exercise-dialog').close();
  await WorkoutDB.save(currentData);
  reRenderPreservingTab();
}

async function deleteEditedExercise() {
  if (!editTarget) return;
  const { workoutIndex, exerciseIndex } = editTarget;
  currentData.workouts[workoutIndex].exercises.splice(exerciseIndex, 1);
  editTarget = null;
  closeEditDialog();
  await WorkoutDB.save(currentData);
  reRenderPreservingTab();
}

(function() {
  const editDialog = document.getElementById('edit-exercise-dialog');
  const editForm = editDialog.querySelector('.edit-exercise-form');

  editDialog.addEventListener('click', (e) => {
    if (e.target === editDialog) editDialog.close();
  });
  editForm.addEventListener('submit', (e) => {
    e.preventDefault();
    saveEditedExercise();
  });
  document.getElementById('edit-ex-cancel').addEventListener('click', () => closeEditDialog());
  document.getElementById('edit-ex-delete').addEventListener('click', () => deleteEditedExercise());
})();

/* ── Edit-cardio dialog ── */
let cardioEditTarget = null; // { workoutIndex }

function openCardioDialog(block) {
  const workoutIndex = parseInt(block.dataset.workoutIndex, 10);
  const workout = currentData?.workouts?.[workoutIndex];
  const cardio = workout?.cardio;
  if (!cardio) return;

  cardioEditTarget = { workoutIndex };

  const dialog = document.getElementById('edit-cardio-dialog');
  dialog.querySelector('#edit-cardio-icon').value = cardio.icon || '';
  dialog.querySelector('#edit-cardio-title').value = cardio.title || '';
  dialog.querySelector('#edit-cardio-description').value = cardio.description || '';

  dialog.showModal();
}

function closeCardioDialog() {
  document.getElementById('edit-cardio-dialog').close();
  cardioEditTarget = null;
}

async function saveEditedCardio() {
  if (!cardioEditTarget) return;
  const { workoutIndex } = cardioEditTarget;
  const cardio = currentData.workouts[workoutIndex]?.cardio;
  if (!cardio) return;

  const dialog = document.getElementById('edit-cardio-dialog');
  const title = dialog.querySelector('#edit-cardio-title').value.trim();
  const description = dialog.querySelector('#edit-cardio-description').value.trim();
  if (!title || !description) return;
  cardio.icon = dialog.querySelector('#edit-cardio-icon').value.trim();
  cardio.title = title;
  cardio.description = description;

  cardioEditTarget = null;
  document.getElementById('edit-cardio-dialog').close();
  await WorkoutDB.save(currentData);
  reRenderPreservingTab();
}

async function deleteEditedCardio() {
  if (!cardioEditTarget) return;
  const { workoutIndex } = cardioEditTarget;
  delete currentData.workouts[workoutIndex].cardio;
  cardioEditTarget = null;
  closeCardioDialog();
  await WorkoutDB.save(currentData);
  reRenderPreservingTab();
}

(function() {
  const cardioDialog = document.getElementById('edit-cardio-dialog');
  const cardioForm = cardioDialog.querySelector('.edit-exercise-form');

  cardioDialog.addEventListener('click', (e) => {
    if (e.target === cardioDialog) cardioDialog.close();
  });
  cardioForm.addEventListener('submit', (e) => {
    e.preventDefault();
    saveEditedCardio();
  });
  document.getElementById('edit-cardio-cancel').addEventListener('click', () => closeCardioDialog());
  document.getElementById('edit-cardio-delete').addEventListener('click', () => deleteEditedCardio());
})();

/* ── Long-press (1s+) on an exercise row or the cardio block opens its edit dialog ── */
(function() {
  const HOLD_MS = 1000;
  const MOVE_PX = 10;
  const TARGET_SELECTOR = '.exercise-row, .cardio-block';
  let timer = null;
  let startX = 0, startY = 0;
  let pressEl = null;
  let longPressReady = false;
  let suppressClick = false;

  function cancelPress() {
    if (pressEl) pressEl.classList.remove('long-press-charging', 'long-press-ready');
    clearTimeout(timer);
    timer = null;
    pressEl = null;
    longPressReady = false;
  }

  document.addEventListener('pointerdown', function(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const el = e.target.closest(TARGET_SELECTOR);
    if (!el) return;
    startX = e.clientX;
    startY = e.clientY;
    pressEl = el;
    longPressReady = false;
    el.style.setProperty('--hold-duration', HOLD_MS + 'ms');
    el.classList.add('long-press-charging');
    timer = setTimeout(() => {
      if (!pressEl) return;
      longPressReady = true;
      pressEl.classList.remove('long-press-charging');
      pressEl.classList.add('long-press-ready');
      if (navigator.vibrate) navigator.vibrate(15);
    }, HOLD_MS);
  });

  document.addEventListener('pointermove', function(e) {
    if (!pressEl) return;
    const moved = Math.hypot(e.clientX - startX, e.clientY - startY);
    if (moved > MOVE_PX) cancelPress();
  });

  // Open the dialog only once the finger/mouse has actually lifted, and defer
  // it a tick past that — opening mid-gesture means the release lands on
  // whatever's now under it in the freshly-opened dialog (e.g. Cancel),
  // dismissing it instantly.
  document.addEventListener('pointerup', function(e) {
    if (longPressReady && pressEl) {
      suppressClick = true;
      const el = pressEl;
      setTimeout(() => {
        if (el.classList.contains('cardio-block')) {
          openCardioDialog(el);
        } else {
          openEditDialog(el);
        }
      }, 0);
    }
    cancelPress();
  });
  document.addEventListener('pointercancel', cancelPress);

  document.addEventListener('contextmenu', function(e) {
    if (e.target.closest(TARGET_SELECTOR)) e.preventDefault();
  });

  // Suppress the tap/click that follows a long-press so it doesn't also toggle a set.
  document.addEventListener('click', function(e) {
    if (suppressClick) {
      suppressClick = false;
      e.stopPropagation();
      e.preventDefault();
    }
  }, true);
})();

init();
