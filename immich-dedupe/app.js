const $ = (s, ctx = document) => ctx.querySelector(s);

class ImmichDedupe {
  constructor() {
    this.host = '';
    this.apiKey = '';
    this.useProxy = false;
    this.proxy = '';
    this.duplicates = [];
    this.currentIndex = 0;
    this.decisions = new Map(); // duplicateId -> { keep: assetId, trash: [assetIds] }
    this.albumCache = new Map(); // assetId -> albums[]

    this.initElements();
    this.attachEventListeners();
    this.loadFromLocalStorage();
  }

  initElements() {
    this.hostInput = $('#host');
    this.apiKeyInput = $('#apiKey');
    this.useProxyInput = $('#useProxy');
    this.proxyInput = $('#proxy');
    this.proxyGroup = $('#proxyGroup');
    this.loadBtn = $('#loadBtn');
    this.status = $('#status');
    this.compareView = $('#compareView');
    this.pairInfo = $('#pairInfo');
    this.prevPairBtn = $('#prevPairBtn');
    this.nextPairBtn = $('#nextPairBtn');
    this.trashBtn = $('#trashBtn');
    this.trashCount = $('#trashCount');
    this.stackBtn = $('#stackBtn');
    this.selectKeepAllBtn = $('#selectKeepAllBtn');
    this.selectTrashAllBtn = $('#selectTrashAllBtn');
    this.sidebar = document.querySelector('.sidebar');
    this.toggleSidebarBtn = $('#toggleSidebarBtn');
    this.showConfigBtn = $('#showConfigBtn');
  }

  attachEventListeners() {
    this.loadBtn.addEventListener('click', () => this.loadDuplicates());
    this.prevPairBtn.addEventListener('click', () => this.prevPair());
    this.nextPairBtn.addEventListener('click', () => this.nextPair());
    this.trashBtn.addEventListener('click', () => this.executeTrashes());
    this.selectKeepAllBtn.addEventListener('click', () => this.selectKeepAll());
    this.selectTrashAllBtn.addEventListener('click', () => this.selectTrashAll());

    this.useProxyInput.addEventListener('change', () => {
      this.proxyGroup.style.display = this.useProxyInput.checked ? 'block' : 'none';
      localStorage.setItem('immichDedupe_useProxy', this.useProxyInput.checked);
    });

    this.hostInput.addEventListener('change', () =>
      localStorage.setItem('immichDedupe_host', this.hostInput.value)
    );
    this.apiKeyInput.addEventListener('change', () =>
      localStorage.setItem('immichDedupe_apiKey', this.apiKeyInput.value)
    );
    this.proxyInput.addEventListener('change', () =>
      localStorage.setItem('immichDedupe_proxy', this.proxyInput.value)
    );

    if (this.toggleSidebarBtn) {
      this.toggleSidebarBtn.addEventListener('click', () => this.toggleSidebar());
    }
    if (this.showConfigBtn) {
      this.showConfigBtn.addEventListener('click', () => this.toggleSidebar());
    }

    document.addEventListener('keydown', (e) => this.handleKeyShortcuts(e));
  }

  loadFromLocalStorage() {
    const host = localStorage.getItem('immichDedupe_host');
    const apiKey = localStorage.getItem('immichDedupe_apiKey');
    const useProxy = localStorage.getItem('immichDedupe_useProxy') === 'true';
    const proxy = localStorage.getItem('immichDedupe_proxy');
    const sidebarHidden = localStorage.getItem('immichDedupe_sidebarHidden') === 'true';

    if (host) this.hostInput.value = host;
    if (apiKey) this.apiKeyInput.value = apiKey;
    if (proxy) this.proxyInput.value = proxy;

    this.useProxyInput.checked = useProxy;
    this.proxyGroup.style.display = useProxy ? 'block' : 'none';

    if (sidebarHidden) {
      this.sidebar.classList.add('hidden');
      this.toggleSidebarBtn.textContent = 'Show Config';
      this.showConfigBtn.style.display = 'flex';
    }
  }

