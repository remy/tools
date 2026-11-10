import '/text-reader/text-reader.wc.js';
import { db } from './db.js';
import { dragMethods } from './drag.js';
import { relativeLabel, fullLabel } from './relative-time.js';

// How often the list's relative "updated" labels are refreshed in place.
const LABEL_TICK = 60 * 1000;

const createId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `note-${Date.now()}-${Math.random().toString(16).slice(2)}`;

// Note bodies arrive from the sync server as well as from this device, so
// anything interpolated into markup is escaped — a body containing
// `</textarea>` must stay text, not become HTML.
const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const hasOrderValue = (note) =>
  typeof note?.order === 'number' && Number.isFinite(note.order);

const applySequentialOrder = (notes) =>
  notes.map((note, index) => ({ ...note, order: index }));

// Sort only — the stored order values are kept as they are. Rewriting every
// note's order on load would turn each launch into a burst of synced writes.
const sortNotes = (notes) =>
  [...notes].sort((a, b) => {
    const aHasOrder = hasOrderValue(a);
    const bHasOrder = hasOrderValue(b);
    if (aHasOrder && bHasOrder && a.order !== b.order) {
      return a.order - b.order;
    }
    if (aHasOrder && !bHasOrder) return -1;
    if (!aHasOrder && bHasOrder) return 1;
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });

const clampIndex = (value, max) => Math.max(0, Math.min(value, max));

class NotesApp extends HTMLElement {
  constructor() {
    super();
    this.notes = [];
    this.selectedId = null;
    this.editing = false;
    this.loading = true;
    this.syncError = '';
    this.wakeLockEnabled = false;
    this.wakeLockSentinel = null;
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
    this.handleWakeLockRelease = this.handleWakeLockRelease.bind(this);
    this.handlePopState = this.handlePopState.bind(this);
    this.pendingRoute = this.getRouteStateFromLocation();
    this.skipNextPopSave = false;
    this.editHistoryPushed = false;
    this.pendingDrag = null;
    this.dragState = null;
    this.ignoreNextNoteClick = false;
    this.handleListPressStart = this.handleListPressStart.bind(this);
    this.handlePendingPressMove = this.handlePendingPressMove.bind(this);
    this.handlePendingPressEnd = this.handlePendingPressEnd.bind(this);
    this.handleDragMove = this.handleDragMove.bind(this);
    this.handleDragEnd = this.handleDragEnd.bind(this);
  }

  connectedCallback() {
    this.render();
    this.initializeNotes();
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    window.addEventListener('popstate', this.handlePopState);
    this.ensureInitialHistoryState();
    this.labelTimer = setInterval(() => this.refreshTimeLabels(), LABEL_TICK);
  }

  disconnectedCallback() {
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    window.removeEventListener('popstate', this.handlePopState);
    clearInterval(this.labelTimer);
    this.releaseWakeLock();
  }

  get selectedNote() {
    return this.notes.find((note) => note.id === this.selectedId) ?? null;
  }

