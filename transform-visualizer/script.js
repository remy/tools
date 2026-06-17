// CSS Transform Visualizer — vanilla JS.
// The preview lives in a sandboxed iframe so user HTML/CSS can't leak into the
// tool's own page. Slider + origin updates are streamed to the iframe over
// postMessage (no reload); only HTML/id changes rebuild the document.

const STORAGE_KEY = 'transform-visualizer:v1';

const CONTROLS = [
  {
    group: 'Translate', items: [
      { key: 'translateX', label: 'translateX', min: -200, max: 200, step: 1, def: 0, unit: 'px' },
      { key: 'translateY', label: 'translateY', min: -200, max: 200, step: 1, def: 0, unit: 'px' },
      { key: 'translateZ', label: 'translateZ', min: -400, max: 400, step: 1, def: 0, unit: 'px' },
    ],
  },
  {
    group: 'Rotate', items: [
      { key: 'rotateX', label: 'rotateX', min: -180, max: 180, step: 1, def: 0, unit: 'deg' },
      { key: 'rotateY', label: 'rotateY', min: -180, max: 180, step: 1, def: 0, unit: 'deg' },
      { key: 'rotateZ', label: 'rotateZ', min: -180, max: 180, step: 1, def: 0, unit: 'deg' },
    ],
  },
  {
    group: 'Scale', items: [
      { key: 'scaleX', label: 'scaleX', min: -1, max: 2, step: 0.01, def: 1, unit: '' },
      { key: 'scaleY', label: 'scaleY', min: -1, max: 2, step: 0.01, def: 1, unit: '' },
      { key: 'scaleZ', label: 'scaleZ', min: -1, max: 2, step: 0.01, def: 1, unit: '' },
    ],
  },
  {
    group: 'Skew', items: [
      { key: 'skewX', label: 'skewX', min: -60, max: 60, step: 1, def: 0, unit: 'deg' },
      { key: 'skewY', label: 'skewY', min: -60, max: 60, step: 1, def: 0, unit: 'deg' },
    ],
  },
  {
    group: 'Perspective', items: [
      { key: 'perspective', label: 'perspective', min: 0, max: 2000, step: 10, def: 0, unit: 'px' },
    ],
  },
  {
    group: 'Transform origin', items: [
      { key: 'originX', label: 'origin X', min: 0, max: 100, step: 1, def: 50, unit: '%' },
      { key: 'originY', label: 'origin Y', min: 0, max: 100, step: 1, def: 50, unit: '%' },
      { key: 'originZ', label: 'origin Z', min: -300, max: 300, step: 1, def: 0, unit: 'px' },
    ],
  },
];

const PRESETS = {
  'flip-y': { rotateY: 180 },
  'tilt': { perspective: 800, rotateX: 18, rotateY: -22 },
  'pop': { scaleX: 1.2, scaleY: 1.2 },
  'skew': { skewX: -14, rotateZ: -4 },
  'isometric': { rotateX: 55, rotateZ: -45 },
  'spin': { rotateZ: 45 },
};

const DEFAULT_HTML = '<div id="target">Transform me</div>';
const DEFAULT_CSS = `#target {
  width: 150px;
  height: 150px;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, #6c63ff, #4f46e5);
  color: #fff;
  font: 600 1rem system-ui, sans-serif;
  border-radius: 14px;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.28);
}`;

const META = {};
const defaults = {};
CONTROLS.forEach((g) => g.items.forEach((i) => { META[i.key] = i; defaults[i.key] = i.def; }));

// ─── State ───
let state = { ...defaults };
let options = { showGhost: true, showOrigin: true, smooth: false, backface: false };
let targetId = 'target';
let userHtml = DEFAULT_HTML;
let userCss = DEFAULT_CSS;

const inputs = {};

const iframe = document.getElementById('preview');
const codeEl = document.getElementById('code-out');
const htmlEditor = document.getElementById('html-editor');
const cssEditor = document.getElementById('css-editor');
const idInput = document.getElementById('target-id');
const htmlErr = document.getElementById('html-err');
const presetSel = document.getElementById('preset');

// ─── Helpers ───
function fmt(v) {
  v = +v;
  if (!Number.isFinite(v)) return '0';
  return Number.isInteger(v) ? String(v) : String(+v.toFixed(2));
}

function clamp(v, key) {
  const m = META[key];
  v = +v;
  if (!Number.isFinite(v)) v = m.def;
  return Math.min(m.max, Math.max(m.min, v));
}

