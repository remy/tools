class CommandPalette extends HTMLElement {
  constructor() {
    super();
    this._commands = [];
    this._filtered = [];
    this._selectedIndex = 0;
    this._handleGlobalKeydown = this._handleGlobalKeydown.bind(this);
    this._handleDialogKeydown = this._handleDialogKeydown.bind(this);
    this._handleInput = this._handleInput.bind(this);
    this._handleClick = this._handleClick.bind(this);
  }

  connectedCallback() {
    this._buildDOM();
    this._loadCommands();
    document.addEventListener('keydown', this._handleGlobalKeydown);
  }

  disconnectedCallback() {
    document.removeEventListener('keydown', this._handleGlobalKeydown);
  }

  _buildDOM() {
    const style = document.createElement('style');
    style.textContent = `
      command-palette dialog {
        border: none;
        border-radius: 12px;
        padding: 0;
        width: 90vw;
        max-width: 520px;
        background: var(--surface, #ffffff);
        color: var(--text, #18181b);
        box-shadow: 0 16px 48px rgba(0, 0, 0, 0.2);
        overflow: hidden;
      }

      command-palette dialog::backdrop {
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
      }

      command-palette .palette-input-wrap {
        display: flex;
        align-items: center;
        border-bottom: 1px solid var(--border, #d4d4d8);
        padding: 0 1rem;
        gap: 0.5rem;
      }

      command-palette .palette-icon {
        flex-shrink: 0;
        color: var(--text-dim, #71717a);
        font-size: 1rem;
        line-height: 1;
      }

      command-palette .palette-input {
        width: 100%;
        border: none;
        outline: none;
        background: transparent;
        color: var(--text, #18181b);
        font-family: inherit;
        font-size: 1rem;
        padding: 0.875rem 0;
        line-height: 1.4;
      }

      command-palette .palette-input::placeholder {
        color: var(--text-dim, #71717a);
      }

      command-palette .palette-kbd {
        flex-shrink: 0;
        background: var(--surface-2, #f4f4f5);
        border: 1px solid var(--border, #d4d4d8);
        border-radius: 4px;
        padding: 0.15em 0.4em;
        font-size: 0.75rem;
        font-family: inherit;
        color: var(--text-dim, #71717a);
      }

      command-palette .palette-list {
        max-height: 300px;
        overflow-y: auto;
        padding: 0.375rem;
      }

      command-palette .palette-item {
        display: flex;
        align-items: center;
        padding: 0.6rem 0.75rem;
        border-radius: 8px;
        cursor: pointer;
        font-size: 0.9rem;
        transition: background 0.08s;
        line-height: 1.4;
      }

      command-palette .palette-item:hover {
        background: var(--accent-dim, rgba(79, 70, 229, 0.1));
      }

      command-palette .palette-item[aria-selected="true"] {
        background: var(--accent, #4f46e5);
        color: #fff;
      }

      command-palette .palette-item[aria-selected="true"] mark {
        background: transparent;
        color: inherit;
        text-decoration: underline;
        text-underline-offset: 2px;
      }

      command-palette .palette-empty {
        padding: 1.5rem 0.75rem;
        text-align: center;
        color: var(--text-dim, #71717a);
        font-size: 0.875rem;
      }

      command-palette mark {
        background: var(--accent-dim, rgba(79, 70, 229, 0.1));
        color: var(--accent, #4f46e5);
        border-radius: 2px;
        padding: 0 1px;
      }
    `;
    this.appendChild(style);

    this._dialog = document.createElement('dialog');
    this._dialog.innerHTML = `
      <div class="palette-input-wrap">
        <span class="palette-icon">&rsaquo;</span>
        <input class="palette-input" type="text" placeholder="Type a command..." autocomplete="off" spellcheck="false">
        <kbd class="palette-kbd">esc</kbd>
      </div>
      <div class="palette-list" role="listbox"></div>
    `;
    this.appendChild(this._dialog);

    this._input = this._dialog.querySelector('.palette-input');
    this._list = this._dialog.querySelector('.palette-list');

    this._input.addEventListener('input', this._handleInput);
    this._dialog.addEventListener('keydown', this._handleDialogKeydown);
    this._list.addEventListener('click', this._handleClick);
    this._dialog.addEventListener('close', () => {
      this._input.value = '';
    });
  }

  _loadCommands() {
    const script = document.querySelector('script[type="application/json"][data-palette]');
    if (!script) return;
    try {
      this._commands = JSON.parse(script.textContent);
    } catch (e) {
      console.error('command-palette: invalid JSON in <script data-palette>', e);
    }
  }

  open() {
    if (this._dialog.open) return;
    this._input.value = '';
    this._filtered = [...this._commands];
    this._selectedIndex = 0;
    this._render();
    this._dialog.showModal();
    this._input.focus();
  }

  close() {
    if (!this._dialog.open) return;
    this._dialog.close();
  }

  _handleGlobalKeydown(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      e.stopPropagation();
      if (this._dialog.open) {
        this.close();
      } else {
        this.open();
      }
    }
  }

  _handleDialogKeydown(e) {
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
      const cmd = this._filtered[this._selectedIndex];
      if (cmd) this._select(cmd);
    }
  }

  _handleInput() {
    const query = this._input.value.trim().toLowerCase();
    if (!query) {
      this._filtered = [...this._commands];
    } else {
      this._filtered = this._commands.filter(
        (cmd) => cmd.description.toLowerCase().includes(query)
      );
    }
    this._selectedIndex = 0;
    this._render();
  }

  _handleClick(e) {
    const item = e.target.closest('.palette-item');
    if (!item) return;
    const index = parseInt(item.dataset.index, 10);
    const cmd = this._filtered[index];
    if (cmd) this._select(cmd);
  }

  _select(command) {
    this.close();
    this.dispatchEvent(
      new CustomEvent(command.name, {
        bubbles: true,
        detail: { command },
      })
    );
  }

  _render() {
    const query = this._input.value.trim().toLowerCase();
    this._list.innerHTML = '';

    if (!this._filtered.length) {
      const empty = document.createElement('div');
      empty.className = 'palette-empty';
      empty.textContent = query ? 'No matching commands' : 'No commands defined';
      this._list.appendChild(empty);
      return;
    }

    this._filtered.forEach((cmd, i) => {
      const el = document.createElement('div');
      el.className = 'palette-item';
      el.setAttribute('role', 'option');
      el.dataset.index = i;

      if (i === this._selectedIndex) {
        el.setAttribute('aria-selected', 'true');
      }

      if (query) {
        const desc = cmd.description;
        const idx = desc.toLowerCase().indexOf(query);
        if (idx !== -1) {
          const before = desc.slice(0, idx);
          const match = desc.slice(idx, idx + query.length);
          const after = desc.slice(idx + query.length);
          el.innerHTML = `${this._esc(before)}<mark>${this._esc(match)}</mark>${this._esc(after)}`;
        } else {
          el.textContent = desc;
        }
      } else {
        el.textContent = cmd.description;
      }

      this._list.appendChild(el);
    });
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
