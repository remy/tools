// ── Constants ──
export const DB_NAME = 'subscription-tracker';
export const DB_VERSION = 1;
export const DEFAULT_RATE = 0.79;
export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// ── Mutable application state ──
// All modules import this same object reference.
export const state = {
  currentYear: 0,
  currentMonth: 0,
  subscriptions: [],
  settings: { displayCurrency: 'GBP', exchangeRate: DEFAULT_RATE },
  categoryFilter: 'all', // 'all' | 'personal' | 'business'
  viewMode: 'month', // 'month' | 'year'
  yearViewYear: 0,
};
