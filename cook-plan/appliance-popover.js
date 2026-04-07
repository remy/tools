// =============================================
// Cook Planner — appliance-popover.js
// =============================================

import { state, saveState } from './state.js';
import { applianceConfig } from './appliances.js';

export function initAppliancePopover() {
  const pop = document.getElementById('appl-popover');
  if (!pop) return;

  pop.addEventListener('toggle', e => {
    if (e.newState !== 'open') return;
    const cfg = applianceConfig();
    const snap = state.snapMins || 0;

    pop.innerHTML = `
      <div class="appl-pop-inner">
        <p class="appl-pop-title">Appliances</p>
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
      </div>
    `;

    pop.querySelector('#appl-main-shelves').addEventListener('click', e => {
      const btn = e.target.closest('button[data-val]');
      if (!btn) return;
      state.appliances = { ...applianceConfig(), mainOvenShelves: parseInt(btn.dataset.val) };
      saveState();
      pop.querySelectorAll('#appl-main-shelves button').forEach(b => b.classList.toggle('active', b === btn));
    });

    pop.querySelector('#appl-combi-toggle').addEventListener('click', e => {
      const btn = e.target.closest('button[data-val]');
      if (!btn) return;
      state.appliances = { ...applianceConfig(), hasCombi: btn.dataset.val === 'true' };
      saveState();
      pop.querySelectorAll('#appl-combi-toggle button').forEach(b => b.classList.toggle('active', b === btn));
    });

    pop.querySelector('#appl-hob-count').addEventListener('click', e => {
      const btn = e.target.closest('button[data-val]');
      if (!btn) return;
      state.appliances = { ...applianceConfig(), hobCount: parseInt(btn.dataset.val) };
      saveState();
      pop.querySelectorAll('#appl-hob-count button').forEach(b => b.classList.toggle('active', b === btn));
    });

    pop.querySelector('#appl-snap').addEventListener('click', e => {
      const btn = e.target.closest('button[data-val]');
      if (!btn) return;
      state.snapMins = parseInt(btn.dataset.val);
      saveState();
      pop.querySelectorAll('#appl-snap button').forEach(b => b.classList.toggle('active', b === btn));
    });
  });
}
