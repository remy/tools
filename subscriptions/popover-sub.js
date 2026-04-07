import { state } from './state.js';
import { db } from './db.js';
import { faviconUrl } from './utils.js';
import { render } from './render-calendar.js';

export function syncToggleToSelect(radioName, selectId) {
  const checked = document.querySelector(`input[name="${radioName}"]:checked`);
  if (checked) {
    document.getElementById(selectId).value = checked.value;
  }
}

export function updateRenewalVisibility(radioName, monthSelectId) {
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

export function openSubPopover(day, editSub) {
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
    document.getElementById('sub-month').value = state.currentMonth;
    document.getElementById('sub-edit-id').value = '';
    deleteBtn.hidden = true;
  }
  updateRenewalVisibility('sub-cycle-radio', 'sub-month');

  popover.showPopover();
  setTimeout(() => document.getElementById('sub-name').focus(), 50);
}

export async function handleSubFormSubmit(e) {
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
    createdAt: Date.now(),
  };

  await db.put(sub);
  state.subscriptions = await db.getAll();
  render();
  document.getElementById('sub-popover').hidePopover();
}

export async function handleSubDelete() {
  const id = document.getElementById('sub-edit-id').value;
  if (!id) return;
  await db.delete(id);
  state.subscriptions = await db.getAll();
  render();
  document.getElementById('sub-popover').hidePopover();
}
