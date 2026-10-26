// The differential cases for ULT4's combat: each entry in a battle drawn at random, with foes of
// every kind the routines treat apart (mimics, wisps, zorns, balrons, reapers, gremlins, rogues,
// Lord British), the arena's ground, the auras, the weapons, and the players up, asleep or gone.
// A routine that jumps on is stopped at the next step of the fight and compared there.

import type { UltimaDiskName } from '../../../src/app/data/ultima-disks';
import type { LiftedMachine } from '../../../src/app/lifted-runtime/lifted-machine';
import { COMBAT_ENTRIES, COMBAT_VARIABLES } from '../../../src/app/port/program/ult4-combat-data';
import { DUNGEON_ENTRIES } from '../../../src/app/port/program/ult4-dungeons-data';
import { COMMAND_ENTRIES } from '../../../src/app/port/program/ult4-commands-data';
import { ULT4_ENTRIES } from '../../../src/app/port/program/ult4-data';
import { SPELL_ENTRIES } from '../../../src/app/port/program/ult4-spells-data';
import { DISKS, MAP_OBJECTS, PRTY, ROST, ZP_COMBAT, ZP_MAIN } from '../../../src/app/state/symbols';
import { byte } from './differential';
import type { ICase, Random } from './differential';
import { STOPS, pick, world } from './ult4-cases';

const C = COMBAT_ENTRIES;
const S = SPELL_ENTRIES;
const E = ULT4_ENTRIES;
const O = MAP_OBJECTS;
const ARENA_SIZE: number = 11;
const ZP_CUR_FOE_INDEX: number = 0xEA;

type Key = { code: number; polls: number };

export const FOES: readonly number[] = [
  0x00, 0x00, 0x00, 0xC0, 0xC0, 0xCC, 0xC8, 0xAC, 0xDC, 0xEC, 0xFC, 0xB0, 0xA8, 0x5E, 0x4B, 0xA4, 0xF8, 0x80, 0x88, 0x9C, 0x94, 0xE8, 0xF0, 0x24,
  0x50, 0x90, 0xB4, 0xA0,
];
const GROUND: readonly number[] = [
  0x04, 0x04, 0x04, 0x04, 0x05, 0x06, 0x07, 0x00, 0x01, 0x02, 0x03, 0x08, 0x09, 0x3C, 0x44, 0x45, 0x46, 0x47, 0x4C, 0x48, 0x49, 0x31, 0x33, 0x37,
  0x16, 0x3E, 0x7F, 0x80,
];
/** The weapons combat treats apart: dagger, flaming oil, halberd, magic axe, magic wand, and any. */
const WEAPONS: readonly number[] = [ 0x02, 0x09, 0x0A, 0x0B, 0x0E, 0x00, 0x06, 0x07, 0x0F ];
/** The foes a foe's turn treats apart. */
const SPECIAL_FOES: readonly number[] = [ 0xAC, 0xDC, 0xEC, 0xFC, 0xB0, 0xA8, 0xC8, 0x4B, 0xE8, 0xF0, 0x9C ];
const FIELDS: readonly number[] = [ 0x44, 0x45, 0x46, 0x47, 0x4C ];
const AURAS: readonly number[] = [ 0x25, 0x25, 0xCA, 0xCE, 0xD0, 0xD1, 0x5F ];
/** Where the fight began: its mode, and the disk in the drive there. */
const BEFORE: readonly (readonly [ number, number, UltimaDiskName ])[] = [
  [ PRTY.mode_world, DISKS.disk_britannia, 'britannia' ], [ PRTY.mode_world, DISKS.disk_britannia, 'britannia' ],
  [ PRTY.mode_towne, DISKS.disk_towne, 'towne' ], [ PRTY.mode_dungeon, DISKS.disk_dungeon, 'underworld' ],
];
/** A direction a foe or a missile goes in: never nowhere, which calc_direction cannot give. */
const DELTAS: readonly (readonly [ number, number ])[] = [
  [ 0x00, 0x01 ], [ 0x00, 0xFF ], [ 0x01, 0x00 ], [ 0xFF, 0x00 ], [ 0x01, 0x01 ], [ 0xFF, 0xFF ], [ 0x01, 0xFF ], [ 0xFF, 0x01 ],
];
export const ARROWS: readonly number[] = [ 0x0B, 0x0A, 0x08, 0x15, 0x0D, 0x2F ];
const COMBAT_KEYS: readonly number[] = [ ...ARROWS, 0x20, 0x41, 0x47, 0x52, 0x5A, 0x43, 0x55, 0x56, 0x42, 0x31, 0x00 ];


