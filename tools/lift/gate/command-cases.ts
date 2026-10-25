// The differential cases for the rest of ULT4's Britannia commands: each command and routine with
// the party, its belongings and the objects about it drawn at random, in Britannia, a towne, a
// dungeon or a fight, and keys for whatever its prompts ask. A command is compared where it goes
// next: the turn's end, a refusal, the fight it starts, or the game lost.

import type { LiftedMachine } from '../../../src/app/lifted-runtime/lifted-machine';
import { COMBAT_ENTRIES } from '../../../src/app/port/program/ult4-combat-data';
import { COMMAND_ENTRIES, COMMAND_VARIABLES } from '../../../src/app/port/program/ult4-commands-data';
import { ULT4_ENTRIES } from '../../../src/app/port/program/ult4-data';
import { DISKS, MAP_OBJECTS, MUSIC_STATE, PRTY, ROST, TILES, TRAINERS, ZP_COMBAT, ZP_MAIN } from '../../../src/app/state/symbols';
import type { UltimaDiskName } from '../../../src/app/data/ultima-disks';
import { byte } from './differential';
import type { ICase, Random } from './differential';
import { rigRand } from './monster-cases';
import { STOPS, pick, world } from './ult4-cases';

type Key = { code: number; polls: number };

const CE = COMMAND_ENTRIES;
const CV = COMMAND_VARIABLES;
const E = ULT4_ENTRIES;
const O = MAP_OBJECTS;
const ZP_INDEX1: number = 0xD8;
const ZP_TRAP_TYPE: number = 0xDA;
const ESC: number = 0x1B;
const ARROWS: readonly number[] = [ 0x0B, 0x0A, 0x08, 0x15 ];
const DIGITS: readonly number[] = [ 0x30, 0x31, 0x31, 0x32, 0x33, 0x34, 0x38, 0x39 ];
const OBJECTS: readonly number[] = [
  0x00, 0x00, 0x00, TILES.tile_guard, TILES.tile_lord_british, TILES.tile_chest, TILES.tile_whirlpool, TILES.tile_twister, TILES.tile_rat, 0xC0,
  TILES.tile_pirate, TILES.tile_human_prone, TILES.tile_water_shallow, TILES.tile_walk, TILES.tile_horse_east, TILES.tile_beggar, 0x20, 0xCC, 0x8A,
];
/** The ground the party stands on: Britannia's fields, a bridge, the places to enter, and a dungeon's fields and traps. */
const GROUND: readonly number[] = [
  0x04, 0x03, TILES.tile_field_poison, TILES.tile_field_fire, TILES.tile_field_sleep, TILES.tile_lava, TILES.tile_bridge_narrow, TILES.tile_chest,
  TILES.tile_dungeon_entrance, TILES.tile_towne, TILES.tile_castle, TILES.tile_village, TILES.tile_castle_center, TILES.tile_ruin, TILES.tile_shrine,
  0xA0, 0xA1, 0xA2, 0xA3, 0x80, 0x81, 0x87, 0x88, 0x8F, 0x40,
];
/** A towne's tiles about the party: floor, doors, chests and walls. */
const TOWNE: readonly number[] = [ TILES.tile_floor_brick, TILES.tile_door_locked, TILES.tile_door_unlocked, TILES.tile_chest, 0x7F, 0x04 ];
/** Where the places are: a few of location_map_x and _y, then anywhere. */
const PLACES: readonly (readonly [ number, number ])[] = [
  [ 0x56, 0x6B ], [ 0xE8, 0x87 ], [ 0x62, 0x91 ], [ 0xBB, 0xA9 ], [ 0xF0, 0x49 ], [ 0xE9, 0xE9 ], [ 0xE9, 0x42 ], [ 0xDA, 0x6B ], [ 0xE7, 0xD8 ], [ 0xE7, 0xD8 ],
];
/** The tiles a place stands on. */
const PLACE_TILES: readonly number[] = [
  TILES.tile_dungeon_entrance, TILES.tile_towne, TILES.tile_castle, TILES.tile_village, TILES.tile_castle_center, TILES.tile_ruin, TILES.tile_shrine,
  TILES.tile_field_fire, 0x04,
];
/** The objects an attack makes over into its proper foe. */
const ODD_FOES: readonly number[] = [ TILES.tile_human_prone, TILES.tile_water_shallow, TILES.tile_walk, TILES.tile_horse_east, 0xC0, TILES.tile_guard ];


