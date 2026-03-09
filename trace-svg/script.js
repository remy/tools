const elements = {
  sourceDropTarget: document.getElementById('sourceDropTarget'),
  copyBtn: document.getElementById('copyBtn'),
  downloadBtn: document.getElementById('downloadBtn'),
  svgSize: document.getElementById('svgSize'),
  sourceCanvas: document.getElementById('sourceCanvas'),
  threshold: document.getElementById('threshold'),
  thresholdValue: document.getElementById('thresholdValue'),
  detail: document.getElementById('detail'),
  detailValue: document.getElementById('detailValue'),
  simplify: document.getElementById('simplify'),
  simplifyValue: document.getElementById('simplifyValue'),
  smooth: document.getElementById('smooth'),
  smoothValue: document.getElementById('smoothValue'),
  edgeCleanup: document.getElementById('edgeCleanup'),
  edgeCleanupValue: document.getElementById('edgeCleanupValue'),
  smartPassEnabled: document.getElementById('smartPassEnabled'),
  smartLineTolerance: document.getElementById('smartLineTolerance'),
  smartLineToleranceValue: document.getElementById('smartLineToleranceValue'),
  smartLineWindow: document.getElementById('smartLineWindow'),
  smartLineWindowValue: document.getElementById('smartLineWindowValue'),
  minArea: document.getElementById('minArea'),
  minAreaValue: document.getElementById('minAreaValue'),
  invert: document.getElementById('invert'),
  colorCount: document.getElementById('colorCount'),
  colorCountValue: document.getElementById('colorCountValue'),
  paletteSwatches: document.getElementById('paletteSwatches'),
  palettePicker: document.getElementById('palettePicker'),
  status: document.getElementById('status'),
  toastRoot: document.getElementById('toastRoot'),
  previewWrap: document.getElementById('previewWrap'),
  previewViewport: document.getElementById('previewViewport'),
  previewStage: document.getElementById('previewStage'),
  onionImage: document.getElementById('onionImage'),
  onionOpacity: document.getElementById('onionOpacity'),
  undoBtn: document.getElementById('undoBtn'),
  resetViewBtn: document.getElementById('resetViewBtn'),
  pathEditor: document.getElementById('pathEditor'),
  pathEditorWaiting: document.getElementById('pathEditorWaiting'),
  pathEditorContent: document.getElementById('pathEditorContent'),
  pathOverrideControls: document.getElementById('pathOverrideControls'),
  pathList: document.getElementById('pathList'),
  pathModule: document.getElementById('pathModule'),
  pathFillMode: document.getElementById('pathFillMode'),
  pathNodeEdit: document.getElementById('pathNodeEdit'),
  pathNodeSmoothMode: document.getElementById('pathNodeSmoothMode'),
  pathNodeSmoothInfo: document.getElementById('pathNodeSmoothInfo'),
  pathSimplifyEnabled: document.getElementById('pathSimplifyEnabled'),
  pathSimplify: document.getElementById('pathSimplify'),
  pathSimplifyValue: document.getElementById('pathSimplifyValue'),
  pathSmoothEnabled: document.getElementById('pathSmoothEnabled'),
  pathSmooth: document.getElementById('pathSmooth'),
  pathSmoothValue: document.getElementById('pathSmoothValue'),
  pathSmartEnabled: document.getElementById('pathSmartEnabled'),
  pathSmartPass: document.getElementById('pathSmartPass'),
  pathSmartTolerance: document.getElementById('pathSmartTolerance'),
  pathSmartToleranceValue: document.getElementById('pathSmartToleranceValue'),
  pathColor: document.getElementById('pathColor'),
  pathColorValue: document.getElementById('pathColorValue'),
  completeSmoothNodesBtn: document.getElementById('completeSmoothNodesBtn'),
  clearSmoothNodesBtn: document.getElementById('clearSmoothNodesBtn'),
  simplifyPathNodesBtn: document.getElementById('simplifyPathNodesBtn'),
  resetPathBtn: document.getElementById('resetPathBtn'),
  deletePathBtn: document.getElementById('deletePathBtn'),
  pathContextMenu: document.getElementById('pathContextMenu'),
  addNodeBtn: document.getElementById('addNodeBtn'),
  deleteNodeBtn: document.getElementById('deleteNodeBtn'),
  toggleCurveBtn: document.getElementById('toggleCurveBtn')
};

const state = {
  image: null,
  imageName: 'trace',
  sourceSize: { width: 0, height: 0 },
  svgRawText: '',
  svgText: '',
  loops: 0,
  pageDragDepth: 0,
  mode: 'path',
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
    pointerId: null,
    button: -1,
    suppressContextMenu: false,
    moved: false,
    startX: 0,
    startY: 0,
    baseX: 0,
    baseY: 0
  },
  listDrag: {
    active: false,
    pathId: null
  },
  nodeDrag: {
    active: false,
    pointerId: null,
    pathId: null,
    nodeIndex: -1,
    undoRecorded: false
  },
  nodeSmooth: {
    active: false,
    pathId: null,
    indices: []
  },
  contextMenu: {
    open: false,
    pathId: null,
    nodeIndex: -1,
    worldPoint: null
  },
  toastSeq: 0,
  palette: {
    latest: [],
    dominantIndex: -1,
    overrides: new Array(16).fill(null),
    pickerIndex: -1
  },
  svgOptimize: {
    raw: '',
    text: '',
    promise: null,
    timer: null
  },
  undo: {
    stack: [],
    max: 100,
    isRestoring: false
  },
  interaction: {
    spacePan: false
  },
  globals: {
    threshold: 128,
    detail: 720,
    simplify: 0,
    smooth: 0,
    edgeCleanup: 1,
    smartPassEnabled: true,
    smartLineTolerance: 0.9,
    smartLineWindow: 5,
    minArea: 24,
    invert: false,
    colorCount: 6
  }
};

const SHAPE_DETECTORS = [
  detectLinePrimitive,
  detectRectPrimitive,
  detectRoundedRectPrimitive,
  detectCirclePrimitive,
  detectEllipsePrimitive
];
const NODE_HANDLE_BASE_RADIUS = 1.8;
const NODE_HANDLE_MAX_DIAMETER_PX = 24;

const sourceCtx = elements.sourceCanvas.getContext('2d', { willReadFrequently: true });

bindUi();
drawPlaceholder();
refreshLabels();
syncGlobalStateFromControls();
applyOnionSkinState();
refreshPathEditor();
renderPaletteSwatches();
updateUndoButtonState();

