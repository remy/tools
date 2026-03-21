// State
let subtitles = [];   // parsed blocks: { seq, start, end, text }
let offsetMs = 0;     // current offset in milliseconds
let originalFilename = 'subtitles.srt';

// DOM refs
const uploadZone   = document.getElementById('uploadZone');
const fileInput    = document.getElementById('fileInput');
const toolPanel    = document.getElementById('toolPanel');
const fileNameEl   = document.getElementById('fileName');
const fileMetaEl   = document.getElementById('fileMeta');
const clearBtn     = document.getElementById('clearBtn');
const offsetDisplay = document.getElementById('offsetDisplay');
const coarseSlider = document.getElementById('coarseSlider');
const exactInput   = document.getElementById('exactInput');
const resetBtn     = document.getElementById('resetBtn');
const previewList  = document.getElementById('previewList');
const previewCount = document.getElementById('previewCount');
const downloadBtn  = document.getElementById('downloadBtn');

// ── SRT Parsing ──────────────────────────────────────────────────────────────

/** Convert SRT timestamp string to milliseconds */
function tsToMs(ts) {
  // HH:MM:SS,mmm  or  HH:MM:SS.mmm
  const m = ts.trim().match(/^(\d{2}):(\d{2}):(\d{2})[,.](\d{3})$/);
  if (!m) return 0;
  return (
    parseInt(m[1], 10) * 3_600_000 +
    parseInt(m[2], 10) *    60_000 +
    parseInt(m[3], 10) *     1_000 +
    parseInt(m[4], 10)
  );
}

/** Convert milliseconds back to SRT timestamp string */
function msToTs(ms) {
  ms = Math.max(0, Math.round(ms));
  const h   = Math.floor(ms / 3_600_000); ms %= 3_600_000;
  const min = Math.floor(ms /    60_000); ms %=    60_000;
  const sec = Math.floor(ms /     1_000); ms %=     1_000;
  return `${pad2(h)}:${pad2(min)}:${pad2(sec)},${pad3(ms)}`;
}

function pad2(n) { return String(n).padStart(2, '0'); }
function pad3(n) { return String(n).padStart(3, '0'); }

/** Parse raw SRT text into an array of subtitle blocks */
function parseSrt(text) {
  // Normalise line endings, split on blank lines
  const blocks = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split(/\n\s*\n/);
  const result = [];

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 2) continue;

    const seq = lines[0].trim();
    const timeLine = lines[1].trim();
    const arrowMatch = timeLine.match(/^(.+?)\s*-->\s*(.+)$/);
    if (!arrowMatch) continue;

    const start = tsToMs(arrowMatch[1]);
    const end   = tsToMs(arrowMatch[2]);
    const textLines = lines.slice(2).join('\n').trim();

    result.push({ seq, start, end, text: textLines });
  }

  return result;
}

/** Serialise subtitle blocks back to SRT, applying offsetMs */
function serializeSrt(blocks, offset) {
  return blocks.map(({ seq, start, end, text }) => {
    const s = msToTs(start + offset);
    const e = msToTs(end   + offset);
    return `${seq}\n${s} --> ${e}\n${text}`;
  }).join('\n\n') + '\n';
}

// ── File loading ─────────────────────────────────────────────────────────────

function loadFile(file) {
  if (!file || !file.name.toLowerCase().endsWith('.srt')) {
    alert('Please select a valid .srt file.');
    return;
  }
  originalFilename = file.name;

  const reader = new FileReader();
  reader.onload = (e) => {
    subtitles = parseSrt(e.target.result);
    if (!subtitles.length) {
      alert('No subtitle blocks found. Is this a valid SRT file?');
      return;
    }
    offsetMs = 0;
    showTool();
  };
  reader.readAsText(file, 'utf-8');
}

function showTool() {
  uploadZone.hidden = true;
  toolPanel.hidden  = false;

  fileNameEl.textContent = originalFilename;
  fileMetaEl.textContent = `${subtitles.length} subtitle${subtitles.length !== 1 ? 's' : ''}`;

  syncUI();
}

