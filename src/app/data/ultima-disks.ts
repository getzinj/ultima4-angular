import { DiskImage, DiskImageError, prodosToDosOrder, unwrapImage } from './disk-image';
import type { IUnwrappedImage } from './disk-image';
import { Dos33Disk, Dos33Error } from './dos33';
import type { IBinaryFile } from './dos33';

// The four Ultima IV disks, told apart the way the game tells them apart: each has a small file
// called DISK that BLOAD puts over zero page $D0, `disk_id` (`SUBS.s` `request_disk`).

export type UltimaDiskName = 'program' | 'britannia' | 'towne' | 'underworld';

export const DISK_NAMES: readonly UltimaDiskName[] = [ 'program', 'britannia', 'towne', 'underworld' ];

const DISK_ID_ADDRESS: number = 0xD0;

export const DISK_IDS: Readonly<Record<UltimaDiskName, number>> = {
  program: 1,
  britannia: 2,
  towne: 3,
  underworld: 4,
};

/** The DOS files each disk must have, from the remaster's Makefile. */
export const REQUIRED_FILES: Readonly<Record<UltimaDiskName, readonly string[]>> = {
  program: [
    'ANIM', 'BGND', 'BOOT', 'CRDS', 'DISK', 'HTXT', 'INIT', 'MBSI', 'MBSM',
    'MUSB', 'MUSC', 'MUSD', 'MUSO', 'MUST', 'NLST', 'NPRT', 'NRST', 'SEL',
    'SHP0', 'SHP1', 'SUBS', 'TBLS', 'ULT4',
    'FAIR.SPK', 'GYPS.SPK', 'LOOK.SPK', 'PRTL.SPK', 'TABL.SPK', 'TREE.SPK', 'WAGN.SPK',
    'NEWGAME',
  ],
  britannia: [
    'CAMP', 'CONB', 'CONC', 'COND', 'CONE', 'CONF', 'CONG', 'CONH', 'CONI', 'CONO', 'CONP', 'CONR', 'CONS', 'CONT',
    'DISK', 'HELP', 'HOLE', 'LIST', 'LORD', 'MIX', 'MUSB', 'MUSO', 'PRTY', 'ROST', 'SAVE', 'SEAR',
    'SHRI', 'SHRN', 'TLST', 'TMAP', 'USE',
  ],
  towne: [
    'CONA', 'CONB', 'CONC', 'COND', 'CONF', 'CONG', 'CONH', 'CONO', 'CONR', 'CONS',
    'DISK', 'MAP@',
    'MAPA', 'MAPB', 'MAPC', 'MAPD', 'MAPE', 'MAPF', 'MAPG', 'MAPH',
    'MAPI', 'MAPJ', 'MAPK', 'MAPL', 'MAPM', 'MAPN', 'MAPO', 'MAPP',
    'MIX', 'MUSC', 'MUST', 'SEAR', 'SHP0', 'SHP1', 'SHP2', 'SHP3', 'SHP4',
    'SHP5', 'SHP6', 'SHP7', 'SHP8', 'SHP9', 'SHPS', 'TALK', 'TMAP', 'USE',
  ],
  underworld: [
    'CAMP', 'CON0', 'CON1', 'CON2', 'CON3', 'CON4', 'CON5', 'CON6', 'DISK',
    'DNG0', 'DNG1', 'DNG2', 'DNG3', 'DNG4', 'DNG5', 'DNG6', 'DNG7', 'DNGD',
    'END', 'HOLE', 'MIX', 'MUSB', 'MUSD', 'SEAR', 'TMAP', 'USE', 'CSTRING',
  ],
};

/** How many tracks from track 0 each disk keeps as raw sectors, outside any DOS file. */
export const RAW_TRACKS: Readonly<Record<UltimaDiskName, number>> = {
  program: 3,
  britannia: 16,
  towne: 16,
  underworld: 11,
};


export class UltimaDiskError extends Error {
}


export interface IIdentifiedDisk {
  readonly name: UltimaDiskName;
  readonly dos: Dos33Disk;
}


