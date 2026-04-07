// =============================================
// Cook Planner — render-input.js
// =============================================

import { state, saveState, resetState } from './state.js';
import { COOK_TYPE_MAP } from './constants.js';
import { escHtml, formatDuration, toggleTheme } from './utils.js';
import { openItemModal } from './item-modal.js';
import { showScheduleView } from './router.js';
import { computeSchedule } from './schedule.js';

export function renderInputView() {
  const app = document.getElementById('app');
  const mode = state.mode || 'end';

  app.innerHTML = `
    <div class="view" id="view-input">
      <div class="container">
        <header class="app-header">
          <h1>\ud83c\udf73 Cook Planner</h1>
          <div class="header-actions">
            <button class="btn btn-ghost btn-sm" id="btn-theme-toggle" aria-label="Toggle dark mode">\ud83c\udf13</button>
          </div>
        </header>

        <div class="setup-card">
          <button class="btn-icon setup-gear" popovertarget="appl-popover"
            title="Configure appliances" aria-label="Configure appliances">\u2699</button>
          <div class="setup-row">
            <div class="setup-field">
              <label class="form-label">Target time</label>
              <div class="time-row" style="display:flex;gap:var(--space-sm);align-items:center;flex-wrap:wrap">
                <div class="seg-control" id="mode-toggle">
                  <button data-mode="end" class="${mode==='end'?'active':''}">Ready by</button>
                  <button data-mode="start" class="${mode==='start'?'active':''}">Start at</button>
                </div>
                <input class="input" id="inp-time" type="time"
                  value="${state.targetTime || '17:00'}" style="width:8rem">
              </div>
              <span class="form-hint">${mode === 'end' ? 'When everything should be on the table' : 'When you\'ll begin cooking'}</span>
            </div>
          </div>
        </div>

        <div class="section-header">
          <h2>Food Items</h2>
          <button class="btn btn-primary btn-sm" id="btn-add-item">+ Add item</button>
        </div>

        <div class="items-list" id="items-list">
          ${state.items.length === 0 ? renderEmptyState() : state.items.map(renderItemCard).join('')}
        </div>

        <div class="input-footer">
          <button class="btn btn-primary btn-lg" id="btn-generate"
            ${state.items.length === 0 ? 'disabled' : ''}>
            Generate Schedule \u2192
          </button>
          ${state.items.length > 0 ? `<button class="btn btn-ghost btn-sm" id="btn-new-cook" style="text-align:center">Start a new cook</button>` : ''}
          ${state.items.length > 0 ? `<button class="btn btn-ghost btn-sm" id="btn-export">\u2b07 Export JSON</button>` : ''}
        </div>
      </div>
    </div>
  `;

  bindInputEvents();
}

export function renderEmptyState() {
  return `
    <div class="empty-state">
      <div style="font-size:2rem">\ud83e\udd58</div>
      <p>Add your food items to get started.</p>
    </div>
  `;
}

export function renderItemCard(item) {
  const ct = COOK_TYPE_MAP[item.cookType] || COOK_TYPE_MAP['none'];
  const badges = [];
  badges.push(`<span class="item-badge item-badge-type">${ct.icon} ${ct.label}</span>`);
  if (item.prepTime > 0)  badges.push(`<span class="item-badge">Prep ${formatDuration(item.prepTime)}</span>`);
  if (item.cookTime > 0)  badges.push(`<span class="item-badge">Cook ${formatDuration(item.cookTime)}</span>`);
  if (item.setTime > 0)   badges.push(`<span class="item-badge">Rest ${formatDuration(item.setTime)}</span>`);
  if (ct.resource === 'oven' || ct.resource === 'combi') {
    const slots = item.shelfSlots || 1;
    badges.push(`<span class="item-badge">${slots === 1 ? '\u00bd shelf' : slots === 2 ? '1 shelf' : slots + ' slots'}</span>`);
  }

  return `
    <div class="item-card" data-id="${item.id}">
      <div class="item-card-top">
        <span class="item-name">${escHtml(item.name)}</span>
        <div class="item-actions">
          <button class="btn-icon btn-edit-item" data-id="${item.id}" aria-label="Edit ${escHtml(item.name)}">\u270f\ufe0f</button>
          <button class="btn-icon btn-remove-item" data-id="${item.id}" aria-label="Remove ${escHtml(item.name)}">\ud83d\uddd1</button>
        </div>
      </div>
      <div class="item-meta">${badges.join('')}</div>
    </div>
  `;
}

export function bindInputEvents() {
  document.getElementById('inp-time').addEventListener('change', e => {
    state.targetTime = e.target.value;
    saveState();
  });

  document.getElementById('mode-toggle').addEventListener('click', e => {
    const btn = e.target.closest('button[data-mode]');
    if (!btn) return;
    state.mode = btn.dataset.mode;
    saveState();
    renderInputView();
  });

  document.getElementById('btn-add-item').addEventListener('click', () => {
    openItemModal(null);
  });

  document.getElementById('btn-generate')?.addEventListener('click', () => {
    state.view = 'schedule';
    saveState();
    showScheduleView();
  });

  document.getElementById('btn-new-cook')?.addEventListener('click', () => {
    if (confirm('Start a new cook? This will clear all current items and settings.')) {
      resetState();
      renderInputView();
    }
  });

  document.getElementById('btn-export')?.addEventListener('click', exportJSON);

  document.getElementById('btn-theme-toggle')?.addEventListener('click', toggleTheme);

  document.getElementById('items-list').addEventListener('click', e => {
    const editBtn = e.target.closest('.btn-edit-item');
    const removeBtn = e.target.closest('.btn-remove-item');
    if (editBtn) openItemModal(editBtn.dataset.id);
    if (removeBtn) removeItem(removeBtn.dataset.id);
  });
}

export function removeItem(id) {
  state.items = state.items.filter(i => i.id !== id);
  saveState();
  if (state.view === 'schedule') showScheduleView();
  else renderInputView();
}

export function exportJSON() {
  const { items: scheduledItems, conflicts, events } = computeSchedule();
  const payload = { state, schedule: { items: scheduledItems, conflicts, events } };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cook-plan-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
