const elements = {
  sourceDropTarget: document.getElementById('sourceDropTarget'),
  copyBtn: document.getElementById('copyBtn'),
  downloadBtn: document.getElementById('downloadBtn'),
  sourceCanvas: document.getElementById('sourceCanvas'),
  threshold: document.getElementById('threshold'),
  thresholdValue: document.getElementById('thresholdValue'),
  detail: document.getElementById('detail'),
  detailValue: document.getElementById('detailValue'),
  simplify: document.getElementById('simplify'),
  simplifyValue: document.getElementById('simplifyValue'),
  smooth: document.getElementById('smooth'),
  smoothValue: document.getElementById('smoothValue'),
  minArea: document.getElementById('minArea'),
  minAreaValue: document.getElementById('minAreaValue'),
  invert: document.getElementById('invert'),
  status: document.getElementById('status'),
  previewWrap: document.getElementById('previewWrap'),
  previewViewport: document.getElementById('previewViewport'),
  previewStage: document.getElementById('previewStage'),
  onionImage: document.getElementById('onionImage'),
  onionOpacity: document.getElementById('onionOpacity'),
  resetViewBtn: document.getElementById('resetViewBtn'),
  modeTraceBtn: document.getElementById('modeTraceBtn'),
  modePathBtn: document.getElementById('modePathBtn'),
  pathEditor: document.getElementById('pathEditor'),
  pathList: document.getElementById('pathList'),
  pathModule: document.getElementById('pathModule'),
  pathSimplifyEnabled: document.getElementById('pathSimplifyEnabled'),
  pathSimplify: document.getElementById('pathSimplify'),
  pathSimplifyValue: document.getElementById('pathSimplifyValue'),
  pathSmoothEnabled: document.getElementById('pathSmoothEnabled'),
  pathSmooth: document.getElementById('pathSmooth'),
  pathSmoothValue: document.getElementById('pathSmoothValue'),
  resetPathBtn: document.getElementById('resetPathBtn'),
  pathContextMenu: document.getElementById('pathContextMenu'),
  addNodeBtn: document.getElementById('addNodeBtn'),
  deleteNodeBtn: document.getElementById('deleteNodeBtn'),
  toggleCurveBtn: document.getElementById('toggleCurveBtn')
};

const state = {
  image: null,
  imageName: 'trace',
  sourceSize: { width: 0, height: 0 },
  svgText: '',
  loops: 0,
  pageDragDepth: 0,
  mode: 'trace',
  selectedPathId: null,
  hoveredPathId: null,
  pathItems: [],
  viewport: {
    scale: 1,
    minScale: 0.25,
    maxScale: 24,
    x: 0,
    y: 0
  },
  drag: {
    active: false,
    startX: 0,
    startY: 0,
    baseX: 0,
    baseY: 0
  },
  nodeDrag: {
    active: false,
    pointerId: null,
    pathId: null,
    nodeIndex: -1
  },
  contextMenu: {
    open: false,
    pathId: null,
    nodeIndex: -1,
    worldPoint: null
  },
  globals: {
    threshold: 128,
    detail: 720,
    simplify: 1.2,
    smooth: 2,
    minArea: 24,
    invert: false
  }
};

const SHAPE_DETECTORS = [
  detectLinePrimitive,
  detectRectPrimitive,
  detectRoundedRectPrimitive,
  detectCirclePrimitive,
  detectEllipsePrimitive
];

const sourceCtx = elements.sourceCanvas.getContext('2d', { willReadFrequently: true });

bindUi();
drawPlaceholder();
refreshLabels();
syncGlobalStateFromControls();
applyOnionSkinState();
refreshPathEditor();

function bindUi() {
  bindFileDropTarget(elements.sourceDropTarget);
  bindPageDropTarget();

  elements.copyBtn.addEventListener('click', copySvgToClipboard);
  elements.downloadBtn.addEventListener('click', downloadSvgFile);

  const controls = [
    elements.threshold,
    elements.detail,
    elements.simplify,
    elements.smooth,
    elements.minArea,
    elements.invert
  ];

  controls.forEach((control) => {
    control.addEventListener('input', () => {
      refreshLabels();
      syncGlobalStateFromControls();
      if (state.image) {
        traceAndRender();
      }
    });
  });

  elements.modeTraceBtn.addEventListener('click', () => setMode('trace'));
  elements.modePathBtn.addEventListener('click', () => setMode('path'));

  elements.pathModule.addEventListener('change', () => {
    const item = getSelectedPathItem();
    if (!item) {
      return;
    }
    item.module = elements.pathModule.value;
    if (item.module === 'custom') {
      ensureCustomAnchorPoints(item);
    }
    renderFromPathItems();
  });

  elements.pathSimplifyEnabled.addEventListener('change', () => {
    const item = getSelectedPathItem();
    if (!item) {
      return;
    }
    item.overrideSimplifyEnabled = elements.pathSimplifyEnabled.checked;
    renderFromPathItems();
    refreshPathEditor();
  });

  elements.pathSimplify.addEventListener('input', () => {
    const item = getSelectedPathItem();
    if (!item) {
      return;
    }
    item.overrideSimplify = Number(elements.pathSimplify.value);
    refreshPathControlLabels();
    renderFromPathItems();
  });

  elements.pathSmoothEnabled.addEventListener('change', () => {
    const item = getSelectedPathItem();
    if (!item) {
      return;
    }
    item.overrideSmoothEnabled = elements.pathSmoothEnabled.checked;
    renderFromPathItems();
    refreshPathEditor();
  });

  elements.pathSmooth.addEventListener('input', () => {
    const item = getSelectedPathItem();
    if (!item) {
      return;
    }
    item.overrideSmooth = Number(elements.pathSmooth.value);
    refreshPathControlLabels();
    renderFromPathItems();
  });

  elements.resetPathBtn.addEventListener('click', () => {
    const item = getSelectedPathItem();
    if (!item) {
      return;
    }

    item.module = 'auto';
    item.overrideSimplifyEnabled = false;
    item.overrideSmoothEnabled = false;
    item.overrideSimplify = state.globals.simplify;
    item.overrideSmooth = state.globals.smooth;
    item.customPoints = null;
    item.customNodeModes = null;
    renderFromPathItems();
    refreshPathEditor();
  });

  elements.addNodeBtn.addEventListener('click', handleAddNodeAction);
  elements.deleteNodeBtn.addEventListener('click', handleDeleteNodeAction);
  elements.toggleCurveBtn.addEventListener('click', handleToggleCurveAction);

  document.addEventListener('pointerdown', (event) => {
    if (!state.contextMenu.open) {
      return;
    }
    if (elements.pathContextMenu.contains(event.target)) {
      return;
    }
    closePathContextMenu();
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closePathContextMenu();
    }
  });

  window.addEventListener('blur', closePathContextMenu);

  elements.onionOpacity.addEventListener('input', applyOnionSkinState);
  elements.resetViewBtn.addEventListener('click', resetPreviewViewport);

  elements.previewWrap.addEventListener('wheel', (event) => {
    if (!state.svgText) {
      return;
    }

    event.preventDefault();
    const delta = clamp(normalizeWheelDelta(event), -80, 80);
    const factor = Math.exp(-delta * 0.001);
    zoomAt(factor, event.clientX, event.clientY);
  }, { passive: false });

  elements.previewWrap.addEventListener('pointerdown', (event) => {
    if (!state.svgText) {
      return;
    }
    if (event.button !== 0) {
      return;
    }

    closePathContextMenu();

    const nodeTarget = event.target.closest('.trace-node[data-path-id][data-node-index]');
    if (nodeTarget && state.mode === 'path') {
      const pathId = Number(nodeTarget.getAttribute('data-path-id'));
      const nodeIndex = Number(nodeTarget.getAttribute('data-node-index'));
      const item = getPathItemById(pathId);
      const validNode = Boolean(item && item.module === 'custom' && Array.isArray(item.customPoints) && nodeIndex >= 0 && nodeIndex < item.customPoints.length);
      if (validNode) {
        state.selectedPathId = pathId;
        state.nodeDrag.active = true;
        state.nodeDrag.pointerId = event.pointerId;
        state.nodeDrag.pathId = pathId;
        state.nodeDrag.nodeIndex = nodeIndex;
        setHoveredPathId(pathId);
        elements.previewWrap.setPointerCapture(event.pointerId);
        event.preventDefault();
        return;
      }
    }

    elements.previewWrap.setPointerCapture(event.pointerId);
    state.drag.active = true;
    state.drag.startX = event.clientX;
    state.drag.startY = event.clientY;
    state.drag.baseX = state.viewport.x;
    state.drag.baseY = state.viewport.y;
  });

  elements.previewWrap.addEventListener('pointermove', (event) => {
    if (state.nodeDrag.active && event.pointerId === state.nodeDrag.pointerId) {
      const item = getPathItemById(state.nodeDrag.pathId);
      if (!item || item.module !== 'custom' || !Array.isArray(item.customPoints)) {
        stopNodeDrag(event.pointerId);
        return;
      }

      const point = clientToWorldPoint(event.clientX, event.clientY);
      if (!point) {
        return;
      }
      const clampedX = clamp(point[0], 0, state.sourceSize.width);
      const clampedY = clamp(point[1], 0, state.sourceSize.height);
      item.customPoints[state.nodeDrag.nodeIndex] = [clampedX, clampedY];
      renderFromPathItems();
      return;
    }

    if (!state.drag.active) {
      return;
    }

    state.viewport.x = state.drag.baseX + (event.clientX - state.drag.startX);
    state.viewport.y = state.drag.baseY + (event.clientY - state.drag.startY);
    applyPreviewTransform();
  });

  elements.previewWrap.addEventListener('pointerup', (event) => {
    if (state.nodeDrag.active && event.pointerId === state.nodeDrag.pointerId) {
      stopNodeDrag(event.pointerId);
      return;
    }

    if (state.drag.active) {
      state.drag.active = false;
      elements.previewWrap.releasePointerCapture(event.pointerId);
    }
  });

  elements.previewWrap.addEventListener('pointercancel', (event) => {
    if (state.nodeDrag.active && event.pointerId === state.nodeDrag.pointerId) {
      stopNodeDrag(event.pointerId);
      return;
    }

    if (state.drag.active) {
      state.drag.active = false;
      elements.previewWrap.releasePointerCapture(event.pointerId);
    }
  });

  elements.previewStage.addEventListener('click', (event) => {
    if (state.mode !== 'path') {
      return;
    }

    const target = event.target.closest('[data-path-id]');
    if (!target) {
      return;
    }

    const id = Number(target.getAttribute('data-path-id'));
    if (Number.isNaN(id)) {
      return;
    }

    state.selectedPathId = id;
    renderFromPathItems();
    refreshPathEditor();
  });

  elements.previewStage.addEventListener('contextmenu', (event) => {
    if (state.mode !== 'path') {
      return;
    }

    const target = event.target.closest('[data-path-id]');
    if (!target) {
      return;
    }

    const pathId = Number(target.getAttribute('data-path-id'));
    if (Number.isNaN(pathId)) {
      return;
    }

    const item = getPathItemById(pathId);
    if (!item || item.module !== 'custom') {
      return;
    }

    const nodeTarget = event.target.closest('.trace-node[data-node-index]');
    const nodeIndex = nodeTarget ? Number(nodeTarget.getAttribute('data-node-index')) : -1;
    const worldPoint = clientToWorldPoint(event.clientX, event.clientY);
    if (!worldPoint) {
      return;
    }

    event.preventDefault();
    state.selectedPathId = pathId;
    renderFromPathItems();
    refreshPathEditor();
    openPathContextMenu(pathId, Number.isNaN(nodeIndex) ? -1 : nodeIndex, worldPoint, event.clientX, event.clientY);
  });
}

