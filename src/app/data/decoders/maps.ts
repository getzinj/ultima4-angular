// The map files' layouts, from the addresses each is loaded at and the include files that name
// those addresses (`map_objects.i`, `dungeon.i`, `ULT4.s` `load_letter_location`).

export const TOWNE_SIZE: number = 32;
export const OBJECT_COUNT: number = 32;
export const ARENA_SIZE: number = 11;
export const DUNGEON_SIZE: number = 8;
export const DUNGEON_LEVELS: number = 8;

const TOWNE_TILES: number = TOWNE_SIZE * TOWNE_SIZE;
const ARENA_TILES_OFFSET: number = 0x40;
const ROOM_TILES_OFFSET: number = 0x80;


export class MapLayoutError extends Error {
}


/** The eight per-object columns of a 256-byte object table ($EE00 in memory, `map_objects.i`). */
export interface IMapObject {
  readonly sprite: number;
  readonly x: number;
  readonly y: number;
  readonly type: number;
  readonly previousX: number;
  readonly previousY: number;

  /** Movement in a towne, dungeon level in a dungeon. */
  readonly ai: number;
  readonly dialogue: number;
}


export function objectsOf(table: Uint8Array): IMapObject[] {
  const objects: IMapObject[] = [];

  for (let index: number = 0; index < OBJECT_COUNT; index++) {
    objects.push({
      sprite: table[index],
      x: table[0x20 + index],
      y: table[0x40 + index],
      type: table[0x60 + index],
      previousX: table[0x80 + index],
      previousY: table[0xA0 + index],
      ai: table[0xC0 + index],
      dialogue: table[0xE0 + index],
    });
  }

  return objects;
}


export interface ITowneMap {
  readonly tiles: Uint8Array;
  readonly objects: readonly IMapObject[];
}


/** MAP@ to MAPP: 32 x 32 tiles row by row, then the 256-byte object table. */
export function towneMapOf(file: Uint8Array): ITowneMap {
  if (file.length < (TOWNE_TILES + 0x100)) {
    throw new MapLayoutError(`a towne map is ${ TOWNE_TILES + 0x100 } bytes; got ${ file.length }`);
  } else {
    return { tiles: file.slice(0, TOWNE_TILES), objects: objectsOf(file.subarray(TOWNE_TILES, TOWNE_TILES + 0x100)) };
  }
}


export function towneTile(map: ITowneMap, x: number, y: number): number {
  return map.tiles[(y * TOWNE_SIZE) + x];
}


/** DNG0-DNG7: eight levels of 8 x 8 squares, level after level, row by row. */
export function dungeonSquare(file: Uint8Array, level: number, x: number, y: number): number {
  return file[(level * DUNGEON_SIZE * DUNGEON_SIZE) + (y * DUNGEON_SIZE) + x];
}


export interface IStartPositions {
  readonly x: readonly number[];
  readonly y: readonly number[];
}


export interface IArena {
  readonly foes: IStartPositions;
  readonly players: IStartPositions;
  readonly tiles: Uint8Array;
}


/** CON* and CAMP, loaded at $0240: 16 foe and 8 player starting squares, then 11 x 11 tiles at $0280. */
export function arenaOf(file: Uint8Array): IArena {
  if (file.length < (ARENA_TILES_OFFSET + (ARENA_SIZE * ARENA_SIZE))) {
    throw new MapLayoutError(`an arena is at least ${ ARENA_TILES_OFFSET + (ARENA_SIZE * ARENA_SIZE) } bytes; got ${ file.length }`);
  } else {
    return {
      foes: { x: Array.from(file.subarray(0x00, 0x10)), y: Array.from(file.subarray(0x10, 0x20)) },
      players: { x: Array.from(file.subarray(0x20, 0x28)), y: Array.from(file.subarray(0x28, 0x30)) },
      tiles: file.slice(ARENA_TILES_OFFSET, ARENA_TILES_OFFSET + (ARENA_SIZE * ARENA_SIZE)),
    };
  }
}


export interface IDungeonRoom {
  /** Four triggers of four bytes: new tile, position, and two positions it changes. */
  readonly triggers: Uint8Array;
  readonly foeTypes: Uint8Array;
  readonly foes: IStartPositions;

  /** Where the party starts, by the side it came in from: north, east, south, west. */
  readonly entries: readonly IStartPositions[];
  readonly tiles: Uint8Array;
}


/** A room sector, loaded at $0200 (`map_objects.i`); its 11 x 11 tiles start at $80. */
export function dungeonRoomOf(sector: Uint8Array): IDungeonRoom {
  const entries: IStartPositions[] = [];

  for (let side: number = 0; side < 4; side++) {
    const base: number = 0x40 + (side * 0x10);

    entries.push({ x: Array.from(sector.subarray(base, base + 8)), y: Array.from(sector.subarray(base + 8, base + 0x10)) });
  }

  return {
    triggers: sector.slice(0x00, 0x10),
    foeTypes: sector.slice(0x10, 0x20),
    foes: { x: Array.from(sector.subarray(0x20, 0x30)), y: Array.from(sector.subarray(0x30, 0x40)) },
    entries,
    tiles: sector.slice(ROOM_TILES_OFFSET, ROOM_TILES_OFFSET + (ARENA_SIZE * ARENA_SIZE)),
  };
}
