// vanilla JS only

// Conversion factors to meters (base unit)
const TO_METERS = {
  m:   1,
  km:  1000,
  mi:  1609.344,
  yd:  0.9144,
  ft:  0.3048,
  in:  0.0254,
  cm:  0.01,
  mm:  0.001,
  nmi: 1852,
  ly:  9.461e15,
};

const UNIT_LABELS = {
  m:   'Meters',
  km:  'Kilometers',
  mi:  'Miles',
  yd:  'Yards',
  ft:  'Feet',
  in:  'Inches',
  cm:  'Centimeters',
  mm:  'Millimeters',
  nmi: 'Nautical Miles',
  ly:  'Light Years',
};

const UNIT_SHORT = {
  m:   'm',
  km:  'km',
  mi:  'mi',
  yd:  'yd',
  ft:  'ft',
  in:  'in',
  cm:  'cm',
  mm:  'mm',
  nmi: 'nmi',
  ly:  'ly',
};

/** Convert a value from one unit to another via meters */
function convert(value, fromUnit, toUnit) {
  const meters = value * TO_METERS[fromUnit];
  return meters / TO_METERS[toUnit];
}

/** Format a number nicely — avoid scientific notation for reasonable values */
function formatNumber(n) {
  if (n === 0) return '0';
  const abs = Math.abs(n);

  // Very large (> 1e15 range) or very small: use scientific notation
  if (abs >= 1e15 || (abs < 1e-6 && abs > 0)) {
    return n.toPrecision(6).replace(/\.?0+e/, 'e').replace(/e\+?(-?)0*(\d+)/, ' × 10^$1$2');
  }

  // Numbers >= 1: up to 6 significant figures, trim trailing zeros
  if (abs >= 1) {
    const sigFigs = 7;
    const rounded = parseFloat(n.toPrecision(sigFigs));
    // Format with commas for large numbers
    if (abs >= 10000) {
      return rounded.toLocaleString('en-US', { maximumSignificantDigits: sigFigs });
    }
    return String(rounded);
  }

  // Numbers < 1: show enough decimal places
  const decimals = Math.max(2, Math.ceil(-Math.log10(abs)) + 3);
  return parseFloat(n.toFixed(Math.min(decimals, 12))).toString();
}

/** Format seconds into a human-readable duration string */
function formatDuration(totalSeconds) {
  if (!isFinite(totalSeconds) || totalSeconds < 0) return null;

  const years   = Math.floor(totalSeconds / 31557600);
  const days    = Math.floor((totalSeconds % 31557600) / 86400);
  const hours   = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.round(totalSeconds % 60);

  const parts = [];
  if (years)   parts.push(`${years.toLocaleString()}y`);
  if (days)    parts.push(`${days}d`);
  if (hours)   parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (seconds || parts.length === 0) parts.push(`${seconds}s`);

  // Main display: largest 2 units
  const main = parts.slice(0, 2).join(' ');

  // Build a breakdown string
  const breakdown = [];
  if (years)   breakdown.push(`${years.toLocaleString()} year${years !== 1 ? 's' : ''}`);
  if (days)    breakdown.push(`${days} day${days !== 1 ? 's' : ''}`);
  if (hours)   breakdown.push(`${hours} hour${hours !== 1 ? 's' : ''}`);
  if (minutes) breakdown.push(`${minutes} minute${minutes !== 1 ? 's' : ''}`);
  if (seconds && parts.length <= 2) breakdown.push(`${seconds} second${seconds !== 1 ? 's' : ''}`);

  return { main, breakdown: breakdown.join(', ') || null };
}

// --- DOM refs ---
const distanceInput  = document.getElementById('distanceInput');
const unitSelect     = document.getElementById('unitSelect');
const speedEnabled   = document.getElementById('speedEnabled');
const speedControls  = document.getElementById('speedControls');
const speedInput     = document.getElementById('speedInput');
const speedUnitSelect = document.getElementById('speedUnitSelect');
const resultsEmpty   = document.getElementById('resultsEmpty');
const resultsContent = document.getElementById('resultsContent');
const resultsGrid    = document.getElementById('resultsGrid');
const timeResults    = document.getElementById('timeResults');
const timeDisplay    = document.getElementById('timeDisplay');
const themeToggle    = document.getElementById('themeToggle');
const themeIcon      = themeToggle.querySelector('.theme-icon');

// --- Theme ---
function getSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

