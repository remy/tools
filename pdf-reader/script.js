import * as pdfjsLib from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/build/pdf.min.mjs';

const PDFJS_BASE = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/';
pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_BASE + 'build/pdf.worker.min.mjs';

const empty = document.getElementById('empty');
const emptyError = document.getElementById('empty-error');
const readerRoot = document.getElementById('reader-root');
const doc = document.getElementById('doc');
const toolbarName = document.getElementById('toolbar-name');
const toolbarProgress = document.getElementById('toolbar-progress');

/* ---------- Reading preferences ---------- */

const SETTINGS_KEY = 'pdf-reader:settings';
const SIZES = { small: '1rem', medium: '1.125rem', large: '1.3125rem', xlarge: '1.5rem' };
const WIDTHS = { narrow: '34rem', comfortable: '42rem', wide: '52rem' };
const FAMILIES = {
  serif: 'Georgia, "Iowan Old Style", "Times New Roman", Times, serif',
  sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
};

const defaults = { size: 'medium', family: 'serif', width: 'comfortable' };
let settings = { ...defaults };
try {
  const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
  settings = { ...defaults, ...saved };
} catch (_) { /* ignore */ }

function applySettings() {
  const root = document.documentElement.style;
  root.setProperty('--reading-size', SIZES[settings.size] || SIZES.medium);
  root.setProperty('--reading-width', WIDTHS[settings.width] || WIDTHS.comfortable);
  root.setProperty('--reading-family', FAMILIES[settings.family] || FAMILIES.serif);
  for (const [group, key] of [['seg-size', 'size'], ['seg-family', 'family'], ['seg-width', 'width']]) {
    document.querySelectorAll('#' + group + ' button').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.value === settings[key]));
    });
  }
}

function bindSegment(id, key) {
  document.getElementById(id).addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-value]');
    if (!btn) return;
    settings[key] = btn.dataset.value;
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (_) { /* ignore */ }
    applySettings();
  });
}
bindSegment('seg-size', 'size');
bindSegment('seg-family', 'family');
bindSegment('seg-width', 'width');
applySettings();

const settingsDialog = document.getElementById('settings-dialog');
document.getElementById('btn-settings').addEventListener('click', () => {
  syncCouchUI();
  setCouchStatus('');
  settingsDialog.showModal();
});
document.getElementById('settings-close').addEventListener('click', () => settingsDialog.close());
settingsDialog.addEventListener('click', (e) => {
  if (e.target === settingsDialog) settingsDialog.close();
});

document.getElementById('btn-new').addEventListener('click', () => window.__pdfEarly.openFilePicker());

/* ---------- Sharing via CouchDB ---------- */

const PouchDB = globalThis.PouchDB;
const COUCH_PREFIX = 'pdf-reader:couch.';
const DOC_PARAM = 'doc';
const SETUP_PARAM = 'couch';

function getCouchConfig() {
  return {
    url: localStorage.getItem(COUCH_PREFIX + 'url') || '',
    token: localStorage.getItem(COUCH_PREFIX + 'token') || '',
  };
}

function setCouchConfig({ url, token }) {
  const setOrClear = (k, v) => {
    if (v) localStorage.setItem(COUCH_PREFIX + k, String(v));
    else localStorage.removeItem(COUCH_PREFIX + k);
  };
  setOrClear('url', url);
  setOrClear('token', token);
}