function bindFileDropTarget(target) {
  ['dragenter', 'dragover'].forEach((eventName) => {
    target.addEventListener(eventName, (event) => {
      event.preventDefault();
      target.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach((eventName) => {
    target.addEventListener(eventName, (event) => {
      event.preventDefault();
      if (eventName === 'drop' || event.relatedTarget !== target) {
        target.classList.remove('dragover');
      }
    });
  });
}

function bindPageDropTarget() {
  window.addEventListener('dragenter', (event) => {
    if (!hasFilesInDrag(event)) {
      return;
    }

    event.preventDefault();
    state.pageDragDepth += 1;
    document.body.classList.add('page-dragover');
  });

  window.addEventListener('dragover', (event) => {
    if (!hasFilesInDrag(event)) {
      return;
    }

    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  });

  window.addEventListener('dragleave', () => {
    if (!document.body.classList.contains('page-dragover')) {
      return;
    }

    state.pageDragDepth = Math.max(0, state.pageDragDepth - 1);
    if (state.pageDragDepth === 0) {
      clearDropHighlights();
      document.body.classList.remove('page-dragover');
    }
  });

  window.addEventListener('drop', (event) => {
    if (!hasFilesInDrag(event)) {
      return;
    }

    event.preventDefault();
    state.pageDragDepth = 0;
    clearDropHighlights();
    document.body.classList.remove('page-dragover');

    const [file] = event.dataTransfer?.files || [];
    if (file) {
      loadImageFile(file);
    }
  });
}

function hasFilesInDrag(event) {
  if ((event.dataTransfer?.files?.length || 0) > 0) {
    return true;
  }
  const types = Array.from(event.dataTransfer?.types || []);
  return types.includes('Files');
}

function clearDropHighlights() {
  elements.sourceDropTarget?.classList.remove('dragover');
}

function refreshLabels() {
  elements.thresholdValue.textContent = elements.threshold.value;
  elements.detailValue.textContent = `${elements.detail.value} px`;
  elements.simplifyValue.textContent = Number(elements.simplify.value).toFixed(1);
  elements.smoothValue.textContent = elements.smooth.value;
  elements.minAreaValue.textContent = elements.minArea.value;
  refreshPathControlLabels();
}

function refreshPathControlLabels() {
  elements.pathSimplifyValue.textContent = Number(elements.pathSimplify.value).toFixed(1);
  elements.pathSmoothValue.textContent = elements.pathSmooth.value;
}

function syncGlobalStateFromControls() {
  state.globals.threshold = Number(elements.threshold.value);
  state.globals.detail = Number(elements.detail.value);
  state.globals.simplify = Number(elements.simplify.value);
  state.globals.smooth = Number(elements.smooth.value);
  state.globals.minArea = Number(elements.minArea.value);
  state.globals.invert = elements.invert.checked;
}

function setMode(mode) {
  state.mode = mode;
  const isPathMode = mode === 'path';
  elements.modeTraceBtn.classList.toggle('active', !isPathMode);
  elements.modePathBtn.classList.toggle('active', isPathMode);
  elements.modeTraceBtn.setAttribute('aria-pressed', String(!isPathMode));
  elements.modePathBtn.setAttribute('aria-pressed', String(isPathMode));
  elements.pathEditor.classList.toggle('is-hidden', !isPathMode);

  if (isPathMode && state.pathItems.length && state.selectedPathId == null) {
    state.selectedPathId = state.pathItems[0].id;
  }
  if (!isPathMode) {
    state.hoveredPathId = null;
    closePathContextMenu();
    if (state.nodeDrag.active && state.nodeDrag.pointerId != null) {
      stopNodeDrag(state.nodeDrag.pointerId);
    } else {
      state.nodeDrag.active = false;
      state.nodeDrag.pointerId = null;
      state.nodeDrag.pathId = null;
      state.nodeDrag.nodeIndex = -1;
    }
  }

  if (state.image) {
    renderFromPathItems();
  } else {
    syncHoveredPathHighlight();
  }
  refreshPathEditor();
}

function getSelectedPathItem() {
  if (state.selectedPathId == null) {
    return null;
  }
  return state.pathItems.find((item) => item.id === state.selectedPathId) || null;
}

function getPathItemById(pathId) {
  return state.pathItems.find((item) => item.id === pathId) || null;
}

function refreshPathEditor() {
  const item = getSelectedPathItem();
  const disabled = !item;
  elements.pathModule.disabled = disabled;
  elements.pathSimplifyEnabled.disabled = disabled;
  elements.pathSimplify.disabled = disabled || !elements.pathSimplifyEnabled.checked;
  elements.pathSmoothEnabled.disabled = disabled;
  elements.pathSmooth.disabled = disabled || !elements.pathSmoothEnabled.checked;
  elements.resetPathBtn.disabled = disabled;

  if (!item) {
    elements.pathModule.value = 'auto';
    elements.pathSimplifyEnabled.checked = false;
    elements.pathSmoothEnabled.checked = false;
    elements.pathSimplify.value = String(state.globals.simplify);
    elements.pathSmooth.value = String(state.globals.smooth);
    refreshPathControlLabels();
    return;
  }

  elements.pathModule.value = item.module;
  elements.pathSimplifyEnabled.checked = item.overrideSimplifyEnabled;
  elements.pathSmoothEnabled.checked = item.overrideSmoothEnabled;
  elements.pathSimplify.value = String(item.overrideSimplify);
  elements.pathSmooth.value = String(item.overrideSmooth);
  elements.pathSimplify.disabled = !item.overrideSimplifyEnabled;
  elements.pathSmooth.disabled = !item.overrideSmoothEnabled;
  refreshPathControlLabels();
}

function setHoveredPathId(pathId) {
  const nextId = state.mode === 'path' ? pathId : null;
  if (state.hoveredPathId === nextId) {
    return;
  }
  state.hoveredPathId = nextId;
  syncHoveredPathHighlight();
}

function syncHoveredPathHighlight() {
  const hoveredId = state.mode === 'path' ? state.hoveredPathId : null;
  const previewNodes = elements.previewStage.querySelectorAll('[data-path-id]');
  for (let i = 0; i < previewNodes.length; i += 1) {
    const node = previewNodes[i];
    const nodeId = Number(node.getAttribute('data-path-id'));
    node.classList.toggle('is-hovered', hoveredId != null && nodeId === hoveredId);
  }

  const listNodes = elements.pathList.querySelectorAll('.path-item[data-path-id]');
  for (let i = 0; i < listNodes.length; i += 1) {
    const node = listNodes[i];
    const nodeId = Number(node.getAttribute('data-path-id'));
    node.classList.toggle('is-hovered', hoveredId != null && nodeId === hoveredId);
  }
}

function openPathContextMenu(pathId, nodeIndex, worldPoint, clientX, clientY) {
  const item = getPathItemById(pathId);
  if (!item || item.module !== 'custom' || !Array.isArray(item.customPoints) || item.customPoints.length < 3) {
    closePathContextMenu();
    return;
  }

  state.contextMenu.open = true;
  state.contextMenu.pathId = pathId;
  state.contextMenu.nodeIndex = nodeIndex;
  state.contextMenu.worldPoint = worldPoint;

  const targetNodeIndex = resolveContextTargetNodeIndex(item, nodeIndex, worldPoint);
  const nodeModes = normalizeCustomNodeModes(item.customPoints, item.customNodeModes);
  const canDelete = targetNodeIndex >= 0 && item.customPoints.length > 3;
  const canToggle = targetNodeIndex >= 0;

  elements.deleteNodeBtn.disabled = !canDelete;
  elements.toggleCurveBtn.disabled = !canToggle;
  elements.toggleCurveBtn.textContent = canToggle && nodeModes[targetNodeIndex]
    ? 'Set Node to Corner'
    : 'Set Node to Curve';

  const menu = elements.pathContextMenu;
  menu.classList.remove('is-hidden');
  menu.style.left = '0px';
  menu.style.top = '0px';

  const rect = menu.getBoundingClientRect();
  const pad = 8;
  const maxLeft = window.innerWidth - rect.width - pad;
  const maxTop = window.innerHeight - rect.height - pad;
  const nextLeft = clamp(clientX + 2, pad, Math.max(pad, maxLeft));
  const nextTop = clamp(clientY + 2, pad, Math.max(pad, maxTop));
  menu.style.left = `${nextLeft}px`;
  menu.style.top = `${nextTop}px`;
}

function closePathContextMenu() {
  if (!state.contextMenu.open) {
    return;
  }

  state.contextMenu.open = false;
  state.contextMenu.pathId = null;
  state.contextMenu.nodeIndex = -1;
  state.contextMenu.worldPoint = null;
  elements.pathContextMenu.classList.add('is-hidden');
}

function getContextMenuPathItem() {
  if (!state.contextMenu.open || state.contextMenu.pathId == null) {
    return null;
  }
  const item = getPathItemById(state.contextMenu.pathId);
  if (!item || item.module !== 'custom' || !Array.isArray(item.customPoints) || item.customPoints.length < 3) {
    return null;
  }
  return item;
}

function resolveContextTargetNodeIndex(item, nodeIndex, worldPoint) {
  if (Number.isInteger(nodeIndex) && nodeIndex >= 0 && nodeIndex < item.customPoints.length) {
    return nodeIndex;
  }
  if (!worldPoint) {
    return -1;
  }
  return findNearestNodeIndex(item.customPoints, worldPoint);
}

function handleAddNodeAction() {
  const item = getContextMenuPathItem();
  if (!item) {
    closePathContextMenu();
    return;
  }

  const insertion = resolveContextInsertion(item, state.contextMenu.nodeIndex, state.contextMenu.worldPoint);
  if (!insertion) {
    closePathContextMenu();
    return;
  }

  const modes = normalizeCustomNodeModes(item.customPoints, item.customNodeModes);
  item.customPoints.splice(insertion.insertIndex, 0, insertion.point);
  modes.splice(insertion.insertIndex, 0, true);
  item.customNodeModes = modes;
  closePathContextMenu();
  renderFromPathItems();
  refreshPathEditor();
}

function handleDeleteNodeAction() {
  const item = getContextMenuPathItem();
  if (!item) {
    closePathContextMenu();
    return;
  }

  const targetNodeIndex = resolveContextTargetNodeIndex(item, state.contextMenu.nodeIndex, state.contextMenu.worldPoint);
  if (targetNodeIndex < 0) {
    closePathContextMenu();
    return;
  }
  if (item.customPoints.length <= 3) {
    closePathContextMenu();
    return;
  }

  const modes = normalizeCustomNodeModes(item.customPoints, item.customNodeModes);
  item.customPoints.splice(targetNodeIndex, 1);
  modes.splice(targetNodeIndex, 1);
  item.customNodeModes = modes;
  closePathContextMenu();
  renderFromPathItems();
  refreshPathEditor();
}

function handleToggleCurveAction() {
  const item = getContextMenuPathItem();
  if (!item) {
    closePathContextMenu();
    return;
  }

  const targetNodeIndex = resolveContextTargetNodeIndex(item, state.contextMenu.nodeIndex, state.contextMenu.worldPoint);
  if (targetNodeIndex < 0) {
    closePathContextMenu();
    return;
  }

  const modes = normalizeCustomNodeModes(item.customPoints, item.customNodeModes);
  modes[targetNodeIndex] = !modes[targetNodeIndex];
  item.customNodeModes = modes;
  closePathContextMenu();
  renderFromPathItems();
  refreshPathEditor();
}

function resolveContextInsertion(item, nodeIndex, worldPoint) {
  const points = item.customPoints;
  const count = points.length;
  if (count < 3) {
    return null;
  }

  if (Number.isInteger(nodeIndex) && nodeIndex >= 0 && nodeIndex < count) {
    const nextIndex = (nodeIndex + 1) % count;
    const a = points[nodeIndex];
    const b = points[nextIndex];
    const projected = worldPoint ? projectPointToSegment(worldPoint, a, b).point : midpoint(a, b);
    return {
      insertIndex: nodeIndex + 1,
      point: projected
    };
  }

  const samplePoint = worldPoint || points[0];
  const nearest = findNearestSegment(points, samplePoint);
  if (!nearest) {
    return null;
  }

  return {
    insertIndex: nearest.segmentIndex + 1,
    point: nearest.point
  };
}

function findNearestNodeIndex(points, target) {
  if (!Array.isArray(points) || !points.length || !target) {
    return -1;
  }

  let bestIndex = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < points.length; i += 1) {
    const dx = points[i][0] - target[0];
    const dy = points[i][1] - target[1];
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i;
    }
  }
  return bestIndex;
}

function findNearestSegment(points, target) {
  if (!Array.isArray(points) || points.length < 2 || !target) {
    return null;
  }

  let best = null;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const projection = projectPointToSegment(target, a, b);
    if (!best || projection.distanceSq < best.distanceSq) {
      best = {
        segmentIndex: i,
        point: projection.point,
        distanceSq: projection.distanceSq
      };
    }
  }
  return best;
}

function projectPointToSegment(point, a, b) {
  const abX = b[0] - a[0];
  const abY = b[1] - a[1];
  const lengthSq = abX * abX + abY * abY;
  if (lengthSq <= 1e-9) {
    const dx = point[0] - a[0];
    const dy = point[1] - a[1];
    return {
      point: [a[0], a[1]],
      distanceSq: dx * dx + dy * dy
    };
  }

  const t = clamp(((point[0] - a[0]) * abX + (point[1] - a[1]) * abY) / lengthSq, 0, 1);
  const projX = a[0] + abX * t;
  const projY = a[1] + abY * t;
  const dx = point[0] - projX;
  const dy = point[1] - projY;
  return {
    point: [projX, projY],
    distanceSq: dx * dx + dy * dy
  };
}

function midpoint(a, b) {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

function renderPathList() {
  elements.pathList.innerHTML = '';
  if (!state.pathItems.length) {
    const empty = document.createElement('div');
    empty.className = 'path-list-empty';
    empty.textContent = 'No paths found at current settings.';
    elements.pathList.append(empty);
    return;
  }

  for (let i = 0; i < state.pathItems.length; i += 1) {
    const item = state.pathItems[i];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'path-item';
    button.setAttribute('data-path-id', String(item.id));
    if (item.id === state.selectedPathId) {
      button.classList.add('active');
    }
    if (item.id === state.hoveredPathId) {
      button.classList.add('is-hovered');
    }
    const moduleText = item.module === 'auto' ? `auto → ${item.shapeType}` : item.module;
    const area = Math.round(item.area);
    button.innerHTML = `<strong>Path ${item.id + 1}</strong><div class="meta">${moduleText} · area ${area}</div>`;
    button.addEventListener('pointerenter', () => setHoveredPathId(item.id));
    button.addEventListener('pointerleave', () => setHoveredPathId(null));
    button.addEventListener('focus', () => setHoveredPathId(item.id));
    button.addEventListener('blur', () => setHoveredPathId(null));
    button.addEventListener('click', () => {
      state.selectedPathId = item.id;
      renderFromPathItems();
      refreshPathEditor();
    });
    elements.pathList.append(button);
  }
}

function updateOnionSourceFromCanvas() {
  if (!state.sourceSize.width || !state.sourceSize.height) {
    return;
  }

  try {
    elements.onionImage.src = elements.sourceCanvas.toDataURL('image/png');
  } catch {
    elements.onionImage.removeAttribute('src');
  }
}

function applyOnionSkinState() {
  const enabled = Boolean(elements.onionImage.src);
  const opacity = Number(elements.onionOpacity.value) / 100;
  elements.onionImage.classList.toggle('visible', enabled);
  elements.onionImage.style.opacity = String(clamp(opacity, 0, 1));
}

async function loadImageFile(file) {
  if (!isValidImage(file)) {
    setStatus('Please choose a PNG or JPG image.', true);
    return;
  }

  try {
    const bitmap = await createImageBitmap(file);
    state.image = bitmap;
    state.imageName = (file.name || 'trace').replace(/\.[^.]+$/, '');
    setStatus(`Loaded ${file.name}.`);
    traceAndRender();
  } catch (error) {
    console.error(error);
    setStatus('Failed to decode image file.', true);
  }
}

function isValidImage(file) {
  const supportedTypes = ['image/png', 'image/jpeg', 'image/jpg'];
  return supportedTypes.includes(file.type);
}

function traceAndRender() {
  if (!state.image) {
    return;
  }

  syncGlobalStateFromControls();
  const {
    threshold,
    detail,
    simplify: simplifyTolerance,
    smooth: smoothPasses,
    minArea,
    invert
  } = state.globals;

  const { width, height } = fitSize(state.image.width, state.image.height, detail);
  state.sourceSize.width = width;
  state.sourceSize.height = height;

  elements.sourceCanvas.width = width;
  elements.sourceCanvas.height = height;
  sourceCtx.clearRect(0, 0, width, height);
  sourceCtx.drawImage(state.image, 0, 0, width, height);

  const img = sourceCtx.getImageData(0, 0, width, height);
  const binary = toBinaryMask(img.data, width, height, threshold, invert);

  const contours = traceContours(binary, width, height);
  const previousSelectedKey = getSelectedPathItem()?.key || null;
  const previousOverrides = new Map(
    state.pathItems.map((item) => [
      item.key,
      {
        module: item.module,
        overrideSimplifyEnabled: item.overrideSimplifyEnabled,
        overrideSimplify: item.overrideSimplify,
        overrideSmoothEnabled: item.overrideSmoothEnabled,
        overrideSmooth: item.overrideSmooth,
        customPoints: clonePoints(item.customPoints),
        customNodeModes: cloneNodeModes(item.customNodeModes)
      }
    ])
  );

  const nextItems = [];

  for (let i = 0; i < contours.length; i += 1) {
    const loop = contours[i];
    const area = Math.abs(polygonArea(loop));
    if (area < minArea) {
      continue;
    }

    const simplified = simplifyLoop(loop, simplifyTolerance);
    if (simplified.length < 3) {
      continue;
    }

    const centroid = computeAveragePoint(simplified);
    const key = `${Math.round(centroid[0])}:${Math.round(centroid[1])}:${Math.round(area)}`;
    const previous = previousOverrides.get(key);
    nextItems.push({
      id: nextItems.length,
      key,
      rawLoop: loop,
      area,
      centroid,
      module: previous?.module || 'auto',
      overrideSimplifyEnabled: previous?.overrideSimplifyEnabled || false,
      overrideSimplify: previous?.overrideSimplify ?? simplifyTolerance,
      overrideSmoothEnabled: previous?.overrideSmoothEnabled || false,
      overrideSmooth: previous?.overrideSmooth ?? smoothPasses,
      customPoints: clonePoints(previous?.customPoints),
      customNodeModes: cloneNodeModes(previous?.customNodeModes),
      shape: null,
      shapeType: 'path'
    });
  }

  state.pathItems = nextItems;
  if (!nextItems.length) {
    state.selectedPathId = null;
    state.hoveredPathId = null;
  } else if (previousSelectedKey) {
    const matched = nextItems.find((item) => item.key === previousSelectedKey);
    if (matched) {
      state.selectedPathId = matched.id;
    } else if (!nextItems.some((item) => item.id === state.selectedPathId)) {
      state.selectedPathId = nextItems[0].id;
    }
  } else if (!nextItems.some((item) => item.id === state.selectedPathId)) {
    state.selectedPathId = nextItems[0].id;
  }
  if (!nextItems.some((item) => item.id === state.hoveredPathId)) {
    state.hoveredPathId = null;
  }
  if (!nextItems.some((item) => item.id === state.nodeDrag.pathId)) {
    if (state.nodeDrag.active && state.nodeDrag.pointerId != null) {
      stopNodeDrag(state.nodeDrag.pointerId);
    } else {
      state.nodeDrag.active = false;
      state.nodeDrag.pointerId = null;
      state.nodeDrag.pathId = null;
      state.nodeDrag.nodeIndex = -1;
    }
  }
  if (state.contextMenu.open && !nextItems.some((item) => item.id === state.contextMenu.pathId)) {
    closePathContextMenu();
  }

  updateOnionSourceFromCanvas();
  renderFromPathItems(true);
  refreshPathEditor();
}

function renderFromPathItems(resetView = false) {
  if (!state.sourceSize.width || !state.sourceSize.height) {
    state.svgText = '';
    renderPathList();
    setOutputState(false);
    return;
  }

  const renderedShapes = [];
  const globalSimplify = state.globals.simplify;
  const globalSmooth = state.globals.smooth;

  for (let i = 0; i < state.pathItems.length; i += 1) {
    const item = state.pathItems[i];
    const simplifyTolerance = item.overrideSimplifyEnabled ? item.overrideSimplify : globalSimplify;
    const smoothPasses = item.overrideSmoothEnabled ? item.overrideSmooth : globalSmooth;
    const simplified = simplifyLoop(item.rawLoop, simplifyTolerance);

    if (simplified.length < 3) {
      item.shape = null;
      item.shapeType = 'path';
      continue;
    }

    const context = buildContourContext(item.rawLoop, simplified, simplifyTolerance);
    const shape = resolveShapeForItem(item, context, simplified, smoothPasses);
    if (!shape) {
      item.shape = null;
      item.shapeType = 'path';
      continue;
    }

    item.shape = shape;
    item.shapeType = shape.shapeType || 'path';
    renderedShapes.push(shape);
  }

  state.loops = renderedShapes.length;
  if (!renderedShapes.length) {
    state.svgText = '';
    state.hoveredPathId = null;
    elements.previewStage.innerHTML = '<div class="placeholder">No paths detected. Lower min area, reduce threshold, or invert tracing.</div>';
    if (resetView) {
      resetPreviewViewport();
    }
    renderPathList();
    syncHoveredPathHighlight();
    applyOnionSkinState();
    setStatus(`Traced 0 shapes at ${state.sourceSize.width}×${state.sourceSize.height} (no shapes).`);
    setOutputState(false);
    return;
  }

  state.svgText = buildSvg(state.pathItems, state.sourceSize.width, state.sourceSize.height);
  const previewSvg = buildSvg(state.pathItems, state.sourceSize.width, state.sourceSize.height, {
    interactive: true,
    mode: state.mode,
    selectedPathId: state.selectedPathId
  });
  renderSvgPreview(previewSvg, resetView);
  renderPathList();
  syncHoveredPathHighlight();
  applyOnionSkinState();

  setStatus(`Traced ${renderedShapes.length} shape${renderedShapes.length === 1 ? '' : 's'} at ${state.sourceSize.width}×${state.sourceSize.height} (${summarizeShapeTypes(renderedShapes)}).`);
  setOutputState(renderedShapes.length > 0);
}

function resolveShapeForItem(item, context, simplifiedLoop, smoothPasses) {
  const module = item.module;
  if (module === 'auto') {
    return detectPrimitiveShapeFromContext(context) || buildPathFallbackShape(simplifiedLoop, smoothPasses);
  }

  if (module === 'path') {
    return buildPathFallbackShape(simplifiedLoop, smoothPasses);
  }

  if (module === 'custom') {
    ensureCustomAnchorPoints(item, simplifiedLoop);
    return buildCustomShape(item.customPoints, item.customNodeModes);
  }

  if (module === 'line') {
    return forceLinePrimitive(context);
  }
  if (module === 'rect') {
    return forceRectPrimitive(context);
  }
  if (module === 'rounded-rect') {
    return forceRoundedRectPrimitive(context);
  }
  if (module === 'circle') {
    return forceCirclePrimitive(context);
  }
  if (module === 'ellipse') {
    return forceEllipsePrimitive(context);
  }

  return buildPathFallbackShape(simplifiedLoop, smoothPasses);
}

function ensureCustomAnchorPoints(item, fallbackLoop = null) {
  if (Array.isArray(item.customPoints) && item.customPoints.length >= 3) {
    item.customNodeModes = normalizeCustomNodeModes(item.customPoints, item.customNodeModes);
    return;
  }

  const source = fallbackLoop && fallbackLoop.length >= 3 ? fallbackLoop : item.rawLoop;
  item.customPoints = buildCustomAnchorPoints(source);
  item.customNodeModes = normalizeCustomNodeModes(item.customPoints, null);
}

function buildCustomAnchorPoints(loop) {
  if (!Array.isArray(loop) || loop.length < 3) {
    return null;
  }

  const perimeter = computePerimeter(loop);
  const tolerance = clamp(perimeter / 140, 1.1, 8);
  let points = simplifyLoop(loop, tolerance);

  if (points.length < 6) {
    points = simplifyLoop(loop, Math.max(0.5, tolerance * 0.5));
  }

  const minNodes = 6;
  const maxNodes = 42;
  if (points.length > maxNodes) {
    points = resampleClosedLoop(points, maxNodes);
  } else if (points.length < minNodes) {
    points = resampleClosedLoop(loop, minNodes);
  }

  points = dedupeConsecutive(points);
  return points.length >= 3 ? points : null;
}

function resampleClosedLoop(loop, count) {
  if (!Array.isArray(loop) || loop.length === 0 || count <= 0) {
    return [];
  }

  const samples = [];
  const size = loop.length;
  const step = size / count;
  for (let i = 0; i < count; i += 1) {
    const sourceIndex = Math.floor(i * step) % size;
    const point = loop[sourceIndex];
    samples.push([point[0], point[1]]);
  }
  return dedupeConsecutive(samples);
}

function buildCustomShape(customPoints, customNodeModes) {
  if (!Array.isArray(customPoints) || customPoints.length < 3) {
    return null;
  }

  const d = customNodesToPath(customPoints, customNodeModes);
  if (!d) {
    return null;
  }

  return {
    kind: 'fill',
    shapeType: 'custom',
    d
  };
}

function normalizeCustomNodeModes(points, modes) {
  if (!Array.isArray(points) || points.length < 3) {
    return null;
  }

  if (!Array.isArray(modes) || modes.length !== points.length) {
    return new Array(points.length).fill(true);
  }

  const normalized = [];
  for (let i = 0; i < modes.length; i += 1) {
    normalized.push(Boolean(modes[i]));
  }
  return normalized;
}

function customNodesToPath(points, modes) {
  if (!Array.isArray(points) || points.length < 3) {
    return '';
  }

  const nodeModes = normalizeCustomNodeModes(points, modes);
  const n = points.length;
  const rounded = new Array(n);
  const cornerRatio = 0.28;

  for (let i = 0; i < n; i += 1) {
    const current = points[i];
    const prev = points[(i - 1 + n) % n];
    const next = points[(i + 1) % n];
    const isCurve = Boolean(nodeModes[i]);
    if (!isCurve) {
      rounded[i] = {
        curve: false,
        point: current,
        start: current,
        end: current
      };
      continue;
    }

    const distPrev = Math.hypot(current[0] - prev[0], current[1] - prev[1]);
    const distNext = Math.hypot(current[0] - next[0], current[1] - next[1]);
    const ratioPrev = distPrev > 1e-6 ? clamp(cornerRatio, 0, 0.48) : 0;
    const ratioNext = distNext > 1e-6 ? clamp(cornerRatio, 0, 0.48) : 0;
    const start = [
      current[0] + (prev[0] - current[0]) * ratioPrev,
      current[1] + (prev[1] - current[1]) * ratioPrev
    ];
    const end = [
      current[0] + (next[0] - current[0]) * ratioNext,
      current[1] + (next[1] - current[1]) * ratioNext
    ];
    rounded[i] = {
      curve: true,
      point: current,
      start,
      end
    };
  }

  const first = rounded[0];
  const startPoint = first.curve ? first.start : first.point;
  const parts = [`M ${round(startPoint[0])} ${round(startPoint[1])}`];
  let cursor = startPoint;

  for (let i = 0; i < n; i += 1) {
    const node = rounded[i];
    if (!node.curve) {
      if (!arePointsEqual(cursor, node.point)) {
        parts.push(`L ${round(node.point[0])} ${round(node.point[1])}`);
        cursor = node.point;
      }
      continue;
    }

    if (!arePointsEqual(cursor, node.start)) {
      parts.push(`L ${round(node.start[0])} ${round(node.start[1])}`);
    }
    parts.push(`Q ${round(node.point[0])} ${round(node.point[1])} ${round(node.end[0])} ${round(node.end[1])}`);
    cursor = node.end;
  }

  parts.push('Z');
  return parts.join(' ');
}

function buildPathFallbackShape(simplifiedLoop, smoothPasses) {
  const smoothed = smoothLoop(simplifiedLoop, smoothPasses);
  if (smoothed.length < 3) {
    return null;
  }
  return {
    kind: 'fill',
    shapeType: 'path',
    d: loopToPathCommand(smoothed)
  };
}

function fitSize(width, height, maxEdge) {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) {
    return { width, height };
  }

  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
}

function toBinaryMask(data, width, height, threshold, invert) {
  const mask = new Uint8Array(width * height);

  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const normalized = a < 16 ? 255 : luma;
    const dark = normalized < threshold;
    mask[p] = invert ? Number(!dark) : Number(dark);
  }

  return mask;
}

