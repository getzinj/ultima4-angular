// The differential cases for the ported part of ULT4: each entry with the game state it reads,
// drawn at random from the values the game gives it. A command that jumps on rather than
// returning is stopped where it goes next, and compared there.

import type { LiftedMachine } from '../../../src/app/lifted-runtime/lifted-machine';
import { ULT4_ENTRIES, ULT4_LIFTED, ULT4_TABLES } from '../../../src/app/port/program/ult4-data';
import { APPLE, DISKS, JUMP_SYSTEM, JUMP_TRAINERS, PRTY, ROST, TRAINERS, ZP_MAIN } from '../../../src/app/state/symbols';
import { byte } from './differential';
import type { ICase, Random } from './differential';

const E = ULT4_ENTRIES;
const L = ULT4_LIFTED;

const KEY: (random: Random) => { code: number; polls: number } = (random: Random): { code: number; polls: number } =>
  ({ code: pick(random, [ 0x0D, 0x0B, 0x0A, 0x2F, 0x08, 0x15, 0x20, 0x16, 0x13, 0x41, 0x42, 0x59, 0x4E, 0x31 ]), polls: Math.floor(random() * 6) });

const TILES: readonly number[] = [
  0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x0A, 0x0E, 0x10, 0x12, 0x14, 0x15, 0x18, 0x1B, 0x1C, 0x1F, 0x43, 0x46, 0x8C, 0x90,
];
const TRANSPORTS: readonly number[] = [ 0x1F, 0x1F, 0x14, 0x15, 0x10, 0x11, 0x12, 0x13, 0x18 ];


function pick<T>(random: Random, values: readonly T[]): T {
  return values[Math.floor(random() * values.length)];
}


/** The places a command goes when it is done: every jump that ends one. */
const STOPS: readonly number[] = [
  E.cmd_done, E.next_turn, E.end_turn, E.done_what, E.done_blocked, E.done_cant, E.done_not_here, E.done_only_on_foot, E.done_drift_only,
  E.done_pass, E.cmd_timeout, E.leave_to_world, E.spawn_pirate_fleet, E.spawn_daemon_guard, E.board_horse, E.board_balloon, E.load_saved_map,
  E.game_start, E.halt, L.load_shrine, L.begin_dng_load, L.combat_cmd_done, L.do_dungeon_room, L.cmd_music, JUMP_TRAINERS.j_trainer_board,
];


/** Britannia, a towne or a dungeon, with the party on foot or riding something, and the trainers off or on. */
function world(machine: LiftedMachine, random: Random): void {
  const write: (address: number, value: number) => void = (address: number, value: number): void => machine.write(address, value);

  write(JUMP_SYSTEM.music_ctl, APPLE.opcode_RTS);
  write(ZP_MAIN.numdrives, 0x01);
  write(PRTY.game_mode, pick(random, [ 0x01, 0x01, 0x01, 0x02, 0x03 ]));
  write(PRTY.current_location, pick(random, [ 0x00, 0x00, 0x00, 0x01, 0x05, 0x11 ]));
  write(PRTY.player_transport, pick(random, TRANSPORTS));
  write(PRTY.horse_mode, pick(random, [ 0x00, 0xFF ]));
  write(PRTY.terrain_occlusion, pick(random, [ 0x00, 0xFF ]));
  write(PRTY.dng_direction, Math.floor(random() * 4));
  write(PRTY.dungeon_level, Math.floor(random() * 8));
  write(PRTY.moon_phase_trammel, Math.floor(random() * 8));
  write(PRTY.moon_phase_felucca, Math.floor(random() * 8));
  write(PRTY.ship_hull, pick(random, [ 0x50, 0x99, byte(random) ]));
  write(PRTY.light_duration, pick(random, [ 0x00, 0x01, byte(random) ]));
  write(PRTY.player_xpos, pick(random, [ byte(random), 0xDD, 0xE7, 0xEF, 0x1F, 0x20 ]));
  write(PRTY.player_ypos, pick(random, [ byte(random), 0xE0, 0xD5, 0xF0, 0x02, 0x1F, 0x20 ]));
  write(PRTY.party_size, 1 + Math.floor(random() * 8));
  write(ZP_MAIN.balloon_movement, pick(random, [ 0x00, 0x01, 0xFF ]));
  write(ZP_MAIN.wind_direction, Math.floor(random() * 4));
  write(ZP_MAIN.magic_aura, pick(random, [ 0x25, 0x5F ]));
  for (const tile of [ ZP_MAIN.tile_under_player, ZP_MAIN.tile_north, ZP_MAIN.tile_south, ZP_MAIN.tile_east, ZP_MAIN.tile_west ]) {
    write(tile, pick(random, TILES));
  }
  for (let player: number = 0; player < 8; player++) {
    write(ROST.player_stats + (player * 0x20) + ROST.player_status, pick(random, [ ROST.status_Good, ROST.status_Good, ROST.status_Poison, ROST.status_Sleep ]));
  }
  write(ROST.player_stats + ROST.player_status, ROST.status_Good);
  write(ZP_MAIN.currdisk_drive1, (machine.read(PRTY.game_mode) === 0x03) ? DISKS.disk_dungeon : DISKS.disk_britannia);
  for (const trainer of [ TRAINERS.trainer_balloon, TRAINERS.trainer_travel, TRAINERS.trainer_exit, TRAINERS.trainer_pass, TRAINERS.trainer_avoid ]) {
    write(trainer, (random() < 0.2) ? 0x01 : 0x00);
  }
}


