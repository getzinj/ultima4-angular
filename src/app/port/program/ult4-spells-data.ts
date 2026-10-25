import { inline } from '../inline-data';
import type { IInlineData } from '../inline-data';
import { encode } from '../text';

// Where ULT4's spells and reagents keep their variables, tables and strings in the `fixed` build,
// and what they hold when ULT4 is loaded.

export const SPELL_VARIABLES = {
  current_spell: 0x4977,
  saved_cursor_x: 0x642C,
  saved_cursor_y: 0x642D,
} as const;

export const SPELL_TABLES = {
  spell_jump_table: 0x4978,
  spell_mp_cost: 0x49AC,
} as const;

/** The spells' entries: every label lifted code jumps to or calls, and the ones their own code jumps to. */
export const SPELL_ENTRIES = {
  cmd_cast: 0x48BD,
  choose_spell: 0x48EC,
  spell_awake: 0x49C6,
  spell_blink: 0x49F7,
  add_delta: 0x4A3B,
  sub_delta: 0x4A4D,
  spell_cure: 0x4A5F,
  spell_dispel_field: 0x4A84,
  spell_energy_field: 0x4B15,
  spell_fireball: 0x4B99,
  spell_attack_failed: 0x4BA4,
  do_fireball: 0x4BAC,
  launch_attack_spell: 0x4BB4,
  spell_gate: 0x4C0C,
  spell_heal: 0x4C5F,
  spell_iceball: 0x4C88,
  spell_jinx: 0x4CA1,
  set_spell_aura: 0x4CA6,
  spell_kill: 0x4CAF,
  spell_light: 0x4CC8,
  spell_missile: 0x4CDB,
  spell_negate: 0x4CF4,
  spell_open_chest: 0x4CFC,
  spell_protect: 0x4D0D,
  spell_quickness: 0x4D15,
  spell_resurrect: 0x4D1D,
  res_view_fail: 0x4D21,
  try_resurrect: 0x4D24,
  spell_sleep: 0x4D4C,
  spell_tremor: 0x4D75,
  spell_undead: 0x4DD0,
  spell_view: 0x4DF0,
  spell_wind: 0x4E00,
  spell_x_it: 0x4E31,
  spell_y_up: 0x4E3A,
  spell_z_down: 0x4E75,
  not_abyss: 0x4EB4,
  dungeon_only: 0x4EC0,
  combat_only: 0x4EDE,
  outdoors_only: 0x4EF9,
  spell_effect: 0x4F18,
  failed: 0x4F41,
  is_undead: 0x4F55,
  prompt_direction: 0x4F6B,
  cmd_mix_reagents: 0x57B6,
  next_line: 0x633D,
  display_reagents: 0x6354,
  display_spells: 0x63B5,
  save_cursor: 0x6416,
  restore_cursor: 0x6421,
} as const;


function text(address: number, value: string): IInlineData {
  return inline(address, [ ...encode(value), 0x00 ]);
}


/** A heading for the status window, between the glyphs that frame it. */
function titled(address: number, value: string): IInlineData {
  return inline(address, [ 0x1E, ...encode(value), 0x1D, 0x00 ]);
}


export const SPELL_INLINE = {
  cast_spell: text(0x48C0, 'Cast spell:\nplayer-'),
  spell: text(0x48F2, 'SPELL-'),
  exclaim: text(0x4921, '!\n'),
  mp_too_low: text(0x4951, 'M.P. TOO LOW!\n'),
  who_awake: text(0x49C9, 'WHO-'),
  who_cure: text(0x4A62, 'WHO-'),
  type: text(0x4B18, 'TYPE-'),
  to_phase: text(0x4C1E, 'TO PHASE-'),
  who_heal: text(0x4C62, 'WHO-'),
  who_resurrect: text(0x4D27, 'WHO-'),
  dungeon_only: text(0x4EC9, 'DUNGEON ONLY!\n'),
  combat_only: text(0x4EE5, 'COMBAT ONLY!\n'),
  outdoors_only: text(0x4F02, 'OUTDOORS ONLY!\n'),
  failed: text(0x4F44, 'FAILED!\n'),
  direction: text(0x4F6E, 'DIRECTION-'),
  mix_reagents: text(0x57BC, 'Mix reagents\n'),
  bload_mix: text(0x57D2, '\u0004BLOAD MIX,A$8800\n'),
  reagents: titled(0x6363, 'REAGENTS'),
  mixtures: titled(0x63C6, 'MIXTURES'),
} as const;


/** spell_jump_table: each spell's routine, A to Z. */
export const SPELL_ROUTINES: readonly number[] = [
  SPELL_ENTRIES.spell_awake, SPELL_ENTRIES.spell_blink, SPELL_ENTRIES.spell_cure, SPELL_ENTRIES.spell_dispel_field,
  SPELL_ENTRIES.spell_energy_field, SPELL_ENTRIES.spell_fireball, SPELL_ENTRIES.spell_gate, SPELL_ENTRIES.spell_heal,
  SPELL_ENTRIES.spell_iceball, SPELL_ENTRIES.spell_jinx, SPELL_ENTRIES.spell_kill, SPELL_ENTRIES.spell_light,
  SPELL_ENTRIES.spell_missile, SPELL_ENTRIES.spell_negate, SPELL_ENTRIES.spell_open_chest, SPELL_ENTRIES.spell_protect,
  SPELL_ENTRIES.spell_quickness, SPELL_ENTRIES.spell_resurrect, SPELL_ENTRIES.spell_sleep, SPELL_ENTRIES.spell_tremor,
  SPELL_ENTRIES.spell_undead, SPELL_ENTRIES.spell_view, SPELL_ENTRIES.spell_wind, SPELL_ENTRIES.spell_x_it,
  SPELL_ENTRIES.spell_y_up, SPELL_ENTRIES.spell_z_down,
];

/** spell_mp_cost: each spell's magic points, in BCD. */
const SPELL_MP_COST: readonly number[] = [
  0x05, 0x15, 0x05, 0x20, 0x10, 0x15, 0x40, 0x10, 0x20, 0x30, 0x25, 0x05, 0x05, 0x20, 0x05, 0x15, 0x20, 0x45, 0x15, 0x30,
  0x15, 0x15, 0x10, 0x15, 0x10, 0x05,
];


/** Every byte the spells read as data, by address, as loading ULT4 leaves them. */
export function spellData(): readonly [ number, readonly number[] ][] {
  return [
    [ SPELL_VARIABLES.current_spell, [ 0x00 ] ],
    [ SPELL_VARIABLES.saved_cursor_x, [ 0x00, 0x00 ] ],
    [ SPELL_TABLES.spell_jump_table, SPELL_ROUTINES.flatMap((address: number): number[] => [ address & 0xFF, address >> 8 ]) ],
    [ SPELL_TABLES.spell_mp_cost, SPELL_MP_COST ],
    ...Object.values(SPELL_INLINE).map((block: IInlineData): [ number, readonly number[] ] => [ block.address, block.bytes ]),
  ];
}
