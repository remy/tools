'use strict';

// ── LCS DIFF ──────────────────────────────────────────────
// Returns array of {type:'equal'|'delete'|'insert', val:string}
// 'delete' = in file1 only  |  'insert' = in file2 only
function lcsDiff(text1, text2) {
  const a = text1.split('\n');
  const b = text2.split('\n');
  const m = a.length, n = b.length;

  if (m * n > 50_000_000) {
    return { error: `Files too large (${m} × ${n} lines). Try files under ~7000 lines each.` };
  }

  // Flat Uint32Array DP table — far faster than array-of-arrays
  const W = n + 1;
  const dp = new Uint32Array((m + 1) * W);
  for (let i = 1; i <= m; i++) {
    const row  = i * W;
    const prev = row - W;
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) dp[row + j] = dp[prev + j - 1] + 1;
      else dp[row + j] = dp[prev + j] > dp[row + j - 1] ? dp[prev + j] : dp[row + j - 1];
    }
  }

  // Backtrack to build ops
  const ops = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      ops.push({ type: 'equal', val: a[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i * W + j - 1] >= dp[(i - 1) * W + j])) {
      ops.push({ type: 'insert', val: b[j - 1] });
      j--;
    } else {
      ops.push({ type: 'delete', val: a[i - 1] });
      i--;
    }
  }
  ops.reverse();
  return { ops };
}

// ── PROCESS OPS → DISPLAY ROWS + HUNKS ───────────────────
// displayRows: [{type, left, right, hunkId, isStart}]
// hunks:       [{id, file1Lines, file2Start, file2Count}]
function processOps(ops) {
  const displayRows = [];
  const hunks = [];
  let f1Pos = 0;
  let f2Pos = 0;
  let i = 0;

  while (i < ops.length) {
    if (ops[i].type === 'equal') {
      displayRows.push({ type: 'equal', left: ops[i].val, right: ops[i].val });
      f1Pos++;
      f2Pos++;
      i++;
      continue;
    }

    // Gather all consecutive non-equal ops into one hunk
    const hunkId = hunks.length;
    const f1Start = f1Pos;
    const f2Start = f2Pos;
    const deletes = [], inserts = [];

    while (i < ops.length && ops[i].type !== 'equal') {
      if (ops[i].type === 'delete') {
        deletes.push(ops[i].val);
        f1Pos++;
      } else {
        inserts.push(ops[i].val);
        f2Pos++;
      }
      i++;
    }

    // Pair deletions with insertions for side-by-side rows
    const len = Math.max(deletes.length, inserts.length);
    for (let k = 0; k < len; k++) {
      const hasL = k < deletes.length;
      const hasR = k < inserts.length;
      displayRows.push({
        type: (hasL && hasR) ? 'change' : hasL ? 'del' : 'ins',
        left:  hasL ? deletes[k] : null,
        right: hasR ? inserts[k] : null,
        hunkId,
        isStart: k === 0,
      });
    }

    hunks.push({
      id: hunkId,
      file1Start: f1Start, file1Lines: deletes,
      file2Start: f2Start, file2Lines: inserts,
    });
  }

  return { displayRows, hunks };
}

// ── COLLAPSE LONG EQUAL RUNS ──────────────────────────────
const CTX = 4; // context lines to show around each hunk

function collapseEqualRuns(rows) {
  const out = [];
  let i = 0;
  while (i < rows.length) {
    if (rows[i].type !== 'equal') { out.push(rows[i]); i++; continue; }

    let j = i;
    while (j < rows.length && rows[j].type === 'equal') j++;
    const count = j - i;

    if (count <= CTX * 2) {
      for (let k = i; k < j; k++) out.push(rows[k]);
    } else {
      for (let k = i; k < i + CTX; k++) out.push(rows[k]);
      out.push({ type: 'collapsed', count: count - CTX * 2, start: i + CTX, end: j - CTX });
      for (let k = j - CTX; k < j; k++) out.push(rows[k]);
    }
    i = j;
  }
  return out;
}

