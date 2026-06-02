const API_KEY_STORAGE = 'gemini_api_key';
const MODEL_STORAGE = 'gemini_model';
const DEFAULT_MODEL = 'gemini-2.5-flash-lite';
const DATE_FROM_STORAGE = 'cost_summary_date_from';
const DATE_TO_STORAGE = 'cost_summary_date_to';

const DEFAULT_CATEGORIES = [
  'Travel', 'Groceries', 'Eating out', 'Shopping', 'Entertainment',
  'Subscriptions', 'Home / garden', 'Kids', 'Coffee', 'Health & fitness',
  'Charity', 'Other',
];

const CATEGORY_COLORS = [
  '#378ADD','#639922','#7F77DD','#BA7517','#D4537E',
  '#888780','#1D9E75','#E24B4A','#5DCAA5','#C97D3A',
  '#4A90D9','#7BAF3E','#A06BB5','#E8874A','#D85A30',
];

const state = {
  transactions: [],       // all parsed (after status filter) — unfiltered by date
  nameToCategory: {},
  categories: [],
  chartInstance: null,
  openCategories: new Set(),
};

const $ = id => document.getElementById(id);

const settingsBtn = $('settings-btn');
const settingsPanel = $('settings-panel');
const saveSettingsBtn = $('save-settings-btn');
const apiKeyInput = $('api-key-input');
const modelInput = $('model-input');
const uploadZone = $('upload-zone');
const fileInput = $('file-input');
const chooseFileBtn = $('choose-file-btn');
const progressSection = $('progress-section');
const reportSection = $('report-section');
const newReportBtn = $('new-report-btn');
const rerunBtn = $('rerun-btn');
const reclassifyModal = $('reclassify-modal');
const datePopover = $('date-popover');
const dateTrigger = $('date-trigger');
const dateFromInput = $('date-from');
const dateToInput = $('date-to');

settingsBtn.addEventListener('click', () => {
  const open = !settingsPanel.hidden;
  settingsPanel.hidden = open;
  if (!open) {
    apiKeyInput.value = localStorage.getItem(API_KEY_STORAGE) || '';
    modelInput.value = localStorage.getItem(MODEL_STORAGE) || '';
  }
});

saveSettingsBtn.addEventListener('click', () => {
  const key = apiKeyInput.value.trim();
  const model = modelInput.value.trim();
  if (key) localStorage.setItem(API_KEY_STORAGE, key);
  else localStorage.removeItem(API_KEY_STORAGE);
  if (model) localStorage.setItem(MODEL_STORAGE, model);
  else localStorage.removeItem(MODEL_STORAGE);
  const notice = $('settings-notice');
  notice.innerHTML = '<div class="notice saved">Saved.</div>';
  setTimeout(() => { notice.innerHTML = ''; }, 2000);
});

chooseFileBtn.addEventListener('click', e => {
  e.stopPropagation();
  fileInput.click();
});

uploadZone.addEventListener('click', e => {
  if (e.target.tagName !== 'BUTTON') fileInput.click();
});

uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', e => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  const f = e.dataTransfer.files[0];
  if (f) processFile(f);
});

fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) processFile(fileInput.files[0]);
});

newReportBtn.addEventListener('click', () => {
  reportSection.hidden = true;
  uploadZone.hidden = false;
  newReportBtn.hidden = true;
  fileInput.value = '';
  state.transactions = [];
  state.nameToCategory = {};
  state.categories = [];
  if (state.chartInstance) { state.chartInstance.destroy(); state.chartInstance = null; }
});

rerunBtn.addEventListener('click', () => {
  if (state.transactions.length) categoriseMerchants(visibleTransactions());
});