function maskAt(mask, width, height, x, y) {
  if (x < 0 || y < 0 || x >= width || y >= height) {
    return 0;
  }

  return mask[y * width + x];
}

function traceContours(mask, width, height) {
  const segments = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!maskAt(mask, width, height, x, y)) {
        continue;
      }

      if (!maskAt(mask, width, height, x, y - 1)) {
        segments.push([[x, y], [x + 1, y]]);
      }
      if (!maskAt(mask, width, height, x + 1, y)) {
        segments.push([[x + 1, y], [x + 1, y + 1]]);
      }
      if (!maskAt(mask, width, height, x, y + 1)) {
        segments.push([[x + 1, y + 1], [x, y + 1]]);
      }
      if (!maskAt(mask, width, height, x - 1, y)) {
        segments.push([[x, y + 1], [x, y]]);
      }
    }
  }

  return stitchSegmentsToLoops(segments);
}

function stitchSegmentsToLoops(segments) {
  const outgoing = new Map();
  const visited = new Uint8Array(segments.length);

  for (let i = 0; i < segments.length; i += 1) {
    const [start] = segments[i];
    const key = pointKey(start);
    if (!outgoing.has(key)) {
      outgoing.set(key, []);
    }
    outgoing.get(key).push(i);
  }

  const loops = [];

  for (let i = 0; i < segments.length; i += 1) {
    if (visited[i]) {
      continue;
    }

    const loop = [];
    let current = i;
    const firstStart = segments[current][0];
    let guard = 0;

    while (guard < segments.length + 8) {
      guard += 1;
      if (visited[current]) {
        break;
      }

      visited[current] = 1;
      const [start, end] = segments[current];
      if (loop.length === 0) {
        loop.push(start);
      }
      loop.push(end);

      if (end[0] === firstStart[0] && end[1] === firstStart[1]) {
        break;
      }

      const nextKey = pointKey(end);
      const candidates = outgoing.get(nextKey) || [];
      let next = -1;

      for (let j = 0; j < candidates.length; j += 1) {
        const candidate = candidates[j];
        if (!visited[candidate]) {
          next = candidate;
          break;
        }
      }

      if (next === -1) {
        break;
      }

      current = next;
    }

    if (loop.length >= 4) {
      if (arePointsEqual(loop[0], loop[loop.length - 1])) {
        loop.pop();
      }
      loops.push(loop);
    }
  }

  return loops;
}

