const $ = (s, ctx = document) => ctx.querySelector(s);

const DEFAULT_QUERY = JSON.stringify({ type: 'IMAGE' }, null, 2);

const DOWNLOAD_BATCH_SIZE = 100;

class ImmichMetadataSearch {
  constructor() {
    this.host = '';
    this.apiKey = '';
    this.useProxy = false;
    this.proxy = '';
    this.allAssets = [];
    this.selectedAssets = new Set();
    this.currentPage = 0;
    this.pageSize = 250;
    this.isLoading = false;
    this.isDownloading = false;

    this.initElements();
    this.attachEventListeners();
    this.loadFromLocalStorage();
  }

  initElements() {
    this.hostInput = $('#host');
    this.apiKeyInput = $('#apiKey');
    this.queryInput = $('#query');
    this.useProxyInput = $('#useProxy');
    this.proxyInput = $('#proxy');
    this.proxyGroup = $('#proxyGroup');
    this.searchBtn = $('#searchBtn');
    this.downloadAllBtn = $('#downloadAllBtn');
    this.downloadSelectedBtn = $('#downloadSelectedBtn');
    this.selectAllBtn = $('#selectAllBtn');
    this.deselectAllBtn = $('#deselectAllBtn');
    this.status = $('#status');
    this.gallery = $('#gallery');
    this.pageInfo = $('#pageInfo');
    this.pageNumber = $('#pageNumber');
    this.prevPageBtn = $('#prevPageBtn');
    this.nextPageBtn = $('#nextPageBtn');
    this.sidebar = document.querySelector('.sidebar');
    this.toggleSidebarBtn = $('#toggleSidebarBtn');
    this.showConfigBtn = $('#showConfigBtn');
  }

  attachEventListeners() {
    this.searchBtn.addEventListener('click', () => this.search());
    this.downloadAllBtn.addEventListener('click', () =>
      this.downloadAssets(this.allAssets, 'all')
    );
    this.downloadSelectedBtn.addEventListener('click', () => {
      const selected = this.allAssets.filter((a) =>
        this.selectedAssets.has(a.id)
      );
      this.downloadAssets(selected, 'selected');
    });
    this.selectAllBtn.addEventListener('click', () => this.selectAll());
    this.deselectAllBtn.addEventListener('click', () => this.deselectAll());
    this.prevPageBtn.addEventListener('click', () => this.previousPage());
    this.nextPageBtn.addEventListener('click', () => this.nextPage());

    this.useProxyInput.addEventListener('change', () => {
      this.proxyGroup.hidden = !this.useProxyInput.checked;
      localStorage.setItem('metaSearch_useProxy', this.useProxyInput.checked);
    });

    this.hostInput.addEventListener('change', () =>
      localStorage.setItem('metaSearch_host', this.hostInput.value)
    );
    this.apiKeyInput.addEventListener('change', () =>
      localStorage.setItem('metaSearch_apiKey', this.apiKeyInput.value)
    );
    this.queryInput.addEventListener('change', () =>
      localStorage.setItem('metaSearch_query', this.queryInput.value)
    );
    this.proxyInput.addEventListener('change', () =>
      localStorage.setItem('metaSearch_proxy', this.proxyInput.value)
    );

    this.toggleSidebarBtn.addEventListener('click', () => this.toggleSidebar());
    this.showConfigBtn.addEventListener('click', () => this.toggleSidebar());

    document.addEventListener('keydown', (e) => this.handleKeyShortcuts(e));
  }

  loadFromLocalStorage() {
    const host = localStorage.getItem('metaSearch_host');
    const apiKey = localStorage.getItem('metaSearch_apiKey');
    const query = localStorage.getItem('metaSearch_query');
    const useProxy = localStorage.getItem('metaSearch_useProxy') === 'true';
    const proxy = localStorage.getItem('metaSearch_proxy');
    const sidebarHidden =
      localStorage.getItem('metaSearch_sidebarHidden') === 'true';

    if (host) this.hostInput.value = host;
    if (apiKey) this.apiKeyInput.value = apiKey;
    this.queryInput.value = query || DEFAULT_QUERY;
    if (proxy) this.proxyInput.value = proxy;

    this.useProxyInput.checked = useProxy;
    this.proxyGroup.hidden = !useProxy;

    if (sidebarHidden) {
      this.sidebar.classList.add('hidden');
      this.toggleSidebarBtn.textContent = 'Show Config';
      this.showConfigBtn.hidden = false;
    }
  }

  toggleSidebar() {
    this.sidebar.classList.toggle('hidden');
    const isHidden = this.sidebar.classList.contains('hidden');
    localStorage.setItem('metaSearch_sidebarHidden', isHidden);
    this.toggleSidebarBtn.textContent = isHidden ? 'Show Config' : 'Hide Config';
    this.showConfigBtn.hidden = !isHidden;
  }

