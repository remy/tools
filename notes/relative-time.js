// Short "last updated" labels for the note list: "Just now", "5m ago",
// "3h ago", "Yesterday", "Mon", "3 Nov", "3 Nov 2024". Compact enough to sit
// beside a one-line preview; the full date goes in the element's title.

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

const startOfDay = (date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const dayMonth = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
const dayMonthYear = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const full = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function relativeLabel(timestamp, now = Date.now()) {
  if (!timestamp) return '';
  const then = new Date(timestamp);
  // A clock that's slightly ahead on another device can put an edit in the
  // future; treat that as just now rather than showing nonsense.
  const diff = Math.max(0, now - timestamp);

  if (diff < MINUTE) return 'Just now';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m ago`;

  const today = startOfDay(new Date(now));
  const days = Math.round((today - startOfDay(then)) / (24 * HOUR));
  if (days <= 0) return `${Math.floor(diff / HOUR)}h ago`;
  if (days === 1) return 'Yesterday';
  if (days < 7) return weekday.format(then);
  if (then.getFullYear() === new Date(now).getFullYear()) return dayMonth.format(then);
  return dayMonthYear.format(then);
}

export function fullLabel(timestamp) {
  return timestamp ? full.format(new Date(timestamp)) : '';
}
