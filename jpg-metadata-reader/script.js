// UI layer: file handling + rendering of parsed JPEG metadata.

const uploadZone = document.getElementById('uploadZone');
const fileInput  = document.getElementById('fileInput');
const toolPanel  = document.getElementById('toolPanel');
const fileNameEl = document.getElementById('fileName');
const fileMetaEl = document.getElementById('fileMeta');
const previewEl  = document.getElementById('preview');
const clearBtn   = document.getElementById('clearBtn');
const errorBox   = document.getElementById('errorBox');
const sectionsEl = document.getElementById('sections');

let previewUrl = null;

// ── File pick / drop ─────────────────────────────────────────────────────────
uploadZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  if (fileInput.files && fileInput.files[0]) handleFile(fileInput.files[0]);
});

['dragenter', 'dragover'].forEach(ev => {
  uploadZone.addEventListener(ev, (e) => {
    e.preventDefault();
    uploadZone.classList.add('drag-over');
  });
});
['dragleave', 'drop'].forEach(ev => {
  uploadZone.addEventListener(ev, (e) => {
    e.preventDefault();
    uploadZone.classList.remove('drag-over');
  });
});
uploadZone.addEventListener('drop', (e) => {
  if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
    handleFile(e.dataTransfer.files[0]);
  }
});

clearBtn.addEventListener('click', reset);

function reset() {
  fileInput.value = '';
  toolPanel.hidden = true;
  uploadZone.hidden = false;
  sectionsEl.innerHTML = '';
  errorBox.hidden = true;
  errorBox.textContent = '';
  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
    previewUrl = null;
  }
}

async function handleFile(file) {
  errorBox.hidden = true;
  errorBox.textContent = '';
  sectionsEl.innerHTML = '';

  fileNameEl.textContent = file.name;
  fileMetaEl.textContent = `${formatBytes(file.size)} · ${file.type || 'application/octet-stream'}`;

  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(file);
  previewEl.src = previewUrl;

  uploadZone.hidden = true;
  toolPanel.hidden = false;

  let buffer;
  try {
    buffer = await file.arrayBuffer();
  } catch (e) {
    showError(`Could not read file: ${e.message}`);
    return;
  }

  let parsed;
  try {
    parsed = MetaParser.parseJpeg(buffer);
  } catch (e) {
    showError(e.message || String(e));
    return;
  }

  render(parsed, file);
}

function showError(msg) {
  errorBox.textContent = msg;
  errorBox.hidden = false;
}

// ── Rendering ────────────────────────────────────────────────────────────────
function render(p, file) {
  sectionsEl.innerHTML = '';

  // Overview
  const overview = [];
  if (p.sof) {
    overview.push(['Dimensions', `${p.sof.width} × ${p.sof.height}`]);
    overview.push(['Bit depth', `${p.sof.precision}-bit`]);
    overview.push(['Components', `${p.sof.components} (${p.sof.components === 1 ? 'grayscale' : p.sof.components === 3 ? 'YCbCr / RGB' : 'CMYK or other'})`]);
    overview.push(['Encoding', MetaParser.MARKER_NAMES[p.sof.marker] || `0x${p.sof.marker.toString(16)}`]);
  }
  overview.push(['File size', formatBytes(file.size)]);
  overview.push(['Segments', String(p.segments.length)]);
  appendSection('Overview', overview);

  // EXIF — IFD0
  if (p.exif) {
    appendSection('EXIF · IFD0 (Image)', entriesToRows(p.exif.entries, true));
    if (p.exif.sub && p.exif.sub.length) {
      appendSection('EXIF · ExifSubIFD (Photo)', entriesToRows(p.exif.sub, true));
    }
  }

  // GPS
  if (p.gps) {
    const rows = entriesToRows(p.gps.entries, true);
    let extra = null;
    if (p.gps.decoded) {
      const { latitude, longitude, altitude } = p.gps.decoded;
      rows.unshift(['Coordinates', `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`]);
      if (altitude != null) {
        rows.splice(1, 0, ['Altitude', `${altitude.toFixed(2)} m`]);
      }
      const url = `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=15/${latitude}/${longitude}`;
      extra = el('a', { class: 'gps-link', href: url, target: '_blank', rel: 'noopener' }, 'Open in OpenStreetMap ↗');
    }
    const section = appendSection('GPS', rows);
    if (extra) section.querySelector('.section-body').appendChild(extra);
  }

  // Interoperability IFD
  if (p.interop && p.interop.length) {
    appendSection('EXIF · Interoperability IFD', entriesToRows(p.interop, true));
  }

  // IFD1 — thumbnail
  if (p.ifd1) {
    const rows = entriesToRows(p.ifd1.entries, true);
    const section = appendSection('EXIF · IFD1 (Thumbnail)', rows);
    if (p.ifd1.thumbnail) {
      const blob = new Blob([p.ifd1.thumbnail], { type: 'image/jpeg' });
      const url = URL.createObjectURL(blob);
      const wrap = el('div', { class: 'raw-block' },
        el('img', { src: url, alt: 'EXIF thumbnail', style: 'max-width: 12rem; border: 1px solid var(--border); border-radius: var(--radius);' })
      );
      section.querySelector('.section-body').appendChild(wrap);
    }
  }

  // JFIF
  if (p.jfif) {
    appendSection('JFIF', [
      ['Version', p.jfif.version],
      ['Density units', p.jfif.units],
      ['X density', String(p.jfif.xDensity)],
      ['Y density', String(p.jfif.yDensity)],
    ]);
  }

  // Adobe APP14
  if (p.adobe) {
    appendSection('Adobe APP14', [
      ['Version', '0x' + p.adobe.version.toString(16).padStart(4, '0')],
      ['Flags 0', '0x' + p.adobe.flags0.toString(16).padStart(4, '0')],
      ['Flags 1', '0x' + p.adobe.flags1.toString(16).padStart(4, '0')],
      ['Color transform', p.adobe.colorTransform],
    ]);
  }

  // ICC profile
  if (p.icc) {
    const concat = MetaParser.concatIccChunks(p.icc);
    const header = MetaParser.parseIccHeader(concat);
    const rows = [['Profile bytes', formatBytes(concat.byteLength)]];
    if (header) {
      rows.push(['Description', header.description || '—']);
      rows.push(['Version', header.version]);
      rows.push(['Device class', header.deviceClass]);
      rows.push(['Color space', header.colorSpace]);
      rows.push(['PCS', header.pcs]);
      rows.push(['CMM', header.cmm || '—']);
      rows.push(['Platform', header.platform || '—']);
      rows.push(['Manufacturer', header.manufacturer || '—']);
      rows.push(['Model', header.model || '—']);
      rows.push(['Created', header.created]);
    }
    appendSection('ICC Profile', rows);
  }

  // IPTC
  if (p.iptc && p.iptc.length) {
    const rows = p.iptc.map(e => [e.name, e.value, e.key]);
    appendSection('IPTC / IIM', rows);
  }

  // XMP
  if (p.xmp) {
    const section = appendSection('XMP', []);
    const body = section.querySelector('.section-body');
    body.innerHTML = '';
    body.appendChild(el('div', { class: 'raw-block' }, el('pre', {}, p.xmp.trim())));
  }

  // Comments
  if (p.comments.length) {
    const rows = p.comments.map((c, i) => [`Comment #${i + 1}`, c]);
    appendSection('JPEG Comments', rows);
  }

  // Segment map (always last)
  const segRows = p.segments.map(s => [
    `0x${s.marker.toString(16).padStart(2, '0').toUpperCase()}`,
    `${s.name} · ${s.length ? formatBytes(s.length) : 'no payload'} @ offset ${s.offset}`,
  ]);
  appendSection('JPEG Segment Map', segRows, { collapsed: true });
}

