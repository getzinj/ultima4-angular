import { inline } from '../inline-data';
import type { IInlineData } from '../inline-data';
import { encode } from '../text';

// Where ULT4 keeps the variables, tables and inline data of its ported routines in the `fixed`
// build ($4000-$87DB), and what they hold when it is loaded. ULT4 is ported in part: the rest of
// its image is the lifted module's, so only what the ported routines read is listed here.

export const ULT4_LOAD: number = 0x4000;

/** Variables, and the operands ULT4 rewrites in its own code (ULT4.s `name = * + 1`). */
export const ULT4_VARIABLES = {
  /** try_walk: the low byte of its `jsr j_move_north`, which each direction sets to its own move. */
  try_walk_handler: 0x45D8,
  /** try_walk_towne: the operands of its two `lda #0`. */
  try_walk_x: 0x45E0,
  try_walk_y: 0x45E6,
  last_ship_x: 0x4863,
  last_ship_y: 0x4864,
} as const;

export const ULT4_TABLES = {
  cmd_table: 0x426E,
  dng_dir_delta_x: 0x4370,
  dng_dir_delta_y: 0x4374,
  pirate_fleet_x: 0x4643,
  pirate_fleet_y: 0x464B,
  pirate_fleet_sprite: 0x4653,
  slow_tile_type: 0x4700,
  slow_chance: 0x4705,
  moongate_x: 0x4C4F,
  moongate_y: 0x4C57,
} as const;

/** The labels the ported routines jump to that are still lifted. */
export const ULT4_LIFTED = {
  load_dungeon: 0x5139,
  begin_dng_load: 0x5123,
  load_shrine: 0x524C,
  load_letter_location: 0x52F2,
  tile_effect: 0x64C5,
  starving: 0x663B,
  recover_mp: 0x666A,
  eat_food: 0x66C4,
  dng_check_attacked: 0x6E79,
  do_dungeon_room: 0x6F0F,
  combat_cmd_done: 0x72B7,
  dng_can_advance: 0x80E0,
  dng_can_retreat: 0x80F2,
  close_open_door: 0x8102,
  anyone_awake: 0x849D,
  dec_player_hp: 0x85B4,
  invert_player_name: 0x84F7,
  cmd_music: 0x5D42,
} as const;

/** ULT4's own entries the port takes over: every label lifted code jumps to or calls. */
export const ULT4_ENTRIES = {
  game_init: 0x4009,
  load_saved_game: 0x4033,
  halt: 0x4060,
  load_saved_map: 0x4063,
  game_start: 0x408D,
  next_turn: 0x40C5,
  check_cmd_alpha: 0x4141,
  cmd_timeout: 0x415B,
  done_pass: 0x416A,
  done_what: 0x4176,
  done_sound_deny: 0x4180,
  done_not_a_player: 0x4188,
  done_only_on_foot: 0x419D,
  done_nothing_there: 0x41B2,
  done_slow_progress: 0x41C8,
  done_not_here: 0x41DC,
  done_cant: 0x41ED,
  done_aborted: 0x41FB,
  done_done: 0x420B,
  done_have_none: 0x421B,
  done_disabled: 0x4231,
  done_blocked: 0x4242,
  done_drift_only: 0x425B,
  cmd_direction_up: 0x42A2,
  dng_move: 0x4359,
  cmd_direction_down: 0x4378,
  cmd_direction_left: 0x443F,
  cmd_direction_right: 0x44F7,
  try_walk: 0x45BC,
  try_walk_towne: 0x45DF,
  try_walk_exit: 0x45F3,
  print_turn: 0x4610,
  print_sail: 0x461A,
  spawn_pirate_fleet: 0x4624,
  spawn_daemon_guard: 0x465B,
  leave_to_world: 0x467E,
  check_slow_terrain: 0x46EE,
  can_ship_move_here: 0x470A,
  cmd_board: 0x47E8,
  board_horse: 0x4865,
  board_balloon: 0x487E,
  do_board: 0x4892,
  print_descend: 0x4F7A,
  cmd_descend: 0x4F87,
  cmd_hole_up: 0x5598,
  cmd_klimb: 0x5677,
  cmd_peer_gem: 0x58E5,
  do_view: 0x5911,
  cmd_search: 0x5B3B,
  cmd_use_item: 0x5CDD,
  cmd_x_it: 0x5E07,
  cmd_yell_horse: 0x5E7E,
  cmd_done: 0x642E,
  update_player_health: 0x644E,
  is_wind_favorable: 0x6C4C,
  end_turn: 0x6E0D,
  print_north: 0x83B9,
  print_south: 0x83C4,
  print_east: 0x83CF,
  print_west: 0x83D9,
  input_char: 0x848D,
  run_file_dead: 0x84BC,
  dec_stat: 0x8554,
  print_newline: 0x86E5,
  check_enter_moongate: 0x8764,
  gate_to_gate: 0x8788,
} as const;