function buildTransform() {
  const s = state;
  const parts = [];
  if (s.perspective > 0) parts.push(`perspective(${fmt(s.perspective)}px)`);
  if (s.translateX || s.translateY || s.translateZ) {
    parts.push(`translate3d(${fmt(s.translateX)}px, ${fmt(s.translateY)}px, ${fmt(s.translateZ)}px)`);
  }
  if (s.rotateX) parts.push(`rotateX(${fmt(s.rotateX)}deg)`);
  if (s.rotateY) parts.push(`rotateY(${fmt(s.rotateY)}deg)`);
  if (s.rotateZ) parts.push(`rotateZ(${fmt(s.rotateZ)}deg)`);
  if (s.scaleX !== 1 || s.scaleY !== 1 || s.scaleZ !== 1) {
    parts.push(`scale3d(${fmt(s.scaleX)}, ${fmt(s.scaleY)}, ${fmt(s.scaleZ)})`);
  }
  if (s.skewX || s.skewY) parts.push(`skew(${fmt(s.skewX)}deg, ${fmt(s.skewY)}deg)`);
  return parts.length ? parts.join(' ') : 'none';
}

function buildOrigin() {
  const s = state;
  return `${fmt(s.originX)}% ${fmt(s.originY)}%` + (s.originZ ? ` ${fmt(s.originZ)}px` : '');
}

function generatedCss() {
  const lines = [`#${targetId} {`];
  lines.push(`  transform-origin: ${buildOrigin()};`);
  lines.push(`  transform: ${buildTransform()};`);
  if (options.backface) lines.push('  backface-visibility: hidden;');
  if (options.smooth) lines.push('  transition: transform 0.35s ease, transform-origin 0.35s ease;');
  lines.push('}');
  return lines.join('\n');
}

// ─── Apply (stream transform to the iframe) ───
function apply() {
  iframe.contentWindow?.postMessage({
    kind: 'apply',
    transform: buildTransform(),
    origin: buildOrigin(),
    transition: options.smooth ? 'transform 0.35s ease, transform-origin 0.35s ease' : '',
    backface: options.backface ? 'hidden' : '',
    ox: state.originX, oy: state.originY, oz: state.originZ,
    showGhost: options.showGhost, showOrigin: options.showOrigin,
  }, '*');
  codeEl.textContent = generatedCss();
  save();
}

function setValue(key, v) {
  state[key] = clamp(v, key);
  syncInput(key);
  presetSel.value = '';
  apply();
}

function syncInput(key) {
  const i = inputs[key];
  if (!i) return;
  i.range.value = state[key];
  i.num.value = state[key];
}

// ─── Build the iframe document ───
const STAGE_CSS = `
*{box-sizing:border-box;}
html,body{height:100%;}
body{margin:0;min-height:100%;display:flex;align-items:center;justify-content:center;
  font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#18181b;
  background-color:#ffffff;
  background-image:linear-gradient(rgba(0,0,0,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(0,0,0,.06) 1px,transparent 1px);
  background-size:24px 24px;background-position:center;overflow:hidden;}
@media (prefers-color-scheme:dark){
  body{color:#e8e9f0;background-color:#0f1117;
    background-image:linear-gradient(rgba(255,255,255,.08) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.08) 1px,transparent 1px);}
}
#__ghost{position:absolute;border:1px dashed currentColor;opacity:.5;pointer-events:none;background:transparent;}
#__origin{position:absolute;width:24px;height:24px;transform:translate(-50%,-50%);z-index:99999;cursor:grab;touch-action:none;}
#__origin:active{cursor:grabbing;}
#__origin::before{content:'';position:absolute;left:11px;top:1px;width:2px;height:22px;background:#e11d48;}
#__origin::after{content:'';position:absolute;left:1px;top:11px;width:22px;height:2px;background:#e11d48;}
#__origin i{position:absolute;left:5px;top:5px;width:14px;height:14px;border:2px solid #e11d48;border-radius:50%;background:rgba(225,29,72,.22);box-sizing:border-box;}
[hidden]{display:none!important;}
`;

