(() => {
  'use strict';

  // ---- State ----------------------------------------------------------------
  // state.html / state.css are *canonical*: uploaded files are referenced as
  // `asset:nice-name`. Only when content is injected into the live iframe are
  // those references swapped for the blob: URLs held in the `assets` map.
  const state = { html: '', css: '', mode: 'visual' };
  const assets = new Map(); // name -> { name, type, blob, url, added }

  const DEFAULT_HTML =
    '<h1>Untitled page</h1>\n' +
    '<p>Start typing here. Drag an image or font file anywhere on the window ' +
    'to add it, then reference it as <code>asset:its-name</code> from the HTML ' +
    'or CSS.</p>';

  const DEFAULT_CSS =
    'body {\n' +
    '  font-family: -apple-system, system-ui, sans-serif;\n' +
    '  line-height: 1.6;\n' +
    '  color: #222;\n' +
    '  max-width: 42rem;\n' +
    '  margin: 3rem auto;\n' +
    '  padding: 0 1.25rem;\n' +
    '}\n';

  // ---- Elements -------------------------------------------------------------
  const canvas = document.getElementById('canvas');
  const htmlSource = document.getElementById('html-source');
  const cssSource = document.getElementById('css-source');
  const cssPanel = document.getElementById('css-panel');
  const assetsPanel = document.getElementById('assets-panel');
  const assetList = document.getElementById('asset-list');
  const assetEmpty = document.getElementById('asset-empty');
  const dropOverlay = document.getElementById('drop-overlay');
  const saveStatus = document.getElementById('save-status');
  const modeVisual = document.getElementById('mode-visual');
  const modeHtml = document.getElementById('mode-html');

  let cdoc = null; // iframe contentDocument
  let cbody = null; // iframe body

  // ---- Asset reference <-> blob URL translation -----------------------------
  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // canonical -> live (asset:name  ->  blob: URL)
  function renderRefs(str) {
    let out = str;
    for (const a of assets.values()) {
      const re = new RegExp('asset:' + escapeRe(a.name) + '(?![\\w-])', 'g');
      out = out.replace(re, a.url);
    }
    return out;
  }

  // live -> canonical (blob: URL  ->  asset:name)
  function canonicalRefs(str) {
    let out = str;
    for (const a of assets.values()) {
      out = out.split(a.url).join('asset:' + a.name);
    }
    return out;
  }

  // ---- Persistence ----------------------------------------------------------
  let saveTimer = null;
  function scheduleSave() {
    saveStatus.textContent = 'Saving…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        await PageDB.saveDoc({ html: state.html, css: state.css });
        saveStatus.textContent = 'Saved';
      } catch (err) {
        console.error(err);
        saveStatus.textContent = 'Save failed';
      }
    }, 400);
  }

  // ---- The editing iframe ---------------------------------------------------
  function buildCanvas() {
    cdoc = canvas.contentDocument;
    cdoc.open();
    cdoc.write(
      '<!DOCTYPE html><html><head><meta charset="utf-8">' +
      '<style id="base-css">html,body{min-height:100%}body{outline:none}' +
      'body:empty::before{content:"Type here…";color:#aaa}</style>' +
      '<style id="user-css"></style></head><body></body></html>'
    );
    cdoc.close();
    cbody = cdoc.body;
    cbody.contentEditable = 'true';
    cbody.spellcheck = true;

    cbody.addEventListener('input', () => {
      state.html = canonicalRefs(cbody.innerHTML);
      scheduleSave();
    });

    // Let files dropped over the iframe raise the overlay in the top document.
    cdoc.addEventListener('dragenter', showDrop);
    cdoc.addEventListener('dragover', (e) => { e.preventDefault(); showDrop(); });

    applyCanvasContent();
    applyCss();
  }

  function applyCanvasContent() {
    cbody.innerHTML = renderRefs(state.html);
  }

  function applyCss() {
    if (!cdoc) return;
    cdoc.getElementById('user-css').textContent = renderRefs(state.css);
  }

  // ---- Mode switching -------------------------------------------------------
  function setMode(mode) {
    if (mode === state.mode) return;
    if (mode === 'html') {
      // entering HTML view: pull latest from the canvas
      state.html = canonicalRefs(cbody.innerHTML);
      htmlSource.value = state.html;
      canvas.hidden = true;
      htmlSource.hidden = false;
      htmlSource.focus();
    } else {
      // back to visual: canvas re-renders from canonical source
      applyCanvasContent();
      htmlSource.hidden = true;
      canvas.hidden = false;
    }
    state.mode = mode;
    modeVisual.classList.toggle('active', mode === 'visual');
    modeHtml.classList.toggle('active', mode === 'html');
    modeVisual.setAttribute('aria-selected', mode === 'visual');
    modeHtml.setAttribute('aria-selected', mode === 'html');
    // formatting buttons only make sense in visual mode
    document.getElementById('format-tools')
      .querySelectorAll('button').forEach((b) => (b.disabled = mode !== 'visual'));
  }

  modeVisual.addEventListener('click', () => setMode('visual'));
  modeHtml.addEventListener('click', () => setMode('html'));

  htmlSource.addEventListener('input', () => {
    state.html = htmlSource.value;
    scheduleSave();
  });

  cssSource.addEventListener('input', () => {
    state.css = cssSource.value;
    applyCss();
    scheduleSave();
  });

  // ---- Formatting toolbar ---------------------------------------------------
  // Use mousedown/preventDefault so the iframe selection isn't lost.
  document.getElementById('format-tools').addEventListener('mousedown', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    e.preventDefault();
    canvas.contentWindow.focus();
    if (btn.dataset.cmd) {
      cdoc.execCommand(btn.dataset.cmd, false, null);
    } else if (btn.dataset.block) {
      cdoc.execCommand('formatBlock', false, btn.dataset.block);
    } else if (btn.hasAttribute('data-link')) {
      const url = prompt('Link URL:', 'https://');
      if (url) cdoc.execCommand('createLink', false, url);
    }
    state.html = canonicalRefs(cbody.innerHTML);
    scheduleSave();
  });

  // ---- Panels ---------------------------------------------------------------
  function togglePanel(panel, btn) {
    const show = panel.hidden;
    panel.hidden = !show;
    btn.setAttribute('aria-pressed', String(show));
  }
  document.getElementById('toggle-css').addEventListener('click', (e) =>
    togglePanel(cssPanel, e.currentTarget));
  document.getElementById('toggle-assets').addEventListener('click', (e) =>
    togglePanel(assetsPanel, e.currentTarget));
  document.querySelectorAll('[data-close]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const panel = document.getElementById(btn.dataset.close);
      panel.hidden = true;
      const toggle = panel === cssPanel
        ? document.getElementById('toggle-css')
        : document.getElementById('toggle-assets');
      toggle.setAttribute('aria-pressed', 'false');
    });
  });

  // ---- Assets ---------------------------------------------------------------
  function slugify(filename) {
    const base = filename.replace(/\.[^./\\]+$/, '');
    const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return slug || 'file';
  }

  function uniqueName(desired, ignore) {
    let name = desired;
    let n = 2;
    while (assets.has(name) && name !== ignore) name = `${desired}-${n++}`;
    return name;
  }

  function registerAsset(rec) {
    rec.url = URL.createObjectURL(rec.blob);
    assets.set(rec.name, rec);
  }

  async function addFiles(fileList) {
    const files = [...fileList];
    if (!files.length) return;
    for (const file of files) {
      const name = uniqueName(slugify(file.name));
      const rec = { name, type: file.type || 'application/octet-stream', blob: file, added: Date.now() };
      registerAsset(rec);
      try {
        await PageDB.putAsset({ name: rec.name, type: rec.type, blob: rec.blob, added: rec.added });
      } catch (err) {
        console.error('Failed to store asset', err);
      }
    }
    renderAssetList();
    // make sure the files panel is visible so the user sees the result
    if (assetsPanel.hidden) {
      assetsPanel.hidden = false;
      document.getElementById('toggle-assets').setAttribute('aria-pressed', 'true');
    }
  }

  function isImage(type) { return type.startsWith('image/'); }
  function isFont(type) { return type.startsWith('font/') || /font|woff|otf|ttf/i.test(type); }

  function renderAssetList() {
    assetList.innerHTML = '';
    const all = [...assets.values()].sort((a, b) => b.added - a.added);
    assetEmpty.hidden = all.length > 0;
    for (const a of all) {
      const li = document.createElement('li');
      li.className = 'asset-item';

      const thumb = document.createElement(isImage(a.type) ? 'img' : 'div');
      thumb.className = 'asset-thumb';
      if (isImage(a.type)) { thumb.src = a.url; thumb.alt = a.name; }
      else thumb.textContent = isFont(a.type) ? '🔤' : '📄';

      const meta = document.createElement('div');
      meta.className = 'asset-meta';
      const nameInput = document.createElement('input');
      nameInput.className = 'asset-name';
      nameInput.value = a.name;
      nameInput.title = 'Click to rename';
      nameInput.addEventListener('change', () => renameAsset(a.name, nameInput.value, nameInput));
      const ref = document.createElement('div');
      ref.className = 'asset-ref';
      ref.innerHTML = 'use <code>asset:' + a.name + '</code>';
      meta.append(nameInput, ref);

      const actions = document.createElement('div');
      actions.className = 'asset-actions';
      const copyBtn = document.createElement('button');
      copyBtn.textContent = 'Copy ref';
      copyBtn.addEventListener('click', () => copyRef(a.name, copyBtn));
      actions.append(copyBtn);
      if (isImage(a.type)) {
        const insBtn = document.createElement('button');
        insBtn.textContent = 'Insert';
        insBtn.addEventListener('click', () => insertImage(a));
        actions.append(insBtn);
      }
      const delBtn = document.createElement('button');
      delBtn.className = 'del';
      delBtn.textContent = 'Delete';
      delBtn.addEventListener('click', () => removeAsset(a.name));
      actions.append(delBtn);

      li.append(thumb, meta, actions);
      assetList.append(li);
    }
  }

  async function renameAsset(oldName, raw, input) {
    const desired = slugify(raw);
    const newName = uniqueName(desired, oldName);
    if (newName === oldName) { input.value = oldName; return; }
    const rec = assets.get(oldName);
    assets.delete(oldName);
    rec.name = newName;
    assets.set(newName, rec);
    try {
      await PageDB.renameAsset(oldName, { name: rec.name, type: rec.type, blob: rec.blob, added: rec.added });
    } catch (err) { console.error(err); }
    // update existing references in the document and styles
    const reHtml = new RegExp('asset:' + escapeRe(oldName) + '(?![\\w-])', 'g');
    state.html = (state.mode === 'html' ? htmlSource.value : canonicalRefs(cbody.innerHTML))
      .replace(reHtml, 'asset:' + newName);
    state.css = state.css.replace(reHtml, 'asset:' + newName);
    if (state.mode === 'html') htmlSource.value = state.html; else applyCanvasContent();
    cssSource.value = state.css;
    applyCss();
    renderAssetList();
    scheduleSave();
  }

  async function removeAsset(name) {
    const rec = assets.get(name);
    if (!rec) return;
    URL.revokeObjectURL(rec.url);
    assets.delete(name);
    try { await PageDB.deleteAsset(name); } catch (err) { console.error(err); }
    renderAssetList();
  }

  async function copyRef(name, btn) {
    const ref = 'asset:' + name;
    try {
      await navigator.clipboard.writeText(ref);
      const old = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(() => (btn.textContent = old), 1100);
    } catch {
      prompt('Copy this reference:', ref);
    }
  }

  function insertImage(a) {
    if (state.mode !== 'visual') setMode('visual');
    canvas.contentWindow.focus();
    cdoc.execCommand('insertHTML', false,
      '<img src="' + a.url + '" alt="' + a.name + '">');
    state.html = canonicalRefs(cbody.innerHTML);
    scheduleSave();
  }

  // ---- Print ----------------------------------------------------------------
  // Print only the rendered iframe. If we're in HTML source view the canvas
  // may be stale, so push the current source into it first.
  function printPage() {
    if (state.mode === 'html') {
      state.html = htmlSource.value;
      applyCanvasContent();
      applyCss();
    }
    canvas.contentWindow.focus();
    canvas.contentWindow.print();
  }
  document.getElementById('print').addEventListener('click', printPage);

  // ---- Window-wide drag & drop ---------------------------------------------
  function showDrop() { dropOverlay.hidden = false; }
  function hideDrop() { dropOverlay.hidden = true; }

  window.addEventListener('dragover', (e) => {
    if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) {
      e.preventDefault();
      showDrop();
    }
  });
  window.addEventListener('dragleave', (e) => { if (!e.relatedTarget) hideDrop(); });
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    hideDrop();
    if (e.dataTransfer && e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  });
  dropOverlay.addEventListener('dragover', (e) => e.preventDefault());
  dropOverlay.addEventListener('drop', (e) => {
    e.preventDefault();
    hideDrop();
    if (e.dataTransfer && e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  });

  // ---- Init -----------------------------------------------------------------
  async function init() {
    let doc = null;
    try { doc = await PageDB.loadDoc(); } catch (err) { console.error(err); }
    state.html = doc?.html ?? DEFAULT_HTML;
    state.css = doc?.css ?? DEFAULT_CSS;

    try {
      const stored = await PageDB.listAssets();
      for (const rec of stored) registerAsset(rec);
    } catch (err) { console.error(err); }

    cssSource.value = state.css;
    htmlSource.value = state.html;
    renderAssetList();
    buildCanvas();
    saveStatus.textContent = 'Saved';
  }

  init();
})();