function bindUi() {
  bindFileDropTarget(elements.sourceDropTarget);
  bindPageDropTarget();

  elements.copyBtn.addEventListener('click', copySvgToClipboard);
  elements.downloadBtn.addEventListener('click', downloadSvgFile);
  elements.undoBtn?.addEventListener('click', undoLastChange);

  const controls = [
    elements.threshold,
    elements.detail,
    elements.simplify,
    elements.smooth,
    elements.edgeCleanup,
    elements.smartPassEnabled,
    elements.smartLineTolerance,
    elements.smartLineWindow,
    elements.minArea,
    elements.invert,
    elements.colorCount
  ];

  controls.forEach((control) => {
    control.addEventListener('input', () => {
      if (state.image) {
        recordUndoStep();
      }
      refreshLabels();
      syncGlobalStateFromControls();
      if (!state.image) {
        renderPaletteSwatches();
        return;
      }

      if (control === elements.detail) {
        refreshSvgOutputOnly();
        return;
      }

      traceAndRender();
    });
  });

  elements.paletteSwatches?.addEventListener('click', (event) => {
    const swatch = event.target.closest('.palette-swatch[data-palette-index]');
    if (!swatch) {
      return;
    }
    const index = Number(swatch.getAttribute('data-palette-index'));
    if (!Number.isInteger(index) || index < 0 || index >= state.globals.colorCount) {
      return;
    }

    state.palette.pickerIndex = index;
    const current = getPaletteColorHex(index);
    setColorInputValue(elements.palettePicker, normalizeHexColor(current || '#000000'));
    openPalettePickerAtSwatch(swatch);
  });

  elements.paletteSwatches?.addEventListener('contextmenu', (event) => {
    const swatch = event.target.closest('.palette-swatch[data-palette-index]');
    if (!swatch) {
      return;
    }
    event.preventDefault();
    const index = Number(swatch.getAttribute('data-palette-index'));
    if (!Number.isInteger(index) || index < 0 || index >= state.palette.overrides.length) {
      return;
    }
    if (!state.palette.overrides[index]) {
      return;
    }
    recordUndoStep();
    state.palette.overrides[index] = null;
    renderPaletteSwatches();
    applyPaletteOverridesToPaths();
    setStatus(`Reset palette color ${index + 1} to auto.`);
  });

  const applyPalettePickerColor = () => {
    const index = state.palette.pickerIndex;
    if (!Number.isInteger(index) || index < 0 || index >= state.palette.overrides.length) {
      return;
    }
    const nextColor = normalizeHexColor(elements.palettePicker.value);
    if (state.palette.overrides[index] === nextColor) {
      return;
    }
    recordUndoStep();
    state.palette.overrides[index] = nextColor;
    renderPaletteSwatches();
    applyPaletteOverridesToPaths();
  };
  elements.palettePicker?.addEventListener('input', applyPalettePickerColor);
  elements.palettePicker?.addEventListener('change', () => {
    applyPalettePickerColor();
    closePalettePicker();
  });

  elements.pathModule.addEventListener('change', () => {
    const item = getSelectedPathItem();
    if (!item) {
      return;
    }
    if (item.module === elements.pathModule.value) {
      return;
    }
    recordUndoStep();
    item.module = elements.pathModule.value;
    if (item.module !== 'path') {
      item.customEditEnabled = false;
      deactivateNodeSmoothMode(item.id);
    }
    renderFromPathItems();
    refreshPathEditor();
  });

  elements.pathFillMode.addEventListener('change', () => {
    const item = getSelectedPathItem();
    if (!item) {
      return;
    }
    const nextMode = normalizeFillMode(elements.pathFillMode.value);
    if (normalizeFillMode(item.fillMode) === nextMode) {
      return;
    }
    recordUndoStep();
    item.fillMode = nextMode;
    renderFromPathItems();
    refreshPathEditor();
  });

  elements.pathNodeEdit.addEventListener('change', () => {
    const item = getSelectedPathItem();
    if (!item) {
      return;
    }

    const enabled = elements.pathNodeEdit.checked;
    if (Boolean(item.customEditEnabled) === enabled) {
      return;
    }
    recordUndoStep();
    if (enabled && item.module !== 'path') {
      item.module = 'path';
    }
    item.customEditEnabled = enabled;
    if (enabled) {
      resetCustomAnchorsFromCurrentPath(item);
      item.nodeSimplifyLevel = 0;
    } else {
      deactivateNodeSmoothMode(item.id);
    }
    renderFromPathItems();
    refreshPathEditor();
  });

  elements.pathNodeSmoothMode.addEventListener('change', () => {
    const item = getSelectedPathItem();
    const enabled = elements.pathNodeSmoothMode.checked;
    if (!enabled) {
      deactivateNodeSmoothMode(item?.id ?? null);
      renderFromPathItems();
      refreshPathEditor();
      return;
    }
    if (!item) {
      elements.pathNodeSmoothMode.checked = false;
      setStatus('Select a path before enabling smooth nodes mode.');
      refreshPathEditor();
      return;
    }
    if (item.module !== 'path') {
      item.module = 'path';
    }
    if (!item.customEditEnabled) {
      item.customEditEnabled = true;
      resetCustomAnchorsFromCurrentPath(item);
      item.nodeSimplifyLevel = 0;
    }
    activateNodeSmoothMode(item.id);
    renderFromPathItems();
    refreshPathEditor();
  });

  elements.pathSimplifyEnabled.addEventListener('change', () => {
    const item = getSelectedPathItem();
    if (!item) {
      return;
    }
    const nextChecked = elements.pathSimplifyEnabled.checked;
    if (Boolean(item.overrideSimplifyEnabled) === nextChecked) {
      return;
    }
    recordUndoStep();
    item.overrideSimplifyEnabled = nextChecked;
    renderFromPathItems();
    refreshPathEditor();
  });

  elements.pathSimplify.addEventListener('input', () => {
    const item = getSelectedPathItem();
    if (!item) {
      return;
    }
    if (Number(item.overrideSimplify) === Number(elements.pathSimplify.value)) {
      return;
    }
    recordUndoStep();
    item.overrideSimplify = Number(elements.pathSimplify.value);
    refreshPathControlLabels();
    renderFromPathItems();
  });

  elements.pathSmoothEnabled.addEventListener('change', () => {
    const item = getSelectedPathItem();
    if (!item) {
      return;
    }
    const nextChecked = elements.pathSmoothEnabled.checked;
    if (Boolean(item.overrideSmoothEnabled) === nextChecked) {
      return;
    }
    recordUndoStep();
    item.overrideSmoothEnabled = nextChecked;
    renderFromPathItems();
    refreshPathEditor();
  });

  elements.pathSmooth.addEventListener('input', () => {
    const item = getSelectedPathItem();
    if (!item) {
      return;
    }
    if (Number(item.overrideSmooth) === Number(elements.pathSmooth.value)) {
      return;
    }
    recordUndoStep();
    item.overrideSmooth = Number(elements.pathSmooth.value);
    refreshPathControlLabels();
    renderFromPathItems();
  });

  elements.pathSmartEnabled.addEventListener('change', () => {
    const item = getSelectedPathItem();
    if (!item) {
      return;
    }
    const nextChecked = elements.pathSmartEnabled.checked;
    if (Boolean(item.overrideSmartEnabled) === nextChecked) {
      return;
    }
    recordUndoStep();
    item.overrideSmartEnabled = nextChecked;
    renderFromPathItems();
    refreshPathEditor();
  });

  elements.pathSmartPass.addEventListener('change', () => {
    const item = getSelectedPathItem();
    if (!item) {
      return;
    }
    const nextChecked = elements.pathSmartPass.checked;
    if (Boolean(item.overrideSmartPass) === nextChecked) {
      return;
    }
    recordUndoStep();
    item.overrideSmartPass = nextChecked;
    renderFromPathItems();
    refreshPathEditor();
  });

  elements.pathSmartTolerance.addEventListener('input', () => {
    const item = getSelectedPathItem();
    if (!item) {
      return;
    }
    if (Number(item.overrideSmartTolerance) === Number(elements.pathSmartTolerance.value)) {
      return;
    }
    recordUndoStep();
    item.overrideSmartTolerance = Number(elements.pathSmartTolerance.value);
    refreshPathControlLabels();
    renderFromPathItems();
  });

  const applyPathColorChange = () => {
    const item = getSelectedPathItem();
    if (!item) {
      return;
    }
    const nextColor = normalizePathColor(elements.pathColor.value);
    if (normalizePathColor(item.color || '#000000') === nextColor && item.colorLocked) {
      return;
    }
    recordUndoStep();
    item.color = nextColor;
    item.colorLocked = true;
    refreshPathControlLabels();
    renderFromPathItems();
  };
  elements.pathColor.addEventListener('input', applyPathColorChange);
  elements.pathColor.addEventListener('change', applyPathColorChange);

  elements.completeSmoothNodesBtn.addEventListener('click', () => {
    const item = getSelectedPathItem();
    if (!item) {
      return;
    }
    handleSmoothSelectedNodes(item);
  });

  elements.clearSmoothNodesBtn.addEventListener('click', () => {
    const item = getSelectedPathItem();
    const pathId = item?.id ?? state.nodeSmooth.pathId;
    if (pathId == null) {
      return;
    }
    clearNodeSmoothSelection(pathId);
    renderFromPathItems();
    refreshPathEditor();
  });

  elements.simplifyPathNodesBtn.addEventListener('click', () => {
    const item = getSelectedPathItem();
    if (!item) {
      return;
    }
    handleSimplifyPathNodes(item);
  });

  elements.resetPathBtn.addEventListener('click', () => {
    const item = getSelectedPathItem();
    if (!item) {
      return;
    }

    recordUndoStep();
    item.module = 'auto';
    item.overrideSimplifyEnabled = false;
    item.overrideSmoothEnabled = false;
    item.overrideSimplify = state.globals.simplify;
    item.overrideSmooth = state.globals.smooth;
    item.overrideSmartEnabled = false;
    item.overrideSmartPass = state.globals.smartPassEnabled;
    item.overrideSmartTolerance = state.globals.smartLineTolerance;
    item.customEditEnabled = false;
    item.customPoints = null;
    item.customNodeModes = null;
    item.nodeSimplifyLevel = 0;
    item.colorLocked = false;
    item.fillMode = 'auto';
    deactivateNodeSmoothMode(item.id);
    renderFromPathItems();
    refreshPathEditor();
  });

  elements.deletePathBtn.addEventListener('click', () => {
    const item = getSelectedPathItem();
    if (!item) {
      return;
    }
    recordUndoStep();
    const deletedLabel = item.id + 1;
    removePathItemById(item.id);
    setStatus(`Deleted path ${deletedLabel}.`);
  });

  elements.addNodeBtn.addEventListener('click', handleAddNodeAction);
  elements.deleteNodeBtn.addEventListener('click', handleDeleteNodeAction);
  elements.toggleCurveBtn.addEventListener('click', handleToggleCurveAction);

  elements.pathList.addEventListener('dragover', (event) => {
    if (!state.listDrag.active) {
      return;
    }
    const targetItem = event.target.closest('.path-item[data-path-id]');
    if (targetItem) {
      return;
    }
    event.preventDefault();
    clearPathListDropIndicators();
  });

  elements.pathList.addEventListener('drop', (event) => {
    if (!state.listDrag.active) {
      return;
    }
    const targetItem = event.target.closest('.path-item[data-path-id]');
    if (targetItem) {
      return;
    }
    event.preventDefault();
    const dragText = event.dataTransfer?.getData('text/plain');
    const draggedPathId = Number.isInteger(state.listDrag.pathId)
      ? state.listDrag.pathId
      : Number(dragText);
    const fromIndex = state.pathItems.findIndex((item) => item.id === draggedPathId);
    if (fromIndex >= 0 && fromIndex !== state.pathItems.length - 1) {
      recordUndoStep();
      const [moved] = state.pathItems.splice(fromIndex, 1);
      state.pathItems.push(moved);
      syncLayerOrderFromArray();
      renderFromPathItems();
      refreshPathEditor();
    }
    clearPathListDragState();
  });

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
    const isUndo = (event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'z';
    if (isUndo) {
      event.preventDefault();
      undoLastChange();
      return;
    }
    if (event.code === 'Space' && !isEditableEventTarget(event.target)) {
      if (!state.interaction.spacePan) {
        state.interaction.spacePan = true;
        elements.previewWrap.classList.add('is-space-pan');
      }
      event.preventDefault();
      return;
    }
    if (event.key === 'Escape') {
      closePalettePicker();
      closePathContextMenu();
    }
  });

  window.addEventListener('keyup', (event) => {
    if (event.code !== 'Space') {
      return;
    }
    if (!state.interaction.spacePan) {
      return;
    }
    state.interaction.spacePan = false;
    elements.previewWrap.classList.remove('is-space-pan');
  });

  window.addEventListener('blur', () => {
    state.interaction.spacePan = false;
    elements.previewWrap.classList.remove('is-space-pan');
    closePalettePicker();
    closePathContextMenu();
  });

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

    closePathContextMenu();

    if (shouldStartPanFromPointer(event)) {
      startPreviewPan(event);
      event.preventDefault();
      return;
    }

    if (event.button !== 0) {
      return;
    }

    const nodeTarget = event.target.closest('.trace-node[data-path-id][data-node-index]');
    if (nodeTarget) {
      const pathId = Number(nodeTarget.getAttribute('data-path-id'));
      const nodeIndex = Number(nodeTarget.getAttribute('data-node-index'));
      const item = getPathItemById(pathId);
      const validNode = Boolean(item && item.customEditEnabled && Array.isArray(item.customPoints) && nodeIndex >= 0 && nodeIndex < item.customPoints.length);
      if (validNode) {
        state.selectedPathId = pathId;
        if (state.nodeSmooth.active) {
          syncNodeSmoothPathSelection(pathId);
          toggleNodeSmoothSelection(pathId, nodeIndex);
          setHoveredPathId(pathId);
          renderFromPathItems();
          refreshPathEditor();
          event.preventDefault();
          return;
        }
        state.nodeDrag.active = true;
        state.nodeDrag.pointerId = event.pointerId;
        state.nodeDrag.pathId = pathId;
        state.nodeDrag.nodeIndex = nodeIndex;
        state.nodeDrag.undoRecorded = false;
        setNodeDragVisualState(true);
        setHoveredPathId(pathId);
        renderFromPathItems();
        refreshPathEditor();
        elements.previewWrap.setPointerCapture(event.pointerId);
        event.preventDefault();
        return;
      }
    }

    const shapeTarget = event.target.closest('[data-path-id]');
    if (shapeTarget) {
      const pathId = Number(shapeTarget.getAttribute('data-path-id'));
      if (!Number.isNaN(pathId)) {
        state.selectedPathId = pathId;
        syncNodeSmoothPathSelection(pathId);
        setHoveredPathId(pathId);
        renderFromPathItems();
        refreshPathEditor();
        event.preventDefault();
        return;
      }
    }

    startPreviewPan(event);
  });

  elements.previewWrap.addEventListener('pointermove', (event) => {
    if (state.nodeDrag.active && event.pointerId === state.nodeDrag.pointerId) {
      const item = getPathItemById(state.nodeDrag.pathId);
      if (!item || !item.customEditEnabled || !Array.isArray(item.customPoints)) {
        stopNodeDrag(event.pointerId);
        return;
      }

      const point = clientToWorldPoint(event.clientX, event.clientY);
      if (!point) {
        return;
      }
      const clampedX = clamp(point[0], 0, state.sourceSize.width);
      const clampedY = clamp(point[1], 0, state.sourceSize.height);
      const current = item.customPoints[state.nodeDrag.nodeIndex];
      if (!state.nodeDrag.undoRecorded && (!current || current[0] !== clampedX || current[1] !== clampedY)) {
        recordUndoStep();
        state.nodeDrag.undoRecorded = true;
      }
      item.customPoints[state.nodeDrag.nodeIndex] = [clampedX, clampedY];
      renderFromPathItems();
      return;
    }

    if (!state.drag.active || event.pointerId !== state.drag.pointerId) {
      return;
    }

    if (!state.drag.moved) {
      const movedDistance = Math.hypot(event.clientX - state.drag.startX, event.clientY - state.drag.startY);
      if (movedDistance >= 2) {
        state.drag.moved = true;
      }
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

    if (state.drag.active && event.pointerId === state.drag.pointerId) {
      stopPreviewPan(event.pointerId);
    }
  });

  elements.previewWrap.addEventListener('pointercancel', (event) => {
    if (state.nodeDrag.active && event.pointerId === state.nodeDrag.pointerId) {
      stopNodeDrag(event.pointerId);
      return;
    }

    if (state.drag.active && event.pointerId === state.drag.pointerId) {
      stopPreviewPan(event.pointerId);
    }
  });

  elements.previewStage.addEventListener('click', (event) => {
    const target = event.target.closest('[data-path-id]');
    if (!target) {
      return;
    }

    const id = Number(target.getAttribute('data-path-id'));
    if (Number.isNaN(id)) {
      return;
    }

    state.selectedPathId = id;
    syncNodeSmoothPathSelection(id);
    renderFromPathItems();
    refreshPathEditor();
  });

  elements.previewStage.addEventListener('pointermove', (event) => {
    if (state.drag.active || state.nodeDrag.active) {
      return;
    }
    const target = event.target.closest('[data-path-id]');
    if (!target) {
      setHoveredPathId(null);
      return;
    }
    const id = Number(target.getAttribute('data-path-id'));
    if (Number.isNaN(id)) {
      setHoveredPathId(null);
      return;
    }
    setHoveredPathId(id);
  });

  elements.previewStage.addEventListener('pointerleave', () => {
    if (state.drag.active || state.nodeDrag.active) {
      return;
    }
    setHoveredPathId(null);
  });

  elements.previewWrap.addEventListener('contextmenu', (event) => {
    if (state.drag.suppressContextMenu) {
      event.preventDefault();
      state.drag.suppressContextMenu = false;
      return;
    }
    if (!event.defaultPrevented) {
      event.preventDefault();
    }
  });

  elements.previewStage.addEventListener('contextmenu', (event) => {
    if (state.drag.suppressContextMenu) {
      event.preventDefault();
      state.drag.suppressContextMenu = false;
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
    if (!item || !item.customEditEnabled) {
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
    syncNodeSmoothPathSelection(pathId);
    renderFromPathItems();
    refreshPathEditor();
    openPathContextMenu(pathId, Number.isNaN(nodeIndex) ? -1 : nodeIndex, worldPoint, event.clientX, event.clientY);
  });
}

function isEditableEventTarget(target) {
  if (!(target instanceof Element)) {
    return false;
  }
  return Boolean(target.closest('input, textarea, select, button, [contenteditable=""], [contenteditable="true"]'));
}

function shouldStartPanFromPointer(event) {
  if (!(event?.target instanceof Element)) {
    return false;
  }
  if (event.button === 1) {
    return true;
  }
  if (event.button === 0) {
    return state.interaction.spacePan;
  }
  if (event.button !== 2) {
    return false;
  }

  if (state.interaction.spacePan) {
    return true;
  }

  const nodeTarget = event.target.closest('.trace-node[data-path-id][data-node-index]');
  if (nodeTarget) {
    return false;
  }

  const pathTarget = event.target.closest('[data-path-id]');
  if (!pathTarget) {
    return true;
  }

  const pathId = Number(pathTarget.getAttribute('data-path-id'));
  const pathItem = Number.isInteger(pathId) ? getPathItemById(pathId) : null;
  return !Boolean(pathItem?.customEditEnabled);
}

function startPreviewPan(event) {
  try {
    elements.previewWrap.setPointerCapture(event.pointerId);
  } catch {
    // no-op
  }
  elements.previewWrap.classList.add('is-panning');
  state.drag.active = true;
  state.drag.pointerId = event.pointerId;
  state.drag.button = event.button;
  state.drag.suppressContextMenu = event.button === 2;
  state.drag.moved = false;
  state.drag.startX = event.clientX;
  state.drag.startY = event.clientY;
  state.drag.baseX = state.viewport.x;
  state.drag.baseY = state.viewport.y;
}

function stopPreviewPan(pointerId) {
  const shouldSuppressContextMenu = state.drag.button === 2 && state.drag.moved;
  try {
    elements.previewWrap.releasePointerCapture(pointerId);
  } catch {
    // no-op
  }
  elements.previewWrap.classList.remove('is-panning');
  state.drag.active = false;
  state.drag.pointerId = null;
  state.drag.button = -1;
  state.drag.suppressContextMenu = shouldSuppressContextMenu;
  state.drag.moved = false;
  state.drag.startX = 0;
  state.drag.startY = 0;
  state.drag.baseX = state.viewport.x;
  state.drag.baseY = state.viewport.y;
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
  const edgeCleanupPasses = Math.round(Number(elements.edgeCleanup.value));
  elements.edgeCleanupValue.textContent = `${edgeCleanupPasses} pass${edgeCleanupPasses === 1 ? '' : 'es'}`;
  elements.smartLineToleranceValue.textContent = `${Number(elements.smartLineTolerance.value).toFixed(1)} px`;
  elements.smartLineWindowValue.textContent = `${Math.round(Number(elements.smartLineWindow.value))} pts`;
  elements.smartLineTolerance.disabled = !elements.smartPassEnabled.checked;
  elements.smartLineWindow.disabled = !elements.smartPassEnabled.checked;
  elements.smartLineToleranceValue.style.opacity = elements.smartPassEnabled.checked ? '1' : '0.6';
  elements.smartLineWindowValue.style.opacity = elements.smartPassEnabled.checked ? '1' : '0.6';
  elements.minAreaValue.textContent = elements.minArea.value;
  elements.colorCountValue.textContent = elements.colorCount.value;
  refreshPathControlLabels();
  renderPaletteSwatches();
}

function refreshPathControlLabels() {
  elements.pathSimplifyValue.textContent = Number(elements.pathSimplify.value).toFixed(1);
  elements.pathSmoothValue.textContent = elements.pathSmooth.value;
  elements.pathSmartToleranceValue.textContent = `${Number(elements.pathSmartTolerance.value).toFixed(1)} px`;
  elements.pathColorValue.textContent = normalizePathColor(elements.pathColor.value);
}

function updatePathModuleAutoLabel(shapeType = '') {
  const autoOption = elements.pathModule?.querySelector('option[value="auto"]');
  if (!autoOption) {
    return;
  }
  if (!shapeType) {
    autoOption.textContent = 'Auto (detector)';
    return;
  }
  autoOption.textContent = `Auto (detector -> ${shapeType})`;
}

function normalizeFillMode(value) {
  if (value === 'solid' || value === 'cutout') {
    return value;
  }
  return 'auto';
}

function syncGlobalStateFromControls() {
  state.globals.threshold = Number(elements.threshold.value);
  state.globals.detail = Number(elements.detail.value);
  state.globals.simplify = Number(elements.simplify.value);
  state.globals.smooth = Number(elements.smooth.value);
  state.globals.edgeCleanup = clamp(Math.round(Number(elements.edgeCleanup.value) || 0), 0, 4);
  state.globals.smartPassEnabled = elements.smartPassEnabled.checked;
  state.globals.smartLineTolerance = Number(elements.smartLineTolerance.value);
  state.globals.smartLineWindow = Number(elements.smartLineWindow.value);
  state.globals.minArea = Number(elements.minArea.value);
  state.globals.invert = elements.invert.checked;
  state.globals.colorCount = Number(elements.colorCount.value);
}

function getRequestedOutputSize() {
  if (state.image) {
    return fitSize(state.image.width, state.image.height, state.globals.detail);
  }
  if (state.sourceSize.width > 0 && state.sourceSize.height > 0) {
    return { width: state.sourceSize.width, height: state.sourceSize.height };
  }
  return { width: 0, height: 0 };
}

function refreshSvgOutputOnly() {
  if (!state.sourceSize.width || !state.sourceSize.height) {
    return;
  }

  const hasOutput = state.pathItems.some((item) => item.shape);
  if (!hasOutput) {
    return;
  }

  const outputSize = getRequestedOutputSize();
  const rawSvg = buildSvg(state.pathItems, state.sourceSize.width, state.sourceSize.height, {
    outputWidth: outputSize.width,
    outputHeight: outputSize.height
  });
  setRawSvgText(rawSvg);
}

function renderPaletteSwatches() {
  if (!elements.paletteSwatches) {
    return;
  }

  const count = clamp(Math.round(state.globals.colorCount || 1), 1, 16);
  elements.paletteSwatches.innerHTML = '';

  for (let i = 0; i < count; i += 1) {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'palette-swatch';
    swatch.setAttribute('data-palette-index', String(i));

    const color = getPaletteColorHex(i);
    swatch.style.setProperty('--swatch', color);
    swatch.setAttribute('title', `Palette ${i + 1}: ${color}${state.palette.overrides[i] ? ' (locked)' : ''}`);

    if (state.palette.overrides[i]) {
      swatch.classList.add('is-locked');
    }
    if (state.palette.dominantIndex === i && state.palette.latest.length > 1) {
      swatch.classList.add('is-dominant');
    }

    const text = document.createElement('span');
    text.className = 'palette-swatch-index';
    text.textContent = String(i + 1);
    swatch.append(text);
    elements.paletteSwatches.append(swatch);
  }
}

function getPaletteColorHex(index) {
  const override = state.palette.overrides[index];
  if (override) {
    return normalizeHexColor(override);
  }

  const latest = Array.isArray(state.palette.latest) ? state.palette.latest[index] : null;
  if (latest) {
    return normalizeHexColor(latest);
  }

  const grayscale = index <= 0
    ? 0
    : clamp(Math.round((index / Math.max(1, state.globals.colorCount - 1)) * 255), 0, 255);
  const hex = grayscale.toString(16).padStart(2, '0');
  return `#${hex}${hex}${hex}`;
}

function applyPaletteOverridesToPaths() {
  if (!state.pathItems.length) {
    return;
  }

  let changed = 0;
  for (let i = 0; i < state.pathItems.length; i += 1) {
    const item = state.pathItems[i];
    if (item.colorLocked) {
      continue;
    }
    if (!Number.isInteger(item.paletteIndex) || item.paletteIndex < 0) {
      continue;
    }
    const nextColor = getPaletteColorHex(item.paletteIndex);
    if (!nextColor) {
      continue;
    }
    const normalized = normalizeHexColor(nextColor);
    if (normalizeHexColor(normalizePathColor(item.color || '#000000')) !== normalized) {
      item.color = normalized;
      changed += 1;
    }
  }

  if (!changed) {
    return;
  }

  renderFromPathItems();
  refreshPathEditor();
}

function openPalettePickerAtSwatch(swatch) {
  if (!elements.palettePicker || !swatch) {
    return;
  }
  try {
    elements.palettePicker.click();
  } catch {
    // no-op
  }
}

function closePalettePicker() {
  if (!elements.palettePicker) {
    return;
  }
  try {
    elements.palettePicker.blur();
  } catch {
    // no-op
  }
}

function setMode(mode) {
  state.mode = 'path';
  if (state.pathItems.length && state.selectedPathId == null) {
    state.selectedPathId = state.pathItems[0].id;
  }

  if (state.image) {
    renderFromPathItems();
  } else {
    syncHoveredPathHighlight();
  }
  refreshPathEditor();
}

function updateUndoButtonState() {
  if (!elements.undoBtn) {
    return;
  }
  elements.undoBtn.disabled = state.undo.stack.length <= 0;
}

function recordUndoStep() {
  if (state.undo.isRestoring) {
    return;
  }
  const snapshot = captureUndoSnapshot();
  state.undo.stack.push(snapshot);
  if (state.undo.stack.length > state.undo.max) {
    state.undo.stack.shift();
  }
  updateUndoButtonState();
}

function undoLastChange() {
  if (!state.undo.stack.length) {
    return;
  }
  const snapshot = state.undo.stack.pop();
  state.undo.isRestoring = true;
  try {
    restoreUndoSnapshot(snapshot);
  } finally {
    state.undo.isRestoring = false;
    updateUndoButtonState();
  }
}

function captureUndoSnapshot() {
  return {
    image: state.image,
    imageName: state.imageName,
    sourceSize: {
      width: state.sourceSize.width,
      height: state.sourceSize.height
    },
    mode: state.mode,
    selectedPathId: state.selectedPathId,
    hoveredPathId: state.hoveredPathId,
    pathItems: state.pathItems.map((item) => clonePathItemForUndo(item)),
    nodeSmooth: {
      active: Boolean(state.nodeSmooth.active),
      pathId: state.nodeSmooth.pathId,
      indices: Array.isArray(state.nodeSmooth.indices) ? [...state.nodeSmooth.indices] : []
    },
    globals: {
      threshold: Number(state.globals.threshold),
      detail: Number(state.globals.detail),
      simplify: Number(state.globals.simplify),
      smooth: Number(state.globals.smooth),
      edgeCleanup: Number(state.globals.edgeCleanup),
      smartPassEnabled: Boolean(state.globals.smartPassEnabled),
      smartLineTolerance: Number(state.globals.smartLineTolerance),
      smartLineWindow: Number(state.globals.smartLineWindow),
      minArea: Number(state.globals.minArea),
      invert: Boolean(state.globals.invert),
      colorCount: Number(state.globals.colorCount)
    },
    palette: {
      latest: Array.isArray(state.palette.latest) ? [...state.palette.latest] : [],
      dominantIndex: Number.isInteger(state.palette.dominantIndex) ? state.palette.dominantIndex : -1,
      overrides: Array.isArray(state.palette.overrides) ? [...state.palette.overrides] : new Array(16).fill(null),
      pickerIndex: Number.isInteger(state.palette.pickerIndex) ? state.palette.pickerIndex : -1
    }
  };
}

function clonePathItemForUndo(item) {
  return {
    id: item.id,
    key: item.key,
    layerOrder: item.layerOrder,
    rawLoop: clonePoints(item.rawLoop),
    area: Number(item.area) || 0,
    centroid: Array.isArray(item.centroid) ? [Number(item.centroid[0]), Number(item.centroid[1])] : null,
    bbox: item.bbox
      ? {
        minX: Number(item.bbox.minX),
        minY: Number(item.bbox.minY),
        maxX: Number(item.bbox.maxX),
        maxY: Number(item.bbox.maxY)
      }
      : null,
    module: item.module,
    overrideSimplifyEnabled: Boolean(item.overrideSimplifyEnabled),
    overrideSimplify: Number(item.overrideSimplify),
    overrideSmoothEnabled: Boolean(item.overrideSmoothEnabled),
    overrideSmooth: Number(item.overrideSmooth),
    overrideSmartEnabled: Boolean(item.overrideSmartEnabled),
    overrideSmartPass: Boolean(item.overrideSmartPass),
    overrideSmartTolerance: Number(item.overrideSmartTolerance),
    fillMode: normalizeFillMode(item.fillMode),
    customEditEnabled: Boolean(item.customEditEnabled),
    customPoints: clonePoints(item.customPoints),
    customNodeModes: cloneNodeModes(item.customNodeModes),
    nodeSimplifyLevel: Math.max(0, Number(item.nodeSimplifyLevel) || 0),
    paletteIndex: Number.isInteger(item.paletteIndex) ? item.paletteIndex : -1,
    color: normalizePathColor(item.color || '#000000'),
    colorLocked: Boolean(item.colorLocked),
    shape: null,
    shapeType: item.shapeType || 'path',
    pathAnalysis: null
  };
}

function restoreUndoSnapshot(snapshot) {
  if (!snapshot) {
    return;
  }

  state.image = snapshot.image || null;
  state.imageName = snapshot.imageName || 'trace';
  state.sourceSize.width = Math.max(0, Number(snapshot.sourceSize?.width) || 0);
  state.sourceSize.height = Math.max(0, Number(snapshot.sourceSize?.height) || 0);
  state.selectedPathId = snapshot.selectedPathId ?? null;
  state.hoveredPathId = snapshot.hoveredPathId ?? null;
  state.mode = 'path';
  state.pathItems = Array.isArray(snapshot.pathItems)
    ? snapshot.pathItems.map((item) => clonePathItemForUndo(item))
    : [];
  state.nodeSmooth.active = Boolean(snapshot.nodeSmooth?.active);
  state.nodeSmooth.pathId = Number.isInteger(snapshot.nodeSmooth?.pathId) ? snapshot.nodeSmooth.pathId : null;
  state.nodeSmooth.indices = Array.isArray(snapshot.nodeSmooth?.indices) ? [...snapshot.nodeSmooth.indices] : [];
  closePathContextMenu();
  if (state.nodeDrag.active && state.nodeDrag.pointerId != null) {
    stopNodeDrag(state.nodeDrag.pointerId);
  } else {
    clearNodeDragState();
  }

  state.globals.threshold = Number.isFinite(snapshot.globals?.threshold) ? Number(snapshot.globals.threshold) : 128;
  state.globals.detail = Number.isFinite(snapshot.globals?.detail) ? Number(snapshot.globals.detail) : 720;
  state.globals.simplify = Number.isFinite(snapshot.globals?.simplify) ? Number(snapshot.globals.simplify) : 0;
  state.globals.smooth = Number.isFinite(snapshot.globals?.smooth) ? Number(snapshot.globals.smooth) : 0;
  const rawEdgeCleanup = Number(snapshot.globals?.edgeCleanup);
  state.globals.edgeCleanup = clamp(Math.round(Number.isFinite(rawEdgeCleanup) ? rawEdgeCleanup : 1), 0, 4);
  state.globals.smartPassEnabled = Boolean(snapshot.globals?.smartPassEnabled);
  state.globals.smartLineTolerance = Number(snapshot.globals?.smartLineTolerance) || 0.9;
  state.globals.smartLineWindow = Number(snapshot.globals?.smartLineWindow) || 5;
  state.globals.minArea = Number(snapshot.globals?.minArea) || 24;
  state.globals.invert = Boolean(snapshot.globals?.invert);
  state.globals.colorCount = clamp(Math.round(Number(snapshot.globals?.colorCount) || 6), 1, 16);

  state.palette.latest = Array.isArray(snapshot.palette?.latest) ? [...snapshot.palette.latest] : [];
  state.palette.dominantIndex = Number.isInteger(snapshot.palette?.dominantIndex) ? snapshot.palette.dominantIndex : -1;
  state.palette.overrides = Array.isArray(snapshot.palette?.overrides)
    ? [...snapshot.palette.overrides]
    : new Array(16).fill(null);
  if (state.palette.overrides.length < 16) {
    state.palette.overrides = state.palette.overrides.concat(new Array(16 - state.palette.overrides.length).fill(null));
  } else if (state.palette.overrides.length > 16) {
    state.palette.overrides = state.palette.overrides.slice(0, 16);
  }
  state.palette.pickerIndex = Number.isInteger(snapshot.palette?.pickerIndex) ? snapshot.palette.pickerIndex : -1;

  elements.threshold.value = String(state.globals.threshold);
  elements.detail.value = String(state.globals.detail);
  elements.simplify.value = String(state.globals.simplify);
  elements.smooth.value = String(state.globals.smooth);
  elements.edgeCleanup.value = String(state.globals.edgeCleanup);
  elements.smartPassEnabled.checked = Boolean(state.globals.smartPassEnabled);
  elements.smartLineTolerance.value = String(state.globals.smartLineTolerance);
  elements.smartLineWindow.value = String(state.globals.smartLineWindow);
  elements.minArea.value = String(state.globals.minArea);
  elements.invert.checked = Boolean(state.globals.invert);
  elements.colorCount.value = String(state.globals.colorCount);
  refreshLabels();
  renderPaletteSwatches();

  if (!state.image || !state.sourceSize.width || !state.sourceSize.height) {
    drawPlaceholder();
    setMode(state.mode);
    setOutputState(false);
    return;
  }

  elements.sourceCanvas.width = state.sourceSize.width;
  elements.sourceCanvas.height = state.sourceSize.height;
  sourceCtx.clearRect(0, 0, state.sourceSize.width, state.sourceSize.height);
  sourceCtx.drawImage(state.image, 0, 0, state.sourceSize.width, state.sourceSize.height);
  updateOnionSourceFromCanvas();
  setMode(state.mode);
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

function syncLayerOrderFromArray() {
  for (let i = 0; i < state.pathItems.length; i += 1) {
    state.pathItems[i].layerOrder = i;
  }
}

function clearPathListDropIndicators() {
  const nodes = elements.pathList.querySelectorAll('.path-item.drop-before, .path-item.drop-after');
  for (let i = 0; i < nodes.length; i += 1) {
    nodes[i].classList.remove('drop-before', 'drop-after');
  }
}

function clearPathListDragState() {
  state.listDrag.active = false;
  state.listDrag.pathId = null;
  elements.pathList.classList.remove('is-dragging');
  clearPathListDropIndicators();
  const draggingNodes = elements.pathList.querySelectorAll('.path-item.is-dragging');
  for (let i = 0; i < draggingNodes.length; i += 1) {
    draggingNodes[i].classList.remove('is-dragging');
  }
}

function reorderPathItems(draggedPathId, targetPathId, insertAfter) {
  const fromIndex = state.pathItems.findIndex((item) => item.id === draggedPathId);
  const targetIndex = state.pathItems.findIndex((item) => item.id === targetPathId);
  if (fromIndex < 0 || targetIndex < 0) {
    return false;
  }

  let nextIndex = targetIndex + (insertAfter ? 1 : 0);
  if (fromIndex < nextIndex) {
    nextIndex -= 1;
  }
  if (nextIndex === fromIndex) {
    return false;
  }

  recordUndoStep();
  const [moved] = state.pathItems.splice(fromIndex, 1);
  const bounded = clamp(nextIndex, 0, state.pathItems.length);
  state.pathItems.splice(bounded, 0, moved);
  syncLayerOrderFromArray();
  renderFromPathItems();
  refreshPathEditor();
  return true;
}

function removePathItemById(pathId) {
  const index = state.pathItems.findIndex((item) => item.id === pathId);
  if (index < 0) {
    return;
  }

  state.pathItems.splice(index, 1);
  for (let i = 0; i < state.pathItems.length; i += 1) {
    state.pathItems[i].id = i;
  }
  syncLayerOrderFromArray();

  if (!state.pathItems.length) {
    state.selectedPathId = null;
    state.hoveredPathId = null;
  } else {
    const nextIndex = Math.min(index, state.pathItems.length - 1);
    state.selectedPathId = state.pathItems[nextIndex].id;
    if (!state.pathItems.some((item) => item.id === state.hoveredPathId)) {
      state.hoveredPathId = null;
    }
  }

  if (state.contextMenu.open && state.contextMenu.pathId === pathId) {
    closePathContextMenu();
  }

  if (state.nodeDrag.pathId === pathId) {
    if (state.nodeDrag.active && state.nodeDrag.pointerId != null) {
      stopNodeDrag(state.nodeDrag.pointerId);
    } else {
      clearNodeDragState();
    }
  }
  if (state.nodeSmooth.pathId === pathId) {
    deactivateNodeSmoothMode(pathId);
  } else if (state.nodeSmooth.active && Number.isInteger(state.nodeSmooth.pathId) && state.nodeSmooth.pathId > pathId) {
    state.nodeSmooth.pathId -= 1;
  }

  renderFromPathItems();
  refreshPathEditor();
}

function refreshPathEditor() {
  const hasSource = Boolean(state.image);
  elements.pathEditorWaiting?.classList.toggle('is-hidden', hasSource);
  elements.pathEditorContent?.classList.toggle('is-hidden', !hasSource);

  const item = getSelectedPathItem();
  const disabled = !hasSource || !item;
  elements.pathModule.disabled = disabled;
  elements.pathFillMode.disabled = disabled;
  elements.pathNodeEdit.disabled = disabled;
  elements.pathNodeSmoothMode.disabled = disabled;
  elements.pathSimplifyEnabled.disabled = disabled;
  elements.pathSimplify.disabled = disabled || !elements.pathSimplifyEnabled.checked;
  elements.pathSmoothEnabled.disabled = disabled;
  elements.pathSmooth.disabled = disabled || !elements.pathSmoothEnabled.checked;
  elements.pathSmartEnabled.disabled = disabled;
  elements.pathSmartPass.disabled = disabled || !elements.pathSmartEnabled.checked;
  elements.pathSmartTolerance.disabled = disabled || !elements.pathSmartEnabled.checked || !elements.pathSmartPass.checked;
  elements.pathColor.disabled = disabled;
  elements.completeSmoothNodesBtn.disabled = disabled;
  elements.clearSmoothNodesBtn.disabled = disabled;
  elements.simplifyPathNodesBtn.disabled = disabled;
  elements.resetPathBtn.disabled = disabled;
  elements.deletePathBtn.disabled = disabled;
  elements.pathOverrideControls?.classList.toggle('is-hidden', disabled);

  if (!hasSource || !item) {
    updatePathModuleAutoLabel('');
    elements.pathModule.value = 'auto';
    elements.pathFillMode.value = 'auto';
    elements.pathNodeEdit.checked = false;
    elements.pathNodeSmoothMode.checked = false;
    elements.pathSimplifyEnabled.checked = false;
    elements.pathSmoothEnabled.checked = false;
    elements.pathSmartEnabled.checked = false;
    elements.pathSmartPass.checked = state.globals.smartPassEnabled;
    elements.pathSmartTolerance.value = String(state.globals.smartLineTolerance);
    elements.pathSimplify.value = String(state.globals.simplify);
    elements.pathSmooth.value = String(state.globals.smooth);
    setColorInputValue(elements.pathColor, '#000000');
    elements.pathNodeSmoothInfo.textContent = 'Smooth mode off.';
    elements.completeSmoothNodesBtn.disabled = true;
    elements.clearSmoothNodesBtn.disabled = true;
    elements.simplifyPathNodesBtn.disabled = true;
    refreshPathControlLabels();
    return;
  }

  const moduleValue = item.module === 'custom' ? 'path' : item.module;
  const supportsSmartControls = moduleValue === 'auto' || moduleValue === 'path';
  updatePathModuleAutoLabel(item.shapeType || 'path');
  if (item.module === 'custom') {
    item.module = 'path';
    item.customEditEnabled = true;
  }
  if (moduleValue !== 'path') {
    item.customEditEnabled = false;
    deactivateNodeSmoothMode(item.id);
  } else if (state.nodeSmooth.active) {
    if (!item.customEditEnabled) {
      deactivateNodeSmoothMode(item.id);
    } else if (state.nodeSmooth.pathId !== item.id) {
      state.nodeSmooth.pathId = item.id;
      state.nodeSmooth.indices = [];
    }
  }
  elements.pathModule.value = moduleValue;
  elements.pathFillMode.value = normalizeFillMode(item.fillMode);
  elements.pathFillMode.disabled = !item.shape || item.shape.kind !== 'fill';
  elements.pathNodeEdit.checked = Boolean(item.customEditEnabled);
  elements.pathNodeEdit.disabled = moduleValue !== 'path';
  elements.pathNodeSmoothMode.checked = isNodeSmoothModeActiveForPath(item.id);
  elements.pathNodeSmoothMode.disabled = moduleValue !== 'path';
  elements.pathSimplifyEnabled.checked = item.overrideSimplifyEnabled;
  elements.pathSmoothEnabled.checked = item.overrideSmoothEnabled;
  elements.pathSmartEnabled.checked = Boolean(item.overrideSmartEnabled);
  elements.pathSmartPass.checked = typeof item.overrideSmartPass === 'boolean'
    ? item.overrideSmartPass
    : state.globals.smartPassEnabled;
  elements.pathSmartTolerance.value = String(
    Number.isFinite(item.overrideSmartTolerance)
      ? item.overrideSmartTolerance
      : state.globals.smartLineTolerance
  );
  elements.pathSimplify.value = String(item.overrideSimplify);
  elements.pathSmooth.value = String(item.overrideSmooth);
  setColorInputValue(elements.pathColor, normalizePathColor(item.color || '#000000'));
  elements.pathSimplify.disabled = !item.overrideSimplifyEnabled;
  elements.pathSmooth.disabled = !item.overrideSmoothEnabled;
  elements.pathSmartEnabled.disabled = !supportsSmartControls;
  elements.pathSmartPass.disabled = !supportsSmartControls || !item.overrideSmartEnabled;
  elements.pathSmartTolerance.disabled = !supportsSmartControls || !item.overrideSmartEnabled || !elements.pathSmartPass.checked;
  const nodeEditActive = Boolean(item.customEditEnabled && moduleValue === 'path');
  elements.pathOverrideControls?.classList.toggle('is-hidden', nodeEditActive);

  const smoothCount = getNodeSmoothSelectionCountForPath(item.id, item.customPoints?.length || 0);
  const smoothModeActive = isNodeSmoothModeActiveForPath(item.id);
  if (!smoothModeActive) {
    elements.pathNodeSmoothInfo.textContent = 'Smooth mode off.';
  } else if (smoothCount <= 0) {
    elements.pathNodeSmoothInfo.textContent = 'Smooth mode on. Click nodes to select a continuous run.';
  } else {
    elements.pathNodeSmoothInfo.textContent = `${smoothCount} node${smoothCount === 1 ? '' : 's'} selected for smoothing.`;
  }
  elements.completeSmoothNodesBtn.disabled = !smoothModeActive || smoothCount < 3;
  elements.clearSmoothNodesBtn.disabled = !smoothModeActive || smoothCount <= 0;
  elements.simplifyPathNodesBtn.disabled = moduleValue !== 'path';
  refreshPathControlLabels();
}

function activateNodeSmoothMode(pathId) {
  if (!Number.isInteger(pathId) || pathId < 0) {
    return;
  }
  state.nodeSmooth.active = true;
  state.nodeSmooth.pathId = pathId;
  state.nodeSmooth.indices = [];
}

function deactivateNodeSmoothMode(pathId = null) {
  if (pathId != null && state.nodeSmooth.pathId !== pathId) {
    return;
  }
  state.nodeSmooth.active = false;
  state.nodeSmooth.pathId = null;
  state.nodeSmooth.indices = [];
}

function clearNodeSmoothSelection(pathId) {
  if (!state.nodeSmooth.active) {
    return;
  }
  if (pathId != null && state.nodeSmooth.pathId !== pathId) {
    return;
  }
  state.nodeSmooth.indices = [];
}

function isNodeSmoothModeActiveForPath(pathId) {
  return Boolean(state.nodeSmooth.active && Number.isInteger(pathId) && state.nodeSmooth.pathId === pathId);
}

function syncNodeSmoothPathSelection(pathId) {
  if (!state.nodeSmooth.active || !Number.isInteger(pathId) || pathId < 0) {
    return;
  }
  if (state.nodeSmooth.pathId === pathId) {
    return;
  }
  state.nodeSmooth.pathId = pathId;
  state.nodeSmooth.indices = [];
}

function getNodeSmoothSelectionIndices(pathId, pointCount = null) {
  if (!isNodeSmoothModeActiveForPath(pathId)) {
    return [];
  }
  const limit = Number.isFinite(pointCount) ? Math.max(0, Math.floor(pointCount)) : Number.POSITIVE_INFINITY;
  const unique = new Set();
  for (let i = 0; i < state.nodeSmooth.indices.length; i += 1) {
    const index = Number(state.nodeSmooth.indices[i]);
    if (!Number.isInteger(index) || index < 0 || index >= limit) {
      continue;
    }
    unique.add(index);
  }
  return Array.from(unique).sort((a, b) => a - b);
}

function getNodeSmoothSelectionCountForPath(pathId, pointCount = null) {
  return getNodeSmoothSelectionIndices(pathId, pointCount).length;
}

function toggleNodeSmoothSelection(pathId, nodeIndex) {
  if (!isNodeSmoothModeActiveForPath(pathId)) {
    return;
  }
  if (!Number.isInteger(nodeIndex) || nodeIndex < 0) {
    return;
  }

  const current = getNodeSmoothSelectionIndices(pathId);
  const found = current.indexOf(nodeIndex);
  if (found >= 0) {
    current.splice(found, 1);
  } else {
    current.push(nodeIndex);
    current.sort((a, b) => a - b);
  }
  state.nodeSmooth.indices = current;
}

function setHoveredPathId(pathId) {
  const nextId = pathId;
  if (state.hoveredPathId === nextId) {
    return;
  }
  state.hoveredPathId = nextId;
  syncHoveredPathHighlight();
}

function syncHoveredPathHighlight() {
  const hoveredId = state.hoveredPathId;
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
  if (!item || !item.customEditEnabled || !Array.isArray(item.customPoints) || item.customPoints.length < 3) {
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
  if (!item || !item.customEditEnabled || !Array.isArray(item.customPoints) || item.customPoints.length < 3) {
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
  recordUndoStep();
  item.customPoints.splice(insertion.insertIndex, 0, insertion.point);
  modes.splice(insertion.insertIndex, 0, true);
  item.customNodeModes = modes;
  item.nodeSimplifyLevel = 0;
  clearNodeSmoothSelection(item.id);
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
  recordUndoStep();
  item.customPoints.splice(targetNodeIndex, 1);
  modes.splice(targetNodeIndex, 1);
  item.customNodeModes = modes;
  item.nodeSimplifyLevel = 0;
  clearNodeSmoothSelection(item.id);
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
  recordUndoStep();
  modes[targetNodeIndex] = !modes[targetNodeIndex];
  item.customNodeModes = modes;
  closePathContextMenu();
  renderFromPathItems();
  refreshPathEditor();
}

function handleSimplifyPathNodes(item) {
  if (item.module !== 'path') {
    setStatus('Node simplification is only available for Complex path module.');
    refreshPathEditor();
    return;
  }

  if (!item.customEditEnabled) {
    item.customEditEnabled = true;
    resetCustomAnchorsFromCurrentPath(item);
  }

  if (!Array.isArray(item.customPoints) || item.customPoints.length < 4) {
    setStatus('Selected path does not have enough nodes to simplify.');
    renderFromPathItems();
    refreshPathEditor();
    return;
  }

  const beforeCount = item.customPoints.length;
  const level = Math.max(0, Number(item.nodeSimplifyLevel) || 0) + 1;
  const bbox = getBoundingBox(item.customPoints);
  const diagonal = Math.hypot(bbox.maxX - bbox.minX, bbox.maxY - bbox.minY);
  let epsilon = Math.max(0.06, diagonal * 0.0002 * Math.pow(1.55, level - 1));
  let result = simplifyCustomPointsForLevel(item.customPoints, item.customNodeModes, epsilon);
  let attempts = 0;
  while (result && result.removed <= 0 && attempts < 3) {
    epsilon *= 1.7;
    result = simplifyCustomPointsForLevel(item.customPoints, item.customNodeModes, epsilon);
    attempts += 1;
  }

  if (!result || !Array.isArray(result.points) || result.points.length < 3) {
    setStatus('Unable to simplify nodes for this path.');
    refreshPathEditor();
    return;
  }

  if (result.removed <= 0) {
    setStatus(`No removable nodes found at simplify step ${level}.`);
    refreshPathEditor();
    return;
  }

  recordUndoStep();
  item.nodeSimplifyLevel = level;
  item.customPoints = result.points;
  item.customNodeModes = result.modes;
  clearNodeSmoothSelection(item.id);

  if (state.contextMenu.open && state.contextMenu.pathId === item.id) {
    closePathContextMenu();
  }
  if (state.nodeDrag.pathId === item.id) {
    if (state.nodeDrag.active && state.nodeDrag.pointerId != null) {
      stopNodeDrag(state.nodeDrag.pointerId);
    } else {
      clearNodeDragState();
    }
  }

  renderFromPathItems();
  refreshPathEditor();
  setStatus(`Simplified path ${item.id + 1}: removed ${result.removed} node${result.removed === 1 ? '' : 's'} (${beforeCount} → ${item.customPoints.length}).`);
}

function handleSmoothSelectedNodes(item) {
  if (item.module !== 'path') {
    setStatus('Node smoothing is only available for Complex path module.');
    refreshPathEditor();
    return;
  }
  if (!item.customEditEnabled || !Array.isArray(item.customPoints) || item.customPoints.length < 4) {
    setStatus('Enable Node Edit Mode first, then select nodes to smooth.');
    refreshPathEditor();
    return;
  }
  if (!isNodeSmoothModeActiveForPath(item.id)) {
    setStatus('Enable Smooth Nodes Mode first.');
    refreshPathEditor();
    return;
  }

  const selected = getNodeSmoothSelectionIndices(item.id, item.customPoints.length);
  if (selected.length < 3) {
    setStatus('Select at least 3 connected nodes to smooth.');
    refreshPathEditor();
    return;
  }
  if (selected.length >= item.customPoints.length - 1) {
    setStatus('Leave at least two unselected nodes around the run before smoothing.');
    refreshPathEditor();
    return;
  }

  const run = resolveSingleCircularSelectionRun(selected, item.customPoints.length);
  if (!run) {
    setStatus('Smooth selection must be one continuous run of nodes.');
    refreshPathEditor();
    return;
  }

  recordUndoStep();
  const beforeCount = item.customPoints.length;
  const result = smoothSelectedNodeRun(item.customPoints, item.customNodeModes, run.start, run.end);
  if (!result || !Array.isArray(result.points) || result.points.length < 3) {
    setStatus('Unable to smooth the selected node run.');
    refreshPathEditor();
    return;
  }

  item.customPoints = result.points;
  item.customNodeModes = result.modes;
  item.nodeSimplifyLevel = 0;
  clearNodeSmoothSelection(item.id);
  closePathContextMenu();

  renderFromPathItems();
  refreshPathEditor();
  const removed = Math.max(0, beforeCount - item.customPoints.length);
  setStatus(`Smoothed ${selected.length} selected node${selected.length === 1 ? '' : 's'}${removed > 0 ? ` (removed ${removed})` : ''}.`);
}

function resolveSingleCircularSelectionRun(sortedIndices, totalPoints) {
  if (!Array.isArray(sortedIndices) || sortedIndices.length < 2 || totalPoints < 3) {
    return null;
  }

  const indices = Array.from(new Set(sortedIndices))
    .filter((index) => Number.isInteger(index) && index >= 0 && index < totalPoints)
    .sort((a, b) => a - b);
  if (indices.length < 2 || indices.length >= totalPoints) {
    return null;
  }

  let largeGapCount = 0;
  let largeGapIndex = -1;
  for (let i = 0; i < indices.length; i += 1) {
    const current = indices[i];
    const next = indices[(i + 1) % indices.length];
    const gap = (next - current + totalPoints) % totalPoints;
    if (gap > 1) {
      largeGapCount += 1;
      largeGapIndex = i;
      if (largeGapCount > 1) {
        return null;
      }
    }
  }

  if (largeGapCount !== 1) {
    return null;
  }

  const start = indices[(largeGapIndex + 1) % indices.length];
  const end = indices[largeGapIndex];
  return {
    start,
    end,
    count: indices.length
  };
}

function buildCircularIndexRun(start, end, total) {
  const output = [];
  if (!Number.isInteger(start) || !Number.isInteger(end) || total < 1) {
    return output;
  }
  let index = start;
  let guard = 0;
  while (guard <= total) {
    output.push(index);
    if (index === end) {
      break;
    }
    index = (index + 1) % total;
    guard += 1;
  }
  return output;
}

function smoothSelectedNodeRun(points, modes, start, end) {
  if (!Array.isArray(points) || points.length < 4) {
    return null;
  }
  const count = points.length;
  const runIndices = buildCircularIndexRun(start, end, count);
  if (runIndices.length < 2 || runIndices.length >= count) {
    return null;
  }
  const nodeModes = normalizeCustomNodeModes(points, modes);
  const prevIndex = (start - 1 + count) % count;
  const nextIndex = (end + 1) % count;
  if (runIndices.includes(prevIndex) || runIndices.includes(nextIndex) || prevIndex === nextIndex) {
    return null;
  }

  const segment = [points[prevIndex]];
  for (let i = 0; i < runIndices.length; i += 1) {
    const point = points[runIndices[i]];
    segment.push([point[0], point[1]]);
  }
  segment.push(points[nextIndex]);

  const smoothingPasses = clamp(Math.round(Math.sqrt(runIndices.length) * 0.72), 1, 4);
  let smoothed = smoothOpenPolyline(segment, smoothingPasses);
  const bbox = getBoundingBox(segment);
  const diagonal = Math.hypot(bbox.maxX - bbox.minX, bbox.maxY - bbox.minY);
  const targetInternal = clamp(Math.round(Math.sqrt(runIndices.length) * 0.95), 1, 12);
  const allowedDeviation = Math.max(0.32, diagonal * 0.014);
  let epsilon = Math.max(0.08, diagonal * 0.0028);
  let best = simplifyOpenPolyline(smoothed, epsilon);
  let bestScore = Number.POSITIVE_INFINITY;

  for (let attempts = 0; attempts < 18; attempts += 1) {
    const candidate = simplifyOpenPolyline(smoothed, epsilon);
    if (!Array.isArray(candidate) || candidate.length < 3) {
      epsilon *= 1.35;
      continue;
    }
    const candidateInternal = Math.max(1, candidate.length - 2);
    const deviation = computePolylineMaxDeviation(smoothed, candidate);
    const score = candidateInternal * 8 + deviation * 2.5;
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
    if (candidateInternal <= targetInternal && deviation <= allowedDeviation) {
      best = candidate;
      break;
    }
    epsilon *= 1.33;
  }
  let simplified = best;
  const simplifiedInternal = Math.max(1, simplified.length - 2);
  if (simplifiedInternal > targetInternal) {
    simplified = limitPolylineInternalPoints(simplified, targetInternal);
  }

  let replacement = dedupeConsecutive(simplified.slice(1, -1));
  if (!replacement.length) {
    replacement = [midpoint(segment[0], segment[segment.length - 1])];
  }
  const replacementModes = new Array(replacement.length).fill(true);

  if (start <= end) {
    return replaceLinearNodeRange(points, nodeModes, start, end, replacement, replacementModes);
  }

  const rotatedPoints = points.slice(start).concat(points.slice(0, start));
  const rotatedModes = nodeModes.slice(start).concat(nodeModes.slice(0, start));
  return replaceLinearNodeRange(rotatedPoints, rotatedModes, 0, runIndices.length - 1, replacement, replacementModes);
}

function computePolylineMaxDeviation(referencePoints, candidatePolyline) {
  if (!Array.isArray(referencePoints) || !Array.isArray(candidatePolyline) || candidatePolyline.length < 2) {
    return Number.POSITIVE_INFINITY;
  }
  let maxDistance = 0;
  for (let i = 0; i < referencePoints.length; i += 1) {
    const point = referencePoints[i];
    let bestDistanceSq = Number.POSITIVE_INFINITY;
    for (let seg = 0; seg < candidatePolyline.length - 1; seg += 1) {
      const projection = projectPointToSegment(point, candidatePolyline[seg], candidatePolyline[seg + 1]);
      if (projection.distanceSq < bestDistanceSq) {
        bestDistanceSq = projection.distanceSq;
      }
    }
    maxDistance = Math.max(maxDistance, Math.sqrt(bestDistanceSq));
  }
  return maxDistance;
}

function smoothOpenPolyline(points, passes = 1) {
  if (!Array.isArray(points) || points.length < 3) {
    return clonePoints(points) || [];
  }
  let current = clonePoints(points) || [];
  const totalPasses = clamp(Math.round(Number(passes) || 1), 1, 6);
  for (let pass = 0; pass < totalPasses; pass += 1) {
    const next = [];
    next.push([current[0][0], current[0][1]]);
    for (let i = 1; i < current.length - 1; i += 1) {
      const prev = current[i - 1];
      const node = current[i];
      const nextNode = current[i + 1];
      next.push([
        (prev[0] + node[0] * 2 + nextNode[0]) / 4,
        (prev[1] + node[1] * 2 + nextNode[1]) / 4
      ]);
    }
    next.push([current[current.length - 1][0], current[current.length - 1][1]]);
    current = next;
  }
  return current;
}

function simplifyOpenPolyline(points, tolerance) {
  if (!Array.isArray(points) || points.length < 3) {
    return clonePoints(points) || [];
  }
  const epsilon = Math.max(0, Number(tolerance) || 0);
  if (epsilon <= 0) {
    return dedupeConsecutive(clonePoints(points) || []);
  }
  return dedupeConsecutive(rdp(points, epsilon));
}

function limitPolylineInternalPoints(points, maxInternal) {
  if (!Array.isArray(points) || points.length < 3) {
    return clonePoints(points) || [];
  }
  const limit = Math.max(1, Math.floor(Number(maxInternal) || 1));
  const internal = points.slice(1, -1);
  if (internal.length <= limit) {
    return clonePoints(points) || [];
  }

  const picked = [];
  let lastIndex = -1;
  for (let i = 0; i < limit; i += 1) {
    let pickIndex = Math.round(((i + 1) * (internal.length + 1)) / (limit + 1)) - 1;
    pickIndex = clamp(pickIndex, lastIndex + 1, internal.length - (limit - i));
    picked.push(internal[pickIndex]);
    lastIndex = pickIndex;
  }

  return [points[0], ...picked, points[points.length - 1]];
}

function replaceLinearNodeRange(points, modes, start, end, replacementPoints, replacementModes) {
  const nextPoints = [];
  const nextModes = [];
  for (let i = 0; i < start; i += 1) {
    nextPoints.push([points[i][0], points[i][1]]);
    nextModes.push(Boolean(modes[i]));
  }
  for (let i = 0; i < replacementPoints.length; i += 1) {
    nextPoints.push([replacementPoints[i][0], replacementPoints[i][1]]);
    nextModes.push(Boolean(replacementModes[i]));
  }
  for (let i = end + 1; i < points.length; i += 1) {
    nextPoints.push([points[i][0], points[i][1]]);
    nextModes.push(Boolean(modes[i]));
  }

  const dedupedPoints = dedupeConsecutive(nextPoints);
  if (dedupedPoints.length < 3) {
    return null;
  }
  const mappedModes = remapModesToSimplifiedPoints(nextPoints, nextModes, dedupedPoints);
  const inferredModes = inferCustomNodeModes(dedupedPoints);
  const mergedModes = new Array(dedupedPoints.length).fill(false);
  for (let i = 0; i < mergedModes.length; i += 1) {
    mergedModes[i] = Boolean(mappedModes[i] || inferredModes[i]);
  }

  return {
    points: dedupedPoints,
    modes: mergedModes
  };
}

function simplifyCustomPointsForLevel(points, modes, epsilon) {
  if (!Array.isArray(points) || points.length < 4) {
    return {
      points: clonePoints(points) || [],
      modes: normalizeCustomNodeModes(points, modes),
      removed: 0
    };
  }

  const sourcePoints = clonePoints(points) || [];
  const sourceModes = normalizeCustomNodeModes(sourcePoints, modes);
  const mergeDistance = Math.max(0.08, Number(epsilon) * 1.45);
  const merged = mergeNearlyOverlappingNodes(sourcePoints, sourceModes, mergeDistance);
  const workingPoints = merged.points;
  const workingModes = merged.modes;
  const simplified = simplifyLoop(workingPoints, epsilon);
  if (!Array.isArray(simplified) || simplified.length < 3) {
    return {
      points: workingPoints,
      modes: workingModes,
      removed: 0
    };
  }

  const removed = Math.max(0, sourcePoints.length - simplified.length);
  if (removed <= 0) {
    return {
      points: simplified,
      modes: normalizeCustomNodeModes(simplified, workingModes),
      removed: 0
    };
  }

  const mappedModes = remapModesToSimplifiedPoints(workingPoints, workingModes, simplified);
  const inferredModes = inferCustomNodeModes(simplified);
  const nextModes = new Array(simplified.length).fill(false);
  for (let i = 0; i < simplified.length; i += 1) {
    nextModes[i] = Boolean(mappedModes[i] || inferredModes[i]);
  }

  return {
    points: simplified,
    modes: nextModes,
    removed
  };
}

function mergeNearlyOverlappingNodes(points, modes, mergeDistance) {
  let nextPoints = clonePoints(points) || [];
  let nextModes = normalizeCustomNodeModes(nextPoints, modes);
  if (!Array.isArray(nextPoints) || nextPoints.length < 4) {
    return {
      points: nextPoints,
      modes: nextModes
    };
  }

  const threshold = Math.max(0.02, Number(mergeDistance) || 0.2);
  let changed = true;
  let guard = 0;
  while (changed && nextPoints.length > 3 && guard < 24) {
    guard += 1;
    changed = false;
    const mergedPoints = [];
    const mergedModes = [];
    for (let i = 0; i < nextPoints.length; i += 1) {
      const point = nextPoints[i];
      const mode = Boolean(nextModes[i]);
      if (!mergedPoints.length) {
        mergedPoints.push([point[0], point[1]]);
        mergedModes.push(mode);
        continue;
      }

      const prevIndex = mergedPoints.length - 1;
      const prev = mergedPoints[prevIndex];
      const distance = Math.hypot(point[0] - prev[0], point[1] - prev[1]);
      if (distance <= threshold && (mergedPoints.length + (nextPoints.length - i - 1)) >= 3) {
        mergedPoints[prevIndex] = [
          (prev[0] + point[0]) * 0.5,
          (prev[1] + point[1]) * 0.5
        ];
        mergedModes[prevIndex] = Boolean(mergedModes[prevIndex] || mode);
        changed = true;
      } else {
        mergedPoints.push([point[0], point[1]]);
        mergedModes.push(mode);
      }
    }

    if (mergedPoints.length > 3) {
      const first = mergedPoints[0];
      const last = mergedPoints[mergedPoints.length - 1];
      const seamDistance = Math.hypot(first[0] - last[0], first[1] - last[1]);
      if (seamDistance <= threshold) {
        mergedPoints[0] = [
          (first[0] + last[0]) * 0.5,
          (first[1] + last[1]) * 0.5
        ];
        mergedModes[0] = Boolean(mergedModes[0] || mergedModes[mergedModes.length - 1]);
        mergedPoints.pop();
        mergedModes.pop();
        changed = true;
      }
    }

    nextPoints = mergedPoints;
    nextModes = mergedModes;
  }

  return {
    points: nextPoints,
    modes: nextModes
  };
}

function remapModesToSimplifiedPoints(sourcePoints, sourceModes, simplifiedPoints) {
  const mapped = new Array(simplifiedPoints.length).fill(false);
  let startIndex = 0;

  for (let i = 0; i < simplifiedPoints.length; i += 1) {
    const point = simplifiedPoints[i];
    const index = findPointIndexFrom(sourcePoints, point, startIndex);
    if (index >= 0) {
      mapped[i] = Boolean(sourceModes[index]);
      startIndex = (index + 1) % sourcePoints.length;
    }
  }

  return mapped;
}

function findPointIndexFrom(points, target, startIndex) {
  if (!Array.isArray(points) || !points.length) {
    return -1;
  }

  const count = points.length;
  const from = clamp(Math.floor(startIndex || 0), 0, Math.max(0, count - 1));
  for (let offset = 0; offset < count; offset += 1) {
    const idx = (from + offset) % count;
    if (arePointsEqual(points[idx], target)) {
      return idx;
    }
  }
  return -1;
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

function buildPathOverrideRecords(pathItems) {
  const records = [];
  for (let i = 0; i < pathItems.length; i += 1) {
    const item = pathItems[i];
    const centroid = item.centroid || computeAveragePoint(item.rawLoop);
    const area = item.area || Math.abs(polygonArea(item.rawLoop));
    const bbox = item.bbox || getBoundingBox(item.rawLoop);
    records.push({
      key: makePathMatchKey(centroid, area, bbox),
      layerOrder: Number.isFinite(item.layerOrder) ? item.layerOrder : i,
      centroid,
      area,
      bbox,
      module: item.module,
      overrideSimplifyEnabled: item.overrideSimplifyEnabled,
      overrideSimplify: item.overrideSimplify,
      overrideSmoothEnabled: item.overrideSmoothEnabled,
      overrideSmooth: item.overrideSmooth,
      overrideSmartEnabled: Boolean(item.overrideSmartEnabled),
      overrideSmartPass: Boolean(item.overrideSmartPass),
      overrideSmartTolerance: Number(item.overrideSmartTolerance),
      fillMode: normalizeFillMode(item.fillMode),
      customPoints: clonePoints(item.customPoints),
      customNodeModes: cloneNodeModes(item.customNodeModes),
      customEditEnabled: Boolean(item.customEditEnabled),
      nodeSimplifyLevel: Math.max(0, Number(item.nodeSimplifyLevel) || 0),
      paletteIndex: Number.isInteger(item.paletteIndex) ? item.paletteIndex : -1,
      color: normalizePathColor(item.color || '#000000'),
      colorLocked: Boolean(item.colorLocked),
      used: false
    });
  }
  return records;
}

function makePathMatchKey(centroid, area, bbox) {
  const width = bbox.maxX - bbox.minX;
  const height = bbox.maxY - bbox.minY;
  return `${Math.round(centroid[0])}:${Math.round(centroid[1])}:${Math.round(area)}:${Math.round(width)}:${Math.round(height)}`;
}

function pickPathOverride(byKey, allRecords, centroid, area, bbox, width, height) {
  const key = makePathMatchKey(centroid, area, bbox);
  const exact = takePathOverrideFromBucket(byKey.get(key));
  if (exact) {
    return exact;
  }
  return findClosestPathRecord(allRecords, centroid, area, bbox, width, height);
}

function takePathOverrideFromBucket(bucket) {
  if (!Array.isArray(bucket) || !bucket.length) {
    return null;
  }
  for (let i = bucket.length - 1; i >= 0; i -= 1) {
    const candidate = bucket[i];
    if (candidate.used) {
      continue;
    }
    candidate.used = true;
    return candidate;
  }
  return null;
}

function findClosestPathRecord(records, centroid, area, bbox, width, height) {
  let best = null;
  let bestScore = Number.POSITIVE_INFINITY;
  const maxCenterDistance = Math.max(10, Math.min(54, Math.max(width, height) * 0.12));
  const currentWidth = bbox.maxX - bbox.minX;
  const currentHeight = bbox.maxY - bbox.minY;

  for (let i = 0; i < records.length; i += 1) {
    const record = records[i];
    if (record.used) {
      continue;
    }

    const centerDistance = Math.hypot(centroid[0] - record.centroid[0], centroid[1] - record.centroid[1]);
    if (centerDistance > maxCenterDistance) {
      continue;
    }

    const areaRatio = (area + 1) / (record.area + 1);
    if (areaRatio < 0.35 || areaRatio > 2.85) {
      continue;
    }

    const prevWidth = record.bbox.maxX - record.bbox.minX;
    const prevHeight = record.bbox.maxY - record.bbox.minY;
    const sizeDelta = Math.abs(currentWidth - prevWidth) + Math.abs(currentHeight - prevHeight);
    const score = centerDistance * 1.4 + Math.abs(Math.log(areaRatio)) * 24 + sizeDelta * 0.25;
    if (score < bestScore) {
      bestScore = score;
      best = record;
    }
  }

  if (!best) {
    return null;
  }
  best.used = true;
  return best;
}

function findClosestPathItem(pathItems, centroid, area, bbox, width, height) {
  const records = pathItems.map((item) => ({
    used: false,
    centroid: item.centroid,
    area: item.area,
    bbox: item.bbox || getBoundingBox(item.rawLoop),
    item
  }));
  const matched = findClosestPathRecord(records, centroid, area, bbox, width, height);
  return matched?.item || null;
}

function renderPathList() {
  clearPathListDragState();
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
    button.draggable = true;
    button.className = 'path-item';
    button.setAttribute('data-path-id', String(item.id));
    if (item.id === state.selectedPathId) {
      button.classList.add('active');
    }
    if (item.id === state.hoveredPathId) {
      button.classList.add('is-hovered');
    }
    let moduleText = item.module === 'auto' ? `auto → ${item.shapeType}` : item.module;
    if (item.customEditEnabled && item.module === 'path') {
      moduleText += ' + node-edit';
    }
    const fillText = item.shape && item.shape.kind === 'fill'
      ? ` · fill ${normalizeFillMode(item.fillMode)}`
      : '';
    const smartText = item.pathAnalysis && item.pathAnalysis.active
      ? ` · smart -${item.pathAnalysis.removedPoints || 0}`
      : '';
    const area = Math.round(item.area);
    const color = normalizePathColor(item.color || '#000000');
    button.innerHTML = `<strong><span class="drag-handle" aria-hidden="true">::</span><span class="swatch" style="--swatch:${color}"></span>Path ${i + 1}</strong><div class="meta">${moduleText} · area ${area}${fillText}${smartText}</div>`;
    button.addEventListener('pointerenter', () => setHoveredPathId(item.id));
    button.addEventListener('pointerleave', () => setHoveredPathId(null));
    button.addEventListener('focus', () => setHoveredPathId(item.id));
    button.addEventListener('blur', () => setHoveredPathId(null));
    button.addEventListener('click', () => {
      state.selectedPathId = item.id;
      syncNodeSmoothPathSelection(item.id);
      renderFromPathItems();
      refreshPathEditor();
    });

    button.addEventListener('dragstart', (event) => {
      state.listDrag.active = true;
      state.listDrag.pathId = item.id;
      elements.pathList.classList.add('is-dragging');
      button.classList.add('is-dragging');
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', String(item.id));
      }
    });

    button.addEventListener('dragover', (event) => {
      if (!state.listDrag.active) {
        return;
      }
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'move';
      }
      clearPathListDropIndicators();
      const rect = button.getBoundingClientRect();
      const insertAfter = event.clientY >= rect.top + rect.height / 2;
      button.classList.add(insertAfter ? 'drop-after' : 'drop-before');
    });

    button.addEventListener('drop', (event) => {
      if (!state.listDrag.active) {
        return;
      }
      event.preventDefault();
      const dragText = event.dataTransfer?.getData('text/plain');
      const draggedPathId = Number.isInteger(state.listDrag.pathId)
        ? state.listDrag.pathId
        : Number(dragText);
      if (!Number.isFinite(draggedPathId)) {
        clearPathListDragState();
        return;
      }

      const rect = button.getBoundingClientRect();
      const insertAfter = event.clientY >= rect.top + rect.height / 2;
      reorderPathItems(draggedPathId, item.id, insertAfter);
      clearPathListDragState();
    });

    button.addEventListener('dragend', () => {
      clearPathListDragState();
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
  const hasSource = Boolean(elements.onionImage.src);
  const slider = clamp(Number(elements.onionOpacity.value) / 100, 0, 1);

  let sourceOpacity = 0;
  let svgOpacity = 1;

  if (hasSource) {
    if (slider <= 0.5) {
      // 0% -> source hidden, SVG fully visible.
      // 50% -> both fully visible.
      sourceOpacity = slider * 2;
      svgOpacity = 1;
    } else {
      // 50% -> both fully visible.
      // 100% -> source fully visible, SVG hidden.
      sourceOpacity = 1;
      svgOpacity = 1 - (slider - 0.5) * 2;
    }
  }

  elements.onionImage.classList.toggle('visible', hasSource && sourceOpacity > 0);
  elements.onionImage.style.opacity = String(clamp(sourceOpacity, 0, 1));
  applyPreviewInkOpacity(clamp(svgOpacity, 0, 1));
}

function applyPreviewInkOpacity(opacity) {
  const clamped = clamp(Number(opacity), 0, 1);
  const inkNodes = elements.previewStage.querySelectorAll('[data-ink="1"]');
  for (let i = 0; i < inkNodes.length; i += 1) {
    inkNodes[i].style.opacity = String(clamped);
  }
}

function applyPreviewBackgroundContrast(pathItems) {
  const useLightBackground = shouldUseLightPreviewBackground(pathItems);
  elements.previewWrap.classList.toggle('use-light-bg', useLightBackground);
}

function shouldUseLightPreviewBackground(pathItems) {
  if (!Array.isArray(pathItems) || !pathItems.length) {
    return false;
  }

  const colors = new Map();
  for (let i = 0; i < pathItems.length; i += 1) {
    const item = pathItems[i];
    if (!item?.shape) {
      continue;
    }
    const rgba = parseColorToRgba(item.color || '#000000');
    if (!rgba) {
      continue;
    }
    const alpha = clamp(Number(rgba.a), 0, 1);
    if (alpha <= 0) {
      continue;
    }
    const area = Math.max(0, Number(item.area) || 0);
    const weight = Math.max(1, area) * alpha;
    const key = `${rgba.r},${rgba.g},${rgba.b}`;
    const existing = colors.get(key);
    if (existing) {
      existing.weight += weight;
    } else {
      colors.set(key, {
        r: rgba.r,
        g: rgba.g,
        b: rgba.b,
        weight
      });
    }
  }

  if (!colors.size) {
    return false;
  }

  let dominant = null;
  for (const entry of colors.values()) {
    if (!dominant || entry.weight > dominant.weight) {
      dominant = entry;
    }
  }
  if (!dominant) {
    return false;
  }

  const luminance = relativeLuminance(dominant.r, dominant.g, dominant.b);
  return luminance < 0.34;
}

function relativeLuminance(r, g, b) {
  const rl = linearizeSrgbChannel(clamp(Number(r), 0, 255) / 255);
  const gl = linearizeSrgbChannel(clamp(Number(g), 0, 255) / 255);
  const bl = linearizeSrgbChannel(clamp(Number(b), 0, 255) / 255);
  return rl * 0.2126 + gl * 0.7152 + bl * 0.0722;
}

function linearizeSrgbChannel(value) {
  const v = clamp(Number(value), 0, 1);
  if (v <= 0.04045) {
    return v / 12.92;
  }
  return Math.pow((v + 0.055) / 1.055, 2.4);
}

async function loadImageFile(file) {
  if (!isValidImage(file)) {
    setStatus('Please choose a PNG or JPG image.', true);
    return;
  }

  try {
    const bitmap = await createImageBitmap(file);
    if (state.image || state.pathItems.length) {
      recordUndoStep();
    }
    state.image = bitmap;
    state.sourceSize = { width: 0, height: 0 };
    state.imageName = (file.name || 'trace').replace(/\.[^.]+$/, '');
    setStatus(`Loaded ${file.name}.`);
    traceAndRender({ resetView: true, initializePaletteCount: true });
  } catch (error) {
    console.error(error);
    setStatus('Failed to decode image file.', true);
  }
}

function isValidImage(file) {
  const supportedTypes = ['image/png', 'image/jpeg', 'image/jpg'];
  return supportedTypes.includes(file.type);
}

function traceAndRender(options = {}) {
  if (!state.image) {
    return;
  }
  const resetView = Boolean(options.resetView);
  const initializePaletteCount = Boolean(options.initializePaletteCount);
  deactivateNodeSmoothMode(null);

  syncGlobalStateFromControls();
  const {
    simplify: simplifyTolerance,
    smooth: smoothPasses,
    minArea
  } = state.globals;

  let width = state.sourceSize.width;
  let height = state.sourceSize.height;
  if (!width || !height) {
    const traceSize = fitSize(state.image.width, state.image.height, state.globals.detail);
    width = traceSize.width;
    height = traceSize.height;
    state.sourceSize.width = width;
    state.sourceSize.height = height;
  }

  elements.sourceCanvas.width = width;
  elements.sourceCanvas.height = height;
  sourceCtx.clearRect(0, 0, width, height);
  sourceCtx.drawImage(state.image, 0, 0, width, height);

  const img = sourceCtx.getImageData(0, 0, width, height);
  const preprocessedPixels = preprocessTracePixels(img.data, width, height, state.globals.edgeCleanup);
  const traced = traceColorContours(preprocessedPixels, width, height, state.globals.colorCount, {
    cleanupPasses: state.globals.edgeCleanup
  });
  const contourEntries = traced.entries;
  state.palette.latest = traced.paletteHex;
  state.palette.dominantIndex = Number.isInteger(traced.dominantCornerIndex) ? traced.dominantCornerIndex : -1;
  renderPaletteSwatches();
  const previousSelectedItem = getSelectedPathItem();
  const previousSelectedSignature = previousSelectedItem
    ? {
      key: makePathMatchKey(previousSelectedItem.centroid, previousSelectedItem.area, previousSelectedItem.bbox || getBoundingBox(previousSelectedItem.rawLoop)),
      centroid: previousSelectedItem.centroid,
      area: previousSelectedItem.area,
      bbox: previousSelectedItem.bbox || getBoundingBox(previousSelectedItem.rawLoop)
    }
    : null;
  const previousOverrides = buildPathOverrideRecords(state.pathItems);
  const previousOverridesByKey = new Map();
  for (let i = 0; i < previousOverrides.length; i += 1) {
    const record = previousOverrides[i];
    if (!previousOverridesByKey.has(record.key)) {
      previousOverridesByKey.set(record.key, []);
    }
    previousOverridesByKey.get(record.key).push(record);
  }

  const nextItems = [];

  for (let i = 0; i < contourEntries.length; i += 1) {
    const entry = contourEntries[i];
    const loop = entry.loop;
    const color = normalizeHexColor(entry.color || '#000000');
    const mappedColor = Number.isInteger(entry.paletteIndex)
      ? getPaletteColorHex(entry.paletteIndex)
      : color;
    const area = Math.abs(polygonArea(loop));
    if (area < minArea) {
      continue;
    }

    const simplified = simplifyLoop(loop, simplifyTolerance);
    if (simplified.length < 3) {
      continue;
    }

    const bbox = getBoundingBox(loop);
    const centroid = computeAveragePoint(simplified);
    const key = makePathMatchKey(centroid, area, bbox);
    const previous = pickPathOverride(previousOverridesByKey, previousOverrides, centroid, area, bbox, width, height);
    const previousModule = previous?.module || 'auto';
    const module = previousModule === 'custom' ? 'path' : previousModule;
    nextItems.push({
      id: nextItems.length,
      key,
      layerOrder: Number.isFinite(previous?.layerOrder) ? previous.layerOrder : nextItems.length,
      rawLoop: loop,
      area,
      centroid,
      bbox,
      module,
      overrideSimplifyEnabled: previous?.overrideSimplifyEnabled || false,
      overrideSimplify: previous?.overrideSimplify ?? simplifyTolerance,
      overrideSmoothEnabled: previous?.overrideSmoothEnabled || false,
      overrideSmooth: previous?.overrideSmooth ?? smoothPasses,
      overrideSmartEnabled: Boolean(previous?.overrideSmartEnabled),
      overrideSmartPass: typeof previous?.overrideSmartPass === 'boolean'
        ? previous.overrideSmartPass
        : state.globals.smartPassEnabled,
      overrideSmartTolerance: Number.isFinite(previous?.overrideSmartTolerance)
        ? Number(previous.overrideSmartTolerance)
        : state.globals.smartLineTolerance,
      fillMode: normalizeFillMode(previous?.fillMode),
      customEditEnabled: Boolean(previous?.customEditEnabled || previousModule === 'custom'),
      customPoints: clonePoints(previous?.customPoints),
      customNodeModes: cloneNodeModes(previous?.customNodeModes),
      nodeSimplifyLevel: Math.max(0, Number(previous?.nodeSimplifyLevel) || 0),
      paletteIndex: Number.isInteger(entry.paletteIndex)
        ? entry.paletteIndex
        : (Number.isInteger(previous?.paletteIndex) ? previous.paletteIndex : -1),
      color: previous?.colorLocked ? normalizePathColor(previous.color) : normalizePathColor(mappedColor),
      colorLocked: Boolean(previous?.colorLocked),
      shape: null,
      shapeType: 'path'
    });
  }

  nextItems.sort((a, b) => {
    const orderA = Number.isFinite(a.layerOrder) ? a.layerOrder : 0;
    const orderB = Number.isFinite(b.layerOrder) ? b.layerOrder : 0;
    return orderA - orderB;
  });
  for (let i = 0; i < nextItems.length; i += 1) {
    nextItems[i].layerOrder = i;
  }

  state.pathItems = nextItems;
  if (initializePaletteCount) {
    const uniquePaletteIndices = new Set();
    const uniqueColors = new Set();
    for (let i = 0; i < nextItems.length; i += 1) {
      const paletteIndex = nextItems[i].paletteIndex;
      if (Number.isInteger(paletteIndex) && paletteIndex >= 0) {
        uniquePaletteIndices.add(paletteIndex);
      }
      uniqueColors.add(normalizePathColor(nextItems[i].color || '#000000'));
    }
    const uniqueCount = clamp(uniquePaletteIndices.size || uniqueColors.size || 1, 1, 16);
    if (Number(state.globals.colorCount) !== uniqueCount) {
      state.globals.colorCount = uniqueCount;
      elements.colorCount.value = String(uniqueCount);
      refreshLabels();
    }
  }
  if (!nextItems.length) {
    state.selectedPathId = null;
    state.hoveredPathId = null;
  } else if (previousSelectedSignature) {
    let matched = nextItems.find((item) => item.key === previousSelectedSignature.key);
    if (!matched) {
      matched = findClosestPathItem(nextItems, previousSelectedSignature.centroid, previousSelectedSignature.area, previousSelectedSignature.bbox, width, height);
    }
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
      clearNodeDragState();
    }
  }
  if (!nextItems.some((item) => item.id === state.nodeSmooth.pathId)) {
    deactivateNodeSmoothMode(null);
  } else if (state.nodeSmooth.active) {
    const activeSmoothItem = getPathItemById(state.nodeSmooth.pathId);
    const count = activeSmoothItem?.customPoints?.length || 0;
    state.nodeSmooth.indices = getNodeSmoothSelectionIndices(state.nodeSmooth.pathId, count);
  }
  if (state.contextMenu.open && !nextItems.some((item) => item.id === state.contextMenu.pathId)) {
    closePathContextMenu();
  }

  updateOnionSourceFromCanvas();
  renderFromPathItems(resetView);
  refreshPathEditor();
}

function renderFromPathItems(resetView = false) {
  if (!state.sourceSize.width || !state.sourceSize.height) {
    state.svgRawText = '';
    if (state.svgOptimize.timer) {
      window.clearTimeout(state.svgOptimize.timer);
      state.svgOptimize.timer = null;
    }
    state.svgOptimize.raw = '';
    state.svgOptimize.text = '';
    state.svgOptimize.promise = null;
    state.svgText = '';
    applyPreviewBackgroundContrast(null);
    renderPathList();
    setOutputState(false);
    return;
  }

  const renderedShapes = [];
  const globalSimplify = state.globals.simplify;
  const globalSmooth = state.globals.smooth;

  for (let i = 0; i < state.pathItems.length; i += 1) {
    const item = state.pathItems[i];
    item.color = normalizePathColor(item.color || '#000000');
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
    state.svgRawText = '';
    if (state.svgOptimize.timer) {
      window.clearTimeout(state.svgOptimize.timer);
      state.svgOptimize.timer = null;
    }
    state.svgOptimize.raw = '';
    state.svgOptimize.text = '';
    state.svgOptimize.promise = null;
    state.svgText = '';
    state.hoveredPathId = null;
    applyPreviewBackgroundContrast(null);
    elements.previewStage.innerHTML = '<div class="placeholder">No paths detected. Lower min area or increase palette colors.</div>';
    if (resetView) {
      resetPreviewViewport();
    }
    renderPathList();
    syncHoveredPathHighlight();
    applyOnionSkinState();
    setStatus(`Traced 0 shapes at ${state.sourceSize.width}×${state.sourceSize.height} (no shapes).`, false, { toast: false });
    setOutputState(false);
    return;
  }

  const outputSize = getRequestedOutputSize();
  const rawSvg = buildSvg(state.pathItems, state.sourceSize.width, state.sourceSize.height, {
    outputWidth: outputSize.width,
    outputHeight: outputSize.height
  });
  setRawSvgText(rawSvg);
  const previewSvg = buildSvg(state.pathItems, state.sourceSize.width, state.sourceSize.height, {
    interactive: true,
    mode: state.mode,
    selectedPathId: state.selectedPathId,
    activeNodePathId: state.nodeDrag.active ? state.nodeDrag.pathId : null,
    activeNodeIndex: state.nodeDrag.active ? state.nodeDrag.nodeIndex : -1,
    smoothNodePathId: state.nodeSmooth.active ? state.nodeSmooth.pathId : null,
    smoothNodeIndices: state.nodeSmooth.active ? state.nodeSmooth.indices : []
  });
  renderSvgPreview(previewSvg, resetView);
  applyPreviewBackgroundContrast(state.pathItems);
  renderPathList();
  syncHoveredPathHighlight();
  applyOnionSkinState();

  setStatus(`Traced ${renderedShapes.length} shape${renderedShapes.length === 1 ? '' : 's'} at ${state.sourceSize.width}×${state.sourceSize.height} (${summarizeShapeTypes(renderedShapes)}).`, false, { toast: false });
  setOutputState(renderedShapes.length > 0);
}

function resolveShapeForItem(item, context, simplifiedLoop, smoothPasses) {
  const module = item.module;
  let baseShape = null;
  let seedLoop = null;
  item.pathAnalysis = null;
  const smartConfig = getSmartConfigForItem(item);

  if (module === 'auto') {
    baseShape = detectPrimitiveShapeFromContext(context);
    if (!baseShape) {
      const fallback = buildPathFallbackData(simplifiedLoop, smoothPasses, smartConfig);
      if (!fallback?.loop) {
        return null;
      }
      item.pathAnalysis = fallback.analysis;
      baseShape = buildPathFallbackShapeFromLoop(fallback.loop);
      baseShape.d = fallback.pathD || baseShape.d;
      seedLoop = fallback.loop;
    }
  } else if (module === 'path') {
    const fallback = buildPathFallbackData(simplifiedLoop, smoothPasses, smartConfig);
    if (!fallback?.loop) {
      return null;
    }
    item.pathAnalysis = fallback.analysis;
    baseShape = buildPathFallbackShapeFromLoop(fallback.loop);
    baseShape.d = fallback.pathD || baseShape.d;
    seedLoop = fallback.loop;
  } else if (module === 'line') {
    baseShape = forceLinePrimitive(context);
  } else if (module === 'rect') {
    baseShape = forceRectPrimitive(context);
  } else if (module === 'rounded-rect') {
    baseShape = forceRoundedRectPrimitive(context);
  } else if (module === 'circle') {
    baseShape = forceCirclePrimitive(context);
  } else if (module === 'ellipse') {
    baseShape = forceEllipsePrimitive(context);
  } else {
    const fallback = buildPathFallbackData(simplifiedLoop, smoothPasses, smartConfig);
    if (!fallback?.loop) {
      return null;
    }
    item.pathAnalysis = fallback.analysis;
    baseShape = buildPathFallbackShapeFromLoop(fallback.loop);
    baseShape.d = fallback.pathD || baseShape.d;
    seedLoop = fallback.loop;
  }

  if (!baseShape) {
    return null;
  }

  if (item.customEditEnabled && module === 'path') {
    ensureCustomAnchorPoints(item, seedLoop || simplifiedLoop);
    return buildCustomShape(item.customPoints, item.customNodeModes);
  }

  return baseShape;
}

function ensureCustomAnchorPoints(item, fallbackLoop = null, force = false) {
  if (!force && Array.isArray(item.customPoints) && item.customPoints.length >= 3) {
    item.customNodeModes = normalizeCustomNodeModes(item.customPoints, item.customNodeModes);
    return;
  }

  const source = fallbackLoop && fallbackLoop.length >= 3 ? fallbackLoop : item.rawLoop;
  item.customPoints = buildCustomAnchorPoints(source);
  item.customNodeModes = inferCustomNodeModes(item.customPoints);
}

function getCurrentPathSeedLoop(item) {
  if (!item || !Array.isArray(item.rawLoop)) {
    return null;
  }

  if (item.shape && item.shape.shapeType === 'path' && Array.isArray(item.shape.loop) && item.shape.loop.length >= 3) {
    return clonePoints(item.shape.loop);
  }

  const simplifyTolerance = item.overrideSimplifyEnabled ? item.overrideSimplify : state.globals.simplify;
  const smoothPasses = item.overrideSmoothEnabled ? item.overrideSmooth : state.globals.smooth;
  const simplified = simplifyLoop(item.rawLoop, simplifyTolerance);
  if (simplified.length < 3) {
    return null;
  }
  return buildPathFallbackData(simplified, smoothPasses, getSmartConfigForItem(item))?.loop || simplified;
}

function getSmartConfigForItem(item) {
  const usePathOverride = Boolean(item?.overrideSmartEnabled);
  const lineEnabled = usePathOverride ? Boolean(item?.overrideSmartPass) : Boolean(state.globals.smartPassEnabled);
  const rawLineTolerance = usePathOverride
    ? (Number.isFinite(item?.overrideSmartTolerance) ? Number(item.overrideSmartTolerance) : state.globals.smartLineTolerance)
    : state.globals.smartLineTolerance;
  const lineTolerance = clamp(rawLineTolerance, 0.2, 4.2);
  const lineWindow = clamp(Math.round(Number(state.globals.smartLineWindow) || 5), 5, 15);
  return {
    lineEnabled,
    lineTolerance,
    lineWindow
  };
}

function resetCustomAnchorsFromCurrentPath(item) {
  const seedLoop = getCurrentPathSeedLoop(item);
  if (!seedLoop) {
    item.customPoints = null;
    item.customNodeModes = null;
    return;
  }
  ensureCustomAnchorPoints(item, seedLoop, true);
}

function buildCustomAnchorPoints(loop) {
  if (!Array.isArray(loop) || loop.length < 3) {
    return null;
  }

  const points = dedupeConsecutive(clonePoints(loop) || []);
  return points.length >= 3 ? points : null;
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
    pointCount: customPoints.length,
    d
  };
}

function normalizeCustomNodeModes(points, modes) {
  if (!Array.isArray(points) || points.length < 3) {
    return null;
  }

  if (!Array.isArray(modes) || modes.length !== points.length) {
    return new Array(points.length).fill(false);
  }

  const normalized = [];
  for (let i = 0; i < modes.length; i += 1) {
    normalized.push(Boolean(modes[i]));
  }
  return normalized;
}

function inferCustomNodeModes(points) {
  if (!Array.isArray(points) || points.length < 3) {
    return null;
  }

  const count = points.length;
  const rawModes = new Array(count).fill(false);
  const turnSigns = new Array(count).fill(0);

  for (let i = 0; i < count; i += 1) {
    const prev = points[(i - 1 + count) % count];
    const current = points[i];
    const next = points[(i + 1) % count];

    const vIn = [current[0] - prev[0], current[1] - prev[1]];
    const vOut = [next[0] - current[0], next[1] - current[1]];
    const lenIn = Math.hypot(vIn[0], vIn[1]);
    const lenOut = Math.hypot(vOut[0], vOut[1]);
    if (lenIn < 1e-6 || lenOut < 1e-6) {
      continue;
    }

    const inNorm = [vIn[0] / lenIn, vIn[1] / lenIn];
    const outNorm = [vOut[0] / lenOut, vOut[1] / lenOut];
    const dot = clamp(inNorm[0] * outNorm[0] + inNorm[1] * outNorm[1], -1, 1);
    const cross = inNorm[0] * outNorm[1] - inNorm[1] * outNorm[0];
    const turn = Math.abs(cross);

    // Straight segments and very sharp corners should stay as corners.
    if (turn < 0.08 || dot > 0.98) {
      continue;
    }
    if (turn > 0.82 && dot < 0.25) {
      continue;
    }

    // Curved candidates should sit off the direct chord by at least a tiny amount.
    const projection = projectPointToSegment(current, prev, next);
    const distanceToChord = Math.sqrt(projection.distanceSq);
    const localScale = Math.min(lenIn, lenOut);
    if (distanceToChord < Math.max(0.1, localScale * 0.025)) {
      continue;
    }

    rawModes[i] = true;
    turnSigns[i] = Math.sign(cross);
  }

  // Remove isolated candidates; keep runs with consistent curvature direction.
  const result = new Array(count).fill(false);
  for (let i = 0; i < count; i += 1) {
    if (!rawModes[i]) {
      continue;
    }
    const prevIndex = (i - 1 + count) % count;
    const nextIndex = (i + 1) % count;
    const sign = turnSigns[i];
    const prevOk = rawModes[prevIndex] && sign !== 0 && turnSigns[prevIndex] === sign;
    const nextOk = rawModes[nextIndex] && sign !== 0 && turnSigns[nextIndex] === sign;
    if (prevOk || nextOk) {
      result[i] = true;
    }
  }

  return result;
}

function customNodesToPath(points, modes) {
  if (!Array.isArray(points) || points.length < 3) {
    return '';
  }

  const nodeModes = normalizeCustomNodeModes(points, modes);
  const n = points.length;
  const parts = [`M ${round(points[0][0])} ${round(points[0][1])}`];

  for (let i = 0; i < n; i += 1) {
    const current = points[i];
    const nextIndex = (i + 1) % n;
    const next = points[nextIndex];
    const currentCurve = Boolean(nodeModes[i]);
    const nextCurve = Boolean(nodeModes[nextIndex]);
    if (!currentCurve && !nextCurve) {
      parts.push(`L ${round(next[0])} ${round(next[1])}`);
      continue;
    }

    const outHandle = currentCurve
      ? computeClosedSplineHandle(points, i, 1 / 6)
      : [0, 0];
    const inHandle = nextCurve
      ? computeClosedSplineHandle(points, nextIndex, 1 / 6)
      : [0, 0];

    const cp1 = [current[0] + outHandle[0], current[1] + outHandle[1]];
    const cp2 = [next[0] - inHandle[0], next[1] - inHandle[1]];
    parts.push(`C ${round(cp1[0])} ${round(cp1[1])} ${round(cp2[0])} ${round(cp2[1])} ${round(next[0])} ${round(next[1])}`);
  }

  parts.push('Z');
  return parts.join(' ');
}

function computeClosedSplineHandle(points, index, factor = 1 / 6) {
  const count = Array.isArray(points) ? points.length : 0;
  if (count < 3 || !Number.isInteger(index) || index < 0 || index >= count) {
    return [0, 0];
  }
  const prev = points[(index - 1 + count) % count];
  const current = points[index];
  const next = points[(index + 1) % count];
  const tangent = [
    (next[0] - prev[0]) * factor,
    (next[1] - prev[1]) * factor
  ];

  const segPrev = Math.hypot(current[0] - prev[0], current[1] - prev[1]);
  const segNext = Math.hypot(next[0] - current[0], next[1] - current[1]);
  const clampLen = Math.max(0.001, Math.min(segPrev, segNext) * 0.78);
  const length = Math.hypot(tangent[0], tangent[1]);
  if (length <= 1e-9) {
    return [0, 0];
  }
  const scale = Math.min(1, clampLen / length);
  const vector = [tangent[0] * scale, tangent[1] * scale];
  return vector;
}

function buildPathFallbackData(simplifiedLoop, smoothPasses, smartConfig = null) {
  const smoothed = smoothLoop(simplifiedLoop, smoothPasses);
  if (smoothed.length < 3) {
    return null;
  }

  const config = smartConfig || {
    lineEnabled: Boolean(state.globals.smartPassEnabled),
    lineTolerance: Number(state.globals.smartLineTolerance),
    lineWindow: clamp(Math.round(Number(state.globals.smartLineWindow) || 5), 5, 15)
  };

  const before = analyzePathGeometry(smoothed);
  let loop = smoothed;
  if (config.lineEnabled) {
    const reduced = collapseCollinearVertices(smoothed, {
      distanceTolerance: config.lineTolerance,
      windowSize: config.lineWindow
    });
    if (Array.isArray(reduced) && reduced.length >= 3) {
      loop = reduced;
    }
  }

  const pathD = loopToPathCommand(loop);

  const after = analyzePathGeometry(loop);
  return {
    loop,
    pathD,
    analysis: {
      before,
      after,
      removedPoints: Math.max(0, before.pointCount - after.pointCount),
      active: config.lineEnabled
    }
  };
}

function buildPathFallbackLoop(simplifiedLoop, smoothPasses) {
  return buildPathFallbackData(simplifiedLoop, smoothPasses)?.loop || null;
}

function buildPathFallbackShapeFromLoop(loop) {
  if (!loop || loop.length < 3) {
    return null;
  }
  return {
    kind: 'fill',
    shapeType: 'path',
    pointCount: loop.length,
    d: loopToPathCommand(loop),
    loop: clonePoints(loop)
  };
}

function buildPathFallbackShape(simplifiedLoop, smoothPasses) {
  const fallback = buildPathFallbackData(simplifiedLoop, smoothPasses);
  const loop = fallback?.loop;
  if (!loop || !fallback) {
    return null;
  }
  const shape = buildPathFallbackShapeFromLoop(loop);
  if (!shape) {
    return null;
  }
  shape.d = fallback.pathD || shape.d;
  return shape;
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

function traceBinaryContours(data, width, height, threshold, invert) {
  const mask = toBinaryMask(data, width, height, threshold, invert);
  const contours = traceContours(mask, width, height);
  return contours.map((loop) => ({ loop, color: '#000000' }));
}

function traceColorContours(data, width, height, colorCount, options = {}) {
  const quantized = quantizeImageToPalette(data, width, height, colorCount);
  const { labels, palette } = quantized;
  const cleanupPasses = clamp(Math.round(Number(options.cleanupPasses) || 0), 0, 4);
  const workingLabels = cleanupPasses > 0
    ? cleanupQuantizedLabels(labels, width, height, palette.length, cleanupPasses)
    : labels;
  const dominantCornerIndex = detectDominantCornerIndexFromLabels(workingLabels, palette.length, width, height);
  const entries = [];
  const skippedDominant = palette.length > 1 ? dominantCornerIndex : -1;

  for (let paletteIndex = 0; paletteIndex < palette.length; paletteIndex += 1) {
    if (paletteIndex === skippedDominant) {
      continue;
    }

    const mask = new Uint8Array(width * height);
    let activeCount = 0;
    for (let i = 0; i < workingLabels.length; i += 1) {
      if (workingLabels[i] === paletteIndex) {
        mask[i] = 1;
        activeCount += 1;
      }
    }

    if (!activeCount) {
      continue;
    }

    const contours = traceContours(mask, width, height);
    const color = rgbToHex(palette[paletteIndex]);
    for (let i = 0; i < contours.length; i += 1) {
      entries.push({
        loop: contours[i],
        color,
        paletteIndex
      });
    }
  }

  if (!entries.length && skippedDominant >= 0) {
    const mask = new Uint8Array(width * height);
    let activeCount = 0;
    for (let i = 0; i < workingLabels.length; i += 1) {
      if (workingLabels[i] === skippedDominant) {
        mask[i] = 1;
        activeCount += 1;
      }
    }
    if (activeCount) {
      const contours = traceContours(mask, width, height);
      const color = rgbToHex(palette[skippedDominant]);
      for (let i = 0; i < contours.length; i += 1) {
        entries.push({
          loop: contours[i],
          color,
          paletteIndex: skippedDominant
        });
      }
    }
  }

  return {
    entries,
    paletteHex: palette.map((rgb) => rgbToHex(rgb)),
    dominantCornerIndex
  };
}

function preprocessTracePixels(data, width, height, cleanupLevel) {
  const passes = clamp(Math.round(Number(cleanupLevel) || 0), 0, 4);
  if (passes <= 0) {
    return data;
  }

  let current = new Uint8ClampedArray(data);
  for (let i = 0; i < passes; i += 1) {
    current = blurRgbaPixels3x3(current, width, height);
  }
  return current;
}

function blurRgbaPixels3x3(data, width, height) {
  const output = new Uint8ClampedArray(data.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let sumA = 0;
      let sumW = 0;

      for (let dy = -1; dy <= 1; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) {
          continue;
        }
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) {
            continue;
          }
          const w = (dx === 0 && dy === 0) ? 4 : ((dx === 0 || dy === 0) ? 2 : 1);
          const idx = (ny * width + nx) * 4;
          sumR += data[idx] * w;
          sumG += data[idx + 1] * w;
          sumB += data[idx + 2] * w;
          sumA += data[idx + 3] * w;
          sumW += w;
        }
      }

      const out = (y * width + x) * 4;
      output[out] = Math.round(sumR / sumW);
      output[out + 1] = Math.round(sumG / sumW);
      output[out + 2] = Math.round(sumB / sumW);
      output[out + 3] = Math.round(sumA / sumW);
    }
  }
  return output;
}

function cleanupQuantizedLabels(labels, width, height, paletteSize, passes) {
  if (!labels || !labels.length || passes <= 0 || paletteSize <= 1) {
    return labels;
  }

  const safePaletteSize = Math.max(1, Math.floor(paletteSize));
  const counts = new Uint8Array(safePaletteSize);
  let current = new Uint16Array(labels);
  for (let pass = 0; pass < passes; pass += 1) {
    const next = new Uint16Array(current);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        counts.fill(0);
        const idx = y * width + x;
        const center = current[idx];
        let bestLabel = center;
        let bestVotes = 0;

        for (let dy = -1; dy <= 1; dy += 1) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) {
            continue;
          }
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = x + dx;
            if (nx < 0 || nx >= width) {
              continue;
            }
            const label = current[ny * width + nx];
            counts[label] += 1;
            if (counts[label] > bestVotes) {
              bestVotes = counts[label];
              bestLabel = label;
            }
          }
        }

        if (bestLabel !== center && bestVotes >= 5) {
          next[idx] = bestLabel;
        }
      }
    }
    current = next;
  }
  return current;
}

