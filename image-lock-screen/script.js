// Image Lock Screen — render an uploaded image and hold the screen awake.

const STORAGE_KEY = 'image-lock-screen.settings';

const DEFAULTS = {
  fit: 'contain',
  bg: 'black',
  dim: 0,
  clock: true,
  hour24: true,
  fullscreen: true,
};

const BACKGROUNDS = {
  black: '#000000',
  dark: '#18181b',
  white: '#ffffff',
  blur: '#000000',
};

const $ = (id) => document.getElementById(id);

const empty = $('empty');
const viewer = $('viewer');
const stage = $('stage');
const frame = $('frame');
const image = $('image');
const clock = $('clock');
const clockTime = $('clock-time');
const clockDate = $('clock-date');
const fileName = $('file-name');
const statusEl = $('status');
const dialog = $('settings-dialog');
const wake = $('wake');
const wakeLabel = $('btn-wake-label');
const wakeButton = $('btn-wake');

const settings = loadSettings();

let objectUrl = null;
let rotation = 0;
let locked = false;
let wantWake = false;
let wakeBeforeLock = false;
let didRequestFullscreen = false;
let chromeTimer = null;
let statusTimer = null;
let clockTimer = null;

// ─── Settings ───────────────────────────────────────────────────────────

function loadSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return { ...DEFAULTS, ...stored };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveSettings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* storage may be unavailable — the session still works */
  }
}

function applySettings() {
  viewer.dataset.fit = settings.fit;
  viewer.dataset.bg = settings.bg;
  viewer.style.setProperty('--dim', settings.dim);
  document.documentElement.style.setProperty(
    '--stage-bg',
    BACKGROUNDS[settings.bg] ?? BACKGROUNDS.black
  );
  updateClockVisibility();
  applyRotation();
}

// ─── Image ──────────────────────────────────────────────────────────────

function showImage(file) {
  if (!file || !file.type.startsWith('image/')) {
    showStatus('That file is not an image.');
    return;
  }

  const url = URL.createObjectURL(file);
  const previous = objectUrl;

  image.onload = () => {
    if (previous) URL.revokeObjectURL(previous);
    applyRotation();
  };
  image.onerror = () => {
    URL.revokeObjectURL(url);
    objectUrl = previous;
    showStatus('That image could not be displayed.');
  };

  objectUrl = url;
  image.src = url;
  image.alt = file.name || 'Uploaded image';
  fileName.textContent = file.name || 'Pasted image';
  stage.style.setProperty('--img-url', `url("${url}")`);

  rotation = 0;
  empty.hidden = true;
  viewer.hidden = false;
  document.body.classList.add('has-image');
  applySettings();
}

function applyRotation() {
  const turned = rotation % 180 !== 0;
  frame.style.width = turned ? `${stage.clientHeight}px` : '100%';
  frame.style.height = turned ? `${stage.clientWidth}px` : '100%';
  frame.style.transform = `translate(-50%, -50%) rotate(${rotation}deg)`;
}

new ResizeObserver(() => applyRotation()).observe(stage);

// ─── Wake lock ──────────────────────────────────────────────────────────

function syncWakeButton() {
  const active = wake.active;
  wakeButton.setAttribute('aria-pressed', String(active));
  wakeLabel.textContent = active ? 'Awake' : 'Keep awake';
}

wake.addEventListener('locked', () => {
  wantWake = true;
  syncWakeButton();
});

wake.addEventListener('released', () => {
  // A release while the page is hidden is the system reclaiming the lock —
  // keep wanting it so it can be re-acquired when the page comes back.
  if (document.visibilityState === 'visible') wantWake = false;
  syncWakeButton();
});

wake.addEventListener('error', (e) => {
  wantWake = false;
  syncWakeButton();
  showStatus(`Could not keep the screen awake: ${e.detail?.message ?? 'unknown error'}`);
});

wake.addEventListener('unsupported', () => {
  showStatus('This browser does not support the Screen Wake Lock API.');
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && wantWake && !wake.active) {
    wake.request();
  }
});

// ─── Lock screen mode ───────────────────────────────────────────────────