function text(address: number, value: string): IInlineData {
  return inline(address, [ ...encode(value), 0x00 ]);
}


/** The message pane's prompt: a newline and the `>` glyph. */
const PROMPT: readonly number[] = [ 0x8D, 0x1E ];

export const ULT4_INLINE = {
  bload_prty: text(0x4036, '\u0004BLOAD PRTY,A$0\n'),
  no_active_game: text(0x404E, '\nNO ACTIVE GAME!\n'),
  bload_list_rost: text(0x4066, '\u0004BLOAD LIST,A$EE00\n\u0004BLOAD ROST,A$EC00\n'),
  prompt: inline(0x40D6, [ ...PROMPT, 0x00 ]),
  zzzzz: inline(0x415E, [ ...PROMPT, ...encode('Zzzzz\n'), 0x00 ]),
  pass: text(0x416D, 'Pass\n'),
  what: text(0x4179, 'WHAT?\n'),
  not_a_player: text(0x418B, 'NOT A PLAYER!\n'),
  only_on_foot: text(0x41A0, 'ONLY ON FOOT!\n'),
  nothing_there: text(0x41B5, 'NOTHING THERE!\n'),
  slow_progress: text(0x41CB, 'SLOW PROGRESS!\n'),
  not_here: text(0x41DF, 'NOT HERE!\n'),
  cant: text(0x41F0, 'CAN\'T!\n'),
  aborted: text(0x41FE, 'ABORTED!\n'),
  done: text(0x4211, 'DONE.\n'),
  have_none: text(0x421E, 'YOU HAVE NONE!\n'),
  disabled: text(0x4234, 'DISABLED!\n'),
  blocked: text(0x4245, 'BLOCKED!\n'),
  drift_only: text(0x425E, 'DRIFT ONLY!\n'),
  advance: text(0x4344, 'Advance\n'),
  retreat: text(0x4381, 'Retreat\n'),
  left: text(0x444B, 'left\n'),
  right: text(0x4503, 'right\n'),
  exit: text(0x45FB, 'Exit? '),
  turn: text(0x4613, 'Turn '),
  sail: text(0x461D, 'Sail '),
  leaving: text(0x4686, 'LEAVING...\n'),
  bload_tlst: text(0x46A1, '\u0004BLOAD TLST\n'),
  board_back: text(0x47F1, 'Board <-'),
  board: text(0x480A, 'Board '),
  frigate: text(0x4841, 'frigate!\n'),
  mount_horse: text(0x486D, 'Mount horse!\n'),
  balloon: text(0x4886, 'balloon\n'),
  descend: text(0x4F7D, 'Descend '),
  down_to_level: text(0x4FB3, 'down!\nTo level '),
  land_balloon: text(0x4FE7, 'Land Balloon\n'),
  first_floor: text(0x5023, 'to\nfirst floor!\n'),
  the_depths: text(0x5049, 'into\nthe depths!\n'),
  hole_up: text(0x559B, 'Hole up & camp\n'),
  must_be_on_foot: text(0x55C1, 'MUST BE ON FOOT!\n'),
  bload_hole: text(0x55DE, '\u0004BLOAD HOLE,A$8800\n'),
  klimb: text(0x567A, 'Klimb '),
  up: text(0x56A1, 'up!\n'),
  to_level: text(0x56B0, 'To level '),
  altitude: text(0x56DD, 'altitude\n'),
  second_floor: text(0x56FF, 'to\nsecond floor!\n'),
  peer_at: text(0x58E8, 'Peer at '),
  a_gem: text(0x5903, 'a gem!\n'),
  bload_tmap: text(0x5919, '\u0004BLOAD TMAP,A$9000\n'),
  bload_dngd: text(0x5943, '\u0004BLOAD DNGD,A$8C00\n'),
  search: text(0x5B3E, 'Search...\n'),
  bload_sear: text(0x5B51, '\u0004BLOAD SEAR,A$8800\n'),
  use: text(0x5CE0, 'Use...\n'),
  bload_use: text(0x5CF0, '\u0004BLOAD USE,A$8800\n'),
  x_it: text(0x5E0A, 'X-it '),
  yell: text(0x5E81, 'Yell '),
  whoa: text(0x5E9F, 'whoa!\n'),
  giddyup: text(0x5EAC, 'giddyup!\n'),
  dark: text(0x6E43, 'IT\'S DARK!\n'),
  north: text(0x83BC, 'North\n'),
  south: text(0x83C7, 'South\n'),
  east: text(0x83D2, 'East\n'),
  west: text(0x83DC, 'West\n'),
  bload_save: text(0x84C9, '\u0004BLOAD SAVE,A$8800\n'),
} as const;