function bcd(random: Random): number {
  return pick(random, [ 0x00, 0x01, 0x09, 0x10, 0x25, 0x50, 0x99, (Math.floor(random() * 10) << 4) | Math.floor(random() * 10) ]);
}


/** Each player's record: status, stats in BCD, hit points, arms, class and the class's bit. */
function players(machine: LiftedMachine, random: Random): void {
  for (let player: number = 0; player < 8; player++) {
    const base: number = ROST.player_stats + (player * 0x20);
    const playerClass: number = Math.floor(random() * 8);

    machine.write(base + ROST.player_gender, pick(random, [ 0xCD, 0xC6 ]));
    machine.write(base + ROST.player_class_index, playerClass);
    machine.write(base + ROST.player_class_bit, pick(random, [ 0x80 >> playerClass, 0x80 >> playerClass, byte(random) ]));
    machine.write(base + ROST.player_status, pick(random, [ ROST.status_Good, ROST.status_Good, ROST.status_Good, ROST.status_Poison, ROST.status_Sleep, ROST.status_Dead ]));
    for (const stat of [ ROST.player_strength, ROST.player_dexterity, ROST.player_intelligence, ROST.player_magic_points, ROST.player_experience_lo ]) {
      machine.write(base + stat, bcd(random));
    }
    machine.write(base + ROST.player_experience_hi, pick(random, [ 0x00, 0x01, 0x99 ]));
    machine.write(base + ROST.player_cur_hp_hi, pick(random, [ 0x00, 0x00, 0x01, 0x02, 0x09 ]));
    machine.write(base + ROST.player_cur_hp_lo, bcd(random));
    machine.write(base + ROST.player_max_hp_hi, pick(random, [ 0x00, 0x02, 0x03, 0x09 ]));
    machine.write(base + ROST.player_max_hp_lo, bcd(random));
    machine.write(base + ROST.player_weapon, Math.floor(random() * 0x10));
    machine.write(base + ROST.player_armour, Math.floor(random() * 0x08));
  }
}


/** The party's belongings: arms, equipment, the quest's items, food, gold and mixtures. */
function belongings(machine: LiftedMachine, random: Random): void {
  for (let index: number = 0x18; index < 0x30; index++) {
    machine.write(ROST.party_stats + index, pick(random, [ 0x00, 0x00, 0x01, 0x02, 0x12, 0x99 ]));
  }
  for (const stat of [ ROST.party_stat_torches, ROST.party_stat_gems, ROST.party_stat_keys, ROST.party_stat_sextant ]) {
    machine.write(ROST.party_stats + stat, pick(random, [ 0x00, 0x00, 0x01, 0x15, 0x99 ]));
  }
  machine.write(ROST.stones, pick(random, [ 0x00, 0x81, 0xFF, byte(random) ]));
  machine.write(ROST.runes, pick(random, [ 0x00, 0x42, 0xFF, byte(random) ]));
  machine.write(ROST.bell_book_candle, pick(random, [ 0x00, 0x07, 0x05, ROST.items_opened_abyss, byte(random) ]));
  machine.write(ROST.threepartkey, pick(random, [ 0x00, 0x05, 0x07, byte(random) ]));
  for (const item of [ ROST.horn, ROST.wheel, ROST.skull ]) {
    machine.write(item, pick(random, [ 0x00, 0x01, 0xFF ]));
  }
  machine.write(ROST.food_hi, pick(random, [ 0x00, 0x00, 0x01, 0x99 ]));
  machine.write(ROST.food_lo, pick(random, [ 0x00, 0x00, 0x01, 0x50 ]));
  machine.write(ROST.food_frac, pick(random, [ 0x00, 0x01, 0x05, 0x99 ]));
  machine.write(ROST.party_stats + ROST.party_stat_gold_hi, pick(random, [ 0x00, 0x99 ]));
  machine.write(ROST.party_stats + ROST.party_stat_gold_lo, bcd(random));
  for (let index: number = 0; index < 0x1A; index++) {
    machine.write(ROST.mixtures + index, pick(random, [ 0x00, 0x00, 0x01, 0x12 ]));
  }
  for (let index: number = 0; index < 8; index++) {
    machine.write(ROST.party_stats + ROST.party_stat_reagents + index, pick(random, [ 0x00, 0x03, 0x15 ]));
  }
}


