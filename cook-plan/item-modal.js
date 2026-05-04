// =============================================
// Cook Planner — item-modal.js
// =============================================

import { state, saveState } from './state.js';
import { COOK_TYPES, COOK_TYPE_MAP } from './constants.js';
import { escHtml, slotsLabel, uid } from './utils.js';
import { removeItem } from './render-input.js';
import { renderCurrentView } from './router.js';

let backdropClickBound = false;

export function openItemModal(editId) {
  const dialog = document.getElementById('item-dialog');
  const title  = document.getElementById('dialog-title');
  const body   = document.getElementById('dialog-body');

  const item = editId ? state.items.find(i => i.id === editId) : null;
  title.textContent = item ? `Edit: ${item.name}` : 'Add Food Item';

  const defCookType = item?.cookType || 'oven';
  const defSlots    = item?.shelfSlots || 1;
  const showSlots   = (ct) => COOK_TYPE_MAP[ct]?.resource === 'oven' || COOK_TYPE_MAP[ct]?.resource === 'combi';

  body.innerHTML = `
    <form id="item-form" autocomplete="off">
      <div class="form-group">
        <label class="form-label" for="if-name">Name</label>
        <input class="input" id="if-name" type="text" placeholder="e.g. Turkey, Roast Potatoes…"
          value="${escHtml(item?.name || '')}" maxlength="60" required>
      </div>

      <div class="form-group">
        <label class="form-label">Cook type</label>
        <div class="cook-type-grid" id="cook-type-grid">
          ${COOK_TYPES.map(ct => `
            <button type="button" class="cook-type-btn${defCookType === ct.id ? ' selected' : ''}"
              data-cook-type="${ct.id}">
              <span class="cook-icon">${ct.icon}</span>
              ${ct.label}
            </button>
          `).join('')}
        </div>
        <input type="hidden" id="if-cook-type" value="${defCookType}">
      </div>

      <div class="form-group" id="fg-slots" style="${showSlots(defCookType) ? '' : 'display:none'}">
        <label class="form-label">Shelf slots</label>
        <div class="slot-picker">
          <div class="slot-visual" id="slot-visual">
            ${[1,2].map(n => `<div class="sv-slot${defSlots >= n ? ' filled' : ''}" data-slot="${n}"></div>`).join('')}
          </div>
          <span class="slot-label" id="slot-label">${slotsLabel(defSlots)}</span>
        </div>
        <span class="form-hint">1 slot = half a shelf · 2 slots = full shelf</span>
        <input type="hidden" id="if-slots" value="${defSlots}">
      </div>

      <div class="form-group" id="fg-appliance-pref" style="${showSlots(defCookType) ? '' : 'display:none'}">
        <label class="form-label" for="if-appl-pref">Appliance preference</label>
        <select class="input" id="if-appl-pref">
          <option value="auto"  ${(item?.appliancePref||'auto') === 'auto'  ? 'selected' : ''}>Auto (main oven first)</option>
          <option value="main"  ${item?.appliancePref === 'main'  ? 'selected' : ''}>Main Oven only</option>
          <option value="combi" ${item?.appliancePref === 'combi' ? 'selected' : ''}>Combi Oven only</option>
        </select>
      </div>

      <div class="form-group" id="fg-hob-pref" style="${COOK_TYPE_MAP[defCookType]?.resource === 'hob' ? '' : 'display:none'}">
        <label class="form-label" for="if-hob-pref">Hob preference</label>
        <select class="input" id="if-hob-pref">
          <option value="auto" ${(item?.appliancePref||'auto') === 'auto' ? 'selected' : ''}>Auto (first free hob)</option>
          ${[1,2,3,4,5].map(n => `<option value="hob${n}" ${item?.appliancePref === `hob${n}` ? 'selected' : ''}>Hob ${n}</option>`).join('')}
        </select>
      </div>

      <div class="input-row">
        <div class="form-group">
          <label class="form-label" for="if-prep">Prep time</label>
          <div class="input-time-group">
            <input class="input" id="if-prep" type="number" min="0" max="999"
              value="${item?.prepTime ?? 0}" placeholder="0">
            <span class="time-unit">min</span>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label" for="if-cook">Cook time</label>
          <div class="input-time-group">
            <input class="input" id="if-cook" type="number" min="0" max="999"
              value="${item?.cookTime ?? 60}" placeholder="0">
            <span class="time-unit">min</span>
          </div>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label" for="if-set">Rest / set time <span style="font-weight:400;color:var(--colour-text-secondary)">(after cooking)</span></label>
        <div class="input-time-group" style="max-width:12rem">
          <input class="input" id="if-set" type="number" min="0" max="999"
            value="${item?.setTime ?? 0}" placeholder="0">
          <span class="time-unit">min</span>
        </div>
      </div>

      <div class="dialog-footer">
        ${item ? `<button type="button" class="btn btn-danger btn-sm" id="btn-delete-item" data-id="${item.id}">Delete</button>` : ''}
        <button type="button" class="btn btn-ghost" id="btn-cancel-modal">Cancel</button>
        <button type="submit" class="btn btn-primary">${item ? 'Save changes' : 'Add item'}</button>
      </div>
    </form>
  `;

  if (!dialog.open) dialog.showModal();
  // Reset scroll: browsers preserve scroll position across openings, and
  // autofocusing a field below the fold also drags the scroll down.
  body.scrollTop = 0;
  dialog.scrollTop = 0;
  document.getElementById('if-name').focus({ preventScroll: true });

  // Backdrop click-to-dismiss: only fires when the click target is the
  // dialog itself (i.e. the backdrop area, not any child content).
  if (!backdropClickBound) {
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) dialog.close();
    });
    document.getElementById('dialog-close').addEventListener('click', () => dialog.close());
    backdropClickBound = true;
  }

  // Cook type selection
  document.getElementById('cook-type-grid').addEventListener('click', e => {
    const btn = e.target.closest('.cook-type-btn');
    if (!btn) return;
    const ct = btn.dataset.cookType;
    document.querySelectorAll('.cook-type-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    document.getElementById('if-cook-type').value = ct;
    const resource = COOK_TYPE_MAP[ct]?.resource;
    document.getElementById('fg-slots').style.display    = (resource === 'oven' || resource === 'combi') ? '' : 'none';
    document.getElementById('fg-appliance-pref').style.display = (resource === 'oven') ? '' : 'none';
    document.getElementById('fg-hob-pref').style.display = (resource === 'hob') ? '' : 'none';
  });

  // Slot picker
  document.getElementById('slot-visual').addEventListener('click', e => {
    const slotEl = e.target.closest('.sv-slot');
    if (!slotEl) return;
    const n = parseInt(slotEl.dataset.slot);
    document.getElementById('if-slots').value = n;
    document.getElementById('slot-label').textContent = slotsLabel(n);
    document.querySelectorAll('.sv-slot').forEach(el => {
      el.classList.toggle('filled', parseInt(el.dataset.slot) <= n);
    });
  });

  // Form submit
  document.getElementById('item-form').addEventListener('submit', e => {
    e.preventDefault();
    const name = document.getElementById('if-name').value.trim();
    if (!name) { document.getElementById('if-name').focus(); return; }
    const cookType      = document.getElementById('if-cook-type').value;
    const resource      = COOK_TYPE_MAP[cookType]?.resource;
    const shelfSlots    = parseInt(document.getElementById('if-slots').value) || 1;
    const appliancePref = resource === 'oven'
      ? (document.getElementById('if-appl-pref')?.value || 'auto')
      : resource === 'hob'
        ? (document.getElementById('if-hob-pref')?.value || 'auto')
        : 'auto';
    const prepTime = parseInt(document.getElementById('if-prep').value) || 0;
    const cookTime = parseInt(document.getElementById('if-cook').value) || 0;
    const setTime  = parseInt(document.getElementById('if-set').value)  || 0;

    if (item) {
      Object.assign(item, { name, cookType, shelfSlots, appliancePref, prepTime, cookTime, setTime });
    } else {
      state.items.push({ id: uid(), name, cookType, shelfSlots, appliancePref, prepTime, cookTime, setTime, overrideCookStart: null });
    }
    saveState();
    closeModal();
    renderCurrentView();
  });

  document.getElementById('btn-cancel-modal').addEventListener('click', closeModal);
  document.getElementById('btn-delete-item')?.addEventListener('click', e => {
    removeItem(e.target.dataset.id);
    closeModal();
  });
}

export function closeModal() {
  const dialog = document.getElementById('item-dialog');
  if (dialog?.open) dialog.close();
}