function bcd(random: Random): number {
  return (Math.floor(random() * 10) << 4) | Math.floor(random() * 10);
}


function arenaXy(random: Random): number {
  return (random() < 0.9) ? Math.floor(random() * ARENA_SIZE) : pick(random, [ 0x0B, 0x80, 0xFF ]);
}


/** The foes, their places and their state. */
function foes(machine: LiftedMachine, random: Random): void {
  for (let foe: number = 0; foe <= O.foes_max; foe++) {
    const tile: number = pick(random, FOES);

    machine.write(O.combat_foe_tile_type + foe, tile);
    machine.write(O.combat_foe_tile_sprite + foe, tile);
    machine.write(O.combat_foe_cur_x + foe, arenaXy(random));
    machine.write(O.combat_foe_cur_y + foe, arenaXy(random));
    machine.write(O.combat_foe_prev_x + foe, arenaXy(random));
    machine.write(O.combat_foe_prev_y + foe, arenaXy(random));
    machine.write(O.combat_foe_hp + foe, pick(random, [ byte(random), byte(random), 0x10, 0x17, 0x18, 0x01 ]));
    machine.write(O.combat_foe_slept + foe, (random() < 0.2) ? 0x01 : 0x00);
  }
}


/** The players in the arena, up, asleep, or fled, with their stats in BCD. */
function players(machine: LiftedMachine, random: Random): void {
  for (let player: number = 0; player < ROST.player_last; player++) {
    const stats: number = ROST.player_stats + (player * 0x20);

    machine.write(O.combat_player_tile + player, pick(random, [ 0x20, 0x22, 0x2E, 0x38, 0x00 ]));
    machine.write(O.combat_player_xpos + player, arenaXy(random));
    machine.write(O.combat_player_ypos + player, arenaXy(random));
    machine.write(stats + ROST.player_status, pick(random, [ ROST.status_Good, ROST.status_Good, ROST.status_Poison, ROST.status_Sleep, ROST.status_Dead ]));
    machine.write(stats + ROST.player_class_index, Math.floor(random() * 8));
    machine.write(stats + ROST.player_strength, bcd(random));
    machine.write(stats + ROST.player_dexterity, pick(random, [ bcd(random), 0x99, 0x01 ]));
    machine.write(stats + ROST.player_weapon, Math.floor(random() * 16));
    machine.write(stats + ROST.player_armour, Math.floor(random() * 8));
    machine.write(stats + ROST.player_cur_hp_hi, pick(random, [ 0x00, 0x01, bcd(random) ]));
    machine.write(stats + ROST.player_max_hp_hi, pick(random, [ 0x01, bcd(random) ]));
  }
}


function arena(machine: LiftedMachine, random: Random): void {
  for (let index: number = 0; index < ARENA_SIZE * ARENA_SIZE; index++) {
    machine.write(O.world_tiles + index, pick(random, GROUND));
  }
  for (let index: number = 0; index < 0x30; index++) {
    machine.write(O.map_start_foe_x + index, Math.floor(random() * ARENA_SIZE));
  }
  for (let index: number = 0; index < 0x10; index++) {
    machine.write(O.dng_trigger_new_tile + index, (random() < 0.5) ? 0x00 : byte(random));
  }
}


