// <sync-settings> — the CouchDB sync panel, shared by every syncing tool.
//
// Renders the URL/token fields, the live status line, the three manual
// operations (pull, sync now, save) and the share link, and wires them to a
// PouchStore. Drop it into a settings dialog and hand it a store:
//
//   import '/lib/sync-settings.wc.js';
//   document.querySelector('sync-settings').configure({
//     store, getConfig, setConfig, onRefresh: () => refreshAll(),
//   });
//
// Shadow DOM, so the panel looks the same in every tool. Colour still follows
// the host: custom properties inherit through the shadow boundary, so a tool
// that defines --accent, --text and friends themes the panel for free, and the
// fallbacks below cover tools using a different token vocabulary.

import { SHARE_PARAM, encodeSyncConfig } from './sync-config.js';
import { statusText } from './sync-status.js';

const TEMPLATE = /* HTML */ `
  <label class="field">
    <span class="field-label">CouchDB URL</span>
    <input type="url" part="input" id="url" autocomplete="off"
      placeholder="https://user:pass@couch.example.com/my-database">
  </label>
  <label class="field">
    <span class="field-label">Bearer token (optional)</span>
    <input type="password" part="input" id="token" autocomplete="off">
  </label>
  <p class="status" id="status" aria-live="polite">Sync disabled.</p>
  <p class="hint">Replicates live against a CouchDB-compatible endpoint. The
    server must send CORS headers.</p>
  <div class="actions">
    <button class="btn ghost" id="pull" type="button"
      title="Overwrite local with server data; leaves the remote untouched">Pull from server</button>
    <button class="btn ghost" id="now" type="button">Sync now</button>
    <button class="btn primary" id="save" type="button">Save sync settings</button>
  </div>
  <div class="share-row">
    <button class="btn ghost share-btn" id="share" type="button" disabled>Copy share link</button>
    <p class="hint">Opens the app on another device pre-configured for this
      server. The link contains your URL and token, so only share it with people
      you trust.</p>
  </div>
`;

const STYLES = /* CSS */ `
  :host {
    display: block;
    font-family: inherit;
    color: var(--text, CanvasText);
    /* The panel is sized by whatever dialog or section it is dropped into, not
       by the viewport, so its one responsive rule is a container query. */
    container-type: inline-size;
  }

  [hidden] {
    display: none !important;
  }

  * {
    box-sizing: border-box;
  }

  .field {
    display: block;
    margin-bottom: 1rem;
  }

  .field-label {
    display: block;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-3, var(--muted, GrayText));
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-bottom: 0.375rem;
  }

  input {
    width: 100%;
    padding: 0.625rem 0.75rem;
    border: 1.5px solid var(--border, ButtonBorder);
    border-radius: var(--radius, 10px);
    background: var(--bg-input, var(--card, Field));
    color: var(--text, CanvasText);
    font-family: inherit;
    font-size: 0.9375rem;
    transition: border-color 0.15s, box-shadow 0.15s;

    &::placeholder { color: var(--text-3, var(--muted, GrayText)); }

    &:focus {
      outline: none;
      border-color: var(--accent, Highlight);
      box-shadow: 0 0 0 3px var(--accent-glow, color-mix(in srgb, var(--accent, Highlight) 15%, transparent));
    }
  }

  .status {
    font-size: 0.8125rem;
    color: var(--text-2, var(--muted, CanvasText));
    padding: 0.375rem 0;
    margin: 0;
    font-variant-numeric: tabular-nums;

    &[data-state="error"] { color: var(--danger, #e74c3c); }
    &[data-state="syncing"] { color: var(--accent, Highlight); }
    &[data-state="idle"] { color: var(--green, #00b894); }
  }

  .hint {
    font-size: 0.75rem;
    color: var(--text-3, var(--muted, GrayText));
    line-height: 1.35;
    margin: 0.125rem 0 0;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    justify-content: flex-end;
    padding-top: 0.75rem;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
    padding: 0.5625rem 1.125rem;
    border-radius: var(--radius, 10px);
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    border: 1.5px solid transparent;
    font-family: inherit;
    transition: background 0.15s, border-color 0.15s, color 0.15s, filter 0.15s;
    white-space: nowrap;

    &:active { scale: 0.97; }
    &:disabled { opacity: 0.6; cursor: default; }
  }

  .primary {
    background: var(--accent, Highlight);
    color: #fff;
    box-shadow: 0 2px 8px color-mix(in srgb, var(--accent, Highlight) 30%, transparent);

    &:hover:not(:disabled) { filter: brightness(1.1); }
  }

  .ghost {
    background: transparent;
    color: var(--text-2, var(--muted, CanvasText));
    border-color: var(--border, ButtonBorder);

    &:hover:not(:disabled) {
      background: var(--bg-hover, transparent);
      border-color: var(--accent, Highlight);
      color: var(--accent, Highlight);
    }
  }

  .share-row {
    margin-top: 0.75rem;
    padding-top: 0.75rem;
    border-top: 1px solid var(--border-light, var(--border, ButtonBorder));
  }

  .share-btn {
    width: 100%;
    margin-bottom: 0.375rem;
  }

  /* The action row is three buttons wide — stack it before it can overflow at
     the narrowest supported width (a 325px viewport, less dialog padding). */
  @container (max-width: 20rem) {
    .actions {
      flex-direction: column;
      align-items: stretch;
    }
  }
`;

