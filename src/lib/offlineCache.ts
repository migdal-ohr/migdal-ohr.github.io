/**
 * Tiny IndexedDB key-value cache. Each computer keeps the last loaded
 * snapshot so the system opens instantly and stays readable offline.
 */
const DB = "migdal-ohr-cache";
const STORE = "kv";

const open = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

export const cacheSet = async (key: string, value: unknown) => {
  try {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ value, at: Date.now() }, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* cache is best-effort */
  }
};

export const cacheGet = async <T,>(key: string): Promise<{ value: T; at: number } | null> => {
  try {
    const db = await open();
    const out = await new Promise<{ value: T; at: number } | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve((req.result as { value: T; at: number }) ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return out;
  } catch {
    return null;
  }
};

export const cacheClear = async () => {
  try {
    indexedDB.deleteDatabase(DB);
  } catch {
    /* ignore */
  }
};
