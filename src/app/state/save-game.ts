import type { IBinaryFile } from '../data/dos33';
import type { UltimaDiskName } from '../data/ultima-disks';
import { OBJECTS_LENGTH } from './map-objects';
import { PARTY_RECORD_LENGTH } from './party';
import { ROSTER_LENGTH } from './roster';
import type { IStateMemory } from './state-memory';
import { StateError } from './state-memory';
import { MAP_OBJECTS, PRTY, ROST } from './symbols';

// The save game's files and where in memory each goes. The game BSAVEs PRTY, ROST and LIST on
// the britannia disk, and starts a new game from NPRT, NRST and NLST on the program disk. It
// always names the address when it loads them, so the address a file carries is ignored.

export interface ISaveDisks {
  bload(disk: UltimaDiskName, name: string): IBinaryFile;
  bsave(disk: UltimaDiskName, name: string, address: number, data: Uint8Array): void;
}


export interface ISaveFile {
  readonly disk: UltimaDiskName;
  readonly name: string;
  readonly address: number;
  readonly length: number;
}

export const SAVE_GAME: readonly ISaveFile[] = [
  { disk: 'britannia', name: 'PRTY', address: PRTY.player_xpos, length: PARTY_RECORD_LENGTH },
  { disk: 'britannia', name: 'ROST', address: ROST.player_stats, length: ROSTER_LENGTH },
  { disk: 'britannia', name: 'LIST', address: MAP_OBJECTS.object_tile_sprite, length: OBJECTS_LENGTH },
];

export const NEW_GAME: readonly ISaveFile[] = [
  { disk: 'program', name: 'NPRT', address: PRTY.player_xpos, length: PARTY_RECORD_LENGTH },
  { disk: 'program', name: 'NRST', address: ROST.player_stats, length: ROSTER_LENGTH },
  { disk: 'program', name: 'NLST', address: MAP_OBJECTS.object_tile_sprite, length: OBJECTS_LENGTH },
];


export class SaveGameError extends StateError {
}


export function loadSaveFiles(disks: ISaveDisks, memory: IStateMemory, files: readonly ISaveFile[] = SAVE_GAME): void {
  for (const file of files) {
    const data: Uint8Array = disks.bload(file.disk, file.name).data;

    if (data.length !== file.length) {
      throw new SaveGameError(`${ file.name } on the ${ file.disk } disk is ${ data.length } bytes, not ${ file.length }`);
    } else {
      data.forEach((value: number, index: number): void => memory.write(file.address + index, value));
    }
  }
}


export function storeSaveFiles(disks: ISaveDisks, memory: IStateMemory, files: readonly ISaveFile[] = SAVE_GAME): void {
  for (const file of files) {
    disks.bsave(file.disk, file.name, file.address, Uint8Array.from({ length: file.length }, (_: unknown, index: number): number => memory.read(file.address + index)));
  }
}