let currentTheme = localStorage.getItem('dtc-theme') || 'system';

function applyTheme() {
  const resolved = currentTheme === 'system' ? getSystemTheme() : currentTheme;
  document.documentElement.setAttribute('data-theme', resolved);
  themeIcon.textContent = resolved === 'dark' ? '☀' : '☾';
}

themeToggle.addEventListener('click', () => {
  const resolved = currentTheme === 'system' ? getSystemTheme() : currentTheme;
  currentTheme = resolved === 'dark' ? 'light' : 'dark';
  localStorage.setItem('dtc-theme', currentTheme);
  applyTheme();
});

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (currentTheme === 'system') applyTheme();
});

applyTheme();

// --- Speed toggle ---
speedEnabled.addEventListener('change', () => {
  const on = speedEnabled.checked;
  speedControls.classList.toggle('open', on);
  speedControls.setAttribute('aria-hidden', String(!on));
  update();
});

// --- Preset buttons ---
document.querySelectorAll('.preset-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const speed = btn.dataset.speed;
    const unit  = btn.dataset.unit;
    speedInput.value = speed;
    speedUnitSelect.value = unit;
    // Enable speed if not already
    if (!speedEnabled.checked) {
      speedEnabled.checked = true;
      speedControls.classList.add('open');
      speedControls.setAttribute('aria-hidden', 'false');
    }
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    update();
  });
});

// Clear active preset when speed inputs change manually
speedInput.addEventListener('input', () => {
  document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
  update();
});
speedUnitSelect.addEventListener('change', () => {
  document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
  update();
});

// --- Main update ---
distanceInput.addEventListener('input', update);
unitSelect.addEventListener('change', update);

function update() {
  const raw = distanceInput.value.trim();
  const value = parseFloat(raw);

  if (raw === '' || isNaN(value) || value < 0) {
    resultsEmpty.classList.remove('hidden');
    resultsContent.classList.add('hidden');
    return;
  }

  const fromUnit = unitSelect.value;
  resultsEmpty.classList.add('hidden');
  resultsContent.classList.remove('hidden');

  // Build conversion cards
  resultsGrid.innerHTML = '';
  const allUnits = Object.keys(TO_METERS);
  allUnits.forEach(unit => {
    const converted = convert(value, fromUnit, unit);
    const card = document.createElement('div');
    card.className = 'result-card' + (unit === fromUnit ? ' highlight' : '');

    const valueEl = document.createElement('div');
    valueEl.className = 'result-value';
    valueEl.textContent = formatNumber(converted);

    const unitEl = document.createElement('div');
    unitEl.className = 'result-unit';
    unitEl.textContent = `${UNIT_LABELS[unit]} (${UNIT_SHORT[unit]})`;

    card.append(valueEl, unitEl);
    resultsGrid.appendChild(card);
  });

  // Travel time
  const speedOn = speedEnabled.checked;
  const speedVal = parseFloat(speedInput.value);

  if (speedOn && speedInput.value.trim() !== '' && !isNaN(speedVal) && speedVal > 0) {
    const speedUnit = speedUnitSelect.value;
    // Convert distance to meters, speed to m/hour
    const distanceMeters = value * TO_METERS[fromUnit];
    const speedMetersPerHour = speedVal * TO_METERS[speedUnit];
    const hours = distanceMeters / speedMetersPerHour;
    const totalSeconds = hours * 3600;

    const duration = formatDuration(totalSeconds);

    timeResults.classList.remove('hidden');
    timeDisplay.innerHTML = '';

    if (duration) {
      const card = document.createElement('div');
      card.className = 'time-card';

      const left = document.createElement('div');

      const mainEl = document.createElement('div');
      mainEl.className = 'time-main';
      mainEl.textContent = duration.main;

      left.appendChild(mainEl);

      if (duration.breakdown && duration.breakdown !== duration.main.replace(/\d+[ydhms]/g, m => m)) {
        const breakdown = document.createElement('div');
        breakdown.className = 'time-breakdown';
        breakdown.textContent = duration.breakdown;
        left.appendChild(breakdown);
      }

      const right = document.createElement('div');
      right.className = 'time-speed-label';
      right.textContent = `at ${formatNumber(speedVal)} ${UNIT_SHORT[speedUnit]}/hr`;

      card.append(left, right);
      timeDisplay.appendChild(card);
    }
  } else {
    timeResults.classList.add('hidden');
  }
}

// Run once on load in case there's a pre-filled value
update();
