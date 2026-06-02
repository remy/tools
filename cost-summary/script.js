const API_KEY_STORAGE = 'gemini_api_key';
const MONTH_FILTER_STORAGE = 'cost_summary_month_filter';

const CATEGORY_COLORS = [
  '#378ADD','#639922','#BA7517','#D4537E','#7F77DD',
  '#1D9E75','#D85A30','#888780','#5DCAA5','#E24B4A',
  '#C97D3A','#4A90D9','#7BAF3E','#A06BB5','#E8874A'
];

const state = {
  transactions: [],
  categorised: [],
  categories: [],
  chartInstance: null,
};

const $ = id => document.getElementById(id);

const settingsBtn = $('settings-btn');
const settingsPanel = $('settings-panel');
const saveSettingsBtn = $('save-settings-btn');
const apiKeyInput = $('api-key-input');
const monthFilterInput = $('month-filter');
const uploadZone = $('upload-zone');
const fileInput = $('file-input');
const chooseFileBtn = $('choose-file-btn');
const progressSection = $('progress-section');
const reportSection = $('report-section');
const newReportBtn = $('new-report-btn');
const rerunBtn = $('rerun-btn');
const reclassifyModal = $('reclassify-modal');

settingsBtn.addEventListener('click', () => {
  const open = !settingsPanel.hidden;
  settingsPanel.hidden = open;
  if (!open) {
    apiKeyInput.value = localStorage.getItem(API_KEY_STORAGE) || '';
    monthFilterInput.value = localStorage.getItem(MONTH_FILTER_STORAGE) || '';
  }
});

saveSettingsBtn.addEventListener('click', () => {
  const key = apiKeyInput.value.trim();
  const filter = monthFilterInput.value.trim();
  if (key) localStorage.setItem(API_KEY_STORAGE, key);
  else localStorage.removeItem(API_KEY_STORAGE);
  if (filter) localStorage.setItem(MONTH_FILTER_STORAGE, filter);
  else localStorage.removeItem(MONTH_FILTER_STORAGE);
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
  state.categorised = [];
  state.categories = [];
  if (state.chartInstance) { state.chartInstance.destroy(); state.chartInstance = null; }
});

rerunBtn.addEventListener('click', () => {
  if (state.transactions.length) categoriseAll(state.transactions);
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
    const status = cols[5] || '';
    const gross = parseFloat((cols[7] || '0').replace(/,/g, ''));
    const impact = cols[cols.length - 1] || '';
    const subject = cols[36] || '';
    const itemTitle = cols[15] || '';

    if (impact === 'Debit' && status === 'Completed' && !isNaN(gross)) {
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

function filterByMonth(txs) {
  const filter = (localStorage.getItem(MONTH_FILTER_STORAGE) || '').trim();
  if (!filter) return txs;
  const [mm, yyyy] = filter.split('/');
  if (!mm || !yyyy) return txs;
  return txs.filter(tx => {
    const [, m, y] = tx.date.split('/');
    return m === mm && y === yyyy;
  });
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
    const all = parseCSV(e.target.result);
    const txs = filterByMonth(all);
    if (!txs.length) {
      $('upload-notice').textContent = 'No completed debit transactions found (check your month filter).';
      return;
    }
    state.transactions = txs;
    categoriseAll(txs);
  };
  reader.readAsText(file);
}

// --- Gemini categorisation ---
async function categoriseAll(txs) {
  uploadZone.hidden = true;
  settingsPanel.hidden = true;
  reportSection.hidden = true;
  progressSection.hidden = false;

  const BATCH = 20;
  const results = new Array(txs.length);
  let done = 0;
  setProgress(0, txs.length);

  for (let start = 0; start < txs.length; start += BATCH) {
    const items = txs.slice(start, start + BATCH);
    const cats = await categoriseBatch(items);
    cats.forEach((c, j) => results[start + j] = c);
    done += items.length;
    setProgress(done, txs.length);
  }

  state.categorised = txs.map((tx, i) => ({ ...tx, category: results[i] || 'Other' }));
  buildReport(state.categorised);
}

function setProgress(done, total) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  $('progress-bar').style.width = pct + '%';
  $('progress-count').textContent = `${done} / ${total} transactions`;
  $('progress-label').textContent = done === total ? 'Building report…' : 'Categorising with Gemini…';
}

async function categoriseBatch(items) {
  const key = localStorage.getItem(API_KEY_STORAGE);
  const prompt = `You are categorising personal finance transactions. For each transaction, return a single category name.

Categories to use (pick the best fit, you may invent a new one if none fit):
Travel, Groceries, Eating out, Shopping, Entertainment, Home & garden, Kids, Subscriptions, Coffee & cafes, Health & fitness, Charity & donations, Other

Transactions (JSON array):
${JSON.stringify(items.map(tx => ({ name: tx.name, amount: tx.gross, subject: tx.subject, itemTitle: tx.itemTitle })))}

Return ONLY a JSON array of strings, one category per transaction, in the same order. No explanation, no markdown, no backticks. Example: ["Groceries","Travel","Subscriptions"]`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1 },
        }),
      }
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `HTTP ${res.status}`);
    }
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    if (Array.isArray(parsed)) return parsed;
  } catch (err) {
    console.error('Gemini error:', err);
    showError(err.message);
  }
  return items.map(() => 'Other');
}

