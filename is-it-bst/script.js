// UK rule (Summer Time Order 2002): BST starts on the last Sunday of March
// and ends on the last Sunday of October, both at 01:00 GMT.
const YEARS_AHEAD = 10;
const DAY = 864e5;
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

function lastSunday(year, month) {
  const last = new Date(Date.UTC(year, month + 1, 0));
  return Date.UTC(year, month, last.getUTCDate() - last.getUTCDay(), 1);
}

const forward = (year) => new Date(lastSunday(year, 2));
const back = (year) => new Date(lastSunday(year, 9));

function isBST(date) {
  const y = date.getUTCFullYear();
  return date >= forward(y) && date < back(y);
}

// Shift a UTC instant to UK wall-clock time, read with getUTC* methods
const ukClock = (date) => new Date(date.getTime() + (isBST(date) ? 36e5 : 0));
const pad = (n) => String(n).padStart(2, '0');

function shortDate(date) {
  return `${DAYS[date.getUTCDay()].slice(0, 3)} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()].slice(0, 3)}`;
}

function longDate(date) {
  return `${DAYS[date.getUTCDay()]}, ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

function relative(from, to) {
  const day = (d) => Math.floor(ukClock(d).getTime() / DAY);
  const days = day(to) - day(from);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `In ${days} days`;
}

function render() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const bst = isBST(now);
  const clock = ukClock(now);

  document.getElementById('answer').innerHTML = bst
    ? /* HTML */ `<span class="yes">Yes</span>`
    : /* HTML */ `<span class="no">No</span>`;
  document.getElementById('now').textContent =
    `UK time is ${pad(clock.getUTCHours())}:${pad(clock.getUTCMinutes())} ${bst ? 'BST' : 'GMT'}`;

  const next = [
    { at: forward(year), forward: true },
    { at: back(year), forward: false },
    { at: forward(year + 1), forward: true },
  ].find((c) => c.at > now);

  document.getElementById('next-label').textContent = next.forward
    ? 'Clocks go forward (GMT → BST)'
    : 'Clocks go back (BST → GMT)';
  document.getElementById('next-relative').textContent = relative(now, next.at);
  document.getElementById('next-date').textContent =
    `${longDate(next.at)} at ${next.forward ? '1am' : '2am'}`;

  const rows = [];
  for (let y = year; y <= year + YEARS_AHEAD; y++) {
    rows.push(/* HTML */ `<tr class="${y === year ? 'current' : ''}"><td>${y}</td><td>${shortDate(forward(y))}</td><td>${shortDate(back(y))}</td></tr>`);
  }
  document.getElementById('years').innerHTML = rows.join('');
}

render();
setInterval(render, 60 * 1000);
