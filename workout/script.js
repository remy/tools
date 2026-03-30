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

function renderWorkouts(workouts) {
  const contentContainer = document.querySelector('.content');
  const tabsContainer = document.querySelector('.tabs');

  contentContainer.innerHTML = '';
  tabsContainer.innerHTML = '';

  workouts.forEach((workout, index) => {
    // Create panel
    const panel = document.createElement('div');
    panel.className = `day-panel ${index === 0 ? 'active' : ''}`;
    panel.id = `panel-${index}`;

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
      <div class="cardio-block">
        <div class="cardio-icon">${workout.cardio.icon}</div>
        <div>
          <div class="cardio-title">${workout.cardio.title}</div>
          <div class="cardio-desc">${workout.cardio.description}</div>
        </div>
      </div>
    `;
    contentContainer.appendChild(panel);

    // Create tab
    const tab = document.createElement('button');
    tab.className = `tab ${index === 0 ? 'active' : ''}`;
    tab.onclick = () => switchTab(index);
    tab.innerHTML = `
      ${workout.id}<span class="day-label">${workout.label}</span>
    `;
    tabsContainer.appendChild(tab);
  });
}

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

function switchTab(index) {
  // Reset ticks on previous tab
  document.querySelectorAll('.day-panel.active .exercise-row').forEach(r => {
    r.classList.remove('done');
    r.dataset.completedSets = 0;
    r.querySelector('.ex-sets-current').textContent = '0';
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

document.addEventListener('click', function(e) {
  const row = e.target.closest('.exercise-row');
  if (!row) return;

  const total = parseInt(row.dataset.totalSets, 10);
  let completed = parseInt(row.dataset.completedSets, 10);

  if (row.classList.contains('done')) {
    // Reset if already done
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

init();
