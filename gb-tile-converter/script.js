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
    imageInfo: document.getElementById('imageInfo'),
    tileGridCanvas: document.getElementById('tileGridCanvas'),
    tileZoomCanvas: document.getElementById('tileZoomCanvas'),
    prevTileBtn: document.getElementById('prevTileBtn'),
    nextTileBtn: document.getElementById('nextTileBtn'),
    tileIndex: document.getElementById('tileIndex'),
    paletteButtons: document.querySelectorAll('.palette-btn'),
    varName: document.getElementById('varName'),
    copyOutputBtn: document.getElementById('copyOutputBtn'),
    headerOutput: document.getElementById('headerOutput'),
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
    painting: false,
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
    const allBytes = [];
    for (const tile of state.tileData) {
      const enc = encodeTile(tile);
      for (let i = 0; i < enc.length; i++) allBytes.push(enc[i]);
    }
    const hex = allBytes.map(b => '0x' + b.toString(16).toUpperCase().padStart(2, '0'));
    const lines = [];
    for (let i = 0; i < hex.length; i += 16) {
      lines.push('  ' + hex.slice(i, i + 16).join(', '));
    }
    const name = state.varName || 'tile_data';
    return `const unsigned char ${name}[] = {\n${lines.join(',\n')}\n};\n// ${state.tileData.length} tile${state.tileData.length !== 1 ? 's' : ''}, ${allBytes.length} bytes`;
  }

  function updateOutput() {
    el.headerOutput.textContent = generateHeader();
  }

  // ---- Overview rendering ----

  function resizeOverviewCanvas() {
    if (!state.image) return;
    const img = state.image;
    // Canvas matches image size, clamped to reasonable bounds
    const maxDim = 512;
    let w = img.naturalWidth;
    let h = img.naturalHeight;
    // Ensure dimensions are multiples of 8 (round up to cover full tiles)
    w = Math.ceil(w / 8) * 8;
    h = Math.ceil(h / 8) * 8;
    if (w > maxDim) w = maxDim;
    if (h > maxDim) h = maxDim;
    // Ensure at least 8
    w = Math.max(w, 8);
    h = Math.max(h, 8);
    state.canvasW = w;
    state.canvasH = h;
    el.overviewCanvas.width = w;
    el.overviewCanvas.height = h;
    el.overviewCanvas.style.width = w + 'px';
    el.overviewCanvas.style.height = h + 'px';
  }

  function renderOverview() {
    const w = state.canvasW;
    const h = state.canvasH;
    // Clear to DMG white
    ovCtx.fillStyle = DMG_CSS[0];
    ovCtx.fillRect(0, 0, w, h);

    if (state.image) {
      ovCtx.drawImage(state.image, state.offsetX, state.offsetY);
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
    tmpCtx.drawImage(state.image, state.offsetX, state.offsetY);
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
      el.varName.value = state.imageFileName.replace(/[^a-zA-Z0-9_]/g, '_') || 'tile_data';
      state.varName = el.varName.value;
      resizeOverviewCanvas();
      renderOverview();
      quantize();
      el.dropOverlay.classList.add('loaded');
      el.resetPositionBtn.hidden = false;
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
    renderOverview();
    quantize();
    if (state.mode === 'editor') {
      renderTileGrid();
      renderTileZoom();
    }
  });

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
    el.tileIndex.textContent = total ? `Tile ${state.selectedTile + 1} / ${total}` : 'Tile 0 / 0';
    el.prevTileBtn.disabled = state.selectedTile <= 0;
    el.nextTileBtn.disabled = state.selectedTile >= total - 1;
  }

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

  // ---- Copy ----

  el.copyOutputBtn.addEventListener('click', async () => {
    const text = el.headerOutput.textContent;
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

  // ---- Init ----

  el.overviewCanvas.style.cursor = 'default';
})();