/** Near the party, at it, or anywhere. */
function near(random: Random, at: number): number {
  return pick(random, [ (at + Math.floor(random() * 3) - 1) & 0xFF, (at + Math.floor(random() * 3) - 1) & 0xFF, at, byte(random) ]);
}


/** The objects, many of them beside the party, and the fight's players and their ground. */
function about(machine: LiftedMachine, random: Random): void {
  const x: number = machine.read(PRTY.player_xpos);
  const y: number = machine.read(PRTY.player_ypos);

  for (let slot: number = 0; slot <= O.object_max; slot++) {
    const tile: number = pick(random, OBJECTS);

    machine.write(O.object_tile_type + slot, tile);
    machine.write(O.object_tile_sprite + slot, tile);
    machine.write(O.object_xpos + slot, near(random, x));
    machine.write(O.object_ypos + slot, near(random, y));
    machine.write(O.npc_movement_ai + slot, byte(random));
    machine.write(O.npc_dialogue + slot, byte(random));
  }
  for (let player: number = 0; player < 8; player++) {
    machine.write(O.combat_player_tile + player, pick(random, [ 0x00, 0x20, 0x24, TILES.tile_human_prone ]));
    machine.write(O.combat_player_xpos + player, Math.floor(random() * 11));
    machine.write(O.combat_player_ypos + player, Math.floor(random() * 11));
  }
}


/** The party somewhere, its belongings, the objects about it, and the commands' own state. */
function commanding(machine: LiftedMachine, random: Random): void {
  world(machine, random);
  const mode: number = pick(random, [ PRTY.mode_world, PRTY.mode_world, PRTY.mode_world, PRTY.mode_towne, PRTY.mode_towne, 0x80, PRTY.mode_dungeon ]);

  machine.write(PRTY.game_mode, mode);
  machine.write(PRTY.current_location, (mode === PRTY.mode_world) ? pick(random, [ 0x00, 0x00, 0x00, 0x01 ]) : pick(random, [ 0x01, 0x05, 0x0D, 0x11 ]));
  if (random() < 0.3) {
    const [ x, y ]: readonly [ number, number ] = pick(random, PLACES);

    machine.write(PRTY.player_xpos, x);
    machine.write(PRTY.player_ypos, y);
  }
  if (mode === PRTY.mode_towne) {
    machine.write(PRTY.player_xpos, Math.floor(random() * 0x20));
    machine.write(PRTY.player_ypos, Math.floor(random() * 0x20));
    for (let index: number = 0; index < 0x400; index++) {
      machine.write(O.towne_map + index, pick(random, TOWNE));
    }
  }
  machine.write(ZP_MAIN.tile_under_player, pick(random, GROUND));
  players(machine, random);
  belongings(machine, random);
  about(machine, random);
  machine.write(ZP_MAIN.sfx_volume, pick(random, [ 0x00, 0xFF ]));
  machine.write(MUSIC_STATE.music_mute, pick(random, [ 0x00, 0xFF ]));
  machine.write(CV.door_open_x, near(random, machine.read(PRTY.player_xpos)) & 0x1F);
  machine.write(CV.door_open_y, near(random, machine.read(PRTY.player_ypos)) & 0x1F);
  machine.write(CV.door_open_countdown, pick(random, [ 0x00, 0x00, 0x01, 0x02, 0x05 ]));
  machine.write(ZP_MAIN.curr_player, Math.floor(random() * (machine.read(PRTY.party_size) + 1)));
  machine.write(ZP_COMBAT.curr_player_turn, 1 + Math.floor(random() * machine.read(PRTY.party_size)));
  machine.write(ZP_MAIN.delta_x, pick(random, [ 0x00, 0x01, 0xFF ]));
  machine.write(ZP_MAIN.delta_y, pick(random, [ 0x00, 0x01, 0xFF ]));
  machine.write(ZP_MAIN.temp_x, near(random, machine.read(PRTY.player_xpos)));
  machine.write(ZP_MAIN.temp_y, near(random, machine.read(PRTY.player_ypos)));
  machine.write(ZP_INDEX1, Math.floor(random() * (O.object_max + 1)));
  for (const trainer of [ TRAINERS.trainer_torch, TRAINERS.trainer_jimmy, TRAINERS.trainer_food, TRAINERS.trainer_avoid ]) {
    machine.write(trainer, (random() < 0.15) ? 0x01 : 0x00);
  }
  machine.write(ZP_MAIN.key_buf_len, 0x00);
}


