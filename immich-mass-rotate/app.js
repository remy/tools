const $ = (s, ctx = document) => ctx.querySelector(s);

class ImmichMassRotate {
  constructor() {
    this.host = '';
    this.apiKey = '';
    this.year = '';
    this.useProxy = false;
    this.proxy = '';
    this.assets = [];
    this.selectedAssets = new Set();
    this.currentPage = 0;
    this.pageSize = 250;
    this.allAssets = [];
    this.isLoading = false;
    this.reloadQueue = new Map();
    this.reloadDebounceTimer = null;
    this.reloadDebounceMs = 200;

    this.initElements();
    this.attachEventListeners();
    this.loadFromLocalStorage();
  }

  initElements() {
    this.hostInput = $('#host');
    this.apiKeyInput = $('#apiKey');
    this.yearInput = $('#year');
    this.useProxyInput = $('#useProxy');
    this.proxyInput = $('#proxy');
    this.proxyGroup = $('#proxyGroup');
    this.loadBtn = $('#loadBtn');
    this.status = $('#status');
    this.gallery = $('#gallery');
    this.pageInfo = $('#pageInfo');
    this.pageNumber = $('#pageNumber');
    this.prevPageBtn = $('#prevPageBtn');
    this.nextPageBtn = $('#nextPageBtn');
    this.rotateLeftBtn = $('#rotateLeftBtn');
    this.rotateRightBtn = $('#rotateRightBtn');
    this.sidebar = document.querySelector('.sidebar');
    this.toggleSidebarBtn = $('#toggleSidebarBtn');
    this.showConfigBtn = $('#showConfigBtn');
  }

  attachEventListeners() {
    this.loadBtn.addEventListener('click', () => this.loadImages());
    this.prevPageBtn.addEventListener('click', () => this.previousPage());
    this.nextPageBtn.addEventListener('click', () => this.nextPage());
    this.rotateLeftBtn.addEventListener('click', () =>
      this.rotateSelected(-90)
    );
    this.rotateRightBtn.addEventListener('click', () =>
      this.rotateSelected(90)
    );
    this.useProxyInput.addEventListener('change', () => {
      this.proxyGroup.style.display = this.useProxyInput.checked
        ? 'block'
        : 'none';
      localStorage.setItem('massRotate_useProxy', this.useProxyInput.checked);
    });

    this.hostInput.addEventListener('change', () =>
      localStorage.setItem('massRotate_host', this.hostInput.value)
    );
    this.apiKeyInput.addEventListener('change', () =>
      localStorage.setItem('massRotate_apiKey', this.apiKeyInput.value)
    );
    this.yearInput.addEventListener('change', () =>
      localStorage.setItem('massRotate_year', this.yearInput.value)
    );
    this.proxyInput.addEventListener('change', () =>
      localStorage.setItem('massRotate_proxy', this.proxyInput.value)
    );

    if (this.toggleSidebarBtn) {
      this.toggleSidebarBtn.addEventListener('click', () =>
        this.toggleSidebar()
      );
    }

    if (this.showConfigBtn) {
      this.showConfigBtn.addEventListener('click', () => this.toggleSidebar());
    }

    document.addEventListener('keydown', (e) => this.handleKeyShortcuts(e));
  }

  loadFromLocalStorage() {
    const host = localStorage.getItem('massRotate_host');
    const apiKey = localStorage.getItem('massRotate_apiKey');
    const year = localStorage.getItem('massRotate_year');
    const useProxy = localStorage.getItem('massRotate_useProxy') === 'true';
    const proxy = localStorage.getItem('massRotate_proxy');
    const sidebarHidden =
      localStorage.getItem('massRotate_sidebarHidden') === 'true';

    if (host) this.hostInput.value = host;
    if (apiKey) this.apiKeyInput.value = apiKey;
    if (year) this.yearInput.value = year;
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
    localStorage.setItem('massRotate_sidebarHidden', isHidden);
    this.toggleSidebarBtn.textContent = isHidden
      ? 'Show Config'
      : 'Hide Config';
    this.showConfigBtn.style.display = isHidden ? 'block' : 'none';
  }