  handleKeyShortcuts(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (e.code === 'KeyN') {
      if (e.shiftKey) {
        e.preventDefault();
        this.previousPage();
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        this.nextPage();
      }
    }

    if (e.code === 'KeyA' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      this.selectAll();
    }

    if (e.key === 'Escape') {
      this.deselectAll();
    }
  }

  setStatus(message, type = 'info') {
    this.status.textContent = message;
    this.status.className = `status toolbar-status ${type}`;
  }

  getApiConfig(endpoint) {
    if (this.useProxy) {
      return {
        url: `${this.proxy}${endpoint}`,
        headers: {
          'x-api-key': this.apiKey,
          'x-immich-url': this.host,
          'Content-Type': 'application/json',
        },
      };
    }
    return {
      url: `${this.host}${endpoint}`,
      headers: {
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json',
      },
    };
  }

  async search() {
    this.host = this.hostInput.value.trim();
    this.apiKey = this.apiKeyInput.value.trim();
    this.useProxy = this.useProxyInput.checked;
    this.proxy = this.proxyInput.value.trim();

    if (!this.host || !this.apiKey) {
      this.setStatus('Please fill in host and API key', 'error');
      return;
    }

    let queryBody;
    try {
      queryBody = JSON.parse(this.queryInput.value);
    } catch (e) {
      this.setStatus(`Invalid JSON: ${e.message}`, 'error');
      return;
    }

    if (this.useProxy && !this.proxy) {
      this.setStatus('Please enter proxy URL', 'error');
      return;
    }

    this.isLoading = true;
    this.searchBtn.disabled = true;
    this.allAssets = [];
    this.selectedAssets.clear();
    this.renderGallery();
    this.setStatus('Searching…', 'loading');

    try {
      this.allAssets = await this.fetchAllAssets(queryBody);
      this.currentPage = 0;
      this.renderGallery();
      this.setStatus(
        this.allAssets.length
          ? `Found ${this.allAssets.length} asset${this.allAssets.length !== 1 ? 's' : ''}`
          : 'No assets found',
        this.allAssets.length ? 'success' : 'info'
      );
    } catch (error) {
      console.error('Search error:', error);
      this.setStatus(`Error: ${error.message}`, 'error');
    } finally {
      this.isLoading = false;
      this.searchBtn.disabled = false;
      this.updateUI();
    }
  }

