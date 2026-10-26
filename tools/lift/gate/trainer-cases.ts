// The differential cases for TRAINERS: the travel trainer's teleport, by letter to a place or by
// two pairs of letters to a coordinate, an abort among them; its transport, by letter, at sea or on
// land; and the choice of one player in a fight, made, kept, lost to sleep or the fight's end, or
// given up. ULT4 is lifted on both sides.

import type { LiftedMachine } from '../../../src/app/lifted-runtime/lifted-machine';
import { TRAINERS_MODULE, TRAINERS_VARIABLES } from '../../../src/app/port/program/trainers';
import { JUMP_TRAINERS, PRTY, TILES, TRAINERS, ZP_MAIN } from '../../../src/app/state/symbols';
import type { Random } from './differential';
import { battle } from './combat-cases';
import type { IOverlayCase, Key } from './overlay-cases';
import { STOPS, pick, world } from './ult4-cases';

const JT = JUMP_TRAINERS;
const LETTERS: readonly string[] = [ 'T', 'D', 'S', 'C', 'C', 'X' ];
const TRANSPORTS: readonly string[] = [ 'H', 'S', 'B', 'X' ];
const WAITING: number = 10;
const DIGITS: readonly number[] = [ 0xB0, 0xB1, 0xB2, 0xB3, 0xB5, 0xB8, 0xB9, 0xC1, 0xA0 ];


/** A key once the game waits for it, ten polls on, since printing takes a key already waiting. */
function keyed(letter: string): Key {
  return { code: letter.charCodeAt(0), polls: WAITING };
}


/** In Britannia mostly, the travel trainer on mostly, on foot, a horse or a ship, nothing typed ahead. */
function travelling(machine: LiftedMachine, random: Random): void {
  world(machine, random);
  machine.bload('program', 'TRAINERS');
  machine.write(ZP_MAIN.key_buf_len, 0x00);
  machine.write(TRAINERS.trainer_travel, (random() < 0.8) ? 0x01 : 0x00);
  machine.write(PRTY.game_mode, (random() < 0.8) ? PRTY.mode_world : machine.read(PRTY.game_mode));
  machine.write(PRTY.current_location, (random() < 0.8) ? 0x00 : machine.read(PRTY.current_location));
  machine.write(PRTY.player_transport, pick(random, [ TILES.tile_walk, TILES.tile_walk, TILES.tile_horse_west, TILES.tile_ship_first ]));
  for (const tile of [ ZP_MAIN.tile_north, ZP_MAIN.tile_south, ZP_MAIN.tile_east, ZP_MAIN.tile_west ]) {
    machine.write(tile, pick(random, [ TILES.tile_grass, TILES.tile_grass, TILES.tile_water_deep, TILES.tile_water_shallow, TILES.tile_forest ]));
  }
}


/** A fight, with one of the party, or none, already chosen to act. */
function choosing(machine: LiftedMachine, random: Random): void {
  battle(machine, random);
  machine.write(TRAINERS_VARIABLES.combat_active_char, pick(random, [ 0x00, 0x00, 1 + Math.floor(random() * machine.read(PRTY.party_size)), 0x08 ]));
}


function trainerCase(entry: number, setup: (machine: LiftedMachine, random: Random) => void, keys: (random: Random) => readonly Key[], a: ((random: Random) => number) | null = null): IOverlayCase {
  return { module: TRAINERS_MODULE, entry, testCase: { ult4: true, screen: true, stops: STOPS, keys, setup: (machine: LiftedMachine, random: Random): void => {
    setup(machine, random);
    if (a != null) {
      machine.cpu.a = a(random);
    }
  } } };
}


export const TRAINER_CASES: Readonly<Record<string, IOverlayCase>> = {
  trainer_teleport: trainerCase(JT.j_trainer_teleport, travelling, (random: Random): readonly Key[] => [
    keyed(pick(random, LETTERS)),
    ...Array.from({ length: 4 }, (): Key => keyed(String.fromCharCode(0x41 + Math.floor(random() * ((random() < 0.9) ? 16 : 26))))),
  ]),
  trainer_teleport_coordinate: trainerCase(JT.j_trainer_teleport, travelling, (random: Random): readonly Key[] => [
    keyed('C'),
    ...Array.from({ length: 4 }, (): Key => keyed(String.fromCharCode(0x41 + Math.floor(random() * ((random() < 0.6) ? 16 : 26))))),
  ]),
  trainer_board: trainerCase(JT.j_trainer_board, travelling, (random: Random): readonly Key[] => [ keyed(pick(random, TRANSPORTS)) ]),
  trainer_combat_start: trainerCase(JT.j_active_char_combat_start, choosing, (): readonly Key[] => []),
  trainer_player_turn: trainerCase(JT.j_active_char_player_turn, choosing, (): readonly Key[] => []),
  trainer_check: trainerCase(JT.j_active_char_check, choosing, (): readonly Key[] => []),
  trainer_check_command: trainerCase(JT.j_active_char_check_command, choosing, (): readonly Key[] => [], (random: Random): number => pick(random, DIGITS)),
};
