// ── Constants ──
export const DB_NAME = 'todo-lists';

// ID prefixes for the single PouchDB datastore. Lists, items and templates all
// live in one DB so a single replication stream keeps everything in sync.
export const LIST_PREFIX = 'list:';
export const ITEM_PREFIX = 'item:';
export const TEMPLATE_PREFIX = 'template:';
export const SETTINGS_ID = 'settings';

// ── Mutable application state ──
// All modules import this same object reference.
export const state = {
  lists: [],          // [{ id, name, createdAt, order }]
  templates: [],      // [{ id, name, items: [text], createdAt }]
  items: [],          // items for the current list: { id, kind: 'item'|'heading', text, checked, order, ... }
  counts: {},         // listId -> { total, done } for the home view
  currentListId: null,
  view: 'home',       // 'home' (all lists) | 'list' (a single list)
};