/**
 * The image read each way its order allows, keeping those with a DOS 3.3 VTOC. DOS sectors 0 and 15
 * sit at the same offset in both orders, so the VTOC alone cannot say which is right.
 */
function dos33Readings(unwrapped: IUnwrappedImage): Dos33Disk[] {
  const orders: readonly ('dos' | 'prodos')[] = unwrapped.declaredOrder == null ? [ 'dos', 'prodos' ] : [ unwrapped.declaredOrder ];

  return orders
    .map((order: 'dos' | 'prodos'): Dos33Disk => new Dos33Disk(new DiskImage(order === 'dos' ? unwrapped.sectors : prodosToDosOrder(unwrapped.sectors))))
    .filter((disk: Dos33Disk): boolean => disk.hasDos33Vtoc);
}


function diskIdOf(disk: Dos33Disk): number | null {
  let id: number | null = null;

  if (disk.find('DISK') != null) {
    const file: IBinaryFile = disk.readBinary('DISK');
    const index: number = DISK_ID_ADDRESS - file.address;

    if ((index >= 0) && (index < file.data.length)) {
      id = file.data[index];
    }
  }

  return id;
}


/** Reads an image file the player handed over and says which Ultima IV disk it is, or why it is none. */
export function identifyDisk(fileName: string, file: Uint8Array): IIdentifiedDisk {
  const readings: Dos33Disk[] = dos33Readings(unwrapImage(fileName, file));
  let identified: IIdentifiedDisk | null = null;
  let unreadable: string | null = null;

  for (const dos of readings) {
    if (identified == null) {
      try {
        const id: number | null = diskIdOf(dos);
        const name: UltimaDiskName | undefined = DISK_NAMES.find((candidate: UltimaDiskName): boolean => DISK_IDS[candidate] === id);

        if (name != null) {
          identified = { name, dos };
        }
      } catch (thrown: unknown) {
        unreadable = (thrown as Error).message;
      }
    }
  }

  if (readings.length === 0) {
    throw new UltimaDiskError(`${ fileName } is not a DOS 3.3 disk, so it cannot be an Ultima IV disk.`);
  } else if (identified == null) {
    throw new UltimaDiskError(unreadable == null
      ? `${ fileName } is a DOS 3.3 disk but not one of the four Ultima IV disks (no DISK file naming it).`
      : `${ fileName }: its DISK file cannot be read (${ unreadable }).`);
  } else {
    const disk: IIdentifiedDisk = identified;
    const missing: string[] = REQUIRED_FILES[disk.name].filter((required: string): boolean => disk.dos.find(required) == null);

    if (missing.length > 0) {
      throw new UltimaDiskError(`${ fileName } is the ${ disk.name } disk, but it is missing ${ missing.join(', ') }.`);
    } else {
      return disk;
    }
  }
}


export interface IDiskSetResult {
  readonly disks: Partial<Record<UltimaDiskName, Dos33Disk>>;
  readonly problems: readonly string[];
}


/** Sorts a handful of image files into the four disks, collecting a reason for each one refused. */
export function identifyDiskSet(files: readonly { readonly name: string; readonly bytes: Uint8Array }[]): IDiskSetResult {
  const disks: Partial<Record<UltimaDiskName, Dos33Disk>> = {};
  const problems: string[] = [];

  for (const file of files) {
    try {
      const identified: IIdentifiedDisk = identifyDisk(file.name, file.bytes);

      if (disks[identified.name] != null) {
        problems.push(`${ file.name } is a second ${ identified.name } disk; the first one is kept.`);
      } else {
        disks[identified.name] = identified.dos;
      }
    } catch (thrown: unknown) {
      if ((thrown instanceof DiskImageError) || (thrown instanceof UltimaDiskError) || (thrown instanceof Dos33Error)) {
        problems.push(thrown.message);
      } else {
        throw thrown;
      }
    }
  }

  for (const name of DISK_NAMES) {
    if (disks[name] == null) {
      problems.push(`The ${ name } disk is still needed.`);
    }
  }

  return { disks, problems };
}