  handleKeyShortcuts(e) {
    const key = e.key.toLowerCase();

    if (e.code === 'KeyF') {
      document.body.classList.toggle('fill');
    }

    if (e.code === 'KeyZ') {
      document.body.classList.toggle('zoom');
    }

    if (e.code === 'KeyR') {
      if (e.shiftKey) {
        e.preventDefault();
        this.rotateSelected(-90);
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        this.rotateSelected(90);
      }
    }

    if (e.code === 'KeyN') {
      if (e.shiftKey) {
        e.preventDefault();
        this.previousPage();
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        this.nextPage();
      }
    }

    if (e.key === ' ') {
      // e.preventDefault();
      // this.gallery.scrollTop += 200;
    }
  }

  setStatus(message, type = 'info') {
    this.status.textContent = message;
    this.status.className = `status ${type}`;
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

  async loadImages() {
    this.host = this.hostInput.value.trim();
    this.apiKey = this.apiKeyInput.value.trim();
    this.year = this.yearInput.value.trim();
    this.useProxy = this.useProxyInput.checked;
    this.proxy = this.proxyInput.value.trim();

    if (!this.host || !this.apiKey || !this.year) {
      this.setStatus('Please fill in all fields', 'error');
      return;
    }

    if (this.useProxy && !this.proxy) {
      this.setStatus('Please enter proxy URL', 'error');
      return;
    }

    this.isLoading = true;
    this.loadBtn.disabled = true;
    this.setStatus('Loading images...', 'loading');

    try {
      this.allAssets = await this.fetchAllAssets();
      this.currentPage = 0;
      this.selectedAssets.clear();
      this.renderPage();
      this.setStatus(`Loaded ${this.allAssets.length} images`, 'success');
    } catch (error) {
      console.error('Error loading images:', error);
      this.setStatus(`Error: ${error.message}`, 'error');
    } finally {
      this.isLoading = false;
      this.loadBtn.disabled = false;
    }
  }

  async fetchAllAssets() {
    const allAssets = [];
    let page = 1;
    const size = 250;
    const takenAfter = `${this.year}-01-01T00:00:00Z`;
    const takenBefore = `${parseInt(this.year) + 1}-01-01T00:00:00Z`;

    while (true) {
      const { url, headers } = this.getApiConfig('/api/search/metadata');
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          takenAfter,
          takenBefore,
          page,
          size,
          type: 'IMAGE',
        }),
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      if (
        !data.assets ||
        !data.assets.items ||
        data.assets.items.length === 0
      ) {
        break;
      }

      allAssets.push(...data.assets.items);

      if (!data.assets.nextPage) {
        break;
      }

      page = parseInt(data.assets.nextPage);
    }

