import { DiskImage, SECTORS_PER_TRACK, SECTOR_SIZE, TRACKS } from './disk-image';

// DOS 3.3's file system: the VTOC at track 17 sector 0, a chain of catalog sectors holding seven
// 35-byte entries each, and for each file a chain of track/sector lists naming its data sectors,
// as *Beneath Apple DOS* describes them.

export const CATALOG_TRACK: number = 17;

const VTOC_SECTOR: number = 0;
const VTOC_CATALOG_TRACK: number = 1;
const VTOC_CATALOG_SECTOR: number = 2;
const VTOC_DOS_RELEASE: number = 3;
const VTOC_VOLUME: number = 6;
const VTOC_PAIRS_PER_LIST: number = 0x27;
const VTOC_TRACKS: number = 0x34;
const VTOC_SECTORS: number = 0x35;
const VTOC_BYTES_PER_SECTOR: number = 0x36;
const VTOC_BITMAP: number = 0x38;

const ENTRY_FIRST: number = 0x0B;
const ENTRY_SIZE: number = 35;
const ENTRIES_PER_SECTOR: number = 7;
const ENTRY_TYPE: number = 2;
const ENTRY_NAME: number = 3;
const NAME_LENGTH: number = 30;
const ENTRY_SECTOR_COUNT: number = 33;
const DELETED: number = 0xFF;
const LOCKED: number = 0x80;

const LIST_FIRST_PAIR: number = 0x0C;
const PAIRS_PER_LIST: number = 122;

export const FILE_TYPE_BINARY: number = 0x04;


export class Dos33Error extends Error {
}


export interface ICatalogEntry {
  /** The name with the high bits off, trailing spaces trimmed and control characters left out. */
  readonly name: string;
  readonly type: number;
  readonly locked: boolean;
  readonly sectorCount: number;
  readonly listTrack: number;
  readonly listSector: number;
  readonly catalogTrack: number;
  readonly catalogSector: number;
  readonly entryOffset: number;
}


export interface IBinaryFile {
  readonly address: number;
  readonly data: Uint8Array;
}


interface ISectorAddress {
  readonly track: number;
  readonly sector: number;
}


function nameOf(sector: Uint8Array, offset: number): string {
  let name: string = '';

  for (let index: number = 0; index < NAME_LENGTH; index++) {
    const character: number = sector[offset + index] & 0x7F;

    if (character >= 0x20) {
      name = name + String.fromCharCode(character);
    }
  }

  return name.trimEnd();
}


export class Dos33Disk {
  constructor(public readonly image: DiskImage) {
  }


  /** Whether the VTOC looks like DOS 3.3's: what tells a DOS-order image from a ProDOS-order one. */
  public get hasDos33Vtoc(): boolean {
    const vtoc: Uint8Array = this.vtoc;

    return (vtoc[VTOC_CATALOG_TRACK] === CATALOG_TRACK) &&
      (vtoc[VTOC_CATALOG_SECTOR] > 0) && (vtoc[VTOC_CATALOG_SECTOR] < SECTORS_PER_TRACK) &&
      (vtoc[VTOC_TRACKS] === TRACKS) && (vtoc[VTOC_SECTORS] === SECTORS_PER_TRACK);
  }


  public catalog(): ICatalogEntry[] {
    const entries: ICatalogEntry[] = [];
    let track: number = this.vtoc[VTOC_CATALOG_TRACK];
    let sector: number = this.vtoc[VTOC_CATALOG_SECTOR];
    const visited: Set<number> = new Set<number>();

    while ((track !== 0) && !visited.has((track * SECTORS_PER_TRACK) + sector)) {
      const data: Uint8Array = this.readChecked(track, sector);

      visited.add((track * SECTORS_PER_TRACK) + sector);

      for (let slot: number = 0; slot < ENTRIES_PER_SECTOR; slot++) {
        const offset: number = ENTRY_FIRST + (slot * ENTRY_SIZE);
        const listTrack: number = data[offset];

        if ((listTrack !== 0) && (listTrack !== DELETED)) {
          entries.push({
            name: nameOf(data, offset + ENTRY_NAME),
            type: data[offset + ENTRY_TYPE] & 0x7F,
            locked: (data[offset + ENTRY_TYPE] & LOCKED) !== 0,
            sectorCount: data[offset + ENTRY_SECTOR_COUNT] | (data[offset + ENTRY_SECTOR_COUNT + 1] << 8),
            listTrack,
            listSector: data[offset + 1],
            catalogTrack: track,
            catalogSector: sector,
            entryOffset: offset,
          });
        }
      }

      track = data[1];
      sector = data[2];
    }

    return entries;
  }


