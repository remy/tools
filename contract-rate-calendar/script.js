const KEY = 'contract-rate-calendar';
const HOLIDAY_KEY = 'contract-rate-calendar:holidays';
const HOLIDAY_URL = 'https://www.gov.uk/bank-holidays.json';
const HOLIDAY_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_MONTHS = 6;
const MAX_MONTHS = 60;
const VAT = 0.2;

// England & Wales bank holidays — used until the gov.uk feed has loaded (or if it can't be reached)
let holidays = {
  '2026-12-25': 'Christmas Day',
  '2026-12-28': 'Boxing Day (substitute day)',
  '2027-01-01': "New Year's Day",
  '2027-03-26': 'Good Friday',
  '2027-03-29': 'Easter Monday',
};

const $months = document.getElementById('months');
const $subtitle = document.getElementById('subtitle');
const $start = document.getElementById('start');
const $end = document.getElementById('end');
const $total = document.getElementById('total');
const $contract = document.getElementById('contract');
const $incvat = document.getElementById('incvat');
const $exvat = document.getElementById('exvat');
const $rate = document.getElementById('rate');
const monthFmt = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' });
const shortFmt = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' });
const gbp = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
const pad = n => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const isoDate = date => iso(date.getFullYear(), date.getMonth(), date.getDate());
const parseIso = s => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const validIso = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && isoDate(parseIso(s)) === s;
const todayKey = isoDate(new Date());

const state = load();
const selected = new Set(state.days);

/* ---------- persistence: URL first, then localStorage ---------- */

function defaultRange() {
  const now = new Date();
  return {
    start: iso(now.getFullYear(), now.getMonth(), 1),
    end: isoDate(new Date(now.getFullYear(), now.getMonth() + DEFAULT_MONTHS, 0)),
  };
}

function load() {
  const empty = { ...defaultRange(), days: [], contract: '', incvat: false };
  const params = new URLSearchParams(location.search);
  if (params.has('from') || params.has('days')) {
    return {
      start: validIso(params.get('from')) ? params.get('from') : empty.start,
      end: validIso(params.get('to')) ? params.get('to') : empty.end,
      days: decodeDays(params.get('days') || ''),
      contract: params.get('value') || '',
      incvat: params.get('vat') === '1',
    };
  }
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved) return { ...empty, ...saved };
  } catch {}
  return empty;
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      start: $start.value,
      end: $end.value,
      days: [...selected],
      contract: $contract.value,
      incvat: $incvat.checked,
    }));
  } catch {}

  const params = new URLSearchParams();
  params.set('from', $start.value);
  params.set('to', $end.value);
  const days = encodeDays(visibleSelected());
  if (days) params.set('days', days);
  if ($contract.value) params.set('value', $contract.value);
  if ($incvat.checked) params.set('vat', '1');
  // keep the separators readable rather than percent-encoded
  const query = params.toString().replaceAll('%2C', ',').replaceAll('%7E', '~');
  history.replaceState(null, '', `${location.pathname}?${query}`);
}

// Runs of consecutive dates are collapsed to "start~end", runs are comma separated
function encodeDays(days) {
  const sorted = [...days].sort();
  const runs = [];
  for (const day of sorted) {
    const run = runs.at(-1);
    if (run) {
      const next = parseIso(run[1]);
      next.setDate(next.getDate() + 1);
      if (isoDate(next) === day) { run[1] = day; continue; }
    }
    runs.push([day, day]);
  }
  return runs.map(([a, b]) => a === b ? a : `${a}~${b}`).join(',');
}

function decodeDays(value) {
  const days = [];
  for (const part of value.split(',')) {
    const [a, b = a] = part.split('~');
    if (!validIso(a) || !validIso(b)) continue;
    const d = parseIso(a);
    const end = parseIso(b);
    for (let i = 0; d <= end && i < MAX_MONTHS * 31; i++) {
      days.push(isoDate(d));
      d.setDate(d.getDate() + 1);
    }
  }
  return days;
}

/* ---------- range: always whole months ---------- */

function range() {
  let start = validIso($start.value) ? parseIso($start.value) : parseIso(defaultRange().start);
  let end = validIso($end.value) ? parseIso($end.value) : parseIso(defaultRange().end);
  if (end < start) [start, end] = [end, start];
  const first = new Date(start.getFullYear(), start.getMonth(), 1);
  let months = (end.getFullYear() - first.getFullYear()) * 12 + end.getMonth() - first.getMonth() + 1;
  months = Math.min(months, MAX_MONTHS);
  const last = new Date(first.getFullYear(), first.getMonth() + months, 0);
  return { first, months, from: isoDate(first), to: isoDate(last) };
}

function visibleSelected() {
  const { from, to } = range();
  return [...selected].filter(k => k >= from && k <= to);
}