/** cmd_table: each letter's command, A to Z. */
const CMD_TABLE: readonly number[] = [
  0x4714, 0x47E8, 0x48BD, 0x4F87, 0x5070, 0x5338, 0x53F8, 0x5598, 0x5609, 0x563A, 0x5677, 0x5723, 0x57B6,
  0x57F0, 0x5898, 0x58E5, 0x595D, 0x5A51, 0x5B3B, 0x5B70, 0x5CDD, 0x5D1A, 0x5D58, 0x5E07, 0x5E7E, 0x5EB9,
];


/** Every byte the ported routines read as data, by address, as loading ULT4 leaves them. */
export function ult4Data(): ReadonlyMap<number, readonly number[]> {
  const V = ULT4_VARIABLES;
  const T = ULT4_TABLES;

  return new Map<number, readonly number[]>([
    [ V.try_walk_handler, [ 0x0F, 0x08 ] ],
    [ V.try_walk_x, [ 0x00 ] ],
    [ V.try_walk_y, [ 0x00 ] ],
    [ V.last_ship_x, [ 0x00, 0x00 ] ],
    [ T.cmd_table, CMD_TABLE.flatMap((address: number): number[] => [ address & 0xFF, address >> 8 ]) ],
    [ T.dng_dir_delta_x, [ 0x00, 0x01, 0x00, 0xFF, 0xFF, 0x00, 0x01, 0x00 ] ],
    [ T.pirate_fleet_x, [
      0xE0, 0xE0, 0xE2, 0xE3, 0xE4, 0xE5, 0xE5, 0xE4, 0xDC, 0xE4, 0xDC, 0xE4, 0xE3, 0xE1, 0xDF, 0xDE, 0x82, 0x82, 0x82, 0x82, 0x83, 0x83, 0x81, 0x81,
    ] ],
    [ T.slow_tile_type, [ 0x03, 0x05, 0x06, 0x07, 0x46, 0x03, 0x07, 0x03, 0x01, 0x01 ] ],
    [ T.moongate_x, [ 0xE0, 0x60, 0x26, 0x32, 0xA6, 0x68, 0x17, 0xBB, 0x85, 0x66, 0xE0, 0x25, 0x13, 0xC2, 0x7E, 0xA7 ] ],
    ...Object.values(ULT4_INLINE).map((block: IInlineData): [ number, readonly number[] ] => [ block.address, block.bytes ]),
  ]);
}
