import { render, SIZES, STYLES } from './render.js';
import { stripMarkdown } from './richtext.js';

const STORAGE_KEY = 'fancy-quotes';
// large enough for the full-bleed Split panel
const AVATAR_SIZE = 1080;

const $ = (id) => document.getElementById(id);
const form = $('form');
const preview = $('preview');
const status = $('status');

const state = {
  quote: '',
  name: '',
  role: '',
  accent: '#e11d48',
  style: 'classic',
  size: 'square',
  avatarData: null, // data URL, downscaled
  ...load(),
};
let avatarImg = null;

/* ---------- persistence ---------- */

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {};
  } catch {
    return {};
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // quota or privacy mode: not fatal
  }
}

/* ---------- avatar ---------- */

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Crop to a centred square and downscale so it fits in localStorage.
async function setAvatarFile(file) {
  if (!file?.type.startsWith('image/')) return;
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const s = Math.min(img.naturalWidth, img.naturalHeight);
    const out = Math.min(AVATAR_SIZE, s);
    const c = document.createElement('canvas');
    c.width = c.height = out;
    c.getContext('2d').drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, out, out);
    state.avatarData = c.toDataURL('image/jpeg', 0.85);
    await applyAvatar();
    update();
  } catch {
    flash('Could not read that image');
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function applyAvatar() {
  avatarImg = state.avatarData ? await loadImage(state.avatarData).catch(() => null) : null;
  $('avatar-thumb').hidden = !avatarImg;
  $('avatar-empty').hidden = !!avatarImg;
  $('avatar-remove').hidden = !avatarImg;
  if (avatarImg) $('avatar-thumb').src = state.avatarData;
}

addEventListener('avatar-file', (e) => setAvatarFile(e.detail));
if (window.pendingAvatar) setAvatarFile(window.pendingAvatar);

$('avatar-file').addEventListener('change', (e) => {
  setAvatarFile(e.target.files[0]);
  e.target.value = '';
});

$('avatar-remove').addEventListener('click', () => {
  state.avatarData = null;
  applyAvatar().then(update);
});

addEventListener('paste', (e) => {
  const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'));
  if (!file) return;
  e.preventDefault();
  setAvatarFile(file);
});

/* ---------- controls ---------- */

function buildStylePicker() {
  $('styles').innerHTML = Object.entries(STYLES)
    .map(
      ([key, { label }]) => `
      <label class="style-option">
        <input type="radio" name="style" value="${key}" class="visually-hidden">
        <canvas data-style="${key}" aria-hidden="true"></canvas>
        <span>${label}</span>
      </label>`
    )
    .join('');

  $('sizes').innerHTML = Object.entries(SIZES)
    .map(
      ([key, { label, w, h }]) => `
      <label>
        <input type="radio" name="size" value="${key}" class="visually-hidden">
        <span title="${w}×${h}">${label}</span>
      </label>`
    )
    .join('');
}

function syncForm() {
  // a saved style may have since been removed
  if (!STYLES[state.style]) state.style = 'classic';
  for (const key of ['quote', 'name', 'role', 'accent']) form.elements[key].value = state[key];
  form.elements.style.value = state.style;
  form.elements.size.value = state.size;
}

form.addEventListener('input', (e) => {
  const { name, value } = e.target;
  if (name in state) {
    state[name] = value;
    update();
  }
});
form.addEventListener('submit', (e) => e.preventDefault());

/* ---------- rendering ---------- */

let thumbTimer;

function data() {
  return { quote: state.quote, name: state.name.trim(), role: state.role.trim(), accent: state.accent, style: state.style, avatar: avatarImg };
}

function update() {
  const { w, h } = SIZES[state.size] ?? SIZES.square;
  render(preview, data(), w, h);
  preview.setAttribute('aria-label', [stripMarkdown(state.quote), state.name].filter(Boolean).join(' — ') || 'Quote preview');
  preview.parentElement.style.setProperty('--ratio', w / h);
  save();

  // thumbnails are cheap but don't need to track every keystroke
  clearTimeout(thumbTimer);
  thumbTimer = setTimeout(renderThumbs, 150);
}

function renderThumbs() {
  const d = data();
  for (const c of document.querySelectorAll('#styles canvas')) {
    render(c, { ...d, style: c.dataset.style }, 270, 270);
  }
}

/* ---------- export ---------- */

function toBlob() {
  return new Promise((resolve, reject) => preview.toBlob((b) => (b ? resolve(b) : reject(new Error('Export failed'))), 'image/png'));
}

function filename() {
  const slug = (state.name || 'quote').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${slug || 'quote'}-${state.style}.png`;
}

let flashTimer;
function flash(msg) {
  status.textContent = msg;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => (status.textContent = ''), 2500);
}

$('btn-download').addEventListener('click', async () => {
  const url = URL.createObjectURL(await toBlob());
  const a = Object.assign(document.createElement('a'), { href: url, download: filename() });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

$('btn-copy').addEventListener('click', async () => {
  try {
    // Safari needs the promise handed straight to ClipboardItem
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': toBlob() })]);
    flash('Copied to clipboard');
  } catch {
    flash('Copy is not supported here — try Download');
  }
});

const shareBtn = $('btn-share');
const probe = new File([''], 'x.png', { type: 'image/png' });
shareBtn.hidden = !navigator.canShare?.({ files: [probe] });
shareBtn.addEventListener('click', async () => {
  const file = new File([await toBlob()], filename(), { type: 'image/png' });
  try {
    await navigator.share({ files: [file] });
  } catch (err) {
    if (err.name !== 'AbortError') flash('Sharing failed');
  }
});

/* ---------- boot ---------- */

buildStylePicker();
syncForm();
await applyAvatar();
update();
renderThumbs();
