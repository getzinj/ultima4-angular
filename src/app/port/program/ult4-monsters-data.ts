import { inline } from '../inline-data';
import type { IInlineData } from '../inline-data';
import { encode } from '../text';

// Where ULT4's wandering monsters keep their strings in the `fixed` build, and the labels they use.

/** The labels the monsters jump to or call that are still lifted. */
export const MONSTER_LIFTED = {
  spawn_dungeon: 0x67D7,
  mobs_act_dungeon: 0x6B70,
} as const;

/** The monsters' entries: every label lifted code jumps to or calls, and the ones their own code jumps to. */
export const MONSTER_ENTRIES = {
  spawn_monsters: 0x66F9,
  spawn_world: 0x670A,
  mobs_act: 0x683F,
  mobs_act_world: 0x6857,
  mob_world_take_turn: 0x6898,
  player_attacked: 0x68AA,
  check_range: 0x68CF,
  tile_to_monster_num: 0x6C41,
  check_water_hazards: 0x6C6A,
  enter_whirlpool: 0x6CEA,
  enter_twister: 0x6D10,
  fire_cannon_pirate: 0x6D33,
  fire_red_missile: 0x6D53,
  fire_world_missile: 0x6D73,
  manhattan_dist: 0x6DE1,
  legal_move_world_twn: 0x7F97,
  deny_move: 0x7FFB,
  get_mob_at_temp_xy: 0x83E3,
  any_obj_at_temp_xy: 0x83F0,
  check_next_object: 0x83F2,
  temp_xy_skip: 0x8407,
  temp_xy_none: 0x840A,
  attacked_by: 0x840D,
  check_avoid: 0x8476,
} as const;


function text(address: number, value: string): IInlineData {
  return inline(address, [ ...encode(value), 0x00 ]);
}


export const MONSTER_INLINE = {
  attacked_by: text(0x8410, '\nATTACKED BY\n'),
  avoid: text(0x847F, 'Avoid? '),
} as const;


/** Every byte the monsters read as data, by address, as loading ULT4 leaves them. */
export function monsterData(): readonly [ number, readonly number[] ][] {
  return Object.values(MONSTER_INLINE).map((block: IInlineData): [ number, readonly number[] ] => [ block.address, block.bytes ]);
}
