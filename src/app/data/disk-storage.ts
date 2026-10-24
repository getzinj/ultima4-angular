import type { UltimaDiskName } from './ultima-disks';

// The four master disk images the player imported, kept in this browser's IndexedDB so they are
// asked for only once. Nothing here is sent anywhere. Storage being unavailable, as it is in some
// private windows, counts as having nothing stored: the player can still import and play.

const DATABASE_NAME: string = 'ultima4';
const DATABASE_VERSION: number = 1;
const MASTER_STORE: string = 'masters';
const MASTER_KEY: string = 'masters';

export type MasterImages = Readonly<Record<UltimaDiskName, Uint8Array>>;


function openDatabase(): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve: (database: IDBDatabase) => void, reject: (reason: unknown) => void): void => {
    const request: IDBOpenDBRequest = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = (): void => {
      if (!request.result.objectStoreNames.contains(MASTER_STORE)) {
        request.result.createObjectStore(MASTER_STORE);
      }
    };
    request.onsuccess = (): void => resolve(request.result);
    request.onerror = (): void => reject(request.error ?? new Error('could not open local storage'));
  });
}


async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database: IDBDatabase = await openDatabase();

  return new Promise<T>((resolve: (value: T) => void, reject: (reason: unknown) => void): void => {
    const request: IDBRequest<T> = action(database.transaction(MASTER_STORE, mode).objectStore(MASTER_STORE));

    request.onsuccess = (): void => {
      resolve(request.result);
      database.close();
    };
    request.onerror = (): void => {
      reject(request.error ?? new Error('local storage failed'));
      database.close();
    };
  });
}


export async function loadMasterImages(): Promise<MasterImages | null> {
  try {
    return await run<MasterImages | undefined>('readonly', (store: IDBObjectStore): IDBRequest<MasterImages | undefined> => store.get(MASTER_KEY)) ?? null;
  } catch {
    return null;
  }
}


export async function storeMasterImages(images: MasterImages): Promise<boolean> {
  try {
    await run<IDBValidKey>('readwrite', (store: IDBObjectStore): IDBRequest<IDBValidKey> => store.put(images, MASTER_KEY));

    return true;
  } catch {
    return false;
  }
}


export async function forgetMasterImages(): Promise<void> {
  try {
    await run<undefined>('readwrite', (store: IDBObjectStore): IDBRequest<undefined> => store.delete(MASTER_KEY));
  } catch {
    // Nothing to undo: the player will just be asked for the disks again.
  }
}
