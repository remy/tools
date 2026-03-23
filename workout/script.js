async function init() {
  try {
    const response = await fetch('workouts.json');
    const data = await response.json();
    renderWorkouts(data.workouts);
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
        <button class="theme-toggle" onclick="toggleTheme()">☀️ Light</button>
      </div>
      <div class="col-headers">
        <span>Exercise</span><span>Sets</span><span>Reps</span>
      </div>
      <div class="exercise-list">
        ${workout.exercises.map(ex => `
          <div class="exercise-row">
            <div class="ex-name">${ex.name}</div>
            <div class="ex-sets">${ex.sets}<span class="ex-sets-label">sets</span></div>
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
  document.querySelectorAll('.day-panel.active .exercise-row').forEach(r => r.classList.remove('done'));
  document.querySelectorAll('.tab').forEach((t, i) => t.classList.toggle('active', i === index));
  document.querySelectorAll('.day-panel').forEach((p, i) => p.classList.toggle('active', i === index));
}

document.addEventListener('click', function(e) {
  const row = e.target.closest('.exercise-row');
  if (row) row.classList.toggle('done');
});

init();