// --- CSV parsing ---
function parseCSV(text) {
  const lines = text.trim().split('\n').slice(1);
  const results = [];
  for (const line of lines) {
    const cols = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { inQ = !inQ; }
      else if (c === ',' && !inQ) { cols.push(cur.trim()); cur = ''; }
      else cur += c;
    }
    cols.push(cur.trim());

    const date = cols[0];
    const name = cols[3] || '';
    const type = cols[4] || '';
    const status = (cols[5] || '').trim();
    const gross = parseFloat((cols[7] || '0').replace(/,/g, ''));
    const impact = cols[cols.length - 1] || '';
    const subject = cols[36] || '';
    const itemTitle = cols[15] || '';

    // PayPal status values include Completed, Pending, Refunded, Reversed, etc.
    // Only count completed debits.
    if (impact === 'Debit' && status.toLowerCase() === 'completed' && !isNaN(gross)) {
      results.push({
        date,
        name: name.trim(),
        type,
        gross: Math.abs(gross),
        subject: subject.trim(),
        itemTitle: itemTitle.trim(),
      });
    }
  }
  return results;
}

// PayPal dates are DD/MM/YYYY — convert to YYYY-MM-DD for comparison.
function txDateIso(tx) {
  const [d, m, y] = tx.date.split('/');
  if (!d || !m || !y) return '';
  return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
}

function visibleTransactions() {
  const { from, to } = getDateRange();
  if (!from && !to) return state.transactions;
  return state.transactions.filter(tx => {
    const iso = txDateIso(tx);
    if (from && iso < from) return false;
    if (to && iso > to) return false;
    return true;
  });
}

// Default to the most recent fully-completed month when the user hasn't
// touched the filter. A stored empty string means "explicitly cleared —
// show all dates", which we leave alone.
function lastFullMonthRange() {
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const y = lastMonth.getFullYear();
  const m = lastMonth.getMonth();
  const first = new Date(y, m, 1);
  const last = new Date(y, m + 1, 0);
  const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  return { from: fmt(first), to: fmt(last) };
}

function getDateRange() {
  const from = localStorage.getItem(DATE_FROM_STORAGE);
  const to = localStorage.getItem(DATE_TO_STORAGE);
  if (from === null && to === null) return lastFullMonthRange();
  return { from: from || '', to: to || '' };
}

function processFile(file) {
  const key = localStorage.getItem(API_KEY_STORAGE);
  if (!key) {
    $('upload-notice').textContent = '⚠ Add your Gemini API key in settings first.';
    settingsPanel.hidden = false;
    apiKeyInput.focus();
    return;
  }
  const reader = new FileReader();
  reader.onload = e => {
    state.transactions = parseCSV(e.target.result);
    const txs = visibleTransactions();
    if (!txs.length) {
      $('upload-notice').textContent = 'No completed debit transactions found.';
      return;
    }
    categoriseMerchants(txs);
  };
  reader.readAsText(file);
}

// --- Merchant aggregation ---
// Drop examples that are mostly numeric (PayPal often puts merchant phone
// references like "8882211161" in itemTitle, which are useless to the LLM).
function isUsefulExample(s) {
  if (!s) return false;
  const trimmed = s.trim();
  if (trimmed.length < 3) return false;
  const letters = (trimmed.match(/[a-zA-Z]/g) || []).length;
  return letters >= 3;
}

function buildMerchantList(txs) {
  const map = new Map();
  for (const tx of txs) {
    if (!map.has(tx.name)) {
      map.set(tx.name, { name: tx.name, examples: new Set() });
    }
    const m = map.get(tx.name);
    for (const candidate of [tx.itemTitle, tx.subject]) {
      if (m.examples.size >= 3) break;
      if (isUsefulExample(candidate)) m.examples.add(candidate.slice(0, 80));
    }
  }
  return [...map.values()].map(m => ({ name: m.name, examples: [...m.examples] }));
}

