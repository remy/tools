import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'https://esm.sh/react@18.2.0';
import { createRoot } from 'https://esm.sh/react-dom@18.2.0/client';
import htm from 'https://esm.sh/htm@3.1.1';

const html = htm.bind(React.createElement);

const STORAGE_KEY = 'org-notifications-config';
const DISMISSED_KEY = 'org-notifications-dismissed-days';
const CACHE_DB = 'org-notifications-cache';
const CACHE_STORE = 'supplemental-results';
const CACHE_TTL_MS = 60 * 60 * 1000;
const AUTO_REFRESH_TTL_MS = 2 * 60 * 60 * 1000;

const defaultConfig = {
  org: '',
  token: '',
};

const reasonLabels = {
  assign: 'Assigned',
  review_requested: 'Review requested',
  mention: 'Mentioned',
  comment: 'Comment',
  subscribed: 'Subscribed',
  author: 'Author',
  manual: 'Manual',
  team_mention: 'Team mention',
  state_change: 'State change',
};

const typeLabels = {
  Issue: 'Issue',
  PullRequest: 'Pull request',
  Commit: 'Commit',
  Discussion: 'Discussion',
};

const isMergedOrClosedPr = (item) =>
  Boolean(
    item?.pull_request && (item.state === 'closed' || item.pull_request.merged_at)
  );

const toSourceClass = (source) =>
  `source-pill source-${source.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

const toDisplayDate = (isoString) => {
  const date = new Date(isoString);
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const toDayKey = (isoString) => {
  const date = new Date(isoString);
  return date.toISOString().slice(0, 10);
};

const toHtmlUrl = (notification) => {
  const apiUrl =
    notification.subject?.latest_comment_url || notification.subject?.url;
  if (!apiUrl) {
    return notification.repository?.html_url;
  }

  const issueMatch = apiUrl.match(/\/repos\/([^/]+)\/([^/]+)\/issues\/(\d+)/);
  if (issueMatch) {
    return `https://github.com/${issueMatch[1]}/${issueMatch[2]}/issues/${issueMatch[3]}`;
  }

  const prMatch = apiUrl.match(/\/repos\/([^/]+)\/([^/]+)\/pulls\/(\d+)/);
  if (prMatch) {
    return `https://github.com/${prMatch[1]}/${prMatch[2]}/pull/${prMatch[3]}`;
  }

  const discussionMatch = apiUrl.match(
    /\/repos\/([^/]+)\/([^/]+)\/discussions\/(\d+)/
  );
  if (discussionMatch) {
    return `https://github.com/${discussionMatch[1]}/${discussionMatch[2]}/discussions/${discussionMatch[3]}`;
  }

  return notification.repository?.html_url;
};

const repoFromApiUrl = (apiUrl) => {
  if (!apiUrl) return '';
  const match = apiUrl.match(/\/repos\/([^/]+)\/([^/]+)/);
  return match ? `${match[1]}/${match[2]}` : '';
};

const groupNotifications = (items) => {
  const grouped = new Map();
  items.forEach((item) => {
    const key = toDayKey(
      item.updated_at || item.last_read_at || item.created_at
    );
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push(item);
  });

  return Array.from(grouped.entries())
    .map(([key, list]) => ({
      key,
      dateLabel: toDisplayDate(key),
      items: list,
    }))
    .sort((a, b) => (a.key < b.key ? 1 : -1));
};