    return allAssets;
  }

  renderPage(scroll = false) {
    const startIdx = this.currentPage * this.pageSize;
    const endIdx = Math.min(startIdx + this.pageSize, this.allAssets.length);
    this.assets = this.allAssets.slice(startIdx, endIdx);

    if (scroll) {
      this.gallery.scrollTop = 0;
    }

    this.gallery.innerHTML = '';
    this.assets.forEach((asset) => {
      const item = document.createElement('div');
      item.className = 'gallery-item';
      item.dataset.assetId = asset.id;
      if (this.selectedAssets.has(asset.id)) {
        item.classList.add('selected');
      }

      const img = document.createElement('img');
      const cacheBuster = Date.now();
      const thumbnailEndpoint = `/api/assets/${asset.id}/thumbnail?edited=true&apiKey=${this.apiKey}&t=${cacheBuster}`;
      img.src = `${this.host}${thumbnailEndpoint}`;
      img.alt = asset.id;

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

    this.updatePaginationUI();
  }

  updatePaginationUI() {
    const totalPages = Math.ceil(this.allAssets.length / this.pageSize);
    const startIdx = this.currentPage * this.pageSize + 1;
    const endIdx = Math.min(
      (this.currentPage + 1) * this.pageSize,
      this.allAssets.length
    );

    this.pageNumber.textContent = `Page ${this.currentPage + 1} of ${totalPages} (${startIdx}-${endIdx} of ${this.allAssets.length})`;
    this.pageInfo.textContent = `Selected: ${this.selectedAssets.size}`;

    this.prevPageBtn.disabled = this.currentPage === 0;
    this.nextPageBtn.disabled = this.currentPage >= totalPages - 1;

    this.rotateLeftBtn.disabled = this.selectedAssets.size === 0;
    this.rotateRightBtn.disabled = this.selectedAssets.size === 0;

    this.gallery.focus();
  }

  previousPage() {
    if (this.currentPage > 0) {
      this.currentPage--;
      this.renderPage(true);
    }
  }

  nextPage() {
    const totalPages = Math.ceil(this.allAssets.length / this.pageSize);
    if (this.currentPage < totalPages - 1) {
      this.currentPage++;
      this.renderPage(true);
    }
  }

  toggleSelection(assetId) {
    if (this.selectedAssets.has(assetId)) {
      this.selectedAssets.delete(assetId);
    } else {
      this.selectedAssets.add(assetId);
    }

    const item = this.gallery.querySelector(`[data-asset-id="${assetId}"]`);
    if (item) {
      item.classList.toggle('selected');
    }

    this.updatePaginationUI();
  }

  reloadAsset(img, assetId) {
    this.queueReload(img, assetId);
  }

  queueReload(img, assetId) {
    this.reloadQueue.set(assetId, img);

    if (this.reloadDebounceTimer) {
      clearTimeout(this.reloadDebounceTimer);
    }

    this.reloadDebounceTimer = setTimeout(() => {
      this.flushReloadQueue();
    }, this.reloadDebounceMs);
  }

  flushReloadQueue() {
    if (this.reloadQueue.size === 0) return;

    for (const [assetId, img] of this.reloadQueue.entries()) {
      if (!img) continue;
      img.src = `${this.host}/api/assets/${assetId}/thumbnail?edited=true&apiKey=${this.apiKey}&t=${Date.now()}`;
    }

    this.reloadQueue.clear();
    this.reloadDebounceTimer = null;
  }

  async rotateSelected(angle) {
    if (this.selectedAssets.size === 0) {
      this.setStatus('No images selected', 'error');
      return;
    }

    this.loadBtn.disabled = true;
    this.rotateLeftBtn.disabled = true;
    this.rotateRightBtn.disabled = true;

    const selectedArray = Array.from(this.selectedAssets);
    const failed = [];

    for (let i = 0; i < selectedArray.length; i++) {
      const assetId = selectedArray[i];
      try {
        await this.rotateAsset(assetId, angle);
        this.selectedAssets.delete(assetId);

        const item = this.gallery.querySelector(`[data-asset-id="${assetId}"]`);
        if (item) {
          item.classList.remove('selected');
          const img = item.querySelector('img');
          if (img) {
            // this.reloadAsset(img, assetId);
            await new Promise((resolve) => setTimeout(resolve, 400));
            img.src = `${this.host}/api/assets/${assetId}/thumbnail?edited=true&apiKey=${this.apiKey}&t=${Date.now()}`;
          }
        }

        this.setStatus(
          `Rotating... ${i + 1}/${selectedArray.length}`,
          'loading'
        );
      } catch (error) {
        console.error(`Error rotating ${assetId}:`, error);
        failed.push(assetId);
      }
    }

    this.updatePaginationUI();

    if (failed.length === 0) {
      this.setStatus(
        `Successfully rotated ${selectedArray.length} image(s)`,
        'success'
      );
    } else {
      this.setStatus(
        `Rotated ${selectedArray.length - failed.length}/${selectedArray.length}. Failed: ${failed.length}`,
        'error'
      );
    }

    this.loadBtn.disabled = false;
    this.rotateLeftBtn.disabled = this.selectedAssets.size === 0;
    this.rotateRightBtn.disabled = this.selectedAssets.size === 0;
  }

  async rotateAsset(assetId, angle) {
    const { url, headers } = this.getApiConfig(`/api/assets/${assetId}/edits`);

    const current = await fetch(url, { headers });

    let currentRotation = 0;
    if (current.ok) {
      const data = await current.json();
      if (data && data.edits) {
        const action = data.edits.find((_) => _.action === 'rotate');
        if (action) {
          currentRotation = action.parameters.angle || 0;
        }
      }
    }

    const range = 360;
    angle = (((currentRotation + angle) % range) + range) % range;

    const response = await fetch(url, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        assetId,
        edits: [
          {
            action: 'rotate',
            parameters: {
              angle,
            },
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Failed to rotate: ${response.status} ${response.statusText}`
      );
    }

    return response.json();
  }
}

// Initialize the app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new ImmichMassRotate();
});

document.addEventListener('keydown', (e) => {
  if (e.code == 'Space') {
    if (e.target.id !== 'gallery') {
      $('#gallery').focus();
    }
  }
});
