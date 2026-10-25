// The differential cases for ULT4's wandering monsters: each entry with monsters, pirate ships,
// whirlpools, twisters and chests about the party in Britannia, the party afoot or afloat, and the
// wind. The ship's hull and the party are sturdy enough that no case ends the game.

import type { LiftedMachine } from '../../../src/app/lifted-runtime/lifted-machine';
import { MONSTER_ENTRIES, MONSTER_LIFTED } from '../../../src/app/port/program/ult4-monsters-data';
import { SUBS_VARIABLES } from '../../../src/app/port/program/subs-data';
import { MAP_OBJECTS, PRTY, ROST, TILES, TRAINERS, ZP_COMBAT, ZP_MAIN } from '../../../src/app/state/symbols';
import { keyOf } from './combat-cases';
import { byte } from './differential';
import type { ICase, Random } from './differential';
import { STOPS, pick, world } from './ult4-cases';

const M = MONSTER_ENTRIES;
const O = MAP_OBJECTS;
const ZP_CUR_MOB_INDEX: number = 0xD8;

const MONSTERS: readonly number[] = [
  0x00, 0x00, 0x00, TILES.tile_pirate, TILES.tile_pirate, TILES.tile_whirlpool, TILES.tile_twister, TILES.tile_serpent, 0xC0, 0xC4, 0xD0, 0xE0,
  TILES.tile_lava_lizard, TILES.tile_hydra, 0xF0, 0xFC, 0x8A, 0x84, TILES.tile_chest, 0x14, 0x1F, TILES.tile_rat, TILES.tile_bat, TILES.tile_python,
];
const PIRATES: readonly number[] = [ TILES.tile_pirate_west, TILES.tile_pirate_north, TILES.tile_pirate_east, TILES.tile_pirate_south ];
const SIGNS: readonly number[] = [ 0x00, 0x01, 0xFF ];
const HEADINGS: readonly (readonly [ number, number ])[] = [
  [ 0x01, 0x00 ], [ 0xFF, 0x00 ], [ 0x00, 0x01 ], [ 0x00, 0xFF ], [ 0x01, 0x01 ], [ 0xFF, 0x01 ],
];
/** Britannia's ground for spawning: deep and shallow water, grass to hills, mountains and beyond. */
const COUNTRY: readonly number[] = [ 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A ];


/** SUBS's rand from the generator's sixteen bytes, as it steps them. */
function nextRand(state: number[]): number {
  let a: number = state[15];
  let carry: number = 0;

  for (let index: number = 14; index >= 0; index--) {
    const sum: number = a + state[index] + carry;

    state[index] = sum & 0xFF;
    carry = sum >> 8;
    a = state[index];
  }
  let index: number = 15;

  do {
    state[index] = (state[index] + 1) & 0xFF;
    index = (state[index] === 0) ? index - 1 : -1;
  } while (index >= 0);

  return state[0];
}


/** The generator's next number made one `wanted` takes: rnd0 is added last, so one of its values gives it. */
function rigRand(machine: LiftedMachine, random: Random, wanted: (value: number) => boolean): void {
  const start: number = byte(random);
  let found: boolean = false;

  for (let step: number = 0; (step < 256) && !found; step++) {
    const state: number[] = Array.from({ length: 16 }, (_: unknown, index: number): number => machine.read(SUBS_VARIABLES.rnd0 + index));

    state[0] = (start + step) & 0xFF;
    found = wanted(nextRand([ ...state ]));
    if (found) {
      machine.write(SUBS_VARIABLES.rnd0, state[0]);
    }
  }
}


/** Near the party, at it, or anywhere. */
function near(random: Random, at: number): number {
  return pick(random, [ (at + Math.floor(random() * 9) - 4) & 0xFF, (at + Math.floor(random() * 3) - 1) & 0xFF, at, byte(random) ]);
}