// ── HTML HELPERS ──────────────────────────────────────────
function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── RENDER ────────────────────────────────────────────────
function renderDiff(displayRows, hunks) {
  // Stats
  const f1unique = hunks.reduce((s, h) => s + h.file1Lines.length, 0);
  const f2unique = hunks.reduce((s, h) => s + h.file2Count, 0);
  document.getElementById('diff-stats').innerHTML =
    `<span class="stat-del">&#8722;${f1unique} from file&nbsp;1</span>` +
    `<span class="stat-add">+${f2unique} from file&nbsp;2</span>` +
    `<span>${hunks.length} hunk${hunks.length !== 1 ? 's' : ''}</span>`;
  document.getElementById('diff-toolbar').style.display = 'flex';

  if (hunks.length === 0) {
    return '<div class="identical-state">Files are identical — no differences found.</div>';
  }

  const collapsed = collapseEqualRuns(displayRows);
  const parts = [
    '<div class="diff-wrap">',
    '<div class="diff-col-header">',
    '<div>Main file</div><div></div><div>Changes</div>',
    '</div>',
  ];

  for (const row of collapsed) {
    if (row.type === 'collapsed') {
      parts.push(
        `<div class="diff-row row-collapsed" data-start="${row.start}" data-end="${row.end}">` +
        `<div class="collapsed-cell">&#8597; ${row.count} unchanged line${row.count !== 1 ? 's' : ''} &#8212; click to expand</div>` +
        `</div>`
      );
      continue;
    }

    if (row.type === 'equal') {
      parts.push(
        `<div class="diff-row row-equal">` +
        `<div class="diff-cell diff-left">${esc(row.left)}</div>` +
        `<div class="diff-gutter"></div>` +
        `<div class="diff-cell diff-right">${esc(row.right)}</div>` +
        `</div>`
      );
      continue;
    }

    const cls = row.type === 'change' ? 'row-change' : row.type === 'del' ? 'row-del' : 'row-ins';
    const leftHtml  = row.left  !== null ? esc(row.left)  : '';
    const rightHtml = row.right !== null ? esc(row.right) : '';
    const gutter = row.isStart
      ? `<button class="btn-apply" data-hunk="${row.hunkId}" ` +
        `title="Apply this change into the main file">&#x2190; Apply</button>`
      : '';

    parts.push(
      `<div class="diff-row ${cls}">` +
      `<div class="diff-cell diff-left">${leftHtml}</div>` +
      `<div class="diff-gutter">${gutter}</div>` +
      `<div class="diff-cell diff-right">${rightHtml}</div>` +
      `</div>`
    );
  }

  parts.push('</div>');
  return parts.join('');
}

// ── STATE ─────────────────────────────────────────────────
let currentHunks = [];
let currentDisplayRows = [];

// ── UPDATE DIFF ───────────────────────────────────────────
function updateDiff() {
  const t1 = document.getElementById('text1').value;
  const t2 = document.getElementById('text2').value;
  const view = document.getElementById('diff-view');
  const toolbar = document.getElementById('diff-toolbar');

  if (!t1 || !t2) {
    currentHunks = [];
    currentDisplayRows = [];
    view.innerHTML = '<div class="empty-state">Upload or paste two files above to see the diff.</div>';
    toolbar.style.display = 'none';
    const label = !t1 && !t2 ? 'Files' : !t1 ? 'Files — file 1 missing' : 'Files — file 2 missing';
    document.getElementById('files-summary-label').textContent = label;
    return;
  }

  const result = lcsDiff(t1, t2);
  if (result.error) {
    view.innerHTML = `<div class="empty-state">${esc(result.error)}</div>`;
    toolbar.style.display = 'none';
    return;
  }

  const { displayRows, hunks } = processOps(result.ops);
  currentHunks = hunks;
  currentDisplayRows = displayRows;

  view.innerHTML = renderDiff(displayRows, hunks);

  // Attach Apply handlers
  view.querySelectorAll('.btn-apply').forEach(btn => {
    btn.addEventListener('click', () => applyHunk(+btn.dataset.hunk));
  });

  // Attach expand handlers
  view.querySelectorAll('.row-collapsed').forEach(row => {
    row.addEventListener('click', () =>
      expandCollapsed(+row.dataset.start, +row.dataset.end, row));
  });

  // Update summary
  const n = hunks.length;
  document.getElementById('files-summary-label').textContent =
    n === 0 ? 'Files — identical' : `Files — ${n} hunk${n !== 1 ? 's' : ''}`;
}

// ── APPLY HUNK ────────────────────────────────────────────
// Applies the file-2 lines for this hunk into file-1 (the main file).
function applyHunk(hunkId) {
  const hunk = currentHunks[hunkId];
  if (!hunk) return;
  const ta = document.getElementById('text1');
  const lines = ta.value.split('\n');
  lines.splice(hunk.file1Start, hunk.file1Lines.length, ...hunk.file2Lines);
  ta.value = lines.join('\n');
  updateDiff();
}

