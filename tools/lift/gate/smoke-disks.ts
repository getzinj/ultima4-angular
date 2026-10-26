// smoke.py's blank data, for the lifted game: every data file is filler, so the gate shows the
// lifted code carries the same machine state as the oracle without any of the game's data. The
// program files come from the lifted modules, as they do in play.

import { Dos33Disk, formatDos33 } from '../../../src/app/data/dos33';
import { RAW_TRACKS } from '../../../src/app/data/ultima-disks';
import type { UltimaDiskName } from '../../../src/app/data/ultima-disks';
import type { DiskSet } from '../../../src/app/lifted-runtime/lifted-machine';
import { dialogue, seeded } from './dialogue';
import type { Random } from './differential';

type Files = Readonly<Record<string, readonly [ number, Uint8Array ]>>;

const BRITANNIA_FILES: readonly string[] = [
  'CAMP', 'CONB', 'CONC', 'COND', 'CONE', 'CONF', 'CONG', 'CONH', 'CONI', 'CONO', 'CONP', 'CONR', 'CONS',
  'CONT', 'HELP', 'HOLE', 'LORD', 'MIX', 'MUSB', 'MUSO', 'SAVE', 'SEAR', 'SHRI', 'SHRN', 'TMAP', 'USE',
];
/** The arenas a fight in a towne loads, the inn's among them. */
const TOWNE_ARENAS: readonly string[] = [ 'CONA', 'CONB', 'CONC', 'COND', 'CONF', 'CONG', 'CONH', 'CONO', 'CONR', 'CONS' ];
const ROOM_FOE_TYPES: number = 0x10;
/** The monsters a room may hold, by tile: the dungeon's own, and the mimic often. */
const ROOM_FOES: readonly number[] = [ 0x90, 0x94, 0x98, 0x9C, 0xA0, 0xA4, 0xA8, 0xAC, 0xAC, 0xB0, 0xB4, 0xB8, 0xBC, 0xC0, 0xD0, 0xE0, 0xF0, 0xFC ];
const SLIDES: readonly string[] = [ 'FAIR', 'GYPS', 'LOOK', 'PRTL', 'TABL', 'TREE', 'WAGN' ];


/** TBLS: the HGR row addresses, then each column's byte and bit. */
function hiresTables(): Uint8Array {
  const rows: number[] = Array.from({ length: 192 }, (_: unknown, row: number): number =>
    0x2000 + ((row & 7) * 0x400) + (((row >> 3) & 7) * 0x80) + ((row >> 6) * 40));
  const columns: number[] = Array.from({ length: 287 }, (_: unknown, x: number): number => x);

  return Uint8Array.from([
    ...rows.map((row: number): number => row & 0xFF),
    ...rows.map((row: number): number => row >> 8),
    ...columns.map((x: number): number => Math.floor(x / 7)),
    ...columns.map((x: number): number => 1 << (x % 7)),
  ]);
}


function blankSlide(): Uint8Array {
  const stream: number[] = [ 0xFE, 0xFF ];
  let remaining: number = 40 * 144;

  while (remaining > 0) {
    const count: number = Math.min(255, remaining);

    stream.push(0xFE, count, 0);
    remaining = remaining - count;
  }

  return Uint8Array.from(stream);
}


function towneArenas(): Files {
  return Object.fromEntries(TOWNE_ARENAS.map((name: string): [ string, readonly [ number, Uint8Array ] ] => [ name, [ 0x8800, new Uint8Array(16) ] ]));
}


/** The townes' maps, MAP@ to MAPP, and the dungeons', DNG0 to DNG7, each a different filler. */
function maps(prefix: string, first: number, count: number, address: number, length: number): Files {
  return Object.fromEntries(Array.from({ length: count }, (_: unknown, index: number): [ string, readonly [ number, Uint8Array ] ] =>
    [ `${ prefix }${ String.fromCharCode(first + index) }`, [ address, Uint8Array.from({ length }, (_: unknown, at: number): number => (at * 7) + index) ] ]));
}


