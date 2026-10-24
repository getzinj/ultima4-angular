import { readBcd, writeBcd, writeByte } from './fields';
import type { IStateMemory } from './state-memory';
import { PRTY } from './symbols';

// The PRTY save record, which lives in zero page $00-$1F: position, location, mode, transport,
// party size, moons, timers and the move counter.

export const PARTY_FIELDS = [
  'player_xpos', 'player_ypos', 'tile_xpos', 'tile_ypos', 'map_x', 'map_y', 'dest_x', 'dest_y', 'britannia_x', 'britannia_y',
  'current_location', 'game_mode', 'dungeon_level', 'terrain_occlusion', 'player_transport', 'party_size', 'dng_direction',
  'light_duration', 'moon_phase_trammel', 'moon_phase_felucca', 'horse_mode', 'player_has_spoken_to_lb', 'last_sleep',
  'last_humility_check', 'altar_room_principle', 'last_meditated', 'last_found_reagent', 'ship_hull',
] as const satisfies readonly (keyof typeof PRTY)[];

export type PartyField = typeof PARTY_FIELDS[number];

/** PRTY's file: the 32 bytes from $00. */
export const PARTY_RECORD_LENGTH: number = 0x20;


export class Party {
  constructor(private readonly memory: IStateMemory) {
  }


  /** A field's byte, as the game keeps it (`ship_hull` is BCD; the rest are plain). */
  public get(field: PartyField): number {
    return this.memory.read(PRTY[field]);
  }


  public set(field: PartyField, value: number): void {
    writeByte(this.memory, PRTY[field], value);
  }


  /** Moves made, eight BCD digits. */
  public get moveCounter(): number {
    return readBcd(this.memory, PRTY.move_counter, 4);
  }


  public set moveCounter(value: number) {
    writeBcd(this.memory, PRTY.move_counter, 4, value);
  }
}
