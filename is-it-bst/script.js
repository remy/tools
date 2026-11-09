const TZ = 'Europe/London';
const YEARS_AHEAD = 10;
const DAY = 864e5;

const offsetFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, timeZoneName: 'shortOffset' });

// Minutes ahead of UTC in London at the given instant (0 = GMT, 60 = BST)
function londonOffset(date) {
  const name = offsetFmt.formatToParts(date).find((p) => p.type === 'timeZoneName').value;
  const m = name.match(/GMT([+-])(\d+)(?::(\d+))?/);
  if (!m) return 0;
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0));
}

// Binary search for the instant the offset changes between a and b
function findChange(a, b) {
  const start = londonOffset(new Date(a));
  while (b - a > 1000) {
    const mid = Math.floor((a + b) / 2);
    if (londonOffset(new Date(mid)) === start) a = mid;
    else b = mid;
  }
  return new Date(b);
}

// All offset changes in a year, found by stepping a day at a time
function changesInYear(year) {
  const changes = [];
  const end = Date.UTC(year + 1, 0, 1);
  let t = Date.UTC(year, 0, 1);
  let prev = londonOffset(new Date(t));
  for (; t < end; t += DAY) {
    const next = londonOffset(new Date(t + DAY));
    if (next !== prev) {
      const at = findChange(t, t + DAY);
      changes.push({ at, forward: next > prev, before: prev });
      prev = next;
    }
  }
  return changes;
}

const dateFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' });
const longFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
});
const timeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });

function londonDay(date) {
  const [d, m, y] = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: 'numeric', month: 'numeric', year: 'numeric' })
    .format(date).split('/').map(Number);
  return Date.UTC(y, m - 1, d);
}

function relative(from, to) {
  const days = Math.round((londonDay(to) - londonDay(from)) / DAY);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `In ${days} days`;
}

const cache = new Map();
function changes(year) {
  if (!cache.has(year)) cache.set(year, changesInYear(year));
  return cache.get(year);
}

function render() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const bst = londonOffset(now) > 0;

  document.getElementById('answer').innerHTML = bst
    ? /* HTML */ `<span class="yes">Yes</span>`
    : /* HTML */ `<span class="no">No</span>`;
  document.getElementById('now').textContent = `UK time is ${timeFmt.format(now)}`;

  const next = [...changes(year), ...changes(year + 1)].find((c) => c.at > now);
  if (next) {
    const hh = new Date(Math.round(next.at / 6e4) * 6e4 + next.before * 6e4).getUTCHours();
    document.getElementById('next-label').textContent = next.forward
      ? 'Clocks go forward (GMT → BST)'
      : 'Clocks go back (BST → GMT)';
    document.getElementById('next-relative').textContent = relative(now, next.at);
    document.getElementById('next-date').textContent =
      `${longFmt.format(next.at)} at ${hh}am`;
  } else {
    document.getElementById('next-label').textContent = 'No upcoming change';
  }

  const rows = [];
  for (let y = year; y <= year + YEARS_AHEAD; y++) {
    const c = changes(y);
    const fwd = c.find((x) => x.forward);
    const back = c.find((x) => !x.forward);
    rows.push(/* HTML */ `<tr class="${y === year ? 'current' : ''}">
      <td>${y}</td>
      <td>${fwd ? dateFmt.format(fwd.at) : '—'}</td>
      <td>${back ? dateFmt.format(back.at) : '—'}</td>
    </tr>`);
  }
  document.getElementById('years').innerHTML = rows.join('');
}

render();
setInterval(render, 60 * 1000);
