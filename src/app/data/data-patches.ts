import type { UltimaDiskName } from './ultima-disks';

// The remaster's data fixes (`patches/` on its `fixed` branch, © 2021 Sean Gugler, CC BY-SA 4.0),
// re-expressed as offset, expected bytes and new bytes. Offsets into a file count from its first
// data byte: the remaster's own offsets include the 2-byte load address, so each is 2 less here.
// Offsets into a raw area count from track 0 sector 0. The DOS.bin patch, which only renames the
// boot file, has no counterpart: nothing here boots DOS.

export interface IDataPatch {
  readonly disk: UltimaDiskName;

  /** A DOS file, or null for the disk's raw-sector area. */
  readonly file: string | null;
  readonly offset: number;
  readonly match: readonly number[];
  readonly replace: readonly number[];
  readonly reason: string;
}


const ROOM_EAST_X: readonly number[] = [ 0x08, 0x08, 0x08, 0x09, 0x09, 0x09, 0x0A, 0x0A ];
const ROOM_WEST_X: readonly number[] = [ 0x02, 0x02, 0x02, 0x01, 0x01, 0x01, 0x00, 0x00 ];
const ROOM_SIDE_Y: readonly number[] = [ 0x05, 0x06, 0x04, 0x05, 0x06, 0x04, 0x06, 0x04 ];
const HYTHLOTH_ROW: readonly number[] = [ 0x03, 0x02, 0x01, 0x03, 0x02, 0x01, 0x03, 0x01 ];
const EMPTY_8: readonly number[] = [ 0, 0, 0, 0, 0, 0, 0, 0 ];


