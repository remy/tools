// IndexedDB layer for the page editor.
// Two stores: `doc` holds the single working document ({ html, css }),
// `assets` holds dropped files keyed by a nice, human-readable name.
const PageDB = (() => {
  const DB_NAME = 'page-editor';
  const DB_VERSION = 1;
  const DOC_STORE = 'doc';
  const ASSET_STORE = 'assets';
  const DOC_KEY = 'current';

  function open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(DOC_STORE)) {
          db.createObjectStore(DOC_STORE);
        }
        if (!db.objectStoreNames.contains(ASSET_STORE)) {
          db.createObjectStore(ASSET_STORE, { keyPath: 'name' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function loadDoc() {
    const db = await open();
    return new Promise((resolve, reject) => {
      const req = db.transaction(DOC_STORE, 'readonly').objectStore(DOC_STORE).get(DOC_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function saveDoc(data) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DOC_STORE, 'readwrite');
      tx.objectStore(DOC_STORE).put(data, DOC_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function listAssets() {
    const db = await open();
    return new Promise((resolve, reject) => {
      const req = db.transaction(ASSET_STORE, 'readonly').objectStore(ASSET_STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function putAsset(asset) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(ASSET_STORE, 'readwrite');
      tx.objectStore(ASSET_STORE).put(asset);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function deleteAsset(name) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(ASSET_STORE, 'readwrite');
      tx.objectStore(ASSET_STORE).delete(name);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function renameAsset(oldName, asset) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(ASSET_STORE, 'readwrite');
      const store = tx.objectStore(ASSET_STORE);
      store.delete(oldName);
      store.put(asset);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  return { loadDoc, saveDoc, listAssets, putAsset, deleteAsset, renameAsset };
})();