function showError(msg) {
  progressSection.hidden = true;
  uploadZone.hidden = false;
  $('upload-notice').innerHTML = `<span style="color:var(--danger)">Error: ${msg}</span>`;
}

// --- Report ---
function buildReport(categorised) {
  progressSection.hidden = true;
  reportSection.hidden = false;
  newReportBtn.hidden = false;

  const total = categorised.reduce((s, t) => s + t.gross, 0);
  const filter = localStorage.getItem(MONTH_FILTER_STORAGE) || '';

  $('report-title').textContent = filter ? formatMonthTitle(filter) : 'All transactions';
  $('report-subtitle').textContent =
    `${categorised.length} transactions · downloaded ${new Date().toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' })}`;

  const groups = {};
  for (const tx of categorised) {
    if (!groups[tx.category]) groups[tx.category] = [];
    groups[tx.category].push(tx);
  }

  const sorted = Object.entries(groups)
    .map(([cat, txs]) => ({ cat, txs, total: txs.reduce((s, t) => s + t.gross, 0) }))
    .sort((a, b) => b.total - a.total);

  state.categories = sorted.map(g => g.cat);

  const biggest = categorised.reduce((a, b) => a.gross > b.gross ? a : b);
  $('metrics').innerHTML = `
    <div class="metric"><div class="metric-label">Total spent</div><div class="metric-value">£${total.toFixed(2)}</div></div>
    <div class="metric"><div class="metric-label">Transactions</div><div class="metric-value">${categorised.length}</div></div>
    <div class="metric"><div class="metric-label">Categories</div><div class="metric-value">${sorted.length}</div></div>
    <div class="metric"><div class="metric-label">Largest spend</div><div class="metric-value">£${biggest.gross.toFixed(2)}</div></div>
  `;

  const labels = sorted.map(g => g.cat);
  const values = sorted.map(g => parseFloat(g.total.toFixed(2)));
  const colors = sorted.map((_, i) => CATEGORY_COLORS[i % CATEGORY_COLORS.length]);

  $('chart-container').style.height = Math.max(240, sorted.length * 42 + 60) + 'px';

  $('chart-legend').innerHTML = sorted.map((g, i) =>
    `<span><span class="swatch" style="background:${colors[i]}"></span>${g.cat} £${g.total.toFixed(0)}</span>`
  ).join('');

  if (state.chartInstance) state.chartInstance.destroy();
  state.chartInstance = new Chart($('spend-chart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: colors, borderRadius: 4 }],
    },
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
          ticks: { callback: v => '£' + v, color: '#888', font: { size: 11 } },
          grid: { color: 'rgba(128,128,128,0.12)' },
        },
        y: {
          ticks: { color: getComputedStyle(document.body).getPropertyValue('--text') || '#1a1a18', font: { size: 12 } },
          grid: { display: false },
        },
      },
    },
  });

  const list = $('categories-list');
  list.innerHTML = '';
  sorted.forEach((g, i) => {
    const color = colors[i];
    const card = document.createElement('div');
    card.className = 'category-card';
    card.dataset.cat = g.cat;

    const txsSorted = [...g.txs].sort((a, b) => b.gross - a.gross);

    card.innerHTML = `
      <div class="category-header">
        <div class="cat-left">
          <div class="cat-dot" style="background:${color}"></div>
          <div class="cat-name">${escapeHtml(g.cat)}</div>
        </div>
        <div class="cat-right">
          <span class="cat-total">£${g.total.toFixed(2)}</span>
          <span class="cat-count">${g.txs.length} item${g.txs.length !== 1 ? 's' : ''}</span>
          <span class="cat-chevron">▾</span>
        </div>
      </div>
      <div class="category-body" hidden>
        ${txsSorted.map(tx => {
          const title = escapeHtml(`${tx.name}${tx.itemTitle ? ' — ' + tx.itemTitle : ''}`);
          const label = escapeHtml(tx.name + (tx.itemTitle ? ' — ' + tx.itemTitle.substring(0, 40) : ''));
          return `
          <div class="transaction-row">
            <div class="tx-name" title="${title}">${label}</div>
            <div class="tx-right">
              <span class="tx-date">${formatDate(tx.date)}</span>
              <span class="tx-amount">£${tx.gross.toFixed(2)}</span>
              <button class="tx-reclassify" data-idx="${state.categorised.indexOf(tx)}">move</button>
            </div>
          </div>`;
        }).join('')}
      </div>`;

    card.querySelector('.category-header').addEventListener('click', () => {
      const body = card.querySelector('.category-body');
      const chevron = card.querySelector('.cat-chevron');
      body.hidden = !body.hidden;
      chevron.classList.toggle('open', !body.hidden);
    });

    card.querySelectorAll('.tx-reclassify').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        openReclassify(parseInt(btn.dataset.idx));
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

function formatDate(d) {
  const [dd, mm] = d.split('/');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${parseInt(dd)} ${months[parseInt(mm)-1]}`;
}

function formatMonthTitle(filter) {
  const [mm, yyyy] = filter.split('/');
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return `${months[parseInt(mm)-1]} ${yyyy}`;
}

// --- Reclassify ---
function openReclassify(idx) {
  const tx = state.categorised[idx];
  $('modal-tx-desc').textContent = `${tx.name} — £${tx.gross.toFixed(2)}`;

  const catsDiv = $('modal-cats');
  catsDiv.innerHTML = state.categories.map(cat => `
    <button class="modal-cat-btn ${cat === tx.category ? 'current' : ''}" data-cat="${escapeHtml(cat)}">
      ${cat === tx.category ? '✓ ' : ''}${escapeHtml(cat)}
    </button>
  `).join('') + `
    <button class="modal-cat-btn" data-cat="__new__" style="border-style:dashed">+ New category…</button>
  `;

  catsDiv.querySelectorAll('.modal-cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      let cat = btn.dataset.cat;
      if (cat === '__new__') {
        cat = prompt('New category name:');
        if (!cat || !cat.trim()) return;
        cat = cat.trim();
      }
      applyReclassify(idx, cat);
      reclassifyModal.close();
    });
  });

  reclassifyModal.showModal();
}

function applyReclassify(idx, newCat) {
  state.categorised[idx].category = newCat;
  if (!state.categories.includes(newCat)) state.categories.push(newCat);
  buildReport(state.categorised);
}

$('modal-cancel').addEventListener('click', () => reclassifyModal.close());
reclassifyModal.addEventListener('click', e => {
  if (e.target === reclassifyModal) reclassifyModal.close();
});
