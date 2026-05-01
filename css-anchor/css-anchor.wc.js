const AREA_PRESETS = [
  { label: '↖', value: 'top span-left',    title: 'top span-left' },
  { label: '↑', value: 'top',              title: 'top' },
  { label: '↗', value: 'top span-right',   title: 'top span-right' },
  { label: '←', value: 'left',             title: 'left' },
  { label: '◯', value: 'center',           title: 'center' },
  { label: '→', value: 'right',            title: 'right' },
  { label: '↙', value: 'bottom span-left', title: 'bottom span-left' },
  { label: '↓', value: 'bottom',           title: 'bottom' },
  { label: '↘', value: 'bottom span-right',title: 'bottom span-right' },
];

const FALLBACKS = [
  { value: 'flip-block',  label: 'flip-block' },
  { value: 'flip-inline', label: 'flip-inline' },
  { value: 'flip-start',  label: 'flip-start' },
];

const VISIBILITIES = [
  { value: 'always',           label: 'always' },
  { value: 'anchors-visible',  label: 'anchors-visible' },
  { value: 'no-overflow',      label: 'no-overflow' },
];

class CSSAnchorPlayground extends HTMLElement {
  constructor() {
    super();
    this.state = {
      area: 'bottom',
      fallbacks: [],
      visibility: 'always',
      sizeWidth: false,
      sizeHeight: false,
      margin: 8,
      anchorX: 50,
      anchorY: 50,
    };
    this._dragging = null;
  }

  connectedCallback() {
    this._injectStyles();
    this.innerHTML = /* HTML */ `
      <div class="layout">
        <aside class="controls">
          <section class="control-group">
            <h3>position-area</h3>
            <div class="area-grid" role="radiogroup" aria-label="position-area">
              ${AREA_PRESETS.map(p => `
                <button type="button" class="area-cell" data-area="${p.value}" title="${p.title}" aria-label="${p.title}">
                  <span aria-hidden="true">${p.label}</span>
                </button>
              `).join('')}
            </div>
            <div class="area-current"><code data-current-area></code></div>
          </section>

          <section class="control-group">
            <h3>position-try-fallbacks</h3>
            <div class="checks">
              ${FALLBACKS.map(f => `
                <label class="check">
                  <input type="checkbox" data-fallback value="${f.value}">
                  <span><code>${f.label}</code></span>
                </label>
              `).join('')}
            </div>
            <p class="hint">Scroll the anchor near an edge to see the popup flip.</p>
          </section>

          <section class="control-group">
            <h3>position-visibility</h3>
            <div class="radios">
              ${VISIBILITIES.map((v, i) => `
                <label class="radio">
                  <input type="radio" name="vis" value="${v.value}" ${i === 0 ? 'checked' : ''}>
                  <span><code>${v.label}</code></span>
                </label>
              `).join('')}
            </div>
            <p class="hint">Scroll the anchor off-screen to see this in action.</p>
          </section>

          <section class="control-group">
            <h3>anchor-size()</h3>
            <div class="checks">
              <label class="check">
                <input type="checkbox" data-size="width">
                <span>match anchor <code>width</code></span>
              </label>
              <label class="check">
                <input type="checkbox" data-size="height">
                <span>match anchor <code>height</code></span>
              </label>
            </div>
          </section>

          <section class="control-group">
            <h3>margin</h3>
            <div class="margin-row">
              <input type="range" min="0" max="40" step="1" value="8" data-margin>
              <output data-margin-out>8px</output>
            </div>
          </section>

          <section class="control-group">
            <button type="button" class="reset-btn" data-reset>Reset anchor position</button>
          </section>

          <section class="support" data-support>
            <span class="support-icon">🔍</span>
            <div>
              <div class="support-label">Checking browser support…</div>
              <div class="support-detail"></div>
            </div>
          </section>
        </aside>

        <div class="canvas-wrap" data-canvas-wrap>
          <div class="canvas" data-canvas>
            <div class="watermark">scroll me — drag the anchor anywhere</div>
            <div class="anchor" data-anchor tabindex="0" role="button" aria-label="Anchor (drag to move)">
              <span>⚓</span>
              <span class="anchor-label">anchor</span>
            </div>
            <div class="popup" data-popup>
              <strong>Anchored popup</strong>
              <span class="popup-meta" data-popup-meta></span>
            </div>
          </div>
        </div>

        <div class="code-block">
          <div class="code-header">
            <span>Generated CSS</span>
            <button type="button" class="copy-btn" data-copy>Copy</button>
          </div>
          <pre><code data-code></code></pre>
        </div>
      </div>
    `;

    this._cacheRefs();
    this._attachEvents();
    this._setArea(this.state.area);
    this._render();
    this._checkSupport();
  }