/** A fight under way, in Britannia, a towne, the inn or a dungeon room. */
export function battle(machine: LiftedMachine, random: Random): void {
  world(machine, random);
  foes(machine, random);
  players(machine, random);
  arena(machine, random);
  const [ before, disk, name ]: readonly [ number, number, UltimaDiskName ] = pick(random, BEFORE);

  machine.bload('program', 'TRAINERS');
  machine.write(PRTY.game_mode, pick(random, [ 0x80, 0x80, 0x80, 0x82, 0x81 ]));
  machine.write(ZP_MAIN.game_mode_pre_combat, before);
  machine.write(ZP_MAIN.currdisk_drive1, disk);
  machine.insertDisk(1, name);
  machine.write(ZP_COMBAT.foe_type_encountered, pick(random, FOES.filter((tile: number): boolean => tile !== 0)));
  machine.write(ZP_MAIN.foe_type_combat, pick(random, FOES));
  machine.write(ZP_COMBAT.pre_combat_tile, pick(random, GROUND));
  machine.write(ZP_COMBAT.pre_combat_x, byte(random));
  machine.write(ZP_COMBAT.pre_combat_y, byte(random));
  machine.write(ZP_MAIN.magic_aura, pick(random, AURAS));
  machine.write(ZP_MAIN.aura_duration, pick(random, [ 0x00, 0x01, 0x05 ]));
  machine.write(ZP_MAIN.curr_player, 1 + Math.floor(random() * machine.read(PRTY.party_size)));
  machine.write(ZP_COMBAT.curr_player_turn, machine.read(ZP_MAIN.curr_player));
  machine.write(ZP_CUR_FOE_INDEX, Math.floor(random() * (O.foes_max + 1)));
  machine.write(ZP_MAIN.target_player, Math.floor(random() * 9));
  machine.write(COMBAT_VARIABLES.current_weapon, pick(random, WEAPONS));
  machine.write(COMBAT_VARIABLES.aim_range, Math.floor(random() * 12));
  machine.write(COMBAT_VARIABLES.missile_traveled, Math.floor(random() * 4));
  machine.write(COMBAT_VARIABLES.flee_x, pick(random, [ 0x00, 0x00, 0x0B, 0xFF ]));
  machine.write(COMBAT_VARIABLES.flee_y, pick(random, [ 0x00, 0x00, 0x0B, 0xFF ]));
  for (const address of [ PRTY.dest_x, PRTY.dest_y, O.target_x, O.target_y, ZP_MAIN.temp_x, ZP_MAIN.temp_y ]) {
    machine.write(address, arenaXy(random));
  }
  const [ dx, dy ]: readonly [ number, number ] = pick(random, DELTAS);

  machine.write(ZP_MAIN.delta_x, dx);
  machine.write(ZP_MAIN.delta_y, dy);
  machine.write(0xDB, pick(random, [ 0x01, 0x02, 0x04, 0x05, 0x09, 0xFF ]));
  machine.write(ZP_MAIN.damage, byte(random));
  machine.write(PRTY.current_location, pick(random, [ 0x00, 0x00, 0x05, PRTY.loc_dng_abyss ]));
  machine.write(ROST.party_stats + ROST.party_stat_weapons + ROST.weapon_dagger, pick(random, [ 0x00, 0x01, 0x05 ]));
  machine.write(ROST.party_stats + ROST.party_stat_weapons + ROST.weapon_flaming_oil, pick(random, [ 0x00, 0x01, 0x05 ]));
  machine.write(ZP_MAIN.key_buf_len, 0x00);
  machine.cpu.a = pick(random, [ byte(random), Math.floor(random() * 9), pick(random, FOES), pick(random, GROUND) ]);
  machine.cpu.p = (machine.cpu.p & ~0x82) | ((machine.cpu.a & 0x80) !== 0 ? 0x80 : 0x00) | (machine.cpu.a === 0 ? 0x02 : 0x00);
  machine.cpu.x = (random() < 0.7) ? machine.read(ZP_CUR_FOE_INDEX) : byte(random);
}


/** A battle with the foe whose turn it is one of the kinds treated apart, half the time on a field or lava. */
function focused(machine: LiftedMachine, random: Random): void {
  battle(machine, random);
  const foe: number = machine.read(ZP_CUR_FOE_INDEX);
  const tile: number = pick(random, SPECIAL_FOES);

  machine.write(O.combat_foe_tile_type + foe, tile);
  machine.write(O.combat_foe_tile_sprite + foe, tile);
  machine.write(O.combat_foe_cur_x + foe, Math.floor(random() * ARENA_SIZE));
  machine.write(O.combat_foe_cur_y + foe, Math.floor(random() * ARENA_SIZE));
  if (random() < 0.5) {
    machine.write(O.world_tiles + (machine.read(O.combat_foe_cur_y + foe) * ARENA_SIZE) + machine.read(O.combat_foe_cur_x + foe), pick(random, FIELDS));
  }
  machine.cpu.x = foe;
}


/** A battle about to begin, its foes' places cleared as init_combat clears them. */
function clearedArena(machine: LiftedMachine, random: Random): void {
  battle(machine, random);
  for (let index: number = 0; index < 0x100; index++) {
    machine.write(O.combat_foe_cur_x + index, 0x00);
  }
}


