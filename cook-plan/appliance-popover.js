// =============================================
// Cook Planner — appliance-popover.js
// (Now uses a native <dialog> rather than the popover API so the
//  appliance settings UI is treated consistently with the item modal.)
// =============================================

import { state, saveState } from './state.js';
import { applianceConfig } from './appliances.js';

let backdropClickBound = false;

// Kept for backwards compatibility with main.js init; no setup required now.
export function initAppliancePopover() {}

export function openApplianceDialog() {
  const dialog = document.getElementById('appl-dialog');
  const body   = document.getElementById('appl-dialog-body');
  if (!dialog || !body) return;

  const cfg = applianceConfig();
  const snap = state.snapMins || 0;

  body.innerHTML = `
    <div class="form-group">
      <label class="form-label">Main oven</label>
      <div class="seg-control" id="appl-main-shelves">
        <button data-val="1" class="${cfg.mainOvenShelves === 1 ? 'active' : ''}">1 shelf (2 slots)</button>
        <button data-val="2" class="${cfg.mainOvenShelves === 2 ? 'active' : ''}">2 shelves (4 slots)</button>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Combi oven / microwave</label>
      <div class="seg-control" id="appl-combi-toggle">
        <button data-val="true"  class="${cfg.hasCombi  ? 'active' : ''}">Available</button>
        <button data-val="false" class="${!cfg.hasCombi ? 'active' : ''}">Not available</button>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Hobs</label>
      <div class="seg-control" id="appl-hob-count">
        ${[2,3,4,5,6].map(n =>
          `<button data-val="${n}" class="${cfg.hobCount === n ? 'active' : ''}">${n}</button>`
        ).join('')}
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Round timings</label>
      <div class="seg-control" id="appl-snap">
        <button data-val="0" class="${snap === 0 ? 'active' : ''}">Off</button>
        <button data-val="2" class="${snap === 2 ? 'active' : ''}">2 min</button>
        <button data-val="4" class="${snap === 4 ? 'active' : ''}">4 min</button>
        <button data-val="8" class="${snap === 8 ? 'active' : ''}">8 min</button>
      </div>
      <p class="form-hint">Group items starting within this window together</p>
    </div>
  `;

  if (!dialog.open) dialog.showModal();
  body.scrollTop = 0;
  dialog.scrollTop = 0;

  if (!backdropClickBound) {
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) dialog.close();
    });
    document.getElementById('appl-dialog-close').addEventListener('click', () => dialog.close());
    backdropClickBound = true;
  }

  body.querySelector('#appl-main-shelves').addEventListener('click', e => {
    const btn = e.target.closest('button[data-val]');
    if (!btn) return;
    state.appliances = { ...applianceConfig(), mainOvenShelves: parseInt(btn.dataset.val) };
    saveState();
    body.querySelectorAll('#appl-main-shelves button').forEach(b => b.classList.toggle('active', b === btn));
  });

  body.querySelector('#appl-combi-toggle').addEventListener('click', e => {
    const btn = e.target.closest('button[data-val]');
    if (!btn) return;
    state.appliances = { ...applianceConfig(), hasCombi: btn.dataset.val === 'true' };
    saveState();
    body.querySelectorAll('#appl-combi-toggle button').forEach(b => b.classList.toggle('active', b === btn));
  });

  body.querySelector('#appl-hob-count').addEventListener('click', e => {
    const btn = e.target.closest('button[data-val]');
    if (!btn) return;
    state.appliances = { ...applianceConfig(), hobCount: parseInt(btn.dataset.val) };
    saveState();
    body.querySelectorAll('#appl-hob-count button').forEach(b => b.classList.toggle('active', b === btn));
  });

  body.querySelector('#appl-snap').addEventListener('click', e => {
    const btn = e.target.closest('button[data-val]');
    if (!btn) return;
    state.snapMins = parseInt(btn.dataset.val);
    saveState();
    body.querySelectorAll('#appl-snap button').forEach(b => b.classList.toggle('active', b === btn));
  });
}
