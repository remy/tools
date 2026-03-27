// ── Constants ──
const DB_NAME = 'subscription-tracker';
const DB_VERSION = 1;
const DEFAULT_RATE = 0.79;
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

// ── State ──
let currentYear, currentMonth;
let subscriptions = [];
let settings = { displayCurrency: 'GBP', exchangeRate: DEFAULT_RATE };
let categoryFilter = 'all'; // 'all' | 'personal' | 'business'
let viewMode = 'month'; // 'month' | 'year'
let yearViewYear;

// ── IndexedDB ──
class SubscriptionDB {
  constructor() {
    this.dbPromise = null;
  }

  openDb() {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('subscriptions')) {
          const store = db.createObjectStore('subscriptions', { keyPath: 'id' });
          store.createIndex('by-day', 'recurringDay', { unique: false });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.dbPromise;
  }

  async getAll() {
    const db = await this.openDb();
    return new Promise((resolve) => {
      const tx = db.transaction('subscriptions', 'readonly');
      const req = tx.objectStore('subscriptions').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  }

  async put(sub) {
    const db = await this.openDb();
    return new Promise((resolve) => {
      const tx = db.transaction('subscriptions', 'readwrite');
      tx.objectStore('subscriptions').put(sub);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  async delete(id) {
    const db = await this.openDb();
    return new Promise((resolve) => {
      const tx = db.transaction('subscriptions', 'readwrite');
      tx.objectStore('subscriptions').delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  async clearAll() {
    const db = await this.openDb();
    return new Promise((resolve) => {
      const tx = db.transaction('subscriptions', 'readwrite');
      tx.objectStore('subscriptions').clear();
      tx.oncomplete = () => resolve();
    });
  }

  async getSetting(key) {
    const db = await this.openDb();
    return new Promise((resolve) => {
      const tx = db.transaction('settings', 'readonly');
      const req = tx.objectStore('settings').get(key);
      req.onsuccess = () => resolve(req.result?.value ?? null);
      req.onerror = () => resolve(null);
    });
  }

  async setSetting(key, value) {
    const db = await this.openDb();
    return new Promise((resolve) => {
      const tx = db.transaction('settings', 'readwrite');
      tx.objectStore('settings').put({ key, value });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  async getAllSettings() {
    const db = await this.openDb();
    return new Promise((resolve) => {
      const tx = db.transaction('settings', 'readonly');
      const req = tx.objectStore('settings').getAll();
      req.onsuccess = () => {
        const map = {};
        for (const r of req.result || []) map[r.key] = r.value;
        resolve(map);
      };
      req.onerror = () => resolve({});
    });
  }

  async exportData() {
    const subs = await this.getAll();
    const s = await this.getAllSettings();
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: s,
      subscriptions: subs
    };
  }

  async importData(data) {
    if (!data || data.version !== 1 || !Array.isArray(data.subscriptions)) {
      throw new Error('Invalid import file');
    }
    await this.clearAll();
    for (const sub of data.subscriptions) {
      await this.put(sub);
    }
    if (data.settings) {
      for (const [k, v] of Object.entries(data.settings)) {
        await this.setSetting(k, v);
      }
    }
  }
}

const db = new SubscriptionDB();

// ── Helpers ──
function extractDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function faviconUrl(url) {
  const domain = extractDomain(url);
  if (!domain) return '';
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
}

function convertAmount(amount, from, to, rate) {
  if (from === to) return amount;
  if (from === 'USD' && to === 'GBP') return amount * rate;
  if (from === 'GBP' && to === 'USD') return amount / rate;
  return amount;
}

function monthlyEquivalent(amount, cycle) {
  return cycle === 'yearly' ? amount / 12 : amount;
}

function formatCurrency(amount, currency) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year, month) {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1;
}

function effectiveDay(recurringDay, year, month) {
  const daysInMonth = getDaysInMonth(year, month);
  return Math.min(recurringDay, daysInMonth);
}

function subsForMonth(subs, year, month) {
  const byDay = {};
  for (const sub of subs) {
    // Yearly subs only appear in their renewal month
    if (sub.cycle === 'yearly' && sub.recurringMonth !== undefined && sub.recurringMonth !== month) {
      continue;
    }
    const day = effectiveDay(sub.recurringDay, year, month);
    if (!byDay[day]) byDay[day] = [];
    byDay[day].push(sub);
  }
  return byDay;
}

function filteredSubs() {
  if (categoryFilter === 'all') return subscriptions;
  return subscriptions.filter(s => (s.category || 'personal') === categoryFilter);
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// ── Rendering ──
function render() {
  renderHeader();
  renderGrid();
  renderTotal();
}

function renderHeader() {
  document.getElementById('month-title').textContent =
    `${MONTH_NAMES[currentMonth]} ${currentYear}`;
}

function renderGrid() {
  const grid = document.getElementById('calendar-grid');
  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDay = getFirstDayOfWeek(currentYear, currentMonth);
  const byDay = subsForMonth(filteredSubs(), currentYear, currentMonth);
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === currentYear && today.getMonth() === currentMonth;
  const todayDate = today.getDate();

  const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
  const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
  const prevDays = getDaysInMonth(prevYear, prevMonth);

  let html = '';
  const totalCells = 42;

  for (let i = 0; i < totalCells; i++) {
    const dayIndex = i - firstDay + 1;
    let dayNum, isOutside = false, isTodayCell = false;

    if (dayIndex < 1) {
      dayNum = prevDays + dayIndex;
      isOutside = true;
    } else if (dayIndex > daysInMonth) {
      dayNum = dayIndex - daysInMonth;
      isOutside = true;
    } else {
      dayNum = dayIndex;
      isTodayCell = isCurrentMonth && dayNum === todayDate;
    }

    const hasSubs = !isOutside && byDay[dayNum];
    const classes = ['day-cell'];
    if (isOutside) classes.push('outside');
    if (isTodayCell) classes.push('today');
    if (hasSubs) classes.push('has-subs');

    html += `<div class="${classes.join(' ')}" data-day="${isOutside ? '' : dayNum}">`;
    html += `<span class="day-number">${dayNum}</span>`;

    if (hasSubs) {
      const daySubs = byDay[dayNum];
      const maxVisible = 3;
      html += '<div class="day-subs">';
      for (let s = 0; s < Math.min(daySubs.length, maxVisible); s++) {
        const sub = daySubs[s];
        const favSrc = sub.favicon || '';
        html += `<div class="day-sub-item" data-sub-id="${sub.id}">`;
        if (favSrc) {
          html += `<img src="${escapeHtml(favSrc)}" alt="" width="12" height="12" loading="lazy">`;
        }
        html += `<span>${escapeHtml(sub.name)}</span></div>`;
      }
      if (daySubs.length > maxVisible) {
        html += `<span class="day-overflow">+${daySubs.length - maxVisible}</span>`;
      }
      html += '</div>';
    }

    html += '</div>';
  }

  grid.innerHTML = html;
}

function renderTotal() {
  let total = 0;
  for (const sub of filteredSubs()) {
    const monthly = monthlyEquivalent(sub.amount, sub.cycle);
    total += convertAmount(monthly, sub.currency, settings.displayCurrency, settings.exchangeRate);
  }
  document.getElementById('total-amount').textContent =
    formatCurrency(total, settings.displayCurrency);
}

// ── Year View ──
function computeMonthTotal(subs, year, month, displayCurrency, rate) {
  let total = 0;
  for (const sub of subs) {
    if (sub.cycle === 'yearly' && sub.recurringMonth !== undefined && sub.recurringMonth !== month) {
      continue;
    }
    const monthly = monthlyEquivalent(sub.amount, sub.cycle);
    total += convertAmount(monthly, sub.currency, displayCurrency, rate);
  }
  return total;
}

function renderYearView() {
  const subs = filteredSubs();
  const SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const now = new Date();
  const isThisYear = yearViewYear === now.getFullYear();

  document.getElementById('year-title').textContent = yearViewYear;

  // Compute each month's total
  const totals = [];
  let yearTotal = 0;
  for (let m = 0; m < 12; m++) {
    const t = computeMonthTotal(subs, yearViewYear, m, settings.displayCurrency, settings.exchangeRate);
    totals.push(t);
    yearTotal += t;
  }

  document.getElementById('year-total').textContent =
    `Annual total: ${formatCurrency(yearTotal, settings.displayCurrency)}`;

  const maxTotal = Math.max(...totals, 1);

  // Smooth heatmap: interpolate green → amber → red based on ratio
  function heatColor(ratio) {
    if (ratio < 0.01) return 'var(--bg-input)';
    // Green (120,200,100) → Amber (240,160,50) → Red (230,75,60)
    let r, g, b;
    if (ratio <= 0.5) {
      const t = ratio / 0.5;
      r = Math.round(120 + (240 - 120) * t);
      g = Math.round(200 + (160 - 200) * t);
      b = Math.round(100 + (50 - 100) * t);
    } else {
      const t = (ratio - 0.5) / 0.5;
      r = Math.round(240 + (230 - 240) * t);
      g = Math.round(160 + (75 - 160) * t);
      b = Math.round(50 + (60 - 50) * t);
    }
    return `rgb(${r},${g},${b})`;
  }

  let html = '';
  for (let m = 0; m < 12; m++) {
    const ratio = totals[m] / maxTotal;
    const pct = Math.round(ratio * 100);
    const color = heatColor(ratio);
    const isCurrent = isThisYear && m === now.getMonth();

    // Count subs active this month
    let count = 0;
    for (const sub of subs) {
      if (sub.cycle === 'yearly' && sub.recurringMonth !== undefined && sub.recurringMonth !== m) continue;
      count++;
    }

    html += `<div class="year-month${isCurrent ? ' current-month' : ''}" data-month="${m}">`;
    html += `<div class="year-month-heat" style="background:${color}"></div>`;
    html += `<span class="year-month-name">${SHORT[m]}</span>`;
    html += `<div class="year-month-bar"><div class="year-month-bar-fill" style="width:${pct}%;background:${color}"></div></div>`;
    html += `<span class="year-month-amount">${formatCurrency(totals[m], settings.displayCurrency)}</span>`;
    html += `<span class="year-month-count">${count}</span>`;
    html += `</div>`;
  }

  document.getElementById('year-grid').innerHTML = html;
}

function toggleYearView() {
  const btn = document.getElementById('btn-year-view');
  const calendarEl = document.querySelector('.calendar');
  const yearViewEl = document.getElementById('year-view');
  const totalBar = document.getElementById('monthly-total');
  const monthNav = document.querySelector('.month-nav');
  const filterBar = document.querySelector('.filter-bar');

  if (viewMode === 'month') {
    viewMode = 'year';
    yearViewYear = currentYear;
    btn.classList.add('active');
    calendarEl.hidden = true;
    totalBar.hidden = true;
    monthNav.hidden = true;
    filterBar.hidden = true;
    yearViewEl.hidden = false;
    renderYearView();
  } else {
    viewMode = 'month';
    btn.classList.remove('active');
    calendarEl.hidden = false;
    totalBar.hidden = false;
    monthNav.hidden = false;
    filterBar.hidden = false;
    yearViewEl.hidden = true;
    render();
  }
}

// ── Breakdown ──
function openBreakdown() {
  const list = document.getElementById('breakdown-list');
  const emptyEl = document.getElementById('breakdown-empty');

  const visible = filteredSubs();
  if (visible.length === 0) {
    list.innerHTML = '';
    emptyEl.hidden = false;
    document.getElementById('breakdown-total').innerHTML = formatCurrency(0, settings.displayCurrency) + '<span>/mo</span>';
    document.getElementById('breakdown-popover').showPopover();
    return;
  }

  emptyEl.hidden = true;
  const items = visible.map(sub => {
    const monthly = monthlyEquivalent(sub.amount, sub.cycle);
    const converted = convertAmount(monthly, sub.currency, settings.displayCurrency, settings.exchangeRate);
    return { ...sub, monthlyConverted: converted };
  }).sort((a, b) => b.monthlyConverted - a.monthlyConverted);

  let total = 0;
  let html = '';
  for (const item of items) {
    total += item.monthlyConverted;
    const favSrc = item.favicon || '';
    const SHORT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    let originalLabel;
    if (item.cycle === 'yearly') {
      const monthLabel = item.recurringMonth !== undefined ? SHORT_MONTHS[item.recurringMonth] + ' ' : '';
      originalLabel = `${formatCurrency(item.amount, item.currency)}/yr · ${monthLabel}${item.recurringDay}`;
    } else {
      originalLabel = `${formatCurrency(item.amount, item.currency)}/mo · day ${item.recurringDay}`;
    }
    const cycleClass = item.cycle === 'yearly' ? 'cycle-yearly' : 'cycle-monthly';

    html += `<li class="breakdown-item">`;
    html += `<div class="breakdown-favicon">`;
    if (favSrc) {
      html += `<img src="${escapeHtml(favSrc)}" alt="" width="20" height="20" loading="lazy">`;
    }
    html += `</div>`;
    const cat = item.category || 'personal';
    const catClass = cat === 'business' ? 'cat-business' : 'cat-personal';
    html += `<div class="breakdown-info">
      <div class="breakdown-name">${escapeHtml(item.name)}</div>
      <span class="breakdown-cycle ${cycleClass}">${item.cycle}</span><span class="cat-badge ${catClass}">${cat}</span>
    </div>`;
    html += `<div class="breakdown-price">
      <div class="breakdown-converted">${formatCurrency(item.monthlyConverted, settings.displayCurrency)}</div>
      <div class="breakdown-original">${originalLabel}</div>
    </div>`;
    html += `<div class="breakdown-actions">
      <button data-edit-id="${item.id}" aria-label="Edit">&#9998;</button>
      <button data-delete-id="${item.id}" aria-label="Delete">&times;</button>
    </div>`;
    html += `</li>`;
  }

  list.innerHTML = html;
  document.getElementById('breakdown-total').innerHTML =
    formatCurrency(total, settings.displayCurrency) + '<span>/mo</span>';

  document.getElementById('breakdown-popover').showPopover();
}

// ── Toggle group sync ──
function syncToggleToSelect(radioName, selectId) {
  const checked = document.querySelector(`input[name="${radioName}"]:checked`);
  if (checked) {
    document.getElementById(selectId).value = checked.value;
  }
}

function updateRenewalVisibility(radioName, monthSelectId) {
  const checked = document.querySelector(`input[name="${radioName}"]:checked`);
  const monthSelect = document.getElementById(monthSelectId);
  if (checked && checked.value === 'yearly') {
    monthSelect.hidden = false;
    monthSelect.required = true;
  } else {
    monthSelect.hidden = true;
    monthSelect.required = false;
  }
}

// ── Sub Popover (Add/Edit) ──
function openSubPopover(day, editSub) {
  const popover = document.getElementById('sub-popover');
  const form = document.getElementById('sub-form');
  const title = document.getElementById('sub-popover-title');
  const deleteBtn = document.getElementById('sub-delete');
  const faviconPreview = document.getElementById('favicon-preview');

  form.reset();
  faviconPreview.hidden = true;
  faviconPreview.src = '';
  document.getElementById('sub-cycle-monthly').checked = true;

  if (editSub) {
    title.textContent = 'Edit Subscription';
    document.getElementById('sub-name').value = editSub.name;
    document.getElementById('sub-url').value = editSub.url || '';
    document.getElementById('sub-amount').value = editSub.amount;
    document.getElementById('sub-currency').value = editSub.currency;
    document.getElementById('sub-cycle').value = editSub.cycle;
    const radio = document.querySelector(`input[name="sub-cycle-radio"][value="${editSub.cycle}"]`);
    if (radio) radio.checked = true;
    document.getElementById('sub-day').value = editSub.recurringDay;
    if (editSub.recurringMonth !== undefined) {
      document.getElementById('sub-month').value = editSub.recurringMonth;
    }
    const catRadio = document.querySelector(`input[name="sub-category-radio"][value="${editSub.category || 'personal'}"]`);
    if (catRadio) catRadio.checked = true;
    document.getElementById('sub-edit-id').value = editSub.id;
    deleteBtn.hidden = false;
    if (editSub.favicon) {
      faviconPreview.src = editSub.favicon;
      faviconPreview.hidden = false;
    }
  } else {
    title.textContent = 'Add Subscription';
    document.getElementById('sub-day').value = day || 1;
    document.getElementById('sub-month').value = currentMonth;
    document.getElementById('sub-edit-id').value = '';
    deleteBtn.hidden = true;
  }
  updateRenewalVisibility('sub-cycle-radio', 'sub-month');

  popover.showPopover();
  setTimeout(() => document.getElementById('sub-name').focus(), 50);
}

async function handleSubFormSubmit(e) {
  e.preventDefault();
  syncToggleToSelect('sub-cycle-radio', 'sub-cycle');
  const id = document.getElementById('sub-edit-id').value || crypto.randomUUID();
  const url = document.getElementById('sub-url').value.trim();
  const cycle = document.getElementById('sub-cycle').value;
  const sub = {
    id,
    name: document.getElementById('sub-name').value.trim(),
    url,
    favicon: faviconUrl(url),
    amount: parseFloat(document.getElementById('sub-amount').value),
    currency: document.getElementById('sub-currency').value,
    cycle,
    recurringDay: parseInt(document.getElementById('sub-day').value, 10),
    recurringMonth: cycle === 'yearly' ? parseInt(document.getElementById('sub-month').value, 10) : undefined,
    category: document.querySelector('input[name="sub-category-radio"]:checked').value,
    createdAt: Date.now()
  };

  await db.put(sub);
  subscriptions = await db.getAll();
  render();
  document.getElementById('sub-popover').hidePopover();
}

async function handleSubDelete() {
  const id = document.getElementById('sub-edit-id').value;
  if (!id) return;
  await db.delete(id);
  subscriptions = await db.getAll();
  render();
  document.getElementById('sub-popover').hidePopover();
}

// ── Quick Add ──
function openQuickAdd() {
  const form = document.getElementById('quick-add-form');
  form.reset();
  document.getElementById('qa-favicon-preview').hidden = true;
  document.getElementById('qa-favicon-preview').src = '';
  document.getElementById('qa-cycle-monthly').checked = true;
  document.getElementById('qa-month').value = currentMonth;
  updateRenewalVisibility('qa-cycle-radio', 'qa-month');
  document.getElementById('quick-add-popover').showPopover();
  setTimeout(() => document.getElementById('qa-name').focus(), 50);
}

function buildQuickAddSub() {
  syncToggleToSelect('qa-cycle-radio', 'qa-cycle');
  const url = document.getElementById('qa-url').value.trim();
  const cycle = document.getElementById('qa-cycle').value;
  return {
    id: crypto.randomUUID(),
    name: document.getElementById('qa-name').value.trim(),
    url,
    favicon: faviconUrl(url),
    amount: parseFloat(document.getElementById('qa-amount').value),
    currency: document.getElementById('qa-currency').value,
    cycle,
    recurringDay: parseInt(document.getElementById('qa-day').value, 10),
    recurringMonth: cycle === 'yearly' ? parseInt(document.getElementById('qa-month').value, 10) : undefined,
    category: document.querySelector('input[name="qa-category-radio"]:checked').value,
    createdAt: Date.now()
  };
}

async function handleQuickAddSubmit(e) {
  e.preventDefault();
  const sub = buildQuickAddSub();
  await db.put(sub);
  subscriptions = await db.getAll();
  render();
  document.getElementById('quick-add-popover').hidePopover();
}

async function handleSaveAndAddMore() {
  const form = document.getElementById('quick-add-form');
  if (!form.reportValidity()) return;
  const sub = buildQuickAddSub();
  await db.put(sub);
  subscriptions = await db.getAll();
  render();
  form.reset();
  document.getElementById('qa-favicon-preview').hidden = true;
  document.getElementById('qa-favicon-preview').src = '';
  document.getElementById('qa-cycle-monthly').checked = true;
  document.getElementById('qa-cat-personal').checked = true;
  updateRenewalVisibility('qa-cycle-radio', 'qa-month');
  document.getElementById('qa-name').focus();
}

// ── Settings ──
function openSettings() {
  const ccy = settings.displayCurrency;
  const radio = document.querySelector(`input[name="display-currency"][value="${ccy}"]`);
  if (radio) radio.checked = true;
  document.getElementById('exchange-rate').value = settings.exchangeRate;
  document.getElementById('settings-popover').showPopover();
}

async function handleSettingsSave() {
  const ccy = document.querySelector('input[name="display-currency"]:checked').value;
  const rate = parseFloat(document.getElementById('exchange-rate').value) || DEFAULT_RATE;
  settings.displayCurrency = ccy;
  settings.exchangeRate = rate;
  await db.setSetting('displayCurrency', ccy);
  await db.setSetting('exchangeRate', rate);
  render();
  document.getElementById('settings-popover').hidePopover();
}

// ── Export/Import ──
async function handleExport() {
  const data = await db.exportData();
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `subscriptions-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function handleImport(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    await db.importData(data);
    const saved = await db.getAllSettings();
    settings.displayCurrency = saved.displayCurrency || 'GBP';
    settings.exchangeRate = saved.exchangeRate || DEFAULT_RATE;
    subscriptions = await db.getAll();
    render();
    document.getElementById('settings-popover').hidePopover();
  } catch (err) {
    alert('Import failed: ' + err.message);
  }
}

// ── Favicon preview debounce ──
let faviconTimer = null;
function setupFaviconPreview(inputId, previewId) {
  const input = document.getElementById(inputId);
  const preview = document.getElementById(previewId);
  input.addEventListener('input', () => {
    clearTimeout(faviconTimer);
    faviconTimer = setTimeout(() => {
      const fav = faviconUrl(input.value);
      if (fav) {
        preview.src = fav;
        preview.hidden = false;
      } else {
        preview.hidden = true;
        preview.src = '';
      }
    }, 300);
  });
}

// ── Event binding ──
function bindEvents() {
  // Month navigation
  document.getElementById('prev-month').addEventListener('click', () => {
    currentMonth--;
    if (currentMonth < 0) { currentMonth = 11; currentYear--; }
    render();
  });
  document.getElementById('next-month').addEventListener('click', () => {
    currentMonth++;
    if (currentMonth > 11) { currentMonth = 0; currentYear++; }
    render();
  });

  // Year view toggle
  document.getElementById('btn-year-view').addEventListener('click', toggleYearView);
  document.getElementById('year-prev').addEventListener('click', () => {
    yearViewYear--;
    renderYearView();
  });
  document.getElementById('year-next').addEventListener('click', () => {
    yearViewYear++;
    renderYearView();
  });
  // Click month row to jump to that month view
  document.getElementById('year-grid').addEventListener('click', (e) => {
    const row = e.target.closest('.year-month');
    if (row) {
      currentMonth = parseInt(row.dataset.month, 10);
      currentYear = yearViewYear;
      toggleYearView(); // switch back to month view
    }
  });

  // Category filter — keep both filter groups in sync
  function syncFilters(source) {
    categoryFilter = source.value;
    // Sync the other filter group
    const mainRadio = document.querySelector(`input[name="category-filter"][value="${categoryFilter}"]`);
    const yearRadio = document.querySelector(`input[name="year-category-filter"][value="${categoryFilter}"]`);
    if (mainRadio) mainRadio.checked = true;
    if (yearRadio) yearRadio.checked = true;
    if (viewMode === 'year') renderYearView();
    else render();
  }
  for (const radio of document.querySelectorAll('input[name="category-filter"]')) {
    radio.addEventListener('change', (e) => syncFilters(e.target));
  }
  for (const radio of document.querySelectorAll('input[name="year-category-filter"]')) {
    radio.addEventListener('change', (e) => syncFilters(e.target));
  }

  // Monthly total → breakdown
  document.getElementById('monthly-total').addEventListener('click', openBreakdown);

  // Quick add
  document.getElementById('btn-quick-add').addEventListener('click', openQuickAdd);

  // Settings
  document.getElementById('btn-settings').addEventListener('click', openSettings);

  // Popover close buttons
  document.getElementById('sub-popover-close').addEventListener('click', () =>
    document.getElementById('sub-popover').hidePopover());
  document.getElementById('quick-add-close').addEventListener('click', () =>
    document.getElementById('quick-add-popover').hidePopover());
  document.getElementById('breakdown-close').addEventListener('click', () =>
    document.getElementById('breakdown-popover').hidePopover());
  document.getElementById('settings-close').addEventListener('click', () =>
    document.getElementById('settings-popover').hidePopover());

  // Sub form
  document.getElementById('sub-form').addEventListener('submit', handleSubFormSubmit);
  document.getElementById('sub-delete').addEventListener('click', handleSubDelete);

  // Toggle group sync for sub form — also show/hide month select
  for (const radio of document.querySelectorAll('input[name="sub-cycle-radio"]')) {
    radio.addEventListener('change', () => {
      syncToggleToSelect('sub-cycle-radio', 'sub-cycle');
      updateRenewalVisibility('sub-cycle-radio', 'sub-month');
    });
  }
  for (const radio of document.querySelectorAll('input[name="qa-cycle-radio"]')) {
    radio.addEventListener('change', () => {
      syncToggleToSelect('qa-cycle-radio', 'qa-cycle');
      updateRenewalVisibility('qa-cycle-radio', 'qa-month');
    });
  }

  // Quick add form
  document.getElementById('quick-add-form').addEventListener('submit', handleQuickAddSubmit);
  document.getElementById('qa-save-more').addEventListener('click', handleSaveAndAddMore);

  // Settings
  document.getElementById('settings-save').addEventListener('click', handleSettingsSave);
  document.getElementById('btn-export').addEventListener('click', handleExport);
  document.getElementById('btn-import').addEventListener('change', (e) => {
    if (e.target.files[0]) handleImport(e.target.files[0]);
    e.target.value = '';
  });

  // Calendar grid — delegate clicks
  document.getElementById('calendar-grid').addEventListener('click', (e) => {
    const subItem = e.target.closest('.day-sub-item');
    if (subItem) {
      const subId = subItem.dataset.subId;
      const sub = subscriptions.find(s => s.id === subId);
      if (sub) openSubPopover(null, sub);
      return;
    }
    const cell = e.target.closest('.day-cell');
    if (cell && cell.dataset.day) {
      openSubPopover(parseInt(cell.dataset.day, 10));
    }
  });

  // Breakdown — delegate edit/delete
  document.getElementById('breakdown-list').addEventListener('click', async (e) => {
    const editBtn = e.target.closest('[data-edit-id]');
    if (editBtn) {
      document.getElementById('breakdown-popover').hidePopover();
      const sub = subscriptions.find(s => s.id === editBtn.dataset.editId);
      if (sub) setTimeout(() => openSubPopover(null, sub), 200);
      return;
    }
    const deleteBtn = e.target.closest('[data-delete-id]');
    if (deleteBtn) {
      await db.delete(deleteBtn.dataset.deleteId);
      subscriptions = await db.getAll();
      render();
      openBreakdown();
    }
  });

  // Favicon previews
  setupFaviconPreview('sub-url', 'favicon-preview');
  setupFaviconPreview('qa-url', 'qa-favicon-preview');

  // Escape key closes popovers
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      for (const id of ['sub-popover', 'quick-add-popover', 'breakdown-popover', 'settings-popover']) {
        const el = document.getElementById(id);
        if (el.matches(':popover-open')) {
          el.hidePopover();
          break;
        }
      }
    }
  });
}

// ── Init ──
async function init() {
  const saved = await db.getAllSettings();
  if (saved.displayCurrency) settings.displayCurrency = saved.displayCurrency;
  if (saved.exchangeRate) settings.exchangeRate = saved.exchangeRate;
  subscriptions = await db.getAll();

  const now = new Date();
  currentYear = now.getFullYear();
  currentMonth = now.getMonth();

  render();
  bindEvents();
}

init();