// Each merchant entry is tiny — name + a couple of short examples in,
// "name":"Category" out — and Gemini 2.5's context is 1M+. The practical
// ceiling is output stability rather than input size, so we bias toward
// "everything in one shot" for the bigger models.
function batchSizeForModel(model) {
  const m = model.toLowerCase();
  if (m.includes('pro')) return Infinity;
  if (m.includes('flash-lite')) return 500;
  if (m.includes('flash')) return 2000;
  return 500;
}

// --- Gemini categorisation ---
async function categoriseMerchants(txs) {
  uploadZone.hidden = true;
  settingsPanel.hidden = true;
  reportSection.hidden = true;
  progressSection.hidden = false;

  const merchants = buildMerchantList(txs);
  setProgress(0, merchants.length);

  const batchSize = batchSizeForModel(localStorage.getItem(MODEL_STORAGE) || DEFAULT_MODEL);
  const mapping = {};

  for (let start = 0; start < merchants.length; start += batchSize) {
    const items = merchants.slice(start, start + batchSize);
    const batchMap = await categoriseMerchantBatch(items);
    Object.assign(mapping, batchMap);
    setProgress(Math.min(start + items.length, merchants.length), merchants.length);
  }

  for (const m of merchants) {
    if (!mapping[m.name]) mapping[m.name] = 'Other';
  }

  state.nameToCategory = mapping;
  buildReport();
}

function setProgress(done, total) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  $('progress-bar').style.width = pct + '%';
  $('progress-count').textContent = `${done} / ${total} merchants`;
  $('progress-label').textContent = done === total ? 'Building report…' : 'Categorising merchants with Gemini…';
}

async function categoriseMerchantBatch(merchants) {
  const key = localStorage.getItem(API_KEY_STORAGE);
  const prompt = `You are categorising merchants from a personal finance transaction list. Each merchant has a name and may have a few example transaction descriptions to help you decide.

Categories to use (pick the best fit; you may invent a new category only if none of these obviously apply):
${DEFAULT_CATEGORIES.join(', ')}

Merchants (JSON array):
${JSON.stringify(merchants)}

Return ONLY a JSON object mapping merchant name to category — no explanation, no markdown, no backticks.
Example: {"Tesco":"Groceries","Deliveroo":"Eating out","Netflix":"Subscriptions"}`;

  const model = localStorage.getItem(MODEL_STORAGE) || DEFAULT_MODEL;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json',
            maxOutputTokens: 32768,
          },
        }),
      }
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `HTTP ${res.status}`);
    }
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch (err) {
    console.error('Gemini error:', err);
    showError(err.message);
  }
  return Object.fromEntries(merchants.map(m => [m.name, 'Other']));
}

function showError(msg) {
  progressSection.hidden = true;
  uploadZone.hidden = false;
  $('upload-notice').innerHTML = `<span style="color:var(--danger)">Error: ${msg}</span>`;
}