  deriveTitle(body) {
    const firstLine =
      body
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line.length > 0) ?? 'Untitled';
    return firstLine.slice(0, 80);
  }

  // Shown as a red dot on the settings cog so a failing sync is visible
  // without opening the dialog. Empty string means healthy.
  setSyncError(message) {
    if (this.syncError === message) return;
    this.syncError = message;
    const dot = this.querySelector('.sync-error-dot');
    const btn = this.querySelector('[data-action="open-settings"]');
    if (dot) dot.hidden = !message;
    if (btn) btn.title = message || 'Settings';
  }

  render() {
    const view = this.selectedId ? 'detail' : 'list';
    const wakeLockSupported = this.supportsWakeLock();
    const listContent = this.loading
      ? '<p class="note-list__empty">Loading…</p>'
      : this.notes.length
      ? this.notes.map((note) => this.renderNoteCard(note)).join('')
      : '<p class="note-list__empty">No notes yet. Tap “New note” to get started.</p>';
    const content = /* HTML */ `
      <div class="app-shell" data-view="${view}">
        <header class="app-bar">
          <h1 class="app-bar__eyebrow">Notebook</h1>
          <label class="wake-lock-toggle">
            <input
              type="checkbox"
              data-action="wake-lock"
              ${this.wakeLockEnabled ? 'checked' : ''}
              ${wakeLockSupported ? '' : 'disabled'}
              aria-label="Toggle wake lock"
            />
            <span>Wake lock</span>
          </label>
        </header>
        <section class="note-list" aria-label="Saved notes">
          ${listContent}
        </section>
        <div class="app-actions">
          <button
            class="settings-button"
            data-action="open-settings"
            aria-label="Settings"
            title="${escapeHtml(this.syncError || 'Settings')}"
          >
            <span class="icon-mask icon-settings" aria-hidden="true"></span>
            <span class="sync-error-dot" ${this.syncError ? '' : 'hidden'}></span>
          </button>
          <button class="new-note" data-action="create">New note</button>
        </div>
        ${this.selectedNote ? this.renderNoteDetail(this.selectedNote) : ''}
      </div>
    `;

    this.innerHTML = content;
    this.bindEvents();
    if (this.editing) {
      requestAnimationFrame(() => {
        this.querySelector('.note-view__editor')?.focus();
      });
    } else {
      const reader = this.querySelector('.note-view__reader');
      if (reader && typeof reader.updatePadding === 'function') {
        requestAnimationFrame(() => reader.updatePadding());
      }
    }
  }

  renderNoteCard(note) {
    const firstLine = (note.body || '').split('\n')[0]?.trim() || '';
    const previewSource = firstLine.startsWith('#')
      ? firstLine.slice(1).trim()
      : firstLine;
    const preview = previewSource || 'Tap to start writing';
    return /* HTML */ `
      <button class="note-card" data-note-id="${escapeHtml(note.id)}">
        <p class="note-card__preview">${escapeHtml(preview)}</p>
        <time
          class="note-card__meta"
          datetime="${new Date(note.updatedAt || 0).toISOString()}"
          data-ts="${Number(note.updatedAt) || 0}"
          title="Updated ${escapeHtml(fullLabel(note.updatedAt))}"
        >${escapeHtml(relativeLabel(note.updatedAt))}</time>
      </button>
    `;
  }

  renderNoteDetail(note) {
    const body = escapeHtml(note.body);
    const index = this.notes.indexOf(note);
    const prev = !this.editing && this.notes[index - 1];
    const next = !this.editing && this.notes[index + 1];
    return /* HTML */ `
      <section class="note-view" aria-label="Selected note">
        <div class="note-view__content">
          ${this.editing
            ? `<textarea class="note-view__editor" aria-label="Edit note">${body}</textarea>`
            : `<text-reader class="note-view__reader">${body}</text-reader>`}
        </div>
        <div class="note-view__chrome">
          <button
            class="note-view__icon-btn"
            data-action="prev-note"
            aria-label="Previous note"
            ${prev ? '' : 'disabled'}
          >
            <span class="icon-mask icon-prev" aria-hidden="true"></span>
          </button>
          <button
            class="note-view__icon-btn"
            data-action="next-note"
            aria-label="Next note"
            ${next ? '' : 'disabled'}
          >
            <span class="icon-mask icon-next" aria-hidden="true"></span>
          </button>
          <button
            class="note-view__icon-btn note-view__icon-btn--danger"
            data-action="delete-note"
            aria-label="Delete note"
          >
            <span class="icon-mask icon-trash" aria-hidden="true"></span>
          </button>
          <button class="note-view__action" data-action="toggle-edit">
            ${this.editing ? 'Done' : 'Edit'}
          </button>
        </div>
      </section>
    `;
  }

  async initializeNotes() {
    try {
      this.notes = sortNotes(await db.getNotes());
    } catch (error) {
      console.warn('Failed to load notes', error);
      this.notes = [];
    } finally {
      this.loading = false;
      this.applyRouteState({ route: this.pendingRoute });
      this.pendingRoute = null;
    }
  }

  // Re-read every note after a change landed in the local DB — a remote sync,
  // or this device's own write echoing back through the changes feed.
  //
  // Re-rendering replaces the whole component, so it is held back whenever it
  // would destroy something the user is in the middle of: the textarea while
  // editing (its unsaved text lives only in the DOM), or the reader's scroll
  // position while the open note itself hasn't changed. The list behind the
  // open note is redrawn when the note is closed.
  async refreshFromStore() {
    if (this.loading) return;
    let stored;
    try {
      stored = sortNotes(await db.getNotes());
    } catch (error) {
      console.warn('Refreshing notes failed', error);
      return;
    }

    const open = this.selectedNote;
    if (this.editing && open) {
      // Keep the note being edited as this device knows it; saving it will
      // write it back (and re-create it if another device deleted it).
      const others = stored.filter((note) => note.id !== open.id);
      const local = stored.find((note) => note.id === open.id) ?? open;
      this.notes = sortNotes([...others, { ...local, body: open.body }]);
      return;
    }

    const before = open?.body;
    this.notes = stored;
    if (open) {
      const after = this.selectedNote;
      if (after && after.body === before) return;
    }
    this.applyRouteState();
  }

  openSettings() {
    this.dispatchEvent(new CustomEvent('notes:open-settings', { bubbles: true }));
  }

  exportNotes() {
    const payload = JSON.stringify(
      this.notes.map(({ id, title, body, updatedAt, order }) => ({
        id,
        title,
        body,
        updatedAt,
        order,
      })),
      null,
      2
    );
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `notes-${new Date().toISOString()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  // Import a JSON array of notes, either merged in (skipping bodies that
  // already exist) or replacing everything. Returns true when it imported.
  async importNotes(text, { merge = true } = {}) {
    try {
      const data = JSON.parse(text);
      if (!Array.isArray(data)) {
        throw new Error('Invalid JSON structure');
      }

      const normalizedRaw = data
        .map((entry) => {
          if (!entry || typeof entry !== 'object') return null;
          const rawBody = entry.body;
          const body =
            typeof rawBody === 'string'
              ? rawBody
              : typeof rawBody === 'number' || typeof rawBody === 'boolean'
              ? String(rawBody)
              : '';
          const titleSource =
            typeof entry.title === 'string' && entry.title.trim().length
              ? entry.title
              : this.deriveTitle(body);
          const updatedAt =
            typeof entry.updatedAt === 'number' &&
            Number.isFinite(entry.updatedAt)
              ? entry.updatedAt
              : Date.now();
          const order =
            typeof entry.order === 'number' && Number.isFinite(entry.order)
              ? entry.order
              : null;

          return {
            id:
              typeof entry.id === 'string' && entry.id.trim().length
                ? entry.id
                : createId(),
            title: titleSource,
            body,
            updatedAt,
            order,
          };
        })
        .filter(Boolean);

      const normalized = applySequentialOrder(sortNotes(normalizedRaw));

      if (!normalized.length) {
        throw new Error('No notes found in JSON');
      }

      if (merge) {
        const existingBodies = new Set(
          this.notes.map((note) => (note.body ?? '').trim())
        );
        const existingIds = new Set(this.notes.map((note) => note.id));
        const deduped = normalized.filter((note) => {
          const bodyKey = (note.body ?? '').trim();
          if (existingBodies.has(bodyKey)) {
            return false;
          }
          existingBodies.add(bodyKey);
          return true;
        });

        if (!deduped.length) {
          alert('All imported notes already exist.');
          return false;
        }

        // Appended after the current last note. An imported id that collides
        // with a different local note gets a fresh one rather than
        // overwriting it.
        const base = this.notes.length
          ? Math.max(...this.notes.map((note) => note.order)) + 1
          : 0;
        const adjusted = deduped.map((note, index) => ({
          ...note,
          id: existingIds.has(note.id) ? createId() : note.id,
          order: base + index,
        }));
        await db.putNotes(adjusted);
      } else {
        await db.replaceNotes(normalized);
      }

      this.notes = sortNotes(await db.getNotes());
      if (!merge) {
        this.selectedId = null;
        this.editing = false;
        this.updateHistoryState(
          { noteId: null, editing: false },
          { replace: true }
        );
      }
      this.applyRouteState();
      return true;
    } catch (error) {
      console.warn('Import failed', error);
      alert(
        'Import failed. Please ensure the JSON file contains an array of notes.'
      );
      return false;
    }
  }

  bindEvents() {
    this.querySelectorAll('[data-note-id]').forEach((button) => {
      button.addEventListener('click', (event) => {
        if (this.ignoreNextNoteClick) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        this.handleSelect(button.dataset.noteId);
      });
    });

    this.querySelector('[data-action="create"]')?.addEventListener(
      'click',
      () => this.handleCreate()
    );

    this.querySelector('[data-action="toggle-edit"]')?.addEventListener(
      'click',
      () => this.handleToggleEdit()
    );

    this.querySelector('[data-action="prev-note"]')?.addEventListener(
      'click',
      () => this.handleStep(-1)
    );

    this.querySelector('[data-action="next-note"]')?.addEventListener(
      'click',
      () => this.handleStep(1)
    );

    this.querySelector('[data-action="delete-note"]')?.addEventListener(
      'click',
      () => this.handleDelete()
    );

    const wakeLockToggle = this.querySelector('[data-action="wake-lock"]');
    wakeLockToggle?.addEventListener('change', (event) => {
      this.handleWakeLockToggle(event.target.checked);
    });

    this.querySelector('[data-action="open-settings"]')?.addEventListener(
      'click',
      () => this.openSettings()
    );

    const noteList = this.querySelector('.note-list');
    noteList?.addEventListener('touchstart', this.handleListPressStart, {
      passive: false,
    });
    noteList?.addEventListener('mousedown', this.handleListPressStart);
  }

  handleSelect(noteId) {
    this.selectedId = noteId;
    this.editing = false;
    this.render();
    this.updateHistoryState({ noteId, editing: false });
    this.editHistoryPushed = false;
    this.skipNextPopSave = false;
  }

  // Step to the adjacent note. Replaces history so Back still returns to the list.
  handleStep(offset) {
    const index = this.notes.findIndex((note) => note.id === this.selectedId);
    const target = this.notes[index + offset];
    if (index < 0 || !target || this.editing) return;
    this.selectedId = target.id;
    this.render();
    this.updateHistoryState(
      { noteId: target.id, editing: false },
      { replace: true }
    );
  }

  async handleDelete() {
    if (!this.selectedNote) return;
    if (!confirm('Delete this note? This cannot be undone.')) return;

    const targetId = this.selectedId;
    // Remaining notes keep their order values — gaps sort the same, and
    // leaving them alone avoids rewriting (and re-syncing) every other note.
    this.notes = this.notes.filter((note) => note.id !== targetId);
    this.selectedId = null;
    this.editing = false;
    this.render();
    this.updateHistoryState(
      { noteId: null, editing: false },
      { replace: true }
    );
    this.editHistoryPushed = false;
    this.skipNextPopSave = false;

    try {
      await db.deleteNote(targetId);
    } catch (error) {
      console.warn('Failed to delete note', error);
    }
  }

  async handleCreate() {
    // New notes go to the top. Taking an order below the current minimum
    // means no other note has to be renumbered (and re-synced) to make room.
    const top = this.notes.length
      ? Math.min(...this.notes.map((note) => note.order)) - 1
      : 0;
    const newNote = {
      id: createId(),
      title: 'Untitled note',
      body: '',
      updatedAt: Date.now(),
      order: top,
    };

    this.notes = [newNote, ...this.notes];
    this.selectedId = newNote.id;
    this.editing = true;
    this.render();
    this.updateHistoryState({ noteId: newNote.id, editing: false });
    this.updateHistoryState({ noteId: newNote.id, editing: true });
    this.editHistoryPushed = true;
    this.skipNextPopSave = false;

    try {
      await db.putNote(newNote);
    } catch (error) {
      console.warn('Failed to create note', error);
    }
  }

  async handleToggleEdit() {
    if (!this.selectedNote) return;
    if (this.editing) {
      const textarea = this.querySelector('.note-view__editor');
      const nextValue = textarea?.value ?? this.selectedNote.body;
      // Leave edit mode before awaiting the write, so the change it echoes
      // back through the feed is free to re-render.
      this.editing = false;
      await this.persistNoteBody(this.selectedId, nextValue);
      this.render();
      if (this.editHistoryPushed) {
        this.skipNextPopSave = true;
        window.history.back();
        this.editHistoryPushed = false;
      } else {
        this.updateHistoryState(
          { noteId: this.selectedId, editing: false },
          { replace: true }
        );
      }
      return;
    }

    this.editing = true;
    this.render();
    const route = this.getRouteStateFromLocation();
    const alreadyEditing =
      route.noteId === this.selectedId && route.editing === true;
    if (!alreadyEditing) {
      this.updateHistoryState({ noteId: this.selectedId, editing: true });
      this.editHistoryPushed = true;
    } else {
      this.editHistoryPushed = false;
    }
  }

  async persistNoteBody(id, body) {
    const current = this.notes.find((note) => note.id === id);
    if (!current) return;
    // Nothing typed — don't mint a new revision just for opening the editor.
    if (current.body === body) return;

    const savedNote = {
      ...current,
      body,
      title: body ? this.deriveTitle(body) : current.title,
      updatedAt: Date.now(),
    };
    this.notes = this.notes.map((note) => (note.id === id ? savedNote : note));

    try {
      await db.putNote(savedNote);
    } catch (error) {
      console.warn('Failed to persist note', error);
    }
  }

  reorderNotesInMemory(fromIndex, toIndex) {
    if (
      fromIndex < 0 ||
      fromIndex >= this.notes.length ||
      typeof toIndex !== 'number'
    ) {
      return false;
    }
    const nextNotes = [...this.notes];
    const [moved] = nextNotes.splice(fromIndex, 1);
    const boundedIndex = clampIndex(toIndex, nextNotes.length);
    nextNotes.splice(boundedIndex, 0, moved);
    this.notes = applySequentialOrder(nextNotes);
    return true;
  }

  // Persist the current order. putNotes only writes the notes whose stored
  // order actually changed.
  async persistNoteOrder() {
    try {
      await db.putNotes(this.notes);
    } catch (error) {
      console.warn('Failed to save note order', error);
    }
  }

  getRouteStateFromLocation() {
    const url = new URL(window.location.href);
    const noteId = url.searchParams.get('note');
    const editing = url.searchParams.get('edit') === '1';
    return { noteId, editing };
  }

  ensureInitialHistoryState() {
    const route = this.getRouteStateFromLocation();
    if (!window.history.state) {
      window.history.replaceState(route, '', window.location.href);
    }
  }

  updateHistoryState(route, { replace = false } = {}) {
    const url = new URL(window.location.href);
    if (route.noteId) {
      url.searchParams.set('note', route.noteId);
      if (route.editing) {
        url.searchParams.set('edit', '1');
      } else {
        url.searchParams.delete('edit');
      }
    } else {
      url.searchParams.delete('note');
      url.searchParams.delete('edit');
    }
    const method = replace ? 'replaceState' : 'pushState';
    window.history[method](route, '', url);
  }

  handlePopState() {
    const nextRoute = this.getRouteStateFromLocation();
    if (this.editing && !nextRoute.editing) {
      if (this.skipNextPopSave) {
        this.skipNextPopSave = false;
      } else {
        this.persistDraftFromEditor();
      }
    }
    this.applyRouteState({ route: nextRoute });
    this.editHistoryPushed = false;
  }

  applyRouteState({ route = null } = {}) {
    const targetRoute = route ?? this.getRouteStateFromLocation();

    if (this.loading) {
      this.pendingRoute = targetRoute;
      return;
    }

    if (targetRoute.noteId) {
      const exists = this.notes.some((note) => note.id === targetRoute.noteId);
      if (!exists) {
        this.selectedId = null;
        this.editing = false;
        this.render();
        this.updateHistoryState(
          { noteId: null, editing: false },
          { replace: true }
        );
        return;
      }
      this.selectedId = targetRoute.noteId;
      this.editing = targetRoute.editing;
      this.render();
      return;
    }

    this.selectedId = null;
    this.editing = false;
    this.render();
  }

  persistDraftFromEditor() {
    if (!this.selectedNote) return;
    const textarea = this.querySelector('.note-view__editor');
    const nextValue = textarea?.value ?? this.selectedNote.body;
    if (this.selectedId) {
      this.persistNoteBody(this.selectedId, nextValue);
    }
  }

  // "5m ago" goes stale while the list sits open, so rewrite just the label
  // text on a timer rather than re-rendering the whole component (which would
  // disturb an open note or a drag in progress).
  refreshTimeLabels() {
    const now = Date.now();
    this.querySelectorAll('.note-card__meta[data-ts]').forEach((el) => {
      const label = relativeLabel(Number(el.dataset.ts), now);
      if (el.textContent !== label) el.textContent = label;
    });
  }

  supportsWakeLock() {
    return 'wakeLock' in navigator;
  }

  async handleWakeLockToggle(checked) {
    if (!this.supportsWakeLock()) {
      this.wakeLockEnabled = false;
      this.render();
      return;
    }

    this.wakeLockEnabled = checked;
    if (checked) {
      await this.requestWakeLock();
    } else {
      this.releaseWakeLock();
    }
    this.render();
  }

  async requestWakeLock() {
    if (!this.supportsWakeLock() || this.wakeLockSentinel) {
      return;
    }

    try {
      this.wakeLockSentinel = await navigator.wakeLock.request('screen');
      this.wakeLockSentinel.addEventListener(
        'release',
        this.handleWakeLockRelease
      );
    } catch (error) {
      console.warn('Wake lock request failed', error);
      this.wakeLockEnabled = false;
    }
  }

  releaseWakeLock() {
    if (!this.wakeLockSentinel) return;
    this.wakeLockSentinel.removeEventListener(
      'release',
      this.handleWakeLockRelease
    );
    this.wakeLockSentinel.release().catch(() => {});
    this.wakeLockSentinel = null;
  }

  handleWakeLockRelease() {
    if (this.wakeLockSentinel) {
      this.wakeLockSentinel.removeEventListener(
        'release',
        this.handleWakeLockRelease
      );
      this.wakeLockSentinel = null;
    }

    if (this.wakeLockEnabled && document.visibilityState === 'visible') {
      this.requestWakeLock();
    }
  }

  handleVisibilityChange() {
    if (document.visibilityState !== 'visible') return;
    this.refreshTimeLabels();
    if (this.wakeLockEnabled && !this.wakeLockSentinel) {
      this.requestWakeLock();
    }
  }
}

Object.assign(NotesApp.prototype, dragMethods);

customElements.define('notes-app', NotesApp);