function simplifyLoop(points, tolerance) {
  if (points.length < 4 || tolerance <= 0) {
    return dedupeConsecutive(points);
  }

  const closed = [...points, points[0]];
  const simplified = rdp(closed, tolerance);
  if (simplified.length > 1 && arePointsEqual(simplified[0], simplified[simplified.length - 1])) {
    simplified.pop();
  }

  return dedupeConsecutive(simplified);
}

function dedupeConsecutive(points) {
  const result = [];
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const prev = result[result.length - 1];
    if (!prev || !arePointsEqual(prev, current)) {
      result.push(current);
    }
  }

  if (result.length > 2 && arePointsEqual(result[0], result[result.length - 1])) {
    result.pop();
  }

  return result;
}

function rdp(points, epsilon) {
  if (points.length < 3) {
    return points.slice();
  }

  let dmax = 0;
  let index = 0;
  const end = points.length - 1;

  for (let i = 1; i < end; i += 1) {
    const d = perpendicularDistance(points[i], points[0], points[end]);
    if (d > dmax) {
      index = i;
      dmax = d;
    }
  }

  if (dmax > epsilon) {
    const left = rdp(points.slice(0, index + 1), epsilon);
    const right = rdp(points.slice(index), epsilon);
    return left.slice(0, -1).concat(right);
  }

  return [points[0], points[end]];
}

