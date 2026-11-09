import { PouchStore, HIGH } from '/lib/pouch-store.js';
import { createSyncConfig } from '/lib/sync-config.js';

export const DB_NAME = 'notes';
export const NOTE_PREFIX = 'note:';

// No legacyPrefix: this tool never had its own flat sync keys.
const { getSyncConfig, setSyncConfig } = createSyncConfig({ key: 'notes' });

export { getSyncConfig, setSyncConfig };

// ── Document <-> model mappers ──
function noteToDoc(note) {
  return {
    _id: NOTE_PREFIX + note.id,
    type: 'note',
    id: note.id,
    title: note.title ?? '',
    body: note.body ?? '',
    order: Number.isFinite(note.order) ? note.order : 0,
    updatedAt: note.updatedAt ?? Date.now(),
  };
}

function noteFromDoc(doc) {
  return {
    id: doc.id ?? doc._id.slice(NOTE_PREFIX.length),
    title: doc.title ?? '',
    body: doc.body ?? '',
    order: Number.isFinite(doc.order) ? doc.order : 0,
    updatedAt: doc.updatedAt ?? 0,
  };
}

// The fields a note is compared on before writing. Skipping unchanged docs
// matters more here than it would with plain IndexedDB: every write is a new
// revision that replicates to every other device, and rewriting a note that
// didn't change can clobber a concurrent edit made elsewhere.
function sameNote(doc, note) {
  return doc.title === note.title
    && doc.body === note.body
    && doc.order === note.order
    && doc.updatedAt === note.updatedAt;
}

// Every note is one doc in one PouchDB, so a single replication stream keeps
// them all in sync. Connection lifecycle, status and manual sync operations
// come from PouchStore — only the note mappers and queries live here.
class NotesDB extends PouchStore {
  constructor() {
    super({
      dbName: DB_NAME,
      label: 'notes',
      prefixes: [NOTE_PREFIX],
      getConfig: getSyncConfig,
    });
  }

  getNotes() {
    return this.getRange(NOTE_PREFIX, noteFromDoc);
  }

  async putNote(note) {
    await this.putWithRev(noteToDoc(note));
  }

  // Upsert many notes in one bulk write, touching only the ones that differ
  // from what is stored (typically just the handful a reorder moved).
  async putNotes(notes) {
    if (!notes.length) return;
    const db = await this.open();
    const res = await db.allDocs({
      include_docs: true,
      startkey: NOTE_PREFIX,
      endkey: NOTE_PREFIX + HIGH,
    });
    const existing = new Map(res.rows.map((r) => [r.id, r.doc]));
    const docs = [];
    for (const note of notes) {
      const doc = noteToDoc(note);
      const prev = existing.get(doc._id);
      if (prev) {
        if (sameNote(prev, doc)) continue;
        doc._rev = prev._rev;
      }
      docs.push(doc);
    }
    if (docs.length) await db.bulkDocs(docs);
  }

  async deleteNote(id) {
    await this.removeById(NOTE_PREFIX + id);
  }

  // Delete every note and write `notes` in their place, as one bulk write.
  async replaceNotes(notes) {
    const db = await this.open();
    const deletes = await this.deletionsForRange(NOTE_PREFIX);
    const incoming = new Map(notes.map((n) => [NOTE_PREFIX + n.id, noteToDoc(n)]));
    const docs = [];
    // A note being replaced by one with the same id becomes an update rather
    // than a delete-then-recreate, which bulkDocs would reject as a conflict.
    for (const del of deletes) {
      const doc = incoming.get(del._id);
      if (doc) {
        doc._rev = del._rev;
        docs.push(doc);
        incoming.delete(del._id);
      } else {
        docs.push(del);
      }
    }
    docs.push(...incoming.values());
    if (docs.length) await db.bulkDocs(docs);
  }
}

export const db = new NotesDB();