function detectDominantCornerIndexFromLabels(labels, paletteSize, width, height) {
  if (!labels || !labels.length || paletteSize <= 0) {
    return -1;
  }

  const counts = new Int32Array(paletteSize);
  for (let i = 0; i < labels.length; i += 1) {
    counts[labels[i]] += 1;
  }

  const corners = [
    labels[0],
    labels[Math.max(0, width - 1)],
    labels[Math.max(0, width * (height - 1))],
    labels[Math.max(0, width * height - 1)]
  ];
  const votes = new Int32Array(paletteSize);
  for (let i = 0; i < corners.length; i += 1) {
    votes[corners[i]] += 1;
  }

  let dominant = -1;
  let dominantVotes = 0;
  for (let i = 0; i < votes.length; i += 1) {
    if (votes[i] > dominantVotes) {
      dominantVotes = votes[i];
      dominant = i;
    }
  }

  if (dominant >= 0 && paletteSize > 1) {
    const ratio = counts[dominant] / Math.max(1, width * height);
    if (dominantVotes < 3 || ratio < 0.16) {
      return -1;
    }
  }
  return dominant;
}

function quantizeImageToPalette(data, width, height, colorCount) {
  const targetCount = clamp(Math.round(colorCount || 1), 1, 16);
  const bins = new Int32Array(32768);
  const sumR = new Float64Array(32768);
  const sumG = new Float64Array(32768);
  const sumB = new Float64Array(32768);

  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    const r = a < 16 ? 255 : data[i];
    const g = a < 16 ? 255 : data[i + 1];
    const b = a < 16 ? 255 : data[i + 2];
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    bins[key] += 1;
    sumR[key] += r;
    sumG[key] += g;
    sumB[key] += b;
  }

  const candidates = [];
  for (let key = 0; key < bins.length; key += 1) {
    const count = bins[key];
    if (!count) {
      continue;
    }
    candidates.push({
      r: sumR[key] / count,
      g: sumG[key] / count,
      b: sumB[key] / count,
      count
    });
  }

  candidates.sort((a, b) => b.count - a.count);
  if (!candidates.length) {
    return {
      labels: new Uint16Array(width * height),
      palette: [[0, 0, 0]],
      dominantCornerIndex: -1
    };
  }

  const candidateLimit = clamp(targetCount * 20, 24, 160);
  const reducedCandidates = candidates.slice(0, candidateLimit);
  const centerCount = Math.min(targetCount, reducedCandidates.length);
  const centers = initQuantizationCenters(reducedCandidates, centerCount);
  const palette = refineQuantizationCenters(reducedCandidates, centers, 10);

  const labels = new Uint16Array(width * height);
  const paletteCounts = new Int32Array(palette.length);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    const a = data[i + 3];
    const r = a < 16 ? 255 : data[i];
    const g = a < 16 ? 255 : data[i + 1];
    const b = a < 16 ? 255 : data[i + 2];
    let best = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let k = 0; k < palette.length; k += 1) {
      const dr = r - palette[k][0];
      const dg = g - palette[k][1];
      const db = b - palette[k][2];
      const distance = dr * dr + dg * dg + db * db;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = k;
      }
    }
    labels[p] = best;
    paletteCounts[best] += 1;
  }

  const corners = [
    labels[0],
    labels[Math.max(0, width - 1)],
    labels[Math.max(0, width * (height - 1))],
    labels[Math.max(0, width * height - 1)]
  ];
  const cornerVotes = new Int32Array(palette.length);
  for (let i = 0; i < corners.length; i += 1) {
    cornerVotes[corners[i]] += 1;
  }

  let dominantCornerIndex = -1;
  let dominantCornerVotes = 0;
  for (let i = 0; i < cornerVotes.length; i += 1) {
    if (cornerVotes[i] > dominantCornerVotes) {
      dominantCornerVotes = cornerVotes[i];
      dominantCornerIndex = i;
    }
  }
  if (dominantCornerIndex >= 0 && palette.length > 1) {
    const ratio = paletteCounts[dominantCornerIndex] / Math.max(1, width * height);
    if (dominantCornerVotes < 3 || ratio < 0.16) {
      dominantCornerIndex = -1;
    }
  }

  return { labels, palette, dominantCornerIndex };
}

