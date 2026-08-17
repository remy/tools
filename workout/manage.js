import { db, normalisePlan, planToJson, getSyncConfig, setSyncConfig } from './db.js';
import { isRestTimerEnabled, setRestTimerEnabled } from './prefs.js';
import { consumeLinkParams } from '/lib/deep-link.js';
import '/lib/sync-settings.wc.js';

const $ = (id) => document.getElementById(id);

const DEFAULT_DROP_LABEL = 'Tap to choose file or drag &amp; drop';

let pendingData = null;

function showStatus(msg, type) {
  const el = $('status');
  el.textContent = msg;
  el.className = 'status ' + type;
}

function hideStatus() {
  $('status').className = 'status';
}

function showPreview(data) {
  const preview = $('preview');
  const workouts = data.workouts;
  const totalExercises = workouts.reduce((sum, w) => sum + w.exercises.length, 0);
  const chips = workouts.map((w) => {
    const typeLabel = w.type === 'circuit' ? ' · circuit' : '';
    return `<div class="workout-chip"><strong>${w.id} — ${w.label}</strong>${w.focus}<br><span>${w.exercises.length} exercises${typeLabel}${w.cardio ? ' + cardio' : ''}</span></div>`;
  }).join('');
  preview.innerHTML = `
    <div class="preview-title">PREVIEW — ${workouts.length} workout${workouts.length === 1 ? '' : 's'}, ${totalExercises} exercises total</div>
    <div class="workout-summary">${chips}</div>
  `;
  preview.classList.add('visible');
}

function hidePreview() {
  $('preview').classList.remove('visible');
}

function resetFileDrop() {
  const fileDrop = $('file-drop');
  fileDrop.innerHTML = DEFAULT_DROP_LABEL;
  fileDrop.appendChild($('file-input'));
  $('file-input').value = '';
}

function clearPending() {
  pendingData = null;
  $('import-btn').disabled = true;
  hidePreview();
}

function processJsonText(text, onInvalid) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    if (onInvalid) onInvalid('Invalid JSON: ' + e.message);
    clearPending();
    return false;
  }
  if (!data || !data.workouts || !Array.isArray(data.workouts) || data.workouts.length === 0) {
    if (onInvalid) onInvalid('Invalid format: JSON must have a "workouts" array with at least one entry.');
    clearPending();
    return false;
  }
  pendingData = data;
  $('import-btn').disabled = false;
  showPreview(data);
  hideStatus();
  return true;
}

function handleFile(file) {
  if (!file.name.endsWith('.json') && file.type !== 'application/json') {
    showStatus('Please select a JSON file.', 'error');
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    $('paste-input').value = '';
    const ok = processJsonText(reader.result, (msg) => showStatus(msg, 'error'));
    if (ok) {
      const fileDrop = $('file-drop');
      fileDrop.innerHTML = DEFAULT_DROP_LABEL + '<span class="file-name">' + file.name + '</span>';
      fileDrop.appendChild($('file-input'));
    }
  };
  reader.readAsText(file);
}

// A stored plan means the built-in workouts.json is no longer in use.
async function updateSourceInfo() {
  const stored = await db.getPlan();
  $('source-info').innerHTML = stored
    ? '<span class="source-badge custom">Custom</span>'
    : '<span class="source-badge default">Default</span>';
}

function bindSettings() {
  // A per-device preference, so it stays in localStorage.
  $('rest-timer-toggle').checked = isRestTimerEnabled();
  $('rest-timer-toggle').addEventListener('change', (e) => setRestTimerEnabled(e.target.checked));
}

function bindCurrentData() {
  // Download the plan in use, stripped back to the schema in PROMPT.md so the
  // file can be handed to anyone.
  $('download-btn').addEventListener('click', async () => {
    const stored = await db.getPlan();
    const data = stored ? planToJson(stored) : await (await fetch('workouts.json')).json();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'workouts.json';
    a.click();
    URL.revokeObjectURL(url);
  });
}

function bindImport() {
  const fileDrop = $('file-drop');
  const fileInput = $('file-input');
  const pasteInput = $('paste-input');

  fileDrop.addEventListener('click', () => fileInput.click());

  fileDrop.addEventListener('dragover', (e) => {
    e.preventDefault();
    fileDrop.classList.add('dragover');
  });

  fileDrop.addEventListener('dragleave', () => {
    fileDrop.classList.remove('dragover');
  });

  fileDrop.addEventListener('drop', (e) => {
    e.preventDefault();
    fileDrop.classList.remove('dragover');
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files.length) handleFile(fileInput.files[0]);
  });

  pasteInput.addEventListener('input', () => {
    const text = pasteInput.value.trim();
    if (!text) {
      clearPending();
      hideStatus();
      return;
    }
    resetFileDrop();
    processJsonText(text, (msg) => showStatus(msg, 'error'));
  });

  // Importing a plan replaces the old one outright, so the day's progress goes
  // with it — sets logged against a different exercise list mean nothing.
  $('import-btn').addEventListener('click', async () => {
    if (!pendingData) return;
    try {
      await db.savePlan(normalisePlan(pendingData));
      await db.clearAllProgress();
      showStatus('Workouts imported successfully! Go back to see your custom plan.', 'success');
      pendingData = null;
      $('import-btn').disabled = true;
      pasteInput.value = '';
      resetFileDrop();
      hidePreview();
      updateSourceInfo();
    } catch (e) {
      showStatus('Failed to save: ' + e.message, 'error');
    }
  });
}

function bindSync() {
  $('sync-settings').configure({
    store: db,
    getConfig: getSyncConfig,
    setConfig: setSyncConfig,
    mergeWarning:
      'A workout plan exists on this device. Saving will merge it with the '
      + "server's data (last write wins per workout).\n\n"
      + 'To REPLACE local data with the server instead, cancel and use '
      + '"Pull from server".\n\nContinue with merge?',
    onRefresh: updateSourceInfo,
  });
}

function bindReset() {
  $('reset-btn').addEventListener('click', async () => {
    await db.clearPlan();
    await db.clearAllProgress();
    showStatus('Reset to default workouts.', 'success');
    updateSourceInfo();
  });
}

function init() {
  bindSettings();
  bindCurrentData();
  bindImport();
  bindSync();
  bindReset();
  updateSourceInfo();
}

// A ?sync= link has to be applied before anything boots, and reloads the page —
// skip the normal init when one is on its way.
if (!consumeLinkParams({ setConfig: setSyncConfig })) init();
