(() => {
  // ---- DMG Palette ----
  const DMG_CSS = ['#e0f8d0', '#88c070', '#346856', '#081820'];
  // ---- State ----
  const state = {
    originalSource: '',
    currentSource: '',
    fileName: '',
    arrays: [],        // [{ name, startIdx, endIdx, hexPositions: [{pos,len}], tiles: [8x8 arrays] }]
    selectedArray: 0,
    selectedTile: 0,
    selectedColor: 3,
    painting: false,
  };

  // ---- Elements ----
  const el = {
    dropZone: document.getElementById('dropZone'),
    fileInput: document.getElementById('fileInput'),
    app: document.getElementById('app'),
    fileName: document.getElementById('fileName'),
    copyBtn: document.getElementById('copyBtn'),
    downloadBtn: document.getElementById('downloadBtn'),
    resetBtn: document.getElementById('resetBtn'),
    sourcePanel: document.getElementById('sourcePanel'),
    sourceWrap: document.getElementById('sourceWrap'),
    lineNumbers: document.getElementById('lineNumbers'),
    sourceCode: document.getElementById('sourceCode'),
    editorPanel: document.getElementById('editorPanel'),
    editorInfo: document.getElementById('editorInfo'),
    tileGridCanvas: document.getElementById('tileGridCanvas'),
    tileZoomCanvas: document.getElementById('tileZoomCanvas'),
    prevTileBtn: document.getElementById('prevTileBtn'),
    nextTileBtn: document.getElementById('nextTileBtn'),
    tileCounter: document.getElementById('tileCounter'),
  };

  const gridCtx = el.tileGridCanvas.getContext('2d', { willReadFrequently: true });
  const zoomCtx = el.tileZoomCanvas.getContext('2d', { willReadFrequently: true });

  // ---- 2BPP Encoding/Decoding ----

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

  // ---- Source Code Scanning ----

  function findArrayBody(source, matchIndex, matchLength) {
    const braceStart = matchIndex + matchLength - 1;
    let depth = 1;
    let i = braceStart + 1;
    while (i < source.length && depth > 0) {
      if (source[i] === '{') depth++;
      else if (source[i] === '}') depth--;
      i++;
    }
    if (depth !== 0) return null;
    return { braceStart, endIdx: i, body: source.substring(braceStart, i) };
  }

  function extractValues(body, braceStart) {
    // Try hex first: 0xNN patterns
    const hexPattern = /0[xX][0-9a-fA-F]{1,2}/g;
    const hexPositions = [];
    let m;
    while ((m = hexPattern.exec(body)) !== null) {
      hexPositions.push({
        pos: braceStart + m.index,
        len: m[0].length,
        value: parseInt(m[0], 16),
      });
    }
    if (hexPositions.length > 0) return { positions: hexPositions, format: 'hex' };

    // Fall back to bare decimal integers (match numbers not inside words/identifiers)
    // We need to be careful: only match numbers that appear as array values
    // i.e. preceded by {, comma, or whitespace and followed by comma, }, or whitespace
    const decPattern = /(?<=[\s,{])(\d{1,3})(?=\s*[,}])/g;
    const decPositions = [];
    while ((m = decPattern.exec(body)) !== null) {
      const val = parseInt(m[1], 10);
      if (val > 255) continue; // not a byte
      decPositions.push({
        pos: braceStart + m.index,
        len: m[1].length,
        value: val,
      });
    }
    if (decPositions.length > 0) return { positions: decPositions, format: 'decimal' };

    return null;
  }

  function scanSource(source) {
    const arrays = [];
    const arrayPattern = /(?:(?:static|const|extern)\s+)*(?:(?:static|const)\s+)*(?:unsigned\s+char|uint8_t|UINT8|UBYTE|BYTE|u8)\s+(\w+)\s*\[[\w\s]*\]\s*(?:\[[\w\s]*\]\s*)?=\s*\{/g;
    let match;

    while ((match = arrayPattern.exec(source)) !== null) {
      const name = match[1];
      const found = findArrayBody(source, match.index, match[0].length);
      if (!found) continue;

      const { braceStart, endIdx, body } = found;
      const extracted = extractValues(body, braceStart);
      if (!extracted) continue;

      const { positions, format } = extracted;
      const values = positions.map(p => p.value);

      // Determine if this is 2BPP encoded tile data or raw pixel data
      // 2BPP: 16 bytes per 8×8 tile, values can be 0-255
      // Raw pixels: 64 values per 8×8 tile, all values 0-3
      const allPixelRange = values.every(v => v >= 0 && v <= 3);
      const count = values.length;

      let tiles = [];
      let mode; // '2bpp' or 'raw'

      if (count % 16 === 0 && !allPixelRange) {
        // Standard 2BPP tile data
        mode = '2bpp';
        for (let t = 0; t < count; t += 16) {
          tiles.push(decodeTile(values, t));
        }
      } else if (count % 64 === 0 && allPixelRange) {
        // Raw pixel data: 64 values = one 8×8 tile
        mode = 'raw';
        for (let t = 0; t < count; t += 64) {
          const tile = [];
          for (let r = 0; r < 8; r++) {
            tile.push(values.slice(t + r * 8, t + r * 8 + 8));
          }
          tiles.push(tile);
        }
      } else if (count % 16 === 0) {
        // Values are all 0-3 but count is multiple of 16 — could be either
        // Heuristic: if multiple of 64, prefer raw; otherwise 2BPP
        if (count % 64 === 0) {
          mode = 'raw';
          for (let t = 0; t < count; t += 64) {
            const tile = [];
            for (let r = 0; r < 8; r++) {
              tile.push(values.slice(t + r * 8, t + r * 8 + 8));
            }
            tiles.push(tile);
          }
        } else {
          mode = '2bpp';
          for (let t = 0; t < count; t += 16) {
            tiles.push(decodeTile(values, t));
          }
        }
      } else {
        continue; // not tile data
      }

      if (tiles.length === 0) continue;

      arrays.push({
        name,
        startIdx: match.index,
        endIdx,
        hexPositions: positions,
        tiles,
        mode,       // '2bpp' or 'raw'
        format,     // 'hex' or 'decimal'
      });
    }

    return arrays;
  }

  // ---- Source Code Rendering ----

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function renderSource() {
    const source = state.currentSource;
    const arrays = state.arrays;

    // Build a set of character ranges that are hex bytes in tile arrays
    const hexMap = new Map(); // charPos -> { arrayIdx, tileIdx, byteIdx }
    for (let ai = 0; ai < arrays.length; ai++) {
      const arr = arrays[ai];
      for (let bi = 0; bi < arr.hexPositions.length; bi++) {
        const tileIdx = Math.floor(bi / 16);
        hexMap.set(arr.hexPositions[bi].pos, {
          arrayIdx: ai,
          tileIdx,
          byteIdx: bi,
          len: arr.hexPositions[bi].len,
        });
      }
    }

    // Build positions where we should insert tile preview rows (after closing brace of each array)
    const previewInsertions = new Map(); // charPos -> arrayIdx
    for (let ai = 0; ai < arrays.length; ai++) {
      // Insert preview at the line containing the closing brace
      // Find the semicolon after closing brace
      let semiPos = arrays[ai].endIdx;
      while (semiPos < source.length && source[semiPos] !== '\n') semiPos++;
      previewInsertions.set(semiPos, ai);
    }

    // Render source as HTML, character by character
    let html = '';
    let i = 0;
    while (i < source.length) {
      const hexInfo = hexMap.get(i);
      if (hexInfo) {
        const isActiveTile = hexInfo.arrayIdx === state.selectedArray &&
          hexInfo.tileIdx === state.selectedTile;
        const cls = isActiveTile ? 'hex-byte active-tile' : 'hex-byte';
        const raw = source.substring(i, i + hexInfo.len);
        html += `<span class="${cls}" data-array-idx="${hexInfo.arrayIdx}" data-tile-idx="${hexInfo.tileIdx}" data-byte-idx="${hexInfo.byteIdx}">${escapeHtml(raw)}</span>`;
        i += hexInfo.len;
      } else {
        // Check for preview insertion
        if (previewInsertions.has(i)) {
          const ai = previewInsertions.get(i);
          html += `<span class="tile-preview-anchor" data-array-idx="${ai}"></span>`;
        }
        html += escapeHtml(source[i]);
        i++;
      }
    }
    // Handle preview at end of file
    if (previewInsertions.has(source.length)) {
      const ai = previewInsertions.get(source.length);
      html += `<span class="tile-preview-anchor" data-array-idx="${ai}"></span>`;
    }

    el.sourceCode.innerHTML = html;

    // Line numbers
    const lineCount = source.split('\n').length;
    let lineHtml = '';
    for (let l = 1; l <= lineCount; l++) {
      lineHtml += l + '\n';
    }
    el.lineNumbers.textContent = lineHtml;

    // Insert tile preview canvases at anchor points
    const anchors = el.sourceCode.querySelectorAll('.tile-preview-anchor');
    for (const anchor of anchors) {
      const ai = parseInt(anchor.dataset.arrayIdx);
      const arr = arrays[ai];
      if (!arr || arr.tiles.length === 0) continue;

      const row = document.createElement('span');
      row.className = 'tile-preview-row';

      for (let ti = 0; ti < arr.tiles.length; ti++) {
        const c = document.createElement('canvas');
        c.width = 8;
        c.height = 8;
        c.style.width = '24px';
        c.style.height = '24px';
        if (ai === state.selectedArray && ti === state.selectedTile) {
          c.classList.add('selected');
        }
        drawTileToCanvas(c, arr.tiles[ti]);
        c.addEventListener('click', () => selectTile(ai, ti));
        row.appendChild(c);
      }

      anchor.appendChild(row);
    }

    // Click handler for hex bytes
    el.sourceCode.addEventListener('click', onSourceClick);
  }

  function drawTileToCanvas(canvas, tile) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const px = w / 8;
    const py = h / 8;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        ctx.fillStyle = DMG_CSS[tile[r][c]];
        ctx.fillRect(c * px, r * py, px, py);
      }
    }
  }

  function onSourceClick(e) {
    const span = e.target.closest('.hex-byte[data-array-idx]');
    if (!span) return;
    const ai = parseInt(span.dataset.arrayIdx);
    const ti = parseInt(span.dataset.tileIdx);
    selectTile(ai, ti);
  }

  // ---- Tile Selection ----

  function selectTile(arrayIdx, tileIdx) {
    const arr = state.arrays[arrayIdx];
    if (!arr) return;
    tileIdx = Math.max(0, Math.min(tileIdx, arr.tiles.length - 1));

    state.selectedArray = arrayIdx;
    state.selectedTile = tileIdx;

    el.editorPanel.hidden = false;
    el.editorInfo.textContent = `${arr.name} — tile ${tileIdx + 1} / ${arr.tiles.length}`;
    el.tileCounter.textContent = `${tileIdx + 1} / ${arr.tiles.length}`;

    renderTileGrid();
    renderTileZoom();
    updateSourceHighlights();
  }

  function updateSourceHighlights() {
    // Update active-tile classes without full re-render
    const allBytes = el.sourceCode.querySelectorAll('.hex-byte');
    for (const span of allBytes) {
      const ai = parseInt(span.dataset.arrayIdx);
      const ti = parseInt(span.dataset.tileIdx);
      span.classList.toggle('active-tile', ai === state.selectedArray && ti === state.selectedTile);
    }

    // Update preview canvas selections
    const previews = el.sourceCode.querySelectorAll('.tile-preview-row canvas');
    // We need to figure out which array each preview belongs to
    const anchors = el.sourceCode.querySelectorAll('.tile-preview-anchor');
    let canvasIdx = 0;
    for (const anchor of anchors) {
      const ai = parseInt(anchor.dataset.arrayIdx);
      const arr = state.arrays[ai];
      if (!arr) continue;
      for (let ti = 0; ti < arr.tiles.length; ti++) {
        if (canvasIdx < previews.length) {
          previews[canvasIdx].classList.toggle('selected', ai === state.selectedArray && ti === state.selectedTile);
          canvasIdx++;
        }
      }
    }

    // Scroll the first active-tile hex byte into view
    const first = el.sourceCode.querySelector('.hex-byte.active-tile');
    if (first) {
      first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  // ---- Tile Grid (all tiles in selected array) ----

  function renderTileGrid() {
    const arr = state.arrays[state.selectedArray];
    if (!arr) return;

    const count = arr.tiles.length;
    const cols = Math.min(count, 16);
    const rows = Math.ceil(count / cols);
    const scale = 2; // 2px per pixel
    const tileSize = 8 * scale;

    el.tileGridCanvas.width = cols * tileSize;
    el.tileGridCanvas.height = rows * tileSize;

    for (let t = 0; t < count; t++) {
      const col = t % cols;
      const row = Math.floor(t / cols);
      const tile = arr.tiles[t];
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          gridCtx.fillStyle = DMG_CSS[tile[r][c]];
          gridCtx.fillRect(col * tileSize + c * scale, row * tileSize + r * scale, scale, scale);
        }
      }
    }

    // Draw selection border
    const selCol = state.selectedTile % cols;
    const selRow = Math.floor(state.selectedTile / cols);
    gridCtx.strokeStyle = '#e74c3c';
    gridCtx.lineWidth = 1;
    gridCtx.strokeRect(selCol * tileSize + 0.5, selRow * tileSize + 0.5, tileSize - 1, tileSize - 1);

    // Grid lines
    gridCtx.strokeStyle = 'rgba(128,128,128,0.3)';
    gridCtx.lineWidth = 0.5;
    for (let x = 0; x <= cols; x++) {
      gridCtx.beginPath();
      gridCtx.moveTo(x * tileSize, 0);
      gridCtx.lineTo(x * tileSize, rows * tileSize);
      gridCtx.stroke();
    }
    for (let y = 0; y <= rows; y++) {
      gridCtx.beginPath();
      gridCtx.moveTo(0, y * tileSize);
      gridCtx.lineTo(cols * tileSize, y * tileSize);
      gridCtx.stroke();
    }
  }

  // ---- Tile Zoom (editor canvas) ----

  function renderTileZoom() {
    const arr = state.arrays[state.selectedArray];
    if (!arr) return;
    const tile = arr.tiles[state.selectedTile];
    if (!tile) return;

    const size = 320;
    const px = size / 8;
    el.tileZoomCanvas.width = size;
    el.tileZoomCanvas.height = size;

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        zoomCtx.fillStyle = DMG_CSS[tile[r][c]];
        zoomCtx.fillRect(c * px, r * px, px, px);
      }
    }

    // Grid lines
    zoomCtx.strokeStyle = 'rgba(128,128,128,0.25)';
    zoomCtx.lineWidth = 1;
    for (let i = 0; i <= 8; i++) {
      zoomCtx.beginPath();
      zoomCtx.moveTo(i * px, 0);
      zoomCtx.lineTo(i * px, size);
      zoomCtx.stroke();
      zoomCtx.beginPath();
      zoomCtx.moveTo(0, i * px);
      zoomCtx.lineTo(size, i * px);
      zoomCtx.stroke();
    }
  }

  // ---- Pixel Painting ----

  function getZoomPixel(e) {
    const rect = el.tileZoomCanvas.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
    const px = rect.width / 8;
    const col = Math.floor(x / px);
    const row = Math.floor(y / px);
    if (col < 0 || col > 7 || row < 0 || row > 7) return null;
    return { row, col };
  }

  function paintPixel(e) {
    const p = getZoomPixel(e);
    if (!p) return;
    const arr = state.arrays[state.selectedArray];
    if (!arr) return;
    const tile = arr.tiles[state.selectedTile];
    if (!tile) return;

    if (tile[p.row][p.col] === state.selectedColor) return;
    tile[p.row][p.col] = state.selectedColor;

    renderTileZoom();
    renderTileGrid();
    updateSourceFromTile(state.selectedArray, state.selectedTile);
    updateInlinePreviews(state.selectedArray);
  }

  // ---- Update Source from Tile Edit ----

  function updateSourceFromTile(arrayIdx, tileIdx) {
    const arr = state.arrays[arrayIdx];
    const tile = arr.tiles[tileIdx];

    let newValues;
    let startVal, valCount;

    if (arr.mode === '2bpp') {
      const encoded = encodeTile(tile);
      startVal = tileIdx * 16;
      valCount = 16;
      newValues = Array.from(encoded);
    } else {
      // Raw pixel mode: 64 values per tile
      startVal = tileIdx * 64;
      valCount = 64;
      newValues = [];
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          newValues.push(tile[r][c]);
        }
      }
    }

    let src = state.currentSource;
    let lengthChanged = false;

    // Replace values from end to start to preserve earlier positions
    for (let b = valCount - 1; b >= 0; b--) {
      const hp = arr.hexPositions[startVal + b];
      let newStr;
      if (arr.format === 'hex') {
        newStr = '0x' + newValues[b].toString(16).toUpperCase().padStart(2, '0');
      } else {
        newStr = String(newValues[b]);
      }
      src = src.substring(0, hp.pos) + newStr + src.substring(hp.pos + hp.len);
      if (hp.len !== newStr.length) lengthChanged = true;
      hp.len = newStr.length;
      hp.value = newValues[b];
    }

    state.currentSource = src;

    // If any value changed length, re-scan to fix all positions
    if (lengthChanged) {
      const savedArrays = state.arrays.map(a => ({ tiles: a.tiles, mode: a.mode, format: a.format }));
      state.arrays = scanSource(src);
      for (let i = 0; i < state.arrays.length && i < savedArrays.length; i++) {
        state.arrays[i].tiles = savedArrays[i].tiles;
        state.arrays[i].mode = savedArrays[i].mode;
        state.arrays[i].format = savedArrays[i].format;
      }
      renderSource();
      return;
    }

    // Update value text in DOM without full re-render
    const hexSpans = el.sourceCode.querySelectorAll(
      `.hex-byte[data-array-idx="${arrayIdx}"]`
    );
    for (const span of hexSpans) {
      const bi = parseInt(span.dataset.byteIdx);
      if (bi >= startVal && bi < startVal + valCount) {
        const localIdx = bi - startVal;
        if (arr.format === 'hex') {
          span.textContent = '0x' + newValues[localIdx].toString(16).toUpperCase().padStart(2, '0');
        } else {
          span.textContent = String(newValues[localIdx]);
        }
      }
    }
  }

  function updateInlinePreviews(arrayIdx) {
    const arr = state.arrays[arrayIdx];
    if (!arr) return;
    const anchor = el.sourceCode.querySelector(`.tile-preview-anchor[data-array-idx="${arrayIdx}"]`);
    if (!anchor) return;
    const canvases = anchor.querySelectorAll('canvas');
    for (let ti = 0; ti < arr.tiles.length && ti < canvases.length; ti++) {
      drawTileToCanvas(canvases[ti], arr.tiles[ti]);
    }
  }

  // ---- File Loading ----

  function loadSource(text, fileName) {
    state.originalSource = text;
    state.currentSource = text;
    state.fileName = fileName || 'source.c';
    state.selectedArray = 0;
    state.selectedTile = 0;

    state.arrays = scanSource(text);

    el.fileName.textContent = state.fileName;
    el.dropZone.classList.add('compact');
    el.app.hidden = false;

    if (state.arrays.length > 0) {
      el.editorPanel.hidden = false;
      selectTile(0, 0);
    } else {
      el.editorPanel.hidden = true;
      el.editorInfo.textContent = 'No tile data found';
    }

    renderSource();
  }

  function loadFile(file) {
    const reader = new FileReader();
    reader.onload = () => loadSource(reader.result, file.name);
    reader.readAsText(file);
  }

  // ---- Event Handlers ----

  // Drop zone
  el.dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    el.dropZone.classList.add('drag-over');
  });
  el.dropZone.addEventListener('dragleave', () => {
    el.dropZone.classList.remove('drag-over');
  });
  el.dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    el.dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) loadFile(file);
  });
  el.fileInput.addEventListener('change', () => {
    if (el.fileInput.files[0]) loadFile(el.fileInput.files[0]);
  });

  // Also support drop on the whole page when app is visible
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) loadFile(file);
  });

  // Toolbar buttons
  el.copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(state.currentSource).then(() => {
      el.copyBtn.textContent = 'Copied!';
      setTimeout(() => { el.copyBtn.textContent = 'Copy'; }, 1500);
    });
  });

  el.downloadBtn.addEventListener('click', () => {
    const blob = new Blob([state.currentSource], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = state.fileName;
    a.click();
    URL.revokeObjectURL(url);
  });

  el.resetBtn.addEventListener('click', () => {
    loadSource(state.originalSource, state.fileName);
  });

  // Tile grid click
  el.tileGridCanvas.addEventListener('click', (e) => {
    const arr = state.arrays[state.selectedArray];
    if (!arr) return;
    const rect = el.tileGridCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cols = Math.min(arr.tiles.length, 16);
    const scale = 2;
    const tileSize = 8 * scale;
    const scaleX = el.tileGridCanvas.width / rect.width;
    const scaleY = el.tileGridCanvas.height / rect.height;
    const col = Math.floor((x * scaleX) / tileSize);
    const row = Math.floor((y * scaleY) / tileSize);
    const idx = row * cols + col;
    if (idx >= 0 && idx < arr.tiles.length) {
      selectTile(state.selectedArray, idx);
    }
  });

  // Zoom canvas painting
  el.tileZoomCanvas.addEventListener('mousedown', (e) => {
    e.preventDefault();
    state.painting = true;
    paintPixel(e);
  });
  el.tileZoomCanvas.addEventListener('mousemove', (e) => {
    if (state.painting) paintPixel(e);
  });
  window.addEventListener('mouseup', () => { state.painting = false; });

  // Touch support for zoom canvas
  el.tileZoomCanvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    state.painting = true;
    paintPixel(e);
  });
  el.tileZoomCanvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (state.painting) paintPixel(e);
  });
  el.tileZoomCanvas.addEventListener('touchend', () => { state.painting = false; });

  // Palette buttons
  document.querySelectorAll('.palette-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.selectedColor = parseInt(btn.dataset.color);
      document.querySelectorAll('.palette-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Navigation buttons
  el.prevTileBtn.addEventListener('click', () => {
    if (state.selectedTile > 0) {
      selectTile(state.selectedArray, state.selectedTile - 1);
    } else if (state.selectedArray > 0) {
      // Jump to previous array, last tile
      const prevArr = state.arrays[state.selectedArray - 1];
      selectTile(state.selectedArray - 1, prevArr.tiles.length - 1);
    }
  });

  el.nextTileBtn.addEventListener('click', () => {
    const arr = state.arrays[state.selectedArray];
    if (!arr) return;
    if (state.selectedTile < arr.tiles.length - 1) {
      selectTile(state.selectedArray, state.selectedTile + 1);
    } else if (state.selectedArray < state.arrays.length - 1) {
      // Jump to next array, first tile
      selectTile(state.selectedArray + 1, 0);
    }
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (el.app.hidden) return;

    // Color selection: 1-4
    if (e.key >= '1' && e.key <= '4' && !e.ctrlKey && !e.metaKey) {
      const colorIdx = parseInt(e.key) - 1;
      state.selectedColor = colorIdx;
      document.querySelectorAll('.palette-btn').forEach(b => b.classList.remove('active'));
      document.querySelector(`.palette-btn[data-color="${colorIdx}"]`).classList.add('active');
      return;
    }

    // Tile navigation: arrow keys
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      if (!el.editorPanel.hidden) {
        e.preventDefault();
        const delta = e.key === 'ArrowLeft' ? -1 : 1;
        const arr = state.arrays[state.selectedArray];
        if (arr) {
          const newIdx = state.selectedTile + delta;
          if (newIdx >= 0 && newIdx < arr.tiles.length) {
            selectTile(state.selectedArray, newIdx);
          }
        }
      }
    }

    // Array navigation: [ and ]
    if (e.key === '[' && state.selectedArray > 0) {
      selectTile(state.selectedArray - 1, 0);
    }
    if (e.key === ']' && state.selectedArray < state.arrays.length - 1) {
      selectTile(state.selectedArray + 1, 0);
    }
  });

  // ---- Paste support ----
  document.addEventListener('paste', (e) => {
    const text = e.clipboardData.getData('text');
    if (text && text.length > 10) {
      e.preventDefault();
      loadSource(text, 'pasted.c');
    }
  });
})();