function resetTool() {
  subtitles = [];
  offsetMs  = 0;
  fileInput.value = '';
  uploadZone.hidden = false;
  toolPanel.hidden  = true;
}

// ── Offset management ────────────────────────────────────────────────────────

function setOffset(ms) {
  // Clamp to slider range
  offsetMs = Math.max(-60_000, Math.min(60_000, ms));
  syncUI();
}

function syncUI() {
  // Display
  const sign  = offsetMs >= 0 ? '+' : '−';
  const absMs = Math.abs(offsetMs);
  const secs  = (absMs / 1000).toFixed(3);
  offsetDisplay.textContent = `${sign}${secs} s`;
  offsetDisplay.style.color = offsetMs === 0
    ? 'var(--text-secondary)'
    : offsetMs > 0 ? 'var(--success)' : 'var(--danger)';

  // Slider (may be out of range if typed exactly ±60000)
  coarseSlider.value = offsetMs;

  // Exact input
  exactInput.value = (offsetMs / 1000).toFixed(3);

  // Preview
  renderPreview();
}

// ── Preview ──────────────────────────────────────────────────────────────────

const PREVIEW_LIMIT = 8;

function renderPreview() {
  const shown = subtitles.slice(0, PREVIEW_LIMIT);
  previewCount.textContent = `(first ${shown.length} of ${subtitles.length})`;

  previewList.innerHTML = '';

  shown.forEach(({ seq, start, end, text }) => {
    const item = document.createElement('div');
    item.className = 'preview-item';

    const s = msToTs(start + offsetMs);
    const e = msToTs(end   + offsetMs);

    item.innerHTML = `
      <span class="preview-seq">#${seq}</span>
      <span class="preview-time">${s} → ${e}</span>
      <span class="preview-text">${escHtml(text)}</span>
    `;
    previewList.appendChild(item);
  });

  if (subtitles.length > PREVIEW_LIMIT) {
    const clip = document.createElement('div');
    clip.className = 'preview-clipped';
    clip.textContent = `…and ${subtitles.length - PREVIEW_LIMIT} more`;
    previewList.appendChild(clip);
  }
}

function escHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ── Download ─────────────────────────────────────────────────────────────────

function downloadSrt() {
  const content = serializeSrt(subtitles, offsetMs);
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url  = URL.createObjectURL(blob);

  const suffix = offsetMs === 0 ? '' :
    (offsetMs > 0 ? `_plus${(offsetMs/1000).toFixed(3)}s` : `_minus${(Math.abs(offsetMs)/1000).toFixed(3)}s`);
  const outName = originalFilename.replace(/\.srt$/i, '') + suffix + '.srt';

  const a = document.createElement('a');
  a.href     = url;
  a.download = outName;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Events ───────────────────────────────────────────────────────────────────

// Drag & drop
uploadZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadZone.classList.add('drag-over');
});
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  loadFile(e.dataTransfer.files[0]);
});
uploadZone.addEventListener('click', (e) => {
  if (e.target.tagName !== 'LABEL') fileInput.click();
});
fileInput.addEventListener('change', () => loadFile(fileInput.files[0]));

// Clear
clearBtn.addEventListener('click', resetTool);

// Reset offset
resetBtn.addEventListener('click', () => setOffset(0));

// Slider
coarseSlider.addEventListener('input', () => setOffset(parseInt(coarseSlider.value, 10)));

// Preset / fine-tune buttons
document.querySelectorAll('.preset, .fine').forEach((btn) => {
  btn.addEventListener('click', () => {
    const delta = parseInt(btn.dataset.delta, 10);
    setOffset(offsetMs + delta);
  });
});

// Exact input
exactInput.addEventListener('input', () => {
  const val = parseFloat(exactInput.value);
  if (!isNaN(val)) setOffset(Math.round(val * 1000));
});
exactInput.addEventListener('keydown', (e) => {
  // Arrow up/down adjusts by 10ms instead of the input's default step
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    setOffset(offsetMs + (e.shiftKey ? 100 : e.altKey ? 1 : 10));
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    setOffset(offsetMs - (e.shiftKey ? 100 : e.altKey ? 1 : 10));
  }
});

// Download
downloadBtn.addEventListener('click', downloadSrt);
