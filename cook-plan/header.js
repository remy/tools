// =============================================
// Cook Planner — header.js
// The app header, shared by both views.
// =============================================

import { openSettings, paintSyncStatus } from './settings.js';

// `extraActions` is markup for buttons that sit to the left of the cog — the
// schedule view's "Edit" button is the only one so far.
export function renderHeader(extraActions = '') {
  return `
    <header class="app-header">
      <h1>🍳 Cook Planner</h1>
      <div class="header-actions">
        ${extraActions}
        <button class="btn-icon" id="btn-settings" aria-label="Settings">
          <span class="icon-mask icon-settings" aria-hidden="true"></span>
          <span class="sync-error-dot" hidden></span>
        </button>
      </div>
    </header>
  `;
}

export function bindHeader() {
  document.getElementById('btn-settings')?.addEventListener('click', openSettings);
  // The cog is a new element after every render, so its badge is repainted here.
  paintSyncStatus();
}