/** The party in Britannia among monsters, with the game long or newly begun. */
function wandering(machine: LiftedMachine, random: Random): void {
  world(machine, random);
  machine.write(PRTY.game_mode, pick(random, [ PRTY.mode_world, PRTY.mode_world, PRTY.mode_world, 0x80, 0x00 ]));
  machine.write(PRTY.ship_hull, 0x99);
  machine.write(PRTY.party_size, 1 + Math.floor(random() * 4));
  for (let player: number = 0; player < 8; player++) {
    machine.write(ROST.player_stats + (player * 0x20) + ROST.player_cur_hp_hi, 0x09);
  }
  const x: number = machine.read(PRTY.player_xpos);
  const y: number = machine.read(PRTY.player_ypos);

  for (let slot: number = 0; slot <= O.object_max; slot++) {
    const tile: number = (slot <= O.object_mobs_max) ? pick(random, MONSTERS) : pick(random, [ 0x00, 0x00, TILES.tile_chest, 0x14 ]);

    machine.write(O.object_tile_type + slot, tile);
    machine.write(O.object_tile_sprite + slot, (tile === TILES.tile_pirate) ? pick(random, PIRATES) : tile);
    machine.write(O.object_xpos + slot, near(random, x));
    machine.write(O.object_ypos + slot, near(random, y));
    machine.write(O.object_xpos_prev + slot, near(random, x));
    machine.write(O.object_ypos_prev + slot, near(random, y));
  }
  machine.write(PRTY.map_x, (x >> 4) - Math.floor(random() * 2));
  machine.write(PRTY.map_y, (y >> 4) - Math.floor(random() * 2));
  machine.write(PRTY.tile_xpos, Math.floor(random() * 0x20));
  machine.write(PRTY.tile_ypos, Math.floor(random() * 0x20));
  machine.write(PRTY.move_counter, pick(random, [ 0x00, 0x00, 0x01 ]));
  machine.write(PRTY.move_counter + 1, pick(random, [ 0x00, 0x01, 0x02, 0x03, 0x50 ]));
  machine.write(ZP_MAIN.turn_counter, byte(random));
  machine.write(ZP_MAIN.delta_x, pick(random, SIGNS));
  machine.write(ZP_MAIN.delta_y, pick(random, SIGNS));
  machine.write(ZP_MAIN.temp_x, near(random, x));
  machine.write(ZP_MAIN.temp_y, near(random, y));
  if (random() < 0.4) {
    const slot: number = Math.floor(random() * (O.object_max + 1));

    machine.write(ZP_MAIN.temp_x, machine.read(O.object_xpos + slot));
    machine.write(ZP_MAIN.temp_y, machine.read(O.object_ypos + slot));
  }
  machine.write(ZP_COMBAT.foe_type_encountered, pick(random, MONSTERS.filter((tile: number): boolean => tile !== 0)));
  machine.write(ZP_CUR_MOB_INDEX, Math.floor(random() * (O.object_mobs_max + 1)));
  machine.cpu.x = machine.read(ZP_CUR_MOB_INDEX);
}


/** The monster whose turn it is: a pirate half the time, else any, beside the party or a little way off. */
function mobTurn(machine: LiftedMachine, random: Random): void {
  wandering(machine, random);
  const mob: number = machine.read(ZP_CUR_MOB_INDEX);
  const tile: number = (random() < 0.5) ? TILES.tile_pirate : pick(random, MONSTERS.filter((kind: number): boolean => kind !== 0));
  const distance: number = Math.floor(random() * 8);
  const across: number = Math.floor(random() * (distance + 1));

  machine.write(O.object_tile_type + mob, tile);
  machine.write(O.object_tile_sprite + mob, (tile === TILES.tile_pirate) ? pick(random, PIRATES) : tile);
  machine.write(O.object_xpos + mob, (machine.read(PRTY.player_xpos) + (pick(random, [ 1, -1 ]) * across)) & 0xFF);
  machine.write(O.object_ypos + mob, (machine.read(PRTY.player_ypos) + (pick(random, [ 1, -1 ]) * (distance - across))) & 0xFF);
}


/** A whirlpool or a twister on the party, or on another object. */
function hazard(machine: LiftedMachine, random: Random): void {
  wandering(machine, random);
  const slot: number = Math.floor(random() * (O.object_wandering_max + 1));

  machine.write(O.object_tile_type + slot, pick(random, [ TILES.tile_whirlpool, TILES.tile_twister ]));
  if (random() < 0.5) {
    machine.write(O.object_xpos + slot, machine.read(PRTY.player_xpos));
    machine.write(O.object_ypos + slot, machine.read(PRTY.player_ypos));
  }
  const victim: number = Math.floor(random() * (O.object_max + 1));

  machine.write(O.object_xpos + victim, machine.read(O.object_xpos + slot));
  machine.write(O.object_ypos + victim, machine.read(O.object_ypos + slot));
}