function initQuantizationCenters(candidates, centerCount) {
  const centers = [];
  if (!candidates.length || centerCount <= 0) {
    return centers;
  }

  centers.push([candidates[0].r, candidates[0].g, candidates[0].b]);
  while (centers.length < centerCount) {
    let bestIndex = 0;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < candidates.length; i += 1) {
      const candidate = candidates[i];
      const distance = minDistanceToPalette(candidate, centers);
      const score = distance * Math.sqrt(candidate.count);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }
    const chosen = candidates[bestIndex];
    centers.push([chosen.r, chosen.g, chosen.b]);
  }

  return centers;
}

function refineQuantizationCenters(candidates, centers, iterations) {
  let palette = centers.map((center) => [center[0], center[1], center[2]]);
  if (!palette.length) {
    return [[0, 0, 0]];
  }

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const sums = palette.map(() => ({ r: 0, g: 0, b: 0, w: 0 }));

    for (let i = 0; i < candidates.length; i += 1) {
      const candidate = candidates[i];
      const nearest = findNearestPaletteIndex(candidate.r, candidate.g, candidate.b, palette);
      const bucket = sums[nearest];
      bucket.r += candidate.r * candidate.count;
      bucket.g += candidate.g * candidate.count;
      bucket.b += candidate.b * candidate.count;
      bucket.w += candidate.count;
    }

    for (let i = 0; i < palette.length; i += 1) {
      const bucket = sums[i];
      if (bucket.w <= 0) {
        continue;
      }
      palette[i][0] = bucket.r / bucket.w;
      palette[i][1] = bucket.g / bucket.w;
      palette[i][2] = bucket.b / bucket.w;
    }
  }

  return palette;
}

