// =============================================
// Cook Planner — migrate.js
// One-time move of the pre-PouchDB snapshot into the database.
// =============================================

import { db, getSyncConfig } from './db.js';
import { decodeState } from './share-link.js';

// The key the tool wrote its whole state into before PouchDB. It is read once
// and then deliberately left in place: rolling back to the previous release
// should still find a working plan.
const LEGACY_KEY = 'cookplan_state';
const MIGRATED_KEY = 'cook-plan.migrated';

export async function migrateLegacy() {
  let done;
  try {
    done = localStorage.getItem(MIGRATED_KEY);
  } catch {
    return; // No storage, nothing to migrate from.
  }
  if (done) return;

  const legacy = decodeState(localStorage.getItem(LEGACY_KEY) || '');
  // Marked regardless of what was found: an empty or corrupt snapshot has
  // nothing to give and shouldn't be retried on every boot.
  try {
    localStorage.setItem(MIGRATED_KEY, '1');
  } catch {
    // Ignore — worst case the (idempotent) migration is attempted again.
  }
  if (!legacy || !legacy.items?.length) return;

  // localStorage is per-origin and every tool in this collection shares one, so
  // a second device coming to the new code has its own stale snapshot sitting
  // there. If a server is already configured it is the source of truth: pull
  // from it first, and only import when it turns out to have nothing.
  if (getSyncConfig().url) await db.reopen({ pullFirst: true });
  if (await db.hasData()) return;

  await db.replaceAll({ plan: legacy, items: legacy.items });
}
