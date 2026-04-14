import { MAX_DETAIL_FETCHES } from './api.js';

// ============================================================
//  REPORT RENDERING (mirrors assets/template.html — keep in sync)
// ============================================================

let activeCharts = [];

export function destroyCharts() {
  activeCharts.forEach(c => c.destroy());
  activeCharts = [];
  // Reset canvas elements
  document.querySelectorAll('#view-report canvas').forEach(c => {
    const parent = c.parentNode;
    const id = c.id;
    parent.removeChild(c);
    const fresh = document.createElement('canvas');
    fresh.id = id;
    parent.appendChild(fresh);
  });
  // Reset chart wrappers
  ['wrap-churn', 'wrap-contrib', 'wrap-bugs', 'wrap-momentum'].forEach(id => {
    const el = document.getElementById(id);
    if (el && !el.querySelector('canvas')) {
      el.className = id.includes('momentum') ? 'chart' : 'chart chart-tall';
      const canvas = document.createElement('canvas');
      canvas.id = 'chart-' + id.replace('wrap-', '');
      el.innerHTML = '';
      el.appendChild(canvas);
    }
  });
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function renderReport(DATA) {
  const Chart = window.Chart;
  if (!Chart) {
    throw new Error('Chart.js failed to load.');
  }
  const ghBase = DATA.repo; // https://github.com/owner/repo

  // ---- meta
  document.title = (DATA.repo_name || 'repo') + ' - gitviz';
  document.getElementById('repo-name').textContent = (DATA.owner ? DATA.owner + '/' : '') + DATA.repo_name;
  document.getElementById('repo-path').textContent = ghBase;
  const genDate = new Date(DATA.generated_at * 1000);
  document.getElementById('generated').innerHTML =
    'generated ' + genDate.toLocaleString() + '<br>window: ' + DATA.since;

  // ---- summary stats
  document.getElementById('stat-commits').textContent = DATA.total_commits.toLocaleString();
  document.getElementById('stat-contributors').textContent = DATA.contributors.length.toLocaleString();
  document.getElementById('stat-hot').textContent = DATA.churn.length.toLocaleString();
  document.getElementById('stat-bugs').textContent = DATA.bug_clusters.length.toLocaleString();
  document.getElementById('stat-ff').textContent = DATA.firefighting.length.toLocaleString();

  // ---- theme: read CSS variables
  const cssVar = (name) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  const theme = {
    muted: cssVar('--muted'),
    grid: cssVar('--chart-grid'),
    accent: cssVar('--accent'),
    accent2: cssVar('--accent-2'),
    danger: cssVar('--danger'),
    fillAccent: cssVar('--chart-fill-accent'),
  };

  Chart.defaults.color = theme.muted;
  Chart.defaults.borderColor = theme.grid;
  Chart.defaults.font.family = '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif';
  Chart.defaults.font.size = 12;
  Chart.defaults.animation.duration = 400;
  const gridColor = theme.grid;

  function shortPath(p, max) {
    if (!p) return '';
    if (p.length <= max) return p;
    const parts = p.split('/');
    if (parts.length <= 2) return '...' + p.slice(-(max - 1));
    return parts[0] + '/.../' + parts.slice(-2).join('/');
  }

  function mountEmpty(id, msg) {
    const wrap = document.getElementById(id);
    wrap.classList.remove('chart', 'chart-tall');
    wrap.innerHTML = '<div class="empty">' + msg + '</div>';
  }

  // ---- churn chart
  if (DATA.churn.length) {
    const ch = new Chart(document.getElementById('chart-churn'), {
      type: 'bar',
      data: {
        labels: DATA.churn.map(d => shortPath(d.file, 48)),
        datasets: [{
          data: DATA.churn.map(d => d.count),
          backgroundColor: theme.accent,
          borderRadius: 3,
          borderSkipped: false,
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        onClick: (e, elems) => {
          if (elems.length) window.open(ghBase + '/blob/HEAD/' + DATA.churn[elems[0].index].file, '_blank');
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items) => DATA.churn[items[0].dataIndex].file,
              label: (item) => item.raw + ' commits (click to open)',
            }
          }
        },
        scales: {
          x: { grid: { color: gridColor }, ticks: { precision: 0 }, border: { color: gridColor } },
          y: { grid: { display: false }, border: { display: false } }
        }
      }
    });
    activeCharts.push(ch);
    if (DATA.churnCapped) {
      const wrap = document.getElementById('wrap-churn');
      const note = document.createElement('div');
      note.className = 'capped-note';
      note.textContent = 'Showing top 20 from the ' + MAX_DETAIL_FETCHES + ' most recent commits (capped to stay within API limits).';
      wrap.parentNode.appendChild(note);
    }
  } else {
    mountEmpty('wrap-churn', 'No commits in this window.');
  }

  // ---- contributors chart
  if (DATA.contributors.length) {
    const top = DATA.contributors.slice(0, 20);
    const ch = new Chart(document.getElementById('chart-contrib'), {
      type: 'bar',
      data: {
        labels: top.map(d => d.name),
        datasets: [{
          data: top.map(d => d.commits),
          backgroundColor: theme.accent2,
          borderRadius: 3,
          borderSkipped: false,
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (item) => item.raw + ' commits' } }
        },
        scales: {
          x: { grid: { color: gridColor }, ticks: { precision: 0 }, border: { color: gridColor } },
          y: { grid: { display: false }, border: { display: false } }
        }
      }
    });
    activeCharts.push(ch);
  } else {
    mountEmpty('wrap-contrib', 'No contributors found.');
  }

  // ---- bug cluster chart
  if (DATA.bug_clusters.length) {
    const ch = new Chart(document.getElementById('chart-bugs'), {
      type: 'bar',
      data: {
        labels: DATA.bug_clusters.map(d => shortPath(d.file, 48)),
        datasets: [{
          data: DATA.bug_clusters.map(d => d.count),
          backgroundColor: theme.danger,
          borderRadius: 3,
          borderSkipped: false,
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        onClick: (e, elems) => {
          if (elems.length) window.open(ghBase + '/blob/HEAD/' + DATA.bug_clusters[elems[0].index].file, '_blank');
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items) => DATA.bug_clusters[items[0].dataIndex].file,
              label: (item) => item.raw + ' bug-related commits (click to open)',
            }
          }
        },
        scales: {
          x: { grid: { color: gridColor }, ticks: { precision: 0 }, border: { color: gridColor } },
          y: { grid: { display: false }, border: { display: false } }
        }
      }
    });
    activeCharts.push(ch);
    if (DATA.bugsCapped) {
      const wrap = document.getElementById('wrap-bugs');
      const note = document.createElement('div');
      note.className = 'capped-note';
      note.textContent = 'Showing top 20 from the ' + MAX_DETAIL_FETCHES + ' most recent bug commits (capped).';
      wrap.parentNode.appendChild(note);
    }
  } else {
    mountEmpty('wrap-bugs', 'No bug/fix/broken commits found.');
  }

  // ---- momentum chart
  if (DATA.momentum.length) {
    const ch = new Chart(document.getElementById('chart-momentum'), {
      type: 'line',
      data: {
        labels: DATA.momentum.map(d => d.month),
        datasets: [{
          data: DATA.momentum.map(d => d.count),
          borderColor: theme.accent,
          backgroundColor: theme.fillAccent,
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          pointHoverRadius: 5,
          borderWidth: 2,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items) => items[0].label,
              label: (item) => item.raw + ' commits',
            }
          }
        },
        scales: {
          x: { grid: { color: gridColor }, border: { color: gridColor }, ticks: { maxRotation: 0, autoSkipPadding: 20 } },
          y: { grid: { color: gridColor }, border: { color: gridColor }, beginAtZero: true, ticks: { precision: 0 } }
        }
      }
    });
    activeCharts.push(ch);
  } else {
    mountEmpty('wrap-momentum', 'No commit activity data.');
  }

  // ---- firefighting table
  const ffState = { search: '', kind: 'all', sort: 'kind', dir: 1 };
  const searchEl = document.getElementById('ff-search');
  const bodyEl = document.getElementById('ff-body');
  const countEl = document.getElementById('ff-count');

  function renderFF() {
    let rows = DATA.firefighting.slice();
    if (ffState.kind !== 'all') rows = rows.filter(r => r.kind === ffState.kind);
    if (ffState.search) {
      const q = ffState.search.toLowerCase();
      rows = rows.filter(r => r.subject.toLowerCase().includes(q) || r.hash.toLowerCase().includes(q));
    }
    rows.sort((a, b) => {
      const va = a[ffState.sort], vb = b[ffState.sort];
      if (va < vb) return -ffState.dir;
      if (va > vb) return ffState.dir;
      return 0;
    });
    countEl.textContent = rows.length + ' / ' + DATA.firefighting.length;
    document.querySelectorAll('.ff-table th').forEach(th => {
      th.classList.toggle('sorted', th.dataset.sort === ffState.sort);
      const arrow = th.querySelector('.arrow');
      if (th.dataset.sort === ffState.sort) arrow.textContent = ffState.dir === 1 ? '\u25B2' : '\u25BC';
      else arrow.textContent = '';
    });
    if (!rows.length) {
      bodyEl.innerHTML = '<tr><td colspan="3" class="empty" style="padding:24px">No matches.</td></tr>';
      return;
    }
    bodyEl.innerHTML = rows.map(r => (
      '<tr>' +
        '<td><span class="kind kind-' + r.kind + '">' + r.kind + '</span></td>' +
        '<td class="hash" data-hash="' + r.hash + '" title="click to open on GitHub">' +
          '<a href="' + ghBase + '/commit/' + r.hash + '" target="_blank" rel="noopener" style="color:inherit;text-decoration:none">' + escapeHtml(r.hash) + '</a></td>' +
        '<td>' + escapeHtml(r.subject) + '</td>' +
      '</tr>'
    )).join('');
  }

  // Remove old listeners by cloning (handles re-renders)
  const newSearch = searchEl.cloneNode(true);
  searchEl.parentNode.replaceChild(newSearch, searchEl);
  newSearch.addEventListener('input', (e) => { ffState.search = e.target.value; renderFF(); });

  document.querySelectorAll('.ff-chip').forEach(chip => {
    const fresh = chip.cloneNode(true);
    chip.parentNode.replaceChild(fresh, chip);
    fresh.addEventListener('click', () => {
      document.querySelectorAll('.ff-chip').forEach(c => c.classList.remove('active'));
      fresh.classList.add('active');
      ffState.kind = fresh.dataset.kind;
      renderFF();
    });
  });

  document.querySelectorAll('.ff-table th').forEach(th => {
    const fresh = th.cloneNode(true);
    th.parentNode.replaceChild(fresh, th);
    fresh.addEventListener('click', () => {
      const key = fresh.dataset.sort;
      if (ffState.sort === key) ffState.dir *= -1;
      else { ffState.sort = key; ffState.dir = 1; }
      renderFF();
    });
  });

  renderFF();
}
