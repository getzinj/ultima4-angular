// A 140 KB floppy image, normalised to DOS 3.3 sector order: the order Ultima IV's own DOS reads,
// and the one the remaster builds its images in. Images written in ProDOS block order are put back
// into DOS order; images that record the disk's raw magnetic track (.nib, .woz) are refused, since
// copy protection lives there and a de-protected DOS-order copy is what the game needs.

export const SECTOR_SIZE: number = 256;
export const SECTORS_PER_TRACK: number = 16;
export const TRACKS: number = 35;
export const IMAGE_SIZE: number = TRACKS * SECTORS_PER_TRACK * SECTOR_SIZE;

const NIBBLE_IMAGE_SIZE: number = 232_960;
const TWO_IMG_HEADER_SIZE: number = 64;
const TWO_IMG_FORMAT_DOS: number = 0;
const TWO_IMG_FORMAT_PRODOS: number = 1;

/** The two DOS sectors that make up each 512-byte ProDOS block within a track. */
const BLOCK_SECTORS: readonly (readonly [ number, number ])[] = [
  [ 0, 14 ], [ 13, 12 ], [ 11, 10 ], [ 9, 8 ], [ 7, 6 ], [ 5, 4 ], [ 3, 2 ], [ 1, 15 ],
];

export type SectorOrder = 'dos' | 'prodos';


export class DiskImageError extends Error {
}


export function sectorOffset(track: number, sector: number): number {
  return ((track * SECTORS_PER_TRACK) + sector) * SECTOR_SIZE;
}


/** A ProDOS-order image rewritten in DOS order. */
export function prodosToDosOrder(image: Uint8Array): Uint8Array {
  const dos: Uint8Array = new Uint8Array(IMAGE_SIZE);

  for (let track: number = 0; track < TRACKS; track++) {
    for (let block: number = 0; block < BLOCK_SECTORS.length; block++) {
      const source: number = (track * SECTORS_PER_TRACK * SECTOR_SIZE) + (block * 2 * SECTOR_SIZE);
      const [ first, second ]: readonly [ number, number ] = BLOCK_SECTORS[block];

      dos.set(image.subarray(source, source + SECTOR_SIZE), sectorOffset(track, first));
      dos.set(image.subarray(source + SECTOR_SIZE, source + (2 * SECTOR_SIZE)), sectorOffset(track, second));
    }
  }

  return dos;
}


function startsWith(bytes: Uint8Array, text: string): boolean {
  let matches: boolean = bytes.length >= text.length;

  for (let index: number = 0; matches && (index < text.length); index++) {
    matches = bytes[index] === text.charCodeAt(index);
  }

  return matches;
}


function littleEndian32(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}


export interface IUnwrappedImage {
  readonly sectors: Uint8Array;

  /** The order the file declared, or null when only trying both can tell. */
  readonly declaredOrder: SectorOrder | null;
}


/**
 * The 143,360 bytes of sectors in an image file, with any 2IMG header taken off. Refuses what
 * cannot be a DOS 3.3 floppy, and says why in terms the player can act on.
 */
export function unwrapImage(fileName: string, file: Uint8Array): IUnwrappedImage {
  const lowerName: string = fileName.toLowerCase();

  if (startsWith(file, 'WOZ1') || startsWith(file, 'WOZ2') || lowerName.endsWith('.woz')) {
    throw new DiskImageError(`${ fileName } is a WOZ image, which records the raw disk. Use a de-protected DOS-order copy (.do or .dsk).`);
  } else if ((file.length === NIBBLE_IMAGE_SIZE) || lowerName.endsWith('.nib')) {
    throw new DiskImageError(`${ fileName } is a nibble image, which records the raw disk. Use a de-protected DOS-order copy (.do or .dsk).`);
  } else if (startsWith(file, '2IMG')) {
    const format: number = littleEndian32(file, 12);
    const dataOffset: number = littleEndian32(file, 24);
    const dataLength: number = littleEndian32(file, 28);

    if (((format !== TWO_IMG_FORMAT_DOS) && (format !== TWO_IMG_FORMAT_PRODOS)) || (dataLength !== IMAGE_SIZE)) {
      throw new DiskImageError(`${ fileName } is a 2IMG file that does not hold a 140 KB floppy.`);
    } else {
      return {
        sectors: file.slice(dataOffset || TWO_IMG_HEADER_SIZE, (dataOffset || TWO_IMG_HEADER_SIZE) + IMAGE_SIZE),
        declaredOrder: format === TWO_IMG_FORMAT_DOS ? 'dos' : 'prodos',
      };
    }
  } else if (file.length !== IMAGE_SIZE) {
    throw new DiskImageError(`${ fileName } is ${ file.length.toLocaleString('en') } bytes; a 140 KB floppy image is ${ IMAGE_SIZE.toLocaleString('en') }.`);
  } else if (lowerName.endsWith('.po')) {
    return { sectors: file.slice(), declaredOrder: 'prodos' };
  } else if (lowerName.endsWith('.do')) {
    return { sectors: file.slice(), declaredOrder: 'dos' };
  } else {
    return { sectors: file.slice(), declaredOrder: null };
  }
}


/** A floppy in DOS sector order, read and written by track and sector. */
export class DiskImage {
  constructor(public readonly bytes: Uint8Array) {
  }


  public readSector(track: number, sector: number): Uint8Array {
    const start: number = sectorOffset(track, sector);

    return this.bytes.subarray(start, start + SECTOR_SIZE);
  }


  public writeSector(track: number, sector: number, data: Uint8Array): void {
    this.bytes.set(data.subarray(0, SECTOR_SIZE), sectorOffset(track, sector));
  }


  /** A run of whole tracks from track 0, as the game reads its raw-sector areas. */
  public readTracks(count: number): Uint8Array {
    return this.bytes.slice(0, count * SECTORS_PER_TRACK * SECTOR_SIZE);
  }

}
