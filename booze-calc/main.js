import { calculate } from './calc.js';
import {
  VOLUME_UNITS,
  toMl,
  fromMl,
  strengthToAbv,
  abvToStrength,
  tidy,
  round,
} from './units.js';
import {
  SPIRITS,
  ALCOHOLIC_MIXERS,
  SOFT_MIXERS,
  STRENGTH_BY_NAME,
  DILUTIONS,
} from './presets.js';

const STORAGE_KEY = 'booze-calc';

const $ = (id) => document.getElementById(id);

const els = {
  strengthUnit: $('strength-unit'),
  volumeUnit: $('volume-unit'),
  baseName: $('base-name'),
  baseStrength: $('base-strength'),
  baseAmount: $('base-amount'),
  mixers: $('mixers'),
  mixersEmpty: $('mixers-empty'),
  mixerCount: $('mixer-count'),
  addMixer: $('add-mixer'),
  dilution: $('dilution'),
  dilutionCustomField: $('dilution-custom-field'),
  dilutionCustom: $('dilution-custom'),
  template: $('mixer-template'),
  resetDialog: $('reset-dialog'),
};

/* Units are only held here so a switch knows what to convert *from*. */
let strengthUnit = els.strengthUnit.value;
let volumeUnit = els.volumeUnit.value;
let rowId = 0;

/* ---------- setup ---------- */

function fillDatalist(id, names) {
  $(id).replaceChildren(
    ...names.map((name) => {
      const option = document.createElement('option');
      option.value = name;
      return option;
    }),
  );
}

function buildStaticLists() {
  fillDatalist('spirit-list', SPIRITS.map(([name]) => name));
  fillDatalist('alcoholic-list', ALCOHOLIC_MIXERS.map(([name]) => name));
  fillDatalist('soft-list', SOFT_MIXERS);

  els.dilution.replaceChildren(
    ...DILUTIONS.map(([value, label]) => new Option(label, value)),
    new Option('Custom…', 'custom'),
  );
}

/* ---------- mixer rows ---------- */

function addMixer({ name = '', amount = '', boozy = false, strength = '' } = {}) {
  const row = els.template.content.firstElementChild.cloneNode(true);
  const id = ++rowId;

  row.querySelectorAll('.field').forEach((field, index) => {
    const label = field.querySelector('label');
    const control = field.querySelector('input');
    if (!label || !control) return;
    control.id = `mixer-${id}-${index}`;
    label.htmlFor = control.id;
  });

  row.querySelector('[data-name]').value = name;
  row.querySelector('[data-amount]').value = amount;
  row.querySelector('[data-abv]').value = strength;
  row.querySelector('[data-boozy]').checked = boozy;

  syncRow(row);
  els.mixers.append(row);
  return row;
}

/** Show or hide the strength field and point the name at the right preset list. */
function syncRow(row) {
  const boozy = row.querySelector('[data-boozy]').checked;
  const strengthField = row.querySelector('[data-strength-field]');
  const strengthInput = row.querySelector('[data-abv]');

  strengthField.hidden = !boozy;
  row.querySelector('[data-name]').setAttribute('list', boozy ? 'alcoholic-list' : 'soft-list');

  const known = presetAbv(row.querySelector('[data-name]').value);
  if (boozy && strengthInput.value === '' && known !== undefined) {
    strengthInput.value = tidy(abvToStrength(known, strengthUnit));
  }
}

const presetAbv = (name) => STRENGTH_BY_NAME.get(name.trim().toLowerCase());

/** Picking a preset name fills in its typical strength. */
function applyPreset(nameInput, strengthInput, boozyInput) {
  const abv = presetAbv(nameInput.value);
  if (abv === undefined) return;
  if (boozyInput && !boozyInput.checked) {
    boozyInput.checked = true;
    syncRow(nameInput.closest('.mixer'));
  }
  strengthInput.value = tidy(abvToStrength(abv, strengthUnit));
}

function updateMixerChrome() {
  const count = els.mixers.children.length;
  els.mixersEmpty.hidden = count > 0;
  els.mixerCount.textContent = count ? `${count} added` : '';
}

/* ---------- reading the form ---------- */

const num = (input) => {
  const value = parseFloat(input.value);
  return Number.isFinite(value) && value > 0 ? value : 0;
};

function readDrink() {
  const base = {
    name: els.baseName.value.trim() || 'Base spirit',
    abv: strengthToAbv(num(els.baseStrength), strengthUnit),
    ml: toMl(num(els.baseAmount), volumeUnit),
  };

  const mixers = [...els.mixers.children].map((row, index) => {
    const boozy = row.querySelector('[data-boozy]').checked;
    return {
      name: row.querySelector('[data-name]').value.trim() || `Mixer ${index + 1}`,
      abv: boozy ? strengthToAbv(num(row.querySelector('[data-abv]')), strengthUnit) : 0,
      ml: toMl(num(row.querySelector('[data-amount]')), volumeUnit),
    };
  });

  const choice = els.dilution.value;
  const dilution = choice === 'custom' ? num(els.dilutionCustom) : Number(choice);

  return { base, mixers, dilution };
}

