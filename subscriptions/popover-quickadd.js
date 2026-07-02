import { state } from './state.js';
import { db } from './db.js';
import { faviconUrl } from './utils.js';
import { render } from './render-calendar.js';
import { syncToggleToSelect, updateRenewalVisibility } from './popover-sub.js';

export function openQuickAdd() {
  const form = document.getElementById('quick-add-form');
  form.reset();
  document.getElementById('qa-favicon-preview').hidden = true;
  document.getElementById('qa-favicon-preview').src = '';
  document.getElementById('qa-cycle-monthly').checked = true;
  document.getElementById('qa-month').value = state.currentMonth;
  updateRenewalVisibility('qa-cycle-radio', 'qa-month');
  document.getElementById('quick-add-popover').showModal();
  setTimeout(() => document.getElementById('qa-name').focus(), 50);
}

export function buildQuickAddSub() {
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
    createdAt: Date.now(),
  };
}

export async function handleQuickAddSubmit(e) {
  e.preventDefault();
  const sub = buildQuickAddSub();
  await db.put(sub);
  state.subscriptions = await db.getAll();
  render();
  document.getElementById('quick-add-popover').close();
}

export async function handleSaveAndAddMore() {
  const form = document.getElementById('quick-add-form');
  if (!form.reportValidity()) return;
  const sub = buildQuickAddSub();
  await db.put(sub);
  state.subscriptions = await db.getAll();
  render();
  const selectedCategory = document.querySelector('input[name="qa-category-radio"]:checked').value;
  form.reset();
  document.getElementById('qa-favicon-preview').hidden = true;
  document.getElementById('qa-favicon-preview').src = '';
  document.getElementById('qa-cycle-monthly').checked = true;
  document.getElementById(`qa-cat-${selectedCategory}`).checked = true;
  updateRenewalVisibility('qa-cycle-radio', 'qa-month');
  document.getElementById('qa-name').focus();
}