function minDistanceToPalette(candidate, palette) {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < palette.length; i += 1) {
    const dr = candidate.r - palette[i][0];
    const dg = candidate.g - palette[i][1];
    const db = candidate.b - palette[i][2];
    const distance = dr * dr + dg * dg + db * db;
    if (distance < best) {
      best = distance;
    }
  }
  return best;
}

function findNearestPaletteIndex(r, g, b, palette) {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < palette.length; i += 1) {
    const dr = r - palette[i][0];
    const dg = g - palette[i][1];
    const db = b - palette[i][2];
    const distance = dr * dr + dg * dg + db * db;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best;
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

function analyzePathGeometry(loop) {
  if (!Array.isArray(loop) || loop.length < 3) {
    return {
      pointCount: Array.isArray(loop) ? loop.length : 0,
      straightRatio: 0,
      avgTurnDeg: 0,
      maxTurnDeg: 0
    };
  }

  const count = loop.length;
  let straight = 0;
  let turnSum = 0;
  let maxTurn = 0;
  const straightTurn = Math.PI / 20; // ~9deg

  for (let i = 0; i < count; i += 1) {
    const prev = loop[(i - 1 + count) % count];
    const current = loop[i];
    const next = loop[(i + 1) % count];
    const inVec = [current[0] - prev[0], current[1] - prev[1]];
    const outVec = [next[0] - current[0], next[1] - current[1]];
    const inLength = Math.hypot(inVec[0], inVec[1]);
    const outLength = Math.hypot(outVec[0], outVec[1]);
    if (inLength <= 1e-6 || outLength <= 1e-6) {
      continue;
    }
    const dot = clamp((inVec[0] * outVec[0] + inVec[1] * outVec[1]) / (inLength * outLength), -1, 1);
    const turn = Math.acos(dot);
    turnSum += turn;
    maxTurn = Math.max(maxTurn, turn);
    if (turn <= straightTurn) {
      straight += 1;
    }
  }

  return {
    pointCount: count,
    straightRatio: straight / Math.max(1, count),
    avgTurnDeg: (turnSum / Math.max(1, count)) * (180 / Math.PI),
    maxTurnDeg: maxTurn * (180 / Math.PI)
  };
}

function computeTurnDirectionStats(loop) {
  if (!Array.isArray(loop) || loop.length < 3) {
    return {
      considered: 0,
      positive: 0,
      negative: 0,
      signFlips: 0,
      dominantRatio: 0,
      hasSignFlip: false
    };
  }

  let lastSign = 0;
  let positive = 0;
  let negative = 0;
  let signFlips = 0;
  let considered = 0;

  for (let i = 0; i < loop.length; i += 1) {
    const prev = loop[(i - 1 + loop.length) % loop.length];
    const current = loop[i];
    const next = loop[(i + 1) % loop.length];
    const inVecX = current[0] - prev[0];
    const inVecY = current[1] - prev[1];
    const outVecX = next[0] - current[0];
    const outVecY = next[1] - current[1];
    const inLength = Math.hypot(inVecX, inVecY);
    const outLength = Math.hypot(outVecX, outVecY);
    if (inLength <= 1e-6 || outLength <= 1e-6) {
      continue;
    }

    const cross = (inVecX / inLength) * (outVecY / outLength) - (inVecY / inLength) * (outVecX / outLength);
    if (Math.abs(cross) < 0.02) {
      continue;
    }

    const sign = cross > 0 ? 1 : -1;
    considered += 1;
    if (sign > 0) {
      positive += 1;
    } else {
      negative += 1;
    }
    if (lastSign !== 0 && sign !== lastSign) {
      signFlips += 1;
    }
    lastSign = sign;
  }

  const dominant = Math.max(positive, negative);
  const dominantRatio = considered > 0 ? dominant / considered : 0;
  const hasSignFlip = positive > 0 && negative > 0 && signFlips > 0;
  return {
    considered,
    positive,
    negative,
    signFlips,
    dominantRatio,
    hasSignFlip
  };
}

function collapseCollinearVertices(loop, options = {}) {
  const points = dedupeConsecutive(clonePoints(loop) || []);
  if (points.length < 4) {
    return points;
  }

  const distanceTolerance = Math.max(0.05, Number(options.distanceTolerance) || 0.9);
  const windowSize = clamp(Math.round(options.windowSize || 5), 5, 24);
  const count = points.length;
  const minWindow = Math.min(windowSize, Math.max(4, count - 1));
  if (count <= minWindow) {
    return points;
  }

  const output = [];
  let i = 0;
  let guard = 0;
  const maxGuard = count * 4;

  while (i < count && guard < maxGuard) {
    guard += 1;
    let bestFit = null;
    let bestEnd = -1;
    let end = i + minWindow - 1;

    while (end < i + count) {
      const runPoints = collectCircularPoints(points, i, end);
      const fit = fitStraightRun(runPoints, distanceTolerance);
      if (!fit.ok) {
        break;
      }
      bestFit = fit;
      bestEnd = end;
      end += 1;
    }

    if (bestFit && bestEnd >= i + minWindow - 1) {
      appendPointUnique(output, bestFit.lineStart);
      appendPointUnique(output, bestFit.lineEnd);
      i = bestEnd;
      continue;
    }

    appendPointUnique(output, points[i]);
    i += 1;
  }

  const deduped = dedupeConsecutive(output);
  return deduped.length >= 3 ? deduped : points;
}

function collectCircularPoints(points, startInclusive, endInclusive) {
  const result = [];
  if (!Array.isArray(points) || !points.length) {
    return result;
  }
  const count = points.length;
  for (let idx = startInclusive; idx <= endInclusive; idx += 1) {
    result.push(points[idx % count]);
  }
  return result;
}

function appendPointUnique(list, point) {
  if (!Array.isArray(point) || point.length < 2) {
    return;
  }
  const prev = list[list.length - 1];
  if (prev && Math.hypot(prev[0] - point[0], prev[1] - point[1]) <= 1e-6) {
    return;
  }
  list.push([point[0], point[1]]);
}

function fitStraightRun(points, distanceTolerance) {
  if (!Array.isArray(points) || points.length < 2) {
    return { ok: false };
  }

  const line = fitBestLineThroughPoints(points);
  if (!line) {
    return { ok: false };
  }

  const { center } = line;
  const direction = [line.direction[0], line.direction[1]];
  const first = points[0];
  const last = points[points.length - 1];
  const runVecX = last[0] - first[0];
  const runVecY = last[1] - first[1];
  const runDot = runVecX * direction[0] + runVecY * direction[1];
  if (runDot < 0) {
    direction[0] *= -1;
    direction[1] *= -1;
  }

  let minT = Number.POSITIVE_INFINITY;
  let maxT = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < points.length; i += 1) {
    const dx = points[i][0] - center[0];
    const dy = points[i][1] - center[1];
    const t = dx * direction[0] + dy * direction[1];
    minT = Math.min(minT, t);
    maxT = Math.max(maxT, t);
  }
  if (!Number.isFinite(minT) || !Number.isFinite(maxT)) {
    return { ok: false };
  }

  const lineLength = Math.max(1e-6, maxT - minT);
  const lineStart = [
    center[0] + direction[0] * minT,
    center[1] + direction[1] * minT
  ];
  const lineEnd = [
    center[0] + direction[0] * maxT,
    center[1] + direction[1] * maxT
  ];

  let maxPerpendicular = 0;
  let minPerpendicular = Number.POSITIVE_INFINITY;
  let maxPerpendicularSigned = Number.NEGATIVE_INFINITY;
  let prevT = null;
  let backtrack = 0;
  for (let i = 0; i < points.length; i += 1) {
    const dx = points[i][0] - center[0];
    const dy = points[i][1] - center[1];
    const t = dx * direction[0] + dy * direction[1];
    const perpSigned = dx * direction[1] - dy * direction[0];
    const d = Math.abs(perpSigned);
    maxPerpendicular = Math.max(maxPerpendicular, d);
    minPerpendicular = Math.min(minPerpendicular, perpSigned);
    maxPerpendicularSigned = Math.max(maxPerpendicularSigned, perpSigned);
    if (maxPerpendicular > distanceTolerance) {
      return { ok: false };
    }
    if (prevT != null && t < prevT) {
      backtrack += prevT - t;
    }
    prevT = t;
  }

  // Oriented diagonal box guard: reject if strip thickness is too wide for this line fit.
  const stripThickness = maxPerpendicularSigned - minPerpendicular;
  if (stripThickness > distanceTolerance * 2.25) {
    return { ok: false };
  }

  // Reject samples that reverse strongly along the fitted line.
  if (backtrack > lineLength * 0.3 + distanceTolerance) {
    return { ok: false };
  }

  return {
    ok: true,
    lineStart,
    lineEnd
  };
}