function perpendicularDistance(p, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];

  if (dx === 0 && dy === 0) {
    return Math.hypot(p[0] - start[0], p[1] - start[1]);
  }

  const t = ((p[0] - start[0]) * dx + (p[1] - start[1]) * dy) / (dx * dx + dy * dy);
  const px = start[0] + t * dx;
  const py = start[1] + t * dy;
  return Math.hypot(p[0] - px, p[1] - py);
}

function smoothLoop(points, passes) {
  let loop = points.slice();
  for (let pass = 0; pass < passes; pass += 1) {
    if (loop.length < 3) {
      break;
    }

    const next = [];
    const count = loop.length;

    for (let i = 0; i < count; i += 1) {
      const p0 = loop[i];
      const p1 = loop[(i + 1) % count];
      const q = [0.75 * p0[0] + 0.25 * p1[0], 0.75 * p0[1] + 0.25 * p1[1]];
      const r = [0.25 * p0[0] + 0.75 * p1[0], 0.25 * p0[1] + 0.75 * p1[1]];
      next.push(q, r);
    }

    loop = next;
  }

  return dedupeConsecutive(loop);
}

function polygonArea(points) {
  let area = 0;
  const count = points.length;

  for (let i = 0; i < count; i += 1) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % count];
    area += x1 * y2 - x2 * y1;
  }

  return area / 2;
}

function loopToPathCommand(loop) {
  if (!loop.length) {
    return '';
  }

  const parts = [`M ${round(loop[0][0])} ${round(loop[0][1])}`];
  for (let i = 1; i < loop.length; i += 1) {
    parts.push(`L ${round(loop[i][0])} ${round(loop[i][1])}`);
  }
  parts.push('Z');
  return parts.join(' ');
}

