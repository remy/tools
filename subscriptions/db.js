import { DB_NAME, DB_VERSION } from './state.js';

class SubscriptionDB {
  constructor() {
    this.dbPromise = null;
  }

  openDb() {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('subscriptions')) {
          const store = db.createObjectStore('subscriptions', { keyPath: 'id' });
          store.createIndex('by-day', 'recurringDay', { unique: false });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.dbPromise;
  }

  async getAll() {
    const db = await this.openDb();
    return new Promise((resolve) => {
      const tx = db.transaction('subscriptions', 'readonly');
      const req = tx.objectStore('subscriptions').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  }

  async put(sub) {
    const db = await this.openDb();
    return new Promise((resolve) => {
      const tx = db.transaction('subscriptions', 'readwrite');
      tx.objectStore('subscriptions').put(sub);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  async delete(id) {
    const db = await this.openDb();
    return new Promise((resolve) => {
      const tx = db.transaction('subscriptions', 'readwrite');
      tx.objectStore('subscriptions').delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  async clearAll() {
    const db = await this.openDb();
    return new Promise((resolve) => {
      const tx = db.transaction('subscriptions', 'readwrite');
      tx.objectStore('subscriptions').clear();
      tx.oncomplete = () => resolve();
    });
  }

  async getSetting(key) {
    const db = await this.openDb();
    return new Promise((resolve) => {
      const tx = db.transaction('settings', 'readonly');
      const req = tx.objectStore('settings').get(key);
      req.onsuccess = () => resolve(req.result?.value ?? null);
      req.onerror = () => resolve(null);
    });
  }

  async setSetting(key, value) {
    const db = await this.openDb();
    return new Promise((resolve) => {
      const tx = db.transaction('settings', 'readwrite');
      tx.objectStore('settings').put({ key, value });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  async getAllSettings() {
    const db = await this.openDb();
    return new Promise((resolve) => {
      const tx = db.transaction('settings', 'readonly');
      const req = tx.objectStore('settings').getAll();
      req.onsuccess = () => {
        const map = {};
        for (const r of req.result || []) map[r.key] = r.value;
        resolve(map);
      };
      req.onerror = () => resolve({});
    });
  }

  async exportData() {
    const subs = await this.getAll();
    const s = await this.getAllSettings();
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: s,
      subscriptions: subs,
    };
  }

  async importData(data) {
    if (!data || data.version !== 1 || !Array.isArray(data.subscriptions)) {
      throw new Error('Invalid import file');
    }
    await this.clearAll();
    for (const sub of data.subscriptions) {
      await this.put(sub);
    }
    if (data.settings) {
      for (const [k, v] of Object.entries(data.settings)) {
        await this.setSetting(k, v);
      }
    }
  }
}

export const db = new SubscriptionDB();