function fitBestLineThroughPoints(points) {
  if (!Array.isArray(points) || points.length < 2) {
    return null;
  }

  let meanX = 0;
  let meanY = 0;
  for (let i = 0; i < points.length; i += 1) {
    meanX += points[i][0];
    meanY += points[i][1];
  }
  meanX /= points.length;
  meanY /= points.length;

  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < points.length; i += 1) {
    const dx = points[i][0] - meanX;
    const dy = points[i][1] - meanY;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }

  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const direction = [Math.cos(angle), Math.sin(angle)];
  const length = Math.hypot(direction[0], direction[1]);
  if (length <= 1e-6) {
    return null;
  }
  direction[0] /= length;
  direction[1] /= length;

  let minT = Number.POSITIVE_INFINITY;
  let maxT = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < points.length; i += 1) {
    const dx = points[i][0] - meanX;
    const dy = points[i][1] - meanY;
    const t = dx * direction[0] + dy * direction[1];
    minT = Math.min(minT, t);
    maxT = Math.max(maxT, t);
  }

  if (!Number.isFinite(minT) || !Number.isFinite(maxT) || maxT - minT <= 1e-6) {
    return null;
  }

  return {
    center: [meanX, meanY],
    direction,
    minT,
    maxT
  };
}

function perpendicularDistanceToInfiniteLine(point, linePoint, lineDirection) {
  const dx = point[0] - linePoint[0];
  const dy = point[1] - linePoint[1];
  return Math.abs(dx * lineDirection[1] - dy * lineDirection[0]);
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

function pointInPolygon(point, polygon) {
  if (!Array.isArray(point) || !Array.isArray(polygon) || polygon.length < 3) {
    return false;
  }

  const x = Number(point[0]);
  const y = Number(point[1]);
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = Number(polygon[i][0]);
    const yi = Number(polygon[i][1]);
    const xj = Number(polygon[j][0]);
    const yj = Number(polygon[j][1]);

    const intersects = ((yi > y) !== (yj > y))
      && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-12) + xi);
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
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
  const turnDirection = computeTurnDirectionStats(rawLoop);

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
    ellipseError,
    turnDirection
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
    pointCount: 2,
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
    pointCount: corners.length,
    d: loopToPathCommand(corners)
  };
}

