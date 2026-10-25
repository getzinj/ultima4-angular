import { CARRY, ZERO } from '../../lifted-runtime/cpu';
import type { LiftedMachine } from '../../lifted-runtime/lifted-machine';
import { MAP_OBJECTS, PRTY, TILES, TRAINERS, ZP_MAIN } from '../../state/symbols';
import { RETURN, subsMachine } from '../testing/subs-machine';
import { ULT4_MODULE } from './ult4-module';
import { MONSTER_ENTRIES } from './ult4-monsters-data';

// ULT4's wandering monsters with nothing lifted: the routines that need no unported code, run with
// the ported SUBS.

const M = MONSTER_ENTRIES;
const O = MAP_OBJECTS;


function monsterMachine(): LiftedMachine {
  const machine: LiftedMachine = subsMachine([ ULT4_MODULE ]);

  machine.bload('program', 'ULT4');
  machine.write(PRTY.game_mode, PRTY.mode_world);
  machine.write(PRTY.current_location, 0x00);
  machine.write(PRTY.player_xpos, 0x0A);
  machine.write(PRTY.player_ypos, 0x0A);

  return machine;
}


function withObject(machine: LiftedMachine, slot: number, tile: number, x: number, y: number): LiftedMachine {
  machine.write(O.object_tile_type + slot, tile);
  machine.write(O.object_tile_sprite + slot, tile);
  machine.write(O.object_xpos + slot, x);
  machine.write(O.object_ypos + slot, y);

  return machine;
}


function aimedAt(machine: LiftedMachine, x: number, y: number): LiftedMachine {
  machine.write(ZP_MAIN.temp_x, x);
  machine.write(ZP_MAIN.temp_y, y);

  return machine;
}


/** JSR to a routine with A, X and the N flag it reads, and run until it returns. */
async function call(machine: LiftedMachine, entry: number, a: number = 0, x: number = 0): Promise<LiftedMachine> {
  machine.cpu.a = machine.cpu.nz(a);
  machine.cpu.x = x;
  machine.cpu.pushWord(RETURN - 1);
  machine.cpu.pc = entry;
  await machine.runUntil((): boolean => machine.cpu.pc === RETURN);

  return machine;
}


describe('ULT4 wandering monsters, ported', (): void => {
  it('numbers a dungeon monster from 1', async (): Promise<void> => {
    expect((await call(monsterMachine(), M.tile_to_monster_num, TILES.tile_monster_dungeon + 4)).cpu.a).toBe(0x02);
  });

  describe('manhattan_dist', (): void => {
    function threeLeftTwoDown(): LiftedMachine {
      return withObject(monsterMachine(), 0x02, TILES.tile_orc, 0x07, 0x0C);
    }

    it('adds the distances along x and y', async (): Promise<void> => {
      expect((await call(threeLeftTwoDown(), M.manhattan_dist, 0, 0x02)).cpu.a).toBe(0x05);
    });

    it('points the monster east, toward the party', async (): Promise<void> => {
      expect((await call(threeLeftTwoDown(), M.manhattan_dist, 0, 0x02)).read(ZP_MAIN.delta_x)).toBe(0x01);
    });
  });

  describe('get_mob_at_temp_xy', (): void => {
    it('finds the monster on the square in Britannia', async (): Promise<void> => {
      const machine: LiftedMachine = aimedAt(withObject(monsterMachine(), 0x04, TILES.tile_orc, 0x0B, 0x0A), 0x0B, 0x0A);

      expect((await call(machine, M.get_mob_at_temp_xy)).cpu.a).toBe(0x04);
    });

    it('finds nothing in a dungeon', async (): Promise<void> => {
      const machine: LiftedMachine = aimedAt(withObject(monsterMachine(), 0x04, TILES.tile_orc, 0x0B, 0x0A), 0x0B, 0x0A);

      machine.write(PRTY.current_location, PRTY.loc_dng_first);

      expect((await call(machine, M.get_mob_at_temp_xy)).cpu.a).toBe(0xFF);
    });
  });

  it('passes over an empty slot', async (): Promise<void> => {
    const machine: LiftedMachine = aimedAt(withObject(monsterMachine(), 0x04, 0x00, 0x0B, 0x0A), 0x0B, 0x0A);

    expect((await call(machine, M.any_obj_at_temp_xy)).cpu.a).toBe(0xFF);
  });

  it('denies a move with carry set', async (): Promise<void> => {
    expect((await call(monsterMachine(), M.deny_move)).cpu.flag(CARRY)).toBe(true);
  });

  describe('legal_move_world_twn', (): void => {
    function orcStepping(other: number): LiftedMachine {
      const machine: LiftedMachine = aimedAt(withObject(monsterMachine(), 0x01, TILES.tile_orc, 0x05, 0x05), 0x06, 0x05);

      return withObject(machine, 0x09, other, 0x06, 0x05);
    }

    it('lets an orc onto grass with a chest on it', async (): Promise<void> => {
      expect((await call(orcStepping(TILES.tile_chest), M.legal_move_world_twn, TILES.tile_grass, 0x01)).cpu.flag(CARRY)).toBe(false);
    });

    it('keeps an orc off another monster', async (): Promise<void> => {
      expect((await call(orcStepping(TILES.tile_rat), M.legal_move_world_twn, TILES.tile_grass, 0x01)).cpu.flag(CARRY)).toBe(true);
    });
  });

  it('lets the attack go ahead with the trainer off', async (): Promise<void> => {
    const machine: LiftedMachine = monsterMachine();

    machine.write(TRAINERS.trainer_avoid, 0x00);

    expect((await call(machine, M.check_avoid)).cpu.flag(ZERO)).toBe(false);
  });

  it('sinks what a whirlpool passes over', async (): Promise<void> => {
    const machine: LiftedMachine = withObject(withObject(monsterMachine(), 0x00, TILES.tile_whirlpool, 0x03, 0x03), 0x05, TILES.tile_pirate, 0x03, 0x03);

    expect((await call(machine, M.check_water_hazards)).read(O.object_tile_type + 0x05)).toBe(0x00);
  });

  it('forgets a monster outside the tile cache', async (): Promise<void> => {
    const machine: LiftedMachine = withObject(monsterMachine(), 0x06, TILES.tile_orc, 0x40, 0x0A);

    machine.write(PRTY.map_x, 0x00);
    machine.write(PRTY.map_y, 0x00);

    expect((await call(machine, M.mobs_act_world)).read(O.object_tile_type + 0x06)).toBe(0x00);
  });
});
