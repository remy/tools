import { state, MONTH_NAMES } from './state.js';
import {
  filteredSubs,
  subsForMonth,
  convertAmount,
  formatCurrency,
  escapeHtml,
} from './utils.js';

let currentDay = null;

export function getDaySheetDay() {
  return currentDay;
}

export function openDaySheet(day) {
  const popover = document.getElementById('day-sheet-popover');
  const list = document.getElementById('day-sheet-list');
  const title = document.getElementById('day-sheet-title');

  currentDay = day;
  title.textContent = `${MONTH_NAMES[state.currentMonth]} ${day}`;

  const byDay = subsForMonth(filteredSubs(), state.currentYear, state.currentMonth);
  const daySubs = byDay[day] || [];
  const { displayCurrency, exchangeRate } = state.settings;

  let html = '';
  for (const sub of daySubs) {
    const favSrc = sub.favicon || '';
    const cat = sub.category || 'personal';
    const catClass = cat === 'business' ? 'cat-business' : 'cat-personal';
    const cycleClass = sub.cycle === 'yearly' ? 'cycle-yearly' : 'cycle-monthly';
    const converted = convertAmount(sub.amount, sub.currency, displayCurrency, exchangeRate);
    const priceLabel = sub.cycle === 'yearly'
      ? `${formatCurrency(sub.amount, sub.currency)}/yr`
      : `${formatCurrency(sub.amount, sub.currency)}/mo`;
    const convertedLabel = sub.currency === displayCurrency
      ? ''
      : `<span class="day-sheet-converted">${formatCurrency(converted, displayCurrency)}</span>`;

    html += `<li class="day-sheet-item" data-sub-id="${sub.id}" role="button" tabindex="0">`;
    html += `<div class="day-sheet-favicon">`;
    if (favSrc) {
      html += `<img src="${escapeHtml(favSrc)}" alt="" width="24" height="24" loading="lazy">`;
    }
    html += `</div>`;
    html += `<div class="day-sheet-info">
      <div class="day-sheet-name">${escapeHtml(sub.name)}</div>
      <div class="day-sheet-tags">
        <span class="breakdown-cycle ${cycleClass}">${sub.cycle}</span>
        <span class="cat-badge ${catClass}">${cat}</span>
      </div>
    </div>`;
    html += `<div class="day-sheet-price">
      <div class="day-sheet-amount">${priceLabel}</div>
      ${convertedLabel}
    </div>`;
    html += `<svg class="day-sheet-chevron" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 4L10 8L6 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    html += `</li>`;
  }

  list.innerHTML = html;
  popover.showPopover();
}
