import type { LiftedMachine } from '../../lifted-runtime/lifted-machine';
import { CARRY } from '../../lifted-runtime/cpu';
import { ARENAS, DUNGEON, MAP_OBJECTS, PRTY, TILES, ZP_MAIN } from '../../state/symbols';
import { DNGD_STILL } from '../testing/dngd-still';
import { RETURN, subsMachine } from '../testing/subs-machine';
import { SEL_MODULE } from './sel-module';
import { COMBAT_ENTRIES, COMBAT_VARIABLES } from './ult4-combat-data';
import { ULT4_ENTRIES } from './ult4-data';
import { DUNGEON_ENTRIES } from './ult4-dungeons-data';
import { ULT4_MODULE } from './ult4-module';

// ULT4's dungeon code with nothing lifted, run with the ported SUBS and SEL and a DNGD that draws nothing.

const D = DUNGEON;
const DE = DUNGEON_ENTRIES;
const O = MAP_OBJECTS;
const DUNGEON_MAP: number = 0xE800;
const MONSTER: number = 0x03;
const zp_trainer_avoid: number = 0xD8;

/** The party at (2, 2) on level 1 of Deceit, facing east, the level all hall, and no monsters. */
function inDeceit(): LiftedMachine {
  const machine: LiftedMachine = subsMachine([ ULT4_MODULE, SEL_MODULE, DNGD_STILL ]);

  machine.bload('program', 'SEL', 0x0320);
  machine.bload('program', 'ULT4');
  machine.bload('underworld', 'DNGD');
  machine.write(PRTY.game_mode, PRTY.mode_dungeon);
  machine.write(PRTY.current_location, PRTY.loc_dng_first);
  machine.write(PRTY.dungeon_level, 0x00);
  machine.write(PRTY.dng_direction, D.dng_dir_east);
  machine.write(PRTY.player_xpos, 0x02);
  machine.write(PRTY.player_ypos, 0x02);
  for (let index: number = 0; index < 0x200; index++) {
    machine.write(DUNGEON_MAP + index, 0x00);
  }
  for (let slot: number = 0; slot <= O.object_max; slot++) {
    machine.write(O.object_tile_type + slot, 0x00);
  }
  machine.write(zp_trainer_avoid, 0x00);

  return machine;
}


/** JSR to `entry` with A as given, and run until it returns or reaches `stop`. */
async function call(machine: LiftedMachine, entry: number, a: number = 0x00, stop: number = RETURN): Promise<LiftedMachine> {
  machine.cpu.a = machine.cpu.nz(a);
  machine.cpu.pushWord(RETURN - 1);
  machine.cpu.pc = entry;
  await machine.runUntil((): boolean => (machine.cpu.pc === RETURN) || (machine.cpu.pc === stop));

  return machine;
}


/** A rat where the party stands, on the map's tile under it and as the level's object. */
function ratUnderfoot(): LiftedMachine {
  const machine: LiftedMachine = inDeceit();

  machine.write(DUNGEON_MAP + (0x02 * 0x08) + 0x02, 0x01);
  machine.write(ZP_MAIN.tile_under_player, 0x01);
  machine.write(O.object_tile_type + MONSTER, TILES.tile_monster_dungeon);
  machine.write(O.object_dng_level + MONSTER, 0x00);
  machine.write(O.object_xpos + MONSTER, 0x02);
  machine.write(O.object_ypos + MONSTER, 0x02);

  return machine;
}


