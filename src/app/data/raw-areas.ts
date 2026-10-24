import { SECTOR_SIZE, SECTORS_PER_TRACK } from './disk-image';

// The three areas the game reads by track and sector, with no DOS file around them. Each is kept
// as one buffer of whole tracks from track 0, so a sector is at ((track * 16) + sector) * 256.

export const WORLD_SIZE: number = 256;
export const CHUNK_SIZE: number = 16;
export const PEOPLE_PER_LOCATION: number = 16;
export const ABYSS: number = 7;


function sectorOf(area: Uint8Array, track: number, sector: number): Uint8Array {
  const start: number = ((track * SECTORS_PER_TRACK) + sector) * SECTOR_SIZE;

  return area.subarray(start, start + SECTOR_SIZE);
}


/** Britannia, tracks 0-15: one 16 x 16 chunk of the world map per sector, track = chunk row, sector = chunk column. */
export function worldChunk(worldArea: Uint8Array, chunkX: number, chunkY: number): Uint8Array {
  return sectorOf(worldArea, chunkY, chunkX);
}


export function worldTile(worldArea: Uint8Array, x: number, y: number): number {
  return worldChunk(worldArea, x >> 4, y >> 4)[((y & 15) * CHUNK_SIZE) + (x & 15)];
}


/** Towne, tracks 0-15: a conversation per sector, track = location - 1, sector = dialogue index - 1. */
export function conversationSector(talkArea: Uint8Array, location: number, dialogue: number): Uint8Array {
  return sectorOf(talkArea, location - 1, dialogue - 1);
}


/** Underworld, tracks 0-10: a room per sector; the Abyss has a track per two levels (`ULT4.s` `do_dungeon_room`). */
export function dungeonRoomSector(roomArea: Uint8Array, dungeon: number, level: number, room: number): Uint8Array {
  const track: number = dungeon === ABYSS ? ABYSS + (level >> 1) : dungeon;

  return sectorOf(roomArea, track, room);
}
