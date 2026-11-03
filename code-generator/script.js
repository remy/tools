const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const KEY = 'code-generator.options';

const form = document.getElementById('form');
const error = document.getElementById('error');
const output = document.getElementById('output');
const summary = document.getElementById('summary');
const codesEl = document.getElementById('codes');

let codes = [];

// Unbiased random index via rejection sampling
function randomCode(length) {
  const max = 256 - (256 % ALPHABET.length);
  const buf = new Uint8Array(length * 2);
  let out = '';
  while (out.length < length) {
    crypto.getRandomValues(buf);
    for (const b of buf) {
      if (b < max) out += ALPHABET[b % ALPHABET.length];
      if (out.length === length) break;
    }
  }
  return out;
}

function generate(count, prefix, length) {
  const possible = ALPHABET.length ** length;
  // Cap unique-code attempts well below the keyspace to avoid near-infinite loops
  if (count > possible / 2) {
    throw new Error(`Length ${length} allows ${possible.toLocaleString()} combinations — too few for ${count.toLocaleString()} unique codes. Increase the length.`);
  }
  const set = new Set();
  while (set.size < count) set.add(prefix + randomCode(length));
  return [...set];
}

function render() {
  summary.textContent = `${codes.length.toLocaleString()} codes`;
  codesEl.value = codes.join('\n');
  output.hidden = false;
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const data = new FormData(form);
  const count = Number(data.get('count'));
  const prefix = String(data.get('prefix'));
  const length = Number(data.get('length'));

  try {
    localStorage.setItem(KEY, JSON.stringify({ count, prefix, length }));
  } catch {}

  try {
    codes = generate(count, prefix, length);
    error.hidden = true;
    render();
  } catch (err) {
    error.textContent = err.message;
    error.hidden = false;
    output.hidden = true;
  }
});

document.getElementById('copy').addEventListener('click', async (e) => {
  await navigator.clipboard.writeText(codes.join('\n'));
  const btn = e.currentTarget;
  btn.textContent = 'Copied';
  setTimeout(() => (btn.textContent = 'Copy'), 1500);
});

document.getElementById('download').addEventListener('click', () => {
  const csv = 'code\n' + codes.map((c) => `"${c.replaceAll('"', '""')}"`).join('\n') + '\n';
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `codes-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

// Restore last-used options
try {
  const saved = JSON.parse(localStorage.getItem(KEY));
  if (saved) {
    for (const [k, v] of Object.entries(saved)) {
      if (form.elements[k]) form.elements[k].value = v;
    }
  }
} catch {}