/** Where a step of the fight goes next: the labels it jumps to, never the ones it calls. */
export const COMBAT_STOPS: readonly number[] = [
  ...STOPS, C.begin_combat, C.combat_take_turn, C.combat_cmd_done, C.combat_end_turn, C.foe_take_turn, C.calc_nearest_player, C.calc_attack_type,
  C.no_range_attack, C.do_foe_move, C.check_tile_effect, C.next_foe, C.fleeing, C.end_foes_turn, C.foes_vanquished, C.player_flee,
  C.combat_players_fled, C.combat_over, C.do_foe_melee_attack, C.combat_move_up, C.combat_move_down, C.combat_move_left, C.combat_move_right,
  C.try_move, C.try_flee, C.do_flee, C.combat_cmd_attack, C.melee_attack, C.did_hit, C.ranged_attack, C.use_weapon, C.last_one, C.check_target,
  C.target_hit, C.missed, C.end_attack, C.combat_cmd_cast, C.combat_cmd_get, C.combat_cmd_ready, C.combat_cmd_ztats, DUNGEON_ENTRIES.combat_exit_room,
  S.choose_spell, COMMAND_ENTRIES.ask_weapon, COMMAND_ENTRIES.zstats_for_player, COMMAND_ENTRIES.do_get_chest, E.cmd_use_item, 0x5D1A, 0xFB0F,
];


export function keyOf(keys: readonly number[]): (random: Random) => Key {
  return (random: Random): Key => ({ code: pick(random, keys), polls: Math.floor(random() * 4) });
}


function step(entry: number, extra?: Partial<ICase>): readonly [ number, ICase ] {
  return [ entry, { ult4: true, stops: COMBAT_STOPS, key: keyOf(ARROWS), setup: battle, ...extra } ];
}


/** The attack's direction, and for flaming oil a range. */
function aimed(random: Random): readonly Key[] {
  return [ { code: pick(random, [ ...ARROWS, 0x20 ]), polls: 1 }, { code: pick(random, [ 0x31, 0x33, 0x39, 0x41 ]), polls: 1 } ];
}


