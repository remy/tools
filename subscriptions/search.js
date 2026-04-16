import { state, MONTH_NAMES } from './state.js';
import { render } from './render-calendar.js';
import { renderYearView, toggleYearView } from './render-year.js';
import { openSubPopover } from './popover-sub.js';
import { openQuickAdd } from './popover-quickadd.js';
import { openBreakdown } from './popover-breakdown.js';
import { openSettings } from './popover-settings.js';
import { handleExport } from './io.js';

// ── Build a fresh command list from current state ──
// This runs via `palette.onBeforeOpen` so each open reflects the latest data.
function buildCommands() {
  const cmds = [
    { name: 'quick-add',       description: 'Add subscription' },
    { name: 'show-breakdown',  description: 'Show monthly breakdown' },
    { name: 'toggle-view',     description: state.viewMode === 'year' ? 'Switch to month view' : 'Switch to year view' },
    { name: 'jump-to-month',   description: 'Jump to month…',    keepOpen: true },
    { name: 'filter-category', description: 'Filter category…',  keepOpen: true },
    { name: 'open-settings',   description: 'Open settings' },
    { name: 'export-json',     description: 'Export data as JSON' },
  ];

  // Sort subscriptions alphabetically for predictable search order
  const subs = [...state.subscriptions].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  );
  for (const sub of subs) {
    cmds.push({
      name: 'edit-sub',
      description: `Edit: ${sub.name}`,
      _subId: sub.id, // passed through in e.detail.command
    });
  }
  return cmds;
}

// ── Drill-down command sets ──
function monthCommands() {
  return MONTH_NAMES.map((name, idx) => ({
    name: 'month-selected',
    description: name,
    _month: idx,
  }));
}

function categoryCommands() {
  return [
    { name: 'category-selected', description: 'All',      _cat: 'all' },
    { name: 'category-selected', description: 'Personal', _cat: 'personal' },
    { name: 'category-selected', description: 'Business', _cat: 'business' },
  ];
}

// ── Wire it up ──
export function setupPalette() {
  const palette = document.querySelector('command-palette');
  if (!palette) return;

  // Dynamic root list — refreshed every time the palette opens.
  palette.onBeforeOpen = () => palette.setBaseCommands(buildCommands());

  // Also populate now so the first Cmd-K has data even if onBeforeOpen fails.
  palette.setBaseCommands(buildCommands());

  // Header search button
  const btn = document.getElementById('btn-search');
  if (btn) btn.addEventListener('click', () => palette.open());

  // ── Top-level actions ──
  palette.addEventListener('quick-add',      () => openQuickAdd());
  palette.addEventListener('show-breakdown', () => openBreakdown());
  palette.addEventListener('open-settings',  () => openSettings());
  palette.addEventListener('export-json',    () => handleExport());
  palette.addEventListener('toggle-view',    () => toggleYearView());

  palette.addEventListener('edit-sub', (e) => {
    const sub = state.subscriptions.find(s => s.id === e.detail.command._subId);
    if (sub) openSubPopover(null, sub);
  });

  // ── Drill-down: jump to month ──
  palette.addEventListener('jump-to-month', () => {
    palette.setCommands(monthCommands(), {
      placeholder: 'Jump to month…',
      label: 'Months',
    });
  });
  palette.addEventListener('month-selected', (e) => {
    state.currentMonth = e.detail.command._month;
    if (state.viewMode === 'year') {
      // Switch back to month view at the chosen month
      toggleYearView();
    } else {
      render();
    }
  });

  // ── Drill-down: filter by category ──
  palette.addEventListener('filter-category', () => {
    palette.setCommands(categoryCommands(), {
      placeholder: 'Filter category…',
      label: 'Categories',
    });
  });
  palette.addEventListener('category-selected', (e) => {
    state.categoryFilter = e.detail.command._cat;
    const main = document.querySelector(`input[name="category-filter"][value="${state.categoryFilter}"]`);
    const year = document.querySelector(`input[name="year-category-filter"][value="${state.categoryFilter}"]`);
    if (main) main.checked = true;
    if (year) year.checked = true;
    if (state.viewMode === 'year') renderYearView();
    else render();
  });
}
