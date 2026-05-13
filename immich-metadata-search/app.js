const $ = (s, ctx = document) => ctx.querySelector(s);

const DOWNLOAD_BATCH_SIZE = 100;
const DEFAULT_PAGE_SIZE = 250;

const DEFAULT_CUSTOM_FILTER = `// "assets" is the raw items array from the /search/metadata response.
// Return an array of assets to render & download.
// Example: return assets.filter(a => a.exifInfo?.fNumber < 2.8);
return assets;`;

const SEARCH_FIELDS = [
  { key: 'size', label: 'Size (per page)', type: 'number', min: 1, max: 1000, description: `Results per request (default: ${DEFAULT_PAGE_SIZE}). Auto-paginates unless Page is set.` },
  { key: 'page', label: 'Page', type: 'number', min: 1, description: 'Page number. If set, only that page is fetched (no auto-pagination).' },
  { key: 'type', label: 'Type', type: 'enum', options: ['IMAGE', 'VIDEO', 'AUDIO', 'OTHER'], description: 'Asset type filter' },
  { key: 'isFavorite', label: 'Is Favorite', type: 'boolean', description: 'Filter by favorite status' },
  { key: 'isMotion', label: 'Is Motion', type: 'boolean', description: 'Filter by motion photo status' },
  { key: 'isEncoded', label: 'Is Encoded', type: 'boolean', description: 'Filter by encoded status' },
  { key: 'isOffline', label: 'Is Offline', type: 'boolean', description: 'Filter by offline status' },
  { key: 'isNotInAlbum', label: 'Not In Album', type: 'boolean', description: 'Filter assets not in any album' },
  { key: 'withDeleted', label: 'With Deleted', type: 'boolean', description: 'Include deleted assets' },
  { key: 'withExif', label: 'With EXIF', type: 'boolean', description: 'Include EXIF data in response' },
  { key: 'withPeople', label: 'With People', type: 'boolean', description: 'Include people data in response' },
  { key: 'withStacked', label: 'With Stacked', type: 'boolean', description: 'Include stacked assets' },
  { key: 'takenAfter', label: 'Taken After', type: 'datetime', description: 'Filter by taken date (after)' },
  { key: 'takenBefore', label: 'Taken Before', type: 'datetime', description: 'Filter by taken date (before)' },
  { key: 'createdAfter', label: 'Created After', type: 'datetime', description: 'Filter by creation date (after)' },
  { key: 'createdBefore', label: 'Created Before', type: 'datetime', description: 'Filter by creation date (before)' },
  { key: 'updatedAfter', label: 'Updated After', type: 'datetime', description: 'Filter by update date (after)' },
  { key: 'updatedBefore', label: 'Updated Before', type: 'datetime', description: 'Filter by update date (before)' },
  { key: 'trashedAfter', label: 'Trashed After', type: 'datetime', description: 'Filter by trash date (after)' },
  { key: 'trashedBefore', label: 'Trashed Before', type: 'datetime', description: 'Filter by trash date (before)' },
  { key: 'city', label: 'City', type: 'string', nullable: true, description: 'Filter by city name' },
  { key: 'country', label: 'Country', type: 'string', nullable: true, description: 'Filter by country name' },
  { key: 'state', label: 'State / Province', type: 'string', nullable: true, description: 'Filter by state/province name' },
  { key: 'make', label: 'Camera Make', type: 'string', description: 'Filter by camera make' },
  { key: 'model', label: 'Camera Model', type: 'string', nullable: true, description: 'Filter by camera model' },
  { key: 'lensModel', label: 'Lens Model', type: 'string', nullable: true, description: 'Filter by lens model' },
  { key: 'rating', label: 'Rating', type: 'number', nullable: true, min: 1, max: 5, description: 'Filter by rating [1–5], or ∅ for unrated' },
  { key: 'order', label: 'Sort Order', type: 'enum', options: ['asc', 'desc'], description: 'Sort order' },
  { key: 'visibility', label: 'Visibility', type: 'enum', options: ['archive', 'hidden', 'locked', 'timeline'], description: 'Filter by visibility' },
  { key: 'originalFileName', label: 'File Name', type: 'string', description: 'Filter by original file name' },
  { key: 'originalPath', label: 'Original Path', type: 'string', description: 'Filter by original file path' },
  { key: 'description', label: 'Description', type: 'string', description: 'Filter by description text' },
  { key: 'ocr', label: 'OCR Text', type: 'string', description: 'Filter by OCR text content' },
  { key: 'checksum', label: 'Checksum', type: 'string', description: 'Filter by file checksum' },
  { key: 'id', label: 'Asset ID', type: 'string', description: 'Filter by asset ID' },
  { key: 'libraryId', label: 'Library ID', type: 'string', nullable: true, description: 'Library ID to filter by' },
  { key: 'deviceId', label: 'Device ID', type: 'string', description: 'Device ID to filter by' },
  { key: 'deviceAssetId', label: 'Device Asset ID', type: 'string', description: 'Filter by device asset ID' },
  { key: 'albumIds', label: 'Album IDs', type: 'uuid-array', description: 'Filter by album IDs (comma-separated)' },
  { key: 'personIds', label: 'Person IDs', type: 'uuid-array', description: 'Filter by person IDs (comma-separated)' },
  { key: 'tagIds', label: 'Tag IDs', type: 'uuid-array', nullable: true, description: 'Filter by tag IDs (comma-separated)' },
  { key: 'encodedVideoPath', label: 'Encoded Video Path', type: 'string', description: 'Filter by encoded video file path' },
  { key: 'previewPath', label: 'Preview Path', type: 'string', description: 'Filter by preview file path' },
  { key: 'thumbnailPath', label: 'Thumbnail Path', type: 'string', description: 'Filter by thumbnail file path' },
];