// URL-safe base64 of {url, token} so the value survives a query string.
function encodeCouchConfig({ url, token }) {
  const bytes = new TextEncoder().encode(JSON.stringify({ url, token: token || '' }));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeCouchConfig(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const cfg = JSON.parse(new TextDecoder().decode(bytes));
  if (!cfg || typeof cfg.url !== 'string') throw new Error('Malformed config');
  return { url: cfg.url, token: typeof cfg.token === 'string' ? cfg.token : '' };
}

function remoteDb(cfg) {
  const opts = {};
  if (cfg.token) {
    opts.fetch = (url, init) => {
      const headers = new Headers(init?.headers || {});
      headers.set('Authorization', 'Bearer ' + cfg.token);
      return PouchDB.fetch(url, { ...init, headers });
    };
  }
  return new PouchDB(cfg.url, opts);
}

// ── Settings dialog: CouchDB controls ──
const couchUrl = document.getElementById('couch-url');
const couchToken = document.getElementById('couch-token');
const couchStatus = document.getElementById('couch-status');
const couchSetupBtn = document.getElementById('couch-share-setup');
const shareBtn = document.getElementById('btn-share');

function setCouchStatus(msg, state) {
  couchStatus.textContent = msg || '';
  if (state) couchStatus.dataset.state = state; else delete couchStatus.dataset.state;
}

function syncCouchUI() {
  const cfg = getCouchConfig();
  couchUrl.value = cfg.url;
  couchToken.value = cfg.token;
  couchSetupBtn.disabled = !cfg.url;
}

document.getElementById('couch-save').addEventListener('click', async () => {
  const url = couchUrl.value.trim().replace(/\/+$/, '');
  const token = couchToken.value.trim();
  setCouchConfig({ url, token });
  syncCouchUI();
  if (!url) { setCouchStatus('Connection cleared.'); return; }
  setCouchStatus('Checking connection…');
  try {
    await remoteDb({ url, token }).info();
    setCouchStatus('Connected.', 'ok');
  } catch (err) {
    setCouchStatus('Saved, but could not reach the database: ' + (err?.message || err), 'error');
  }
});

let setupResetTimer = null;
couchSetupBtn.addEventListener('click', async () => {
  const cfg = getCouchConfig();
  if (!cfg.url) return;
  const link = location.origin + location.pathname + '?' + SETUP_PARAM + '=' + encodeCouchConfig(cfg);
  await copyOrPrompt(link, couchSetupBtn, 'Copy setup link');
});

// Copy text to the clipboard, flashing the button; fall back to a prompt.
async function copyOrPrompt(text, btn, restoreLabel) {
  const flash = (msg) => {
    if (!btn) return;
    btn.textContent = msg;
    clearTimeout(setupResetTimer);
    setupResetTimer = setTimeout(() => { btn.textContent = restoreLabel; }, 2000);
  };
  try {
    await navigator.clipboard.writeText(text);
    flash('Copied!');
  } catch (_) {
    window.prompt('Copy this link:', text);
  }
}

// ── Toolbar: save the current document and copy a share link ──
let shareBusy = false;
shareBtn.addEventListener('click', async () => {
  if (shareBusy) return;
  const cfg = getCouchConfig();
  if (!cfg.url) {
    setCouchStatus('Add a CouchDB connection below, then share.', 'error');
    settingsDialog.showModal();
    syncCouchUI();
    couchUrl.focus();
    return;
  }
  shareBusy = true;
  const original = shareBtn.textContent;
  shareBtn.textContent = 'Saving…';
  shareBtn.disabled = true;
  try {
    const id = 'pdfdoc-' + crypto.randomUUID();
    await remoteDb(cfg).put({
      _id: id,
      type: 'pdfdoc',
      title: toolbarName.textContent || 'Shared document',
      html: doc.innerHTML,
      createdAt: Date.now(),
    });
    const link = location.origin + location.pathname + '?' + DOC_PARAM + '=' + id;
    shareBtn.textContent = 'Saved';
    await copyOrPrompt(link, null);
    shareBtn.textContent = 'Link copied!';
    setTimeout(() => { shareBtn.textContent = original; }, 2200);
  } catch (err) {
    console.error(err);
    shareBtn.textContent = 'Share failed';
    setTimeout(() => { shareBtn.textContent = original; }, 2200);
  } finally {
    shareBusy = false;
    shareBtn.disabled = false;
  }
});

// ── Open a shared document by id ──
async function openSharedDoc(id) {
  const cfg = getCouchConfig();
  showReader('Shared document');
  toolbarProgress.textContent = 'Loading shared document…';
  if (!cfg.url) {
    showError('This shared link needs a CouchDB connection. Add one in settings (or open a setup link), then reopen this link.');
    settingsDialog.showModal();
    syncCouchUI();
    return;
  }
  try {
    const docRec = await remoteDb(cfg).get(id);
    toolbarName.textContent = docRec.title || 'Shared document';
    doc.innerHTML = docRec.html || '';
    toolbarProgress.textContent = '';
  } catch (err) {
    console.error(err);
    showError('Could not load this shared document. Check that your CouchDB connection is correct and the link is valid.');
  }
}

/* ---------- Geometry / matrix helpers ---------- */

// Combine two transform matrices the same way PDF.js Util.transform does:
// returns m1 ∘ m2 (m2 applied, then m1).
function matMul(m1, m2) {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

function median(nums) {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function esc(s) {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

function runsHTML(runs) {
  return runs.map((r) => {
    if (!r.text) return '';
    let t = esc(r.text);
    if (r.bold) t = '<strong>' + t + '</strong>';
    if (r.italic) t = '<em>' + t + '</em>';
    return t;
  }).join('');
}

const BULLET_RE = /^\s*([•◦▪·‣○●∙*•‣◦]|[-–—]|\d{1,3}[.)])\s+/;

/* ---------- Text extraction & reflow ---------- */

async function extractText(page) {
  const textContent = await page.getTextContent();
  const styles = textContent.styles || {};
  const fontCache = new Map();

  function fontInfo(fontName) {
    if (fontCache.has(fontName)) return fontCache.get(fontName);
    let bold = false, italic = false;
    try {
      let name = '';
      if (page.commonObjs.has && page.commonObjs.has(fontName)) {
        const f = page.commonObjs.get(fontName);
        name = (f && (f.name || f.loadedName)) || '';
        if (f && f.bold) bold = true;
        if (f && f.italic) italic = true;
      }
      if (!name) name = fontName || '';
      if (/bold|black|heavy|semibold|demibold|extrabold/i.test(name)) bold = true;
      if (/italic|oblique/i.test(name)) italic = true;
    } catch (_) { /* best effort */ }
    const info = { bold, italic };
    fontCache.set(fontName, info);
    return info;
  }

  // Normalise text items into positioned glyph runs.
  const items = [];
  for (const it of textContent.items) {
    if (typeof it.str !== 'string') continue;
    const tr = it.transform;
    items.push({
      str: it.str,
      x: tr[4],
      y: tr[5],
      w: it.width || 0,
      size: Math.hypot(tr[2], tr[3]) || it.height || 10,
      font: it.fontName,
    });
  }
  const itemCount = items.length;
  if (!itemCount) return { blocks: [], itemCount: 0, columns: [0] };

  // Group items into visual bands sharing a baseline. (cur MUST carry a
  // size, otherwise the tolerance is NaN and every item lands alone.)
  items.sort((a, b) => (b.y - a.y) || (a.x - b.x));
  const bands = [];
  let cur = null;
  for (const it of items) {
    if (cur && Math.abs(it.y - cur.y) <= Math.max(it.size, cur.size) * 0.4) {
      cur.items.push(it);
    } else {
      cur = { y: it.y, size: it.size, items: [it] };
      bands.push(cur);
    }
  }

  // Split each band into fragments at large horizontal gaps (columns /
  // table cells) and build each fragment into styled runs.
  const frags = [];
  for (const band of bands) {
    const its = band.items.filter((i) => i.str !== '').sort((a, b) => a.x - b.x);
    if (!its.length) continue;
    let group = [its[0]];
    const flush = () => {
      const frag = buildFragment(group, band.y, fontInfo);
      if (frag) frags.push(frag);
    };
    for (let i = 1; i < its.length; i++) {
      const prev = its[i - 1];
      const it = its[i];
      const gap = it.x - (prev.x + prev.w);
      if (gap > Math.max(prev.size, it.size) * 1.4) { flush(); group = [it]; }
      else group.push(it);
    }
    flush();
  }
  if (!frags.length) return { blocks: [], itemCount, columns: [0] };

  // Cluster fragment left edges into columns; only treat the page as
  // multi-column when at least two clusters are substantial.
  const pageW = page.getViewport({ scale: 1 }).width;
  const medSize = median(frags.map((f) => f.size)) || 10;
  const tol = Math.max(pageW * 0.04, medSize * 3);
  const byLeft = [...frags].sort((a, b) => a.left - b.left);
  const clusters = [];
  for (const f of byLeft) {
    const last = clusters[clusters.length - 1];
    if (last && f.left - last.max <= tol) {
      last.max = f.left; last.sum += f.left; last.n++; last.center = last.sum / last.n;
    } else {
      clusters.push({ max: f.left, sum: f.left, n: 1, center: f.left });
    }
  }
  const strong = clusters.filter((c) => c.n >= 3);
  const multiCol = strong.length >= 2;
  let columns;
  if (multiCol) {
    columns = strong.map((c) => c.center).sort((a, b) => a - b);
    for (const f of frags) {
      let bi = 0, bd = Infinity;
      for (let i = 0; i < columns.length; i++) {
        const d = Math.abs(f.left - columns[i]);
        if (d < bd) { bd = d; bi = i; }
      }
      f.col = bi;
    }
  } else {
    columns = [clusters.length ? clusters[0].center : 0];
    for (const f of frags) f.col = 0;
  }

  // Per-column right edge and typical line spacing (leading).
  const colRight = new Map();
  const byCol = new Map();
  for (const f of frags) {
    colRight.set(f.col, Math.max(colRight.get(f.col) || 0, f.right));
    if (!byCol.has(f.col)) byCol.set(f.col, []);
    byCol.get(f.col).push(f);
  }
  const leading = new Map();
  for (const [col, arr] of byCol) {
    arr.sort((a, b) => b.y - a.y);
    const gaps = [];
    for (let i = 1; i < arr.length; i++) {
      const g = arr[i - 1].y - arr[i].y;
      if (g > 1 && g < arr[i].size * 3.5) gaps.push(g);
    }
    leading.set(col, gaps.length ? median(gaps) : medSize * 1.4);
  }

  // Reading order: column by column (left to right), top to bottom.
  frags.sort((a, b) => (a.col - b.col) || (b.y - a.y));

  // Dominant body font size, weighted by character count.
  const sizeWeight = new Map();
  for (const f of frags) {
    const key = Math.round(f.size);
    sizeWeight.set(key, (sizeWeight.get(key) || 0) + f.text.length);
  }
  let bodySize = 10, best = -1;
  for (const [k, v] of sizeWeight) if (v > best) { best = v; bodySize = k; }

  // Group fragments into heading / list / paragraph blocks. Wrapped lines
  // flow together; a new paragraph starts on a column change, a big gap, a
  // short previous line, or a fresh indent. List items absorb their own
  // continuation lines (same column, normal spacing) so a wrapped bullet
  // stays one <li> rather than splintering into stray paragraphs.
  const blocks = [];
  let para = null, list = null, item = null;
  const flushPara = () => { if (para) { blocks.push(para); para = null; } };
  const flushList = () => {
    if (item) { list.items.push(item); item = null; }
    if (list) { blocks.push(list); list = null; }
  };

  for (const ln of frags) {
    const ratio = ln.size / bodySize;
    const trimmed = ln.text.trim();
    const allBold = ln.runs.length > 0 && ln.runs.every((r) => r.bold);
    // A heading is a short standalone line that is larger than body text
    // (even slightly) or same-size but bold. Long lines never qualify.
    const isHeading = trimmed.length >= 2 && trimmed.length < 90 &&
      !BULLET_RE.test(ln.text) && !/[.,;:]$/.test(trimmed) &&
      !/@|https?:\/\/|www\./i.test(trimmed) &&
      (ratio >= 1.15 ||
        (ratio >= 1.045 && trimmed.length < 72) ||
        (allBold && ratio >= 0.98 && trimmed.length < 55));
    const isBullet = BULLET_RE.test(ln.text);

    if (isHeading) {
      flushPara(); flushList();
      // Detected headings are emphasised as at least an <h3> so they read
      // as headings even when the source only bumped the size slightly.
      const level = ratio >= 1.6 ? 1 : ratio >= 1.25 ? 2 : 3;
      blocks.push({ type: 'heading', level, y: ln.y, col: ln.col, runs: ln.runs });
      continue;
    }

    if (isBullet) {
      flushPara();
      if (!list || list.col !== ln.col) {
        flushList();
        list = { type: 'list', y: ln.y, col: ln.col, ordered: /^\s*\d{1,3}[.)]/.test(ln.text), items: [] };
      }
      if (item) list.items.push(item);
      item = { lines: [stripBullet(ln)] };
      continue;
    }

    // Continuation of the current list item?
    if (list && item) {
      const last = item.lines[item.lines.length - 1];
      const lead = leading.get(list.col) || medSize * 1.4;
      const cont = ln.col === list.col &&
        (last.y - ln.y) <= lead * 1.45 &&
        (ln.left - last.left) <= ln.size * 1.2;
      if (cont) { item.lines.push(ln); continue; }
      flushList();
    }

    // Otherwise it is paragraph text.
    const prev = para ? para.lines[para.lines.length - 1] : null;
    const sameCol = prev && prev.col === ln.col;
    const lead = leading.get(ln.col) || medSize * 1.4;
    const gap = sameCol ? prev.y - ln.y : Infinity;
    const bigGap = gap > lead * 1.45;
    const cr = colRight.get(ln.col) || 0;
    const prevShort = prev && prev.right < cr - prev.size * 4;
    const indent = sameCol && (ln.left - prev.left) > ln.size * 1.2;
    const continues = sameCol && !bigGap && !prevShort && !indent;

    if (!continues) {
      flushPara();
      para = { type: 'para', y: ln.y, col: ln.col, lines: [ln] };
    } else {
      para.lines.push(ln);
    }
  }
  flushPara(); flushList();
  return { blocks, itemCount, columns };
}

// Build one line fragment (already gap-split, sorted by x) into styled runs.
function buildFragment(group, y, fontInfo) {
  const its = group;
  const runs = [];
  let prev = null;
  for (const it of its) {
    const fi = fontInfo(it.font);
    let text = it.str;
    if (prev) {
      const gap = it.x - (prev.x + prev.w);
      const last = runs[runs.length - 1];
      const endsSpace = last && /\s$/.test(last.text);
      if (gap > prev.size * 0.2 && !endsSpace && !/^\s/.test(text)) text = ' ' + text;
    }
    const last = runs[runs.length - 1];
    if (last && last.bold === fi.bold && last.italic === fi.italic) last.text += text;
    else runs.push({ text, bold: fi.bold, italic: fi.italic });
    prev = it;
  }
  const plain = runs.map((r) => r.text).join('');
  if (!plain.trim()) return null;
  return {
    y,
    left: its[0].x,
    right: Math.max(...its.map((i) => i.x + i.w)),
    size: median(its.map((i) => i.size)),
    runs,
    text: plain,
  };
}

// Strip the leading bullet / number marker, returning a full line object.
function stripBullet(ln) {
  const runs = ln.runs.map((r) => ({ ...r }));
  const m = ln.text.match(BULLET_RE);
  if (m) {
    let n = m[0].length;
    for (const r of runs) {
      if (n <= 0) break;
      if (r.text.length <= n) { n -= r.text.length; r.text = ''; }
      else { r.text = r.text.slice(n); n = 0; }
    }
  }
  return { y: ln.y, left: ln.left, right: ln.right, size: ln.size, runs, text: ln.text.replace(BULLET_RE, '') };
}

// Flow a run of lines into inline HTML, joining wrapped lines with a space
// and healing soft line-wrap hyphens.
function renderLines(lines) {
  let html = '';
  lines.forEach((ln, idx) => {
    const runs = ln.runs.map((r) => ({ ...r }));
    const isLast = idx === lines.length - 1;
    let joiner = ' ';
    if (!isLast && /[A-Za-zÀ-ɏ]-$/.test(ln.text)) {
      const last = runs[runs.length - 1];
      last.text = last.text.replace(/-$/, '');
      joiner = '';
    }
    html += runsHTML(runs);
    if (!isLast) html += joiner;
  });
  return html;
}

function renderParagraph(p) {
  return '<p>' + renderLines(p.lines) + '</p>';
}

/* ---------- Image extraction ---------- */

// Locate every image draw in the operator list, tracking the CTM so we
// know each image's position and bounding box in PDF user space.
function findImageOps(opList) {
  const OPS = pdfjsLib.OPS;
  const fns = opList.fnArray, args = opList.argsArray;
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack = [];
  const found = [];
  for (let i = 0; i < fns.length; i++) {
    const fn = fns[i];
    if (fn === OPS.save) {
      stack.push(ctm.slice());
    } else if (fn === OPS.restore) {
      ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
    } else if (fn === OPS.transform) {
      ctm = matMul(ctm, args[i]);
    } else if (
      fn === OPS.paintImageXObject || fn === OPS.paintImageXObjectRepeat ||
      fn === OPS.paintInlineImageXObject
    ) {
      found.push(ctm.slice());
    }
  }
  return found;
}

// Rather than decode raw image objects (which can never resolve without a
// full render and would hang), render the page once to an offscreen
// canvas and crop each image's bounding box out of it. This handles every
// image type and bakes in any masking/compositing.
async function extractImages(page, { skipFullPage, columns }) {
  let opList;
  try { opList = await page.getOperatorList(); } catch (_) { return []; }
  const ctms = findImageOps(opList);
  if (!ctms.length) return [];

  // Cap the rendered size so very large page boxes don't blow up memory.
  const v1 = page.getViewport({ scale: 1 });
  const maxDim = 2200;
  const scale = Math.min(2.5, maxDim / Math.max(v1.width, v1.height, 1));
  const vp = page.getViewport({ scale: Math.max(0.1, scale) });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(vp.width));
  canvas.height = Math.max(1, Math.ceil(vp.height));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const task = page.render({ canvasContext: ctx, viewport: vp });
  try {
    await Promise.race([
      task.promise,
      new Promise((_, rej) => setTimeout(() => rej(new Error('render-timeout')), 20000)),
    ]);
  } catch (_) {
    try { task.cancel(); } catch (__) { /* ignore */ }
    canvas.width = canvas.height = 0;
    return [];
  }

  const pageArea = canvas.width * canvas.height;

  // Compute every image's device-space box first, so we can drop
  // backgrounds and de-duplicate before doing any (costly) cropping.
  const candidates = [];
  for (const cm of ctms) {
    const m = matMul(vp.transform, cm);
    const corners = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([ux, uy]) => [
      m[0] * ux + m[2] * uy + m[4],
      m[1] * ux + m[3] * uy + m[5],
    ]);
    const xs = corners.map((c) => c[0]);
    const ys = corners.map((c) => c[1]);
    const x0 = Math.max(0, Math.floor(Math.min(...xs)));
    const y0 = Math.max(0, Math.floor(Math.min(...ys)));
    const x1 = Math.min(canvas.width, Math.ceil(Math.max(...xs)));
    const y1 = Math.min(canvas.height, Math.ceil(Math.max(...ys)));
    const w = x1 - x0, h = y1 - y0;
    if (w < 24 || h < 24) continue;                       // hairlines / tiny marks
    if (skipFullPage && w * h >= pageArea * 0.9) continue; // page background
    candidates.push({ cm, x0, y0, w, h, area: w * h });
  }

  // Largest first; skip any image essentially contained within a bigger
  // kept one (e.g. a photo sitting inside a full-page poster).
  candidates.sort((a, b) => b.area - a.area);
  const kept = [];
  const margin = 6;
  for (const c of candidates) {
    const inside = kept.some((k) =>
      c.x0 >= k.x0 - margin && c.y0 >= k.y0 - margin &&
      c.x0 + c.w <= k.x0 + k.w + margin && c.y0 + c.h <= k.y0 + k.h + margin);
    if (!inside) kept.push(c);
  }

  const out = [];
  for (const c of kept) {
    try {
      const crop = document.createElement('canvas');
      crop.width = c.w; crop.height = c.h;
      crop.getContext('2d').drawImage(canvas, c.x0, c.y0, c.w, c.h, 0, 0, c.w, c.h);
      let src;
      try { src = crop.toDataURL('image/png'); } catch (_) { continue; }

      // Position (PDF user space) for ordering, and column for layout.
      const cm = c.cm;
      const top = Math.max(cm[5], cm[5] + cm[3]);
      const cx = cm[4] + 0.5 * cm[0] + 0.5 * cm[2];
      let col = 0, bd = Infinity;
      for (let i = 0; i < columns.length; i++) {
        const d = Math.abs(cx - columns[i]);
        if (d < bd) { bd = d; col = i; }
      }
      out.push({ type: 'image', y: top, col, src, iw: c.w, ih: c.h });
    } catch (_) { /* skip this image */ }
  }
  canvas.width = canvas.height = 0;
  return out;
}