  public find(name: string): ICatalogEntry | null {
    return this.catalog().find((entry: ICatalogEntry): boolean => entry.name === name) ?? null;
  }


  /** Every data sector of a file, in order, as one buffer. */
  public readFile(entry: ICatalogEntry): Uint8Array {
    const sectors: ISectorAddress[] = this.dataSectors(entry);
    const bytes: Uint8Array = new Uint8Array(sectors.length * SECTOR_SIZE);

    sectors.forEach((address: ISectorAddress, index: number): void => {
      if (address.track !== 0) {
        bytes.set(this.readChecked(address.track, address.sector), index * SECTOR_SIZE);
      }
    });

    return bytes;
  }


  /** A binary file as BLOAD sees it: the load address and length its first four bytes give. */
  public readBinary(name: string): IBinaryFile {
    const entry: ICatalogEntry | null = this.find(name);

    if (entry == null) {
      throw new Dos33Error(`FILE NOT FOUND: ${ name }`);
    } else if (entry.type !== FILE_TYPE_BINARY) {
      throw new Dos33Error(`FILE TYPE MISMATCH: ${ name }`);
    } else {
      const bytes: Uint8Array = this.readFile(entry);
      const length: number = bytes[2] | (bytes[3] << 8);

      if (length > (bytes.length - 4)) {
        throw new Dos33Error(`${ name } says it is ${ length } bytes long but holds only ${ bytes.length - 4 }`);
      } else {
        return { address: bytes[0] | (bytes[1] << 8), data: bytes.slice(4, 4 + length) };
      }
    }
  }


  /**
   * BSAVE: writes a binary file, replacing one of the same name. Tracks below `reservedTracks` are
   * never given to it, because the game keeps raw data there that the VTOC may not mark as used.
   */
  public writeBinary(name: string, address: number, data: Uint8Array, reservedTracks: number = 0): void {
    const existing: ICatalogEntry | null = this.find(name);

    if ((existing != null) && existing.locked) {
      throw new Dos33Error(`FILE LOCKED: ${ name }`);
    } else if ((existing != null) && (existing.type !== FILE_TYPE_BINARY)) {
      throw new Dos33Error(`FILE TYPE MISMATCH: ${ name }`);
    } else {
      const content: Uint8Array = new Uint8Array(data.length + 4);

      content.set([ address & 0xFF, address >> 8, data.length & 0xFF, data.length >> 8 ]);
      content.set(data, 4);

      if (existing != null) {
        this.freeFile(existing);
      }
      this.storeFile(name, content, existing, reservedTracks);
    }
  }


  private get vtoc(): Uint8Array {
    return this.image.readSector(CATALOG_TRACK, VTOC_SECTOR);
  }


  private readChecked(track: number, sector: number): Uint8Array {
    if ((track >= TRACKS) || (sector >= SECTORS_PER_TRACK)) {
      throw new Dos33Error(`track ${ track } sector ${ sector } is off the disk`);
    } else {
      return this.image.readSector(track, sector);
    }
  }


  private trackSectorLists(entry: ICatalogEntry): ISectorAddress[] {
    const lists: ISectorAddress[] = [];
    let track: number = entry.listTrack;
    let sector: number = entry.listSector;

    while ((track !== 0) && (lists.length < (TRACKS * SECTORS_PER_TRACK))) {
      const list: Uint8Array = this.readChecked(track, sector);

      lists.push({ track, sector });
      track = list[1];
      sector = list[2];
    }

    return lists;
  }