  async fetchAllAssets(queryBody) {
    const allAssets = [];
    let page = 1;
    const size = 250;

    while (true) {
      const { url, headers } = this.getApiConfig('/api/search/metadata');
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...queryBody, page, size }),
      });

      if (!response.ok) {
        throw new Error(`API error ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const items = data?.assets?.items ?? [];
      if (!items.length) break;

      allAssets.push(...items);
      this.setStatus(`Loading… ${allAssets.length} assets found`, 'loading');

      if (!data.assets.nextPage) break;
      page = parseInt(data.assets.nextPage, 10);
    }

    return allAssets;
  }

  renderGallery(scroll = false) {
    const startIdx = this.currentPage * this.pageSize;
    const endIdx = Math.min(startIdx + this.pageSize, this.allAssets.length);
    const pageAssets = this.allAssets.slice(startIdx, endIdx);

    if (scroll) this.gallery.scrollTop = 0;

    this.gallery.innerHTML = '';

    if (!pageAssets.length) {
      const empty = document.createElement('div');
      empty.className = 'gallery-empty';
      empty.innerHTML = `
        <svg width="48" height="48" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" fill="currentColor"/>
        </svg>
        <p>Run a search to see results here</p>`;
      this.gallery.appendChild(empty);
    } else {
      pageAssets.forEach((asset) => {
        const item = document.createElement('div');
        item.className = 'gallery-item';
        item.dataset.assetId = asset.id;
        if (this.selectedAssets.has(asset.id)) item.classList.add('selected');

        const placeholder = document.createElement('div');
        placeholder.className = 'loading-placeholder';
        item.appendChild(placeholder);

        const img = document.createElement('img');
        img.alt = asset.originalFileName || asset.id;
        img.loading = 'lazy';
        img.onload = () => placeholder.remove();
        img.onerror = () => placeholder.remove();
        img.src = this.getThumbnailUrl(asset.id);
        item.appendChild(img);

        item.addEventListener('click', (e) => {
          if (e.shiftKey || e.metaKey) {
            window.open(`${this.host}/photos/${asset.id}`, '_blank');
          } else {
            this.toggleSelection(asset.id);
          }
        });

        this.gallery.appendChild(item);
      });
    }

    this.updateUI();
  }

  getThumbnailUrl(assetId) {
    const base = this.useProxy ? this.proxy : this.host;
    return `${base}/api/assets/${assetId}/thumbnail?apiKey=${this.apiKey}`;
  }

  updateUI() {
    const totalPages = Math.ceil(this.allAssets.length / this.pageSize);
    const startIdx = this.currentPage * this.pageSize + 1;
    const endIdx = Math.min(
      (this.currentPage + 1) * this.pageSize,
      this.allAssets.length
    );

    this.pageNumber.textContent =
      this.allAssets.length > 0
        ? `Page ${this.currentPage + 1} of ${Math.max(totalPages, 1)} (${startIdx}–${endIdx} of ${this.allAssets.length})`
        : '';

    this.pageInfo.textContent =
      this.selectedAssets.size > 0 ? `${this.selectedAssets.size} selected` : '';

    this.prevPageBtn.disabled = this.currentPage === 0;
    this.nextPageBtn.disabled = this.currentPage >= totalPages - 1;

    const hasAssets = this.allAssets.length > 0;
    this.downloadAllBtn.disabled = !hasAssets || this.isDownloading;
    this.downloadAllBtn.textContent = '';
    this.downloadAllBtn.insertAdjacentHTML(
      'afterbegin',
      `<svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M5 20h14v-2H5v2zm7-18L5.33 9h3.84v6h5.66V9h3.84L12 2z" fill="currentColor"/></svg> Download All (${this.allAssets.length})`
    );
    this.downloadSelectedBtn.disabled =
      this.selectedAssets.size === 0 || this.isDownloading;
    this.downloadSelectedBtn.textContent = '';
    this.downloadSelectedBtn.insertAdjacentHTML(
      'afterbegin',
      `<svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M5 20h14v-2H5v2zm7-18L5.33 9h3.84v6h5.66V9h3.84L12 2z" fill="currentColor"/></svg> Download Selected (${this.selectedAssets.size})`
    );

    this.selectAllBtn.disabled = !hasAssets;
    this.deselectAllBtn.disabled = this.selectedAssets.size === 0;

    this.gallery.focus();
  }

  previousPage() {
    if (this.currentPage > 0) {
      this.currentPage--;
      this.renderGallery(true);
    }
  }

  nextPage() {
    const totalPages = Math.ceil(this.allAssets.length / this.pageSize);
    if (this.currentPage < totalPages - 1) {
      this.currentPage++;
      this.renderGallery(true);
    }
  }

  toggleSelection(assetId) {
    if (this.selectedAssets.has(assetId)) {
      this.selectedAssets.delete(assetId);
    } else {
      this.selectedAssets.add(assetId);
    }
    const item = this.gallery.querySelector(`[data-asset-id="${assetId}"]`);
    if (item) item.classList.toggle('selected');
    this.updateUI();
  }

  selectAll() {
    this.allAssets.forEach((a) => this.selectedAssets.add(a.id));
    this.gallery
      .querySelectorAll('.gallery-item')
      .forEach((el) => el.classList.add('selected'));
    this.updateUI();
  }

  deselectAll() {
    this.selectedAssets.clear();
    this.gallery
      .querySelectorAll('.gallery-item')
      .forEach((el) => el.classList.remove('selected'));
    this.updateUI();
  }

  async downloadAssets(assets, label = 'search') {
    if (!assets.length) return;

    const batches = [];
    for (let i = 0; i < assets.length; i += DOWNLOAD_BATCH_SIZE) {
      batches.push(assets.slice(i, i + DOWNLOAD_BATCH_SIZE));
    }

    this.isDownloading = true;
    this.updateUI();

    try {
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        this.setStatus(
          batches.length > 1
            ? `Downloading batch ${i + 1} of ${batches.length} (${batch.length} assets)…`
            : `Downloading ${batch.length} asset${batch.length !== 1 ? 's' : ''}…`,
          'loading'
        );

        const { url, headers } = this.getApiConfig('/api/download/archive');
        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({ assetIds: batch.map((a) => a.id) }),
        });

        if (!response.ok) {
          throw new Error(
            `Download failed (${response.status}): ${response.statusText}`
          );
        }

        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objectUrl;
        a.download =
          batches.length > 1
            ? `immich-${label}-${i + 1}of${batches.length}.zip`
            : `immich-${label}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(objectUrl);
      }

      this.setStatus(
        `Downloaded ${assets.length} asset${assets.length !== 1 ? 's' : ''} in ${batches.length} zip file${batches.length !== 1 ? 's' : ''}`,
        'success'
      );
    } catch (error) {
      console.error('Download error:', error);
      this.setStatus(`Download error: ${error.message}`, 'error');
    } finally {
      this.isDownloading = false;
      this.updateUI();
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new ImmichMetadataSearch();
});
