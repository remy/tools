// Long-press drag-to-reorder for the note list.
//
// Installed onto NotesApp.prototype as a mixin (see app.js) so the methods keep
// `this` as the component and can read `this.notes`, call `this.render()` and
// persist via `this.persistNoteOrder()` exactly as before. A press has to be
// held still for PRESS_DELAY ms before it becomes a drag, so scrolling the list
// and tapping a note behave normally.

const PRESS_DELAY = 220;
const MOVE_TOLERANCE = 6;

export const dragMethods = {
  blockNextNoteActivation() {
    this.ignoreNextNoteClick = true;
    window.setTimeout(() => {
      this.ignoreNextNoteClick = false;
    }, 0);
  },

  handleListPressStart(event) {
    if (this.dragState || this.pendingDrag) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const card = event.target?.closest('.note-card');
    if (!card || !card.dataset.noteId) return;
    const isTouchEvent = event.type === 'touchstart';
    if (!isTouchEvent && event.button !== 0) return;

    const point = this.getPointFromEvent(event);
    if (!point) return;

    this.pendingDrag = {
      inputType: isTouchEvent ? 'touch' : 'mouse',
      identifier: point.identifier ?? null,
      startX: point.clientX,
      startY: point.clientY,
      lastPoint: point,
      card,
      timeoutId: window.setTimeout(() => {
        if (this.pendingDrag) {
          this.startDrag(this.pendingDrag);
        }
      }, PRESS_DELAY),
    };

    this.addPendingEventListeners(this.pendingDrag.inputType);
  },

  handlePendingPressMove(event) {
    if (
      !this.pendingDrag ||
      !this.eventMatchesInput(event, this.pendingDrag.inputType)
    ) {
      return;
    }
    const point = this.getPointFromEvent(
      event,
      this.pendingDrag.inputType === 'touch'
        ? this.pendingDrag.identifier
        : undefined
    );
    if (!point) return;
    this.pendingDrag.lastPoint = point;
    const dx = point.clientX - this.pendingDrag.startX;
    const dy = point.clientY - this.pendingDrag.startY;
    if (Math.abs(dx) > MOVE_TOLERANCE || Math.abs(dy) > MOVE_TOLERANCE) {
      this.clearPendingDragState();
    }
  },

  handlePendingPressEnd(event) {
    if (
      !this.pendingDrag ||
      !this.eventMatchesInput(event, this.pendingDrag.inputType)
    ) {
      return;
    }
    if (
      this.pendingDrag.inputType === 'touch' &&
      event.type !== 'touchcancel'
    ) {
      const point = this.getPointFromEvent(
        event,
        this.pendingDrag.identifier
      );
      if (!point) {
        return;
      }
      this.pendingDrag.lastPoint = point;
    }
    this.clearPendingDragState();
  },

  addPendingEventListeners(inputType) {
    if (inputType === 'touch') {
      window.addEventListener('touchmove', this.handlePendingPressMove, {
        passive: false,
      });
      window.addEventListener('touchend', this.handlePendingPressEnd);
      window.addEventListener('touchcancel', this.handlePendingPressEnd);
    } else {
      window.addEventListener('mousemove', this.handlePendingPressMove);
      window.addEventListener('mouseup', this.handlePendingPressEnd);
    }
  },

  removePendingEventListeners(inputType) {
    if (inputType === 'touch') {
      window.removeEventListener('touchmove', this.handlePendingPressMove);
      window.removeEventListener('touchend', this.handlePendingPressEnd);
      window.removeEventListener('touchcancel', this.handlePendingPressEnd);
    } else {
      window.removeEventListener('mousemove', this.handlePendingPressMove);
      window.removeEventListener('mouseup', this.handlePendingPressEnd);
    }
  },

  clearPendingDragState() {
    if (!this.pendingDrag) return;
    if (this.pendingDrag.timeoutId) {
      clearTimeout(this.pendingDrag.timeoutId);
    }
    this.removePendingEventListeners(this.pendingDrag.inputType);
    this.pendingDrag = null;
  },

  startDrag(pendingDrag) {
    if (!pendingDrag) {
      this.clearPendingDragState();
      return;
    }
    const { card } = pendingDrag;
    const list = this.querySelector('.note-list');
    if (!card || !list) {
      this.clearPendingDragState();
      return;
    }
    const noteId = card.dataset.noteId;
    const startIndex = this.notes.findIndex((note) => note.id === noteId);
    if (startIndex < 0) {
      this.clearPendingDragState();
      return;
    }

    const rect = card.getBoundingClientRect();
    const placeholder = document.createElement('div');
    placeholder.className = 'note-card note-card--placeholder';
    placeholder.style.height = `${rect.height}px`;
    placeholder.style.width = `${rect.width}px`;

    list.insertBefore(placeholder, card);
    list.dataset.dragging = 'true';

    card.classList.add('note-card--dragging');
    card.style.width = `${rect.width}px`;
    card.style.height = `${rect.height}px`;
    card.style.position = 'fixed';
    card.style.left = `${rect.left}px`;
    card.style.top = `${rect.top}px`;
    card.style.zIndex = '100';
    card.style.pointerEvents = 'none';
    card.style.transition = 'none';

    const originPoint =
      pendingDrag.lastPoint || {
        clientX: pendingDrag.startX,
        clientY: pendingDrag.startY,
      };
    this.dragState = {
      inputType: pendingDrag.inputType,
      identifier: pendingDrag.identifier,
      card,
      placeholder,
      list,
      pointerOffsetY: originPoint.clientY - rect.top,
      startIndex,
      currentIndex: startIndex,
      hasMoved: false,
      hasPointerMoved: false,
    };

    this.addDragEventListeners(pendingDrag.inputType);
    this.clearPendingDragState();
  },

  addDragEventListeners(inputType) {
    if (inputType === 'touch') {
      window.addEventListener('touchmove', this.handleDragMove, {
        passive: false,
      });
      window.addEventListener('touchend', this.handleDragEnd);
      window.addEventListener('touchcancel', this.handleDragEnd);
    } else {
      window.addEventListener('mousemove', this.handleDragMove);
      window.addEventListener('mouseup', this.handleDragEnd);
    }
  },

  removeDragEventListeners(inputType) {
    if (inputType === 'touch') {
      window.removeEventListener('touchmove', this.handleDragMove);
      window.removeEventListener('touchend', this.handleDragEnd);
      window.removeEventListener('touchcancel', this.handleDragEnd);
    } else {
      window.removeEventListener('mousemove', this.handleDragMove);
      window.removeEventListener('mouseup', this.handleDragEnd);
    }
  },

  handleDragMove(event) {
    if (
      !this.dragState ||
      !this.eventMatchesInput(event, this.dragState.inputType)
    ) {
      return;
    }
    const point = this.getPointFromEvent(
      event,
      this.dragState.inputType === 'touch' ? this.dragState.identifier : undefined
    );
    if (!point) return;
    event.preventDefault();
    const drag = this.dragState;
    drag.hasPointerMoved = true;
    const nextTop = point.clientY - drag.pointerOffsetY;
    drag.card.style.top = `${nextTop}px`;

    const siblings = Array.from(drag.list.children).filter(
      (child) => child !== drag.card
    );
    let inserted = false;
    for (const sibling of siblings) {
      if (sibling === drag.placeholder) continue;
      const rect = sibling.getBoundingClientRect();
      if (point.clientY < rect.top + rect.height / 2) {
        if (drag.placeholder.nextSibling !== sibling) {
          drag.list.insertBefore(drag.placeholder, sibling);
        }
        inserted = true;
        break;
      }
    }

    if (!inserted) {
      drag.list.appendChild(drag.placeholder);
    }

    const nextIndex = this.getPlaceholderIndex(drag);
    drag.currentIndex = nextIndex;
    if (nextIndex !== drag.startIndex) {
      drag.hasMoved = true;
    }
  },

  handleDragEnd(event) {
    if (
      !this.dragState ||
      !this.eventMatchesInput(event, this.dragState.inputType)
    ) {
      return;
    }
    const point =
      this.dragState.inputType === 'touch'
        ? this.getPointFromEvent(event, this.dragState.identifier)
        : { clientX: event.clientX, clientY: event.clientY };
    if (!point && event.type !== 'touchcancel') return;
    event.preventDefault();
    this.finalizeDragInteraction();
  },

  finalizeDragInteraction() {
    if (!this.dragState) return;
    const drag = this.dragState;
    this.dragState = null;

    this.removeDragEventListeners(drag.inputType);

    const targetIndex = this.getPlaceholderIndex(drag);
    this.cleanupDragArtifacts(drag);

    if (drag.hasPointerMoved || drag.hasMoved) {
      this.blockNextNoteActivation();
    }

    if (!drag.hasMoved || drag.startIndex === targetIndex) {
      return;
    }

    const moved = this.reorderNotesInMemory(drag.startIndex, targetIndex);
    if (!moved) return;

    this.render();
    this.persistNoteOrder();
  },

  cleanupDragArtifacts(drag) {
    if (!drag) return;
    drag.card.classList.remove('note-card--dragging');
    drag.card.style.position = '';
    drag.card.style.width = '';
    drag.card.style.height = '';
    drag.card.style.left = '';
    drag.card.style.top = '';
    drag.card.style.zIndex = '';
    drag.card.style.pointerEvents = '';
    drag.card.style.transition = '';
    drag.placeholder?.remove();
    if (drag.list?.dataset) {
      delete drag.list.dataset.dragging;
    }
  },

  eventMatchesInput(event, inputType) {
    const isTouch = event.type.startsWith('touch');
    return inputType === 'touch' ? isTouch : !isTouch;
  },

  getPointFromEvent(event, identifier) {
    if (event.type.startsWith('touch')) {
      const touch =
        typeof identifier === 'number'
          ? this.getTouchByIdentifier(event, identifier)
          : event.changedTouches?.[0];
      if (!touch) return null;
      return {
        clientX: touch.clientX,
        clientY: touch.clientY,
        identifier: touch.identifier,
      };
    }
    if (event.type === 'mousedown' && event.button !== 0) {
      return null;
    }
    return {
      clientX: event.clientX,
      clientY: event.clientY,
      identifier: null,
    };
  },

  getTouchByIdentifier(event, identifier) {
    if (typeof identifier !== 'number') return null;
    const findMatch = (list) =>
      list
        ? Array.from(list).find((touch) => touch.identifier === identifier)
        : null;
    return findMatch(event.changedTouches) || findMatch(event.touches) || null;
  },

  getPlaceholderIndex(drag) {
    if (!drag || !drag.list) return drag?.startIndex ?? 0;
    const children = Array.from(drag.list.children).filter(
      (child) => child !== drag.card
    );
    const placeholderIndex = children.indexOf(drag.placeholder);
    if (placeholderIndex === -1) {
      return drag.startIndex;
    }
    const notesBefore = children
      .slice(0, placeholderIndex)
      .filter((node) => node.dataset && node.dataset.noteId).length;
    return notesBefore;
  },
};