// ── EXPAND COLLAPSED ──────────────────────────────────────
function expandCollapsed(start, end, rowEl) {
  const rows = currentDisplayRows.slice(start, end);
  const html = rows.map(r =>
    `<div class="diff-row row-equal">` +
    `<div class="diff-cell diff-left">${esc(r.left)}</div>` +
    `<div class="diff-gutter"></div>` +
    `<div class="diff-cell diff-right">${esc(r.right)}</div>` +
    `</div>`
  ).join('');
  rowEl.insertAdjacentHTML('afterend', html);
  rowEl.remove();
}

// ── FILE UPLOAD ───────────────────────────────────────────
function readFile(file, drop, ta) {
  const reader = new FileReader();
  reader.onload = e => {
    ta.value = e.target.result;
    drop.textContent = file.name;
    updateDiff();
  };
  reader.readAsText(file);
}

function setupDrop(dropId, inputId, textareaId) {
  const drop = document.getElementById(dropId);
  const input = document.getElementById(inputId);
  const ta = document.getElementById(textareaId);

  // Drop zone click → file picker
  drop.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    if (input.files[0]) { readFile(input.files[0], drop, ta); input.value = ''; }
  });

  // Drop zone drag events
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('dragover'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
  drop.addEventListener('drop', e => {
    e.preventDefault();
    drop.classList.remove('dragover');
    if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0], drop, ta);
  });

  // Textarea drag events — drop a file directly onto the textarea
  ta.addEventListener('dragover', e => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      ta.classList.add('dragover');
    }
  });
  ta.addEventListener('dragleave', () => ta.classList.remove('dragover'));
  ta.addEventListener('drop', e => {
    if (!e.dataTransfer.files[0]) return;
    e.preventDefault();
    ta.classList.remove('dragover');
    readFile(e.dataTransfer.files[0], drop, ta);
  });
}

setupDrop('drop1', 'file-input-1', 'text1');
setupDrop('drop2', 'file-input-2', 'text2');

// ── TEXTAREA LIVE DIFF ────────────────────────────────────
let debounceTimer;
function scheduleUpdate() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(updateDiff, 280);
}
document.getElementById('text1').addEventListener('input', scheduleUpdate);
document.getElementById('text2').addEventListener('input', scheduleUpdate);

// ── DOWNLOAD ──────────────────────────────────────────────
document.getElementById('download-btn').addEventListener('click', () => {
  const content = document.getElementById('text1').value;
  if (!content) return;
  const drop1Text = document.getElementById('drop1').textContent.trim();
  const name = (drop1Text === 'Drop a file here or click to browse') ? 'merged.txt' : drop1Text;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: 'text/plain' }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
});

// ── CLEAR ─────────────────────────────────────────────────
document.getElementById('clear-btn').addEventListener('click', () => {
  document.getElementById('text1').value = '';
  document.getElementById('text2').value = '';
  document.getElementById('drop1').textContent = 'Drop a file here or click to browse';
  document.getElementById('drop2').textContent = 'Drop a file here or click to browse';
  document.getElementById('files-panel').open = true;
  updateDiff();
});

// ── THEME TOGGLE ──────────────────────────────────────────
const htmlEl = document.documentElement;
const sunEl  = document.getElementById('icon-sun');
const moonEl = document.getElementById('icon-moon');

function applyTheme(theme) {
  htmlEl.dataset.theme = theme;
  sunEl.style.display  = theme === 'dark'  ? 'block' : 'none';
  moonEl.style.display = theme === 'light' ? 'block' : 'none';
  localStorage.setItem('merge-theme', theme);
}

document.getElementById('theme-btn').addEventListener('click', () => {
  applyTheme(htmlEl.dataset.theme === 'dark' ? 'light' : 'dark');
});

// Init: prefer saved, else system
const saved = localStorage.getItem('merge-theme');
if (saved) {
  applyTheme(saved);
} else {
  const sys = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  applyTheme(sys);
}

// ── RESTORE CACHED CONTENT ────────────────────────────────
// Browsers may restore textarea values from the session cache before
// JS runs. Check after the page settles and trigger a diff if so.
window.addEventListener('pageshow', () => {
  if (document.getElementById('text1').value || document.getElementById('text2').value) {
    updateDiff();
  }
});