/** Empty slots to spawn into, open country or the sea, and most of the time the one chance in sixteen. */
function spawning(country: readonly number[]): (machine: LiftedMachine, random: Random) => void {
  return (machine: LiftedMachine, random: Random): void => {
    wandering(machine, random);
    for (let slot: number = 0; slot <= O.object_wandering_max; slot++) {
      if (random() < 0.7) {
        machine.write(O.object_tile_type + slot, 0x00);
      }
    }
    for (let index: number = 0; index < 0x400; index++) {
      machine.write(O.world_map_NW + index, pick(random, country));
    }
    if (random() < 0.8) {
      rigRand(machine, random, (value: number): boolean => (value & 0x0F) === 0);
    }
  };
}


/** A pirate ship in any facing, with the party along a line from it, or off it. */
function pirate(machine: LiftedMachine, random: Random): void {
  mobTurn(machine, random);
  const mob: number = machine.read(ZP_CUR_MOB_INDEX);

  machine.write(O.object_tile_type + mob, TILES.tile_pirate);
  machine.write(O.object_tile_sprite + mob, pick(random, PIRATES));
  machine.write(ZP_MAIN.delta_x, pick(random, [ 0x00, 0x00, 0x01, 0xFF ]));
  machine.write(ZP_MAIN.delta_y, pick(random, [ 0x00, 0x00, 0x01, 0xFF ]));
  machine.write(ZP_MAIN.temp_x, pick(random, [ 0x00, 0x01, 0x05, 0xFB, 0xFF, byte(random) ]));
  machine.write(ZP_MAIN.temp_y, pick(random, [ 0x00, 0x01, 0x05, 0xFB, 0xFF, byte(random) ]));
  for (let index: number = 0; index < 0x400; index++) {
    machine.write(O.world_map_NW + index, pick(random, [ 0x00, 0x00, 0x01, 0x02, 0x04 ]));
  }
}


/** A monster a few squares from the party in a straight line, aimed at it, and now and then something in the way. */
function firing(machine: LiftedMachine, random: Random): void {
  wandering(machine, random);
  const mob: number = machine.read(ZP_CUR_MOB_INDEX);
  const [ dx, dy ]: readonly [ number, number ] = pick(random, HEADINGS);
  const steps: number = 1 + Math.floor(random() * 4);
  const back: (at: number, delta: number, count: number) => number = (at: number, delta: number, count: number): number =>
    (at - (((delta & 0x80) !== 0) ? -count : (delta * count))) & 0xFF;

  machine.write(O.object_xpos + mob, back(machine.read(PRTY.player_xpos), dx, steps));
  machine.write(O.object_ypos + mob, back(machine.read(PRTY.player_ypos), dy, steps));
  machine.write(ZP_MAIN.delta_x, dx);
  machine.write(ZP_MAIN.delta_y, dy);
  if ((steps > 1) && (random() < 0.4)) {
    const blocker: number = pick(random, [ 0x07, 0x08, 0x09, O.object_max, Math.floor(random() * (O.object_mobs_max + 1)) ]);
    const at: number = 1 + Math.floor(random() * (steps - 1));

    if (blocker !== mob) {
      machine.write(O.object_tile_type + blocker, pick(random, [ 0xC0, TILES.tile_chest, TILES.tile_pirate ]));
      machine.write(O.object_xpos + blocker, back(machine.read(PRTY.player_xpos), dx, at));
      machine.write(O.object_ypos + blocker, back(machine.read(PRTY.player_ypos), dy, at));
    }
  }
}