/** A disk for the place the command loads from, in drive 1 or not. */
function onDisk(disk: UltimaDiskName, number: number): (machine: LiftedMachine, random: Random) => void {
  return (machine: LiftedMachine, random: Random): void => {
    commanding(machine, random);
    if (random() < 0.5) {
      machine.write(ZP_MAIN.currdisk_drive1, number);
      machine.insertDisk(1, disk);
    }
  };
}


/** Two drives, the towne disk in the first and Britannia's in the second, as the towne's loads ask for them. */
function twoDrives(machine: LiftedMachine, random: Random): void {
  commanding(machine, random);
  machine.write(ZP_MAIN.numdrives, 0x02);
  machine.write(ZP_MAIN.currdisk_drive1, DISKS.disk_towne);
  machine.write(ZP_MAIN.currdisk_drive2, DISKS.disk_britannia);
  machine.insertDisk(1, 'towne');
  machine.insertDisk(2, 'britannia');
}


/** At a dungeon's entrance, its location set, the underworld disk in drive 1 or not. */
function atDungeon(machine: LiftedMachine, random: Random): void {
  onDisk('underworld', DISKS.disk_dungeon)(machine, random);
  machine.write(PRTY.current_location, PRTY.loc_dng_first + Math.floor(random() * 8));
  machine.write(PRTY.player_transport, pick(random, [ TILES.tile_walk, TILES.tile_walk, TILES.tile_horse_west ]));
}


/** At a place, on its tile or another. */
function atPlace(machine: LiftedMachine, random: Random): void {
  twoDrives(machine, random);
  const [ x, y ]: readonly [ number, number ] = pick(random, PLACES);

  machine.write(PRTY.game_mode, PRTY.mode_world);
  machine.write(PRTY.current_location, (random() < 0.9) ? 0x00 : 0x01);
  machine.write(PRTY.player_xpos, x);
  machine.write(PRTY.player_ypos, y);
  machine.write(ZP_MAIN.tile_under_player, pick(random, PLACE_TILES));
}


/** Into a towne of the eight a companion may come from, the party's leader often of its class. */
function intoTowne(machine: LiftedMachine, random: Random): void {
  twoDrives(machine, random);
  const towne: number = Math.floor(random() * 10);

  machine.write(PRTY.current_location, PRTY.loc_towne_first + towne);
  if (random() < 0.5) {
    machine.write(ROST.player_stats + ROST.player_class_index, towne);
  }
}


/** The object attacked one an attack makes over, or a guard. */
function oddFoe(machine: LiftedMachine, random: Random): void {
  commanding(machine, random);
  machine.write(PRTY.game_mode, pick(random, [ PRTY.mode_world, PRTY.mode_towne ]));
  machine.write(O.object_tile_type + machine.read(ZP_INDEX1), pick(random, ODD_FOES));
}


/** A ship with objects beside it all round, the eighth slot, the first inanimate one, among them. */
function broadside(machine: LiftedMachine, random: Random): void {
  commanding(machine, random);
  machine.write(PRTY.game_mode, PRTY.mode_world);
  machine.write(PRTY.current_location, 0x00);
  machine.write(PRTY.player_transport, pick(random, [ TILES.tile_ship_west, TILES.tile_ship_north, TILES.tile_ship_east, TILES.tile_ship_south, TILES.tile_walk ]));
  const x: number = machine.read(PRTY.player_xpos);
  const y: number = machine.read(PRTY.player_ypos);

  for (let slot: number = 0; slot <= O.object_max; slot++) {
    machine.write(O.object_tile_type + slot, 0x00);
  }
  [ [ 1, 0 ], [ -1, 0 ], [ 0, 1 ], [ 0, -1 ] ].forEach(([ dx, dy ]: number[], index: number): void => {
    const slot: number = pick(random, [ 0x07, 0x08, 0x09, index ]);

    machine.write(O.object_tile_type + slot, pick(random, [ TILES.tile_pirate, 0xC0, TILES.tile_lord_british ]));
    machine.write(O.object_xpos + slot, (x + (dx * (1 + Math.floor(random() * 3)))) & 0xFF);
    machine.write(O.object_ypos + slot, (y + (dy * (1 + Math.floor(random() * 3)))) & 0xFF);
  });
}