// Runs inside the iframe. Reads window.__TID__ for the target id.
function bridge() {
  const ID = window.__TID__;
  const target = document.getElementById(ID);
  const ghost = document.getElementById('__ghost');
  const marker = document.getElementById('__origin');
  let ox = 50, oy = 50, oz = 0;

  // Pre-transform position relative to <body>, walking the offsetParent chain so
  // it stays correct even when the target is nested inside other elements.
  function offsetOf(el) {
    let x = 0, y = 0, node = el;
    while (node && node !== document.body) {
      x += node.offsetLeft;
      y += node.offsetTop;
      node = node.offsetParent;
    }
    return { x: x, y: y };
  }

  function reposition() {
    if (!target) return;
    const off = offsetOf(target);
    const ol = off.x, ot = off.y;
    const ow = target.offsetWidth, oh = target.offsetHeight;
    if (ghost) {
      ghost.style.left = ol + 'px';
      ghost.style.top = ot + 'px';
      ghost.style.width = ow + 'px';
      ghost.style.height = oh + 'px';
    }
    if (marker) {
      marker.style.left = (ol + ow * ox / 100) + 'px';
      marker.style.top = (ot + oh * oy / 100) + 'px';
    }
  }

  window.addEventListener('message', function (e) {
    const d = e.data || {};
    if (d.kind === 'css') {
      const s = document.getElementById('__user');
      if (s) s.textContent = d.css;
      reposition();
      return;
    }
    if (d.kind !== 'apply') return;
    if (target) {
      target.style.transform = d.transform;
      target.style.transformOrigin = d.origin;
      target.style.transition = d.transition || '';
      target.style.backfaceVisibility = d.backface || '';
    }
    ox = d.ox; oy = d.oy; oz = d.oz;
    if (ghost) ghost.hidden = !d.showGhost;
    if (marker) marker.hidden = !d.showOrigin;
    reposition();
  });

  window.addEventListener('resize', reposition);

  if (marker && target) {
    marker.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      try { marker.setPointerCapture(e.pointerId); } catch (_) {}
      function move(ev) {
        const ow = target.offsetWidth, oh = target.offsetHeight;
        const br = document.body.getBoundingClientRect();
        const off = offsetOf(target);
        let x = ((ev.clientX - (br.left + off.x)) / ow) * 100;
        let y = ((ev.clientY - (br.top + off.y)) / oh) * 100;
        x = Math.max(0, Math.min(100, x));
        y = Math.max(0, Math.min(100, y));
        ox = x; oy = y;
        target.style.transformOrigin = x + '% ' + y + '%' + (oz ? ' ' + oz + 'px' : '');
        reposition();
        parent.postMessage({ kind: 'origin', x: x, y: y }, '*');
      }
      function up() {
        try { marker.releasePointerCapture(e.pointerId); } catch (_) {}
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      }
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
  }

  setTimeout(reposition, 60);
  parent.postMessage({ kind: 'ready' }, '*');
}