  private dataSectors(entry: ICatalogEntry): ISectorAddress[] {
    const sectors: ISectorAddress[] = [];

    for (const listAddress of this.trackSectorLists(entry)) {
      const list: Uint8Array = this.readChecked(listAddress.track, listAddress.sector);

      for (let pair: number = 0; pair < PAIRS_PER_LIST; pair++) {
        sectors.push({ track: list[LIST_FIRST_PAIR + (pair * 2)], sector: list[LIST_FIRST_PAIR + (pair * 2) + 1] });
      }
    }

    while ((sectors.length > 0) && (sectors[sectors.length - 1].track === 0)) {
      sectors.pop();
    }

    return sectors;
  }


  private freeFile(entry: ICatalogEntry): void {
    for (const address of [ ...this.dataSectors(entry), ...this.trackSectorLists(entry) ]) {
      if (address.track !== 0) {
        this.setFree(address.track, address.sector, true);
      }
    }
  }


  private storeFile(name: string, content: Uint8Array, existing: ICatalogEntry | null, reservedTracks: number): void {
    const dataCount: number = Math.ceil(content.length / SECTOR_SIZE);
    const listCount: number = Math.max(1, Math.ceil(dataCount / PAIRS_PER_LIST));
    const allocated: ISectorAddress[] = this.allocate(dataCount + listCount, reservedTracks);
    const lists: ISectorAddress[] = allocated.slice(0, listCount);
    const data: ISectorAddress[] = allocated.slice(listCount);

    lists.forEach((listAddress: ISectorAddress, listIndex: number): void => {
      const list: Uint8Array = new Uint8Array(SECTOR_SIZE);
      const next: ISectorAddress | undefined = lists[listIndex + 1];
      const firstData: number = listIndex * PAIRS_PER_LIST;

      list[1] = next?.track ?? 0;
      list[2] = next?.sector ?? 0;
      list[5] = firstData & 0xFF;
      list[6] = firstData >> 8;
      data.slice(firstData, firstData + PAIRS_PER_LIST).forEach((address: ISectorAddress, pair: number): void => {
        list[LIST_FIRST_PAIR + (pair * 2)] = address.track;
        list[LIST_FIRST_PAIR + (pair * 2) + 1] = address.sector;
      });
      this.image.writeSector(listAddress.track, listAddress.sector, list);
    });

    data.forEach((address: ISectorAddress, index: number): void => {
      const sector: Uint8Array = new Uint8Array(SECTOR_SIZE);

      sector.set(content.subarray(index * SECTOR_SIZE, (index + 1) * SECTOR_SIZE));
      this.image.writeSector(address.track, address.sector, sector);
    });

    this.writeEntry(name, lists[0], dataCount + listCount, existing);
  }


  private writeEntry(name: string, list: ISectorAddress, sectorCount: number, existing: ICatalogEntry | null): void {
    const slot: ISectorAddress & { readonly offset: number } = existing != null
      ? { track: existing.catalogTrack, sector: existing.catalogSector, offset: existing.entryOffset }
      : this.freeEntry();
    const catalogSector: Uint8Array = this.image.readSector(slot.track, slot.sector).slice();

    catalogSector[slot.offset] = list.track;
    catalogSector[slot.offset + 1] = list.sector;
    catalogSector[slot.offset + ENTRY_TYPE] = FILE_TYPE_BINARY;
    for (let index: number = 0; index < NAME_LENGTH; index++) {
      catalogSector[slot.offset + ENTRY_NAME + index] = (index < name.length ? name.charCodeAt(index) : 0x20) | 0x80;
    }
    catalogSector[slot.offset + ENTRY_SECTOR_COUNT] = sectorCount & 0xFF;
    catalogSector[slot.offset + ENTRY_SECTOR_COUNT + 1] = sectorCount >> 8;
    this.image.writeSector(slot.track, slot.sector, catalogSector);
  }


  private freeEntry(): ISectorAddress & { readonly offset: number } {
    let track: number = this.vtoc[VTOC_CATALOG_TRACK];
    let sector: number = this.vtoc[VTOC_CATALOG_SECTOR];
    let found: (ISectorAddress & { readonly offset: number }) | null = null;

    while ((found == null) && (track !== 0)) {
      const data: Uint8Array = this.readChecked(track, sector);

      for (let slot: number = 0; (found == null) && (slot < ENTRIES_PER_SECTOR); slot++) {
        const offset: number = ENTRY_FIRST + (slot * ENTRY_SIZE);

        if ((data[offset] === 0) || (data[offset] === DELETED)) {
          found = { track, sector, offset };
        }
      }

      track = data[1];
      sector = data[2];
    }

    if (found == null) {
      throw new Dos33Error('DISK FULL: the catalog has no free entry');
    } else {
      return found;
    }
  }


