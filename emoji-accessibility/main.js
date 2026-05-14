import { buildRows, uniqueCategories } from './render.js';
import { applyFilters, debounce } from './filter.js';

const state = {
  search: '',
  category: '',
  onlyDiff: false,
};

const els = {
  search: document.getElementById('search'),
  category: document.getElementById('category'),
  diffOnly: document.getElementById('diff-only'),
  showCodepoint: document.getElementById('show-codepoint'),
  tbody: document.getElementById('emoji-tbody'),
  resultCount: document.getElementById('result-count'),
  mobileHint: document.getElementById('mobile-hint'),
};

let rows = [];
let totalCount = 0;

function updateCount(visible) {
  const word = visible === 1 ? 'emoji' : 'emoji';
  els.resultCount.textContent = `Showing ${visible.toLocaleString()} of ${totalCount.toLocaleString()} ${word}`;
}

function runFilter() {
  const visible = applyFilters(rows, state);
  updateCount(visible);
}

function populateCategories(data) {
  const cats = uniqueCategories(data);
  for (const c of cats) {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    els.category.appendChild(opt);
  }
}

function initCodepointToggle() {
  const show = localStorage.getItem('emoji-a11y-show-codepoint') === '1';
  els.showCodepoint.checked = show;
  document.body.classList.toggle('show-codepoint', show);
}

function setCodepointVisible(show) {
  document.body.classList.toggle('show-codepoint', show);
  localStorage.setItem('emoji-a11y-show-codepoint', show ? '1' : '0');
}

function maybeShowMobileHint() {
  if (localStorage.getItem('emoji-a11y-hint-seen') === '1') return;
  if (window.matchMedia('(min-width: 900px)').matches) return;
  els.mobileHint.hidden = false;
  // Dismiss on first scroll of the table wrapper.
  const wrap = document.querySelector('.table-wrap');
  const onScroll = () => {
    els.mobileHint.hidden = true;
    localStorage.setItem('emoji-a11y-hint-seen', '1');
    wrap.removeEventListener('scroll', onScroll);
  };
  wrap.addEventListener('scroll', onScroll, { passive: true });
}

async function loadData() {
  const [data, overrides] = await Promise.all([
    fetch('data.json').then((r) => r.json()),
    fetch('overrides.json').then((r) => r.json()),
  ]);

  totalCount = data.length;
  const frag = buildRows(data, overrides);

  // Replace the loading row with built rows.
  els.tbody.replaceChildren(frag);
  rows = Array.from(els.tbody.children);

  populateCategories(data);
  updateCount(totalCount);
  maybeShowMobileHint();
}

function wireEvents() {
  els.search.addEventListener(
    'input',
    debounce((e) => {
      state.search = e.target.value;
      runFilter();
    }, 150)
  );

  els.category.addEventListener('change', (e) => {
    state.category = e.target.value;
    runFilter();
  });

  els.diffOnly.addEventListener('change', (e) => {
    state.onlyDiff = e.target.checked;
    runFilter();
  });

  els.showCodepoint.addEventListener('change', (e) => {
    setCodepointVisible(e.target.checked);
  });
}

initCodepointToggle();
wireEvents();
loadData().catch((err) => {
  console.error('Failed to load emoji data', err);
  els.tbody.innerHTML = '<tr><td colspan="7" class="empty-row">Failed to load emoji data. Check the console.</td></tr>';
  els.resultCount.textContent = 'Failed to load.';
});
