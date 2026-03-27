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
  return day === 0 ? 6 : day - 1; // Convert to Mon=0
}

function effectiveDay(recurringDay, year, month) {
  const daysInMonth = getDaysInMonth(year, month);
  return Math.min(recurringDay, daysInMonth);
}

function subsForMonth(subs, year, month) {
  const byDay = {};
  for (const sub of subs) {
    const day = effectiveDay(sub.recurringDay, year, month);
    if (!byDay[day]) byDay[day] = [];
    byDay[day].push(sub);
  }
  return byDay;
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
  const byDay = subsForMonth(subscriptions, currentYear, currentMonth);
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === currentYear && today.getMonth() === currentMonth;
  const todayDate = today.getDate();

  // Previous month days
  const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
  const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
  const prevDays = getDaysInMonth(prevYear, prevMonth);

  let html = '';
  const totalCells = 42; // 6 rows × 7 cols

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

    const classes = ['day-cell'];
    if (isOutside) classes.push('outside');
    if (isTodayCell) classes.push('today');

    html += `<div class="${classes.join(' ')}" data-day="${isOutside ? '' : dayNum}">`;
    html += `<span class="day-number">${dayNum}</span>`;

    if (!isOutside && byDay[dayNum]) {
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
  for (const sub of subscriptions) {
    const monthly = monthlyEquivalent(sub.amount, sub.cycle);
    total += convertAmount(monthly, sub.currency, settings.displayCurrency, settings.exchangeRate);
  }
  document.getElementById('total-amount').textContent =
    formatCurrency(total, settings.displayCurrency) + '/mo';
}

// ── Breakdown ──
function openBreakdown() {
  const list = document.getElementById('breakdown-list');
  const items = subscriptions.map(sub => {
    const monthly = monthlyEquivalent(sub.amount, sub.cycle);
    const converted = convertAmount(monthly, sub.currency, settings.displayCurrency, settings.exchangeRate);
    return { ...sub, monthlyConverted: converted };
  }).sort((a, b) => b.monthlyConverted - a.monthlyConverted);

  let total = 0;
  let html = '';
  for (const item of items) {
    total += item.monthlyConverted;
    const favSrc = item.favicon || '';
    const cycleLabel = item.cycle === 'yearly'
      ? `${formatCurrency(item.amount, item.currency)}/yr`
      : `${formatCurrency(item.amount, item.currency)}/mo`;
    html += `<li class="breakdown-item">`;
    if (favSrc) {
      html += `<img src="${escapeHtml(favSrc)}" alt="" width="24" height="24" loading="lazy">`;
    } else {
      html += `<div style="width:24px;height:24px;background:var(--bg-secondary);border-radius:4px"></div>`;
    }
    html += `<div class="breakdown-name">
      <div class="name">${escapeHtml(item.name)}</div>
      <div class="cycle">${cycleLabel}</div>
    </div>`;
    html += `<span class="breakdown-amount">${formatCurrency(item.monthlyConverted, settings.displayCurrency)}</span>`;
    html += `<div class="breakdown-actions">
      <button class="btn-icon" data-edit-id="${item.id}" aria-label="Edit">&#9998;</button>
      <button class="btn-icon" data-delete-id="${item.id}" aria-label="Delete">&times;</button>
    </div>`;
    html += `</li>`;
  }

  list.innerHTML = html;
  document.getElementById('breakdown-total').textContent =
    formatCurrency(total, settings.displayCurrency) + '/mo';

  document.getElementById('breakdown-popover').showPopover();
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

  if (editSub) {
    title.textContent = 'Edit Subscription';
    document.getElementById('sub-name').value = editSub.name;
    document.getElementById('sub-url').value = editSub.url || '';
    document.getElementById('sub-amount').value = editSub.amount;
    document.getElementById('sub-currency').value = editSub.currency;
    document.getElementById('sub-cycle').value = editSub.cycle;
    document.getElementById('sub-day').value = editSub.recurringDay;
    document.getElementById('sub-edit-id').value = editSub.id;
    deleteBtn.hidden = false;
    if (editSub.favicon) {
      faviconPreview.src = editSub.favicon;
      faviconPreview.hidden = false;
    }
  } else {
    title.textContent = 'Add Subscription';
    document.getElementById('sub-day').value = day || 1;
    document.getElementById('sub-edit-id').value = '';
    deleteBtn.hidden = true;
  }

  popover.showPopover();
  document.getElementById('sub-name').focus();
}

async function handleSubFormSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('sub-edit-id').value || crypto.randomUUID();
  const url = document.getElementById('sub-url').value.trim();
  const sub = {
    id,
    name: document.getElementById('sub-name').value.trim(),
    url,
    favicon: faviconUrl(url),
    amount: parseFloat(document.getElementById('sub-amount').value),
    currency: document.getElementById('sub-currency').value,
    cycle: document.getElementById('sub-cycle').value,
    recurringDay: parseInt(document.getElementById('sub-day').value, 10),
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
  document.getElementById('quick-add-popover').showPopover();
  document.getElementById('qa-name').focus();
}

function buildQuickAddSub() {
  const url = document.getElementById('qa-url').value.trim();
  return {
    id: crypto.randomUUID(),
    name: document.getElementById('qa-name').value.trim(),
    url,
    favicon: faviconUrl(url),
    amount: parseFloat(document.getElementById('qa-amount').value),
    currency: document.getElementById('qa-currency').value,
    cycle: document.getElementById('qa-cycle').value,
    recurringDay: parseInt(document.getElementById('qa-day').value, 10),
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
  document.getElementById('qa-name').focus();
}

// ── Settings ──
function openSettings() {
  document.querySelector(`input[name="display-currency"][value="${settings.displayCurrency}"]`).checked = true;
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
    openSettings(); // refresh settings UI
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
    // Click on a subscription item
    const subItem = e.target.closest('.day-sub-item');
    if (subItem) {
      const subId = subItem.dataset.subId;
      const sub = subscriptions.find(s => s.id === subId);
      if (sub) openSubPopover(null, sub);
      return;
    }
    // Click on day cell
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
      if (sub) openSubPopover(null, sub);
      return;
    }
    const deleteBtn = e.target.closest('[data-delete-id]');
    if (deleteBtn) {
      await db.delete(deleteBtn.dataset.deleteId);
      subscriptions = await db.getAll();
      render();
      openBreakdown(); // refresh breakdown
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
