// =============================================
// Cook Planner — appliance-settings.js
// The kitchen's own capabilities, rendered into the Settings dialog.
// =============================================

import { state, savePlan } from './state.js';
import { applianceConfig } from './appliances.js';

const SNAP_OPTIONS = [
  { val: 0, label: 'Off' },
  { val: 2, label: '2 min' },
  { val: 4, label: '4 min' },
  { val: 8, label: '8 min' },
];

let bound = false;

export function renderApplianceSettings() {
  const el = document.getElementById('appliance-settings');
  if (!el) return;

  const cfg = applianceConfig();
  const snap = state.snapMins || 0;

  el.innerHTML = `
    <div class="form-group">
      <label class="form-label">Main oven</label>
      <div class="seg-control" data-setting="main-shelves">
        <button type="button" data-val="1" class="${cfg.mainOvenShelves === 1 ? 'active' : ''}">1 shelf (2 slots)</button>
        <button type="button" data-val="2" class="${cfg.mainOvenShelves === 2 ? 'active' : ''}">2 shelves (4 slots)</button>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Combi oven / microwave</label>
      <div class="seg-control" data-setting="combi">
        <button type="button" data-val="true"  class="${cfg.hasCombi ? 'active' : ''}">Available</button>
        <button type="button" data-val="false" class="${!cfg.hasCombi ? 'active' : ''}">Not available</button>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Hobs</label>
      <div class="seg-control" data-setting="hobs">
        ${[2, 3, 4, 5, 6].map((n) =>
          `<button type="button" data-val="${n}" class="${cfg.hobCount === n ? 'active' : ''}">${n}</button>`
        ).join('')}
      </div>
    </div>
    <div class="form-group">
      <label class="form-label" for="set-preheat">Oven heat-up</label>
      <div class="input-time-group" style="max-width:12rem">
        <input class="input" id="set-preheat" type="number" min="0" max="120"
          value="${cfg.preheatMins}">
        <span class="time-unit">min</span>
      </div>
      <p class="form-hint">Each oven gets a "turn it on" step this long before
        the first dish goes in</p>
    </div>
    <div class="form-group">
      <label class="form-label" for="set-hold">Keep warm</label>
      <div class="input-time-group" style="max-width:12rem">
        <input class="input" id="set-hold" type="number" min="0" max="120"
          value="${cfg.holdMins}">
        <span class="time-unit">min</span>
      </div>
      <p class="form-hint">How long a dish may finish early and sit covered, when
        that is what frees an appliance for something else</p>
    </div>
    <div class="form-group">
      <label class="form-label">Round timings</label>
      <div class="seg-control" data-setting="snap">
        ${SNAP_OPTIONS.map((o) =>
          `<button type="button" data-val="${o.val}" class="${snap === o.val ? 'active' : ''}">${o.label}</button>`
        ).join('')}
      </div>
      <p class="form-hint">Group items starting within this window together</p>
    </div>
  `;

  if (!bound) {
    el.addEventListener('click', handleClick);
    el.addEventListener('input', handleInput);
    bound = true;
  }
}

// Typed settings save as they are typed; an empty box is nothing rather than
// zero, so it waits rather than wiping the value out from under the cursor.
// The schedule itself is repainted when the dialog closes, as for every other
// setting here.
const TIME_SETTINGS = { 'set-preheat': 'preheatMins', 'set-hold': 'holdMins' };

function handleInput(e) {
  const key = TIME_SETTINGS[e.target.id];
  if (!key || e.target.value === '') return;
  const mins = Math.min(120, Math.max(0, parseInt(e.target.value, 10) || 0));
  state.appliances = { ...applianceConfig(), [key]: mins };
  savePlan();
}

function handleClick(e) {
  const btn = e.target.closest('button[data-val]');
  const group = btn?.closest('[data-setting]');
  if (!group) return;
  const val = btn.dataset.val;

  switch (group.dataset.setting) {
    case 'main-shelves':
      state.appliances = { ...applianceConfig(), mainOvenShelves: parseInt(val, 10) };
      break;
    case 'combi':
      state.appliances = { ...applianceConfig(), hasCombi: val === 'true' };
      break;
    case 'hobs':
      state.appliances = { ...applianceConfig(), hobCount: parseInt(val, 10) };
      break;
    case 'snap':
      state.snapMins = parseInt(val, 10);
      break;
    default:
      return;
  }

  savePlan();
  group.querySelectorAll('button[data-val]').forEach((b) => b.classList.toggle('active', b === btn));
}