function summarizeShapeTypes(shapes) {
  if (!shapes.length) {
    return 'no shapes';
  }

  const labels = new Map();
  for (let i = 0; i < shapes.length; i += 1) {
    const shape = shapes[i];
    const key = shape.shapeType || 'path';
    labels.set(key, (labels.get(key) || 0) + 1);
  }

  return [...labels.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => `${count} ${name}`)
    .join(', ');
}

function detectPrimitiveShapeFromContext(context) {
  for (let i = 0; i < SHAPE_DETECTORS.length; i += 1) {
    const shape = SHAPE_DETECTORS[i](context);
    if (shape) {
      return shape;
    }
  }
  return null;
}

function detectPrimitiveShape({ rawLoop, simplifiedLoop, simplifyTolerance }) {
  const context = buildContourContext(rawLoop, simplifiedLoop, simplifyTolerance);
  return detectPrimitiveShapeFromContext(context);
}

function buildContourContext(rawLoop, simplifiedLoop, simplifyTolerance) {
  const bbox = getBoundingBox(rawLoop);
  const width = Math.max(1e-6, bbox.maxX - bbox.minX);
  const height = Math.max(1e-6, bbox.maxY - bbox.minY);
  const area = Math.abs(polygonArea(rawLoop));
  const perimeter = computePerimeter(rawLoop);
  const centroid = computeAveragePoint(rawLoop);
  const axes = computePrincipalAxes(rawLoop, centroid);
  const radialStats = computeRadialStats(rawLoop, centroid);
  const cornerLoop = dedupeConsecutive(simplifyLoop(rawLoop, Math.max(2.2, simplifyTolerance * 2.4)));
  const ellipseError = computeEllipseError(rawLoop, centroid, axes.majorAxis, axes.minorAxis, axes.majorLength / 2, axes.minorLength / 2);

  return {
    rawLoop,
    simplifiedLoop,
    cornerLoop,
    pointCount: rawLoop.length,
    area,
    perimeter,
    circularity: perimeter > 0 ? (4 * Math.PI * area) / (perimeter * perimeter) : 0,
    bbox,
    fillRatioToBBox: area / (width * height),
    centroid,
    majorAxis: axes.majorAxis,
    minorAxis: axes.minorAxis,
    majorLength: axes.majorLength,
    minorLength: axes.minorLength,
    angle: axes.angle,
    aspect: axes.majorLength / Math.max(axes.minorLength, 1e-6),
    radialMean: radialStats.mean,
    radialStd: radialStats.std,
    ellipseError
  };
}

function detectLinePrimitive(context) {
  if (context.pointCount < 8 || context.majorLength < 12) {
    return null;
  }

  if (context.aspect < 7.5) {
    return null;
  }

  const occupancy = context.area / Math.max(1e-6, context.majorLength * context.minorLength);
  if (occupancy < 0.45 || occupancy > 1.45) {
    return null;
  }

  const halfLength = context.majorLength / 2;
  const strokeWidth = clamp(context.minorLength, 1, 24);
  const cx = context.centroid[0];
  const cy = context.centroid[1];
  const x1 = cx - context.majorAxis[0] * halfLength;
  const y1 = cy - context.majorAxis[1] * halfLength;
  const x2 = cx + context.majorAxis[0] * halfLength;
  const y2 = cy + context.majorAxis[1] * halfLength;

  return buildLineShape(x1, y1, x2, y2, strokeWidth);
}

function forceLinePrimitive(context) {
  const halfLength = context.majorLength / 2;
  const strokeWidth = clamp(context.minorLength, 1, 28);
  const cx = context.centroid[0];
  const cy = context.centroid[1];
  const x1 = cx - context.majorAxis[0] * halfLength;
  const y1 = cy - context.majorAxis[1] * halfLength;
  const x2 = cx + context.majorAxis[0] * halfLength;
  const y2 = cy + context.majorAxis[1] * halfLength;
  return buildLineShape(x1, y1, x2, y2, strokeWidth);
}

function buildLineShape(x1, y1, x2, y2, strokeWidth) {
  return {
    kind: 'stroke',
    shapeType: 'line',
    element: `<line x1="${round(x1)}" y1="${round(y1)}" x2="${round(x2)}" y2="${round(y2)}" stroke="#000" stroke-width="${round(strokeWidth)}" stroke-linecap="round" fill="none"/>`
  };
}

function detectRectPrimitive(context) {
  const corners = reduceToCorners(context.cornerLoop, 0.22);
  if (corners.length !== 4) {
    return null;
  }

  if (!looksLikeRectangle(corners)) {
    return null;
  }

  return {
    kind: 'fill',
    shapeType: 'rect',
    d: loopToPathCommand(corners)
  };
}

function forceRectPrimitive(context) {
  const corners = reduceToCorners(context.cornerLoop, 0.2);
  if (corners.length === 4 && looksLikeRectangle(corners)) {
    return {
      kind: 'fill',
      shapeType: 'rect',
      d: loopToPathCommand(corners)
    };
  }

  const { minX, minY, maxX, maxY } = context.bbox;
  const boxLoop = [
    [minX, minY],
    [maxX, minY],
    [maxX, maxY],
    [minX, maxY]
  ];
  return {
    kind: 'fill',
    shapeType: 'rect',
    d: loopToPathCommand(boxLoop)
  };
}

function detectRoundedRectPrimitive(context) {
  const width = context.bbox.maxX - context.bbox.minX;
  const height = context.bbox.maxY - context.bbox.minY;
  const minSide = Math.min(width, height);
  if (minSide < 6) {
    return null;
  }

  const fillRatio = context.fillRatioToBBox;
  if (fillRatio <= 0.55 || fillRatio >= 0.985) {
    return null;
  }
  if (context.aspect > 3.2) {
    return null;
  }

  const inferredRadius = Math.sqrt(Math.max(0, ((1 - fillRatio) * width * height) / (4 - Math.PI)));
  const maxRadius = Math.max(0, minSide / 2 - 0.5);
  const radius = clamp(inferredRadius, 0, maxRadius);
  if (radius < 1.2 || radius > maxRadius) {
    return null;
  }

  const sideTolerance = Math.max(1, minSide * 0.02);
  let sideHits = 0;
  for (let i = 0; i < context.rawLoop.length; i += 1) {
    const point = context.rawLoop[i];
    const edgeDistance = Math.min(
      Math.abs(point[0] - context.bbox.minX),
      Math.abs(point[0] - context.bbox.maxX),
      Math.abs(point[1] - context.bbox.minY),
      Math.abs(point[1] - context.bbox.maxY)
    );
    if (edgeDistance <= sideTolerance) {
      sideHits += 1;
    }
  }

  if (sideHits / context.rawLoop.length < 0.5) {
    return null;
  }

  if (fillRatio > 0.93 && radius < minSide * 0.08) {
    return null;
  }

  const x0 = context.bbox.minX;
  const y0 = context.bbox.minY;
  const x1 = context.bbox.maxX;
  const y1 = context.bbox.maxY;
  return buildRoundedRectShape(x0, y0, x1, y1, radius);
}

function forceRoundedRectPrimitive(context) {
  const width = context.bbox.maxX - context.bbox.minX;
  const height = context.bbox.maxY - context.bbox.minY;
  const minSide = Math.min(width, height);
  if (minSide <= 1.2) {
    return forceRectPrimitive(context);
  }

  const inferredRadius = Math.sqrt(Math.max(0, ((1 - context.fillRatioToBBox) * width * height) / (4 - Math.PI)));
  const fallbackRadius = minSide * 0.18;
  const radius = clamp(inferredRadius || fallbackRadius, 1, minSide / 2 - 0.5);
  return buildRoundedRectShape(context.bbox.minX, context.bbox.minY, context.bbox.maxX, context.bbox.maxY, radius);
}

function buildRoundedRectShape(x0, y0, x1, y1, radius) {
  const r = round(radius);
  return {
    kind: 'fill',
    shapeType: 'rounded-rect',
    d: [
      `M ${round(x0 + radius)} ${round(y0)}`,
      `L ${round(x1 - radius)} ${round(y0)}`,
      `A ${r} ${r} 0 0 1 ${round(x1)} ${round(y0 + radius)}`,
      `L ${round(x1)} ${round(y1 - radius)}`,
      `A ${r} ${r} 0 0 1 ${round(x1 - radius)} ${round(y1)}`,
      `L ${round(x0 + radius)} ${round(y1)}`,
      `A ${r} ${r} 0 0 1 ${round(x0)} ${round(y1 - radius)}`,
      `L ${round(x0)} ${round(y0 + radius)}`,
      `A ${r} ${r} 0 0 1 ${round(x0 + radius)} ${round(y0)}`,
      'Z'
    ].join(' ')
  };
}

function detectCirclePrimitive(context) {
  if (context.pointCount < 10 || context.aspect > 1.18) {
    return null;
  }
  if (context.circularity < 0.78) {
    return null;
  }

  const radius = (context.majorLength + context.minorLength) / 4;
  if (radius < 1.5) {
    return null;
  }

  const areaRatio = context.area / Math.max(1e-6, Math.PI * radius * radius);
  const radialNoise = context.radialStd / Math.max(context.radialMean, 1e-6);
  if (areaRatio < 0.72 || areaRatio > 1.22 || radialNoise > 0.18 || context.ellipseError > 0.24) {
    return null;
  }

  const cx = context.centroid[0];
  const cy = context.centroid[1];
  return buildCircleShape(cx, cy, radius);
}

