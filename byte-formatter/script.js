const STORE_KEY = 'byte-formatter.options';

const PRESETS = {
  js: { base: '16', width: '1', prefix: '0x', suffix: '', sep: ', ', perLine: '16', pad: '', before: '[\\n', after: '\\n]', indent: '  ', upper: false, trailing: false },
  uint8: { base: '16', width: '1', prefix: '0x', suffix: '', sep: ', ', perLine: '16', pad: '', before: 'new Uint8Array([\\n', after: '\\n])', indent: '  ', upper: false, trailing: false },
  c: { base: '16', width: '1', prefix: '0x', suffix: '', sep: ', ', perLine: '12', pad: '', before: 'const unsigned char data[] = {\\n', after: '\\n};', indent: '  ', upper: false, trailing: true },
  hex: { base: '16', width: '1', prefix: '', suffix: '', sep: '', perLine: '0', pad: '', before: '', after: '', indent: '', upper: false, trailing: false },
  dump: { base: '16', width: '1', prefix: '', suffix: '', sep: ' ', perLine: '16', pad: '', before: '', after: '', indent: '', upper: true, trailing: false },
};

const form = document.getElementById('options');
const output = document.getElementById('output');
const stats = document.getElementById('stats');
const fileInfo = document.getElementById('file-info');
const copyBtn = document.getElementById('copy-btn');
const downloadBtn = document.getElementById('download-btn');

let current = null; // { name, bytes }

const unescape = (s) => s.replace(/\\(n|t|r|\\)/g, (_, c) => ({ n: '\n', t: '\t', r: '\r', '\\': '\\' })[c]);

function readForm() {
  const f = form.elements;
  const o = { preset: f.preset.value };
  for (const el of f) {
    if (!el.name || el.name === 'preset') continue;
    o[el.name] = el.type === 'checkbox' ? el.checked : el.value;
  }
  return o;
}

function writeForm(o) {
  for (const [k, v] of Object.entries(o)) {
    const el = form.elements[k];
    if (!el) continue;
    if (el.type === 'checkbox') el.checked = !!v;
    else el.value = v;
  }
}

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(readForm())); } catch {}
}

function load() {
  try {
    const o = JSON.parse(localStorage.getItem(STORE_KEY));
    if (o) return o;
  } catch {}
  return { preset: 'js', ...PRESETS.js, offset: '0', length: '' };
}

function format(bytes, o) {
  const base = Number(o.base);
  const width = Number(o.width);
  const bits = width * 8;
  const fullDigits = Math.ceil(bits / Math.log2(base));
  const pad = o.pad === '' ? fullDigits : Math.max(0, Number(o.pad) | 0);
  const perLine = Math.max(0, Number(o.perLine) | 0);
  const prefix = unescape(o.prefix);
  const suffix = unescape(o.suffix);
  const sep = unescape(o.sep);
  const indent = unescape(o.indent);
  const lineSep = sep.replace(/\s+$/, '');
  const le = o.endian === 'le';

  const count = Math.ceil(bytes.length / width);
  const words = new Array(count);
  for (let i = 0; i < count; i++) {
    let v = 0;
    for (let b = 0; b < width; b++) {
      const byte = bytes[i * width + b] ?? 0;
      const shift = le ? b * 8 : (width - 1 - b) * 8;
      v += byte * 2 ** shift; // avoid sign issues with << for 32 bit
    }
    let s = v.toString(base);
    if (o.upper) s = s.toUpperCase();
    words[i] = prefix + s.padStart(pad, '0') + suffix;
  }

  let body;
  if (perLine === 0) {
    body = indent + words.join(sep);
  } else {
    const lines = [];
    for (let i = 0; i < count; i += perLine) {
      lines.push(indent + words.slice(i, i + perLine).join(sep));
    }
    body = lines.join(lineSep + '\n');
  }
  if (o.trailing && count) body += perLine === 0 ? sep : lineSep;
  return { text: unescape(o.before) + body + unescape(o.after), count, partial: bytes.length % width };
}

const fmtSize = (n) => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;

let queued = false;
function render() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    if (!current) return;
    const o = readForm();
    const total = current.bytes.length;
    const start = Math.min(total, Math.max(0, Number(o.offset) | 0));
    const end = o.length === '' ? total : Math.min(total, start + Math.max(0, Number(o.length) | 0));
    const slice = current.bytes.subarray(start, end);
    const { text, count, partial } = format(slice, o);
    output.value = text;
    stats.textContent = `${slice.length} bytes → ${count} values` + (partial ? ` (last word zero-padded)` : '');
    copyBtn.disabled = downloadBtn.disabled = false;
  });
}

form.addEventListener('input', (e) => {
  const name = e.target.name;
  if (name === 'preset') {
    if (PRESETS[e.target.value]) writeForm(PRESETS[e.target.value]);
  } else if (name !== 'offset' && name !== 'length' && name !== 'endian') {
    form.elements.preset.value = 'custom';
  }
  save();
  render();
});
form.addEventListener('submit', (e) => e.preventDefault());

copyBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(output.value);
    copyBtn.textContent = 'Copied';
  } catch {
    output.select();
    copyBtn.textContent = 'Select & copy';
  }
  setTimeout(() => (copyBtn.textContent = 'Copy'), 1500);
});

downloadBtn.addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([output.value], { type: 'text/plain' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `${current?.name || 'bytes'}.txt` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

writeForm(load());

window.__bytesEarly.register((item) => {
  current = item;
  fileInfo.textContent = `${item.name} — ${fmtSize(item.bytes.length)}`;
  render();
});
