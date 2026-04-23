import { state } from './state.js';
import { db } from './db.js';
import { faviconUrl } from './utils.js';
import { render } from './render-calendar.js';
import { renderYearView, toggleYearView } from './render-year.js';
import { openSubPopover, handleSubFormSubmit, handleSubDelete, syncToggleToSelect, updateRenewalVisibility } from './popover-sub.js';
import { openQuickAdd, handleQuickAddSubmit, handleSaveAndAddMore } from './popover-quickadd.js';
import { openBreakdown } from './popover-breakdown.js';
import { openDaySheet, getDaySheetDay } from './popover-day.js';
import { openSettings, handleSettingsSave, handleSyncSave, handleSyncNow, handleSyncPull } from './popover-settings.js';
import { handleExport, handleImport, handleImportLegacy, handleImportLegacyFile } from './io.js';

// ── Favicon preview debounce ──
let faviconTimer = null;
export function setupFaviconPreview(inputId, previewId) {
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

// ── Navigation (shared between month and year views) ──
export function navPrev() {
  if (state.viewMode === 'year') {
    state.yearViewYear--;
    document.getElementById('month-title').textContent = state.yearViewYear;
    renderYearView();
  } else {
    state.currentMonth--;
    if (state.currentMonth < 0) { state.currentMonth = 11; state.currentYear--; }
    render();
  }
}

export function navNext() {
  if (state.viewMode === 'year') {
    state.yearViewYear++;
    document.getElementById('month-title').textContent = state.yearViewYear;
    renderYearView();
  } else {
    state.currentMonth++;
    if (state.currentMonth > 11) { state.currentMonth = 0; state.currentYear++; }
    render();
  }
}

// ── Reset view to current month/year ──
function jumpToToday() {
  const now = new Date();
  if (state.viewMode === 'year') {
    state.yearViewYear = now.getFullYear();
    document.getElementById('month-title').textContent = state.yearViewYear;
    renderYearView();
  } else {
    state.currentYear = now.getFullYear();
    state.currentMonth = now.getMonth();
    render();
  }
}

// ── Event binding ──
export function bindEvents() {
  document.getElementById('prev-month').addEventListener('click', navPrev);
  document.getElementById('next-month').addEventListener('click', navNext);

  const monthTitle = document.getElementById('month-title');
  monthTitle.addEventListener('click', jumpToToday);
  monthTitle.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      jumpToToday();
    }
  });

  document.getElementById('btn-year-view').addEventListener('click', toggleYearView);
  document.getElementById('year-grid').addEventListener('click', (e) => {
    const row = e.target.closest('.year-month');
    if (row) {
      state.currentMonth = parseInt(row.dataset.month, 10);
      state.currentYear = state.yearViewYear;
      toggleYearView();
    }
  });

  // Swipe on calendar for month navigation
  let touchStartX = 0;
  let touchStartY = 0;
  const calendarEl = document.querySelector('.calendar');
  calendarEl.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });
  calendarEl.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) navNext();
      else navPrev();
    }
  }, { passive: true });

  // Category filter — keep both filter groups in sync
  function syncFilters(source) {
    state.categoryFilter = source.value;
    const mainRadio = document.querySelector(`input[name="category-filter"][value="${state.categoryFilter}"]`);
    const yearRadio = document.querySelector(`input[name="year-category-filter"][value="${state.categoryFilter}"]`);
    if (mainRadio) mainRadio.checked = true;
    if (yearRadio) yearRadio.checked = true;
    if (state.viewMode === 'year') renderYearView();
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

  // End-date helper buttons
  document.getElementById('sub-end-today').addEventListener('click', () => {
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    document.getElementById('sub-end-date').value = iso;
  });
  document.getElementById('sub-end-clear').addEventListener('click', () => {
    document.getElementById('sub-end-date').value = '';
  });

  // Toggle group sync for sub form
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
  document.getElementById('sync-save').addEventListener('click', handleSyncSave);
  document.getElementById('sync-now').addEventListener('click', handleSyncNow);
  document.getElementById('sync-pull').addEventListener('click', handleSyncPull);
  document.getElementById('btn-export').addEventListener('click', handleExport);
  document.getElementById('btn-import').addEventListener('change', (e) => {
    if (e.target.files[0]) handleImport(e.target.files[0]);
    e.target.value = '';
  });
  document.getElementById('btn-import-legacy').addEventListener('click', handleImportLegacy);
  document.getElementById('btn-import-legacy-file').addEventListener('change', (e) => {
    if (e.target.files[0]) handleImportLegacyFile(e.target.files[0]);
    e.target.value = '';
  });

  // Calendar grid — delegate clicks
  const narrowMedia = window.matchMedia('(max-width: 639px)');
  document.getElementById('calendar-grid').addEventListener('click', (e) => {
    const cell = e.target.closest('.day-cell');
    if (!cell || !cell.dataset.day) return;
    const day = parseInt(cell.dataset.day, 10);

    // Narrow screens: open day sheet for days with subs, add popover otherwise.
    if (narrowMedia.matches) {
      if (cell.classList.contains('has-subs')) openDaySheet(day);
      else openSubPopover(day);
      return;
    }

    // Wide screens: existing behaviour — item clicks edit, cell clicks add.
    const subItem = e.target.closest('.day-sub-item');
    if (subItem) {
      const subId = subItem.dataset.subId;
      const sub = state.subscriptions.find(s => s.id === subId);
      if (sub) openSubPopover(null, sub);
      return;
    }
    openSubPopover(day);
  });

  // Day sheet — close, open edit for tapped sub, add-to-this-day
  document.getElementById('day-sheet-close').addEventListener('click', () =>
    document.getElementById('day-sheet-popover').hidePopover());

  document.getElementById('day-sheet-list').addEventListener('click', (e) => {
    const item = e.target.closest('.day-sheet-item');
    if (!item) return;
    const sub = state.subscriptions.find(s => s.id === item.dataset.subId);
    if (!sub) return;
    document.getElementById('day-sheet-popover').hidePopover();
    setTimeout(() => openSubPopover(null, sub), 200);
  });

  document.getElementById('day-sheet-list').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const item = e.target.closest('.day-sheet-item');
    if (!item) return;
    e.preventDefault();
    item.click();
  });

  document.getElementById('day-sheet-add').addEventListener('click', () => {
    const day = getDaySheetDay();
    document.getElementById('day-sheet-popover').hidePopover();
    setTimeout(() => openSubPopover(day), 200);
  });

  // Breakdown — delegate edit/delete
  document.getElementById('breakdown-list').addEventListener('click', async (e) => {
    const editBtn = e.target.closest('[data-edit-id]');
    if (editBtn) {
      document.getElementById('breakdown-popover').hidePopover();
      const sub = state.subscriptions.find(s => s.id === editBtn.dataset.editId);
      if (sub) setTimeout(() => openSubPopover(null, sub), 200);
      return;
    }
    const deleteBtn = e.target.closest('[data-delete-id]');
    if (deleteBtn) {
      await db.delete(deleteBtn.dataset.deleteId);
      state.subscriptions = await db.getAll();
      render();
      openBreakdown();
    }
  });

  // Favicon previews
  setupFaviconPreview('sub-url', 'favicon-preview');
  setupFaviconPreview('qa-url', 'qa-favicon-preview');
}
