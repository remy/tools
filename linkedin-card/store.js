// Remembers the design (localStorage) and the background image (IndexedDB)
// so a reload picks up where you left off.

const STATE_KEY = 'linkedin-card.state';
const DB_NAME = 'linkedin-card';
const STORE = 'files';
const IMAGE_KEY = 'background';

export function loadState() {
  try {
    return JSON.parse(localStorage.getItem(STATE_KEY)) ?? null;
  } catch {
    return null;
  }
}

let saveTimer;
export function saveState(state) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify(state));
    } catch {
      // Storage full or unavailable: the design just won't survive a reload.
    }
  }, 300);
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => {
      db.close();
      resolve(req?.result);
    };
    t.onerror = () => {
      db.close();
      reject(t.error);
    };
  });
}

export const loadImageBlob = () => tx('readonly', (s) => s.get(IMAGE_KEY)).catch(() => null);
export const saveImageBlob = (blob) => tx('readwrite', (s) => s.put(blob, IMAGE_KEY)).catch(() => {});
export const clearImageBlob = () => tx('readwrite', (s) => s.delete(IMAGE_KEY)).catch(() => {});