/* ---------- Rendering ---------- */

// Heal paragraph breaks that PDF line spacing introduced mid-sentence: if
// a paragraph doesn't end on sentence-terminating punctuation and the next
// one clearly continues it, fold them back together.
function mergeBrokenParagraphs(blocks) {
  const out = [];
  for (const b of blocks) {
    const prev = out[out.length - 1];
    if (b.type === 'para' && prev && prev.type === 'para' && prev.col === b.col) {
      const prevText = prev.lines.map((l) => l.text).join(' ').replace(/\s+/g, ' ').trim();
      const nextText = b.lines.map((l) => l.text).join(' ').replace(/\s+/g, ' ').trim();
      const prevSize = prev.lines[prev.lines.length - 1].size;
      const nextSize = b.lines[0].size;
      const sizeOk = Math.max(prevSize, nextSize) / Math.min(prevSize, nextSize) < 1.3;
      // Closed = ends a sentence (. ! ?), allowing a trailing quote/bracket.
      const prevClosed = /[.!?]["'”’)\]]?$/.test(prevText);
      const nextContinues = /^[a-z0-9(]/.test(nextText);
      const prevDangling = /[,–—-]$/.test(prevText);
      if (sizeOk && nextText && ((!prevClosed && nextContinues) || prevDangling)) {
        prev.lines = prev.lines.concat(b.lines);
        continue;
      }
    }
    out.push(b);
  }
  return out;
}

function blocksToHTML(blocks, pageNum, headings) {
  let html = '';
  for (const b of blocks) {
    if (b.type === 'heading') {
      const lvl = Math.min(6, b.level + 1); // leave <h1> for the document title
      const id = 'pdfh-' + headings.length;
      const text = b.runs.map((r) => r.text).join('').trim();
      headings.push({ id, level: b.level, text });
      html += '<h' + lvl + ' id="' + id + '">' + runsHTML(b.runs) + '</h' + lvl + '>';
    } else if (b.type === 'para') {
      html += renderParagraph(b);
    } else if (b.type === 'list') {
      const tag = b.ordered ? 'ol' : 'ul';
      html += '<' + tag + '>' +
        b.items.map((it) => '<li>' + renderLines(it.lines) + '</li>').join('') +
        '</' + tag + '>';
    } else if (b.type === 'image') {
      html += '<figure><img loading="lazy" src="' + b.src + '" alt="Image from page ' + pageNum +
        '" width="' + b.iw + '" height="' + b.ih + '"></figure>';
    }
  }
  return html;
}

// Build a collapsed-by-default table of contents from collected headings.
function buildTableOfContents(headings) {
  if (headings.length < 3) return null;
  const minLevel = Math.min(...headings.map((h) => h.level));
  const details = document.createElement('details');
  details.className = 'toc';
  const summary = document.createElement('summary');
  summary.textContent = 'Contents';
  details.appendChild(summary);
  const nav = document.createElement('nav');
  const ul = document.createElement('ul');
  for (const h of headings) {
    if (!h.text) continue;
    const li = document.createElement('li');
    li.style.paddingLeft = (h.level - minLevel) * 0.9 + 'em';
    const a = document.createElement('a');
    a.href = '#' + h.id;
    a.textContent = h.text;
    li.appendChild(a);
    ul.appendChild(li);
  }
  nav.appendChild(ul);
  details.appendChild(nav);
  return details;
}

let currentToken = 0;

function showReader(name) {
  empty.hidden = true;
  empty.classList.remove('loading');
  readerRoot.hidden = false;
  toolbarName.textContent = name;
  doc.innerHTML = '';
}

function showError(message) {
  readerRoot.hidden = true;
  empty.hidden = false;
  empty.classList.remove('loading');
  emptyError.textContent = message;
  emptyError.hidden = false;
}

async function openPdf({ buffer, name }) {
  const token = ++currentToken;
  emptyError.hidden = true;
  showReader(name || 'document.pdf');

  let task;
  try {
    task = pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      cMapUrl: PDFJS_BASE + 'cmaps/',
      cMapPacked: true,
      standardFontDataUrl: PDFJS_BASE + 'standard_fonts/',
    });
    task.onPassword = (updatePassword, reason) => {
      const pw = window.prompt(
        reason === pdfjsLib.PasswordResponses.INCORRECT_PASSWORD
          ? 'Incorrect password. Try again:'
          : 'This PDF is password protected. Enter the password:'
      );
      if (pw != null) updatePassword(pw);
      else task.destroy();
    };

    const pdf = await task.promise;
    if (token !== currentToken) return;

    // Document title from metadata, if present.
    try {
      const meta = await pdf.getMetadata();
      const title = meta && meta.info && meta.info.Title;
      if (title && title.trim()) {
        const h1 = document.createElement('h1');
        h1.className = 'doc-title';
        h1.textContent = title.trim();
        doc.appendChild(h1);
      }
    } catch (_) { /* ignore */ }

    const total = pdf.numPages;
    const headings = [];
    for (let p = 1; p <= total; p++) {
      if (token !== currentToken) return;
      toolbarProgress.textContent = 'Reading page ' + p + ' of ' + total + '…';

      const page = await pdf.getPage(p);
      const { blocks: textBlocks, itemCount, columns } = await extractText(page);
      const imageBlocks = await extractImages(page, {
        skipFullPage: itemCount > 20,
        columns,
      });
      if (token !== currentToken) return;

      // Order blocks the same way text is read: by column, then top-down.
      const blocks = textBlocks.concat(imageBlocks)
        .sort((a, b) => ((a.col || 0) - (b.col || 0)) || (b.y - a.y));
      const healed = mergeBrokenParagraphs(blocks);
      const section = document.createElement('section');
      section.className = 'pdf-page';
      section.dataset.page = String(p);
      section.innerHTML = blocksToHTML(healed, p, headings);
      doc.appendChild(section);

      page.cleanup();
      // Yield to the browser so the page stays responsive while parsing.
      await new Promise((r) => requestAnimationFrame(r));
    }

    if (token !== currentToken) return;

    // Prepend a collapsed table of contents once the whole doc is parsed.
    const toc = buildTableOfContents(headings);
    if (toc) doc.insertBefore(toc, doc.querySelector('.pdf-page'));

    toolbarProgress.textContent = '';
  } catch (err) {
    if (token !== currentToken) return;
    console.error(err);
    const msg = err && err.name === 'PasswordException'
      ? 'Could not open this password-protected PDF.'
      : 'Sorry, this file could not be read as a PDF.';
    showError(msg);
  }
}

window.__pdfEarly.register(openPdf);

// If opened from a setup link (?couch=…), save the connection and strip
// the param via replace() so the token stays out of history. A ?doc= param
// is preserved across the reload so a combined link still opens the doc.
function consumeSetupLink() {
  const params = new URLSearchParams(location.search);
  const enc = params.get(SETUP_PARAM);
  if (!enc) return false;
  try {
    const cfg = decodeCouchConfig(enc);
    if (cfg.url) setCouchConfig(cfg);
  } catch (err) {
    console.error('Ignoring invalid setup link', err);
  }
  params.delete(SETUP_PARAM);
  const qs = params.toString();
  location.replace(location.origin + location.pathname + (qs ? '?' + qs : '') + location.hash);
  return true;
}

if (!consumeSetupLink()) {
  const sharedId = new URLSearchParams(location.search).get(DOC_PARAM);
  if (sharedId) openSharedDoc(sharedId);
}