export const COMBAT_CASES: Readonly<Record<string, readonly [ number, ICase ]>> = {
  inn_combat: step(C.inn_combat, { setup: (machine: LiftedMachine, random: Random): void => {
    clearedArena(machine, random);
    machine.write(PRTY.game_mode, PRTY.mode_towne);
    machine.write(ZP_MAIN.currdisk_drive1, DISKS.disk_towne);
    machine.insertDisk(1, 'towne');
  } }),
  init_combat: step(C.init_combat),
  load_arena: step(C.load_arena, { setup: (machine: LiftedMachine, random: Random): void => {
    clearedArena(machine, random);
    machine.cpu.a = pick(random, [ 0xC1, 0xC7, 0xD4 ]);
  } }),
  initialize_arena: step(C.initialize_arena, { setup: clearedArena }),
  begin_combat: step(C.begin_combat),
  start_players_turn: step(C.start_players_turn),
  combat_take_turn: step(C.combat_take_turn, { key: keyOf(COMBAT_KEYS) }),
  combat_cmd_done: step(C.combat_cmd_done),
  combat_end_turn: step(C.combat_end_turn),
  foe_take_turn: step(C.foe_take_turn, { setup: focused }),
  calc_nearest_player: step(C.calc_nearest_player, { setup: focused }),
  calc_direction: step(C.calc_direction, { setup: (machine: LiftedMachine, random: Random): void => {
    focused(machine, random);
    machine.cpu.a = 1 + Math.floor(random() * machine.read(PRTY.party_size));
  } }),
  calc_attack_type: step(C.calc_attack_type, { setup: focused }),
  no_range_attack: step(C.no_range_attack, { setup: focused }),
  do_foe_move: step(C.do_foe_move, { setup: focused }),
  check_tile_effect: step(C.check_tile_effect, { setup: focused }),
  next_foe: step(C.next_foe),
  fleeing: step(C.fleeing, { setup: focused }),
  do_jinx: step(C.do_jinx, { setup: (machine: LiftedMachine, random: Random): void => {
    battle(machine, random);
    const foe: number = Math.floor(random() * (O.foes_max + 1));

    machine.write(ZP_MAIN.magic_aura, (random() < 0.7) ? ZP_MAIN.aura_jinx : pick(random, AURAS));
    machine.write(PRTY.dest_x, machine.read(O.combat_foe_cur_x + foe));
    machine.write(PRTY.dest_y, machine.read(O.combat_foe_cur_y + foe));
  } }),
  end_foes_turn: step(C.end_foes_turn),
  steal_food: step(C.steal_food),
  try_steal_gold: step(C.try_steal_gold),
  check_scene_over: step(C.check_scene_over),
  check_players_gone: step(C.check_players_gone),
  player_flee: step(C.player_flee),
  combat_players_fled: step(C.combat_players_fled),
  foes_vanquished: step(C.foes_vanquished),
  get_free_object_slot: step(C.get_free_object_slot),
  combat_over: step(C.combat_over),
  do_foe_melee_attack: step(C.do_foe_melee_attack, { setup: focused }),
  player_injured: step(C.player_injured, { setup: focused }),
  combat_move_up: step(C.combat_move_up),
  combat_move_left: step(C.combat_move_left),
  try_move: step(C.try_move),
  xy_to_offset: step(C.xy_to_offset),
  try_flee: step(C.try_flee),
  do_flee: step(C.do_flee),
  combat_cmd_attack: step(C.combat_cmd_attack, { key: undefined, keys: aimed }),
  melee_attack: step(C.melee_attack),
  did_hit: step(C.did_hit),
  ranged_attack: step(C.ranged_attack, { key: keyOf([ 0x31, 0x35, 0x39, 0x41, 0x2F ]) }),
  use_weapon: step(C.use_weapon),
  last_one: step(C.last_one),
  check_target: step(C.check_target),
  target_hit: step(C.target_hit),
  inflict_damage: step(C.inflict_damage),
  still_alive: step(C.still_alive),
  missed: step(C.missed),
  end_attack: step(C.end_attack, { setup: (machine: LiftedMachine, random: Random): void => {
    battle(machine, random);
    machine.write(COMBAT_VARIABLES.current_weapon, (random() < 0.7) ? ROST.weapon_magic_axe : pick(random, WEAPONS));
  } }),
  combat_cmd_cast: step(C.combat_cmd_cast),
  combat_cmd_get: step(C.combat_cmd_get),
  combat_cmd_ready: step(C.combat_cmd_ready),
  combat_cmd_ztats: step(C.combat_cmd_ztats),
  foe_index_from_tile: step(C.foe_index_from_tile),
  is_awake: step(C.is_awake),
  is_alive: step(C.is_alive),
  get_player_sprite: step(C.get_player_sprite),
  rand_modulo: step(C.rand_modulo),
  legal_move_combat: step(C.legal_move_combat),
  collide_terrain: step(C.collide_terrain),
  get_rangeattack_type: step(C.get_rangeattack_type, { setup: (machine: LiftedMachine, random: Random): void => {
    battle(machine, random);
    machine.cpu.a = pick(random, [ 0xFC, 0xB0, 0xCC, 0xAC, 0x20, 0x00, 0xC0, byte(random) ]);
  } }),
  do_foe_range_attack: step(C.do_foe_range_attack, { setup: (machine: LiftedMachine, random: Random): void => {
    battle(machine, random);
    machine.cpu.a = pick(random, [ 0x44, 0x45, 0x46, 0x47, 0x4C, 0x4D, 0x4E, 0x4F, 0x37 ]);
  } }),
  hit_player: step(C.hit_player, { setup: (machine: LiftedMachine, random: Random): void => {
    battle(machine, random);
    machine.write(O.attack_sprite, pick(random, [ 0x44, 0x45, 0x46, 0x47, 0x4C, 0x4D, 0x4E, 0x4F ]));
  } }),
  effect_poison_sleep: step(C.effect_poison_sleep),
  check_hit_player: step(C.check_hit_player),
  check_hit_foe: step(C.check_hit_foe),
  next_arena_tile: step(C.next_arena_tile),
  math_abs: step(C.math_abs),
  input_target_xy: step(C.input_target_xy, { key: keyOf([ ...ARROWS, 0x20, 0x41 ]) }),
  input_direction: step(C.input_direction, { key: keyOf([ ...ARROWS, 0x20, 0x41 ]) }),
  print_target_name: step(C.print_target_name),
};
