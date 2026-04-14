// ============================================================
//  GITHUB API FETCH LAYER
// ============================================================

const API = 'https://api.github.com';
export const MAX_DETAIL_FETCHES = 500;
const POOL_CONCURRENCY = 6;

function headers(token) {
  const h = { Accept: 'application/vnd.github+json' };
  if (token) h.Authorization = 'Bearer ' + token;
  return h;
}

// Core fetch with rate-limit awareness and 202 retry
async function ghFetch(url, token, signal, retries202 = 5) {
  for (let attempt = 0; attempt <= retries202; attempt++) {
    const res = await fetch(url, { headers: headers(token), signal });
    if (res.status === 202 && attempt < retries202) {
      await sleep(2000, signal);
      continue;
    }
    if (res.status === 401) throw new GHError('Invalid or expired token. Check your PAT.', 401);
    if (res.status === 403) {
      const remaining = res.headers.get('X-RateLimit-Remaining');
      if (remaining === '0') {
        const reset = Number(res.headers.get('X-RateLimit-Reset')) * 1000;
        const wait = Math.max(0, reset - Date.now()) + 1000;
        throw new GHError(`Rate limited. Resets in ${Math.ceil(wait / 1000)}s.`, 403);
      }
      throw new GHError('Access denied. The repo may be private — add a PAT with contents:read.', 403);
    }
    if (res.status === 404) throw new GHError('Repository not found. Check the owner/repo or token access.', 404);
    if (res.status === 422) throw new GHError('Validation failed — GitHub may not support this query.', 422);
    if (!res.ok) throw new GHError(`GitHub API error: ${res.status}`, res.status);
    return { data: await res.json(), headers: res.headers };
  }
  throw new GHError('GitHub is still computing stats — try again in a moment.', 202);
}

class GHError extends Error {
  constructor(msg, status) { super(msg); this.status = status; }
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    if (signal) signal.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
  });
}

// Parse Link header for pagination
function nextPageUrl(headers) {
  const link = headers.get('Link');
  if (!link) return null;
  const match = link.match(/<([^>]+)>;\s*rel="next"/);
  return match ? match[1] : null;
}

// Paginate a list endpoint, return all items
async function paginate(url, token, signal, maxPages = 100) {
  const all = [];
  let page = url;
  let count = 0;
  while (page && count < maxPages) {
    const { data, headers: h } = await ghFetch(page, token, signal);
    if (Array.isArray(data)) all.push(...data);
    else if (data.items) all.push(...data.items); // search endpoint
    page = nextPageUrl(h);
    count++;
  }
  return all;
}