/** next_turn goes on to the command for its key, from cmd_table. */
function commands(machine: LiftedMachine): readonly number[] {
  return [
    ...STOPS,
    ...Array.from({ length: 26 }, (_: unknown, index: number): number =>
      machine.read(ULT4_TABLES.cmd_table + (index * 2)) | (machine.read(ULT4_TABLES.cmd_table + (index * 2) + 1) << 8)),
  ];
}


function command(entry: number): readonly [ number, ICase ] {
  return [ entry, { ult4: true, stops: STOPS, key: KEY, setup: world } ];
}


function routine(entry: number, setup?: (machine: LiftedMachine, random: Random) => void): readonly [ number, ICase ] {
  return [ entry, { ult4: true, stops: STOPS, key: KEY, setup: (machine: LiftedMachine, random: Random): void => {
    world(machine, random);
    setup?.(machine, random);
  } } ];
}


export const ULT4_CASES: Readonly<Record<string, readonly [ number, ICase ]>> = {
  next_turn: [ E.next_turn, { ult4: true, stops: commands, key: KEY, setup: world } ],
  check_cmd_alpha: [ E.check_cmd_alpha, { ult4: true, stops: commands, setup: (machine: LiftedMachine, random: Random): void => {
    world(machine, random);
    machine.cpu.a = pick(random, [ 0xC1, 0xC2, 0xDA, 0xDB, 0xB1, 0x41 ]);
  } } ],
  cmd_timeout: command(E.cmd_timeout),
  done_pass: command(E.done_pass),
  done_what: command(E.done_what),
  done_slow_progress: routine(E.done_slow_progress),
  done_done: command(E.done_done),
  done_blocked: command(E.done_blocked),
  cmd_direction_up: command(E.cmd_direction_up),
  cmd_direction_down: command(E.cmd_direction_down),
  cmd_direction_left: command(E.cmd_direction_left),
  cmd_direction_right: command(E.cmd_direction_right),
  try_walk: routine(E.try_walk, (machine: LiftedMachine, random: Random): void => {
    machine.cpu.a = pick(random, TILES);
    machine.cpu.x = pick(random, [ 0x05, 0x1F, 0x20, 0xFF ]);
    machine.cpu.y = pick(random, [ 0x05, 0x1F, 0x20, 0xFF ]);
    machine.write(0x45D8, pick(random, [ 0x06, 0x09, 0x0C, 0x0F ]));
  }),
  spawn_pirate_fleet: command(E.spawn_pirate_fleet),
  spawn_daemon_guard: command(E.spawn_daemon_guard),
  leave_to_world: [ E.leave_to_world, { ult4: true, stops: STOPS, key: (): { code: number; polls: number } => ({ code: 0x1B, polls: 0 }), setup: world } ],
  check_slow_terrain: routine(E.check_slow_terrain, (machine: LiftedMachine, random: Random): void => {
    machine.cpu.a = pick(random, TILES);
  }),
  can_ship_move_here: routine(E.can_ship_move_here, (machine: LiftedMachine, random: Random): void => {
    machine.cpu.a = byte(random);
  }),
  cmd_board: command(E.cmd_board),
  board_horse: command(E.board_horse),
  board_balloon: command(E.board_balloon),
  cmd_descend: command(E.cmd_descend),
  cmd_klimb: command(E.cmd_klimb),
  cmd_x_it: command(E.cmd_x_it),
  cmd_yell_horse: command(E.cmd_yell_horse),
  cmd_done: command(E.cmd_done),
  end_turn: command(E.end_turn),
  is_wind_favorable: routine(E.is_wind_favorable, (machine: LiftedMachine, random: Random): void => {
    machine.cpu.a = Math.floor(random() * 4);
  }),
  print_north: routine(E.print_north),
  input_char: routine(E.input_char),
  print_newline: routine(E.print_newline),
  check_enter_moongate: routine(E.check_enter_moongate, (machine: LiftedMachine, random: Random): void => {
    machine.cpu.a = pick(random, [ 0x43, 0x43, 0x04 ]);
  }),
  game_start: command(E.game_start),
};