function forceCirclePrimitive(context) {
  const radius = Math.max(1, (context.majorLength + context.minorLength) / 4);
  const cx = context.centroid[0];
  const cy = context.centroid[1];
  return buildCircleShape(cx, cy, radius);
}

function buildCircleShape(cx, cy, radius) {
  return {
    kind: 'fill',
    shapeType: 'circle',
    d: [
      `M ${round(cx + radius)} ${round(cy)}`,
      `A ${round(radius)} ${round(radius)} 0 1 0 ${round(cx - radius)} ${round(cy)}`,
      `A ${round(radius)} ${round(radius)} 0 1 0 ${round(cx + radius)} ${round(cy)}`,
      'Z'
    ].join(' ')
  };
}

function detectEllipsePrimitive(context) {
  if (context.pointCount < 10 || context.aspect < 1.18 || context.aspect > 4.8) {
    return null;
  }

  const rx = context.majorLength / 2;
  const ry = context.minorLength / 2;
  if (rx < 2 || ry < 1.2) {
    return null;
  }

  const areaRatio = context.area / Math.max(1e-6, Math.PI * rx * ry);
  if (areaRatio < 0.65 || areaRatio > 1.3 || context.ellipseError > 0.28) {
    return null;
  }

  const cx = context.centroid[0];
  const cy = context.centroid[1];
  const phi = round((context.angle * 180) / Math.PI);
  const startX = cx + context.majorAxis[0] * rx;
  const startY = cy + context.majorAxis[1] * rx;
  const endX = cx - context.majorAxis[0] * rx;
  const endY = cy - context.majorAxis[1] * rx;
  return buildEllipseShape(startX, startY, endX, endY, rx, ry, phi);
}

function forceEllipsePrimitive(context) {
  const rx = Math.max(1, context.majorLength / 2);
  const ry = Math.max(1, context.minorLength / 2);
  const cx = context.centroid[0];
  const cy = context.centroid[1];
  const phi = round((context.angle * 180) / Math.PI);
  const startX = cx + context.majorAxis[0] * rx;
  const startY = cy + context.majorAxis[1] * rx;
  const endX = cx - context.majorAxis[0] * rx;
  const endY = cy - context.majorAxis[1] * rx;
  return buildEllipseShape(startX, startY, endX, endY, rx, ry, phi);
}

function buildEllipseShape(startX, startY, endX, endY, rx, ry, phi) {
  return {
    kind: 'fill',
    shapeType: 'ellipse',
    d: [
      `M ${round(startX)} ${round(startY)}`,
      `A ${round(rx)} ${round(ry)} ${phi} 1 0 ${round(endX)} ${round(endY)}`,
      `A ${round(rx)} ${round(ry)} ${phi} 1 0 ${round(startX)} ${round(startY)}`,
      'Z'
    ].join(' ')
  };
}

function getBoundingBox(points) {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    minX = Math.min(minX, point[0]);
    minY = Math.min(minY, point[1]);
    maxX = Math.max(maxX, point[0]);
    maxY = Math.max(maxY, point[1]);
  }

  return { minX, minY, maxX, maxY };
}

function computePerimeter(points) {
  let length = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    length += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return length;
}

function computeAveragePoint(points) {
  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < points.length; i += 1) {
    sumX += points[i][0];
    sumY += points[i][1];
  }
  return [sumX / points.length, sumY / points.length];
}

function computeRadialStats(points, center) {
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < points.length; i += 1) {
    const dx = points[i][0] - center[0];
    const dy = points[i][1] - center[1];
    const radius = Math.hypot(dx, dy);
    sum += radius;
    sumSq += radius * radius;
  }
  const mean = sum / points.length;
  const variance = Math.max(0, sumSq / points.length - mean * mean);
  return { mean, std: Math.sqrt(variance) };
}

function computePrincipalAxes(points, center) {
  let xx = 0;
  let xy = 0;
  let yy = 0;

  for (let i = 0; i < points.length; i += 1) {
    const dx = points[i][0] - center[0];
    const dy = points[i][1] - center[1];
    xx += dx * dx;
    xy += dx * dy;
    yy += dy * dy;
  }

  xx /= points.length;
  xy /= points.length;
  yy /= points.length;

  const trace = xx + yy;
  const determinant = xx * yy - xy * xy;
  const root = Math.sqrt(Math.max(0, (trace * trace) / 4 - determinant));
  const lambda1 = trace / 2 + root;

  let majorAxis;
  if (Math.abs(xy) > 1e-6) {
    majorAxis = normalizeVector([lambda1 - yy, xy]);
  } else {
    majorAxis = xx >= yy ? [1, 0] : [0, 1];
  }

  const minorAxis = [-majorAxis[1], majorAxis[0]];

  let majorMin = Number.POSITIVE_INFINITY;
  let majorMax = Number.NEGATIVE_INFINITY;
  let minorMin = Number.POSITIVE_INFINITY;
  let minorMax = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < points.length; i += 1) {
    const dx = points[i][0] - center[0];
    const dy = points[i][1] - center[1];
    const majorProjection = dx * majorAxis[0] + dy * majorAxis[1];
    const minorProjection = dx * minorAxis[0] + dy * minorAxis[1];

    majorMin = Math.min(majorMin, majorProjection);
    majorMax = Math.max(majorMax, majorProjection);
    minorMin = Math.min(minorMin, minorProjection);
    minorMax = Math.max(minorMax, minorProjection);
  }

  return {
    majorAxis,
    minorAxis,
    majorLength: Math.max(1e-6, majorMax - majorMin),
    minorLength: Math.max(1e-6, minorMax - minorMin),
    angle: Math.atan2(majorAxis[1], majorAxis[0])
  };
}

function computeEllipseError(points, center, majorAxis, minorAxis, rx, ry) {
  if (rx <= 0 || ry <= 0) {
    return Number.POSITIVE_INFINITY;
  }

  let error = 0;
  for (let i = 0; i < points.length; i += 1) {
    const dx = points[i][0] - center[0];
    const dy = points[i][1] - center[1];
    const u = dx * majorAxis[0] + dy * majorAxis[1];
    const v = dx * minorAxis[0] + dy * minorAxis[1];
    const normalized = (u * u) / (rx * rx) + (v * v) / (ry * ry);
    error += Math.abs(normalized - 1);
  }

  return error / points.length;
}

function reduceToCorners(points, minTurnAmount) {
  if (points.length < 4) {
    return points.slice();
  }

  const corners = [];
  for (let i = 0; i < points.length; i += 1) {
    const prev = points[(i - 1 + points.length) % points.length];
    const current = points[i];
    const next = points[(i + 1) % points.length];

    const v1 = normalizeVector([current[0] - prev[0], current[1] - prev[1]]);
    const v2 = normalizeVector([next[0] - current[0], next[1] - current[1]]);
    const turnAmount = Math.abs(v1[0] * v2[1] - v1[1] * v2[0]);
    if (turnAmount >= minTurnAmount) {
      corners.push(current);
    }
  }

  return dedupeConsecutive(corners);
}

function looksLikeRectangle(points) {
  if (points.length !== 4) {
    return false;
  }

  const edges = [];
  for (let i = 0; i < 4; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % 4];
    const edge = [b[0] - a[0], b[1] - a[1]];
    if (Math.hypot(edge[0], edge[1]) < 1) {
      return false;
    }
    edges.push(normalizeVector(edge));
  }

  for (let i = 0; i < 4; i += 1) {
    const dot = Math.abs(edges[i][0] * edges[(i + 1) % 4][0] + edges[i][1] * edges[(i + 1) % 4][1]);
    if (dot > 0.35) {
      return false;
    }
  }

  const oppositeDotA = Math.abs(edges[0][0] * edges[2][0] + edges[0][1] * edges[2][1]);
  const oppositeDotB = Math.abs(edges[1][0] * edges[3][0] + edges[1][1] * edges[3][1]);
  return oppositeDotA > 0.9 && oppositeDotB > 0.9;
}

function normalizeVector(vector) {
  const length = Math.hypot(vector[0], vector[1]);
  if (length <= 1e-8) {
    return [1, 0];
  }
  return [vector[0] / length, vector[1] / length];
}