  _cacheRefs() {
    this.$canvasWrap = this.querySelector('[data-canvas-wrap]');
    this.$canvas = this.querySelector('[data-canvas]');
    this.$anchor = this.querySelector('[data-anchor]');
    this.$popup = this.querySelector('[data-popup]');
    this.$popupMeta = this.querySelector('[data-popup-meta]');
    this.$currentArea = this.querySelector('[data-current-area]');
    this.$marginInput = this.querySelector('[data-margin]');
    this.$marginOut = this.querySelector('[data-margin-out]');
    this.$code = this.querySelector('[data-code]');
    this.$copyBtn = this.querySelector('[data-copy]');
    this.$support = this.querySelector('[data-support]');
  }

  _attachEvents() {
    this.querySelectorAll('[data-area]').forEach(btn => {
      btn.addEventListener('click', () => this._setArea(btn.dataset.area));
    });

    this.querySelectorAll('[data-fallback]').forEach(cb => {
      cb.addEventListener('change', () => {
        this.state.fallbacks = [...this.querySelectorAll('[data-fallback]:checked')]
          .map(el => el.value);
        this._render();
      });
    });

    this.querySelectorAll('input[name="vis"]').forEach(r => {
      r.addEventListener('change', () => {
        this.state.visibility = r.value;
        this._render();
      });
    });

    this.querySelectorAll('[data-size]').forEach(cb => {
      cb.addEventListener('change', () => {
        if (cb.dataset.size === 'width') this.state.sizeWidth = cb.checked;
        if (cb.dataset.size === 'height') this.state.sizeHeight = cb.checked;
        this._render();
      });
    });

    this.$marginInput.addEventListener('input', () => {
      this.state.margin = Number(this.$marginInput.value);
      this.$marginOut.textContent = `${this.state.margin}px`;
      this._render();
    });

    this.querySelector('[data-reset]').addEventListener('click', () => {
      this.state.anchorX = 50;
      this.state.anchorY = 50;
      this._positionAnchor();
      this._centerOnAnchor();
    });

    this.$copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(this.$code.textContent);
        this.$copyBtn.textContent = 'Copied!';
        setTimeout(() => (this.$copyBtn.textContent = 'Copy'), 1200);
      } catch {
        this.$copyBtn.textContent = 'Failed';
        setTimeout(() => (this.$copyBtn.textContent = 'Copy'), 1200);
      }
    });

    // Drag the anchor (mouse + touch via pointer events)
    this.$anchor.addEventListener('pointerdown', (e) => this._startDrag(e));
    window.addEventListener('pointermove', (e) => this._onDrag(e));
    window.addEventListener('pointerup', (e) => this._endDrag(e));

    // Keyboard nudging (arrow keys when anchor focused)
    this.$anchor.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 5 : 1;
      let handled = true;
      if (e.key === 'ArrowLeft')  this.state.anchorX = Math.max(0, this.state.anchorX - step);
      else if (e.key === 'ArrowRight') this.state.anchorX = Math.min(100, this.state.anchorX + step);
      else if (e.key === 'ArrowUp')    this.state.anchorY = Math.max(0, this.state.anchorY - step);
      else if (e.key === 'ArrowDown')  this.state.anchorY = Math.min(100, this.state.anchorY + step);
      else handled = false;
      if (handled) {
        e.preventDefault();
        this._positionAnchor();
      }
    });

    this._positionAnchor();
  }

  _startDrag(e) {
    this._dragging = { pointerId: e.pointerId };
    this.$anchor.setPointerCapture?.(e.pointerId);
    this.$anchor.style.cursor = 'grabbing';
    e.preventDefault();
  }

  _onDrag(e) {
    if (!this._dragging || e.pointerId !== this._dragging.pointerId) return;
    const rect = this.$canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    this.state.anchorX = Math.max(0, Math.min(100, x));
    this.state.anchorY = Math.max(0, Math.min(100, y));
    this._positionAnchor();
  }

  _endDrag(e) {
    if (!this._dragging || e.pointerId !== this._dragging.pointerId) return;
    this.$anchor.releasePointerCapture?.(e.pointerId);
    this.$anchor.style.cursor = '';
    this._dragging = null;
  }

  _positionAnchor() {
    this.$anchor.style.left = `${this.state.anchorX}%`;
    this.$anchor.style.top  = `${this.state.anchorY}%`;
  }

  _centerOnAnchor() {
    const wrap = this.$canvasWrap;
    const a = this.$anchor.getBoundingClientRect();
    const w = wrap.getBoundingClientRect();
    wrap.scrollBy({
      left: a.left - w.left - w.width / 2 + a.width / 2,
      top:  a.top  - w.top  - w.height / 2 + a.height / 2,
      behavior: 'smooth',
    });
  }

  _setArea(area) {
    this.state.area = area;
    this.querySelectorAll('[data-area]').forEach(btn => {
      btn.classList.toggle('is-active', btn.dataset.area === area);
    });
    this.$currentArea.textContent = area;
    this._render();
  }

  _render() {
    const s = this.state;

    this.$popup.style.positionArea = s.area;
    this.$popup.style.margin = `${s.margin}px`;

    if (s.fallbacks.length) {
      this.$popup.style.positionTryFallbacks = s.fallbacks.join(', ');
    } else {
      this.$popup.style.positionTryFallbacks = '';
    }

    this.$popup.style.positionVisibility = s.visibility;

    this.$popup.style.width  = s.sizeWidth  ? 'anchor-size(width)'  : '';
    this.$popup.style.height = s.sizeHeight ? 'anchor-size(height)' : '';

    this.$popupMeta.textContent = s.area;

    // Build the equivalent CSS string for display
    const lines = [];
    lines.push(`.anchor {`);
    lines.push(`  anchor-name: --pg-anchor;`);
    lines.push(`}`);
    lines.push(``);
    lines.push(`.popup {`);
    lines.push(`  position: absolute;`);
    lines.push(`  position-anchor: --pg-anchor;`);
    lines.push(`  position-area: ${s.area};`);
    if (s.margin) lines.push(`  margin: ${s.margin}px;`);
    if (s.fallbacks.length) lines.push(`  position-try-fallbacks: ${s.fallbacks.join(', ')};`);
    if (s.visibility !== 'always') lines.push(`  position-visibility: ${s.visibility};`);
    if (s.sizeWidth)  lines.push(`  width: anchor-size(width);`);
    if (s.sizeHeight) lines.push(`  height: anchor-size(height);`);
    lines.push(`}`);
    this.$code.textContent = lines.join('\n');
  }

  _checkSupport() {
    const supported = CSS.supports?.('anchor-name', '--x') &&
                      CSS.supports?.('position-area', 'top');
    const label = this.$support.querySelector('.support-label');
    const detail = this.$support.querySelector('.support-detail');
    const icon = this.$support.querySelector('.support-icon');
    if (supported) {
      this.$support.classList.add('supported');
      icon.textContent = '✓';
      label.textContent = 'CSS Anchor Positioning supported';
      detail.textContent = 'All controls on this page are live.';
    } else {
      this.$support.classList.add('unsupported');
      icon.textContent = '⚠';
      label.textContent = 'Not supported in this browser';
      detail.innerHTML = 'Try Chrome 125+ or Edge 125+. Firefox & Safari do not yet ship anchor positioning. Controls still update the generated CSS.';
    }
  }

  _injectStyles() {
    if (document.getElementById('css-anchor-playground-styles')) return;
    const style = document.createElement('style');
    style.id = 'css-anchor-playground-styles';
    style.textContent = /* CSS */`
      css-anchor-playground {
        display: block;
      }

      css-anchor-playground .layout {
        display: grid;
        gap: 1rem;
        grid-template-columns: 1fr;
      }

      @media (min-width: 900px) {
        css-anchor-playground .layout {
          grid-template-columns: 280px 1fr;
          grid-template-areas:
            "controls canvas"
            "controls code";
        }
        css-anchor-playground .controls   { grid-area: controls; }
        css-anchor-playground .canvas-wrap { grid-area: canvas; }
        css-anchor-playground .code-block  { grid-area: code; }
      }

      css-anchor-playground .controls {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        padding: 1rem;
        display: flex;
        flex-direction: column;
        gap: 1.25rem;
      }

      css-anchor-playground .control-group h3 {
        font-size: 0.78rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--text-dim);
        margin-bottom: 0.5rem;
      }

      css-anchor-playground .area-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 4px;
        max-width: 200px;
      }

      css-anchor-playground .area-cell {
        aspect-ratio: 1;
        border: 1px solid var(--border);
        border-radius: 6px;
        background: var(--surface-2);
        color: var(--text);
        cursor: pointer;
        font-size: 1.1rem;
        line-height: 1;
        font-family: inherit;
        transition: all 0.15s;
      }

      css-anchor-playground .area-cell:hover {
        border-color: var(--accent);
        color: var(--accent);
      }

      css-anchor-playground .area-cell.is-active {
        background: var(--accent);
        border-color: var(--accent);
        color: #fff;
      }

      css-anchor-playground .area-current {
        margin-top: 0.5rem;
        font-size: 0.8rem;
        color: var(--text-dim);
      }

      css-anchor-playground .checks,
      css-anchor-playground .radios {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
      }

      css-anchor-playground .check,
      css-anchor-playground .radio {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.875rem;
        cursor: pointer;
      }

      css-anchor-playground .check input,
      css-anchor-playground .radio input {
        accent-color: var(--accent);
      }

      css-anchor-playground .hint {
        margin-top: 0.5rem;
        font-size: 0.75rem;
        color: var(--text-dim);
        font-style: italic;
      }

      css-anchor-playground .margin-row {
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }

      css-anchor-playground .margin-row input[type="range"] {
        flex: 1;
        accent-color: var(--accent);
      }

      css-anchor-playground .margin-row output {
        font-family: ui-monospace, monospace;
        font-size: 0.8rem;
        color: var(--text-dim);
        min-width: 3.5em;
        text-align: right;
      }

      css-anchor-playground .reset-btn {
        width: 100%;
        padding: 0.5rem 0.75rem;
        background: var(--surface-2);
        border: 1px solid var(--border);
        border-radius: 6px;
        color: var(--text);
        font: inherit;
        font-size: 0.875rem;
        cursor: pointer;
        transition: all 0.15s;
      }

      css-anchor-playground .reset-btn:hover {
        border-color: var(--accent);
        color: var(--accent);
      }

      css-anchor-playground .support {
        display: flex;
        align-items: flex-start;
        gap: 0.5rem;
        background: var(--surface-2);
        border: 1px solid var(--border);
        border-radius: 6px;
        padding: 0.6rem 0.75rem;
        font-size: 0.8rem;
        color: var(--text-dim);
      }

      css-anchor-playground .support.supported  { border-color: var(--green); }
      css-anchor-playground .support.unsupported { border-color: var(--orange); }

      css-anchor-playground .support-icon {
        font-size: 1rem;
        flex-shrink: 0;
      }

      css-anchor-playground .support-label {
        font-weight: 600;
        color: var(--text);
        margin-bottom: 0.15rem;
      }

      css-anchor-playground .support.supported .support-label  { color: var(--green); }
      css-anchor-playground .support.unsupported .support-label { color: var(--orange); }

      /* ─── Canvas ─── */
      css-anchor-playground .canvas-wrap {
        position: relative;
        height: clamp(320px, 60vh, 640px);
        overflow: auto;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--surface);
        overscroll-behavior: contain;
      }

      css-anchor-playground .canvas {
        position: relative;
        width: 250%;
        height: 250%;
        background-image:
          linear-gradient(var(--border) 1px, transparent 1px),
          linear-gradient(90deg, var(--border) 1px, transparent 1px);
        background-size: 32px 32px;
        background-position: 0 0;
      }

      css-anchor-playground .watermark {
        position: absolute;
        top: 1rem;
        left: 1rem;
        color: var(--text-dim);
        font-size: 0.8rem;
        pointer-events: none;
        background: var(--surface);
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
        border: 1px solid var(--border);
      }

      css-anchor-playground .anchor {
        position: absolute;
        anchor-name: --pg-anchor;
        width: 96px;
        height: 64px;
        background: var(--accent);
        color: #fff;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.4rem;
        font-size: 0.875rem;
        font-weight: 600;
        cursor: grab;
        user-select: none;
        touch-action: none;
        transform: translate(-50%, -50%);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        z-index: 1;
      }

      css-anchor-playground .anchor:focus-visible {
        outline: 2px solid #fff;
        outline-offset: -4px;
      }

      css-anchor-playground .anchor-label {
        text-transform: uppercase;
        letter-spacing: 0.05em;
        font-size: 0.7rem;
      }

      css-anchor-playground .popup {
        position: absolute;
        position-anchor: --pg-anchor;
        position-area: bottom;
        margin: 8px;
        background: var(--surface-2);
        border: 1px solid var(--accent);
        color: var(--text);
        padding: 0.6rem 0.85rem;
        border-radius: 8px;
        font-size: 0.85rem;
        line-height: 1.3;
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
        max-width: 240px;
        z-index: 2;
      }

      css-anchor-playground .popup strong {
        display: block;
        margin-bottom: 0.15rem;
      }

      css-anchor-playground .popup-meta {
        font-family: ui-monospace, monospace;
        font-size: 0.7rem;
        color: var(--text-dim);
      }

      /* ─── Code block ─── */
      css-anchor-playground .code-block {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        overflow: hidden;
      }

      css-anchor-playground .code-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.5rem 0.85rem;
        background: var(--surface-2);
        border-bottom: 1px solid var(--border);
        font-size: 0.78rem;
        color: var(--text-dim);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        font-weight: 600;
      }

      css-anchor-playground .copy-btn {
        background: transparent;
        border: 1px solid var(--border);
        border-radius: 4px;
        color: var(--text);
        padding: 0.2rem 0.6rem;
        font-size: 0.75rem;
        font-family: inherit;
        cursor: pointer;
        text-transform: none;
        letter-spacing: normal;
        transition: all 0.15s;
      }

      css-anchor-playground .copy-btn:hover {
        border-color: var(--accent);
        color: var(--accent);
      }

      css-anchor-playground .code-block pre {
        margin: 0;
        padding: 0.85rem 1rem;
        font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
        font-size: 0.82rem;
        line-height: 1.5;
        color: var(--text);
        background: transparent;
        overflow-x: auto;
        border: none;
        border-radius: 0;
      }
    `;
    document.head.appendChild(style);
  }
}

customElements.define('css-anchor-playground', CSSAnchorPlayground);
