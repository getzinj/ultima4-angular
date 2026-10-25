import { CARRY } from '../../lifted-runtime/cpu';
import type { LiftedMachine } from '../../lifted-runtime/lifted-machine';
import { MAP_OBJECTS, PRTY, ROST, TILES, ZP_MAIN } from '../../state/symbols';
import { RETURN, subsMachine } from '../testing/subs-machine';
import { COMBAT_ENTRIES } from './ult4-combat-data';
import { ULT4_MODULE } from './ult4-module';

// ULT4's combat with nothing lifted: the routines that need no unported code, run with the ported
// SUBS.

const C = COMBAT_ENTRIES;
const O = MAP_OBJECTS;
const ZP_CUR_FOE_INDEX: number = 0xEA;
const ARENA_SIZE: number = 11;


function combatMachine(): LiftedMachine {
  const machine: LiftedMachine = subsMachine([ ULT4_MODULE ]);

  machine.bload('program', 'ULT4');
  machine.write(PRTY.party_size, 0x02);
  for (let index: number = 0; index < ARENA_SIZE * ARENA_SIZE; index++) {
    machine.write(O.world_tiles + index, TILES.tile_grass);
  }

  return machine;
}


/** JSR to a routine with A and the N flag it reads, and run until it returns. */
async function call(machine: LiftedMachine, entry: number, a: number = 0): Promise<LiftedMachine> {
  machine.cpu.a = machine.cpu.nz(a);
  machine.cpu.pushWord(RETURN - 1);
  machine.cpu.pc = entry;
  await machine.runUntil((): boolean => machine.cpu.pc === RETURN);

  return machine;
}


/** Run a routine that jumps on until it reaches `next`. */
async function jumpsTo(machine: LiftedMachine, entry: number, next: number): Promise<LiftedMachine> {
  machine.cpu.pushWord(RETURN - 1);
  machine.cpu.pc = entry;
  await machine.runUntil((): boolean => (machine.cpu.pc === next) || (machine.cpu.pc === RETURN));

  return machine;
}


function withFoe(machine: LiftedMachine, foe: number, tile: number, x: number, y: number): LiftedMachine {
  machine.write(O.combat_foe_tile_type + foe, tile);
  machine.write(O.combat_foe_cur_x + foe, x);
  machine.write(O.combat_foe_cur_y + foe, y);

  return machine;
}


function withPlayer(machine: LiftedMachine, player: number, status: number, classIndex: number = 0): LiftedMachine {
  const stats: number = ROST.player_stats + ((player - 1) * 0x20);

  machine.write(stats + ROST.player_status, status);
  machine.write(stats + ROST.player_class_index, classIndex);
  machine.write(ZP_MAIN.curr_player, player);

  return machine;
}


