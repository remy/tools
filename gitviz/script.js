import { fetchReport } from './api.js';
import { cacheClear, cacheDelete, cacheGet, cacheListAll, cachePut, timeAgo } from './cache.js';
import { destroyCharts, escapeHtml, renderReport } from './report.js';

const viewForm = document.getElementById('view-form');
const viewProgress = document.getElementById('view-progress');
const viewReport = document.getElementById('view-report');

const form = document.getElementById('analyze-form');
const inpRepo = document.getElementById('inp-repo');
const inpToken = document.getElementById('inp-token');
const inpRemember = document.getElementById('inp-remember');
const repoError = document.getElementById('repo-error');

const progRepo = document.getElementById('prog-repo');
const progBar = document.getElementById('prog-bar');
const progPct = document.getElementById('prog-pct');
const progError = document.getElementById('prog-error');
const btnCancel = document.getElementById('btn-cancel');
const cachedClear = document.getElementById('cached-clear');
const btnBack = document.getElementById('btn-back');

let abortCtrl = null;

function showView(view) {
  viewForm.classList.toggle('hide', view !== 'form');
  viewProgress.classList.toggle('hide', view !== 'progress');
  viewReport.classList.toggle('hide', view !== 'report');
}

function setStatus(panel, text) {
  const el = document.getElementById('ps-' + panel);
  if (!el) return;
  el.textContent = text;
  el.className = 'status' + (text === 'done' ? ' done' : '');
}

async function renderCacheList() {
  const wrap = document.getElementById('cached-repos');
  const list = document.getElementById('cached-list');
  const entries = await cacheListAll();

  if (!entries.length) {
    list.innerHTML = '';
    wrap.classList.add('hide');
    return;
  }

  wrap.classList.remove('hide');
  list.innerHTML = entries.map((entry) => (
    '<li class="cached-item" data-key="' + escapeHtml(entry.key) + '">' +
      '<span class="ci-repo">' + escapeHtml(entry.key) + '</span>' +
      '<span class="ci-age">' + timeAgo(entry.cachedAt) + '</span>' +
      '<span class="ci-delete" data-del="' + escapeHtml(entry.key) + '" title="Delete cached report">&times;</span>' +
    '</li>'
  )).join('');

  list.querySelectorAll('.cached-item').forEach((item) => {
    item.addEventListener('click', async (event) => {
      if (event.target.closest('.ci-delete')) return;
      const entry = await cacheGet(item.dataset.key);
      if (!entry) return;

      inpRepo.value = item.dataset.key;
      destroyCharts();
      renderReport(entry.report);
      showView('report');
    });
  });

  list.querySelectorAll('.ci-delete').forEach((button) => {
    button.addEventListener('click', async (event) => {
      event.stopPropagation();
      await cacheDelete(button.dataset.del);
      await renderCacheList();
    });
  });
}

async function startAnalysis(owner, repo, token) {
  showView('progress');
  progRepo.textContent = owner + '/' + repo;
  progBar.style.width = '0%';
  progPct.textContent = '0%';
  progError.classList.add('hide');
  ['contributors', 'momentum', 'firefighting', 'churn', 'bugs'].forEach((panel) => setStatus(panel, 'waiting'));

  abortCtrl = new AbortController();
  const signal = abortCtrl.signal;

  const onProgress = (state) => {
    progBar.style.width = state.pct + '%';
    progPct.textContent = state.pct + '%';
  };
  onProgress.setStatus = setStatus;

  try {
    const report = await fetchReport(owner, repo, token, signal, onProgress);
    progBar.style.width = '100%';
    progPct.textContent = '100%';
    await cachePut(owner + '/' + repo, report);
    renderReport(report);
    showView('report');
  } catch (err) {
    if (err.name === 'AbortError') return;
    progError.innerHTML = escapeHtml(err.message) + ' <span class="retry-link" id="retry-link">Retry</span>';
    progError.classList.remove('hide');
    document.getElementById('retry-link')?.addEventListener('click', () => startAnalysis(owner, repo, token));
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  repoError.classList.add('hide');

  const raw = inpRepo.value.trim()
    .replace(/^https?:\/\/github\.com\//, '')
    .replace(/\/$/, '')
    .replace(/\.git$/, '');
  const parts = raw.split('/');

  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    repoError.textContent = 'Enter a valid owner/repo (e.g. expressjs/express)';
    repoError.classList.remove('hide');
    return;
  }

  const [owner, repo] = parts;
  const token = inpToken.value.trim();
  localStorage.setItem('gitviz-repo', `${owner}/${repo}`);

  if (inpRemember.checked && token) localStorage.setItem('gitviz-token', token);
  else localStorage.removeItem('gitviz-token');

  await startAnalysis(owner, repo, token);
});

btnCancel.addEventListener('click', () => {
  abortCtrl?.abort();
  showView('form');
});

cachedClear.addEventListener('click', async () => {
  await cacheClear();
  await renderCacheList();
});

btnBack.addEventListener('click', async () => {
  destroyCharts();
  await renderCacheList();
  showView('form');
});

inpRepo.value = localStorage.getItem('gitviz-repo') || '';
inpToken.value = localStorage.getItem('gitviz-token') || '';

renderCacheList();
navigator.serviceWorker?.register('/sw.js');
