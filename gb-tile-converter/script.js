(() => {
  // DMG palette (classic green shades)
  const DMG = [
    { r: 224, g: 248, b: 208 }, // 0 - White
    { r: 136, g: 192, b: 112 }, // 1 - Light
    { r:  52, g: 104, b:  86 }, // 2 - Dark
    { r:   8, g:  24, b:  32 }, // 3 - Black
  ];

  const DMG_CSS = ['#e0f8d0', '#88c070', '#346856', '#081820'];

  // DOM refs
  const el = {
    overviewModeBtn: document.getElementById('overviewModeBtn'),
    tileEditModeBtn: document.getElementById('tileEditModeBtn'),
    overviewSection: document.getElementById('overviewSection'),
    tileEditorSection: document.getElementById('tileEditorSection'),
    dropTarget: document.getElementById('dropTarget'),
    dropOverlay: document.getElementById('dropOverlay'),
    fileInput: document.getElementById('fileInput'),
    overviewCanvas: document.getElementById('overviewCanvas'),
    resetPositionBtn: document.getElementById('resetPositionBtn'),
    zoomControls: document.getElementById('zoomControls'),
    zoomInBtn: document.getElementById('zoomInBtn'),
    zoomOutBtn: document.getElementById('zoomOutBtn'),
    zoomFitBtn: document.getElementById('zoomFitBtn'),
    zoomLevel: document.getElementById('zoomLevel'),
    imageInfo: document.getElementById('imageInfo'),
    tileGridCanvas: document.getElementById('tileGridCanvas'),
    tileZoomCanvas: document.getElementById('tileZoomCanvas'),
    prevTileBtn: document.getElementById('prevTileBtn'),
    nextTileBtn: document.getElementById('nextTileBtn'),
    addTileBtn: document.getElementById('addTileBtn'),
    deleteTileBtn: document.getElementById('deleteTileBtn'),
    tileIndex: document.getElementById('tileIndex'),
    paletteButtons: document.querySelectorAll('.palette-btn'),
    varName: document.getElementById('varName'),
    formatToggleBtn: document.getElementById('formatToggleBtn'),
    copyOutputBtn: document.getElementById('copyOutputBtn'),
    headerOutput: document.getElementById('headerOutput'),
    parseStatus: document.getElementById('parseStatus'),
  };

  const ovCtx = el.overviewCanvas.getContext('2d', { willReadFrequently: true });
  const gridCtx = el.tileGridCanvas.getContext('2d');
  const zoomCtx = el.tileZoomCanvas.getContext('2d');

  // State
  const state = {
    image: null,
    imageFileName: '',
    offsetX: 0,
    offsetY: 0,
    dragging: false,
    dragStartX: 0,
    dragStartY: 0,
    dragOffsetStartX: 0,
    dragOffsetStartY: 0,
    canvasW: 256,
    canvasH: 256,
    tilesX: 0,
    tilesY: 0,
    tileData: [],   // flat array of tiles, each tile is [8][8] of 0-3
    mode: 'overview',
    selectedTile: 0,
    selectedColor: 3,
    varName: 'tile_data',
    outputFormat: 'grouped',  // 'grouped' or 'flat'
    painting: false,
    zoom: 1,
    imageScale: 1,
  };

  // ---- Helpers ----

  function rgbToDmg(r, g, b, a) {
    if (a < 128) return 0;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < 4; i++) {
      const dr = r - DMG[i].r;
      const dg = g - DMG[i].g;
      const db = b - DMG[i].b;
      const d = dr * dr + dg * dg + db * db;
      if (d < bestDist) { bestDist = d; best = i; }
    }
    return best;
  }

  function encodeTile(tile) {
    const bytes = new Uint8Array(16);
    for (let row = 0; row < 8; row++) {
      let lo = 0, hi = 0;
      for (let col = 0; col < 8; col++) {
        const c = tile[row][col];
        lo |= ((c & 1) << (7 - col));
        hi |= (((c >> 1) & 1) << (7 - col));
      }
      bytes[row * 2] = lo;
      bytes[row * 2 + 1] = hi;
    }
    return bytes;
  }

  function generateHeader() {
    if (!state.tileData.length) return '// Upload an image to generate tile data';
    const name = state.varName || 'tile_data';
    const totalBytes = state.tileData.length * 16;
    const comment = `// ${state.tileData.length} tile${state.tileData.length !== 1 ? 's' : ''}, ${totalBytes} bytes`;

    if (state.outputFormat === 'grouped') {
      const tileLines = [];
      for (let t = 0; t < state.tileData.length; t++) {
        const enc = encodeTile(state.tileData[t]);
        const rows = [];
        for (let r = 0; r < 2; r++) {
          const row = [];
          for (let i = r * 8; i < r * 8 + 8; i++) {
            row.push('0x' + enc[i].toString(16).toUpperCase().padStart(2, '0'));
          }
          rows.push('    {' + row.join(',') + '}');
        }
        tileLines.push(`    /* tile ${t} */\n${rows.join(',\n')}`);
      }
      return `static const uint8_t ${name}[][8] = {\n${tileLines.join(',\n')}\n};\n${comment}`;
    }

    // Flat format
    const tileLines = [];
    for (let t = 0; t < state.tileData.length; t++) {
      const enc = encodeTile(state.tileData[t]);
      const hex = [];
      for (let i = 0; i < 16; i++) {
        hex.push('0x' + enc[i].toString(16).toUpperCase().padStart(2, '0'));
      }
      tileLines.push(`    /* tile ${t} */\n    ${hex.join(', ')}`);
    }
    return `static const uint8_t ${name}[] = {\n${tileLines.join(',\n')}\n};\n${comment}`;
  }

  let updatingFromCode = false;

  function updateOutput() {
    if (updatingFromCode) return;
    el.headerOutput.textContent = generateHeader();
    el.headerOutput.classList.remove('parse-error');
    el.parseStatus.textContent = '';
    el.parseStatus.className = 'parse-status';
  }

  // ---- Parse header back to tiles ----

  function decodeTile(bytes, offset) {
    const tile = [];
    for (let row = 0; row < 8; row++) {
      const tileRow = [];
      const lo = bytes[offset + row * 2];
      const hi = bytes[offset + row * 2 + 1];
      for (let col = 0; col < 8; col++) {
        const bit = 7 - col;
        const color = ((hi >> bit) & 1) << 1 | ((lo >> bit) & 1);
        tileRow.push(color);
      }
      tile.push(tileRow);
    }
    return tile;
  }

  function parseHeader(text) {
    // Extract hex bytes from the text: match 0xNN patterns
    const hexMatches = text.match(/0x[0-9a-fA-F]{1,2}/g);
    if (!hexMatches || hexMatches.length === 0) {
      return { error: 'No hex bytes found' };
    }
    const bytes = hexMatches.map(h => parseInt(h, 16));
    if (bytes.length % 16 !== 0) {
      return { error: `${bytes.length} bytes found — must be a multiple of 16 (16 bytes per tile)` };
    }
    const tiles = [];
    for (let i = 0; i < bytes.length; i += 16) {
      tiles.push(decodeTile(bytes, i));
    }
    // Try to extract variable name from various C declarations
    const nameMatch = text.match(/(?:static\s+)?(?:const\s+)?(?:unsigned\s+char|uint8_t)\s+(\w+)\s*\[/);
    return { tiles, varName: nameMatch ? nameMatch[1] : null };
  }

  function onHeaderInput() {
    const text = el.headerOutput.textContent;
    const result = parseHeader(text);
    if (result.error) {
      el.headerOutput.classList.add('parse-error');
      el.parseStatus.textContent = result.error;
      el.parseStatus.className = 'parse-status error';
      return;
    }
    el.headerOutput.classList.remove('parse-error');
    el.parseStatus.textContent = `Parsed ${result.tiles.length} tile${result.tiles.length !== 1 ? 's' : ''}`;
    el.parseStatus.className = 'parse-status ok';

    updatingFromCode = true;
    state.tileData = result.tiles;
    if (result.varName) {
      state.varName = result.varName;
      el.varName.value = result.varName;
    }
    if (state.selectedTile >= state.tileData.length) {
      state.selectedTile = Math.max(0, state.tileData.length - 1);
    }
    if (state.mode === 'editor') {
      renderTileGrid();
      if (state.tileData.length) renderTileZoom();
      updateTileNav();
    }
    el.tileEditModeBtn.disabled = !state.tileData.length;
    updatingFromCode = false;
  }

  el.headerOutput.addEventListener('input', onHeaderInput);

  // ---- Overview rendering ----

  function resizeOverviewCanvas() {
    if (!state.image) return;
    const img = state.image;
    const maxDim = 512;
    let w = img.naturalWidth;
    let h = img.naturalHeight;
    w = Math.ceil(w / 8) * 8;
    h = Math.ceil(h / 8) * 8;
    if (w > maxDim) w = maxDim;
    if (h > maxDim) h = maxDim;
    w = Math.max(w, 8);
    h = Math.max(h, 8);
    state.canvasW = w;
    state.canvasH = h;
    el.overviewCanvas.width = w;
    el.overviewCanvas.height = h;
    applyZoom();
  }

  function applyZoom() {
    const z = state.zoom;
    el.overviewCanvas.style.width = (state.canvasW * z) + 'px';
    el.overviewCanvas.style.height = (state.canvasH * z) + 'px';
    el.zoomLevel.textContent = z + 'x';
  }

  function renderOverview() {
    const w = state.canvasW;
    const h = state.canvasH;
    // Clear to DMG white
    ovCtx.fillStyle = DMG_CSS[0];
    ovCtx.fillRect(0, 0, w, h);

    if (state.image) {
      const s = state.imageScale;
      const sw = state.image.naturalWidth * s;
      const sh = state.image.naturalHeight * s;
      ovCtx.drawImage(state.image, state.offsetX, state.offsetY, sw, sh);
    }

    // Grid overlay
    ovCtx.strokeStyle = 'rgba(0, 0, 0, 0.18)';
    ovCtx.lineWidth = 0.5;
    ovCtx.beginPath();
    for (let x = 0; x <= w; x += 8) {
      ovCtx.moveTo(x, 0);
      ovCtx.lineTo(x, h);
    }
    for (let y = 0; y <= h; y += 8) {
      ovCtx.moveTo(0, y);
      ovCtx.lineTo(w, y);
    }
    ovCtx.stroke();
  }

  // ---- Quantization ----

  function quantize() {
    if (!state.image) return;
    const w = state.canvasW;
    const h = state.canvasH;
    // Draw image to a temp canvas at positioned offset to sample pixels
    const tmpCanvas = document.createElement('canvas');
    tmpCanvas.width = w;
    tmpCanvas.height = h;
    const tmpCtx = tmpCanvas.getContext('2d', { willReadFrequently: true });
    tmpCtx.fillStyle = DMG_CSS[0];
    tmpCtx.fillRect(0, 0, w, h);
    const sc = state.imageScale;
    tmpCtx.drawImage(state.image, state.offsetX, state.offsetY, state.image.naturalWidth * sc, state.image.naturalHeight * sc);
    const imgData = tmpCtx.getImageData(0, 0, w, h);
    const pixels = imgData.data;

    state.tilesX = w / 8;
    state.tilesY = h / 8;
    state.tileData = [];

    for (let ty = 0; ty < state.tilesY; ty++) {
      for (let tx = 0; tx < state.tilesX; tx++) {
        const tile = [];
        for (let row = 0; row < 8; row++) {
          const tileRow = [];
          for (let col = 0; col < 8; col++) {
            const px = (ty * 8 + row) * w + (tx * 8 + col);
            const i = px * 4;
            tileRow.push(rgbToDmg(pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]));
          }
          tile.push(tileRow);
        }
        state.tileData.push(tile);
      }
    }

    if (state.selectedTile >= state.tileData.length) {
      state.selectedTile = 0;
    }

    updateOutput();
  }

  // ---- File loading ----

  function loadImageFile(file) {
    if (!file.type.match(/^image\/(png|webp|avif)$/)) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      state.image = img;
      state.imageFileName = file.name.replace(/\.\w+$/, '');
      state.offsetX = 0;
      state.offsetY = 0;
      state.imageScale = 1;
      el.varName.value = state.imageFileName.replace(/[^a-zA-Z0-9_]/g, '_') || 'tile_data';
      state.varName = el.varName.value;
      resizeOverviewCanvas();
      renderOverview();
      quantize();
      el.dropOverlay.classList.add('loaded');
      el.resetPositionBtn.hidden = false;
      el.zoomControls.hidden = false;
      el.tileEditModeBtn.disabled = false;
      el.imageInfo.textContent = `${img.naturalWidth}×${img.naturalHeight}px — ${state.tilesX}×${state.tilesY} tiles`;
    };
    img.src = url;
  }

  // ---- Drag to reposition ----

  function getPointerPos(e) {
    const rect = el.overviewCanvas.getBoundingClientRect();
    const scaleX = el.overviewCanvas.width / rect.width;
    const scaleY = el.overviewCanvas.height / rect.height;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }

  function onDragStart(e) {
    if (!state.image) return;
    e.preventDefault();
    el.dropTarget.focus();
    const pos = getPointerPos(e);
    state.dragging = true;
    state.dragStartX = pos.x;
    state.dragStartY = pos.y;
    state.dragOffsetStartX = state.offsetX;
    state.dragOffsetStartY = state.offsetY;
    el.overviewCanvas.style.cursor = 'grabbing';
  }

  function onDragMove(e) {
    if (!state.dragging) return;
    e.preventDefault();
    const pos = getPointerPos(e);
    state.offsetX = Math.round(state.dragOffsetStartX + pos.x - state.dragStartX);
    state.offsetY = Math.round(state.dragOffsetStartY + pos.y - state.dragStartY);
    renderOverview();
  }

  function onDragEnd() {
    if (!state.dragging) return;
    state.dragging = false;
    el.overviewCanvas.style.cursor = state.image ? 'grab' : 'default';
    quantize();
    if (state.mode === 'editor') {
      renderTileGrid();
      renderTileZoom();
    }
  }

  el.overviewCanvas.addEventListener('mousedown', onDragStart);
  window.addEventListener('mousemove', onDragMove);
  window.addEventListener('mouseup', onDragEnd);
  el.overviewCanvas.addEventListener('touchstart', onDragStart, { passive: false });
  window.addEventListener('touchmove', onDragMove, { passive: false });
  window.addEventListener('touchend', onDragEnd);

  // ---- File drop ----

  ['dragenter', 'dragover'].forEach(evt => {
    el.dropTarget.addEventListener(evt, e => {
      e.preventDefault();
      el.dropOverlay.classList.add('dragover');
      el.dropOverlay.classList.remove('loaded');
    });
  });

  ['dragleave'].forEach(evt => {
    el.dropTarget.addEventListener(evt, e => {
      e.preventDefault();
      el.dropOverlay.classList.remove('dragover');
      if (state.image) el.dropOverlay.classList.add('loaded');
    });
  });

  el.dropTarget.addEventListener('drop', e => {
    e.preventDefault();
    el.dropOverlay.classList.remove('dragover');
    if (state.image) el.dropOverlay.classList.add('loaded');
    const file = e.dataTransfer.files[0];
    if (file) loadImageFile(file);
  });

  el.dropOverlay.addEventListener('click', () => el.fileInput.click());
  el.fileInput.addEventListener('change', () => {
    if (el.fileInput.files[0]) loadImageFile(el.fileInput.files[0]);
    el.fileInput.value = '';
  });

  // ---- Reset position ----

  el.resetPositionBtn.addEventListener('click', () => {
    state.offsetX = 0;
    state.offsetY = 0;
    state.imageScale = 1;
    renderOverview();
    quantize();
    if (state.mode === 'editor') {
      renderTileGrid();
      renderTileZoom();
    }
  });

  // ---- Zoom ----

  const ZOOM_STEPS = [1, 2, 3, 4, 6, 8];

  function setZoom(z) {
    state.zoom = Math.max(1, Math.min(8, z));
    applyZoom();
  }

  el.zoomInBtn.addEventListener('click', () => {
    const idx = ZOOM_STEPS.indexOf(state.zoom);
    if (idx < ZOOM_STEPS.length - 1) setZoom(ZOOM_STEPS[idx + 1]);
    else setZoom(state.zoom + 1);
  });

  el.zoomOutBtn.addEventListener('click', () => {
    const idx = ZOOM_STEPS.indexOf(state.zoom);
    if (idx > 0) setZoom(ZOOM_STEPS[idx - 1]);
    else setZoom(state.zoom - 1);
  });

  el.zoomFitBtn.addEventListener('click', () => {
    setZoom(1);
  });

  el.dropTarget.addEventListener('wheel', e => {
    if (!state.image) return;
    e.preventDefault();
    if (e.deltaY < 0) el.zoomInBtn.click();
    else el.zoomOutBtn.click();
  }, { passive: false });

  // ---- Mode switching ----

  function setMode(mode) {
    state.mode = mode;
    el.overviewSection.classList.toggle('hidden', mode !== 'overview');
    el.tileEditorSection.classList.toggle('hidden', mode !== 'editor');
    el.overviewModeBtn.classList.toggle('active', mode === 'overview');
    el.tileEditModeBtn.classList.toggle('active', mode === 'editor');

    if (mode === 'editor') {
      renderTileGrid();
      renderTileZoom();
      updateTileNav();
    }
  }

  el.overviewModeBtn.addEventListener('click', () => setMode('overview'));
  el.tileEditModeBtn.addEventListener('click', () => {
    if (!state.tileData.length) return;
    setMode('editor');
  });

  // ---- Tile grid overview ----

  const GRID_TILE_SIZE = 16; // px per tile in the grid overview

  function renderTileGrid() {
    if (!state.tileData.length) return;
    const cols = state.tilesX;
    const rows = state.tilesY;
    const s = GRID_TILE_SIZE;
    el.tileGridCanvas.width = cols * s;
    el.tileGridCanvas.height = rows * s;

    for (let idx = 0; idx < state.tileData.length; idx++) {
      const tx = idx % cols;
      const ty = Math.floor(idx / cols);
      const tile = state.tileData[idx];
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          gridCtx.fillStyle = DMG_CSS[tile[r][c]];
          gridCtx.fillRect(tx * s + c * 2, ty * s + r * 2, 2, 2);
        }
      }
    }

    // Grid lines between tiles
    gridCtx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
    gridCtx.lineWidth = 0.5;
    gridCtx.beginPath();
    for (let x = 0; x <= cols; x++) {
      gridCtx.moveTo(x * s, 0);
      gridCtx.lineTo(x * s, rows * s);
    }
    for (let y = 0; y <= rows; y++) {
      gridCtx.moveTo(0, y * s);
      gridCtx.lineTo(cols * s, y * s);
    }
    gridCtx.stroke();

    // Highlight selected tile
    const selX = state.selectedTile % cols;
    const selY = Math.floor(state.selectedTile / cols);
    gridCtx.strokeStyle = '#ef4444';
    gridCtx.lineWidth = 2;
    gridCtx.strokeRect(selX * s + 1, selY * s + 1, s - 2, s - 2);
  }

  el.tileGridCanvas.addEventListener('click', e => {
    if (!state.tileData.length) return;
    const rect = el.tileGridCanvas.getBoundingClientRect();
    const scaleX = el.tileGridCanvas.width / rect.width;
    const scaleY = el.tileGridCanvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    const tx = Math.floor(x / GRID_TILE_SIZE);
    const ty = Math.floor(y / GRID_TILE_SIZE);
    const idx = ty * state.tilesX + tx;
    if (idx >= 0 && idx < state.tileData.length) {
      state.selectedTile = idx;
      renderTileGrid();
      renderTileZoom();
      updateTileNav();
    }
  });

  // ---- Tile zoom editor ----

  const ZOOM_PX = 40; // size of each pixel in the zoom view

  function renderTileZoom() {
    if (!state.tileData.length) return;
    const tile = state.tileData[state.selectedTile];
    const s = ZOOM_PX;
    el.tileZoomCanvas.width = 8 * s;
    el.tileZoomCanvas.height = 8 * s;

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        zoomCtx.fillStyle = DMG_CSS[tile[r][c]];
        zoomCtx.fillRect(c * s, r * s, s, s);
      }
    }

    // Grid lines
    zoomCtx.strokeStyle = 'rgba(128, 128, 128, 0.3)';
    zoomCtx.lineWidth = 1;
    zoomCtx.beginPath();
    for (let i = 1; i < 8; i++) {
      zoomCtx.moveTo(i * s, 0);
      zoomCtx.lineTo(i * s, 8 * s);
      zoomCtx.moveTo(0, i * s);
      zoomCtx.lineTo(8 * s, i * s);
    }
    zoomCtx.stroke();
  }

  function paintPixel(e) {
    if (!state.tileData.length) return;
    const rect = el.tileZoomCanvas.getBoundingClientRect();
    const scaleX = el.tileZoomCanvas.width / rect.width;
    const scaleY = el.tileZoomCanvas.height / rect.height;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;
    const col = Math.floor(x / ZOOM_PX);
    const row = Math.floor(y / ZOOM_PX);
    if (col < 0 || col > 7 || row < 0 || row > 7) return;

    const tile = state.tileData[state.selectedTile];
    if (tile[row][col] === state.selectedColor) return;
    tile[row][col] = state.selectedColor;
    renderTileZoom();
    renderTileGrid();
    updateOutput();
  }

  el.tileZoomCanvas.addEventListener('mousedown', e => {
    state.painting = true;
    paintPixel(e);
  });
  window.addEventListener('mousemove', e => {
    if (state.painting) paintPixel(e);
  });
  window.addEventListener('mouseup', () => { state.painting = false; });

  el.tileZoomCanvas.addEventListener('touchstart', e => {
    e.preventDefault();
    state.painting = true;
    paintPixel(e);
  }, { passive: false });
  el.tileZoomCanvas.addEventListener('touchmove', e => {
    e.preventDefault();
    if (state.painting) paintPixel(e);
  }, { passive: false });
  el.tileZoomCanvas.addEventListener('touchend', () => { state.painting = false; });

  // ---- Tile navigation ----

  function updateTileNav() {
    const total = state.tileData.length;
    el.tileIndex.textContent = total ? `Tile ${state.selectedTile + 1} / ${total}` : 'No tiles';
    el.prevTileBtn.disabled = state.selectedTile <= 0;
    el.nextTileBtn.disabled = !total || state.selectedTile >= total - 1;
    el.deleteTileBtn.disabled = !total;
  }

  function addTile() {
    const blank = Array.from({ length: 8 }, () => new Array(8).fill(0));
    const insertAt = state.tileData.length ? state.selectedTile + 1 : 0;
    state.tileData.splice(insertAt, 0, blank);
    if (state.tilesX === 0) state.tilesX = 1;
    state.tilesY = Math.ceil(state.tileData.length / state.tilesX);
    state.selectedTile = insertAt;
    renderTileGrid();
    renderTileZoom();
    updateTileNav();
    updateOutput();
  }

  el.addTileBtn.addEventListener('click', addTile);

  function deleteTile() {
    if (!state.tileData.length) return;
    state.tileData.splice(state.selectedTile, 1);
    if (state.selectedTile >= state.tileData.length) {
      state.selectedTile = Math.max(0, state.tileData.length - 1);
    }
    state.tilesY = state.tilesX ? Math.ceil(state.tileData.length / state.tilesX) : 0;
    renderTileGrid();
    if (state.tileData.length) {
      renderTileZoom();
    } else {
      zoomCtx.clearRect(0, 0, el.tileZoomCanvas.width, el.tileZoomCanvas.height);
    }
    updateTileNav();
    updateOutput();
  }

  el.deleteTileBtn.addEventListener('click', deleteTile);

  el.prevTileBtn.addEventListener('click', () => {
    if (state.selectedTile > 0) {
      state.selectedTile--;
      renderTileGrid();
      renderTileZoom();
      updateTileNav();
    }
  });

  el.nextTileBtn.addEventListener('click', () => {
    if (state.selectedTile < state.tileData.length - 1) {
      state.selectedTile++;
      renderTileGrid();
      renderTileZoom();
      updateTileNav();
    }
  });

  // ---- Keyboard navigation ----

  function selectTile(idx) {
    if (idx < 0 || idx >= state.tileData.length) return;
    state.selectedTile = idx;
    renderTileGrid();
    renderTileZoom();
    updateTileNav();
  }

  function panTile(dx, dy) {
    const tile = state.tileData[state.selectedTile];
    if (!tile) return;
    const fresh = Array.from({ length: 8 }, () => new Array(8).fill(0));
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const sr = r - dy;
        const sc = c - dx;
        if (sr >= 0 && sr < 8 && sc >= 0 && sc < 8) {
          fresh[r][c] = tile[sr][sc];
        }
      }
    }
    state.tileData[state.selectedTile] = fresh;
    renderTileZoom();
    renderTileGrid();
    updateOutput();
  }

  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.target.isContentEditable) return;

    // Overview mode: arrow keys nudge image, =/- scale image in canvas
    if (state.mode === 'overview' && state.image && document.activeElement === el.dropTarget) {
      const step = e.shiftKey ? 4 : 1;
      let handled = true;
      switch (e.key) {
        case 'ArrowLeft':  state.offsetX -= step; break;
        case 'ArrowRight': state.offsetX += step; break;
        case 'ArrowUp':    state.offsetY -= step; break;
        case 'ArrowDown':  state.offsetY += step; break;
        case '=': case '+':
          state.imageScale = Math.round((state.imageScale + 0.2) * 100) / 100;
          break;
        case '-':
          state.imageScale = Math.max(0.2, Math.round((state.imageScale - 0.2) * 100) / 100);
          break;
        case '0':
          state.imageScale = 1;
          break;
        default: handled = false;
      }
      if (handled) {
        e.preventDefault();
        renderOverview();
        quantize();
        el.imageInfo.textContent = `${state.image.naturalWidth}×${state.image.naturalHeight}px — ${state.tilesX}×${state.tilesY} tiles` +
          (state.imageScale !== 1 ? ` — scale ${state.imageScale.toFixed(1)}x` : '');
        return;
      }
    }

    // Tile editor mode
    if (state.mode !== 'editor') return;

    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      deleteTile();
      return;
    }

    if (e.key === 'i') {
      e.preventDefault();
      addTile();
      return;
    }

    if (!state.tileData.length) return;

    // Shift+arrow: pan pixel data within the selected tile
    if (e.shiftKey && e.key.startsWith('Arrow')) {
      e.preventDefault();
      const dx = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
      const dy = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
      panTile(dx, dy);
      return;
    }

    const cols = state.tilesX;
    const cur = state.selectedTile;
    const curX = cur % cols;
    const curY = Math.floor(cur / cols);

    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        if (curX > 0) selectTile(cur - 1);
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (curX < cols - 1) selectTile(cur + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (curY > 0) selectTile(cur - cols);
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (curY < state.tilesY - 1) selectTile(cur + cols);
        break;
      case '1': case '2': case '3': case '4': {
        const c = parseInt(e.key) - 1;
        state.selectedColor = c;
        el.paletteButtons.forEach(b => b.classList.toggle('active', parseInt(b.dataset.color) === c));
        break;
      }
    }
  });

  // ---- Palette ----

  el.paletteButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      state.selectedColor = parseInt(btn.dataset.color);
      el.paletteButtons.forEach(b => b.classList.toggle('active', b === btn));
    });
  });

  // ---- Variable name ----

  el.varName.addEventListener('input', () => {
    state.varName = el.varName.value.replace(/[^a-zA-Z0-9_]/g, '_') || 'tile_data';
    updateOutput();
  });

  // ---- Format toggle ----

  function updateFormatToggle() {
    el.formatToggleBtn.textContent = state.outputFormat === 'grouped' ? 'Flat' : 'Grouped';
  }

  el.formatToggleBtn.addEventListener('click', () => {
    state.outputFormat = state.outputFormat === 'grouped' ? 'flat' : 'grouped';
    updateFormatToggle();
    updateOutput();
  });

  updateFormatToggle();

  // ---- Copy ----

  el.copyOutputBtn.addEventListener('click', async () => {
    const text = el.headerOutput.innerText;
    try {
      await navigator.clipboard.writeText(text);
      el.copyOutputBtn.textContent = 'Copied!';
      setTimeout(() => { el.copyOutputBtn.textContent = 'Copy'; }, 1500);
    } catch {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      el.copyOutputBtn.textContent = 'Copied!';
      setTimeout(() => { el.copyOutputBtn.textContent = 'Copy'; }, 1500);
    }
  });

  // ---- Persistence ----

  const STORAGE_KEY = 'gb-tile-converter';

  function saveState() {
    try {
      const data = {
        tileData: state.tileData,
        varName: state.varName,
        selectedTile: state.selectedTile,
        selectedColor: state.selectedColor,
        offsetX: state.offsetX,
        offsetY: state.offsetY,
        imageScale: state.imageScale,
        zoom: state.zoom,
        outputFormat: state.outputFormat,
        tilesX: state.tilesX,
        tilesY: state.tilesY,
        canvasW: state.canvasW,
        canvasH: state.canvasH,
        imageFileName: state.imageFileName,
      };
      // Store image as data URL if present
      if (state.image) {
        const c = document.createElement('canvas');
        c.width = state.image.naturalWidth;
        c.height = state.image.naturalHeight;
        c.getContext('2d').drawImage(state.image, 0, 0);
        try {
          data.imageDataURL = c.toDataURL('image/png');
        } catch { /* tainted canvas, skip image */ }
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch { /* quota exceeded or private mode, ignore */ }
  }

  function restoreState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (!data.tileData || !data.tileData.length) return;

      state.tileData = data.tileData;
      state.varName = data.varName || 'tile_data';
      state.selectedTile = data.selectedTile || 0;
      state.selectedColor = data.selectedColor || 3;
      state.offsetX = data.offsetX || 0;
      state.offsetY = data.offsetY || 0;
      state.imageScale = data.imageScale || 1;
      state.zoom = data.zoom || 1;
      state.outputFormat = data.outputFormat || 'grouped';
      updateFormatToggle();
      state.tilesX = data.tilesX || 0;
      state.tilesY = data.tilesY || 0;
      state.canvasW = data.canvasW || 256;
      state.canvasH = data.canvasH || 256;
      state.imageFileName = data.imageFileName || '';

      el.varName.value = state.varName;
      el.paletteButtons.forEach(b =>
        b.classList.toggle('active', parseInt(b.dataset.color) === state.selectedColor)
      );

      if (state.selectedTile >= state.tileData.length) {
        state.selectedTile = Math.max(0, state.tileData.length - 1);
      }

      el.tileEditModeBtn.disabled = false;
      updateOutput();

      // Restore image if saved
      if (data.imageDataURL) {
        const img = new Image();
        img.onload = () => {
          state.image = img;
          el.overviewCanvas.width = state.canvasW;
          el.overviewCanvas.height = state.canvasH;
          applyZoom();
          renderOverview();
          el.dropOverlay.classList.add('loaded');
          el.resetPositionBtn.hidden = false;
          el.zoomControls.hidden = false;
          el.overviewCanvas.style.cursor = 'grab';
          el.imageInfo.textContent = `${img.naturalWidth}×${img.naturalHeight}px — ${state.tilesX}×${state.tilesY} tiles` +
            (state.imageScale !== 1 ? ` — scale ${state.imageScale.toFixed(1)}x` : '');
        };
        img.src = data.imageDataURL;
      }
    } catch { /* corrupted data, ignore */ }
  }

  // Debounced save — triggers on any state-changing interaction
  let saveTimer = null;
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveState, 500);
  }

  new MutationObserver(scheduleSave).observe(el.headerOutput, { childList: true, characterData: true, subtree: true });
  document.addEventListener('mouseup', scheduleSave);
  document.addEventListener('keyup', scheduleSave);

  // ---- Init ----

  el.overviewCanvas.style.cursor = 'default';
  restoreState();
})();
