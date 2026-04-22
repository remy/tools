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

/* ── Init ── */
async function init() {
  try {
    let data = await WorkoutDB.load();
    if (!data) {
      const response = await fetch('workouts.json');
      data = await response.json();
    }
    renderWorkouts(data.workouts);
    restoreTab();
    restoreTheme();
  } catch (error) {
    console.error('Error loading workouts:', error);
  }
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
              <div class="exercise-row" data-exercise-index="${i}">
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
          <div class="cardio-block">
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
          ${workout.exercises.map(ex => `
            <div class="exercise-row" data-total-sets="${ex.sets}" data-completed-sets="0">
              <div class="ex-name">${ex.name}</div>
              <div class="ex-sets"><span class="ex-sets-current">0</span>/<span class="ex-sets-total">${ex.sets}</span><span class="ex-sets-label">sets</span></div>
              <div class="ex-reps">${ex.reps}<span class="ex-reps-label">reps</span></div>
            </div>
          `).join('')}
        </div>
        ${workout.cardio ? `
        <div class="cardio-block">
          <div class="cardio-icon">${workout.cardio.icon}</div>
          <div>
            <div class="cardio-title">${workout.cardio.title}</div>
            <div class="cardio-desc">${workout.cardio.description}</div>
          </div>
        </div>` : ''}
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

  if (row.classList.contains('done')) {
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
   Prevent accidental scroll on mobile during a tap on the exercise rows
   (the radio-button-style rows where a quick tap increments the set count).
   Scroll is unlocked when either (a) the finger has been held for HOLD_MS,
   or (b) the finger has moved more than FLICK_PX — so deliberate swipes
   still scroll immediately while tap jitter does not cause scroll. The rest
   of the page scrolls normally on any touch. */
(function() {
  const HOLD_MS = 180;
  const FLICK_PX = 14;
  let startTime = 0;
  let startX = 0;
  let startY = 0;
  let scrollUnlocked = false;
  let tracking = false;

  document.addEventListener('touchstart', function(e) {
    if (e.touches.length !== 1 || !e.target.closest('.exercise-row')) {
      tracking = false;
      return;
    }
    const t = e.touches[0];
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

init();