class ImmichMetadataSearch {
  constructor() {
    this.host = '';
    this.apiKey = '';
    this.useProxy = false;
    this.proxy = '';
    this.rawAssets = [];
    this.allAssets = [];
    this.selectedAssets = new Set();
    this.lastResponses = [];
    this.isLoading = false;
    this.isDownloading = false;

    this.initElements();
    this.renderFields();
    this.attachEventListeners();
    this.loadFromLocalStorage();
  }

  initElements() {
    this.hostInput = $('#host');
    this.apiKeyInput = $('#apiKey');
    this.fieldFilterInput = $('#fieldFilter');
    this.searchFieldsContainer = $('#searchFields');
    this.clearFieldsBtn = $('#clearFieldsBtn');
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
    this.sidebar = document.querySelector('.sidebar');
    this.toggleSidebarBtn = $('#toggleSidebarBtn');
    this.showConfigBtn = $('#showConfigBtn');
    this.responseDetails = $('#responseDetails');
    this.responseJson = $('#responseJson');
    this.responseInfo = $('#responseInfo');
    this.customFilterInput = $('#customFilter');
    this.applyFilterBtn = $('#applyFilterBtn');
    this.filterError = $('#filterError');
  }

  // ── Field form ──────────────────────────────────────────────

  renderFields() {
    this.searchFieldsContainer.innerHTML = '';
    for (const field of SEARCH_FIELDS) {
      const row = document.createElement('div');
      row.className = 'field-row';
      row.dataset.key = field.key;

      const header = document.createElement('div');
      header.className = 'field-header';

      const label = document.createElement('label');
      label.className = 'field-label';
      label.htmlFor = `field-${field.key}`;
      label.textContent = field.label;
      label.title = field.description;
      header.appendChild(label);

      if (field.nullable) {
        const nullBtn = document.createElement('button');
        nullBtn.type = 'button';
        nullBtn.className = 'null-btn';
        nullBtn.textContent = '∅ null';
        nullBtn.title = `Match assets where "${field.label}" is null`;
        nullBtn.addEventListener('click', () => this.toggleNull(field.key));
        header.appendChild(nullBtn);
      }

      row.appendChild(header);

      const input = this.createFieldInput(field);
      input.id = `field-${field.key}`;
      input.addEventListener('change', () => this.onFieldChange(field.key, row));
      input.addEventListener('input', () => this.onFieldChange(field.key, row));
      row.appendChild(input);

      this.searchFieldsContainer.appendChild(row);
    }
  }