/* ---------- output ---------- */

const volumeLabel = () => VOLUME_UNITS[volumeUnit].label;
const showVolume = (ml, places = 1) => `${round(fromMl(ml, volumeUnit), places)} ${volumeLabel()}`;

function render() {
  const { base, mixers, dilution } = readDrink();
  const result = calculate(base, mixers, dilution);

  const asProof = strengthUnit === 'proof';
  $('out-primary').textContent = round(asProof ? result.proof : result.abv, 1);
  $('out-primary-unit').textContent = asProof ? 'proof' : '% ABV';
  $('out-secondary').textContent = asProof
    ? `${round(result.abv, 1)}% ABV`
    : `${round(result.proof, 1)} proof (US)`;

  $('out-volume').textContent = showVolume(result.totalMl);
  $('out-alcohol').textContent = showVolume(result.alcoholMl, 2);
  $('out-units').textContent = round(result.ukUnits, 1);
  $('out-drinks').textContent = round(result.usDrinks, 1);

  $('strength-fill').style.width = `${Math.min(result.abv, 100)}%`;
  $('strength-marker').hidden = base.abv <= 0;
  $('strength-marker').style.left = `${Math.min(base.abv, 100)}%`;
  $('strength-bar').setAttribute(
    'aria-label',
    `Finished drink is ${round(result.abv, 1)} percent ABV; the neat spirit is ${round(base.abv, 1)} percent`,
  );

  $('out-summary').textContent = summarise(base, result);
  renderParts(result);
}

function summarise(base, result) {
  if (result.totalMl === 0) return 'Add a spirit and an amount to get started.';
  if (base.ml === 0) return 'No base spirit yet — this is the strength of the mixers alone.';
  if (result.mixerRatio === 0) return `Neat ${base.name}, undiluted.`;

  const ratio = `1 part ${base.name} to ${round(result.mixerRatio, 1)} parts everything else`;
  const relative = base.abv > 0
    ? ` — ${Math.round(result.strengthOfBase * 100)}% the strength of the neat pour.`
    : '.';
  return ratio + relative;
}

function renderParts(result) {
  const rows = result.parts.map((part) => {
    const tr = document.createElement('tr');
    const cells = [
      ['ingredient', part.name],
      ['num', showVolume(part.ml)],
      ['num', part.alcoholMl > 0 ? showVolume(part.alcoholMl, 2) : '—'],
      ['num', part.share > 0 ? `${Math.round(part.share * 100)}%` : '—'],
    ];
    for (const [className, text] of cells) {
      const td = document.createElement('td');
      td.className = className;
      td.textContent = text;
      tr.append(td);
    }
    return tr;
  });

  if (!rows.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 4;
    td.textContent = 'Nothing in the glass yet.';
    tr.append(td);
    rows.push(tr);
  }

  $('out-parts').replaceChildren(...rows);
}

/* ---------- unit switching ---------- */

/**
 * Retype every value in `selector` from one unit into another.
 *
 * The displayed value is rounded, so converting straight off it would shave a
 * little more away on each switch (50 ml → 1.69 fl oz → 49.98 ml). Each field
 * therefore keeps the unrounded value it was last converted from, and that is
 * reused whenever the field has not been edited since.
 */
function convertInputs(selector, toCanonical, toDisplay, from, to) {
  for (const input of document.querySelectorAll(selector)) {
    if (input.value === '') {
      delete input.dataset.exact;
      continue;
    }
    const shown = parseFloat(input.value);
    if (!Number.isFinite(shown)) continue;

    const stored = parseFloat(input.dataset.exact);
    const untouched = Number.isFinite(stored) && tidy(toDisplay(stored, from)) === tidy(shown);
    const canonical = untouched ? stored : toCanonical(shown, from);

    input.dataset.exact = canonical;
    input.value = tidy(toDisplay(canonical, to));
  }
}

function changeStrengthUnit(next) {
  if (next === strengthUnit) return;
  const from = strengthUnit;
  strengthUnit = next;
  convertInputs('[data-strength]', strengthToAbv, abvToStrength, from, next);

  const max = next === 'proof' ? 200 : 100;
  for (const input of document.querySelectorAll('[data-strength]')) input.max = max;
  for (const tag of document.querySelectorAll('[data-strength-tag]')) {
    tag.textContent = next === 'proof' ? 'proof' : '% ABV';
  }
}