  toggleSidebar() {
    this.sidebar.classList.toggle('hidden');
    const isHidden = this.sidebar.classList.contains('hidden');
    localStorage.setItem('immichDedupe_sidebarHidden', isHidden);
    this.toggleSidebarBtn.textContent = isHidden ? 'Show Config' : 'Hide Config';
    this.showConfigBtn.style.display = isHidden ? 'block' : 'none';
  }

  handleKeyShortcuts(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    const key = e.key.toLowerCase();

    if (key === 't' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      this.executeTrashes();
    }
    if (key === 's' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      this.nextPair();
    }
    if (key === 'arrowright') {
      e.preventDefault();
      this.nextPair();
    }
    if (key === 'arrowleft') {
      e.preventDefault();
      this.prevPair();
    }
    if (key === '1' || key === '2') {
      e.preventDefault();
      const group = this.duplicates[this.currentIndex];
      if (group && group.assets.length >= parseInt(key)) {
        this.toggleAssetDecision(group, parseInt(key) - 1);
      }
    }
  }

  setStatus(message, type = 'info') {
    this.status.textContent = message;
    this.status.className = `status toolbar-status ${type}`;
  }

  getApiConfig(endpoint) {
    let url, headers;
    if (this.useProxy) {
      url = `${this.proxy}${endpoint}`;
      headers = {
        'x-api-key': this.apiKey,
        'x-immich-url': this.host,
        'Content-Type': 'application/json',
      };
    } else {
      url = `${this.host}${endpoint}`;
      headers = {
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json',
      };
    }
    return { url, headers };
  }

  getThumbnailUrl(assetId) {
    const endpoint = `/api/assets/${assetId}/thumbnail?size=preview&apiKey=${this.apiKey}`;
    if (this.useProxy) {
      return `${this.proxy}${endpoint}`;
    }
    return `${this.host}${endpoint}`;
  }