describe('ULT4\'s dungeon code, ported', (): void => {
  describe('dng_can_advance', (): void => {
    it('lets the party through a door', async (): Promise<void> => {
      expect((await call(inDeceit(), DE.dng_can_advance, D.dng_tile_door)).cpu.a).toBe(0x00);
    });

    it('lets the party through a secret door', async (): Promise<void> => {
      expect((await call(inDeceit(), DE.dng_can_advance, D.dng_tile_secret_door)).cpu.a).toBe(0x00);
    });

    it('lets the party into a room', async (): Promise<void> => {
      expect((await call(inDeceit(), DE.dng_can_advance, D.dng_tile_room | 0x03)).cpu.a).toBe(0x00);
    });

    it('stops the party at a wall', async (): Promise<void> => {
      expect((await call(inDeceit(), DE.dng_can_advance, D.dng_tile_wall)).cpu.a).toBe(0xFF);
    });
  });

  describe('dng_can_retreat', (): void => {
    it('lets the party back down a hall', async (): Promise<void> => {
      expect((await call(inDeceit(), DE.dng_can_retreat, 0x00)).cpu.a).toBe(0x00);
    });

    it('keeps the party out of a lightning field', async (): Promise<void> => {
      expect((await call(inDeceit(), DE.dng_can_retreat, D.dng_tile_field + D.dng_field_lightning)).cpu.a).toBe(0xFF);
    });

    it('keeps the party from backing through a door', async (): Promise<void> => {
      expect((await call(inDeceit(), DE.dng_can_retreat, D.dng_tile_door)).cpu.a).toBe(0xFF);
    });
  });

  describe('legal_move_dungeon', (): void => {
    it('keeps a monster off another', async (): Promise<void> => {
      expect((await call(inDeceit(), DE.legal_move_dungeon, 0x02)).cpu.flag(CARRY)).toBe(true);
    });

    it('keeps a monster off a trap', async (): Promise<void> => {
      expect((await call(inDeceit(), DE.legal_move_dungeon, D.dng_tile_trap)).cpu.flag(CARRY)).toBe(true);
    });
  });

  describe('dng_check_attacked', (): void => {
    it('goes on to load the hall\'s arena for a monster underfoot', async (): Promise<void> => {
      expect((await call(ratUnderfoot(), DE.dng_check_attacked, 0x00, COMBAT_ENTRIES.load_arena)).cpu.a).toBe(ARENAS.arena_dng_hall);
    });

    it('fights the monster the tile names', async (): Promise<void> => {
      expect((await call(ratUnderfoot(), DE.dng_check_attacked, 0x00, COMBAT_ENTRIES.load_arena)).read(ZP_MAIN.foe_type_combat)).toBe(TILES.tile_monster_dungeon);
    });

    it('takes the monster off the map', async (): Promise<void> => {
      expect((await call(ratUnderfoot(), DE.dng_check_attacked, 0x00, COMBAT_ENTRIES.load_arena)).read(DUNGEON_MAP + 0x12)).toBe(0x00);
    });

    it('takes the monster out of the objects', async (): Promise<void> => {
      expect((await call(ratUnderfoot(), DE.dng_check_attacked, 0x00, COMBAT_ENTRIES.load_arena)).read(O.object_tile_type + MONSTER)).toBe(0x00);
    });

    it('returns from a trap with a monster\'s number on it', async (): Promise<void> => {
      const machine: LiftedMachine = ratUnderfoot();

      machine.write(ZP_MAIN.tile_under_player, D.dng_tile_trap | 0x01);

      expect((await call(machine, DE.dng_check_attacked, 0x00, COMBAT_ENTRIES.load_arena)).cpu.pc).toBe(RETURN);
    });
  });

  describe('mobs_act_dungeon', (): void => {
    it('never moves a mimic', async (): Promise<void> => {
      const machine: LiftedMachine = inDeceit();

      machine.write(O.object_tile_type + MONSTER, TILES.tile_mimic);
      machine.write(O.object_xpos + MONSTER, 0x05);

      expect((await call(machine, DE.mobs_act_dungeon)).read(O.object_xpos + MONSTER)).toBe(0x05);
    });
  });

  describe('combat_exit_room', (): void => {
    function fledWest(): LiftedMachine {
      const machine: LiftedMachine = inDeceit();

      machine.write(PRTY.game_mode, PRTY.mode_combat_dng_room);
      machine.write(ZP_MAIN.game_mode_pre_combat, PRTY.mode_dungeon);
      machine.write(COMBAT_VARIABLES.flee_x, 0xFF);
      machine.write(COMBAT_VARIABLES.flee_y, 0x00);
      machine.write(PRTY.altar_room_principle, PRTY.principle_none);

      return machine;
    }

    it('faces the party the way it fled', async (): Promise<void> => {
      expect((await call(fledWest(), DE.combat_exit_room, 0x00, ULT4_ENTRIES.cmd_done)).read(PRTY.dng_direction)).toBe(D.dng_dir_west);
    });

    it('steps the party out that way', async (): Promise<void> => {
      expect((await call(fledWest(), DE.combat_exit_room, 0x00, ULT4_ENTRIES.cmd_done)).read(PRTY.player_xpos)).toBe(0x01);
    });

    it('puts the party back in the dungeon', async (): Promise<void> => {
      expect((await call(fledWest(), DE.combat_exit_room, 0x00, ULT4_ENTRIES.cmd_done)).read(PRTY.game_mode)).toBe(PRTY.mode_dungeon);
    });
  });
});