/* ---------- bank holidays from gov.uk ---------- */

function toHolidayMap(events) {
  return Object.fromEntries(events.map(e => [e.date, e.title.replaceAll('’', "'")]));
}

async function loadHolidays() {
  try {
    const cached = JSON.parse(localStorage.getItem(HOLIDAY_KEY));
    if (cached?.events) {
      holidays = toHolidayMap(cached.events);
      if (Date.now() - cached.at < HOLIDAY_MAX_AGE) return;
    }
  } catch {}
  try {
    const res = await fetch(HOLIDAY_URL);
    if (!res.ok) return;
    const events = (await res.json())['england-and-wales'].events;
    holidays = toHolidayMap(events);
    try {
      localStorage.setItem(HOLIDAY_KEY, JSON.stringify({ at: Date.now(), events }));
    } catch {}
  } catch {}
}

/* ---------- rendering ---------- */

function render() {
  const { first: start, months } = range();
  const frag = document.createDocumentFragment();
  for (let i = 0; i < months; i++) {
    const first = new Date(start.getFullYear(), start.getMonth() + i, 1);
    const y = first.getFullYear(), m = first.getMonth();
    const days = new Date(y, m + 1, 0).getDate();
    const offset = (first.getDay() + 6) % 7; // Monday first
    const prefix = `${y}-${pad(m + 1)}`;
    const hols = Object.entries(holidays).filter(([k]) => k.startsWith(prefix));

    const sec = document.createElement('section');
    sec.className = 'month';
    sec.dataset.month = prefix;
    sec.innerHTML = /* HTML */`<h2>${monthFmt.format(first)} <span data-count></span></h2>
      <div class="grid">${['M','T','W','T','F','S','S'].map(d => `<div class="dow">${d}</div>`).join('')}</div>
      ${hols.length ? `<ul class="hols">${hols.map(([k, t]) => `<li>${+k.slice(8)} – ${t}</li>`).join('')}</ul>` : ''}`;
    const grid = sec.querySelector('.grid');
    for (let b = 0; b < offset; b++) grid.append(document.createElement('div'));
    for (let d = 1; d <= days; d++) {
      const key = iso(y, m, d);
      const dow = (offset + d - 1) % 7;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'day' + (dow > 4 ? ' we' : '') + (holidays[key] ? ' hol' : '') + (key === todayKey ? ' today' : '');
      btn.dataset.date = key;
      btn.textContent = d;
      if (holidays[key]) btn.title = holidays[key];
      btn.setAttribute('aria-pressed', selected.has(key));
      const label = new Date(y, m, d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
      btn.setAttribute('aria-label', holidays[key] ? `${label}, ${holidays[key]}` : label);
      grid.append(btn);
    }
    frag.append(sec);
  }
  $months.replaceChildren(frag);

  const last = new Date(start.getFullYear(), start.getMonth() + months - 1, 1);
  const span = months === 1 ? monthFmt.format(start) : `${shortFmt.format(start)} – ${shortFmt.format(last)}`;
  $subtitle.textContent = `${span} · click a date to toggle`;
}

function update() {
  const visible = visibleSelected();
  const n = visible.length;
  $total.textContent = n;
  for (const sec of $months.children) {
    const c = visible.filter(k => k.startsWith(sec.dataset.month)).length;
    sec.querySelector('[data-count]').textContent = c ? `${c}d` : '';
  }
  const value = parseFloat($contract.value);
  if (!(value > 0)) { $exvat.textContent = $rate.textContent = '–'; return; }
  const ex = $incvat.checked ? value / (1 + VAT) : value;
  $exvat.textContent = gbp.format(ex);
  $rate.textContent = n ? gbp.format(ex / n) : '–';
}

/* ---------- events ---------- */

$months.addEventListener('click', e => {
  const btn = e.target.closest('.day');
  if (!btn) return;
  const key = btn.dataset.date;
  selected.has(key) ? selected.delete(key) : selected.add(key);
  btn.setAttribute('aria-pressed', selected.has(key));
  save(); update();
});

function onRangeChange() {
  if (!validIso($start.value) || !validIso($end.value)) return;
  render(); update(); save();
}
$start.addEventListener('change', onRangeChange);
$end.addEventListener('change', onRangeChange);

$contract.addEventListener('input', () => { save(); update(); });
$incvat.addEventListener('change', () => { save(); update(); });

document.getElementById('clear').addEventListener('click', () => {
  for (const key of visibleSelected()) selected.delete(key);
  $months.querySelectorAll('.day[aria-pressed="true"]').forEach(b => b.setAttribute('aria-pressed', 'false'));
  save(); update();
});

/* ---------- boot ---------- */

$start.value = state.start;
$end.value = state.end;
$contract.value = state.contract;
$incvat.checked = state.incvat;
render();
update();

loadHolidays().then(() => { render(); update(); });
