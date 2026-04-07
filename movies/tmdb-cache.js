export class TMDBIndexedDBCache {
  constructor() {
    this.dbName = 'brighton-cinema-planner';
    this.storeName = 'tmdb-movie-cache';
    this.dbPromise = null;
    this.supported = typeof indexedDB !== 'undefined';
  }

  async openDb() {
    if (!this.supported) return null;
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      // also check if the store name exist and if it doesn't create it (handles case where db exists but store doesn't, e.g. from older version)
      const dbCheckRequest = indexedDB.open(this.dbName);
      dbCheckRequest.onsuccess = () => {
        const db = dbCheckRequest.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.close();
          indexedDB.deleteDatabase(this.dbName);
          this.dbPromise = null;
          resolve(this.openDb());
        } else {
          db.close();
          resolve(request.result);
        }
      };

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'id' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }).catch(() => null);

    return this.dbPromise;
  }

  async get(id) {
    const db = await this.openDb();
    if (!db) return null;

    return new Promise((resolve) => {
      const tx = db.transaction(this.storeName, 'readonly');
      const request = tx.objectStore(this.storeName).get(id);
      request.onsuccess = () => resolve(request.result?.value || null);
      request.onerror = () => resolve(null);
    });
  }

  async set(id, value) {
    const db = await this.openDb();
    if (!db) return;

    await new Promise((resolve) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const request = tx.objectStore(this.storeName).put({
        id,
        value,
        updatedAt: Date.now(),
      });
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  }

  async clear() {
    const db = await this.openDb();
    if (!db) return;

    await new Promise((resolve) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const request = tx.objectStore(this.storeName).clear();
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });

    // Invalidate cached db promise so it reopens fresh next time
    this.dbPromise = null;
  }
}
