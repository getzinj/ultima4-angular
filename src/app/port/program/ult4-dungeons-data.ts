import { inline } from '../inline-data';
import type { IInlineData } from '../inline-data';
import { encode } from '../text';

// Where ULT4's dungeon code keeps its tables and strings in the `fixed` build, and what they hold
// when ULT4 is loaded.

/** ULT4's entries for the dungeons that the port takes over. */
export const DUNGEON_ENTRIES = {
  spawn_dungeon: 0x67D7,
  mobs_act_dungeon: 0x6B70,
  dng_check_attacked: 0x6E79,
  do_dungeon_room: 0x6F0F,
  combat_exit_room: 0x7701,
  do_exit_room: 0x772F,
  legal_move_dungeon: 0x80AA,
  dng_can_advance: 0x80E0,
  dng_can_retreat: 0x80F2,
} as const;

export const DUNGEON_TABLES = {
  /** The arena for the tile a fight in the halls starts on, by its type. */
  dungeon_arena: 0x6EFF,
  /** Where each altar room's exits lead: truth's, love's and courage's, north, east, south and west. */
  altar_room_exits: 0x777E,
} as const;


function text(address: number, value: string): IInlineData {
  return inline(address, [ ...encode(value), 0x00 ]);
}


export const DUNGEON_INLINE = {
  altar_room: text(0x6F59, '\nTHE ALTAR ROOM\nOF '),
  truth: text(0x6F78, 'TRUTH\n'),
  love: text(0x6F86, 'LOVE\n'),
  courage: text(0x6F93, 'COURAGE\n'),
  leave_room: text(0x7704, '\nLEAVE ROOM!\n'),
  into_dungeon: text(0x775B, 'INTO DUNGEON\n'),
} as const;


export function dungeonData(): readonly [ number, readonly number[] ][] {
  return [
    ...Object.values(DUNGEON_INLINE).map((block: IInlineData): [ number, readonly number[] ] => [ block.address, block.bytes ]),
    [ DUNGEON_TABLES.dungeon_arena, [ 0xB0, 0xB1, 0xB2, 0xB3, 0xB4, 0xB0, 0xB0, 0xB0, 0xB0, 0xB0, 0xB0, 0xB0, 0xB5, 0xB0, 0xB6, 0xB0 ] ],
    [ DUNGEON_TABLES.altar_room_exits, [ 0x11, 0x16, 0x17, 0x14, 0x12, 0x14, 0x17, 0x15, 0x13, 0x15, 0x17, 0x16 ] ],
  ];
}