const DEFAULT_MERGE_WARNING =
  "Data exists on this device. Saving will merge it with the server's data "
  + '(last write wins per record).\n\n'
  + 'To REPLACE local data with the server instead, cancel and use '
  + '"Pull from server".\n\nContinue with merge?';

const PULL_WARNING =
  'Pull from the server and overwrite local data? Any local changes that '
  + "haven't been pushed will be discarded. The remote server is not modified.";

class SyncSettings extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });

    // Set through configure().
    this.store = null;
    this.getConfig = () => ({ url: '', token: '' });
    this.setConfig = () => {};
    this.onRefresh = () => {};
    this.mergeWarning = DEFAULT_MERGE_WARNING;

    this._unsubscribe = null;
    this._shareResetTimer = null;
  }

  connectedCallback() {
    if (this._built) return;
    this._built = true;

    const sheet = new CSSStyleSheet();
    sheet.replaceSync(STYLES);
    this.shadowRoot.adoptedStyleSheets = [sheet];
    this.shadowRoot.innerHTML = TEMPLATE;

    this.$ = (id) => this.shadowRoot.getElementById(id);
    this.$('save').addEventListener('click', () => this._handleSave());
    this.$('now').addEventListener('click', () => this._handleSyncNow());
    this.$('pull').addEventListener('click', () => this._handlePull());
    this.$('share').addEventListener('click', () => this._handleShare());
    this.refresh();
  }

  disconnectedCallback() {
    this._unsubscribe?.();
    this._unsubscribe = null;
  }

  configure(options = {}) {
    Object.assign(this, options);
    if (this.store) {
      this._unsubscribe?.();
      this._unsubscribe = this.store.onSyncStatus((s) => this._renderStatus(s));
    }
    this.refresh();
  }

  // Re-read the stored config into the fields. Called on configure and worth
  // calling again whenever the settings dialog opens, in case a sync arrived
  // (or another tab saved) while it was closed.
  refresh() {
    if (!this._built) return;
    const cfg = this.getConfig();
    this.$('url').value = cfg.url;
    this.$('token').value = cfg.token;
    this.$('share').disabled = !cfg.url;
  }

  _renderStatus(s) {
    if (!this._built) return;
    const el = this.$('status');
    el.textContent = statusText(s);
    el.dataset.state = s?.state ?? 'disabled';
  }

  // Run one of the manual sync operations with the pressed button disabled for
  // the duration, reporting failures on the status line rather than throwing
  // into the void.
  async _run(id, fn) {
    const btn = this.$(id);
    btn.disabled = true;
    try {
      await fn();
      await this.onRefresh();
    } catch (err) {
      this._renderStatus({ state: 'error', lastError: err });
    } finally {
      btn.disabled = false;
    }
  }

  async _handleSave() {
    const url = this.$('url').value.trim();
    const token = this.$('token').value.trim();
    const btn = this.$('save');
    btn.disabled = true;
    try {
      // Decide BEFORE writing config so the check reflects current local data.
      const hasLocal = url ? await this.store.hasData() : false;
      if (url && hasLocal && !confirm(this.mergeWarning)) return;
      this.setConfig({ url, token });
      this.$('share').disabled = !url;
      // pullFirst when local has nothing to lose — protects a fresh client from
      // racing an empty push against the initial pull.
      await this.store.reopen({ pullFirst: !hasLocal });
      await this.onRefresh();
    } catch (err) {
      this._renderStatus({ state: 'error', lastError: err });
    } finally {
      btn.disabled = false;
    }
  }

  _handleSyncNow() {
    return this._run('now', () => this.store.syncNow());
  }

  _handlePull() {
    if (!confirm(PULL_WARNING)) return Promise.resolve();
    return this._run('pull', () => this.store.pullFromRemote());
  }

  // Build a link that encodes the current sync config and copy it to the
  // clipboard. Opening it on another device saves the config and reloads.
  async _handleShare() {
    const cfg = this.getConfig();
    if (!cfg.url) return;
    const link = `${location.origin}${location.pathname}?${SHARE_PARAM}=${encodeSyncConfig(cfg)}`;
    const btn = this.$('share');
    try {
      await navigator.clipboard.writeText(link);
      btn.textContent = 'Copied!';
      clearTimeout(this._shareResetTimer);
      this._shareResetTimer = setTimeout(() => {
        btn.textContent = 'Copy share link';
      }, 2000);
    } catch {
      // Clipboard blocked (e.g. insecure context) — surface the link to copy by hand.
      prompt('Copy this link:', link);
    }
  }
}

customElements.define('sync-settings', SyncSettings);