export const DATA_PATCHES: readonly IDataPatch[] = [
  { disk: 'towne', file: 'MAPB', offset: 0x0065, match: [ 0x7C, 0x6D, 0x7A ], replace: [ 0x7C, 0x6E, 0x7A ], reason: 'Lycaeum shelf lettering' },
  { disk: 'towne', file: 'MAPB', offset: 0x00A5, match: [ 0x7C, 0x71, 0x7A ], replace: [ 0x7C, 0x73, 0x7A ], reason: 'Lycaeum shelf lettering' },
  { disk: 'towne', file: 'MAPB', offset: 0x00E1, match: [ 0x7A, 0x68, 0x7B ], replace: [ 0x7A, 0x69, 0x7B ], reason: 'Lycaeum shelf lettering' },
  { disk: 'towne', file: 'MAPB', offset: 0x00E5, match: [ 0x7C, 0x75, 0x7A ], replace: [ 0x7C, 0x79, 0x7A ], reason: 'Lycaeum shelf lettering' },
  { disk: 'towne', file: 'MAPD', offset: 0x04FC, match: [ 0x01, 0x01 ], replace: [ 0x02, 0x02 ], reason: "Serpent's Hold gate guards' dialogue" },
  { disk: 'towne', file: 'MAPF', offset: 0x04EE, match: [ 0x07 ], replace: [ 0x06 ], reason: "Thevel's dialogue in Britain" },
  { disk: 'towne', file: 'SHPS', offset: 0x001D, match: [ 0x0C ], replace: [ 0x12 ], reason: "the healer's row in Serpent's Hold" },
  { disk: 'underworld', file: 'DNG3', offset: 0x00D8, match: [ 0xF0, 0, 0, 0, 0, 0, 0xF0, 0x10 ], replace: [ 0xF0, 0, 0, 0, 0, 0, 0xF0, 0x40 ], reason: 'misaligned ladder in Wrong level 4' },
  { disk: 'underworld', file: 'DNG3', offset: 0x00E0, match: [ 0xF0, 0, 0xF0, 0xD2, 0xF0, 0, 0xF0, 0x40 ], replace: [ 0xF0, 0, 0xF0, 0xD2, 0xF0, 0, 0xF0, 0x10 ], reason: 'misaligned ladder in Wrong level 4' },
  { disk: 'underworld', file: 'DNG3', offset: 0x0198, match: [ 0xF0, 0, 0, 0xF0, 0, 0, 0xF0, 0x40 ], replace: [ 0xF0, 0, 0, 0xF0, 0x20, 0, 0xF0, 0x40 ], reason: 'missing ladder in Wrong level 6' },
  { disk: 'underworld', file: null, offset: 0x2C50, match: EMPTY_8, replace: ROOM_EAST_X, reason: 'Destard room 12 east entry' },
  { disk: 'underworld', file: null, offset: 0x2C58, match: EMPTY_8, replace: ROOM_SIDE_Y, reason: 'Destard room 12 east entry' },
  { disk: 'underworld', file: null, offset: 0x2C70, match: EMPTY_8, replace: ROOM_WEST_X, reason: 'Destard room 12 west entry' },
  { disk: 'underworld', file: null, offset: 0x2C78, match: EMPTY_8, replace: ROOM_SIDE_Y, reason: 'Destard room 12 west entry' },
  { disk: 'underworld', file: null, offset: 0x2E50, match: EMPTY_8, replace: ROOM_EAST_X, reason: 'Destard room 14 east entry' },
  { disk: 'underworld', file: null, offset: 0x2E58, match: EMPTY_8, replace: ROOM_SIDE_Y, reason: 'Destard room 14 east entry' },
  { disk: 'underworld', file: null, offset: 0x2E70, match: EMPTY_8, replace: ROOM_WEST_X, reason: 'Destard room 14 west entry' },
  { disk: 'underworld', file: null, offset: 0x2E78, match: EMPTY_8, replace: ROOM_SIDE_Y, reason: 'Destard room 14 west entry' },
  {
    disk: 'underworld', file: null, offset: 0x4BB7,
    match: [ 0x7F, 0x16, 0x16, 0x16, 0x16, 0x16, 0x16, 0x7F, 0x16, 0x16, 0x7F ],
    replace: [ 0x7F, 0x16, 0x16, 0x16, 0x16, 0x16, 0x16, 0x16, 0x16, 0x16, 0x7F ],
    reason: 'wall barring the east exit of Covetous room 11',
  },
  { disk: 'underworld', file: null, offset: 0x6750, match: EMPTY_8, replace: ROOM_EAST_X, reason: 'Hythloth room 7 east entry' },
  { disk: 'underworld', file: null, offset: 0x6758, match: EMPTY_8, replace: HYTHLOTH_ROW, reason: 'Hythloth room 7 east entry' },
  { disk: 'underworld', file: null, offset: 0x6760, match: EMPTY_8, replace: HYTHLOTH_ROW, reason: 'Hythloth room 7 south entry' },
  { disk: 'underworld', file: null, offset: 0x6768, match: EMPTY_8, replace: ROOM_EAST_X, reason: 'Hythloth room 7 south entry' },
  { disk: 'underworld', file: null, offset: 0x6900, match: [ 0, 0, 0, 0 ], replace: [ 0x16, 0x98, 0x05, 0x04 ], reason: 'Hythloth room 9 trigger' },
  { disk: 'underworld', file: null, offset: 0x6970, match: EMPTY_8, replace: [ 0x01, 0x01, 0x02, 0x03, 0x03, 0x03, 0x04, 0x01 ], reason: 'Hythloth room 9 west entry' },
  { disk: 'underworld', file: null, offset: 0x6978, match: EMPTY_8, replace: [ 0x05, 0x04, 0x05, 0x05, 0x04, 0x06, 0x05, 0x03 ], reason: 'Hythloth room 9 west entry' },
];


export type PatchOutcome = 'applied' | 'already-applied' | 'mismatch';


/** Applies a patch in place when the bytes are what the remaster expects; leaves them alone otherwise. */
export function applyPatch(bytes: Uint8Array, patch: IDataPatch): PatchOutcome {
  const at: (values: readonly number[]) => boolean = (values: readonly number[]): boolean =>
    ((patch.offset + values.length) <= bytes.length) &&
    values.every((value: number, index: number): boolean => bytes[patch.offset + index] === value);
  let outcome: PatchOutcome;

  if (at(patch.match)) {
    bytes.set(patch.replace, patch.offset);
    outcome = 'applied';
  } else if (at(patch.replace)) {
    outcome = 'already-applied';
  } else {
    outcome = 'mismatch';
  }

  return outcome;
}
