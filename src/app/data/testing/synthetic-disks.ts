import type { ConversationText, IConversation } from '../conversations';
import { CONVERSATION_STRINGS, encodeRetailConversation } from '../conversations';
import { DATA_PATCHES } from '../data-patches';
import type { IDataPatch } from '../data-patches';
import type { DiskImage } from '../disk-image';
import { SECTOR_SIZE, SECTORS_PER_TRACK } from '../disk-image';
import { Dos33Disk, formatDos33 } from '../dos33';
import { DISK_IDS, DISK_NAMES, RAW_TRACKS, REQUIRED_FILES } from '../ultima-disks';
import type { UltimaDiskName } from '../ultima-disks';

// Four disks with the right catalogs and none of the game: every file holds filler, except where a
// data patch looks, which holds the bytes the patch expects, and the talk area holds made-up
// conversations in the retail layout. CI and the specs run on these, never on the real disks.

const FILLER_LENGTH: number = 16;


export function syntheticConversation(record: number): IConversation {
  return {
    text: Object.fromEntries(CONVERSATION_STRINGS.map((key: ConversationText): [ string, string ] => [ key, `${ key.toUpperCase() } ${ record }` ])) as Record<ConversationText, string>,
    keyword1: 'KEY1',
    keyword2: 'KEY2',
    trigger: 0,
    humilityQuestion: false,
    turnsAway: 0,
  };
}


function fillerFor(name: string, patches: readonly IDataPatch[]): Uint8Array {
  const length: number = Math.max(FILLER_LENGTH, ...patches.map((patch: IDataPatch): number => patch.offset + patch.match.length));
  const data: Uint8Array = new Uint8Array(length).fill(name.charCodeAt(0));

  for (const patch of patches) {
    data.set(patch.match, patch.offset);
  }

  return data;
}


export function syntheticDisk(name: UltimaDiskName): Dos33Disk {
  const image: DiskImage = formatDos33();
  const disk: Dos33Disk = new Dos33Disk(image);
  const rawBytes: number = RAW_TRACKS[name] * SECTORS_PER_TRACK * SECTOR_SIZE;

  for (const file of REQUIRED_FILES[name]) {
    if (file === 'DISK') {
      disk.writeBinary('DISK', 0xD0, Uint8Array.of(DISK_IDS[name]), RAW_TRACKS[name]);
    } else {
      const patches: IDataPatch[] = DATA_PATCHES.filter((patch: IDataPatch): boolean => (patch.disk === name) && (patch.file === file));

      disk.writeBinary(file, 0x4000, fillerFor(file, patches), RAW_TRACKS[name]);
    }
  }

  image.bytes.fill(0x00, 0, rawBytes);
  for (const patch of DATA_PATCHES.filter((candidate: IDataPatch): boolean => (candidate.disk === name) && (candidate.file == null))) {
    image.bytes.set(patch.match, patch.offset);
  }
  if (name === 'towne') {
    for (let record: number = 0; record < (rawBytes / SECTOR_SIZE); record++) {
      image.bytes.set(encodeRetailConversation(syntheticConversation(record)), record * SECTOR_SIZE);
    }
  }

  return disk;
}


export function syntheticDiskSet(): Readonly<Record<UltimaDiskName, Dos33Disk>> {
  return Object.fromEntries(DISK_NAMES.map((name: UltimaDiskName): [ UltimaDiskName, Dos33Disk ] => [ name, syntheticDisk(name) ])) as Record<UltimaDiskName, Dos33Disk>;
}