function buildSrcDoc() {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>${STAGE_CSS}</style>
<style id="__user">${userCss}</style>
</head><body>
<div id="__ghost" aria-hidden="true"></div>
${userHtml}
<div id="__origin" aria-hidden="true"><i></i></div>
<script>window.__TID__=${JSON.stringify(targetId)};(${bridge.toString()})();<\/script>
</body></html>`;
}

function rebuildPreview() {
  iframe.srcdoc = buildSrcDoc();
}

function pushCss() {
  iframe.contentWindow?.postMessage({ kind: 'css', css: userCss }, '*');
}

// ─── Messages from the iframe ───
window.addEventListener('message', (e) => {
  if (e.source !== iframe.contentWindow) return;
  const d = e.data || {};
  if (d.kind === 'ready') {
    apply();
  } else if (d.kind === 'origin') {
    state.originX = Math.round(d.x);
    state.originY = Math.round(d.y);
    syncInput('originX');
    syncInput('originY');
    presetSel.value = '';
    codeEl.textContent = generatedCss();
    save();
  }
});

// ─── Render controls ───
function renderControls() {
  const root = document.getElementById('slider-groups');
  root.textContent = '';
  CONTROLS.forEach((group) => {
    const det = document.createElement('details');
    det.className = 'group';
    det.open = true;

    const sum = document.createElement('summary');
    const title = document.createElement('span');
    title.textContent = group.group;
    const chev = document.createElement('span');
    chev.className = 'chev';
    chev.setAttribute('aria-hidden', 'true');
    sum.append(title, chev);
    det.appendChild(sum);

    const body = document.createElement('div');
    body.className = 'group-body';

    group.items.forEach((item) => {
      const wrap = document.createElement('div');
      wrap.className = 'slider';

      const head = document.createElement('div');
      head.className = 'slider-head';

      const label = document.createElement('label');
      label.textContent = item.label;
      label.title = 'Double-click to reset';
      label.addEventListener('dblclick', () => setValue(item.key, item.def));

      const valWrap = document.createElement('div');
      valWrap.className = 'slider-val';
      const num = document.createElement('input');
      num.type = 'number';
      num.min = item.min; num.max = item.max; num.step = item.step;
      num.value = state[item.key];
      const unit = document.createElement('span');
      unit.className = 'unit';
      unit.textContent = item.unit || '—';
      valWrap.append(num, unit);

      head.append(label, valWrap);

      const range = document.createElement('input');
      range.type = 'range';
      range.min = item.min; range.max = item.max; range.step = item.step;
      range.value = state[item.key];

      wrap.append(head, range);
      body.appendChild(wrap);

      range.addEventListener('input', () => setValue(item.key, range.value));
      num.addEventListener('input', () => setValue(item.key, num.value));

      inputs[item.key] = { range, num };
    });

    det.appendChild(body);
    root.appendChild(det);
  });
}

// ─── Persistence ───
function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ state, options, targetId, userHtml, userCss }));
  } catch (_) {}
}

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!raw) return;
    if (raw.state) for (const k in defaults) if (k in raw.state) state[k] = clamp(raw.state[k], k);
    if (raw.options) Object.assign(options, raw.options);
    if (raw.targetId) targetId = raw.targetId;
    if (typeof raw.userHtml === 'string') userHtml = raw.userHtml;
    if (typeof raw.userCss === 'string') userCss = raw.userCss;
  } catch (_) {}
}

// ─── HTML validation ───
function htmlHasId(html, id) {
  if (!id) return false;
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return !!doc.getElementById(id);
  } catch (_) {
    return false;
  }
}

function showHtmlError(msg) {
  if (msg) {
    htmlErr.textContent = msg;
    htmlErr.hidden = false;
  } else {
    htmlErr.hidden = true;
  }
}

// ─── Wiring ───
function applyPreset(name) {
  const preset = PRESETS[name];
  if (!preset) return;
  state = { ...defaults, ...preset };
  for (const k in inputs) syncInput(k);
  apply();
}

function init() {
  load();
  renderControls();

  // editors reflect loaded state
  idInput.value = targetId;
  htmlEditor.value = userHtml;
  cssEditor.value = userCss;

  // options
  const optMap = {
    'opt-ghost': 'showGhost',
    'opt-origin': 'showOrigin',
    'opt-smooth': 'smooth',
    'opt-backface': 'backface',
  };
  for (const [elId, key] of Object.entries(optMap)) {
    const el = document.getElementById(elId);
    el.checked = !!options[key];
    el.addEventListener('change', () => { options[key] = el.checked; apply(); });
  }

  presetSel.addEventListener('change', () => applyPreset(presetSel.value));

  document.getElementById('reset').addEventListener('click', () => {
    state = { ...defaults };
    for (const k in inputs) syncInput(k);
    presetSel.value = '';
    apply();
  });

  document.getElementById('copy-css').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    try {
      await navigator.clipboard.writeText(generatedCss());
      const old = btn.textContent;
      btn.textContent = 'Copied!';
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = old; btn.classList.remove('copied'); }, 1200);
    } catch (_) {}
  });

  // Custom CSS — hot-swapped without a reload
  let cssTimer;
  cssEditor.addEventListener('input', () => {
    clearTimeout(cssTimer);
    cssTimer = setTimeout(() => { userCss = cssEditor.value; pushCss(); save(); }, 250);
  });

  // HTML — rebuilds the document, but only if the target id survives
  let htmlTimer;
  htmlEditor.addEventListener('input', () => {
    clearTimeout(htmlTimer);
    htmlTimer = setTimeout(() => {
      const val = htmlEditor.value;
      if (!htmlHasId(val, targetId)) {
        showHtmlError(`Keep an element with id="${targetId}"`);
        return;
      }
      showHtmlError('');
      userHtml = val;
      rebuildPreview();
      save();
    }, 350);
  });

  // Target id changes
  idInput.addEventListener('change', () => {
    const next = idInput.value.trim();
    if (!next) { idInput.value = targetId; return; }
    targetId = next;
    if (!htmlHasId(userHtml, targetId)) {
      showHtmlError(`Keep an element with id="${targetId}"`);
    } else {
      showHtmlError('');
    }
    rebuildPreview();
    codeEl.textContent = generatedCss();
    save();
  });

  codeEl.textContent = generatedCss();
  rebuildPreview();
}

init();
