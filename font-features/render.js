// Builds the report DOM. Everything here is presentational — state lives in
// script.js and is handed in.

import { GROUP_ORDER, describeAxis, AXIS_CSS } from './features.js';

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const bytes = (value) => (value > 1024 * 1024
  ? `${(value / 1024 / 1024).toFixed(1)} MB`
  : `${Math.round(value / 1024)} kB`);

const round = (value) => (Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2))));

/* ----------------------------------------------------------- summary ---- */

export function renderSummary(target, font, origin) {
  target.replaceChildren();

  const title = el('div', 'summary-title');
  title.append(el('h2', null, font.names.family));
  if (font.names.subfamily) title.append(el('span', 'subfamily', font.names.subfamily));
  target.append(title);

  const badges = el('ul', 'badges');
  const badge = (text, kind) => badges.append(el('li', kind ? `badge ${kind}` : 'badge', text));
  badge(font.format.toUpperCase(), 'strong');
  badge(bytes(font.byteLength));
  if (font.metadata.glyphCount) badge(`${font.metadata.glyphCount.toLocaleString()} glyphs`);
  if (font.characters.count) badge(`${font.characters.count.toLocaleString()} characters`);
  if (font.axes.length) badge(`variable · ${font.axes.length} ${font.axes.length === 1 ? 'axis' : 'axes'}`, 'strong');
  if (font.colour.length) badge(`colour (${font.colour.join(', ')})`);
  if (font.metadata.monospaced) badge('monospaced');
  target.append(badges);

  if (origin.files?.length > 1 && origin.onSelectFile) {
    const control = el('label', 'control file-switch');
    control.append(el('span', null, 'File'));
    const select = el('select');
    for (const file of origin.files) {
      const option = el('option', null, file.label);
      option.value = file.url;
      if (file.url === origin.selected) option.selected = true;
      select.append(option);
    }
    select.addEventListener('change', () => origin.onSelectFile(select.value));
    control.append(select);
    target.append(control);
  }

  const facts = el('dl', 'facts');
  const fact = (term, value) => {
    if (!value) return;
    facts.append(el('dt', null, term), el('dd', null, value));
  };
  fact('Source', origin.description);
  fact('Version', font.names.version);
  fact('Designer', font.names.designer);
  fact('Units per em', font.metadata.unitsPerEm ? String(font.metadata.unitsPerEm) : null);
  fact('Licence', font.names.licence);
  if (facts.children.length) {
    const details = el('details', 'facts-details');
    details.append(el('summary', null, 'Font details'), facts);
    target.append(details);
  }

  if (font.subset) {
    target.append(el(
      'p',
      'notice warning',
      'This is the subset file Google Fonts serves, not the original — its feature list is trimmed.',
    ));
  } else if (origin.kind === 'google') {
    target.append(el(
      'p',
      'notice',
      'Read from the original upstream file. The WOFF2 Google serves is subset, so a feature listed here may not survive if you load the font from their CDN.',
    ));
  }
}

/* -------------------------------------------------------------- axes ---- */

export function renderAxes(target, font, state, onChange) {
  target.replaceChildren();
  for (const axis of font.axes) {
    const row = el('div', 'axis');
    const name = describeAxis(axis.tag) ?? axis.name ?? 'Axis';
    const head = el('div', 'axis-head');
    const label = el('label');
    label.htmlFor = `axis-${axis.tag}`;
    label.append(el('span', 'axis-name', name), el('code', null, axis.tag));
    const output = el('output', 'axis-value', round(state.axes.get(axis.tag) ?? axis.default));
    head.append(label, output);

    const slider = el('input');
    slider.type = 'range';
    slider.id = `axis-${axis.tag}`;
    slider.min = axis.min;
    slider.max = axis.max;
    slider.step = (axis.max - axis.min) > 20 ? 1 : 0.01;
    slider.value = state.axes.get(axis.tag) ?? axis.default;
    slider.addEventListener('input', () => {
      output.textContent = round(Number(slider.value));
      onChange(axis.tag, Number(slider.value));
    });

    const range = el('div', 'axis-range');
    range.append(el('span', null, round(axis.min)), el('span', null, round(axis.max)));

    row.append(head, slider, range);
    if (AXIS_CSS[axis.tag]) row.append(el('p', 'axis-note', `Registered axis — ${AXIS_CSS[axis.tag]}`));
    if (axis.hidden) row.append(el('p', 'axis-note', 'Marked hidden by the designer.'));
    target.append(row);
  }
}

