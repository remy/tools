// =============================================
// Cook Planner — item-modal.js
// =============================================

import { state, saveItem, nextOrder } from './state.js';
import { COOK_TYPES, COOK_TYPE_MAP } from './constants.js';
import { escHtml, slotsLabel, uid } from './utils.js';
import { FOOD_NAMES, lookupFood } from './foods.js';
import { applianceConfig } from './appliances.js';
import { removeItem } from './render-input.js';
import { renderCurrentView } from './router.js';

let backdropClickBound = false;

export function openItemModal(editId) {
  const dialog = document.getElementById('item-dialog');
  const title  = document.getElementById('dialog-title');
  const body   = document.getElementById('dialog-body');

  const item = editId ? state.items.find(i => i.id === editId) : null;
  title.textContent = item ? `Edit: ${item.name}` : 'Add Food Item';

  const cfg = applianceConfig();
  const defCookType = item?.cookType || 'oven';
  const defSlots    = item?.shelfSlots || 1;
  const defShelf    = item?.shelfPref ?? 'auto';
  const showSlots   = (ct) => COOK_TYPE_MAP[ct]?.resource === 'oven' || COOK_TYPE_MAP[ct]?.resource === 'combi';
  const showShelf   = (ct) => COOK_TYPE_MAP[ct]?.resource === 'oven' && cfg.mainOvenShelves > 1;

  body.innerHTML = `
    <form id="item-form" autocomplete="off">
      <div class="form-group">
        <label class="form-label" for="if-name">Name</label>
        <input class="input" id="if-name" type="text" list="food-suggestions"
          placeholder="e.g. Turkey, Roast Potatoes…"
          value="${escHtml(item?.name || '')}" maxlength="60" required>
        <datalist id="food-suggestions">
          ${FOOD_NAMES.map(n => `<option value="${escHtml(n)}"></option>`).join('')}
        </datalist>
        <div class="food-suggest" id="if-suggest" hidden></div>
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

      <div class="form-group" id="fg-appliance-pref" style="${COOK_TYPE_MAP[defCookType]?.resource === 'oven' ? '' : 'display:none'}">
        <label class="form-label" for="if-appl-pref">Appliance preference</label>
        <select class="input" id="if-appl-pref">
          <option value="auto"  ${(item?.appliancePref||'auto') === 'auto'  ? 'selected' : ''}>Auto (main oven first)</option>
          <option value="main"  ${item?.appliancePref === 'main'  ? 'selected' : ''}>Main Oven only</option>
          <option value="combi" ${item?.appliancePref === 'combi' ? 'selected' : ''}>Combi Oven only</option>
        </select>
      </div>

      <div class="form-group" id="fg-shelf-pref" style="${showShelf(defCookType) ? '' : 'display:none'}">
        <label class="form-label" for="if-shelf-pref">Main oven shelf</label>
        <select class="input" id="if-shelf-pref">
          <option value="auto" ${defShelf === 'auto' ? 'selected' : ''}>Auto (pair it up for me)</option>
          ${Array.from({ length: cfg.mainOvenShelves }, (_, i) => i + 1).map(n =>
            `<option value="${n}" ${String(defShelf) === String(n) ? 'selected' : ''}>Shelf ${n}</option>`
          ).join('')}
        </select>
        <span class="form-hint">Auto puts dishes that share a tray well on the same shelf</span>
      </div>

      <div class="form-group" id="fg-hob-pref" style="${COOK_TYPE_MAP[defCookType]?.resource === 'hob' ? '' : 'display:none'}">
        <label class="form-label" for="if-hob-pref">Hob preference</label>
        <select class="input" id="if-hob-pref">
          <option value="auto" ${(item?.appliancePref||'auto') === 'auto' ? 'selected' : ''}>Auto (first free hob)</option>
          ${Array.from({ length: cfg.hobCount }, (_, i) => i + 1).map(n =>
            `<option value="hob${n}" ${item?.appliancePref === `hob${n}` ? 'selected' : ''}>Hob ${n}</option>`
          ).join('')}
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

      <div class="input-row">
        <div class="form-group">
          <label class="form-label" for="if-set">Rest / set</label>
          <div class="input-time-group">
            <input class="input" id="if-set" type="number" min="0" max="999"
              value="${item?.setTime ?? 0}" placeholder="0">
            <span class="time-unit">min</span>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label" for="if-serve">Serving prep</label>
          <div class="input-time-group">
            <input class="input" id="if-serve" type="number" min="0" max="999"
              value="${item?.servePrep ?? 0}" placeholder="0">
            <span class="time-unit">min</span>
          </div>
        </div>
      </div>
      <p class="settings-hint">Rest is the dish sitting on its own after cooking;
        serving prep is the hands-on job after that — carving, plating, saucing.
        Both are counted back from the serve time, so a chicken that needs ten
        minutes of carving goes in ten minutes earlier.</p>

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

  // ── Which fields the cook has had a hand in ──
  // A dish being edited arrives with times somebody chose, so none of them are
  // ours to overwrite. On a new item every timing field is still a default and
  // can be filled in from the catalogue the moment the name matches something.
  const touched = new Set(item ? ['cookType', 'times', 'slots'] : []);

  function syncVisibility(cookType) {
    const resource = COOK_TYPE_MAP[cookType]?.resource;
    document.getElementById('fg-slots').style.display          = (resource === 'oven' || resource === 'combi') ? '' : 'none';
    document.getElementById('fg-appliance-pref').style.display = (resource === 'oven') ? '' : 'none';
    document.getElementById('fg-shelf-pref').style.display     = (resource === 'oven' && cfg.mainOvenShelves > 1) ? '' : 'none';
    document.getElementById('fg-hob-pref').style.display       = (resource === 'hob') ? '' : 'none';
  }

  function selectCookType(ct) {
    document.querySelectorAll('.cook-type-btn').forEach(b =>
      b.classList.toggle('selected', b.dataset.cookType === ct));
    document.getElementById('if-cook-type').value = ct;
    syncVisibility(ct);
  }

  function setSlots(n) {
    document.getElementById('if-slots').value = n;
    document.getElementById('slot-label').textContent = slotsLabel(n);
    document.querySelectorAll('.sv-slot').forEach(el => {
      el.classList.toggle('filled', parseInt(el.dataset.slot) <= n);
    });
  }

  function applyFood(food) {
    selectCookType(food.cookType);
    setSlots(food.shelfSlots);
    document.getElementById('if-prep').value = food.prepTime;
    document.getElementById('if-cook').value = food.cookTime;
    document.getElementById('if-set').value  = food.setTime;
    document.getElementById('if-serve').value = food.servePrep;
  }

  // Does the form already say what the catalogue would say?
  function matchesFood(food) {
    return document.getElementById('if-cook-type').value === food.cookType
      && Number(document.getElementById('if-prep').value) === food.prepTime
      && Number(document.getElementById('if-cook').value) === food.cookTime
      && Number(document.getElementById('if-set').value)  === food.setTime
      && Number(document.getElementById('if-serve').value) === food.servePrep;
  }

  const suggestEl = document.getElementById('if-suggest');

  function refreshSuggestion({ autoApply }) {
    const food = lookupFood(document.getElementById('if-name').value);
    if (!food) { suggestEl.hidden = true; suggestEl.innerHTML = ''; return; }

    // Nothing has been typed over yet, so fill it in rather than asking.
    if (autoApply && touched.size === 0) {
      applyFood(food);
      suggestEl.hidden = false;
      suggestEl.innerHTML =
        `<span class="food-suggest-note">✓ Typical times for ${escHtml(food.name)} filled in — change anything you like.</span>`;
      return;
    }

    if (matchesFood(food)) { suggestEl.hidden = true; suggestEl.innerHTML = ''; return; }

    suggestEl.hidden = false;
    suggestEl.innerHTML = `
      <button type="button" class="btn btn-secondary btn-sm" id="btn-apply-food">
        ↺ Use typical times for ${escHtml(food.name)}
      </button>
      <span class="food-suggest-note">${escHtml(summarise(food))}</span>
    `;
  }

  document.getElementById('if-name').addEventListener('input', () => refreshSuggestion({ autoApply: true }));
  // Picking from the datalist fires `change` in some browsers without an
  // `input` event, so both are listened for.
  document.getElementById('if-name').addEventListener('change', () => refreshSuggestion({ autoApply: true }));

  suggestEl.addEventListener('click', (e) => {
    if (!e.target.closest('#btn-apply-food')) return;
    const food = lookupFood(document.getElementById('if-name').value);
    if (!food) return;
    applyFood(food);
    refreshSuggestion({ autoApply: false });
  });

  // Cook type selection
  document.getElementById('cook-type-grid').addEventListener('click', e => {
    const btn = e.target.closest('.cook-type-btn');
    if (!btn) return;
    touched.add('cookType');
    selectCookType(btn.dataset.cookType);
    refreshSuggestion({ autoApply: false });
  });

  // Slot picker
  document.getElementById('slot-visual').addEventListener('click', e => {
    const slotEl = e.target.closest('.sv-slot');
    if (!slotEl) return;
    touched.add('slots');
    setSlots(parseInt(slotEl.dataset.slot));
  });

  for (const id of ['if-prep', 'if-cook', 'if-set', 'if-serve']) {
    document.getElementById(id).addEventListener('input', () => {
      touched.add('times');
      refreshSuggestion({ autoApply: false });
    });
  }

  // An existing dish whose name is in the catalogue gets the offer straight
  // away, so the preset is one click from an edit too.
  refreshSuggestion({ autoApply: false });

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
    const shelfPrefRaw = document.getElementById('if-shelf-pref')?.value || 'auto';
    const shelfPref    = (resource === 'oven' && shelfPrefRaw !== 'auto') ? shelfPrefRaw : null;
    const prepTime = parseInt(document.getElementById('if-prep').value) || 0;
    const cookTime = parseInt(document.getElementById('if-cook').value) || 0;
    const setTime   = parseInt(document.getElementById('if-set').value)   || 0;
    const servePrep = parseInt(document.getElementById('if-serve').value) || 0;

    // Only the item that changed is written — the rest of the cook is left
    // alone so a second device editing a different dish doesn't lose its edit.
    let saved;
    if (item) {
      saved = Object.assign(item, { name, cookType, shelfSlots, appliancePref, shelfPref, prepTime, cookTime, setTime, servePrep });
    } else {
      saved = {
        id: uid(), name, cookType, shelfSlots, appliancePref, shelfPref,
        prepTime, cookTime, setTime, servePrep, overrideCookStart: null,
        order: nextOrder(), createdAt: Date.now(),
      };
      state.items.push(saved);
    }
    saveItem(saved);
    closeModal();
    renderCurrentView();
  });

  document.getElementById('btn-cancel-modal').addEventListener('click', closeModal);
  document.getElementById('btn-delete-item')?.addEventListener('click', e => {
    removeItem(e.target.dataset.id);
    closeModal();
  });
}

function summarise(food) {
  const ct = COOK_TYPE_MAP[food.cookType];
  const parts = [ct ? ct.label : food.cookType];
  if (food.prepTime) parts.push(`prep ${food.prepTime}m`);
  if (food.cookTime) parts.push(`cook ${food.cookTime}m`);
  if (food.setTime)  parts.push(`rest ${food.setTime}m`);
  if (food.servePrep) parts.push(`serving ${food.servePrep}m`);
  return parts.join(' · ');
}

export function closeModal() {
  const dialog = document.getElementById('item-dialog');
  if (dialog?.open) dialog.close();
}