/** A chest under the party, in a towne the towne's own half the time. */
function overChest(machine: LiftedMachine, random: Random): void {
  commanding(machine, random);
  machine.write(PRTY.game_mode, pick(random, [ PRTY.mode_world, PRTY.mode_towne, PRTY.mode_towne ]));
  machine.write(ZP_MAIN.tile_under_player, TILES.tile_chest);
  if (machine.read(PRTY.game_mode) === PRTY.mode_towne) {
    const x: number = machine.read(PRTY.player_xpos) & 0x1F;
    const y: number = machine.read(PRTY.player_ypos) & 0x1F;

    machine.write(PRTY.player_xpos, x);
    machine.write(PRTY.player_ypos, y);
    machine.write(O.towne_map + (y * 0x20) + x, pick(random, [ TILES.tile_chest, TILES.tile_floor_brick ]));
  }
}


/** In a fight half the time, the trap of each kind as often as not. */
function trapped(machine: LiftedMachine, random: Random): void {
  commanding(machine, random);
  machine.write(PRTY.game_mode, pick(random, [ PRTY.mode_world, 0x80 ]));
  machine.write(ZP_TRAP_TYPE, (random() < 0.5) ? 0x01 : Math.floor(random() * 4));
  machine.write(ZP_MAIN.curr_player, 1 + Math.floor(random() * machine.read(PRTY.party_size)));
}


/**
 * Ground with something to it: a bridge, its trolls' chance rigged to come or nearly, a field, a
 * dungeon's fields and traps, and in a fight the player's ground.
 */
function ground(machine: LiftedMachine, random: Random): void {
  commanding(machine, random);
  const mode: number = pick(random, [ PRTY.mode_world, PRTY.mode_world, PRTY.mode_dungeon, 0x80 ]);

  machine.write(PRTY.game_mode, mode);
  machine.write(PRTY.party_size, pick(random, [ 0x04, 0x08 ]));
  machine.write(PRTY.terrain_occlusion, (random() < 0.9) ? 0x00 : 0xFF);
  machine.write(ZP_MAIN.tile_under_player, (mode === PRTY.mode_dungeon)
    ? pick(random, [ 0xA0, 0xA2, 0xA3, 0x80, 0x87, 0x87, 0x88 ])
    : pick(random, [ TILES.tile_bridge_narrow, TILES.tile_bridge_narrow, 0x03, TILES.tile_field_poison, TILES.tile_field_fire, TILES.tile_field_sleep,
      TILES.tile_field_sleep, TILES.tile_lava ]));
  if (random() < 0.7) {
    const chance: number = pick(random, [ 0x00, 0x00, 0x04 ]);

    rigRand(machine, random, (value: number): boolean => (value & 0x07) === chance);
  }
  for (let index: number = 0; index < 0x400; index++) {
    machine.write(O.world_map_NW + index, pick(random, [ 0x03, TILES.tile_field_poison, TILES.tile_field_fire, TILES.tile_field_sleep, TILES.tile_lava, 0x04 ]));
  }
}


/** Everyone alive asleep, now and then. */
function drowsy(machine: LiftedMachine, random: Random): void {
  commanding(machine, random);
  if (random() < 0.4) {
    for (let player: number = 0; player < 8; player++) {
      machine.write(ROST.player_stats + (player * 0x20) + ROST.player_status, pick(random, [ ROST.status_Sleep, ROST.status_Dead ]));
    }
  }
}