async function enterLock() {
  if (locked) return;
  locked = true;
  document.body.classList.add('locked');
  updateClockVisibility();

  wakeBeforeLock = wake.active;
  if (!wake.supported) {
    showStatus('Locked, but this browser cannot hold a wake lock — the screen may still sleep.');
  } else if (!wake.active) {
    await wake.request();
  }

  if (settings.fullscreen && document.documentElement.requestFullscreen) {
    try {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      didRequestFullscreen = true;
    } catch {
      didRequestFullscreen = false;
    }
  }

  revealChrome();
}

function exitLock() {
  if (!locked) return;
  locked = false;
  document.body.classList.remove('locked', 'chrome-visible');
  clearTimeout(chromeTimer);
  updateClockVisibility();

  if (!wakeBeforeLock) wake.release();

  if (didRequestFullscreen && document.fullscreenElement) {
    document.exitFullscreen?.().catch(() => {});
  }
  didRequestFullscreen = false;
}

function revealChrome() {
  if (!locked) return;
  document.body.classList.add('chrome-visible');
  clearTimeout(chromeTimer);
  chromeTimer = setTimeout(() => {
    document.body.classList.remove('chrome-visible');
  }, 3000);
}

document.addEventListener('fullscreenchange', () => {
  // Leaving fullscreen by gesture or Escape leaves the lock screen too.
  if (locked && didRequestFullscreen && !document.fullscreenElement) exitLock();
});

// ─── Clock ──────────────────────────────────────────────────────────────

function updateClockVisibility() {
  const show = locked && settings.clock;
  clock.hidden = !show;

  clearInterval(clockTimer);
  clockTimer = null;

  if (show) {
    tickClock();
    clockTimer = setInterval(tickClock, 1000);
  }
}

function tickClock() {
  const now = new Date();
  const time = now.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: !settings.hour24,
  });
  const date = now.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  if (clockTime.textContent !== time) clockTime.textContent = time;
  if (clockDate.textContent !== date) clockDate.textContent = date;
}

// ─── Status ─────────────────────────────────────────────────────────────

function showStatus(message) {
  statusEl.textContent = message;
  statusEl.hidden = false;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    statusEl.hidden = true;
  }, 4000);
}

// ─── Controls ───────────────────────────────────────────────────────────

$('btn-rotate').addEventListener('click', () => {
  rotation = (rotation + 90) % 360;
  applyRotation();
});

$('btn-replace').addEventListener('click', () => {
  window.__imageLockScreenEarly.openPicker();
});

$('btn-lock').addEventListener('click', enterLock);
$('btn-unlock').addEventListener('click', exitLock);

for (const event of ['pointermove', 'pointerdown', 'wheel']) {
  window.addEventListener(event, () => revealChrome(), { passive: true });
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && locked) {
    exitLock();
    return;
  }
  if (locked) revealChrome();
});

// ─── Settings dialog ────────────────────────────────────────────────────

const fitInput = $('set-fit');
const bgInput = $('set-bg');
const dimInput = $('set-dim');
const dimValue = $('set-dim-value');
const clockInput = $('set-clock');
const hour24Input = $('set-24h');
const fullscreenInput = $('set-fullscreen');

function fillDialog() {
  fitInput.value = settings.fit;
  bgInput.value = settings.bg;
  dimInput.value = settings.dim;
  dimValue.textContent = `${settings.dim}%`;
  clockInput.checked = settings.clock;
  hour24Input.checked = settings.hour24;
  fullscreenInput.checked = settings.fullscreen;
}

function bind(el, key, read) {
  el.addEventListener('input', () => {
    settings[key] = read(el);
    if (key === 'dim') dimValue.textContent = `${settings.dim}%`;
    saveSettings();
    applySettings();
  });
}

bind(fitInput, 'fit', (el) => el.value);
bind(bgInput, 'bg', (el) => el.value);
bind(dimInput, 'dim', (el) => Number(el.value));
bind(clockInput, 'clock', (el) => el.checked);
bind(hour24Input, 'hour24', (el) => el.checked);
bind(fullscreenInput, 'fullscreen', (el) => el.checked);

$('btn-settings').addEventListener('click', () => {
  fillDialog();
  dialog.showModal();
});

dialog.addEventListener('click', (e) => {
  if (e.target === dialog) dialog.close();
});

if (!('wakeLock' in navigator)) {
  $('support-note').hidden = false;
  $('btn-lock').title = 'Screen Wake Lock is not supported in this browser';
}

// ─── Boot ───────────────────────────────────────────────────────────────

applySettings();
syncWakeButton();
fillDialog();
window.__imageLockScreenEarly.register(showImage);