/* ---------------------------------------------------------- features ---- */

function featureRow(feature, state, sampler, handlers) {
  const row = el('article', 'feature');
  row.dataset.tag = feature.tag;

  const head = el('header', 'feature-head');
  const toggle = el('label', 'switch');
  const input = el('input');
  input.type = 'checkbox';
  input.checked = (state.features.get(feature.tag) ?? (feature.defaultOn ? 1 : 0)) > 0;
  input.addEventListener('change', () => handlers.onToggle(feature, input.checked));
  toggle.append(input, el('span', 'switch-track'));

  const meta = el('div', 'feature-meta');
  const heading = el('h3');
  heading.append(el('code', 'tag', feature.tag), el('span', null, feature.name));
  meta.append(heading);

  const badges = el('p', 'feature-badges');
  badges.append(el('span', 'chip', feature.tables.join(' + ')));
  if (feature.defaultOn) badges.append(el('span', 'chip on', 'on by default'));
  if (feature.contextual) badges.append(el('span', 'chip', 'contextual'));
  if (feature.alternates > 1) badges.append(el('span', 'chip', `${feature.alternates} alternates`));
  if (feature.characters.length) {
    const count = feature.characters.length;
    badges.append(el('span', 'chip', `${count} character${count === 1 ? '' : 's'}`));
  } else if (!feature.contextual) {
    badges.append(el('span', 'chip', 'no direct coverage'));
  }
  if (feature.scripts.length) {
    badges.append(el('span', 'chip', feature.scripts.slice(0, 3).join(', ')
      + (feature.scripts.length > 3 ? '…' : '')));
  }
  meta.append(badges);
  head.append(toggle, meta);
  row.append(head);

  const value = state.features.get(feature.tag) ?? (feature.defaultOn ? 1 : 0);
  const sample = sampler(feature);
  const compare = el('div', 'compare');
  const pane = (label, settings) => {
    const box = el('div', 'pane');
    box.append(el('span', 'pane-label', label));
    const text = el('div', 'sample', sample.text);
    text.style.fontFeatureSettings = settings;
    box.append(text);
    return box;
  };
  const onValue = Math.max(1, value);
  compare.append(
    pane('off', `"${feature.tag}" 0`),
    pane(feature.alternates > 1 ? `on — value ${onValue}` : 'on', `"${feature.tag}" ${onValue}`),
  );
  row.append(compare);

  if (feature.alternates > 1) {
    const choices = el('div', 'alternates');
    choices.append(el('span', 'alternates-label', 'Alternate'));
    for (let i = 1; i <= feature.alternates; i++) {
      const button = el('button', i === onValue ? 'chip-button active' : 'chip-button', String(i));
      button.type = 'button';
      button.addEventListener('click', () => handlers.onValue(feature, i));
      choices.append(button);
    }
    row.append(choices);
  }

  if (sample.fromFont && feature.characters.length > 16) {
    const details = el('details', 'characters');
    details.append(
      el('summary', null, `All ${feature.characters.length} characters`),
      el('p', 'character-list', feature.characters.join(' ')),
    );
    row.append(details);
  }

  const css = el('div', 'feature-css');
  const declaration = feature.css
    ? `font-feature-settings: "${feature.tag}" ${onValue};  /* or ${feature.css} */`
    : `font-feature-settings: "${feature.tag}" ${onValue};`;
  css.append(el('code', null, declaration));
  const copy = el('button', 'btn tiny', 'Copy');
  copy.type = 'button';
  copy.addEventListener('click', () => handlers.onCopy(copy, `font-feature-settings: "${feature.tag}" ${onValue};`));
  css.append(copy);
  row.append(css);

  return row;
}

export function renderFeatures(target, font, state, sampler, handlers) {
  target.replaceChildren();
  const shown = font.features.filter((feature) => state.showShaping || !feature.shapingOnly);

  const groups = new Map();
  for (const feature of shown) {
    if (!groups.has(feature.group)) groups.set(feature.group, []);
    groups.get(feature.group).push(feature);
  }

  for (const group of GROUP_ORDER) {
    const features = groups.get(group);
    if (!features?.length) continue;
    const section = el('section', 'feature-group');
    section.append(el('h3', 'group-title', group));
    for (const feature of features) {
      section.append(featureRow(feature, state, sampler, handlers));
    }
    target.append(section);
  }

  return shown.length;
}