/** A step onto (temp_x, temp_y), often back to where the monster just was, often by a pirate. */
function stepping(machine: LiftedMachine, random: Random): void {
  mobTurn(machine, random);
  const mob: number = machine.read(ZP_CUR_MOB_INDEX);

  if (random() < 0.4) {
    machine.write(O.object_tile_type + mob, TILES.tile_pirate);
  }
  if (random() < 0.5) {
    machine.write(O.object_xpos_prev + mob, machine.read(ZP_MAIN.temp_x));
    machine.write(O.object_ypos_prev + mob, machine.read(ZP_MAIN.temp_y));
  }
}


function withA(values: (random: Random) => number, setup: (machine: LiftedMachine, random: Random) => void = wandering): (machine: LiftedMachine, random: Random) => void {
  return (machine: LiftedMachine, random: Random): void => {
    setup(machine, random);
    machine.cpu.a = values(random);
    machine.cpu.p = (machine.cpu.p & ~0x82) | ((machine.cpu.a & 0x80) !== 0 ? 0x80 : 0x00) | (machine.cpu.a === 0 ? 0x02 : 0x00);
  };
}


/** Where a monster's turn goes next: the fight it starts, or the turn's end. */
const MONSTER_STOPS: readonly number[] = [ ...STOPS, MONSTER_LIFTED.do_attack ];


function monster(entry: number, extra?: Partial<ICase>): readonly [ number, ICase ] {
  return [ entry, { ult4: true, stops: MONSTER_STOPS, key: keyOf([ 0x59, 0x4E, 0x20 ]), setup: wandering, ...extra } ];
}


export const MONSTER_CASES: Readonly<Record<string, readonly [ number, ICase ]>> = {
  spawn_monsters: monster(M.spawn_monsters, { setup: spawning(COUNTRY) }),
  spawn_world: monster(M.spawn_world, { setup: spawning(COUNTRY) }),
  spawn_world_at_sea: monster(M.spawn_world, { setup: spawning([ 0x00, 0x01 ]) }),
  mobs_act: monster(M.mobs_act),
  mobs_act_world: monster(M.mobs_act_world),
  mob_world_take_turn: monster(M.mob_world_take_turn, { setup: mobTurn }),
  player_attacked: monster(M.player_attacked, { setup: mobTurn }),
  check_range: monster(M.check_range, { setup: withA((random: Random): number => Math.floor(random() * 9), mobTurn) }),
  check_range_pirate: monster(M.check_range, { setup: withA((random: Random): number => pick(random, [ 1, 2, 3, 3, 4, 4, 5, 6, 7 ]), pirate) }),
  check_range_drifting: monster(M.check_range, { setup: withA((random: Random): number => pick(random, [ TILES.tile_whirlpool, TILES.tile_twister ])) }),
  tile_to_monster_num: monster(M.tile_to_monster_num, { setup: withA(byte) }),
  check_water_hazards: monster(M.check_water_hazards, { setup: hazard }),
  enter_whirlpool: monster(M.enter_whirlpool),
  enter_twister: monster(M.enter_twister),
  fire_cannon_pirate: monster(M.fire_cannon_pirate, { setup: firing }),
  fire_red_missile: monster(M.fire_red_missile, { setup: firing }),
  fire_world_missile: monster(M.fire_world_missile, { setup: firing }),
  manhattan_dist: monster(M.manhattan_dist, { setup: mobTurn }),
  legal_move_world_twn: monster(M.legal_move_world_twn, { setup: withA((random: Random): number => pick(random, [ 0x00, 0x02, 0x04, 0x05, 0x06, 0x08, byte(random) ]), stepping) }),
  deny_move: monster(M.deny_move),
  get_mob_at_temp_xy: monster(M.get_mob_at_temp_xy),
  any_obj_at_temp_xy: monster(M.any_obj_at_temp_xy),
  check_next_object: monster(M.check_next_object, { setup: (machine: LiftedMachine, random: Random): void => {
    wandering(machine, random);
    machine.cpu.x = Math.floor(random() * (O.object_max + 1));
  } }),
  temp_xy_skip: monster(M.temp_xy_skip),
  temp_xy_none: monster(M.temp_xy_none),
  attacked_by: monster(M.attacked_by),
  check_avoid: monster(M.check_avoid, { setup: (machine: LiftedMachine, random: Random): void => {
    wandering(machine, random);
    machine.write(TRAINERS.trainer_avoid, (random() < 0.7) ? 0x01 : 0x00);
  } }),
};
