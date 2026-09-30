/**
 * The device-bound key-encryption key.
 *
 * Generated as a **non-extractable** AES-256 key and stored as a live
 * `CryptoKey` object in IndexedDB. Chrome keeps the raw bytes inside its own
 * crypto engine: no JavaScript — ours, a compromised page's, or another
 * extension's — can read them, and copying the extension's storage JSON yields
 * nothing usable.
 *
 * What it is not: hardware-bound. Someone with read access to the Chrome
 * profile directory and the right tooling can still recover it. That is the
 * honest trade for never asking the user to type anything, and why the
 * passphrase mode exists alongside it.
 */
const DB_NAME = 'authx-keys';
const DB_VERSION = 1;
const STORE = 'kek';
const RECORD_ID = 'device';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open the key store.'));
  });
}

function transact<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const request = run(transaction.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Key store request failed.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Key store transaction aborted.'));
  });
}

async function readKey(): Promise<CryptoKey | null> {
  const db = await openDatabase();
  try {
    const stored = await transact<CryptoKey | undefined>(db, 'readonly', (store) =>
      store.get(RECORD_ID),
    );
    // A record that is not a CryptoKey means the store was tampered with or
    // written by an older build; treat it as absent rather than trusting it.
    return stored instanceof CryptoKey ? stored : null;
  } finally {
    db.close();
  }
}

export async function getDeviceKey(): Promise<CryptoKey | null> {
  try {
    return await readKey();
  } catch {
    return null;
  }
}

export async function createDeviceKey(): Promise<CryptoKey> {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  const db = await openDatabase();
  try {
    await transact(db, 'readwrite', (store) => store.put(key, RECORD_ID));
  } finally {
    db.close();
  }
  return key;
}

export async function getOrCreateDeviceKey(): Promise<CryptoKey> {
  return (await getDeviceKey()) ?? (await createDeviceKey());
}

/** Only ever called when the vault it protects is being deleted too. */
export async function destroyDeviceKey(): Promise<void> {
  const db = await openDatabase();
  try {
    await transact(db, 'readwrite', (store) => store.delete(RECORD_ID));
  } finally {
    db.close();
  }
}