const groupItemsByUrl = (items) => {
  const grouped = new Map();
  items.forEach((item) => {
    const url = item.html_url || toHtmlUrl(item) || '';
    const key = url || `item-${item.id}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        key,
        url,
        item,
        sources: new Set(),
      });
    }
    grouped.get(key).sources.add(item._source || 'Activity');
  });
  return Array.from(grouped.values());
};

const loadConfig = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...defaultConfig, ...JSON.parse(raw) } : defaultConfig;
  } catch {
    return defaultConfig;
  }
};

const saveConfig = (config) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
};

const loadDismissed = () => {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const saveDismissed = (keys) => {
  localStorage.setItem(DISMISSED_KEY, JSON.stringify(keys));
};

const openCacheDb = () =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(CACHE_DB, 1);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CACHE_STORE)) {
        db.createObjectStore(CACHE_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
  });

const readCache = async (key) => {
  const db = await openCacheDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CACHE_STORE, 'readonly');
    const store = tx.objectStore(CACHE_STORE);
    const request = store.get(key);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
};

const writeCache = async (key, value) => {
  const db = await openCacheDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CACHE_STORE, 'readwrite');
    const store = tx.objectStore(CACHE_STORE);
    const request = store.put(value, key);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
};

const App = () => {
  const [config, setConfig] = useState(defaultConfig);
  const [status, setStatus] = useState('Ready');
  const [loading, setLoading] = useState(false);
  const [dismissedDays, setDismissedDays] = useState([]);
  const [showDismissed, setShowDismissed] = useState(false);
  const [showMergedClosedPrs, setShowMergedClosedPrs] = useState(false);
  const [showConfig, setShowConfig] = useState(true);
  const [debug, setDebug] = useState([]);
  const [supplemental, setSupplemental] = useState([]);
  const autoRefreshAttempted = useRef(false);

  useEffect(() => {
    const storedConfig = loadConfig();
    setConfig(storedConfig);
    setDismissedDays(loadDismissed());
    if (storedConfig.org && storedConfig.token) {
      setShowConfig(false);
    }
  }, []);

  useEffect(() => {
    autoRefreshAttempted.current = false;
  }, [config.org]);

  useEffect(() => {
    const loadCached = async () => {
      if (!config.org) return;
      try {
        const key = config.org.toLowerCase();
        const cached = await readCache(key);
        if (cached && cached.items) {
          setSupplemental(cached.items);
          const age = Date.now() - cached.cachedAt;
          const ageLabel = age > CACHE_TTL_MS ? 'stale cache' : 'cache';
          setStatus(`Loaded ${cached.items.length} ${ageLabel} results.`);
          if (
            !autoRefreshAttempted.current &&
            age > AUTO_REFRESH_TTL_MS &&
            config.org &&
            config.token &&
            !loading
          ) {
            autoRefreshAttempted.current = true;
            fetchNotifications();
          }
        }
      } catch (error) {
        setDebug((entries) => [
          ...entries,
          `Cache read failed: ${error.message}`,
        ]);
      }
    };
    loadCached();
  }, [config.org, config.token, loading]);

  const combinedItems = useMemo(
    () =>
      supplemental.flatMap((result) =>
        (result.items || []).map((item) => ({
          ...item,
          _source: result.label,
        }))
      ),
    [supplemental]
  );

  const combinedGroups = useMemo(
    () => groupNotifications(combinedItems),
    [combinedItems]
  );

  const listedGroups = useMemo(
    () =>
      showDismissed
        ? combinedGroups
        : combinedGroups.filter((group) => !dismissedDays.includes(group.key)),
    [combinedGroups, dismissedDays, showDismissed]
  );

  const totalOpenItems = useMemo(
    () =>
      listedGroups.reduce((total, group) => {
        const groupedItems = groupItemsByUrl(group.items);
        const openItems = groupedItems.filter(
          (entry) => !isMergedOrClosedPr(entry.item)
        );
        return total + openItems.length;
      }, 0),
    [listedGroups]
  );

  useEffect(() => {
    const orgLabel = config.org || 'org';
    document.title = `[${totalOpenItems}] ${orgLabel} github issues`;
  }, [config.org, totalOpenItems]);

  const fetchNotifications = async () => {
    if (!config.org || !config.token) {
      setStatus('Add org + token to load notifications.');
      return;
    }

    setLoading(true);
    setStatus('Loading from GitHub...');
    setDebug([]);
    setSupplemental([]);

    try {
      const since = new Date(
        Date.now() - 7 * 24 * 60 * 60 * 1000
      ).toISOString();
      const rateLines = [];

      const userResponse = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `token ${config.token}`,
          Accept: 'application/vnd.github+json',
        },
      });
      if (!userResponse.ok) {
        throw new Error(`GitHub user error ${userResponse.status}`);
      }
      const userData = await userResponse.json();
      const username = userData.login;
      setDebug((entries) => [...entries, `Authenticated as: ${username}`]);

      const sinceDate = since.slice(0, 10);
      const searches = [
        {
          label: 'Assigned to you',
          query: `org:${config.org} assignee:${username} updated:>=${sinceDate}`,
        },
        {
          label: 'Review requested',
          query: `org:${config.org} review-requested:${username} updated:>=${sinceDate}`,
        },
        {
          label: 'Mentioned',
          query: `org:${config.org} mentions:${username} updated:>=${sinceDate}`,
        },
      ];

      const supplementalResults = [];
      for (const search of searches) {
        const searchUrl = `https://api.github.com/search/issues?q=${encodeURIComponent(
          search.query
        )}&per_page=20`;
        const searchResponse = await fetch(searchUrl, {
          headers: {
            Authorization: `token ${config.token}`,
            Accept: 'application/vnd.github+json',
          },
        });
        const rateRemaining = searchResponse.headers.get(
          'x-ratelimit-remaining'
        );
        const rateReset = searchResponse.headers.get('x-ratelimit-reset');
        rateLines.push(
          rateRemaining
            ? `Rate limit remaining: ${rateRemaining}${
                rateReset
                  ? ` (reset ${new Date(
                      Number(rateReset) * 1000
                    ).toLocaleTimeString()})`
                  : ''
              }`
            : 'Rate limit header not present'
        );
        if (!searchResponse.ok) {
          setDebug((entries) => [
            ...entries,
            `Search failed (${search.label}): ${searchResponse.status}`,
          ]);
          continue;
        }
        const searchData = await searchResponse.json();
        setDebug((entries) => [
          ...entries,
          `Search ${search.label}: ${searchData.total_count} results`,
        ]);
        supplementalResults.push({
          label: search.label,
          query: search.query,
          total: searchData.total_count,
          items: searchData.items || [],
        });
      }

      if (rateLines.length > 0) {
        setDebug((entries) => [...entries, ...rateLines]);
      }

      setSupplemental(supplementalResults);
      try {
        const key = config.org.toLowerCase();
        await writeCache(key, {
          cachedAt: Date.now(),
          username,
          sinceDate,
          items: supplementalResults,
        });
      } catch (error) {
        setDebug((entries) => [
          ...entries,
          `Cache write failed: ${error.message}`,
        ]);
      }
      setStatus('Results loaded.');
    } catch (error) {
      setStatus(`Failed to load notifications: ${error.message}`);
      setDebug((entries) => [...entries, `Error: ${error.message}`]);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = () => {
    saveConfig(config);
    setStatus('Saved locally.');
  };

  const dismissDay = (key) => {
    const next = Array.from(new Set([...dismissedDays, key]));
    setDismissedDays(next);
    saveDismissed(next);
  };

  const restoreAll = () => {
    setDismissedDays([]);
    saveDismissed([]);
  };

  return html`
    <div>
      <header className="header">
        <h1>Org Notifications</h1>
        <p>
          A glanceable feed of GitHub activity scoped to one organization. Store
          your settings in the browser, refresh when you want, and dismiss days
          you are done with.
        </p>
      </header>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Configuration</h2>
            <div className="status">Last 7 days • ${config.org || 'org'}</div>
          </div>
          <div className="actions">
            <button
              className="secondary"
              onClick=${fetchNotifications}
              disabled=${loading}
            >
              ${loading ? 'Loading...' : 'Refresh'}
            </button>
            <button
              className="secondary"
              onClick=${() => setShowConfig((value) => !value)}
            >
              ${showConfig ? 'Hide' : 'Edit'}
            </button>
          </div>
        </div>
        ${showConfig &&
        html`
          <div className="panel-body">
            <div className="config-grid">
              <div>
                <label htmlFor="org">Organization</label>
                <input
                  id="org"
                  type="text"
                  value=${config.org}
                  onChange=${(event) =>
                    setConfig({ ...config, org: event.target.value })}
                  placeholder="github-org"
                />
              </div>
              <div>
                <label htmlFor="token">Personal Access Token</label>
                <input
                  id="token"
                  type="password"
                  value=${config.token}
                  onChange=${(event) =>
                    setConfig({ ...config, token: event.target.value })}
                  placeholder="ghp_..."
                />
              </div>
            </div>
            <div className="actions">
              <button onClick=${handleSave}>Save config</button>
            </div>
            <div className="status">${status}</div>
            <div className="status">
              Token stays in localStorage on this browser.
            </div>
            ${debug.length > 0 &&
            html`
              <div className="status">
                ${debug.map((line) => html`<div>${line}</div>`)}
              </div>
            `}
          </div>
        `}
      </section>

      <section className="panel">
        <div className="toggle-row">
          <input
            id="show-dismissed"
            type="checkbox"
            checked=${showDismissed}
            onChange=${(event) => setShowDismissed(event.target.checked)}
          />
          <label htmlFor="show-dismissed">Show dismissed days</label>
          <input
            id="show-merged-closed"
            type="checkbox"
            checked=${showMergedClosedPrs}
            onChange=${(event) => setShowMergedClosedPrs(event.target.checked)}
          />
          <label htmlFor="show-merged-closed">Show merged/closed PRs</label>
          ${dismissedDays.length > 0 &&
          html`
            <button className="secondary" onClick=${restoreAll}>
              Restore all
            </button>
          `}
        </div>

        ${combinedGroups.length === 0
          ? html`
              <div className="empty">
                <p>No items in the last 7 days.</p>
              </div>
            `
          : combinedGroups.map((group) => {
              const groupedItems = groupItemsByUrl(group.items);
              const visibleItems = groupedItems.filter(
                (entry) =>
                  showMergedClosedPrs || !isMergedOrClosedPr(entry.item)
              );
              return html`
                ${!showDismissed && dismissedDays.includes(group.key)
                  ? null
                  : visibleItems.length === 0
                    ? null
                    : html`
                        <div className="day-card" key=${group.key}>
                          <div className="day-header">
                            <h2>${group.dateLabel}</h2>
                            <div className="actions">
                              <span className="meta-pill"
                                >${visibleItems.length} items</span
                              >
                              ${!dismissedDays.includes(group.key) &&
                              html`
                                <button
                                  className="secondary"
                                  onClick=${() => dismissDay(group.key)}
                                >
                                  Dismiss day
                                </button>
                              `}
                            </div>
                          </div>
                          <div className="notification-list">
                            ${visibleItems.map((entry) => {
                              const item = entry.item;
                              const repoName = repoFromApiUrl(
                                item.repository_url
                              );
                              const author = item.user?.login
                                ? `Opened by ${item.user.login}`
                                : 'Opened';
                              const sources = Array.from(entry.sources);
                              const statusLabel = isMergedOrClosedPr(item)
                                ? item.pull_request?.merged_at
                                  ? '[merged] '
                                  : '[closed] '
                                : '';
                              return html`
                                <div
                                  className="notification-group"
                                  key=${entry.key}
                                >
                                  <div>
                                    <a
                                      className="title-link"
                                      href=${entry.url}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      ${statusLabel}${item.title}
                                    </a>
                                  </div>
                                  <small className="notification-meta"
                                    >${author} · ${repoName}</small
                                  >
                                  <div className="notification-sources">
                                    ${sources.map(
                                      (source) =>
                                        html`<span className=${toSourceClass(
                                          source
                                        )}>
                                          ${source}
                                        </span>`
                                    )}
                                  </div>
                                </div>
                              `;
                            })}
                          </div>
                        </div>
                      `}
              `;
            })}
      </section>
    </div>
  `;
};

const root = createRoot(document.getElementById('root'));
root.render(html`<${App} />`);