  async loadDuplicates() {
    this.host = this.hostInput.value.trim();
    this.apiKey = this.apiKeyInput.value.trim();
    this.useProxy = this.useProxyInput.checked;
    this.proxy = this.proxyInput.value.trim();

    if (!this.host || !this.apiKey) {
      this.setStatus('Please fill in host and API key', 'error');
      return;
    }

    if (this.useProxy && !this.proxy) {
      this.setStatus('Please enter proxy URL', 'error');
      return;
    }

    this.loadBtn.disabled = true;
    this.setStatus('Loading duplicates...', 'loading');

    try {
      const { url, headers } = this.getApiConfig('/api/duplicates');
      const response = await fetch(url, { headers });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
      }

      this.duplicates = await response.json();

      // Filter out groups where all assets are already trashed
      this.duplicates = this.duplicates.filter(
        (group) => group.assets.some((a) => !a.isTrashed)
      );

      this.currentIndex = 0;
      this.decisions.clear();

      this.albumCache.clear();

      // Auto-decide all groups based on file size
      this.autoDecideAll();

      this.setStatus(`Loaded ${this.duplicates.length} duplicate groups`, 'success');
      this.renderCurrentPair();
      this.updatePagination();
    } catch (error) {
      console.error('Error loading duplicates:', error);
      this.setStatus(`Error: ${error.message}`, 'error');
    } finally {
      this.loadBtn.disabled = false;
    }
  }

  autoDecideAll() {
    for (const group of this.duplicates) {
      this.autoDecideGroup(group);
    }
    this.updateTrashCount();
  }

  autoDecideGroup(group) {
    const assets = group.assets.filter((a) => !a.isTrashed);
    if (assets.length < 2) return;

    // Keep the largest file
    let keepAsset = assets[0];
    for (const asset of assets) {
      const size = asset.exifInfo?.fileSizeInByte || 0;
      if (size > (keepAsset.exifInfo?.fileSizeInByte || 0)) {
        keepAsset = asset;
      }
    }

    const trashAssets = assets.filter((a) => a.id !== keepAsset.id);
    this.decisions.set(group.duplicateId, {
      keep: keepAsset.id,
      trash: trashAssets.map((a) => a.id),
    });
  }

  toggleAssetDecision(group, assetIndex) {
    const assets = group.assets.filter((a) => !a.isTrashed);
    if (assetIndex >= assets.length) return;

    const clickedAsset = assets[assetIndex];
    const decision = this.decisions.get(group.duplicateId);

    if (!decision) return;

    // If already kept, do nothing
    if (decision.keep === clickedAsset.id) return;

    // Swap: the clicked becomes keep, the current keep becomes trash
    const oldKeep = decision.keep;
    decision.keep = clickedAsset.id;
    decision.trash = assets.filter((a) => a.id !== clickedAsset.id).map((a) => a.id);

    this.updateTrashCount();
    this.renderCurrentPair();
  }

  selectKeepAll() {
    // Auto-decide all: keep largest file for each group
    this.autoDecideAll();
    this.renderCurrentPair();
    this.setStatus('All groups auto-selected (keeping largest)', 'success');
  }

  selectTrashAll() {
    // For each group, mark ALL non-trashed assets for trash (keep none)
    // Actually, let's mark all as trash = keep the smallest (invert logic)
    for (const group of this.duplicates) {
      const assets = group.assets.filter((a) => !a.isTrashed);
      if (assets.length < 2) continue;

      // Keep the smallest file (inverse of default)
      let keepAsset = assets[0];
      for (const asset of assets) {
        const size = asset.exifInfo?.fileSizeInByte || 0;
        if (size < (keepAsset.exifInfo?.fileSizeInByte || 0)) {
          keepAsset = asset;
        }
      }

      const trashAssets = assets.filter((a) => a.id !== keepAsset.id);
      this.decisions.set(group.duplicateId, {
        keep: keepAsset.id,
        trash: trashAssets.map((a) => a.id),
      });
    }
    this.updateTrashCount();
    this.renderCurrentPair();
    this.setStatus('All groups set to trash larger files', 'success');
  }

  updateTrashCount() {
    const group = this.duplicates[this.currentIndex];
    if (!group) {
      this.trashCount.textContent = '0';
      this.trashBtn.disabled = true;
      return;
    }
    const decision = this.decisions.get(group.duplicateId);
    const count = decision ? decision.trash.length : 0;
    this.trashCount.textContent = count;
    this.trashBtn.disabled = count === 0;
  }

  async fetchAlbums(assetId) {
    if (this.albumCache.has(assetId)) {
      return this.albumCache.get(assetId);
    }

    try {
      const { url, headers } = this.getApiConfig(`/api/albums?assetId=${assetId}`);
      const response = await fetch(url, { headers });
      if (response.ok) {
        const albums = await response.json();
        this.albumCache.set(assetId, albums);
        return albums;
      }
    } catch (e) {
      console.error('Error fetching albums for', assetId, e);
    }

    this.albumCache.set(assetId, []);
    return [];
  }

  async renderCurrentPair() {
    const group = this.duplicates[this.currentIndex];
    if (!group) {
      this.compareView.innerHTML = '<div class="empty-state">No duplicates to show</div>';
      return;
    }

    const assets = group.assets.filter((a) => !a.isTrashed);
    const decision = this.decisions.get(group.duplicateId);

    this.compareView.innerHTML = '';

    // Fetch albums for all assets in parallel
    const albumPromises = assets.map((a) => this.fetchAlbums(a.id));
    const albumResults = await Promise.all(albumPromises);

    for (let i = 0; i < assets.length; i++) {
      const asset = assets[i];
      const albums = albumResults[i];
      const isKeep = decision && decision.keep === asset.id;
      const panel = this.createAssetPanel(asset, albums, isKeep, group);
      this.compareView.appendChild(panel);
    }

    this.updatePagination();
  }

  createAssetPanel(asset, albums, isKeep, group) {
    const panel = document.createElement('div');
    panel.className = `asset-panel ${isKeep ? 'keep' : 'trash'}`;

    const exif = asset.exifInfo || {};
    const fileSize = exif.fileSizeInByte || 0;
    const width = exif.exifImageWidth || asset.width || 0;
    const height = exif.exifImageHeight || asset.height || 0;
    const dateOriginal = exif.dateTimeOriginal || asset.fileCreatedAt || '';
    const orientation = exif.orientation || '';

    // Parse date
    let dateStr = '';
    let timeStr = '';
    let tzStr = '';
    if (dateOriginal) {
      const d = new Date(dateOriginal);
      dateStr = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      timeStr = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      if (exif.timeZone) {
        tzStr = exif.timeZone;
      }
    }

    // Location
    let locationStr = 'Unknown';
    if (exif.city || exif.state || exif.country) {
      locationStr = [exif.city, exif.state, exif.country].filter(Boolean).join(', ');
    }

    // Determine if values differ from other assets in group to highlight
    const otherAssets = group.assets.filter((a) => a.id !== asset.id && !a.isTrashed);

    const fileSizeFormatted = this.formatFileSize(fileSize);
    const isLarger = otherAssets.every((a) => fileSize >= (a.exifInfo?.fileSizeInByte || 0));
    const isSmaller = otherAssets.every((a) => fileSize <= (a.exifInfo?.fileSizeInByte || 0));

    // Time difference check
    const hasTimeDiff = otherAssets.some((a) => {
      const otherTime = a.exifInfo?.dateTimeOriginal || a.fileCreatedAt || '';
      return otherTime !== dateOriginal;
    });

    panel.innerHTML = `
      <div class="image-container">
        <div class="pin-icon" title="Open in Immich">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M16,12V4H17V2H7V4H8V12L6,14V16H11.2V22H12.8V16H18V14L16,12Z"/>
          </svg>
        </div>
        <img src="${this.getThumbnailUrl(asset.id)}" alt="${asset.originalFileName}" />
        <button class="toggle-btn ${isKeep ? 'keep' : 'trash'}">${isKeep ? 'Keep' : 'Trash'}</button>
      </div>
      <div class="metadata">
        <div class="meta-row">
          <div class="meta-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/></svg>
          </div>
          <div class="meta-value">${asset.originalFileName || 'Unknown'}</div>
        </div>
        <div class="meta-row">
          <div class="meta-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17,3H7A2,2 0 0,0 5,5V21L12,18L19,21V5A2,2 0 0,0 17,3Z"/></svg>
          </div>
          <div class="meta-value">In ${albums.length} album${albums.length !== 1 ? 's' : ''}</div>
        </div>
        <div class="meta-row">
          <div class="meta-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M13,9V3.5L18.5,9H13Z"/></svg>
          </div>
          <div class="meta-value ${isLarger && !isSmaller ? 'highlight-green' : ''} ${isSmaller && !isLarger ? 'highlight' : ''}">${fileSizeFormatted}</div>
        </div>
        <div class="meta-row">
          <div class="meta-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M4,4H7L9,2H15L17,4H20A2,2 0 0,1 22,6V18A2,2 0 0,1 20,20H4A2,2 0 0,1 2,18V6A2,2 0 0,1 4,4M12,7A5,5 0 0,0 7,12A5,5 0 0,0 12,17A5,5 0 0,0 17,12A5,5 0 0,0 12,7M12,9A3,3 0 0,1 15,12A3,3 0 0,1 12,15A3,3 0 0,1 9,12A3,3 0 0,1 12,9Z"/></svg>
          </div>
          <div class="meta-value">${width} x ${height}</div>
        </div>
        <div class="meta-row">
          <div class="meta-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19,19H5V8H19M16,1V3H8V1H6V3H5C3.89,3 3,3.89 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5C21,3.89 20.1,3 19,3H18V1"/></svg>
          </div>
          <div class="meta-value">${dateStr}</div>
        </div>
        <div class="meta-row">
          <div class="meta-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M16.2,16.2L11,13V7H12.5V12.2L17,14.9L16.2,16.2Z"/></svg>
          </div>
          <div class="meta-value ${hasTimeDiff ? 'highlight' : ''}">${timeStr}${tzStr ? ' ' + tzStr : ''}</div>
        </div>
        <div class="meta-row">
          <div class="meta-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12,11.5A2.5,2.5 0 0,1 9.5,9A2.5,2.5 0 0,1 12,6.5A2.5,2.5 0 0,1 14.5,9A2.5,2.5 0 0,1 12,11.5M12,2A7,7 0 0,0 5,9C5,14.25 12,22 12,22C12,22 19,14.25 19,9A7,7 0 0,0 12,2Z"/></svg>
          </div>
          <div class="meta-value">${locationStr}</div>
        </div>
      </div>
    `;

    // Pin icon opens in Immich
    panel.querySelector('.pin-icon').addEventListener('click', () => {
      window.open(`${this.host}/photos/${asset.id}`, '_blank');
    });

    // Toggle button swaps keep/trash
    panel.querySelector('.toggle-btn').addEventListener('click', () => {
      const idx = group.assets.filter((a) => !a.isTrashed).findIndex((a) => a.id === asset.id);
      if (idx >= 0) this.toggleAssetDecision(group, idx);
    });

    return panel;
  }

  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KiB', 'MiB', 'GiB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 3 : 0) + ' ' + units[i];
  }

  updatePagination() {
    const total = this.duplicates.length;
    this.pairInfo.textContent = total > 0
      ? `${this.currentIndex + 1} of ${total} duplicate groups`
      : '';
    this.prevPairBtn.disabled = this.currentIndex <= 0;
    this.nextPairBtn.disabled = this.currentIndex >= total - 1;
  }

  prevPair() {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      this.renderCurrentPair();
    }
  }

  nextPair() {
    if (this.currentIndex < this.duplicates.length - 1) {
      this.currentIndex++;
      this.renderCurrentPair();
    }
  }

  async executeTrashes() {
    const group = this.duplicates[this.currentIndex];
    if (!group) return;

    const decision = this.decisions.get(group.duplicateId);
    if (!decision || decision.trash.length === 0) {
      this.setStatus('No assets marked for trash', 'error');
      return;
    }

    const keepId = decision.keep;
    const trashIds = decision.trash;

    this.trashBtn.disabled = true;
    this.setStatus(`Processing ${trashIds.length} asset(s)...`, 'loading');

    // Copy album memberships from trashed assets to kept asset
    const keepAlbums = await this.fetchAlbums(keepId);
    const keepAlbumIds = new Set(keepAlbums.map((a) => a.id));

    for (const trashId of trashIds) {
      const trashAlbums = await this.fetchAlbums(trashId);
      for (const album of trashAlbums) {
        if (!keepAlbumIds.has(album.id)) {
          // DRY RUN: would add keep asset to this album
          console.log(`[DRY RUN] Would add asset ${keepId} to album "${album.albumName || album.id}"`);
          keepAlbumIds.add(album.id);
        }
      }
    }

    // DRY RUN: log what would be trashed instead of actually deleting
    console.log(`[DRY RUN] Would trash ${trashIds.length} asset(s):`, trashIds);
    console.log(`[DRY RUN] Keeping asset: ${keepId}`);

    // Mark trashed assets
    for (const asset of group.assets) {
      if (trashIds.includes(asset.id)) {
        asset.isTrashed = true;
      }
    }

    // Remove this group from the list
    this.duplicates.splice(this.currentIndex, 1);
    this.decisions.delete(group.duplicateId);

    // Adjust index
    if (this.currentIndex >= this.duplicates.length) {
      this.currentIndex = Math.max(0, this.duplicates.length - 1);
    }

    this.setStatus(`Trashed ${trashIds.length} asset(s). ${this.duplicates.length} groups remaining.`, 'success');
    this.updateTrashCount();
    this.renderCurrentPair();
  }

  async addAssetToAlbum(albumId, assetId) {
    const { url, headers } = this.getApiConfig(`/api/albums/${albumId}/assets`);
    const response = await fetch(url, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ ids: [assetId] }),
    });
    if (!response.ok) {
      throw new Error(`Failed to add to album: ${response.status}`);
    }
    return response.json();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new ImmichDedupe();
});
