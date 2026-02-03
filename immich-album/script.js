const $ = (s, c = document) => c.querySelector(s);

let albums = [];
let selected = new Set();
let currentRenameId = null;

function showStatus(msg, type) {
  const el = $('#status');
  el.textContent = msg;
  el.className = `status ${type}`;
  el.classList.remove('hidden');
}

function hideStatus() {
  $('#status').classList.add('hidden');
}

function getConfig() {
  const serverUrl = document
    .getElementById('serverUrl')
    .value.replace(/\/$/, '');
  const apiKey = $('#apiKey').value;
  const useProxy = $('#useProxy').checked;
  return { serverUrl, apiKey, useProxy };
}

async function apiCall(endpoint, options = {}) {
  const { serverUrl, apiKey, useProxy } = getConfig();

  if (!serverUrl || !apiKey) {
    throw new Error('Server URL and API key are required');
  }

  let url, headers;

  if (useProxy) {
    // Use proxy mode - call through local server
    url = endpoint;
    headers = {
      'x-api-key': apiKey,
      'x-immich-url': serverUrl,
      ...options.headers,
    };
  } else {
    // Direct mode - call Immich server directly
    url = `${serverUrl}${endpoint}`;
    headers = {
      'x-api-key': apiKey,
      ...options.headers,
    };
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  return response;
}

async function loadAlbums() {
  const { serverUrl, apiKey } = getConfig();
  if (!serverUrl || !apiKey) {
    showStatus('Please enter server URL and API key', 'error');
    return;
  }

  showStatus('Loading albums...', 'info');
  try {
    const res = await apiCall('/api/albums');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    albums = await res.json();
    albums.sort((a, b) => naturalSort(a.albumName, b.albumName));
    selected.clear();
    hideStatus();
    $('#albumsSection').classList.remove('hidden');
    renderAlbums();
  } catch (e) {
    showStatus(`Failed to load albums: ${e.message}`, 'error');
  }
}

function naturalSort(a, b) {
  const collator = new Intl.Collator(undefined, {
    numeric: true,
    sensitivity: 'base',
  });
  return collator.compare(a.toLowerCase(), b.toLowerCase());
}

function parseAssetCountFilter(filterValue) {
  // Check if filter starts with ?
  if (!filterValue.startsWith('?')) {
    return null;
  }

  const query = filterValue.substring(1).trim();

  // Match: >= n or <=n or > n or < n
  const comparisonMatch = query.match(/^(>=?|<=?)\s*(\d+)$/);
  if (comparisonMatch) {
    const operator = comparisonMatch[1];
    const value = parseInt(comparisonMatch[2], 10);
    return (album) => {
      switch (operator) {
        case '>':
          return album.assetCount > value;
        case '>=':
          return album.assetCount >= value;
        case '<':
          return album.assetCount < value;
        case '<=':
          return album.assetCount <= value;
        default:
          return false;
      }
    };
  }

  // Match: n - m or n-m (range)
  const rangeMatch = query.match(/^(\d+)\s*-\s*(\d+)$/);
  if (rangeMatch) {
    const min = parseInt(rangeMatch[1], 10);
    const max = parseInt(rangeMatch[2], 10);
    return (album) => album.assetCount >= min && album.assetCount <= max;
  }

  // Match: exact number
  const exactMatch = query.match(/^(\d+)$/);
  if (exactMatch) {
    const value = parseInt(exactMatch[1], 10);
    return (album) => album.assetCount === value;
  }

  // Invalid syntax
  return null;
}

function renderAlbums() {
  const filterValue = $('#filter').value;
  let filtered;

  // Check for asset count filter
  const assetCountFilter = parseAssetCountFilter(filterValue);
  if (assetCountFilter) {
    filtered = albums.filter(assetCountFilter);
  } else {
    // Try name-based filtering (regex or substring)
    try {
      // Try to use as regex
      const regex = new RegExp(filterValue, 'i');
      filtered = albums.filter((a) => regex.test(a.albumName));
    } catch (e) {
      // If invalid regex, fall back to case-insensitive substring match
      const lowerFilter = filterValue.toLowerCase();
      filtered = albums.filter((a) =>
        a.albumName.toLowerCase().includes(lowerFilter)
      );
    }
  }

  const list = $('#albumList');
  list.innerHTML = filtered
    .map(
      (a) => `
    <div class="album-item">
      <label class="album-name"><input type="checkbox" ${
        selected.has(a.id) ? 'checked' : ''
      } onchange="toggleSelect('${a.id}')">
      ${escapeHtml(a.albumName)}</label>
      <span class="album-count">${a.assetCount} assets</span>
      <div class="album-actions">
        <button class="btn-icon" onclick="visitAlbum('${
          a.id
        }')" title="Visit album">🔗</button>
        <button class="btn-icon" onclick="renameAlbum('${
          a.id
        }')" title="Rename album">✏️</button>
      </div>
    </div>
  `
    )
    .join('');

  // Update album count display
  const countEl = $('#albumCount');
  if (filtered.length === albums.length) {
    countEl.textContent = `${albums.length} album${
      albums.length !== 1 ? 's' : ''
    }`;
  } else {
    countEl.textContent = `Showing ${filtered.length} of ${
      albums.length
    } album${albums.length !== 1 ? 's' : ''}`;
  }

  updateSelectedCount();
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeJs(str) {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'");
}

function toggleSelect(id) {
  if (selected.has(id)) selected.delete(id);
  else selected.add(id);
  updateSelectedCount();
}

function visitAlbum(id) {
  const { serverUrl } = getConfig();
  if (!serverUrl) {
    showStatus('Server URL not configured', 'error');
    return;
  }
  const albumUrl = `${serverUrl}/albums/${id}`;
  window.open(albumUrl, '_blank');
}

function renameAlbum(id) {
  const album = albums.find((a) => a.id === id);
  if (!album) return;

  currentRenameId = id;
  $('#renameInput').value = album.albumName;
  $('#renameModal').classList.remove('hidden');

  // Focus input and select all text
  setTimeout(() => {
    const input = $('#renameInput');
    input.focus();
    input.select();
  }, 100);
}

function closeRenameModal() {
  $('#renameModal').classList.add('hidden');
  currentRenameId = null;
}

async function executeRename() {
  if (!currentRenameId) return;

  // Save ID to local variable before closing modal
  const albumId = currentRenameId;
  const album = albums.find((a) => a.id === albumId);
  if (!album) return;

  const newName = $('#renameInput').value.trim();
  if (!newName || newName === album.albumName) {
    closeRenameModal();
    return;
  }

  closeRenameModal();
  showStatus(`Renaming album "${album.albumName}"...`, 'info');

  try {
    const res = await apiCall(`/api/albums/${albumId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        albumName: newName,
      }),
    });

    if (!res.ok) {
      throw new Error(`Failed to rename album: HTTP ${res.status}`);
    }

    // Update local album list
    album.albumName = newName;
    albums.sort((a, b) => naturalSort(a.albumName, b.albumName));
    renderAlbums();
    showStatus(`Successfully renamed to "${newName}"`, 'success');
  } catch (e) {
    showStatus(`Rename failed: ${e.message}`, 'error');
    console.error('Rename error:', e);
  }
}

function selectAll() {
  const filterValue = $('#filter').value;
  let filtered;

  // Check for asset count filter
  const assetCountFilter = parseAssetCountFilter(filterValue);
  if (assetCountFilter) {
    filtered = albums.filter(assetCountFilter);
  } else {
    // Try name-based filtering (regex or substring)
    try {
      // Try to use as regex
      const regex = new RegExp(filterValue, 'i');
      filtered = albums.filter((a) => regex.test(a.albumName));
    } catch (e) {
      // If invalid regex, fall back to case-insensitive substring match
      const lowerFilter = filterValue.toLowerCase();
      filtered = albums.filter((a) =>
        a.albumName.toLowerCase().includes(lowerFilter)
      );
    }
  }

  filtered.forEach((a) => selected.add(a.id));
  renderAlbums();
}

function selectNone() {
  selected.clear();
  renderAlbums();
}

function updateSelectedCount() {
  $('#selectedCount').textContent = selected.size;
  $('#deleteBtn').disabled = selected.size === 0;
  $('#mergeBtn').disabled = selected.size < 2;
}

function confirmDelete() {
  if (selected.size === 0) return;
  const toDelete = albums.filter((a) => selected.has(a.id));
  $('#deleteCount').textContent = toDelete.length;
  $('#deleteList').innerHTML = toDelete
    .map((a) => `<li>${escapeHtml(a.albumName)}</li>`)
    .join('');
  $('#modal').classList.remove('hidden');
}

function closeModal() {
  $('#modal').classList.add('hidden');
}

function confirmMerge() {
  if (selected.size < 2) return;
  const toMerge = albums.filter((a) => selected.has(a.id));
  $('#mergeCount').textContent = toMerge.length;
  $('#mergeList').innerHTML = toMerge
    .map(
      (a) =>
        `<li><span class="merge-album-name" onclick="setMergeTargetName('${escapeJs(
          a.albumName
        )}')">${escapeHtml(a.albumName)}</span> (${
          a.assetCount
        } assets)</li>`
    )
    .join('');
  $('#mergeTargetName').value = '';
  $('#mergeModal').classList.remove('hidden');
}

function closeMergeModal() {
  $('#mergeModal').classList.add('hidden');
}

function setMergeTargetName(name) {
  $('#mergeTargetName').value = name;
}

async function executeMerge() {
  const targetName = $('#mergeTargetName').value.trim();
  if (!targetName) {
    showStatus('Please enter a target album name', 'error');
    return;
  }

  closeMergeModal();
  const toMerge = albums.filter((a) => selected.has(a.id));

  showStatus('Fetching assets from selected albums...', 'info');

  try {
    // Step 1: Fetch all assets from selected albums
    const allAssetIds = new Set();
    for (const album of toMerge) {
      const res = await apiCall(`/api/albums/${album.id}`);
      if (!res.ok) throw new Error(`Failed to fetch album ${album.albumName}`);
      const albumData = await res.json();
      if (albumData.assets && Array.isArray(albumData.assets)) {
        albumData.assets.forEach((asset) => allAssetIds.add(asset.id));
      }
    }

    const assetIdArray = Array.from(allAssetIds);
    showStatus(
      `Found ${assetIdArray.length} unique assets. Merging...`,
      'info'
    );

    // Step 2: Check if target album exists
    const targetAlbum = albums.find(
      (a) => a.albumName.toLowerCase() === targetName.toLowerCase()
    );

    if (targetAlbum) {
      // Target exists - add assets to it
      showStatus(`Adding assets to existing album "${targetName}"...`, 'info');
      const addRes = await apiCall(`/api/albums/${targetAlbum.id}/assets`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ids: assetIdArray }),
      });

      if (!addRes.ok) {
        throw new Error('Failed to add assets to target album');
      }
    } else {
      // Target doesn't exist - create new album
      showStatus(`Creating new album "${targetName}"...`, 'info');
      const createRes = await apiCall('/api/albums', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          albumName: targetName,
          assetIds: assetIdArray,
        }),
      });

      if (!createRes.ok) {
        throw new Error('Failed to create new album');
      }
    }

    // Step 3: Delete source albums (excluding target if it was selected)
    showStatus('Deleting source albums...', 'info');
    const albumsToDelete = toMerge.filter(
      (a) => a.albumName.toLowerCase() !== targetName.toLowerCase()
    );

    for (const album of albumsToDelete) {
      await apiCall(`/api/albums/${album.id}`, {
        method: 'DELETE',
      });
    }

    // Step 4: Refresh album list
    await loadAlbums();
    showStatus(
      `Successfully merged ${toMerge.length} albums into "${targetName}"`,
      'success'
    );
  } catch (e) {
    showStatus(`Merge failed: ${e.message}`, 'error');
    console.error('Merge error:', e);
  }
}

async function executeDelete() {
  closeModal();
  const toDelete = [...selected];
  let deleted = 0,
    failed = 0;

  showStatus(`Deleting 0/${toDelete.length} albums...`, 'info');

  for (const id of toDelete) {
    try {
      const res = await apiCall(`/api/albums/${id}`, {
        method: 'DELETE',
      });
      if (res.ok || res.status === 204) {
        deleted++;
        albums = albums.filter((a) => a.id !== id);
        selected.delete(id);
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
    showStatus(`Deleting ${deleted}/${toDelete.length} albums...`, 'info');
  }

  // Refresh album list from server and reapply filter
  await loadAlbums();

  if (failed === 0) {
    showStatus(`Successfully deleted ${deleted} album(s)`, 'success');
  } else {
    showStatus(`Deleted ${deleted}, failed ${failed}`, 'error');
  }
}

function toggleConfig() {
  const content = $('#configContent');
  const toggle = $('#configToggle');
  content.classList.toggle('collapsed');
  const isCollapsed = content.classList.contains('collapsed');
  toggle.style.transform = isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)';

  // Save state to localStorage
  localStorage.setItem('config_collapsed', isCollapsed);
}

// Set proxy hostname
$('#proxyHost').textContent = location.hostname;

// Load saved config
const savedUrl = localStorage.getItem('immich_url');
const savedKey = localStorage.getItem('immich_key');
const savedProxy = localStorage.getItem('immich_proxy');
const savedConfigCollapsed = localStorage.getItem('config_collapsed');

if (savedUrl) $('#serverUrl').value = savedUrl;
if (savedKey) $('#apiKey').value = savedKey;
if (savedProxy !== null) {
  $('#useProxy').checked = savedProxy === 'true';
}

// Apply saved collapsed state
if (savedConfigCollapsed === 'true') {
  const content = $('#configContent');
  const toggle = $('#configToggle');
  content.classList.add('collapsed');
  toggle.style.transform = 'rotate(-90deg)';
}

// Save config on change
document
  .getElementById('serverUrl')
  .addEventListener('change', (e) =>
    localStorage.setItem('immich_url', e.target.value)
  );
document
  .getElementById('apiKey')
  .addEventListener('change', (e) =>
    localStorage.setItem('immich_key', e.target.value)
  );
document
  .getElementById('useProxy')
  .addEventListener('change', (e) =>
    localStorage.setItem('immich_proxy', e.target.checked)
  );

// Auto-load albums if config exists
if (savedUrl && savedKey) {
  loadAlbums();
}

// Global keyboard handler for modals
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeModal();
    closeMergeModal();
    closeRenameModal();
  } else if (e.key === 'Enter') {
    // Check which modal is open and execute appropriate action
    const deleteModal = $('#modal');
    const mergeModal = $('#mergeModal');
    const renameModal = $('#renameModal');

    if (!deleteModal.classList.contains('hidden')) {
      // Only execute if not typing in an input field
      if (document.activeElement.tagName !== 'INPUT') {
        executeDelete();
      }
    } else if (!mergeModal.classList.contains('hidden')) {
      // Merge input already handles Enter via onkeypress
      // This is backup for when focus is not on input
      if (document.activeElement.tagName !== 'INPUT') {
        executeMerge();
      }
    } else if (!renameModal.classList.contains('hidden')) {
      // Rename input already handles Enter via onkeypress
      // This is backup for when focus is not on input
      if (document.activeElement.tagName !== 'INPUT') {
        executeRename();
      }
    }
  }
});
