import { state } from './state.js';

export function extractDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

export function faviconUrl(url) {
  const domain = extractDomain(url);
  if (!domain) return '';
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
}

export function convertAmount(amount, from, to, rate) {
  if (from === to) return amount;
  if (from === 'USD' && to === 'GBP') return amount * rate;
  if (from === 'GBP' && to === 'USD') return amount / rate;
  return amount;
}

export function monthlyEquivalent(amount, cycle) {
  return cycle === 'yearly' ? amount / 12 : amount;
}

export function formatCurrency(amount, currency) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

export function getFirstDayOfWeek(year, month) {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1;
}

export function effectiveDay(recurringDay, year, month) {
  const daysInMonth = getDaysInMonth(year, month);
  return Math.min(recurringDay, daysInMonth);
}

// Parse an 'YYYY-MM-DD' date string into a local Date, or null.
export function parseIsoDate(str) {
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export const parseEndDate = parseIsoDate;
export const parseStartDate = parseIsoDate;

// Is a subscription active for the given (year, month)?
// - Yearly subs only count in their recurringMonth.
// - If startDate is set, the sub's billing occurrence in that month must land
//   on or after startDate.
// - If endDate is set, the sub's billing occurrence in that month must land
//   on or before endDate (so cancelling on Apr 20 still includes Apr if the
//   billing day is ≤ 20, and includes every prior month).
export function isSubActive(sub, year, month) {
  if (sub.cycle === 'yearly' && sub.recurringMonth !== undefined && sub.recurringMonth !== month) {
    return false;
  }
  const start = parseIsoDate(sub.startDate);
  const end = parseIsoDate(sub.endDate);
  if (!start && !end) return true;
  const day = effectiveDay(sub.recurringDay, year, month);
  const billing = new Date(year, month, day);
  if (start && billing < start) return false;
  if (end && billing > end) return false;
  return true;
}

// Does the sub's end date fall inside this (year, month)?
export function subEndsInMonth(sub, year, month) {
  const end = parseEndDate(sub.endDate);
  if (!end) return false;
  return end.getFullYear() === year && end.getMonth() === month;
}

export function subsForMonth(subs, year, month) {
  const byDay = {};
  for (const sub of subs) {
    if (!isSubActive(sub, year, month)) continue;
    const day = effectiveDay(sub.recurringDay, year, month);
    if (!byDay[day]) byDay[day] = [];
    byDay[day].push(sub);
  }
  return byDay;
}

export function filteredSubs() {
  if (state.categoryFilter === 'all') return state.subscriptions;
  return state.subscriptions.filter(s => (s.category || 'personal') === state.categoryFilter);
}

export function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}