  createFieldInput(field) {
    if (field.type === 'enum') {
      const sel = document.createElement('select');
      sel.className = 'field-input';
      const blank = document.createElement('option');
      blank.value = '';
      blank.textContent = '—';
      sel.appendChild(blank);
      for (const opt of field.options) {
        const o = document.createElement('option');
        o.value = opt;
        o.textContent = opt;
        sel.appendChild(o);
      }
      return sel;
    }

    if (field.type === 'boolean') {
      const sel = document.createElement('select');
      sel.className = 'field-input';
      for (const [val, text] of [['', '—'], ['true', 'Yes (true)'], ['false', 'No (false)']]) {
        const o = document.createElement('option');
        o.value = val;
        o.textContent = text;
        sel.appendChild(o);
      }
      return sel;
    }

    if (field.type === 'datetime') {
      const inp = document.createElement('input');
      inp.type = 'datetime-local';
      inp.className = 'field-input';
      return inp;
    }

    if (field.type === 'number') {
      const inp = document.createElement('input');
      inp.type = 'number';
      inp.className = 'field-input';
      if (field.min !== undefined) inp.min = field.min;
      if (field.max !== undefined) inp.max = field.max;
      inp.placeholder = field.description;
      return inp;
    }

    if (field.type === 'uuid-array') {
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.className = 'field-input';
      inp.placeholder = 'uuid, uuid, …';
      return inp;
    }

    const inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'field-input';
    return inp;
  }

  onFieldChange(key, row) {
    row.classList.toggle('has-value', this.getFieldValue(key) !== undefined);
    this.saveFieldValues();
  }

  toggleNull(key) {
    const row = this.searchFieldsContainer.querySelector(`[data-key="${key}"]`);
    if (!row) return;
    const nullBtn = row.querySelector('.null-btn');
    const input = row.querySelector('.field-input');
    const isNull = nullBtn.classList.toggle('active');
    if (input) {
      input.disabled = isNull;
      if (isNull) input.value = '';
    }
    row.classList.toggle('has-value', isNull);
    this.saveFieldValues();
  }

  getFieldValue(key) {
    const row = this.searchFieldsContainer.querySelector(`[data-key="${key}"]`);
    if (!row) return undefined;

    const nullBtn = row.querySelector('.null-btn');
    if (nullBtn?.classList.contains('active')) return null;

    const input = row.querySelector('.field-input');
    if (!input || input.value === '') return undefined;

    const field = SEARCH_FIELDS.find((f) => f.key === key);
    if (field.type === 'boolean') return input.value === 'true';
    if (field.type === 'number') return Number(input.value);
    if (field.type === 'datetime') {
      try { return new Date(input.value).toISOString(); } catch { return undefined; }
    }
    if (field.type === 'uuid-array') {
      const arr = input.value.split(',').map((s) => s.trim()).filter(Boolean);
      return arr.length ? arr : undefined;
    }
    return input.value;
  }