/** SHPS: each towne's eight rows of shop counters, a filler of rows within the towne. */
function shops(): Uint8Array {
  return Uint8Array.from({ length: 0x80 }, (_: unknown, at: number): number => ((at * 5) + 3) & 0x1F);
}


/** A townsperson's record in each sector of the towne disk's raw tracks, where Talk reads it. */
function townsfolk(towne: Dos33Disk): void {
  for (let track: number = 0; track < RAW_TRACKS.towne; track++) {
    for (let sector: number = 0; sector < 16; sector++) {
      towne.image.writeSector(track, sector, dialogue(seeded((track * 16) + sector + 1)));
    }
  }
}


/** A room in each sector of the underworld disk's raw tracks, where a dungeon reads it: some foes, a mimic among them now and then, and every place within the room. */
function rooms(underworld: Dos33Disk): void {
  for (let track: number = 0; track < RAW_TRACKS.underworld; track++) {
    for (let sector: number = 0; sector < 16; sector++) {
      const random: Random = seeded((track * 16) + sector + 1);
      const room: Uint8Array = Uint8Array.from({ length: 256 }, (): number => Math.floor(random() * 11));

      for (let foe: number = 0; foe < 16; foe++) {
        room[ROOM_FOE_TYPES + foe] = (random() < 0.5) ? 0x00 : ROOM_FOES[Math.floor(random() * ROOM_FOES.length)];
      }
      underworld.image.writeSector(track, sector, room);
    }
  }
}


function disk(name: UltimaDiskName, files: Files): Dos33Disk {
  const result: Dos33Disk = new Dos33Disk(formatDos33());

  for (const [ file, [ address, data ] ] of Object.entries(files)) {
    result.writeBinary(file, address, data, RAW_TRACKS[name]);
  }

  return result;
}


export function smokeDisks(): DiskSet {
  const program: Record<string, readonly [ number, Uint8Array ]> = {
    DISK: [ 0xD0, Uint8Array.of(1) ],
    TBLS: [ 0xE000, hiresTables() ],
    HTXT: [ 0xE400, new Uint8Array(1024) ],
    SHP0: [ 0xD000, new Uint8Array(4096) ],
    SHP1: [ 0xD000, new Uint8Array(4096) ],
    ANIM: [ 0x4000, new Uint8Array(0x2000) ],
    BGND: [ 0x7A00, new Uint8Array(0x0600) ],
    CRDS: [ 0x4000, new Uint8Array(8960) ],
    NPRT: [ 0x0000, new Uint8Array(32) ],
    NRST: [ 0xEC00, new Uint8Array(512) ],
    NLST: [ 0xEE00, new Uint8Array(256) ],
  };
  const britannia: Record<string, readonly [ number, Uint8Array ]> = {
    DISK: [ 0xD0, Uint8Array.of(2) ],
    PRTY: [ 0, new Uint8Array(32) ],
    ROST: [ 0xEC00, new Uint8Array(512) ],
    LIST: [ 0xEE00, new Uint8Array(256) ],
    TLST: [ 0xEE00, new Uint8Array(256) ],
  };

  for (const slide of SLIDES) {
    program[`${ slide }.SPK`] = [ 0x4000, blankSlide() ];
  }
  for (const file of BRITANNIA_FILES) {
    britannia[file] = [ 0x8800, new Uint8Array(16) ];
  }

  const towne: Dos33Disk = disk('towne', { DISK: [ 0xD0, Uint8Array.of(3) ], SHPS: [ 0x8800, shops() ], ...maps('MAP', 0x40, 17, 0x8B00, 0x500), ...towneArenas() });

  const underworld: Dos33Disk = disk('underworld', { DISK: [ 0xD0, Uint8Array.of(4) ], ...maps('DNG', 0x30, 8, 0xE800, 0x200) });

  townsfolk(towne);
  rooms(underworld);

  return {
    program: disk('program', program),
    britannia: disk('britannia', britannia),
    towne,
    underworld,
  };
}