function forceRectPrimitive(context) {
  const corners = reduceToCorners(context.cornerLoop, 0.2);
  if (corners.length === 4 && looksLikeRectangle(corners)) {
    return {
      kind: 'fill',
      shapeType: 'rect',
      pointCount: corners.length,
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
    pointCount: boxLoop.length,
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
    pointCount: 4,
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
    pointCount: 1,
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
  if (context.turnDirection?.hasSignFlip || (context.turnDirection?.dominantRatio || 0) < 0.99) {
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
    pointCount: 1,
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
  const activeNodePathId = options.activeNodePathId ?? null;
  const activeNodeIndex = Number.isInteger(options.activeNodeIndex) ? options.activeNodeIndex : -1;
  const smoothNodePathId = options.smoothNodePathId ?? null;
  const smoothNodeIndices = Array.isArray(options.smoothNodeIndices) ? options.smoothNodeIndices : [];
  const smoothNodeSet = new Set();
  for (let i = 0; i < smoothNodeIndices.length; i += 1) {
    const index = Number(smoothNodeIndices[i]);
    if (Number.isInteger(index) && index >= 0) {
      smoothNodeSet.add(index);
    }
  }
  const outputWidth = Number.isFinite(options.outputWidth) && options.outputWidth > 0
    ? Math.round(options.outputWidth)
    : width;
  const outputHeight = Number.isFinite(options.outputHeight) && options.outputHeight > 0
    ? Math.round(options.outputHeight)
    : height;
  const activeItems = pathItems.filter((item) => item.shape);
  if (!activeItems.length) {
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${outputWidth}" height="${outputHeight}"></svg>`;
  }

  const parts = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${outputWidth}" height="${outputHeight}">`
  ];

  const fillItems = [];
  const fillMeta = [];
  for (let i = 0; i < activeItems.length; i += 1) {
    const item = activeItems[i];
    if (item.shape.kind !== 'fill') {
      continue;
    }
    const color = normalizePathColor(item.color || '#000000');
    const styleKey = color;
    const loop = Array.isArray(item.rawLoop) && item.rawLoop.length >= 3
      ? item.rawLoop
      : (Array.isArray(item.shape.loop) && item.shape.loop.length >= 3 ? item.shape.loop : null);
    fillItems.push(item);
    fillMeta.push({
      item,
      order: i,
      color,
      styleKey,
      loop,
      fillMode: normalizeFillMode(item.fillMode),
      area: Math.abs(Number(item.area) || (loop ? polygonArea(loop) : 0))
    });
  }

  const fillComponentsByKey = new Map();
  const fillComponentKeyByPathId = new Map();
  const fillStyleBuckets = new Map();
  for (let i = 0; i < fillMeta.length; i += 1) {
    const meta = fillMeta[i];
    if (!fillStyleBuckets.has(meta.styleKey)) {
      fillStyleBuckets.set(meta.styleKey, []);
    }
    fillStyleBuckets.get(meta.styleKey).push(meta);
  }

  for (const bucket of fillStyleBuckets.values()) {
    for (let i = 0; i < bucket.length; i += 1) {
      const child = bucket[i];
      let parent = null;
      let parentArea = Number.POSITIVE_INFINITY;
      const samplePoint = Array.isArray(child.item.centroid) && child.item.centroid.length >= 2
        ? child.item.centroid
        : (Array.isArray(child.loop) && child.loop.length
          ? child.loop[0]
          : null);
      if (!samplePoint) {
        child.autoParent = null;
        child.parent = null;
        continue;
      }

      for (let j = 0; j < bucket.length; j += 1) {
        if (i === j) {
          continue;
        }
        const candidate = bucket[j];
        if (!Array.isArray(candidate.loop) || candidate.loop.length < 3) {
          continue;
        }
        if (!Number.isFinite(candidate.area) || candidate.area <= child.area + 0.5) {
          continue;
        }
        if (!pointInPolygon(samplePoint, candidate.loop)) {
          continue;
        }
        if (candidate.area < parentArea) {
          parent = candidate;
          parentArea = candidate.area;
        }
      }
      child.autoParent = parent;
    }

    for (let i = 0; i < bucket.length; i += 1) {
      const child = bucket[i];
      if (child.fillMode === 'solid') {
        child.parent = null;
      } else if (child.fillMode === 'cutout') {
        child.parent = child.autoParent || null;
      } else {
        child.parent = child.autoParent || null;
      }
    }

    for (let i = 0; i < bucket.length; i += 1) {
      const meta = bucket[i];
      let root = meta;
      while (root.parent) {
        root = root.parent;
      }
      const componentKey = `${meta.styleKey}|${root.item.id}`;
      if (!fillComponentsByKey.has(componentKey)) {
        fillComponentsByKey.set(componentKey, {
          color: meta.color,
          paths: [],
          firstOrder: meta.order
        });
      }
      const component = fillComponentsByKey.get(componentKey);
      component.paths.push(meta.item.shape.d);
      component.firstOrder = Math.min(component.firstOrder, meta.order);
      fillComponentKeyByPathId.set(meta.item.id, componentKey);
    }
  }

  const emittedFillComponents = new Set();
  for (let i = 0; i < activeItems.length; i += 1) {
    const item = activeItems[i];
    const color = normalizePathColor(item.color || '#000000');

    if (item.shape.kind === 'fill') {
      const componentKey = fillComponentKeyByPathId.get(item.id) || `${color}|${item.id}`;
      if (emittedFillComponents.has(componentKey)) {
        continue;
      }
      emittedFillComponents.add(componentKey);
      const component = fillComponentsByKey.get(componentKey) || {
        color,
        paths: [item.shape.d]
      };
      if (interactive) {
        parts.push(`  <path class="trace-shape trace-fill" data-ink="1" d="${component.paths.join(' ')}" fill="${component.color}" fill-rule="evenodd"/>`);
      } else {
        parts.push(`  <path d="${component.paths.join(' ')}" fill="${component.color}" fill-rule="evenodd"/>`);
      }
      continue;
    }

    if (item.shape.kind !== 'stroke') {
      continue;
    }

    let strokeElement = colorizeStrokeElement(item.shape.element, color);
    if (!interactive) {
      parts.push(`  ${strokeElement}`);
      continue;
    }

    const selected = mode === 'path' && item.id === selectedPathId;
    const className = `trace-shape trace-stroke${selected ? ' is-selected' : ''}`;
    const element = injectAttrsIntoShapeElement(strokeElement, `class="${className}" data-path-id="${item.id}" data-ink="1"`);
    parts.push(`  ${element}`);
  }

  if (interactive && mode === 'path') {
    for (let i = 0; i < fillItems.length; i += 1) {
      const item = fillItems[i];
      const selected = item.id === selectedPathId;
      parts.push(`  <path class="trace-hit${selected ? ' is-selected' : ''}" data-path-id="${item.id}" d="${item.shape.d}" fill="transparent" stroke="none" pointer-events="all"/>`);
      if (selected) {
        parts.push(`  <path class="trace-selection" d="${item.shape.d}" fill="none" stroke="#ef4444" stroke-width="1.4" vector-effect="non-scaling-stroke" pointer-events="none"/>`);
        if (item.customEditEnabled && Array.isArray(item.customPoints) && item.customPoints.length >= 3) {
          parts.push(`  <path class="trace-node-guides" d="${loopToPathCommand(item.customPoints)}" fill="none" stroke="#0ea5e9" stroke-width="1" stroke-dasharray="3 3" vector-effect="non-scaling-stroke" pointer-events="none"/>`);
          for (let nodeIndex = 0; nodeIndex < item.customPoints.length; nodeIndex += 1) {
            const node = item.customPoints[nodeIndex];
            const isDraggingNode = item.id === activeNodePathId && nodeIndex === activeNodeIndex;
            const isSmoothSelected = item.id === smoothNodePathId && smoothNodeSet.has(nodeIndex);
            const nodeClass = `trace-node${isDraggingNode ? ' is-dragging' : ''}${isSmoothSelected ? ' is-smooth-selected' : ''}`;
            parts.push(`  <circle class="${nodeClass}" data-path-id="${item.id}" data-node-index="${nodeIndex}" cx="${round(node[0])}" cy="${round(node[1])}" r="${NODE_HANDLE_BASE_RADIUS}" fill="#ffffff" stroke="#0ea5e9" stroke-width="1.1" vector-effect="non-scaling-stroke"/>`);
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

function colorizeStrokeElement(element, color) {
  if (/stroke="[^"]*"/.test(element)) {
    return element.replace(/stroke="[^"]*"/, `stroke="${color}"`);
  }
  return element;
}

function renderSvgPreview(svgText, resetView = false) {
  const safe = sanitizeSvgForPreview(svgText);
  elements.previewStage.innerHTML = safe || '<div class="placeholder">No SVG content.</div>';
  if (resetView) {
    resetPreviewViewport();
    return;
  }
  updatePreviewNodeHandleSizes();
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
  updatePreviewNodeHandleSizes();
}

function updatePreviewNodeHandleSizes() {
  const nodes = elements.previewStage.querySelectorAll('.trace-node');
  if (!nodes.length) {
    return;
  }

  const svg = elements.previewStage.querySelector('svg');
  if (!svg) {
    return;
  }

  const rect = svg.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return;
  }

  const viewBox = svg.viewBox?.baseVal;
  const vbWidth = Number.isFinite(viewBox?.width) && viewBox.width > 0 ? viewBox.width : state.sourceSize.width;
  const vbHeight = Number.isFinite(viewBox?.height) && viewBox.height > 0 ? viewBox.height : state.sourceSize.height;
  if (vbWidth <= 0 || vbHeight <= 0) {
    return;
  }

  const pixelsPerUnit = Math.min(rect.width / vbWidth, rect.height / vbHeight);
  if (!Number.isFinite(pixelsPerUnit) || pixelsPerUnit <= 0) {
    return;
  }

  const maxRadiusInSvgUnits = (NODE_HANDLE_MAX_DIAMETER_PX * 0.5) / pixelsPerUnit;
  const nodeRadius = Math.min(NODE_HANDLE_BASE_RADIUS, maxRadiusInSvgUnits);
  const radiusText = String(round(nodeRadius));
  for (let i = 0; i < nodes.length; i += 1) {
    nodes[i].setAttribute('r', radiusText);
  }
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
  clearNodeDragState();
  try {
    elements.previewWrap.releasePointerCapture(pointerId);
  } catch {
    // no-op
  }
}

function clearNodeDragState() {
  state.nodeDrag.active = false;
  state.nodeDrag.pointerId = null;
  state.nodeDrag.pathId = null;
  state.nodeDrag.nodeIndex = -1;
  state.nodeDrag.undoRecorded = false;
  setNodeDragVisualState(false);
  const draggingNodes = elements.previewStage.querySelectorAll('.trace-node.is-dragging');
  for (let i = 0; i < draggingNodes.length; i += 1) {
    draggingNodes[i].classList.remove('is-dragging');
  }
}

function setNodeDragVisualState(active) {
  const isActive = Boolean(active);
  elements.previewWrap.classList.toggle('is-node-dragging', isActive);
  document.body.classList.toggle('is-node-dragging', isActive);
}

async function copySvgToClipboard() {
  const exportText = await getSvgForExport();
  if (!exportText) {
    return;
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(exportText);
    } else {
      const copied = fallbackCopyText(exportText);
      if (!copied) {
        throw new Error('Clipboard API unavailable and fallback copy failed.');
      }
    }
    setStatus('SVG copied to clipboard.');
  } catch (error) {
    const copied = fallbackCopyText(exportText);
    if (copied) {
      setStatus('SVG copied to clipboard.');
      return;
    }
    console.error(error);
    setStatus('Clipboard write failed in this browser context.', true);
  }
}

function fallbackCopyText(text) {
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '-9999px';
    area.style.left = '-9999px';
    document.body.append(area);
    area.focus();
    area.select();
    area.setSelectionRange(0, area.value.length);
    const copied = document.execCommand('copy');
    area.remove();
    return Boolean(copied);
  } catch {
    return false;
  }
}

async function downloadSvgFile() {
  const exportText = await getSvgForExport();
  if (!exportText) {
    return;
  }

  const blob = new Blob([exportText], { type: 'image/svg+xml;charset=utf-8' });
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
  updateSvgSizeLabel();
}

function updateSvgSizeLabel() {
  if (!elements.svgSize) {
    return;
  }
  const text = state.svgOptimize.text || state.svgRawText || state.svgText || '';
  const bytes = text ? byteLengthUtf8(text) : 0;
  elements.svgSize.textContent = formatBytesFriendly(bytes);
}

function byteLengthUtf8(text) {
  if (!text) {
    return 0;
  }
  try {
    return new TextEncoder().encode(text).length;
  } catch {
    return text.length;
  }
}

function formatBytesFriendly(bytes) {
  const safe = Math.max(0, Number(bytes) || 0);
  if (safe < 1024) {
    return `${safe} B`;
  }
  if (safe < 1024 * 1024) {
    const kb = safe / 1024;
    return `${kb >= 10 ? kb.toFixed(0) : kb.toFixed(1)} KB`;
  }
  const mb = safe / (1024 * 1024);
  return `${mb >= 10 ? mb.toFixed(0) : mb.toFixed(1)} MB`;
}

function setStatus(message, isError = false, options = {}) {
  if (elements.status) {
    elements.status.textContent = message;
    elements.status.classList.toggle('error', isError);
  }

  const shouldToast = options.toast ?? true;
  if (!shouldToast) {
    return;
  }
  showToast(message, isError, options);
}

function showToast(message, isError = false, options = {}) {
  if (!elements.toastRoot) {
    return;
  }

  const toast = document.createElement('div');
  toast.className = 'toast';
  if (isError) {
    toast.classList.add('is-error');
    toast.setAttribute('role', 'alert');
  } else {
    toast.setAttribute('role', 'status');
  }
  toast.setAttribute('data-toast-id', String(++state.toastSeq));
  toast.textContent = String(message || '');
  elements.toastRoot.append(toast);

  requestAnimationFrame(() => {
    toast.classList.add('is-visible');
  });

  const duration = clamp(
    Number(options.duration ?? (isError ? 4200 : 2400)),
    900,
    10000
  );
  const dismiss = () => dismissToast(toast);
  const timeoutId = window.setTimeout(dismiss, duration);
  toast.addEventListener('click', () => {
    window.clearTimeout(timeoutId);
    dismissToast(toast);
  }, { once: true });
}

function dismissToast(toast) {
  if (!toast || !toast.isConnected) {
    return;
  }
  toast.classList.remove('is-visible');
  window.setTimeout(() => {
    if (toast.isConnected) {
      toast.remove();
    }
  }, 160);
}

function drawPlaceholder() {
  state.pathItems = [];
  state.selectedPathId = null;
  state.hoveredPathId = null;
  deactivateNodeSmoothMode(null);
  closePathContextMenu();
  if (state.nodeDrag.active && state.nodeDrag.pointerId != null) {
    stopNodeDrag(state.nodeDrag.pointerId);
  } else {
    clearNodeDragState();
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
  applyPreviewBackgroundContrast(null);
  applyOnionSkinState();
  renderPathList();
  setStatus('Waiting for image input.', false, { toast: false });
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

function setRawSvgText(rawText) {
  const text = typeof rawText === 'string' ? rawText : '';
  state.svgRawText = text;
  state.svgText = text;
  if (state.svgOptimize.timer) {
    window.clearTimeout(state.svgOptimize.timer);
    state.svgOptimize.timer = null;
  }
  if (!text) {
    state.svgOptimize.raw = '';
    state.svgOptimize.text = '';
    state.svgOptimize.promise = null;
    updateSvgSizeLabel();
    return;
  }
  state.svgOptimize.timer = window.setTimeout(() => {
    state.svgOptimize.timer = null;
    requestSvgOptimization(text);
  }, 120);
  updateSvgSizeLabel();
}

let svgoOptimizeFnPromise = null;

function loadSvgoOptimizeFunction() {
  if (!svgoOptimizeFnPromise) {
    svgoOptimizeFnPromise = import('./vendor/svgo.browser.js')
      .then((module) => (typeof module.optimize === 'function' ? module.optimize : null))
      .catch(() => null);
  }
  return svgoOptimizeFnPromise;
}

async function optimizeSvgText(rawText) {
  if (!rawText) {
    return '';
  }
  const optimize = await loadSvgoOptimizeFunction();
  if (typeof optimize !== 'function') {
    return rawText;
  }
  try {
    const result = optimize(rawText);
    if (result && typeof result.data === 'string' && result.data.length > 0) {
      return result.data;
    }
  } catch (error) {
    console.warn('SVGO optimization failed; using raw SVG.', error);
  }
  return rawText;
}

function requestSvgOptimization(rawText) {
  const text = typeof rawText === 'string' ? rawText : '';
  if (!text) {
    if (state.svgOptimize.timer) {
      window.clearTimeout(state.svgOptimize.timer);
      state.svgOptimize.timer = null;
    }
    state.svgOptimize.raw = '';
    state.svgOptimize.text = '';
    state.svgOptimize.promise = null;
    return Promise.resolve('');
  }

  if (state.svgOptimize.raw === text) {
    if (state.svgOptimize.text) {
      state.svgText = state.svgOptimize.text;
      return Promise.resolve(state.svgOptimize.text);
    }
    if (state.svgOptimize.promise) {
      return state.svgOptimize.promise;
    }
  }

  state.svgOptimize.raw = text;
  state.svgOptimize.text = '';
  const jobText = text;
  const promise = optimizeSvgText(jobText)
    .then((optimized) => {
      if (state.svgOptimize.raw !== jobText) {
        return state.svgOptimize.text || state.svgRawText || '';
      }
      state.svgOptimize.text = optimized || jobText;
      state.svgText = state.svgOptimize.text;
      updateSvgSizeLabel();
      return state.svgOptimize.text;
    })
    .catch(() => {
      if (state.svgOptimize.raw === jobText) {
        state.svgOptimize.text = jobText;
        state.svgText = jobText;
        updateSvgSizeLabel();
      }
      return jobText;
    });

  state.svgOptimize.promise = promise;
  return promise;
}

async function getSvgForExport() {
  const raw = state.svgRawText || state.svgText || '';
  if (!raw) {
    return '';
  }

  if (state.svgOptimize.raw !== raw) {
    await requestSvgOptimization(raw);
  } else if (state.svgOptimize.promise && !state.svgOptimize.text) {
    await state.svgOptimize.promise;
  }

  return state.svgOptimize.text || raw;
}

function normalizeHexColor(value) {
  if (typeof value !== 'string') {
    return '#000000';
  }
  const trimmed = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(trimmed)) {
    return trimmed;
  }
  if (/^#[0-9a-f]{3}$/.test(trimmed)) {
    return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
  }
  if (/^#[0-9a-f]{8}$/.test(trimmed)) {
    return `#${trimmed.slice(1, 7)}`;
  }
  if (/^#[0-9a-f]{4}$/.test(trimmed)) {
    return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
  }

  const resolved = normalizeCssColorString(trimmed);
  if (/^#[0-9a-f]{6}$/.test(resolved)) {
    return resolved;
  }
  const rgbMatch = resolved.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
  if (rgbMatch) {
    const r = clamp(Math.round(Number(rgbMatch[1])), 0, 255).toString(16).padStart(2, '0');
    const g = clamp(Math.round(Number(rgbMatch[2])), 0, 255).toString(16).padStart(2, '0');
    const b = clamp(Math.round(Number(rgbMatch[3])), 0, 255).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  }
  return '#000000';
}

function normalizePathColor(value) {
  const rgba = parseColorToRgba(value);
  if (!rgba) {
    return '#000000';
  }
  return rgbaToCssHex(rgba.r, rgba.g, rgba.b, rgba.a);
}

function parseColorToRgba(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }

  const hex = parseHexColor(trimmed);
  if (hex) {
    return hex;
  }

  const resolved = normalizeCssColorString(trimmed);
  if (!resolved) {
    return null;
  }

  const resolvedHex = parseHexColor(resolved);
  if (resolvedHex) {
    return resolvedHex;
  }

  const rgbaMatch = resolved.match(/^rgba?\(([^)]+)\)$/);
  if (!rgbaMatch) {
    return null;
  }
  const parts = rgbaMatch[1].split(',').map((part) => part.trim());
  if (parts.length < 3) {
    return null;
  }
  const r = clamp(Math.round(Number(parts[0])), 0, 255);
  const g = clamp(Math.round(Number(parts[1])), 0, 255);
  const b = clamp(Math.round(Number(parts[2])), 0, 255);
  let a = 1;
  if (parts.length >= 4) {
    const parsedAlpha = Number(parts[3]);
    if (Number.isFinite(parsedAlpha)) {
      a = clamp(parsedAlpha, 0, 1);
    }
  }
  return { r, g, b, a };
}

function parseHexColor(value) {
  if (/^#[0-9a-f]{3}$/.test(value)) {
    return {
      r: parseInt(`${value[1]}${value[1]}`, 16),
      g: parseInt(`${value[2]}${value[2]}`, 16),
      b: parseInt(`${value[3]}${value[3]}`, 16),
      a: 1
    };
  }
  if (/^#[0-9a-f]{4}$/.test(value)) {
    return {
      r: parseInt(`${value[1]}${value[1]}`, 16),
      g: parseInt(`${value[2]}${value[2]}`, 16),
      b: parseInt(`${value[3]}${value[3]}`, 16),
      a: parseInt(`${value[4]}${value[4]}`, 16) / 255
    };
  }
  if (/^#[0-9a-f]{6}$/.test(value)) {
    return {
      r: parseInt(value.slice(1, 3), 16),
      g: parseInt(value.slice(3, 5), 16),
      b: parseInt(value.slice(5, 7), 16),
      a: 1
    };
  }
  if (/^#[0-9a-f]{8}$/.test(value)) {
    return {
      r: parseInt(value.slice(1, 3), 16),
      g: parseInt(value.slice(3, 5), 16),
      b: parseInt(value.slice(5, 7), 16),
      a: parseInt(value.slice(7, 9), 16) / 255
    };
  }
  return null;
}

function rgbaToCssHex(r, g, b, a = 1) {
  const rr = clamp(Math.round(r), 0, 255).toString(16).padStart(2, '0');
  const gg = clamp(Math.round(g), 0, 255).toString(16).padStart(2, '0');
  const bb = clamp(Math.round(b), 0, 255).toString(16).padStart(2, '0');
  const alpha = clamp(Number(a), 0, 1);
  const aa = clamp(Math.round(alpha * 255), 0, 255).toString(16).padStart(2, '0');
  return aa === 'ff' ? `#${rr}${gg}${bb}` : `#${rr}${gg}${bb}${aa}`;
}

function setColorInputValue(input, colorValue) {
  if (!input) {
    return;
  }
  const isNativeColor = input.tagName === 'INPUT' && input.type === 'color';
  const normalized = isNativeColor
    ? normalizeHexColor(colorValue || '#000000')
    : normalizePathColor(colorValue || '#000000');
  try {
    input.value = normalized;
  } catch {
    // no-op
  }
  input.setAttribute('value', normalized);
}

let colorParseCtx = null;

function normalizeCssColorString(value) {
  try {
    if (!colorParseCtx) {
      const canvas = document.createElement('canvas');
      colorParseCtx = canvas.getContext('2d');
    }
    if (!colorParseCtx) {
      return '';
    }
    colorParseCtx.fillStyle = '#000000';
    colorParseCtx.fillStyle = value;
    return String(colorParseCtx.fillStyle || '').trim().toLowerCase();
  } catch {
    return '';
  }
}

function rgbToHex(rgb) {
  if (!Array.isArray(rgb) || rgb.length < 3) {
    return '#000000';
  }
  const r = clamp(Math.round(rgb[0]), 0, 255).toString(16).padStart(2, '0');
  const g = clamp(Math.round(rgb[1]), 0, 255).toString(16).padStart(2, '0');
  const b = clamp(Math.round(rgb[2]), 0, 255).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
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
