// Save disks.
//
// The game has no save files: the party lives on the Britannia disk, which it writes as it plays
// (PRTY, ROST and LIST when the party quits, TLST on entering a towne). Players kept the master
// untouched and played on copies. Keeping that shape, as Wizardry's port does, a save is a whole
// copy of the Britannia disk, so there is nothing to decide about what is worth keeping, and two
// parties on two disks cannot disturb each other. A copy is 140 KB.

/** How many a player may keep. Whole copies, so this bounds the room they take. */
export const MAXIMUM_SAVE_DISKS: number = 6;


export interface ISaveDiskSummary {
  readonly id: string;
  /** What the player calls it. */
  readonly name: string;
  readonly createdAt: number;
  readonly playedAt: number;
}


export interface ISaveDisk extends ISaveDiskSummary {
  /** The Britannia disk's image, in DOS order. */
  readonly image: Uint8Array;
}


/** Somewhere to keep save disks. The game uses the browser's; tests use one held in memory. */
export interface ISaveDiskStore {
  list(): Promise<ISaveDisk[]>;
  read(id: string): Promise<ISaveDisk | null>;
  put(disk: ISaveDisk): Promise<void>;
  remove(id: string): Promise<void>;
}


export class InMemorySaveDiskStore implements ISaveDiskStore {
  private readonly disks: Map<string, ISaveDisk> = new Map<string, ISaveDisk>();


  public list(): Promise<ISaveDisk[]> {
    return Promise.resolve([ ...this.disks.values() ]);
  }


  public read(id: string): Promise<ISaveDisk | null> {
    return Promise.resolve(this.disks.get(id) ?? null);
  }


  public put(disk: ISaveDisk): Promise<void> {
    this.disks.set(disk.id, disk);

    return Promise.resolve();
  }


  public remove(id: string): Promise<void> {
    this.disks.delete(id);

    return Promise.resolve();
  }
}


export type NewDiskResult =
  | { readonly ok: true; readonly disk: ISaveDisk }
  | { readonly ok: false; readonly message: string };


/** Counts disks made in this session, so the last resort below still tells them apart. */
let disksMade: number = 0;


function newIdentifier(): string {
  const random: Crypto | undefined = globalThis.crypto;
  let id: string;

  if (random?.randomUUID != null) {
    id = random.randomUUID();
  } else {
    disksMade = disksMade + 1;
    id = `disk-${ Date.now() }-${ disksMade }`;
  }

  return id;
}


/** The player's shelf of save disks: what is on it, and the rules about adding to it. */
export class SaveDiskLibrary {
  constructor(private readonly store: ISaveDiskStore, private readonly limit: number = MAXIMUM_SAVE_DISKS) {
  }


  /** Most recently played first, which is the order a player looks for them in. */
  public async list(): Promise<ISaveDiskSummary[]> {
    return (await this.store.list())
      .map((disk: ISaveDisk): ISaveDiskSummary => ({ id: disk.id, name: disk.name, createdAt: disk.createdAt, playedAt: disk.playedAt }))
      .sort((first: ISaveDiskSummary, second: ISaveDiskSummary): number => second.playedAt - first.playedAt);
  }


  public read(id: string): Promise<ISaveDisk | null> {
    return this.store.read(id);
  }


  /** A name not already taken, so the shelf stays tellable apart. */
  public async suggestName(): Promise<string> {
    const taken: ReadonlySet<string> = new Set<string>((await this.store.list()).map((disk: ISaveDisk): string => disk.name));
    let number: number = 1;

    while (taken.has(`DISK ${ number }`)) {
      number = number + 1;
    }

    return `DISK ${ number }`;
  }


  /** A new save disk holding `image`: the master's Britannia disk, or an exported save disk brought back. */
  public async create(image: Uint8Array, name: string): Promise<NewDiskResult> {
    let result: NewDiskResult;

    if ((await this.store.list()).length >= this.limit) {
      result = { ok: false, message: `There is room for ${ this.limit } save disks. Discard one to make another.` };
    } else {
      const now: number = Date.now();
      const disk: ISaveDisk = { id: newIdentifier(), name: name.trim() || await this.suggestName(), createdAt: now, playedAt: now, image: image.slice() };

      await this.store.put(disk);
      result = { ok: true, disk };
    }

    return result;
  }


  /** Keeps what the game has written, and notes that this disk was the one played. */
  public async save(disk: ISaveDisk, image: Uint8Array): Promise<ISaveDisk> {
    const saved: ISaveDisk = { ...disk, image, playedAt: Date.now() };

    await this.store.put(saved);

    return saved;
  }


  public async rename(id: string, name: string): Promise<void> {
    const disk: ISaveDisk | null = await this.store.read(id);

    if ((disk != null) && (name.trim().length > 0)) {
      await this.store.put({ ...disk, name: name.trim() });
    }
  }


  public remove(id: string): Promise<void> {
    return this.store.remove(id);
  }
}
