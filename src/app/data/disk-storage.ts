import type { ISaveDisk, ISaveDiskStore } from './save-disks';
import type { UltimaDiskName } from './ultima-disks';

// The four master disk images the player imported, kept in this browser's IndexedDB so they are
// asked for only once, and the save disks played from them. Nothing here is sent anywhere. Storage
// being unavailable, as it is in some private windows, counts as having nothing stored: the player
// can still import and play.

const DATABASE_NAME: string = 'ultima4';
/** Raised when a store is added. Version 1 held only the masters. */
const DATABASE_VERSION: number = 2;
const MASTER_STORE: string = 'masters';
const SAVE_DISK_STORE: string = 'disks';
const MASTER_KEY: string = 'masters';

export type MasterImages = Readonly<Record<UltimaDiskName, Uint8Array>>;


function openDatabase(): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve: (database: IDBDatabase) => void, reject: (reason: unknown) => void): void => {
    const request: IDBOpenDBRequest = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = (): void => {
      for (const store of [ MASTER_STORE, SAVE_DISK_STORE ]) {
        if (!request.result.objectStoreNames.contains(store)) {
          request.result.createObjectStore(store);
        }
      }
    };
    request.onsuccess = (): void => resolve(request.result);
    request.onerror = (): void => reject(request.error ?? new Error('could not open local storage'));
  });
}


async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>, storeName: string = MASTER_STORE): Promise<T> {
  const database: IDBDatabase = await openDatabase();

  return new Promise<T>((resolve: (value: T) => void, reject: (reason: unknown) => void): void => {
    const request: IDBRequest<T> = action(database.transaction(storeName, mode).objectStore(storeName));

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


/** The save disks, in the same database, keyed by id. */
export class BrowserSaveDiskStore implements ISaveDiskStore {
  public async list(): Promise<ISaveDisk[]> {
    try {
      return await run<ISaveDisk[]>('readonly', (store: IDBObjectStore): IDBRequest<ISaveDisk[]> => store.getAll() as IDBRequest<ISaveDisk[]>, SAVE_DISK_STORE);
    } catch {
      return [];
    }
  }


  public async read(id: string): Promise<ISaveDisk | null> {
    try {
      return await run<ISaveDisk | undefined>('readonly', (store: IDBObjectStore): IDBRequest<ISaveDisk | undefined> => store.get(id), SAVE_DISK_STORE) ?? null;
    } catch {
      return null;
    }
  }


  public async put(disk: ISaveDisk): Promise<void> {
    await run<IDBValidKey>('readwrite', (store: IDBObjectStore): IDBRequest<IDBValidKey> => store.put(disk, disk.id), SAVE_DISK_STORE);
  }


  public async remove(id: string): Promise<void> {
    await run<undefined>('readwrite', (store: IDBObjectStore): IDBRequest<undefined> => store.delete(id), SAVE_DISK_STORE);
  }
}


/**
 * Asks the browser not to throw this data away when it is short of room, which would lose a party.
 * A refusal is not worth reporting: there is nothing the player can do about it, and the game works.
 */
export async function requestDurableStorage(): Promise<boolean> {
  try {
    return await navigator.storage?.persist?.() ?? false;
  } catch {
    return false;
  }
}