function changeVolumeUnit(next) {
  if (next === volumeUnit) return;
  const from = volumeUnit;
  volumeUnit = next;
  convertInputs('[data-volume]', toMl, fromMl, from, next);
  for (const tag of document.querySelectorAll('[data-volume-tag]')) tag.textContent = volumeLabel();
}

/* The template is cloned for new rows, so its tags need the current units too. */
function syncTemplateUnits() {
  const content = els.template.content;
  content.querySelector('[data-volume-tag]').textContent = volumeLabel();
  content.querySelector('[data-strength-tag]').textContent =
    strengthUnit === 'proof' ? 'proof' : '% ABV';
  content.querySelector('[data-strength]').max = strengthUnit === 'proof' ? 200 : 100;
}

/* ---------- persistence ---------- */

function save() {
  const state = {
    strengthUnit,
    volumeUnit,
    base: {
      name: els.baseName.value,
      strength: els.baseStrength.value,
      amount: els.baseAmount.value,
    },
    mixers: [...els.mixers.children].map((row) => ({
      name: row.querySelector('[data-name]').value,
      amount: row.querySelector('[data-amount]').value,
      strength: row.querySelector('[data-abv]').value,
      boozy: row.querySelector('[data-boozy]').checked,
    })),
    dilution: els.dilution.value,
    dilutionCustom: els.dilutionCustom.value,
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* private mode or a full quota — the calculator still works. */
  }
}

function load() {
  let state;
  try {
    state = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  } catch {
    state = null;
  }
  if (!state) return false;

  if (state.strengthUnit === 'proof' || state.strengthUnit === 'abv') {
    strengthUnit = els.strengthUnit.value = state.strengthUnit;
  }
  if (Object.hasOwn(VOLUME_UNITS, state.volumeUnit ?? '')) {
    volumeUnit = els.volumeUnit.value = state.volumeUnit;
  }

  els.baseName.value = state.base?.name ?? '';
  els.baseStrength.value = state.base?.strength ?? '';
  els.baseAmount.value = state.base?.amount ?? '';

  els.mixers.replaceChildren();
  for (const mixer of state.mixers ?? []) addMixer(mixer);

  if (state.dilution) els.dilution.value = state.dilution;
  if (state.dilutionCustom) els.dilutionCustom.value = state.dilutionCustom;

  return true;
}

function applyDefaults() {
  addMixer({ name: 'Tonic water', amount: tidy(fromMl(150, volumeUnit)) });
}

/* ---------- wiring ---------- */

function refresh() {
  els.dilutionCustomField.hidden = els.dilution.value !== 'custom';
  updateMixerChrome();
  syncTemplateUnits();
  render();
  save();
}

buildStaticLists();
if (!load()) applyDefaults();

els.addMixer.addEventListener('click', () => {
  const row = addMixer();
  refresh();
  row.querySelector('[data-name]').focus();
});

els.mixers.addEventListener('input', (event) => {
  const row = event.target.closest('.mixer');
  if (event.target.matches('[data-name]')) {
    applyPreset(event.target, row.querySelector('[data-abv]'), row.querySelector('[data-boozy]'));
  }
  refresh();
});

els.mixers.addEventListener('change', (event) => {
  if (event.target.matches('[data-boozy]')) syncRow(event.target.closest('.mixer'));
  refresh();
});

els.mixers.addEventListener('click', (event) => {
  if (!event.target.closest('[data-remove]')) return;
  event.target.closest('.mixer').remove();
  refresh();
});

els.baseName.addEventListener('input', () => {
  applyPreset(els.baseName, els.baseStrength, null);
  refresh();
});

for (const input of [els.baseStrength, els.baseAmount, els.dilutionCustom]) {
  input.addEventListener('input', refresh);
}

els.strengthUnit.addEventListener('change', () => {
  changeStrengthUnit(els.strengthUnit.value);
  refresh();
});

els.volumeUnit.addEventListener('change', () => {
  changeVolumeUnit(els.volumeUnit.value);
  refresh();
});

els.dilution.addEventListener('change', refresh);

$('reset').addEventListener('click', () => els.resetDialog.showModal());

els.resetDialog.addEventListener('click', (event) => {
  if (event.target === els.resetDialog || event.target.matches('[data-close]')) {
    els.resetDialog.close();
  }
});

$('reset-confirm').addEventListener('click', () => {
  els.resetDialog.close();
  els.baseName.value = 'Vodka';
  els.baseStrength.value = tidy(abvToStrength(40, strengthUnit));
  els.baseAmount.value = tidy(fromMl(50, volumeUnit));
  els.mixers.replaceChildren();
  els.dilution.value = '0';
  applyDefaults();
  refresh();
  els.baseName.focus();
});

refresh();
