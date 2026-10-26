// The differential cases for ULT4's dungeon code: on a level of a dungeon whose map is drawn at
// random from the dungeon's tiles, some with a monster's number on them, and the level's monsters
// about the party; the rooms read from the underworld disk, the altar rooms among them, and their
// ways out; and the doors the party may or may not advance and retreat through. DNGD is lifted on
// both sides for the view.

import type { LiftedMachine } from '../../../src/app/lifted-runtime/lifted-machine';
import { COMBAT_ENTRIES, COMBAT_VARIABLES } from '../../../src/app/port/program/ult4-combat-data';
import { DUNGEON_ENTRIES } from '../../../src/app/port/program/ult4-dungeons-data';
import { DISKS, DUNGEON, MAP_OBJECTS, PRTY, TILES, ZP_MAIN } from '../../../src/app/state/symbols';
import { commanding } from './command-cases';
import { byte } from './differential';
import type { ICase, Random } from './differential';
import { STOPS, pick } from './ult4-cases';

const D = DUNGEON;
const DE = DUNGEON_ENTRIES;
const O = MAP_OBJECTS;
const DUNGEON_MAP: number = 0xE800;
const LEVEL_SIZE: number = 0x40;
const zp_trainer_avoid: number = 0xD8;
/** Each kind of dungeon tile, the room and the wall, the door and the lightning field among them, by its high nibble. */
const DUNGEON_TILES: readonly number[] = [
  0x00, 0x00, 0x00, 0x10, 0x20, 0x30, 0x40, 0x50, 0x60, 0x70, 0x80, 0x90, 0xA0, 0xA1, 0xA2, 0xB0, D.dng_tile_door, D.dng_tile_room,
  D.dng_tile_room + 0x0F, D.dng_tile_secret_door, D.dng_tile_wall, D.dng_tile_wall,
];
const MONSTERS: readonly number[] = [ 0x00, 0x00, 0x90, 0x94, 0x9C, 0xA4, 0xA8, TILES.tile_mimic, TILES.tile_reaper, 0xB8, 0xBC ];
const DUNGEON_STOPS: readonly number[] = [ ...STOPS, COMBAT_ENTRIES.begin_combat, COMBAT_ENTRIES.load_arena ];


/** A dungeon tile, now and then with a monster's number in its low nibble. */
export function dungeonTile(random: Random): number {
  const tile: number = pick(random, DUNGEON_TILES);

  return ((tile & D.dng_tile_foe_mask) === 0) && (random() < 0.4) ? tile | (1 + Math.floor(random() * 15)) : tile;
}


/** On a level of one of the dungeons, facing any way, its map at random, the level's monsters and others' about. */
export function inDungeon(machine: LiftedMachine, random: Random): void {
  commanding(machine, random);
  machine.bload('program', 'TRAINERS');
  machine.bload('underworld', 'DNGD');
  machine.write(PRTY.game_mode, PRTY.mode_dungeon);
  machine.write(PRTY.current_location, PRTY.loc_dng_first + Math.floor(random() * 8));
  machine.write(PRTY.dungeon_level, Math.floor(random() * 8));
  machine.write(PRTY.player_xpos, Math.floor(random() * 8));
  machine.write(PRTY.player_ypos, Math.floor(random() * 8));
  machine.write(PRTY.dng_direction, Math.floor(random() * 4));
  machine.write(ZP_MAIN.currdisk_drive1, DISKS.disk_dungeon);
  machine.insertDisk(1, 'underworld');
  for (let index: number = 0; index < 8 * LEVEL_SIZE; index++) {
    machine.write(DUNGEON_MAP + index, dungeonTile(random));
  }
  for (let slot: number = 0; slot <= O.object_max; slot++) {
    const x: number = Math.floor(random() * 8);
    const y: number = Math.floor(random() * 8);

    machine.write(O.object_tile_type + slot, pick(random, MONSTERS));
    machine.write(O.object_dng_level + slot, (random() < 0.6) ? machine.read(PRTY.dungeon_level) : Math.floor(random() * 8));
    machine.write(O.object_xpos + slot, (random() < 0.15) ? machine.read(PRTY.player_xpos) : x);
    machine.write(O.object_ypos + slot, (random() < 0.15) ? machine.read(PRTY.player_ypos) : y);
    machine.write(O.object_xpos_prev + slot, pick(random, [ x, (x + 1) & 0x07, (x - 1) & 0x07 ]));
    machine.write(O.object_ypos_prev + slot, pick(random, [ y, (y + 1) & 0x07, (y - 1) & 0x07 ]));
  }
  machine.write(ZP_MAIN.tile_under_player, dungeonTile(random));
  machine.write(zp_trainer_avoid, (random() < 0.3) ? 0x01 : 0x00);
}