/** A player near death, in a fight half the time. */
function dying(machine: LiftedMachine, random: Random): void {
  commanding(machine, random);
  machine.write(PRTY.game_mode, pick(random, [ PRTY.mode_world, 0x80 ]));
  const base: number = ROST.player_stats + ((Math.max(1, machine.read(ZP_MAIN.curr_player)) - 1) * 0x20);

  machine.write(base + ROST.player_cur_hp_hi, 0x00);
  machine.cpu.a = pick(random, [ 0x01, 0x10, 0x50, 0x99 ]);
}


/** Arms the party has, the player's class allowed or not by their masks. */
function armed(machine: LiftedMachine, random: Random): void {
  commanding(machine, random);
  for (let index: number = 0x18; index < 0x30; index++) {
    machine.write(ROST.party_stats + index, pick(random, [ 0x01, 0x02, 0x12 ]));
  }
}


function withA(values: (random: Random) => number, setup: (machine: LiftedMachine, random: Random) => void = commanding): (machine: LiftedMachine, random: Random) => void {
  return (machine: LiftedMachine, random: Random): void => {
    setup(machine, random);
    machine.cpu.a = values(random);
  };
}


/** Keys: each drawn from its list, the game reading each in turn. */
function keys(...lists: readonly (readonly number[])[]): (random: Random) => readonly Key[] {
  return (random: Random): readonly Key[] => lists.map((list: readonly number[]): Key => ({ code: pick(random, list), polls: Math.floor(random() * 3) }));
}


/** Ztats's keys: arrows back and forth, then any other key but SPACE, which empties the type-ahead buffer, to leave. */
function paging(first: readonly number[]): (random: Random) => readonly Key[] {
  return (random: Random): readonly Key[] => {
    const pages: Key[] = [];

    for (let page: number = Math.floor(random() * 10); page > 0; page--) {
      pages.push({ code: pick(random, [ 0x08, 0x15, 0x15 ]), polls: 1 });
    }

    return [ ...((first.length > 0) ? [ { code: pick(random, first), polls: 1 } ] : []), ...pages, { code: pick(random, [ 0x58, 0x41, 0x0D ]), polls: 1 } ];
  };
}


const DISK_PROMPTS: (random: Random) => readonly Key[] = keys([ ESC ], [ ESC ], [ ESC ], [ ESC ]);

/** Where a command goes next: the turn's end or a refusal, the fight it starts, the game lost. */
const COMMAND_STOPS: readonly number[] = [ ...STOPS, COMBAT_ENTRIES.init_combat, E.run_file_dead, COMBAT_ENTRIES.combat_cmd_done ];


function commandCase(entry: number, extra?: Partial<ICase>): readonly [ number, ICase ] {
  return [ entry, { ult4: true, screen: true, stops: COMMAND_STOPS, keys: keys(ARROWS), setup: commanding, ...extra } ];
}


