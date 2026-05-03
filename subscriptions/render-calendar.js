import { state, MONTH_NAMES } from './state.js';
import {
  getDaysInMonth,
  getFirstDayOfWeek,
  subsForMonth,
  filteredSubs,
  isSubActive,
  convertAmount,
  formatCurrency,
  escapeHtml,
} from './utils.js';

export function render() {
  renderHeader();
  renderGrid();
  renderTotal();
}

const narrowMQ = window.matchMedia('(max-width: 639px)');
narrowMQ.addEventListener('change', renderHeader);

export function renderHeader() {
  const el = document.getElementById('month-title');
  if (state.viewMode === 'year') {
    el.textContent = state.yearViewYear;
    return;
  }
  const narrow = narrowMQ.matches;
  const month = narrow
    ? MONTH_NAMES[state.currentMonth].slice(0, 3)
    : MONTH_NAMES[state.currentMonth];
  if (state.currentYear === new Date().getFullYear()) {
    el.textContent = month;
  } else {
    const year = narrow ? `'${String(state.currentYear).slice(-2)}` : state.currentYear;
    el.textContent = `${month} ${year}`;
  }
}

export function renderGrid() {
  const grid = document.getElementById('calendar-grid');
  const daysInMonth = getDaysInMonth(state.currentYear, state.currentMonth);
  const firstDay = getFirstDayOfWeek(state.currentYear, state.currentMonth);
  const byDay = subsForMonth(filteredSubs(), state.currentYear, state.currentMonth);
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === state.currentYear && today.getMonth() === state.currentMonth;
  const todayDate = today.getDate();

  const prevMonth = state.currentMonth === 0 ? 11 : state.currentMonth - 1;
  const prevYear = state.currentMonth === 0 ? state.currentYear - 1 : state.currentYear;
  const prevDays = getDaysInMonth(prevYear, prevMonth);

  // Only render as many weeks as needed — drop any trailing row that would
  // contain only next-month spill. Months need 4, 5, or 6 weeks.
  const weeks = Math.ceil((firstDay + daysInMonth) / 7);
  const totalCells = weeks * 7;
  grid.style.setProperty('--weeks', weeks);

  let html = '';

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
      html += '<div class="day-subs">';
      for (const sub of daySubs) {
        const favSrc = sub.favicon || '';
        html += `<div class="day-sub-item" data-sub-id="${sub.id}">`;
        if (favSrc) {
          html += `<img src="${escapeHtml(favSrc)}" alt="" width="12" height="12" loading="lazy">`;
        }
        html += `<span>${escapeHtml(sub.name)}</span></div>`;
      }
      if (daySubs.length > 3) {
        html += `<span class="day-sub-more" aria-hidden="true">+${daySubs.length - 3}</span>`;
      }
      html += '</div>';
    }

    html += '</div>';
  }

  grid.innerHTML = html;
}

export function renderTotal() {
  const { settings } = state;
  let total = 0;
  for (const sub of filteredSubs()) {
    if (!isSubActive(sub, state.currentYear, state.currentMonth)) continue;
    total += convertAmount(sub.amount, sub.currency, settings.displayCurrency, settings.exchangeRate);
  }
  document.getElementById('total-amount').textContent =
    formatCurrency(total, settings.displayCurrency);
}