  setFieldValue(key, value) {
    const row = this.searchFieldsContainer.querySelector(`[data-key="${key}"]`);
    if (!row) return;

    const nullBtn = row.querySelector('.null-btn');
    const input = row.querySelector('.field-input');

    if (value === null && nullBtn) {
      nullBtn.classList.add('active');
      if (input) { input.disabled = true; input.value = ''; }
      row.classList.add('has-value');
      return;
    }

    if (!input) return;

    const field = SEARCH_FIELDS.find((f) => f.key === key);
    if (field.type === 'boolean') {
      input.value = value === true ? 'true' : 'false';
    } else if (field.type === 'datetime') {
      try { input.value = new Date(value).toISOString().slice(0, 16); } catch { /* skip */ }
    } else if (field.type === 'uuid-array') {
      input.value = Array.isArray(value) ? value.join(', ') : String(value);
    } else {
      input.value = String(value);
    }

    row.classList.toggle('has-value', input.value !== '');
  }

  buildQueryBody() {
    const body = {};
    for (const field of SEARCH_FIELDS) {
      const value = this.getFieldValue(field.key);
      if (value !== undefined) body[field.key] = value;
    }
    return body;
  }

  saveFieldValues() {
    localStorage.setItem('metaSearch_fields', JSON.stringify(this.buildQueryBody()));
  }