// --- Report ---
function buildReport() {
  progressSection.hidden = true;
  reportSection.hidden = false;
  newReportBtn.hidden = false;

  const txs = visibleTransactions();
  const total = txs.reduce((s, t) => s + t.gross, 0);

  $('report-title').textContent = reportTitle();
  $('subtitle-stats').textContent = `${txs.length} transactions · ${new Set(txs.map(t => t.name)).size} merchants ·`;
  $('date-label').textContent = dateLabel();

  // Group: category -> merchantName -> { count, total }
  const catGroups = new Map();
  for (const tx of txs) {
    const cat = state.nameToCategory[tx.name] || 'Other';
    if (!catGroups.has(cat)) catGroups.set(cat, new Map());
    const merchants = catGroups.get(cat);
    if (!merchants.has(tx.name)) merchants.set(tx.name, { name: tx.name, count: 0, total: 0 });
    const m = merchants.get(tx.name);
    m.count++;
    m.total += tx.gross;
  }

  const sorted = [...catGroups.entries()]
    .map(([cat, merchants]) => {
      const list = [...merchants.values()].sort((a, b) => b.total - a.total);
      const catTotal = list.reduce((s, m) => s + m.total, 0);
      const txCount = list.reduce((s, m) => s + m.count, 0);
      return { cat, merchants: list, total: catTotal, txCount };
    })
    .sort((a, b) => b.total - a.total);

  state.categories = sorted.map(g => g.cat);
  // Drop any open categories that no longer have transactions.
  for (const c of [...state.openCategories]) {
    if (!state.categories.includes(c)) state.openCategories.delete(c);
  }

  const biggest = txs.length ? txs.reduce((a, b) => a.gross > b.gross ? a : b) : null;
  $('metrics').innerHTML = `
    <div class="metric"><div class="metric-label">Total spent</div><div class="metric-value">£${total.toFixed(2)}</div></div>
    <div class="metric"><div class="metric-label">Transactions</div><div class="metric-value">${txs.length}</div></div>
    <div class="metric"><div class="metric-label">Categories</div><div class="metric-value">${sorted.length}</div></div>
    <div class="metric">
      <div class="metric-label">Largest spend</div>
      <div class="metric-value">${biggest ? '£' + biggest.gross.toFixed(2) : '—'}</div>
      ${biggest ? `<div class="metric-sub">${escapeHtml(biggest.name)}</div>` : ''}
    </div>
  `;

  const labels = sorted.map(g => g.cat);
  const values = sorted.map(g => parseFloat(g.total.toFixed(2)));
  const colors = sorted.map((_, i) => CATEGORY_COLORS[i % CATEGORY_COLORS.length]);
  const colorByCat = Object.fromEntries(sorted.map((g, i) => [g.cat, colors[i]]));

  $('chart-container').style.height = Math.max(240, sorted.length * 38 + 60) + 'px';

  $('chart-legend').innerHTML = sorted.map((g, i) =>
    `<span><span class="swatch" style="background:${colors[i]}"></span>${escapeHtml(g.cat)} £${g.total.toFixed(0)}</span>`
  ).join('');

  if (state.chartInstance) state.chartInstance.destroy();
  const tickColor = getComputedStyle(document.body).getPropertyValue('--text-muted').trim() || '#888';
  state.chartInstance = new Chart($('spend-chart'), {
    type: 'bar',
    data: { labels, datasets: [{ data: values, backgroundColor: colors, borderRadius: 4 }] },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` £${ctx.parsed.x.toFixed(2)}` } },
      },
      scales: {
        x: {
          ticks: { callback: v => '£' + v, color: tickColor, font: { size: 11 } },
          grid: { color: 'rgba(128,128,128,0.12)' },
        },
        y: {
          ticks: { color: tickColor, font: { size: 12 } },
          grid: { display: false },
        },
      },
    },
  });

  const list = $('categories-list');
  list.innerHTML = '';
  sorted.forEach(g => {
    const color = colorByCat[g.cat];
    const card = document.createElement('details');
    card.className = 'category-card';
    card.dataset.cat = g.cat;
    if (state.openCategories.has(g.cat)) card.open = true;

    card.innerHTML = `
      <summary class="category-header">
        <div class="cat-left">
          <div class="cat-swatch" style="background:${color}"></div>
          <div class="cat-name">${escapeHtml(g.cat)}</div>
        </div>
        <div class="cat-right">
          <span class="cat-total">£${g.total.toFixed(2)}</span>
          <span class="cat-count">${g.txCount} item${g.txCount !== 1 ? 's' : ''}</span>
          <span class="cat-chevron" aria-hidden="true">⌄</span>
        </div>
      </summary>
      <div class="category-body">
        ${g.merchants.map(m => {
          const label = m.count > 1
            ? `${escapeHtml(m.name)} <span class="tx-count">(x${m.count})</span>`
            : escapeHtml(m.name);
          return `
          <button class="merchant-row" data-name="${escapeHtml(m.name)}" title="Move ${escapeHtml(m.name)} to a different category">
            <span class="tx-name">${label}</span>
            <span class="tx-amount">£${m.total.toFixed(2)}</span>
          </button>`;
        }).join('')}
      </div>`;

    card.addEventListener('toggle', () => {
      if (card.open) state.openCategories.add(g.cat);
      else state.openCategories.delete(g.cat);
    });

    card.querySelectorAll('.merchant-row').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        openReclassify(btn.dataset.name);
      });
    });

    list.appendChild(card);
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatIsoDateShort(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function reportTitle() {
  const { from, to } = getDateRange();
  if (from && to && from.slice(0,7) === to.slice(0,7)) {
    // Same month — show "May 2026"
    const d = new Date(from + 'T00:00:00');
    return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  }
  if (from || to) {
    return `${formatIsoDateShort(from) || 'start'} – ${formatIsoDateShort(to) || 'today'}`;
  }
  return 'All transactions';
}

function dateLabel() {
  const { from, to } = getDateRange();
  if (!from && !to) return 'All dates';
  if (from && to) return `${formatIsoDateShort(from)} – ${formatIsoDateShort(to)}`;
  if (from) return `from ${formatIsoDateShort(from)}`;
  return `until ${formatIsoDateShort(to)}`;
}

// --- Date popover ---
datePopover.addEventListener('beforetoggle', e => {
  if (e.newState === 'open') {
    const { from, to } = getDateRange();
    dateFromInput.value = from;
    dateToInput.value = to;
  }
});

$('date-apply').addEventListener('click', () => {
  const from = dateFromInput.value;
  const to = dateToInput.value;
  localStorage.setItem(DATE_FROM_STORAGE, from);
  localStorage.setItem(DATE_TO_STORAGE, to);
  datePopover.hidePopover();
  if (state.transactions.length) buildReport();
});

$('date-clear').addEventListener('click', () => {
  // Persist empty strings (not removeItem) so the default doesn't re-apply
  // on the next render — empty means "show all dates" by explicit choice.
  localStorage.setItem(DATE_FROM_STORAGE, '');
  localStorage.setItem(DATE_TO_STORAGE, '');
  dateFromInput.value = '';
  dateToInput.value = '';
  datePopover.hidePopover();
  if (state.transactions.length) buildReport();
});

// --- Reclassify (moves ALL transactions for the merchant) ---
function openReclassify(name) {
  const currentCat = state.nameToCategory[name] || 'Other';
  const txs = state.transactions.filter(t => t.name === name);
  const total = txs.reduce((s, t) => s + t.gross, 0);

  $('modal-title').textContent = `Move ${name}`;
  $('modal-tx-desc').textContent =
    `${txs.length} transaction${txs.length !== 1 ? 's' : ''} · £${total.toFixed(2)} · currently in ${currentCat}`;

  const allCats = [...new Set([...state.categories, ...DEFAULT_CATEGORIES])];

  const catsDiv = $('modal-cats');
  catsDiv.innerHTML = allCats.map(cat => `
    <button class="modal-cat-btn ${cat === currentCat ? 'current' : ''}" data-cat="${escapeHtml(cat)}">
      ${cat === currentCat ? '✓ ' : ''}${escapeHtml(cat)}
    </button>
  `).join('') + `
    <button class="modal-cat-btn modal-cat-new" data-cat="__new__">+ New category…</button>
  `;

  catsDiv.querySelectorAll('.modal-cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      let cat = btn.dataset.cat;
      if (cat === '__new__') {
        cat = prompt('New category name:');
        if (!cat || !cat.trim()) return;
        cat = cat.trim();
      }
      state.nameToCategory[name] = cat;
      buildReport();
      reclassifyModal.close();
    });
  });

  reclassifyModal.showModal();
}

$('modal-cancel').addEventListener('click', () => reclassifyModal.close());
reclassifyModal.addEventListener('click', e => {
  if (e.target === reclassifyModal) reclassifyModal.close();
});
