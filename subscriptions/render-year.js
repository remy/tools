import { state } from './state.js';
import { filteredSubs, isSubActive, convertAmount, formatCurrency } from './utils.js';
import { render, renderHeader } from './render-calendar.js';

export function computeMonthTotal(subs, year, month, displayCurrency, rate) {
  let total = 0;
  for (const sub of subs) {
    if (!isSubActive(sub, year, month)) continue;
    total += convertAmount(sub.amount, sub.currency, displayCurrency, rate);
  }
  return total;
}

export function renderYearView() {
  const subs = filteredSubs();
  const SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const now = new Date();
  const isThisYear = state.yearViewYear === now.getFullYear();

  const totals = [];
  let yearTotal = 0;
  for (let m = 0; m < 12; m++) {
    const t = computeMonthTotal(subs, state.yearViewYear, m, state.settings.displayCurrency, state.settings.exchangeRate);
    totals.push(t);
    yearTotal += t;
  }

  document.getElementById('year-total').textContent =
    `Annual total: ${formatCurrency(yearTotal, state.settings.displayCurrency)}`;

  const nonZeroTotals = totals.filter(t => t > 0);
  const minTotal = nonZeroTotals.length ? Math.min(...nonZeroTotals) : 0;
  const maxTotal = nonZeroTotals.length ? Math.max(...nonZeroTotals) : 1;
  const range = maxTotal - minTotal;

  function heatColor(value) {
    if (value < 0.01) return 'var(--bg-input)';
    const ratio = range > 0 ? (value - minTotal) / range : 0;
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
    const pct = maxTotal > 0 ? Math.round((totals[m] / maxTotal) * 100) : 0;
    const color = heatColor(totals[m]);
    const isCurrent = isThisYear && m === now.getMonth();

    let count = 0;
    for (const sub of subs) {
      if (sub.cycle === 'yearly' && sub.recurringMonth !== undefined && sub.recurringMonth !== m) continue;
      count++;
    }

    html += `<div class="year-month${isCurrent ? ' current-month' : ''}" data-month="${m}">`;
    html += `<div class="year-month-heat" style="background:${color}"></div>`;
    html += `<span class="year-month-name">${SHORT[m]}</span>`;
    html += `<div class="year-month-bar"><div class="year-month-bar-fill" style="width:${pct}%;background:${color}"></div></div>`;
    html += `<span class="year-month-amount">${formatCurrency(totals[m], state.settings.displayCurrency)}</span>`;
    html += `<span class="year-month-count">${count}</span>`;
    html += `</div>`;
  }

  document.getElementById('year-grid').innerHTML = html;
}

export function toggleYearView() {
  const btn = document.getElementById('btn-year-view');
  const calendarEl = document.querySelector('.calendar');
  const yearViewEl = document.getElementById('year-view');
  const monthChrome = document.getElementById('month-chrome');

  if (state.viewMode === 'month') {
    state.viewMode = 'year';
    state.yearViewYear = state.currentYear;
    btn.classList.add('active');
    calendarEl.classList.add('is-hidden');
    monthChrome.classList.add('is-hidden');
    yearViewEl.classList.remove('is-hidden');
    renderHeader();
    renderYearView();
  } else {
    state.viewMode = 'month';
    btn.classList.remove('active');
    calendarEl.classList.remove('is-hidden');
    monthChrome.classList.remove('is-hidden');
    yearViewEl.classList.add('is-hidden');
    render();
  }
}