  loadFieldValues() {
    const raw = localStorage.getItem('metaSearch_fields');
    if (!raw) return;
    try {
      const saved = JSON.parse(raw);
      for (const field of SEARCH_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(saved, field.key)) {
          this.setFieldValue(field.key, saved[field.key]);
        }
      }
    } catch { /* ignore corrupt data */ }
  }

  filterFields(query) {
    const q = query.toLowerCase().trim();
    for (const row of this.searchFieldsContainer.querySelectorAll('.field-row')) {
      if (!q) { row.hidden = false; continue; }
      const key = row.dataset.key.toLowerCase();
      const labelEl = row.querySelector('.field-label');
      const label = labelEl ? labelEl.textContent.toLowerCase() : '';
      const matches = key.includes(q) || label.includes(q);
      row.hidden = !matches && !row.classList.contains('has-value');
    }
  }

  clearAllFields() {
    for (const row of this.searchFieldsContainer.querySelectorAll('.field-row')) {
      const input = row.querySelector('.field-input');
      if (input) { input.value = ''; input.disabled = false; }
      row.querySelector('.null-btn')?.classList.remove('active');
      row.classList.remove('has-value');
    }
    this.saveFieldValues();
  }

  // ── Custom JS filter ─────────────────────────────────────────

  applyCustomFilter(rawAssets) {
    const code = this.customFilterInput.value.trim();
    this.filterError.hidden = true;
    this.filterError.textContent = '';

    if (!code) return rawAssets.slice();

    try {
      const fn = new Function('assets', code);
      const result = fn(rawAssets.slice());
      if (!Array.isArray(result)) {
        throw new Error(`Filter must return an array (got ${typeof result})`);
      }
      return result;
    } catch (err) {
      this.filterError.textContent = `${err.name}: ${err.message}`;
      this.filterError.hidden = false;
      console.error('Custom filter error:', err);
      return null;
    }
  }

  reapplyFilter() {
    if (!this.rawAssets.length) return;
    const filtered = this.applyCustomFilter(this.rawAssets);
    if (filtered === null) {
      // On error fall back to raw so the user can still inspect the data.
      this.allAssets = this.rawAssets.slice();
    } else {
      this.allAssets = filtered;
    }
    // Drop selections that are no longer visible.
    const visibleIds = new Set(this.allAssets.map((a) => a.id));
    for (const id of this.selectedAssets) {
      if (!visibleIds.has(id)) this.selectedAssets.delete(id);
    }
    this.renderGallery();
    this.setStatus(this.filterStatusMessage(), this.filterError.hidden ? 'success' : 'error');
  }

  filterStatusMessage() {
    const raw = this.rawAssets.length;
    const filtered = this.allAssets.length;
    if (!this.filterError.hidden) return 'Filter errored — showing raw results';
    if (raw === filtered) return `Found ${raw} asset${raw !== 1 ? 's' : ''}`;
    return `Filtered ${filtered} of ${raw} asset${raw !== 1 ? 's' : ''}`;
  }

  saveCustomFilter() {
    localStorage.setItem('metaSearch_customFilter', this.customFilterInput.value);
  }

  // ── Connection / persistence ─────────────────────────────────

  attachEventListeners() {
    this.searchBtn.addEventListener('click', () => this.search());
    this.downloadAllBtn.addEventListener('click', () =>
      this.downloadAssets(this.allAssets, 'all')
    );
    this.downloadSelectedBtn.addEventListener('click', () => {
      const selected = this.allAssets.filter((a) => this.selectedAssets.has(a.id));
      this.downloadAssets(selected, 'selected');
    });
    this.selectAllBtn.addEventListener('click', () => this.selectAll());
    this.deselectAllBtn.addEventListener('click', () => this.deselectAll());

    this.fieldFilterInput.addEventListener('input', () =>
      this.filterFields(this.fieldFilterInput.value)
    );
    this.clearFieldsBtn.addEventListener('click', () => this.clearAllFields());

    this.customFilterInput.addEventListener('input', () => this.saveCustomFilter());
    this.customFilterInput.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        this.reapplyFilter();
      }
    });
    this.applyFilterBtn.addEventListener('click', () => this.reapplyFilter());

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
    const useProxy = localStorage.getItem('metaSearch_useProxy') === 'true';
    const proxy = localStorage.getItem('metaSearch_proxy');
    const sidebarHidden = localStorage.getItem('metaSearch_sidebarHidden') === 'true';

    if (host) this.hostInput.value = host;
    if (apiKey) this.apiKeyInput.value = apiKey;
    if (proxy) this.proxyInput.value = proxy;

    this.useProxyInput.checked = useProxy;
    this.proxyGroup.hidden = !useProxy;

    if (sidebarHidden) {
      this.sidebar.classList.add('hidden');
      this.toggleSidebarBtn.textContent = 'Show Config';
      this.showConfigBtn.hidden = false;
    }

    this.loadFieldValues();

    const savedFilter = localStorage.getItem('metaSearch_customFilter');
    this.customFilterInput.value = savedFilter ?? DEFAULT_CUSTOM_FILTER;
  }

  toggleSidebar() {
    this.sidebar.classList.toggle('hidden');
    const isHidden = this.sidebar.classList.contains('hidden');
    localStorage.setItem('metaSearch_sidebarHidden', isHidden);
    this.toggleSidebarBtn.textContent = isHidden ? 'Show Config' : 'Hide Config';
    this.showConfigBtn.hidden = !isHidden;
  }

  handleKeyShortcuts(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

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

  // ── Search ───────────────────────────────────────────────────

  async search() {
    this.host = this.hostInput.value.trim().replace(/\/+$/, '');
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

    this.isLoading = true;
    this.searchBtn.disabled = true;
    this.rawAssets = [];
    this.allAssets = [];
    this.selectedAssets.clear();
    this.lastResponses = [];
    this.renderGallery();
    this.updateResponseViewer();
    this.setStatus('Searching…', 'loading');

    try {
      const queryBody = this.buildQueryBody();
      this.rawAssets = await this.fetchAllAssets(queryBody);
      const filtered = this.applyCustomFilter(this.rawAssets);
      this.allAssets = filtered === null ? this.rawAssets.slice() : filtered;
      this.renderGallery();
      this.updateResponseViewer();
      if (!this.rawAssets.length) {
        this.setStatus('No assets found', 'info');
      } else {
        this.setStatus(this.filterStatusMessage(), this.filterError.hidden ? 'success' : 'error');
      }
    } catch (error) {
      console.error('Search error:', error);
      this.setStatus(`Error: ${error.message}`, 'error');
      this.updateResponseViewer();
    } finally {
      this.isLoading = false;
      this.searchBtn.disabled = false;
      this.updateUI();
    }
  }

  async fetchAllAssets(queryBody) {
    const allAssets = [];
    const { page: userPage, size: userSize, ...baseQuery } = queryBody;
    const singlePageMode = userPage !== undefined;
    const size = userSize ?? DEFAULT_PAGE_SIZE;
    let page = userPage ?? 1;

    while (true) {
      const { url, headers } = this.getApiConfig('/api/search/metadata');
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...baseQuery, page, size }),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        this.lastResponses.push({ error: true, status: response.status, statusText: response.statusText, body: text });
        throw new Error(`API error ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      this.lastResponses.push(data);

      const items = data?.assets?.items ?? [];
      if (!items.length) break;

      allAssets.push(...items);
      this.setStatus(`Loading… ${allAssets.length} assets found`, 'loading');

      if (singlePageMode || !data.assets.nextPage) break;
      page = parseInt(data.assets.nextPage, 10);
    }

    return allAssets;
  }

  updateResponseViewer() {
    if (!this.lastResponses.length) {
      this.responseJson.textContent = 'Run a search to see the raw API response here.';
      this.responseInfo.textContent = '';
      return;
    }
    const payload = this.lastResponses.length === 1 ? this.lastResponses[0] : this.lastResponses;
    this.responseJson.textContent = JSON.stringify(payload, null, 2);
    const pages = this.lastResponses.length;
    const bytes = this.responseJson.textContent.length;
    this.responseInfo.textContent = `— ${pages} page${pages !== 1 ? 's' : ''}, ${this.formatBytes(bytes)}`;
  }

  formatBytes(n) {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(2)} MB`;
  }

  // ── Gallery ──────────────────────────────────────────────────

  renderGallery() {
    this.gallery.innerHTML = '';

    if (!this.allAssets.length) {
      const empty = document.createElement('div');
      empty.className = 'gallery-empty';
      empty.innerHTML = `
        <svg width="48" height="48" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" fill="currentColor"/>
        </svg>
        <p>Run a search to see results here</p>`;
      this.gallery.appendChild(empty);
      this.updateUI();
      return;
    }

    const frag = document.createDocumentFragment();
    this.allAssets.forEach((asset) => {
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

      frag.appendChild(item);
    });
    this.gallery.appendChild(frag);
    this.updateUI();
  }

  getThumbnailUrl(assetId) {
    const base = this.useProxy ? this.proxy : this.host;
    return `${base}/api/assets/${assetId}/thumbnail?apiKey=${this.apiKey}&edited=true&preview=true`;
  }

  updateUI() {
    this.pageInfo.textContent =
      this.selectedAssets.size > 0 ? `${this.selectedAssets.size} selected` : '';

    const hasAssets = this.allAssets.length > 0;
    this.downloadAllBtn.disabled = !hasAssets || this.isDownloading;
    this.downloadAllBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M5 20h14v-2H5v2zm7-18L5.33 9h3.84v6h5.66V9h3.84L12 2z" fill="currentColor"/></svg> Download All (${this.allAssets.length})`;
    this.downloadSelectedBtn.disabled = this.selectedAssets.size === 0 || this.isDownloading;
    this.downloadSelectedBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M5 20h14v-2H5v2zm7-18L5.33 9h3.84v6h5.66V9h3.84L12 2z" fill="currentColor"/></svg> Download Selected (${this.selectedAssets.size})`;

    this.selectAllBtn.disabled = !hasAssets;
    this.deselectAllBtn.disabled = this.selectedAssets.size === 0;
    this.applyFilterBtn.disabled = this.rawAssets.length === 0;
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
    this.gallery.querySelectorAll('.gallery-item').forEach((el) => el.classList.add('selected'));
    this.updateUI();
  }

  deselectAll() {
    this.selectedAssets.clear();
    this.gallery.querySelectorAll('.gallery-item').forEach((el) => el.classList.remove('selected'));
    this.updateUI();
  }

  // ── Download ─────────────────────────────────────────────────

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
          throw new Error(`Download failed (${response.status}): ${response.statusText}`);
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