// Concurrency-limited async worker pool
async function pool(tasks, concurrency, signal, onDone) {
  const results = new Array(tasks.length);
  let idx = 0;
  async function worker() {
    while (idx < tasks.length) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const i = idx++;
      results[i] = await tasks[i]();
      if (onDone) onDone(i, results[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()));
  return results;
}

// Shared cache: sha -> filenames[]
const filesCache = new Map();

async function fetchCommitFiles(owner, repo, sha, token, signal) {
  if (filesCache.has(sha)) return filesCache.get(sha);
  const { data } = await ghFetch(`${API}/repos/${owner}/${repo}/commits/${sha}`, token, signal);
  const files = (data.files || []).map(f => f.filename);
  filesCache.set(sha, files);
  return files;
}

// ---- Per-panel fetchers ----

async function fetchContributors(owner, repo, token, signal) {
  const { data } = await ghFetch(`${API}/repos/${owner}/${repo}/stats/contributors`, token, signal);
  if (!Array.isArray(data)) return [];
  return data
    .map(c => ({ name: c.author?.login || 'unknown', commits: c.total }))
    .sort((a, b) => b.commits - a.commits);
}

async function fetchMomentum(owner, repo, token, signal) {
  const { data } = await ghFetch(`${API}/repos/${owner}/${repo}/stats/commit_activity`, token, signal);
  if (!Array.isArray(data)) return [];
  // data is 52 objects { week: unixSec, total: N, days: [S,M,T,W,T,F,S] }
  // Aggregate into months
  const byMonth = {};
  for (const w of data) {
    const d = new Date(w.week * 1000);
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    byMonth[key] = (byMonth[key] || 0) + w.total;
  }
  return Object.entries(byMonth)
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

async function fetchFirefighting(owner, repo, token, signal) {
  const q = encodeURIComponent(`repo:${owner}/${repo} revert OR hotfix OR emergency OR rollback`);
  const url = `${API}/search/commits?q=${q}&per_page=100&sort=committer-date&order=desc`;
  const items = await paginate(url, token, signal, 10);
  const results = [];
  for (const item of items) {
    const msg = (item.commit?.message || '').toLowerCase();
    const kind = msg.includes('revert') ? 'revert'
      : msg.includes('hotfix') ? 'hotfix'
      : msg.includes('emergency') ? 'emergency'
      : msg.includes('rollback') ? 'rollback'
      : null;
    if (kind) {
      results.push({
        hash: (item.sha || '').slice(0, 7),
        subject: (item.commit?.message || '').split('\n')[0],
        kind,
      });
    }
  }
  return results;
}

async function fetchChurnSHAs(owner, repo, token, signal, since) {
  const sinceISO = new Date(Date.now() - parseSinceMs(since)).toISOString();
  const url = `${API}/repos/${owner}/${repo}/commits?since=${sinceISO}&per_page=100`;
  return paginate(url, token, signal);
}

async function fetchBugSHAs(owner, repo, token, signal) {
  const q = encodeURIComponent(`repo:${owner}/${repo} fix OR bug OR broken`);
  const url = `${API}/search/commits?q=${q}&per_page=100&sort=committer-date&order=desc`;
  return paginate(url, token, signal, 10);
}

function parseSinceMs(since) {
  // rough parse of "1 year ago" style strings
  const m = since.match(/(\d+)\s*(year|month|week|day)/i);
  if (!m) return 365 * 86400000;
  const n = parseInt(m[1], 10);
  switch (m[2].toLowerCase()) {
    case 'year': return n * 365 * 86400000;
    case 'month': return n * 30 * 86400000;
    case 'week': return n * 7 * 86400000;
    case 'day': return n * 86400000;
    default: return 365 * 86400000;
  }
}

function topFiles(allFiles, limit) {
  const counts = {};
  for (const files of allFiles) {
    for (const f of files) {
      counts[f] = (counts[f] || 0) + 1;
    }
  }
  return Object.entries(counts)
    .map(([file, count]) => ({ file, count }))
    .sort((a, b) => b.count - a.count || a.file.localeCompare(b.file))
    .slice(0, limit);
}

// ---- Orchestrator ----

export async function fetchReport(owner, repo, token, signal, onProgress) {
  filesCache.clear();
  const since = '1 year ago';
  let totalDetailNeeded = 0;
  let detailDone = 0;
  let churnCapped = false;
  let bugsCapped = false;

  function updateProgress() {
    if (totalDetailNeeded > 0) {
      onProgress({ pct: Math.round((detailDone / totalDetailNeeded) * 100), detailDone, totalDetailNeeded });
    }
  }

  // Phase 1: parallel fast fetches + churn SHA listing
  const setStatus = onProgress.setStatus || (() => {});
  setStatus('contributors', 'fetching');
  setStatus('momentum', 'fetching');
  setStatus('firefighting', 'fetching');
  setStatus('churn', 'listing commits');
  setStatus('bugs', 'waiting');

  const [contributors, momentum, firefighting, churnCommits] = await Promise.all([
    fetchContributors(owner, repo, token, signal).then(r => { setStatus('contributors', 'done'); return r; }),
    fetchMomentum(owner, repo, token, signal).then(r => { setStatus('momentum', 'done'); return r; }),
    fetchFirefighting(owner, repo, token, signal).then(r => { setStatus('firefighting', 'done'); return r; }),
    fetchChurnSHAs(owner, repo, token, signal, since).then(r => { setStatus('churn', `${r.length} commits`); return r; }),
  ]);

  // Phase 2: churn detail fetches
  let churnSHAs = churnCommits.map(c => c.sha);
  if (churnSHAs.length > MAX_DETAIL_FETCHES) {
    churnCapped = true;
    churnSHAs = churnSHAs.slice(0, MAX_DETAIL_FETCHES);
  }

  // Phase 2b: bug SHA listing in parallel
  setStatus('bugs', 'searching');
  const bugCommitsPromise = fetchBugSHAs(owner, repo, token, signal).then(r => { setStatus('bugs', `${r.length} commits`); return r; });

  totalDetailNeeded = churnSHAs.length; // will grow when bugs resolve
  setStatus('churn', `0/${churnSHAs.length}`);

  const churnFileLists = await pool(
    churnSHAs.map(sha => () => fetchCommitFiles(owner, repo, sha, token, signal)),
    POOL_CONCURRENCY,
    signal,
    () => { detailDone++; setStatus('churn', `${detailDone}/${churnSHAs.length}`); updateProgress(); }
  );
  setStatus('churn', 'done');

  // Phase 3: bug detail fetches (using cache from churn)
  const bugCommits = await bugCommitsPromise;
  let bugSHAs = bugCommits.map(c => c.sha);
  if (bugSHAs.length > MAX_DETAIL_FETCHES) {
    bugsCapped = true;
    bugSHAs = bugSHAs.slice(0, MAX_DETAIL_FETCHES);
  }
  // Subtract already-cached
  const uncachedBugSHAs = bugSHAs.filter(sha => !filesCache.has(sha));
  totalDetailNeeded += uncachedBugSHAs.length;
  setStatus('bugs', `0/${bugSHAs.length}`);

  let bugDetailDone = 0;
  await pool(
    uncachedBugSHAs.map(sha => () => fetchCommitFiles(owner, repo, sha, token, signal)),
    POOL_CONCURRENCY,
    signal,
    () => { detailDone++; bugDetailDone++; setStatus('bugs', `${bugDetailDone + (bugSHAs.length - uncachedBugSHAs.length)}/${bugSHAs.length}`); updateProgress(); }
  );
  setStatus('bugs', 'done');

  // Build the same Report shape as the CLI
  const churn = topFiles(churnFileLists, 20);
  const bugFileLists = bugSHAs.map(sha => filesCache.get(sha) || []);
  const bug_clusters = topFiles(bugFileLists, 20);

  const repoUrl = `https://github.com/${owner}/${repo}`;
  return {
    repo: repoUrl,
    repo_name: repo,
    owner,
    since: 'last 52 weeks',
    generated_at: Math.floor(Date.now() / 1000),
    total_commits: churnCommits.length,
    churn,
    churnCapped,
    contributors,
    bug_clusters,
    bugsCapped,
    momentum,
    firefighting,
  };
}