/** The level's own slots, four from its number, mostly empty for monsters to spawn into. */
function spawning(machine: LiftedMachine, random: Random): void {
  inDungeon(machine, random);
  for (let slot: number = 0; slot <= O.object_max; slot++) {
    if (random() < 0.7) {
      machine.write(O.object_tile_type + slot, 0x00);
    }
  }
}


/** In a room: its sector by the tile, an altar room's (15) often, outside the Abyss mostly, at the altar's columns. */
function inRoom(machine: LiftedMachine, random: Random): void {
  inDungeon(machine, random);
  machine.write(ZP_MAIN.tile_under_player, D.dng_tile_room | pick(random, [ 0x0F, 0x0F, Math.floor(random() * 16) ]));
  machine.write(PRTY.player_xpos, pick(random, [ 0x01, 0x03, 0x05, Math.floor(random() * 8) ]));
}


/** Fled from a room one way or another, from an altar room or not. */
function fleeing(machine: LiftedMachine, random: Random): void {
  inDungeon(machine, random);
  machine.write(PRTY.game_mode, PRTY.mode_combat_dng_room);
  machine.write(ZP_MAIN.game_mode_pre_combat, PRTY.mode_dungeon);
  machine.write(COMBAT_VARIABLES.flee_x, pick(random, [ 0x00, 0x01, 0xFF ]));
  machine.write(COMBAT_VARIABLES.flee_y, pick(random, [ 0x00, 0x01, 0xFF ]));
  machine.write(PRTY.altar_room_principle, pick(random, [ PRTY.principle_none, PRTY.principle_none, PRTY.principle_truth, PRTY.principle_love, PRTY.principle_courage ]));
}


function dungeonCase(entry: number, setup: (machine: LiftedMachine, random: Random) => void = inDungeon, a: ((random: Random) => number) | null = null): readonly [ number, ICase ] {
  return [ entry, { ult4: true, stops: DUNGEON_STOPS, key: (): { code: number; polls: number } => ({ code: 0x59, polls: 1 }), setup: (machine: LiftedMachine, random: Random): void => {
    setup(machine, random);
    if (a != null) {
      machine.cpu.a = a(random);
    }
    machine.cpu.x = Math.floor(random() * (O.object_max + 1));
  } } ];
}


export const DUNGEON_CASES: Readonly<Record<string, readonly [ number, ICase ]>> = {
  spawn_dungeon: dungeonCase(DE.spawn_dungeon, spawning),
  mobs_act_dungeon: dungeonCase(DE.mobs_act_dungeon),
  dng_check_attacked: dungeonCase(DE.dng_check_attacked),
  do_dungeon_room: dungeonCase(DE.do_dungeon_room, inRoom),
  combat_exit_room: dungeonCase(DE.combat_exit_room, fleeing),
  do_exit_room: dungeonCase(DE.do_exit_room, fleeing, (random: Random): number => Math.floor(random() * 4)),
  legal_move_dungeon: dungeonCase(DE.legal_move_dungeon, inDungeon, dungeonTile),
  dng_can_advance: dungeonCase(DE.dng_can_advance, inDungeon, (random: Random): number => (random() < 0.8) ? dungeonTile(random) : byte(random)),
  dng_can_retreat: dungeonCase(DE.dng_can_retreat, inDungeon, (random: Random): number => (random() < 0.8) ? dungeonTile(random) : byte(random)),
};