export const COMMAND_CASES: Readonly<Record<string, readonly [ number, ICase ]>> = {
  cmd_attack: commandCase(CE.cmd_attack, { keys: keys([ ...ARROWS, 0x20 ]) }),
  do_attack: commandCase(CE.do_attack, { setup: oddFoe }),
  cmd_enter: commandCase(CE.cmd_enter, { keys: DISK_PROMPTS, setup: atPlace }),
  try_enter_abyss: commandCase(CE.try_enter_abyss, { keys: DISK_PROMPTS, setup: onDisk('underworld', DISKS.disk_dungeon) }),
  try_enter_dungeon: commandCase(CE.try_enter_dungeon, { keys: DISK_PROMPTS, setup: atDungeon }),
  check_on_foot: commandCase(CE.check_on_foot, { keys: DISK_PROMPTS, setup: atDungeon }),
  begin_dng_load: commandCase(CE.begin_dng_load, { keys: DISK_PROMPTS, setup: atDungeon }),
  load_dungeon_map: commandCase(CE.load_dungeon_map, { keys: DISK_PROMPTS, setup: atDungeon }),
  print_ruin: commandCase(CE.print_ruin, { keys: DISK_PROMPTS, setup: twoDrives }),
  enter_towne: commandCase(CE.enter_towne, { keys: DISK_PROMPTS, setup: intoTowne }),
  print_castle: commandCase(CE.print_castle, { keys: DISK_PROMPTS, setup: twoDrives }),
  print_shrine: commandCase(CE.print_shrine),
  print_location_name: commandCase(CE.print_location_name),
  file_write_temp_map: commandCase(CE.file_write_temp_map, { keys: DISK_PROMPTS }),
  load_letter_location: commandCase(CE.load_letter_location, { setup: withA((random: Random): number => pick(random, [ 0xC1, 0xC5, 0xC0 ]), twoDrives) }),
  cmd_fire: commandCase(CE.cmd_fire, { keys: keys([ ...ARROWS, ...ARROWS, 0x20 ]), setup: broadside }),
  cmd_get_chest: commandCase(CE.cmd_get_chest, { keys: keys(DIGITS) }),
  try_get_chest: commandCase(CE.try_get_chest, { setup: overChest }),
  do_get_chest: commandCase(CE.do_get_chest, { setup: trapped }),
  check_acid: commandCase(CE.check_acid, { setup: trapped }),
  collect_gold: commandCase(CE.collect_gold),
  cmd_ignite: commandCase(CE.cmd_ignite),
  cmd_jimmy_lock: commandCase(CE.cmd_jimmy_lock),
  cmd_locate: commandCase(CE.cmd_locate),
  cmd_new_order: commandCase(CE.cmd_new_order, { keys: keys(DIGITS, DIGITS) }),
  cmd_open_door: commandCase(CE.cmd_open_door),
  close_open_door: commandCase(CE.close_open_door),
  cmd_quit: commandCase(CE.cmd_quit, { keys: DISK_PROMPTS, setup: (machine: LiftedMachine, random: Random): void => {
    commanding(machine, random);
    for (let digit: number = 0; digit < 4; digit++) {
      machine.write(PRTY.move_counter + digit, pick(random, [ 0x00, 0x00, 0x01, 0x10, 0x99 ]));
    }
  } }),
  cmd_ready_weapon: commandCase(CE.cmd_ready_weapon, { keys: keys(DIGITS, [ 0x41, 0x42, 0x43, 0x45, 0x47, 0x48, 0x4F, 0x50, 0x5A, 0x20 ]), setup: armed }),
  cmd_wear_armour: commandCase(CE.cmd_wear_armour, { keys: keys([ 0x31, 0x31, 0x32 ], [ 0x41, 0x42, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x5A ]), setup: armed }),
  cmd_volume: commandCase(CE.cmd_volume),
  cmd_music: commandCase(CE.cmd_music),
  cmd_ztats: commandCase(CE.cmd_ztats, { keys: paging(DIGITS) }),
  zstats_for_player: commandCase(CE.zstats_for_player, { keys: paging([]) }),
  ztats_page_4: commandCase(CE.ztats_page_4, { keys: paging([]) }),
  input_ztats_key: commandCase(CE.input_ztats_key, { keys: keys([ 0x08, 0x15, 0x41, 0x20 ]) }),
  tile_effect: commandCase(CE.tile_effect, { keys: keys([ 0x59, 0x4E ]), setup: ground }),
  starving: commandCase(CE.starving),
  recover_mp: commandCase(CE.recover_mp),
  eat_food: commandCase(CE.eat_food, { setup: withA((random: Random): number => pick(random, [ 0x01, 0x05, 0x08, 0x99 ])) }),
  anyone_awake: commandCase(CE.anyone_awake, { setup: drowsy }),
  invert_all_players: commandCase(CE.invert_all_players),
  dec_player_hp: commandCase(CE.dec_player_hp, { setup: dying }),
  inc_player_hp: commandCase(CE.inc_player_hp, { setup: withA(bcd) }),
  inc_party_gold: commandCase(CE.inc_party_gold, { setup: withA(bcd) }),
  inc_player_exp: commandCase(CE.inc_player_exp, { setup: withA(bcd) }),
  burn_player: commandCase(CE.burn_player),
  damage_party: commandCase(CE.damage_party, { keys: DISK_PROMPTS }),
  shake_screen: commandCase(CE.shake_screen),
  is_evil: commandCase(CE.is_evil, { setup: withA((random: Random): number => pick(random, [ ...OBJECTS, 0x94, 0x98, 0xB4, 0xFC, byte(random) ])) }),
};