  /** Free sectors searched outward from the catalog track, as DOS does, skipping reserved tracks. */
  private allocate(count: number, reservedTracks: number): ISectorAddress[] {
    const found: ISectorAddress[] = [];
    const tracks: number[] = [];

    for (let step: number = 1; step < TRACKS; step++) {
      tracks.push(CATALOG_TRACK + step, CATALOG_TRACK - step);
    }

    for (const track of tracks) {
      if ((track >= reservedTracks) && (track > 0) && (track < TRACKS)) {
        for (let sector: number = SECTORS_PER_TRACK - 1; (sector >= 0) && (found.length < count); sector--) {
          if (this.isFree(track, sector)) {
            found.push({ track, sector });
          }
        }
      }
    }

    if (found.length < count) {
      throw new Dos33Error('DISK FULL');
    } else {
      found.slice(0, count).forEach((address: ISectorAddress): void => this.setFree(address.track, address.sector, false));

      return found.slice(0, count);
    }
  }


  private bitmapPosition(track: number, sector: number): [ number, number ] {
    const byte: number = VTOC_BITMAP + (track * 4) + (sector >= 8 ? 0 : 1);

    return [ byte, 1 << (sector & 7) ];
  }


  private isFree(track: number, sector: number): boolean {
    const [ byte, bit ]: [ number, number ] = this.bitmapPosition(track, sector);

    return (this.vtoc[byte] & bit) !== 0;
  }


  private setFree(track: number, sector: number, free: boolean): void {
    const vtoc: Uint8Array = this.vtoc.slice();
    const [ byte, bit ]: [ number, number ] = this.bitmapPosition(track, sector);

    vtoc[byte] = free ? (vtoc[byte] | bit) : (vtoc[byte] & ~bit);
    this.image.writeSector(CATALOG_TRACK, VTOC_SECTOR, vtoc);
  }

}


/**
 * A blank DOS 3.3 disk: what INIT leaves, less the boot image. Tracks 0-2 (where DOS itself would
 * be) and the catalog track are marked used. Only tests and synthetic disks need it.
 */
export function formatDos33(volume: number = 254): DiskImage {
  const image: DiskImage = new DiskImage(new Uint8Array(TRACKS * SECTORS_PER_TRACK * SECTOR_SIZE));
  const vtoc: Uint8Array = new Uint8Array(SECTOR_SIZE);

  vtoc[VTOC_CATALOG_TRACK] = CATALOG_TRACK;
  vtoc[VTOC_CATALOG_SECTOR] = SECTORS_PER_TRACK - 1;
  vtoc[VTOC_DOS_RELEASE] = 3;
  vtoc[VTOC_VOLUME] = volume;
  vtoc[VTOC_PAIRS_PER_LIST] = PAIRS_PER_LIST;
  vtoc[VTOC_TRACKS] = TRACKS;
  vtoc[VTOC_SECTORS] = SECTORS_PER_TRACK;
  vtoc[VTOC_BYTES_PER_SECTOR] = 0x00;
  vtoc[VTOC_BYTES_PER_SECTOR + 1] = 0x01;
  for (let track: number = 3; track < TRACKS; track++) {
    if (track !== CATALOG_TRACK) {
      vtoc[VTOC_BITMAP + (track * 4)] = 0xFF;
      vtoc[VTOC_BITMAP + (track * 4) + 1] = 0xFF;
    }
  }
  image.writeSector(CATALOG_TRACK, VTOC_SECTOR, vtoc);

  for (let sector: number = SECTORS_PER_TRACK - 1; sector > 0; sector--) {
    const catalog: Uint8Array = new Uint8Array(SECTOR_SIZE);

    if (sector > 1) {
      catalog[1] = CATALOG_TRACK;
      catalog[2] = sector - 1;
    }
    image.writeSector(CATALOG_TRACK, sector, catalog);
  }

  return image;
}