function buildSvg(pathItems, width, height, options = {}) {
  const interactive = Boolean(options.interactive);
  const mode = options.mode || 'trace';
  const selectedPathId = options.selectedPathId ?? null;
  const activeItems = pathItems.filter((item) => item.shape);
  if (!activeItems.length) {
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"></svg>`;
  }

  const fillItems = [];
  const strokeItems = [];
  for (let i = 0; i < activeItems.length; i += 1) {
    const item = activeItems[i];
    if (item.shape.kind === 'fill') {
      fillItems.push(item);
    } else if (item.shape.kind === 'stroke') {
      strokeItems.push(item);
    }
  }

  const parts = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`
  ];

  if (fillItems.length) {
    const fillPath = fillItems.map((item) => item.shape.d).join(' ');
    parts.push(`  <path d="${fillPath}" fill="#000" fill-rule="evenodd"/>`);
  }

  for (let i = 0; i < strokeItems.length; i += 1) {
    const item = strokeItems[i];
    if (!interactive) {
      parts.push(`  ${item.shape.element}`);
      continue;
    }

    const selected = mode === 'path' && item.id === selectedPathId;
    const className = `trace-shape trace-stroke${selected ? ' is-selected' : ''}`;
    const element = injectAttrsIntoShapeElement(item.shape.element, `class="${className}" data-path-id="${item.id}"`);
    parts.push(`  ${element}`);
  }

  if (interactive && mode === 'path') {
    for (let i = 0; i < fillItems.length; i += 1) {
      const item = fillItems[i];
      const selected = item.id === selectedPathId;
      parts.push(`  <path class="trace-hit${selected ? ' is-selected' : ''}" data-path-id="${item.id}" d="${item.shape.d}" fill="transparent" stroke="none" pointer-events="all"/>`);
      if (selected) {
        parts.push(`  <path class="trace-selection" d="${item.shape.d}" fill="none" stroke="#ef4444" stroke-width="1.4" vector-effect="non-scaling-stroke" pointer-events="none"/>`);
        if (item.module === 'custom' && Array.isArray(item.customPoints) && item.customPoints.length >= 3) {
          parts.push(`  <path class="trace-node-guides" d="${loopToPathCommand(item.customPoints)}" fill="none" stroke="#0ea5e9" stroke-width="1" stroke-dasharray="3 3" vector-effect="non-scaling-stroke" pointer-events="none"/>`);
          for (let nodeIndex = 0; nodeIndex < item.customPoints.length; nodeIndex += 1) {
            const node = item.customPoints[nodeIndex];
            parts.push(`  <circle class="trace-node" data-path-id="${item.id}" data-node-index="${nodeIndex}" cx="${round(node[0])}" cy="${round(node[1])}" r="1.8" fill="#ffffff" stroke="#0ea5e9" stroke-width="1.1" vector-effect="non-scaling-stroke"/>`);
          }
        }
      }
    }
  }

  parts.push(`</svg>`);
  return parts.join('\n');
}

function injectAttrsIntoShapeElement(element, attrs) {
  return element.replace(/^<([a-zA-Z]+)/, `<$1 ${attrs}`);
}

function renderSvgPreview(svgText, resetView = false) {
  const safe = sanitizeSvgForPreview(svgText);
  elements.previewStage.innerHTML = safe || '<div class="placeholder">No SVG content.</div>';
  if (resetView) {
    resetPreviewViewport();
  }
}

function sanitizeSvgForPreview(text) {
  try {
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    const root = doc.documentElement;
    if (root.nodeName.toLowerCase() !== 'svg') {
      return '';
    }
    root.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    return root.outerHTML;
  } catch {
    return '';
  }
}

function resetPreviewViewport() {
  state.viewport.scale = 1;
  state.viewport.x = 0;
  state.viewport.y = 0;
  applyPreviewTransform();
}

function zoomAt(factor, clientX, clientY) {
  if (!state.svgText) {
    return;
  }

  const wrapRect = elements.previewWrap.getBoundingClientRect();
  const px = clientX ?? wrapRect.left + wrapRect.width / 2;
  const py = clientY ?? wrapRect.top + wrapRect.height / 2;

  const oldScale = state.viewport.scale;
  const nextScale = clamp(oldScale * factor, state.viewport.minScale, state.viewport.maxScale);

  if (nextScale === oldScale) {
    return;
  }

  const offsetX = px - wrapRect.left;
  const offsetY = py - wrapRect.top;
  const worldX = (offsetX - state.viewport.x) / oldScale;
  const worldY = (offsetY - state.viewport.y) / oldScale;

  state.viewport.scale = nextScale;
  state.viewport.x = offsetX - worldX * nextScale;
  state.viewport.y = offsetY - worldY * nextScale;
  applyPreviewTransform();
}

function applyPreviewTransform() {
  const { scale, x, y } = state.viewport;
  elements.previewViewport.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
}

function clientToWorldPoint(clientX, clientY) {
  if (!state.sourceSize.width || !state.sourceSize.height || state.viewport.scale <= 0) {
    return null;
  }

  const svg = elements.previewStage.querySelector('svg');
  if (!svg) {
    return null;
  }

  // Preferred mapping: convert from screen space directly into SVG user space.
  try {
    if (typeof svg.createSVGPoint === 'function') {
      const ctm = svg.getScreenCTM();
      if (ctm) {
        const point = svg.createSVGPoint();
        point.x = clientX;
        point.y = clientY;
        const mapped = point.matrixTransform(ctm.inverse());
        if (Number.isFinite(mapped.x) && Number.isFinite(mapped.y)) {
          return [mapped.x, mapped.y];
        }
      }
    }
  } catch {
    // Fall through to manual mapping.
  }

  // Fallback mapping for engines where getScreenCTM is unreliable.
  const rect = svg.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }

  const viewBox = svg.viewBox?.baseVal;
  const vbX = Number.isFinite(viewBox?.x) ? viewBox.x : 0;
  const vbY = Number.isFinite(viewBox?.y) ? viewBox.y : 0;
  const vbWidth = Number.isFinite(viewBox?.width) && viewBox.width > 0 ? viewBox.width : state.sourceSize.width;
  const vbHeight = Number.isFinite(viewBox?.height) && viewBox.height > 0 ? viewBox.height : state.sourceSize.height;
  const scale = Math.min(rect.width / vbWidth, rect.height / vbHeight);
  if (!Number.isFinite(scale) || scale <= 0) {
    return null;
  }

  const renderedWidth = vbWidth * scale;
  const renderedHeight = vbHeight * scale;
  const offsetX = (rect.width - renderedWidth) / 2;
  const offsetY = (rect.height - renderedHeight) / 2;
  const localX = clientX - rect.left - offsetX;
  const localY = clientY - rect.top - offsetY;
  return [vbX + localX / scale, vbY + localY / scale];
}

function stopNodeDrag(pointerId) {
  state.nodeDrag.active = false;
  state.nodeDrag.pointerId = null;
  state.nodeDrag.pathId = null;
  state.nodeDrag.nodeIndex = -1;
  try {
    elements.previewWrap.releasePointerCapture(pointerId);
  } catch {
    // no-op
  }
}

async function copySvgToClipboard() {
  if (!state.svgText) {
    return;
  }

  try {
    await navigator.clipboard.writeText(state.svgText);
    setStatus('SVG copied to clipboard.');
  } catch (error) {
    console.error(error);
    setStatus('Clipboard write failed in this browser context.', true);
  }
}

function downloadSvgFile() {
  if (!state.svgText) {
    return;
  }

  const blob = new Blob([state.svgText], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${state.imageName || 'trace'}.svg`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setStatus('SVG downloaded.');
}

function setOutputState(hasOutput) {
  elements.copyBtn.disabled = !hasOutput;
  elements.downloadBtn.disabled = !hasOutput;
  elements.resetViewBtn.disabled = !hasOutput;
}

function setStatus(message, isError = false) {
  elements.status.textContent = message;
  elements.status.classList.toggle('error', isError);
}

function drawPlaceholder() {
  state.pathItems = [];
  state.selectedPathId = null;
  state.hoveredPathId = null;
  closePathContextMenu();
  if (state.nodeDrag.active && state.nodeDrag.pointerId != null) {
    stopNodeDrag(state.nodeDrag.pointerId);
  } else {
    state.nodeDrag.active = false;
    state.nodeDrag.pointerId = null;
    state.nodeDrag.pathId = null;
    state.nodeDrag.nodeIndex = -1;
  }
  state.sourceSize.width = elements.sourceCanvas.width;
  state.sourceSize.height = elements.sourceCanvas.height;
  sourceCtx.fillStyle = '#ffffff';
  sourceCtx.fillRect(0, 0, elements.sourceCanvas.width, elements.sourceCanvas.height);
  sourceCtx.fillStyle = '#64748b';
  sourceCtx.font = '16px -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Arial, sans-serif';
  sourceCtx.textAlign = 'center';
  sourceCtx.textBaseline = 'middle';
  sourceCtx.fillText('Drop an image to begin tracing.', elements.sourceCanvas.width / 2, elements.sourceCanvas.height / 2);
  elements.onionImage.removeAttribute('src');
  applyOnionSkinState();
  renderPathList();
  setStatus('Waiting for image input.');
}

function clonePoints(points) {
  if (!Array.isArray(points)) {
    return null;
  }
  const cloned = [];
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    if (!Array.isArray(point) || point.length < 2) {
      continue;
    }
    cloned.push([Number(point[0]), Number(point[1])]);
  }
  return cloned.length ? cloned : null;
}

function cloneNodeModes(modes) {
  if (!Array.isArray(modes)) {
    return null;
  }
  const cloned = [];
  for (let i = 0; i < modes.length; i += 1) {
    cloned.push(Boolean(modes[i]));
  }
  return cloned.length ? cloned : null;
}

function round(value) {
  return Number(value.toFixed(2));
}

function arePointsEqual(a, b) {
  return a && b && a[0] === b[0] && a[1] === b[1];
}

function pointKey(point) {
  return `${point[0]},${point[1]}`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeWheelDelta(event) {
  if (event.deltaMode === 1) {
    return event.deltaY * 18;
  }
  if (event.deltaMode === 2) {
    return event.deltaY * 120;
  }
  return event.deltaY;
}
