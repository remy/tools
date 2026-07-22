const WorkoutDB = (() => {
  const DB_NAME = 'workout-app';
  const DB_VERSION = 1;
  const STORE_NAME = 'workouts';
  const DATA_KEY = 'current';
  const PROGRESS_KEY = 'progress';

  function open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function get(key) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  async function put(key, value) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function del(key) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  return {
    // Workout definitions
    load: () => get(DATA_KEY),
    save: (data) => put(DATA_KEY, data),
    clear: () => del(DATA_KEY),
    // Per-day progress (completed sets)
    loadProgress: () => get(PROGRESS_KEY),
    saveProgress: (p) => put(PROGRESS_KEY, p),
    clearProgress: () => del(PROGRESS_KEY),
  };
})();