// ── Section helpers ──────────────────────────────────────────────────────────
function appendSection(title, rows, opts = {}) {
  const section = el('section', { class: 'section', 'data-collapsed': opts.collapsed ? 'true' : 'false' });
  const header = el('div', { class: 'section-header' },
    el('h2', {}, title, ' ', el('span', { class: 'count' }, String(rows.length))),
    el('button', { class: 'section-toggle', type: 'button', 'aria-label': 'Toggle section' }, chevron()),
  );
  header.addEventListener('click', () => {
    const collapsed = section.getAttribute('data-collapsed') === 'true';
    section.setAttribute('data-collapsed', collapsed ? 'false' : 'true');
  });
  const body = el('div', { class: 'section-body' });
  if (rows.length === 0) {
    body.appendChild(el('div', { class: 'section-empty' }, 'No entries.'));
  } else {
    const list = el('div', { class: 'kv-list' });
    for (const row of rows) {
      list.appendChild(kvRow(row[0], row[1], row[2]));
    }
    body.appendChild(list);
  }
  section.append(header, body);
  sectionsEl.appendChild(section);
  return section;
}

function kvRow(key, value, hint) {
  const keyEl = el('div', { class: 'kv-key' }, key);
  if (hint) keyEl.appendChild(el('span', { class: 'kv-tag' }, hint));
  let valueText, muted = false;
  if (value == null || value === '') { valueText = '—'; muted = true; }
  else valueText = String(value);
  const valueEl = el('div', { class: 'kv-value' + (muted ? ' is-muted' : '') }, valueText);
  return el('div', { class: 'kv-row' }, keyEl, valueEl);
}

function entriesToRows(entries, includeTagHex) {
  return entries.map(e => [
    e.name || `Unknown (${e.tagHex})`,
    e.formatted,
    includeTagHex ? e.tagHex : null,
  ]);
}

function chevron() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(ns, 'polyline');
  path.setAttribute('points', '6 9 12 15 18 9');
  svg.appendChild(path);
  return svg;
}

// ── Small DOM + format helpers ───────────────────────────────────────────────
function el(tag, attrs, ...children) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null) continue;
      if (k === 'class') node.className = v;
      else node.setAttribute(k, v);
    }
  }
  for (const child of children) {
    if (child == null) continue;
    node.append(child);
  }
  return node;
}

function formatBytes(n) {
  if (!Number.isFinite(n)) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let u = 0, v = n;
  while (v >= 1024 && u < units.length - 1) { v /= 1024; u++; }
  return `${v >= 10 || u === 0 ? v.toFixed(0) : v.toFixed(2)} ${units[u]}`;
}
