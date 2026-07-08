class CommandPalette extends HTMLElement {
  constructor() {
    super();
    this._baseCommands = [];
    this._commands = [];
    this._filtered = [];
    this._selectedIndex = 0;
    this._isDrillDown = false;
    this._fallback = null;
    this._defaultPlaceholder = 'Type a command...';
    this._handleGlobalKeydown = this._handleGlobalKeydown.bind(this);
    this._handlePanelKeydown = this._handlePanelKeydown.bind(this);
    this._handleInput = this._handleInput.bind(this);
    this._handleClick = this._handleClick.bind(this);
    this._handleBackdropClick = this._handleBackdropClick.bind(this);
    this._handleCommand = this._handleCommand.bind(this);
  }

  connectedCallback() {
    this._buildDOM();
    this._loadCommands();
    document.addEventListener('keydown', this._handleGlobalKeydown);
    this.addEventListener('command', this._handleCommand);
  }

  disconnectedCallback() {
    document.removeEventListener('keydown', this._handleGlobalKeydown);
  }

  _buildDOM() {
    const style = document.createElement('style');
    style.textContent = /* CSS */`
      command-palette {
        --cp-surface: #ffffff;
        --cp-surface-2: #f4f4f5;
        --cp-border: #d4d4d8;
        --cp-text: #18181b;
        --cp-text-dim: #71717a;
        --cp-accent: #4f46e5;
        --cp-accent-dim: rgba(79, 70, 229, 0.1);
      }

      @media (prefers-color-scheme: dark) {
        command-palette {
          --cp-surface: #1a1d27;
          --cp-surface-2: #242736;
          --cp-border: #2e3248;
          --cp-text: #e8e9f0;
          --cp-text-dim: #8b8fa8;
          --cp-accent: #6c63ff;
          --cp-accent-dim: rgba(108, 99, 255, 0.2);
        }
      }

      command-palette dialog.palette-dialog {
        position: fixed;
        inset: 0;
        margin: 15vh auto auto;
        width: 90vw;
        max-width: 520px;
        height: fit-content;
        border: 1px solid var(--border, var(--cp-border));
        border-radius: 12px;
        padding: 0;
        background: var(--surface, var(--cp-surface));
        color: var(--text, var(--cp-text));
        box-shadow: 0 16px 48px rgba(0, 0, 0, 0.2);
        overflow: hidden;
      }

      command-palette dialog.palette-dialog::backdrop {
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
      }

      command-palette .palette-input-wrap {
        display: flex;
        align-items: center;
        border-bottom: 1px solid var(--border, var(--cp-border));
        padding: 0 1rem;
        gap: 0.5rem;
      }

      command-palette .palette-icon {
        flex-shrink: 0;
        color: var(--text-dim, var(--cp-text-dim));
        font-size: 1rem;
        line-height: 1;
      }

      command-palette .palette-back {
        flex-shrink: 0;
        background: var(--accent-dim, var(--cp-accent-dim));
        color: var(--accent, var(--cp-accent));
        border: 1px solid var(--accent, var(--cp-accent));
        border-radius: 4px;
        padding: 0.1em 0.5em;
        font-size: 0.75rem;
        font-family: inherit;
        cursor: pointer;
        line-height: 1.4;
        display: none;
      }

      command-palette .palette-back[data-visible] {
        display: inline-block;
      }

      command-palette .palette-input {
        width: 100%;
        border: none;
        outline: none;
        background: transparent;
        color: var(--text, var(--cp-text));
        font-family: inherit;
        font-size: 1rem;
        padding: 0.875rem 0;
        line-height: 1.4;
      }

      command-palette .palette-input::placeholder {
        color: var(--text-dim, var(--cp-text-dim));
      }

      command-palette .palette-kbd {
        flex-shrink: 0;
        background: var(--surface-2, var(--cp-surface-2));
        border: 1px solid var(--border, var(--cp-border));
        border-radius: 4px;
        padding: 0.15em 0.4em;
        font-size: 0.75rem;
        font-family: inherit;
        color: var(--text-dim, var(--cp-text-dim));
      }

      command-palette .palette-list {
        max-height: 300px;
        overflow-y: auto;
        padding: 0.375rem;
      }

      command-palette .palette-item {
        padding: 0.6rem 0.75rem;
        border-radius: 8px;
        cursor: pointer;
        font-size: 0.9rem;
        transition: background 0.08s;
        line-height: 1.4;
      }

      command-palette .palette-item:hover {
        background: var(--accent-dim, var(--cp-accent-dim));
      }

      command-palette .palette-item[aria-selected="true"] {
        background: var(--accent, var(--cp-accent));
        color: #fff;
        white-space: preserve-spaces;
      }

      command-palette .palette-item[aria-selected="true"] mark {
        background: var(--accent, var(--cp-accent));
        color: inherit;
        text-decoration: underline;
        text-underline-offset: 2px;
      }

      command-palette .palette-fallback {
        color: var(--text-dim, var(--cp-text-dim));
        font-style: italic;
      }

      command-palette .palette-fallback[aria-selected="true"] {
        color: #fff;
      }

      command-palette .palette-empty {
        padding: 1.5rem 0.75rem;
        text-align: center;
        color: var(--text-dim, var(--cp-text-dim));
        font-size: 0.875rem;
      }

      command-palette mark {
        background: var(--accent-dim, var(--cp-accent-dim));
        color: var(--accent, var(--cp-accent));
        border-radius: 2px;
        padding: 0;
        transition: background 0.08s;
      }

      command-palette .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }
    `;
    this.appendChild(style);

    this._panel = document.createElement('dialog');
    this._panel.className = 'palette-dialog';
    this._panel.innerHTML = `
      <div class="palette-input-wrap">
        <span class="palette-icon">&rsaquo;</span>
        <button class="palette-back" type="button" aria-label="Back to commands">&larr; back</button>
        <input class="palette-input" type="text" placeholder="${this._defaultPlaceholder}" autocomplete="off" spellcheck="false">
        <kbd class="palette-kbd">esc</kbd>
      </div>
      <div class="palette-list" role="listbox" aria-label="Commands"></div>
      <span class="sr-only" aria-live="polite"></span>
    `;
    this.appendChild(this._panel);

    this._input = this._panel.querySelector('.palette-input');
    this._list = this._panel.querySelector('.palette-list');
    this._liveRegion = this._panel.querySelector('.sr-only');
    this._backBtn = this._panel.querySelector('.palette-back');

    this._input.addEventListener('input', this._handleInput);
    this._panel.addEventListener('keydown', this._handlePanelKeydown);
    this._list.addEventListener('click', this._handleClick);
    this._panel.addEventListener('click', this._handleBackdropClick);
    this._backBtn.addEventListener('click', () => this._resetToBase());

    this._panel.addEventListener('close', () => {
      this._input.value = '';
      this._resetState();
    });
  }

  _loadCommands() {
    const script = document.querySelector('script[type="application/json"][data-palette]');
    if (!script) return;
    try {
      this._baseCommands = JSON.parse(script.textContent);
      this._commands = [...this._baseCommands];
    } catch (e) {
      console.error('command-palette: invalid JSON in <script data-palette>', e);
    }
  }

  setCommands(commands, options = {}) {
    this._commands = commands;
    this._filtered = commands.map((cmd) => ({ cmd, indices: [] }));
    this._selectedIndex = 0;
    this._isDrillDown = true;
    this._input.value = '';

    if (options.placeholder) {
      this._input.placeholder = options.placeholder;
    }

    this._backBtn.setAttribute('data-visible', '');

    if (options.label) {
      this._list.setAttribute('aria-label', options.label);
    }

    this._render();
    this._input.focus();
    this._liveRegion.textContent = `${commands.length} items`;
  }

  // Replace the root command list (not a drill-down). Use this when your
  // commands change over time — e.g. a list backed by application state.
  // If the palette is open and at the root, it re-filters in place.
  setBaseCommands(commands) {
    this._baseCommands = Array.isArray(commands) ? [...commands] : [];
    if (this._isDrillDown) return;
    this._commands = [...this._baseCommands];
    if (!this._input) return;
    this._filtered = this._matchCommands(this._input.value);
    if (this._selectedIndex >= this._filtered.length) this._selectedIndex = 0;
    this._render();
  }

  // Configure a fallback shown when the user's query matches nothing in the
  // root list — useful for "404-like" searching (e.g. "Search the web for X").
  // Pass a command object, or a function (query) => command | null for a
  // dynamic description. Pass null to clear. The fallback does not apply while
  // drilled down (setCommands); it's a property of the root list.
  setFallback(fallback) {
    this._fallback = fallback || null;
    if (!this._input) return;
    this._filtered = this._matchCommands(this._input.value);
    if (this._selectedIndex >= this._filtered.length) this._selectedIndex = 0;
    this._render();
  }

  _resolveFallback(query) {
    if (!this._fallback) return null;
    const fb = typeof this._fallback === 'function' ? this._fallback(query) : this._fallback;
    return fb || null;
  }

  open() {
    if (this._panel.open) return;
    if (typeof this.onBeforeOpen === 'function') {
      try { this.onBeforeOpen(); } catch (e) { console.error('command-palette: onBeforeOpen threw', e); }
    }
    this._input.value = '';
    this._filtered = this._commands.map((cmd) => ({ cmd, indices: [] }));
    this._selectedIndex = 0;
    this._render();
    this._panel.showModal();
    this._input.focus();
  }

  close() {
    if (!this._panel.open) return;
    this._panel.close();
  }

  _resetState() {
    this._commands = [...this._baseCommands];
    this._isDrillDown = false;
    this._input.placeholder = this._defaultPlaceholder;
    this._backBtn.removeAttribute('data-visible');
    this._list.setAttribute('aria-label', 'Commands');
  }

  _resetToBase() {
    this._resetState();
    this._input.value = '';
    this._filtered = this._commands.map((cmd) => ({ cmd, indices: [] }));
    this._selectedIndex = 0;
    this._render();
    this._input.focus();
    this._liveRegion.textContent = `${this._commands.length} commands`;
  }

  _handleGlobalKeydown(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      e.stopPropagation();
      if (this._panel.open) {
        this.close();
      } else {
        this.open();
      }
      return;
    }

    if (!this.hasAttribute('open-on-type') || this._panel.open) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key.length !== 1) return;
    if (this._isEditableTarget(document.activeElement)) return;

    // "/" opens without populating — matches common search-shortcut convention (e.g. GitHub).
    if (e.key === '/') {
      e.preventDefault();
      this.open();
      return;
    }
    if (e.key === ' ') return;

    e.preventDefault();
    this.open();
    this._input.value = e.key;
    this._handleInput();
  }

  _isEditableTarget(el) {
    if (!el) return false;
    const tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    return el.isContentEditable === true;
  }

  _handleBackdropClick(e) {
    if (e.target === this._panel) this._panel.close();
  }

  _handleCommand(e) {
    if (e.command === '--open') this.open();
    else if (e.command === '--close') this.close();
    else if (e.command === '--toggle') this._panel.open ? this.close() : this.open();
  }

  _handlePanelKeydown(e) {
    if (e.key === 'Backspace' && this._isDrillDown && this._input.value === '') {
      e.preventDefault();
      this._resetToBase();
      return;
    }

    const len = this._filtered.length;
    if (!len) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this._selectedIndex = (this._selectedIndex + 1) % len;
      this._updateSelection();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this._selectedIndex = (this._selectedIndex - 1 + len) % len;
      this._updateSelection();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const entry = this._filtered[this._selectedIndex];
      if (entry) this._select(entry.cmd, entry.isFallback);
    }
  }

  _handleInput() {
    this._filtered = this._matchCommands(this._input.value);
    this._selectedIndex = 0;
    this._render();
  }

  _handleClick(e) {
    const item = e.target.closest('.palette-item');
    if (!item) return;
    const index = parseInt(item.dataset.index, 10);
    const entry = this._filtered[index];
    if (entry) this._select(entry.cmd, entry.isFallback);
  }

  _matchCommands(rawQuery) {
    const query = rawQuery.trim();
    if (!query) {
      return this._commands.map((cmd) => ({ cmd, indices: [], score: 0 }));
    }
    const results = [];
    for (const cmd of this._commands) {
      const m = this._fuzzyMatch(query, cmd.description);
      if (m) results.push({ cmd, indices: m.indices, score: m.score });
    }
    results.sort((a, b) => b.score - a.score);
    if (!results.length && !this._isDrillDown) {
      const fallback = this._resolveFallback(query);
      if (fallback) return [{ cmd: fallback, indices: [], score: 0, isFallback: true }];
    }
    return results;
  }

  _fuzzyMatch(query, target) {
    const q = query.toLowerCase();
    const t = target.toLowerCase();
    const indices = [];
    let qi = 0;
    for (let ti = 0; ti < t.length && qi < q.length; ti++) {
      if (t[ti] === q[qi]) {
        indices.push(ti);
        qi++;
      }
    }
    if (qi < q.length) return null;

    let score = 0;
    let run = 0;
    for (let i = 0; i < indices.length; i++) {
      const idx = indices[i];
      if (i > 0 && idx === indices[i - 1] + 1) {
        run++;
        score += 6 + run * 3;
      } else {
        run = 0;
        score += 1;
      }
      const prev = idx > 0 ? t[idx - 1] : ' ';
      if (/[\s\-_/(.]/.test(prev)) score += 5;
    }
    score -= indices[0] * 0.05;
    return { score, indices };
  }

  _select(command, isFallback = false) {
    const query = this._input.value.trim();
    if (command.keepOpen) {
      this._input.value = '';
    } else {
      this.close();
    }
    const detail = { command, query };
    if (isFallback) detail.isFallback = true;
    // Per-command event — listen for a single command by its name.
    if (command.name) {
      this.dispatchEvent(new CustomEvent(command.name, { bubbles: true, detail }));
    }
    // System event — one listener fires for every selection. The "@" prefix
    // marks it as a built-in event so it can never collide with a command name.
    this.dispatchEvent(new CustomEvent('@select', { bubbles: true, detail }));
  }

  _render() {
    const query = this._input.value.trim();
    this._list.innerHTML = '';

    if (!this._filtered.length) {
      const empty = document.createElement('div');
      empty.className = 'palette-empty';
      empty.textContent = query ? 'No matching commands' : 'No commands defined';
      this._list.appendChild(empty);
      return;
    }

    this._filtered.forEach((entry, i) => {
      const el = document.createElement('div');
      el.className = 'palette-item';
      if (entry.isFallback) el.classList.add('palette-fallback');
      el.setAttribute('role', 'option');
      el.dataset.index = i;

      if (i === this._selectedIndex) {
        el.setAttribute('aria-selected', 'true');
      }

      el.innerHTML = this._renderHighlight(entry.cmd.description, entry.indices);

      this._list.appendChild(el);
    });
  }

  _renderHighlight(text, indices) {
    if (!indices || !indices.length) return this._esc(text);
    let html = '';
    let i = 0;
    let mi = 0;
    while (i < text.length) {
      if (mi < indices.length && i === indices[mi]) {
        const start = i;
        while (mi < indices.length && i === indices[mi]) {
          mi++;
          i++;
        }
        html += `<mark>${this._esc(text.slice(start, i))}</mark>`;
      } else {
        html += this._esc(text[i]);
        i++;
      }
    }
    return html;
  }

  _updateSelection() {
    const items = this._list.querySelectorAll('.palette-item');
    items.forEach((el, i) => {
      if (i === this._selectedIndex) {
        el.setAttribute('aria-selected', 'true');
        el.scrollIntoView({ block: 'nearest' });
      } else {
        el.removeAttribute('aria-selected');
      }
    });
  }

  _esc(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

customElements.define('command-palette', CommandPalette);