describe('ULT4 combat, ported', (): void => {
  describe('foe_index_from_tile', (): void => {
    it.each([
      [ 'a pirate', TILES.tile_pirate, 0x00 ],
      [ 'a sea serpent', TILES.tile_serpent, 0x04 ],
      [ 'a rat', TILES.tile_rat, 0x08 ],
      [ 'an orc', TILES.tile_orc, 0x14 ],
      [ 'a balron', TILES.tile_balron, 0x23 ],
      [ 'a mage of the party\'s classes', TILES.tile_class_mage, 0x24 ],
    ])('indexes %s at %i', async (_: string, tile: number, index: number): Promise<void> => {
      expect((await call(combatMachine(), C.foe_index_from_tile, tile)).cpu.a).toBe(index);
    });
  });

  describe('rand_modulo', (): void => {
    it('stays below its modulus', async (): Promise<void> => {
      expect((await call(combatMachine(), C.rand_modulo, 0x05)).cpu.a).toBeLessThan(0x05);
    });

    it('gives 0 for 0', async (): Promise<void> => {
      expect((await call(combatMachine(), C.rand_modulo, 0x00)).cpu.a).toBe(0x00);
    });
  });

  describe('get_player_sprite', (): void => {
    it('shows a player in good health as its class', async (): Promise<void> => {
      expect((await call(withPlayer(combatMachine(), 1, ROST.status_Good, 3), C.get_player_sprite)).cpu.a).toBe(TILES.tile_class_first + 6);
    });

    it('lays a sleeper down', async (): Promise<void> => {
      expect((await call(withPlayer(combatMachine(), 1, ROST.status_Sleep), C.get_player_sprite)).cpu.a).toBe(TILES.tile_human_prone);
    });

    it('leaves the dead out', async (): Promise<void> => {
      expect((await call(withPlayer(combatMachine(), 1, ROST.status_Dead), C.get_player_sprite)).cpu.a).toBe(0xFF);
    });
  });

  describe('is_alive', (): void => {
    it('counts a sleeping player as alive', async (): Promise<void> => {
      expect((await call(withPlayer(combatMachine(), 2, ROST.status_Sleep), C.is_alive)).cpu.a).toBe(0x00);
    });

    it('does not count a player beyond the party', async (): Promise<void> => {
      expect((await call(withPlayer(combatMachine(), 3, ROST.status_Good), C.is_alive)).cpu.a).toBe(0xFF);
    });
  });

  it('does not count a sleeping player as awake', async (): Promise<void> => {
    expect((await call(withPlayer(combatMachine(), 1, ROST.status_Sleep), C.is_awake)).cpu.a).toBe(0xFF);
  });

  describe('check_hit_foe', (): void => {
    function aimedAt(x: number, y: number): LiftedMachine {
      const machine: LiftedMachine = withFoe(combatMachine(), 0x06, TILES.tile_orc, 0x04, 0x03);

      machine.write(PRTY.dest_x, x);
      machine.write(PRTY.dest_y, y);

      return machine;
    }

    it('finds the foe on the square', async (): Promise<void> => {
      expect((await call(aimedAt(0x04, 0x03), C.check_hit_foe)).read(ZP_CUR_FOE_INDEX)).toBe(0x06);
    });

    it('is negative where there is none', async (): Promise<void> => {
      expect((await call(aimedAt(0x05, 0x03), C.check_hit_foe)).cpu.a).toBe(0xFF);
    });
  });

  describe('next_arena_tile', (): void => {
    function flying(dx: number): LiftedMachine {
      const machine: LiftedMachine = combatMachine();

      machine.write(O.target_x, 0x0A);
      machine.write(O.target_y, 0x05);
      machine.write(ZP_MAIN.delta_x, dx);
      machine.write(ZP_MAIN.delta_y, 0x00);

      return machine;
    }

    it('moves the missile a square', async (): Promise<void> => {
      expect((await call(flying(0xFF), C.next_arena_tile)).read(O.target_x)).toBe(0x09);
    });

    it('stops it at the arena\'s edge', async (): Promise<void> => {
      expect((await call(flying(0x01), C.next_arena_tile)).cpu.a).toBe(0xFF);
    });
  });

  it('turns a square\'s x and y into its place in the 11 x 11 arena', async (): Promise<void> => {
    expect((await call(combatMachine(), C.xy_to_offset, 0x32)).cpu.y).toBe((2 * ARENA_SIZE) + 3);
  });

  describe('get_rangeattack_type', (): void => {
    it('gives a dragon fireballs', async (): Promise<void> => {
      expect((await call(combatMachine(), C.get_rangeattack_type, TILES.tile_dragon)).cpu.a).toBe(TILES.tile_attack_red);
    });

    it('gives an orc nothing to throw', async (): Promise<void> => {
      expect((await call(combatMachine(), C.get_rangeattack_type, TILES.tile_orc)).cpu.a).toBe(0x00);
    });
  });

  describe('legal_move_combat', (): void => {
    function stepping(onto: number): LiftedMachine {
      const machine: LiftedMachine = withFoe(combatMachine(), 0x00, TILES.tile_orc, 0x05, 0x05);

      machine.write(ZP_CUR_FOE_INDEX, 0x00);
      machine.write(O.combat_foe_prev_x, 0x00);
      machine.write(PRTY.dest_x, 0x05);
      machine.write(PRTY.dest_y, 0x06);
      withFoe(machine, 0x01, onto, 0x05, 0x06);

      return machine;
    }

    it('lets an orc onto open grass', async (): Promise<void> => {
      expect((await call(stepping(0x00), C.legal_move_combat, TILES.tile_grass)).cpu.flag(CARRY)).toBe(false);
    });

    it('keeps an orc off another foe', async (): Promise<void> => {
      expect((await call(stepping(TILES.tile_rat), C.legal_move_combat, TILES.tile_grass)).cpu.flag(CARRY)).toBe(true);
    });
  });

  describe('check_scene_over', (): void => {
    it('declares victory when no foes are left', async (): Promise<void> => {
      const machine: LiftedMachine = combatMachine();

      machine.write(PRTY.game_mode, PRTY.mode_combat_wandering);

      expect((await jumpsTo(machine, C.check_scene_over, C.foes_vanquished)).cpu.pc).toBe(C.foes_vanquished);
    });

    it('lets the fight go on while a foe and a player are in the arena', async (): Promise<void> => {
      const machine: LiftedMachine = withFoe(combatMachine(), 0x03, TILES.tile_orc, 0x01, 0x01);

      machine.write(PRTY.game_mode, PRTY.mode_combat_wandering);
      machine.write(O.combat_player_tile, TILES.tile_class_first);

      expect((await jumpsTo(machine, C.check_scene_over, C.foes_vanquished)).cpu.pc).toBe(RETURN);
    });
  });

  describe('do_foe_move', (): void => {
    function moving(x: number): LiftedMachine {
      const machine: LiftedMachine = withFoe(combatMachine(), 0x02, TILES.tile_orc, 0x05, 0x05);

      machine.write(ZP_CUR_FOE_INDEX, 0x02);
      machine.write(PRTY.dest_x, x);
      machine.write(PRTY.dest_y, 0x05);

      return machine;
    }

    it('steps the foe to its new square', async (): Promise<void> => {
      expect((await jumpsTo(moving(0x06), C.do_foe_move, C.check_tile_effect)).read(O.combat_foe_cur_x + 0x02)).toBe(0x06);
    });

    it('sends a foe stepping off the edge fleeing', async (): Promise<void> => {
      expect((await jumpsTo(moving(0x0B), C.do_foe_move, C.fleeing)).cpu.pc).toBe(C.fleeing);
    });
  });
});
