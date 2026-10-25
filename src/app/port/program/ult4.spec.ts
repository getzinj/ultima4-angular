import type { LiftedMachine } from '../../lifted-runtime/lifted-machine';
import { CARRY, ZERO } from '../../lifted-runtime/cpu';
import { MAP_OBJECTS, PRTY, ROST, TILES, TRAINERS, ZP_MAIN } from '../../state/symbols';
import { RETURN, subsMachine } from '../testing/subs-machine';
import { ULT4_ENTRIES } from './ult4-data';
import { ULT4_MODULE } from './ult4-module';

// The ported part of ULT4 with nothing lifted: the routines that need no unported code, run with
// the ported SUBS.

const E = ULT4_ENTRIES;
const HORSE_SLOT: number = 0x1D;


function ult4Machine(): LiftedMachine {
  const machine: LiftedMachine = subsMachine([ ULT4_MODULE ]);

  machine.bload('program', 'ULT4');

  return machine;
}


/** JSR to a routine that ends in an RTS, and run until it returns. */
async function call(machine: LiftedMachine, entry: number, a: number = 0): Promise<LiftedMachine> {
  machine.cpu.a = a;
  machine.cpu.pushWord(RETURN - 1);
  machine.cpu.pc = entry;
  await machine.runUntil((): boolean => machine.cpu.pc === RETURN);

  return machine;
}


/** Run a command from its entry until it jumps on to `next`. */
async function command(machine: LiftedMachine, entry: number, next: number): Promise<LiftedMachine> {
  machine.cpu.pc = entry;
  await machine.runUntil((): boolean => machine.cpu.pc === next);

  return machine;
}


function onHorse(): LiftedMachine {
  const machine: LiftedMachine = ult4Machine();

  machine.write(PRTY.player_transport, TILES.tile_horse_west);
  machine.write(PRTY.player_xpos, 0x40);
  machine.write(PRTY.player_ypos, 0x50);

  return machine;
}


describe('ULT4, ported in part', (): void => {
  describe('is_wind_favorable', (): void => {
    it('lets a ship sail into the wind on every fourth turn', async (): Promise<void> => {
      const machine: LiftedMachine = ult4Machine();

      machine.write(ZP_MAIN.wind_direction, ZP_MAIN.wind_dir_north);
      machine.write(ZP_MAIN.turn_counter, 0x04);

      expect((await call(machine, E.is_wind_favorable, ZP_MAIN.wind_dir_north)).cpu.a).toBe(0x00);
    });

    it('holds a ship back from sailing into the wind on the other turns', async (): Promise<void> => {
      const machine: LiftedMachine = ult4Machine();

      machine.write(ZP_MAIN.wind_direction, ZP_MAIN.wind_dir_north);
      machine.write(ZP_MAIN.turn_counter, 0x05);

      expect((await call(machine, E.is_wind_favorable, ZP_MAIN.wind_dir_north)).cpu.a).toBe(0xFF);
    });

    it('takes the opposite direction from zero page $02, as the remaster\'s `eor $02` does', async (): Promise<void> => {
      const machine: LiftedMachine = ult4Machine();

      machine.write(ZP_MAIN.wind_direction, ZP_MAIN.wind_dir_west);
      machine.write(0x02, ZP_MAIN.wind_dir_east);
      machine.write(ZP_MAIN.turn_counter, 0x04);

      expect((await call(machine, E.is_wind_favorable, ZP_MAIN.wind_dir_east)).cpu.a).toBe(0xFF);
    });
  });

  describe('can_ship_move_here', (): void => {
    it.each([
      [ 'deep water', TILES.tile_water_deep, false ],
      [ 'shallow water', TILES.tile_water_shallow, true ],
      [ 'grass', TILES.tile_grass, true ],
      [ 'a whirlpool', TILES.tile_whirlpool, false ],
      [ 'a land monster', TILES.tile_rat, true ],
    ])('says %s is %s', async (_: string, tile: number, blocked: boolean): Promise<void> => {
      expect((await call(ult4Machine(), E.can_ship_move_here, tile)).cpu.flag(CARRY)).toBe(blocked);
    });
  });

  it('never slows a step onto grass', async (): Promise<void> => {
    expect((await call(ult4Machine(), E.check_slow_terrain, TILES.tile_grass)).cpu.flag(ZERO)).toBe(false);
  });

  describe('do_board', (): void => {
    function boarding(): LiftedMachine {
      const machine: LiftedMachine = onHorse();

      machine.write(PRTY.player_transport, TILES.tile_walk);
      machine.write(ZP_MAIN.tile_under_player, TILES.tile_horse_west);
      machine.write(MAP_OBJECTS.object_tile_type + HORSE_SLOT, TILES.tile_horse_west);
      machine.write(MAP_OBJECTS.object_xpos + HORSE_SLOT, 0x40);
      machine.write(MAP_OBJECTS.object_ypos + HORSE_SLOT, 0x50);

      return machine;
    }

    it('takes the horse off the map', async (): Promise<void> => {
      expect((await call(boarding(), E.do_board, TILES.tile_horse_west)).read(MAP_OBJECTS.object_tile_type + HORSE_SLOT)).toBe(0x00);
    });

    it('mounts the party on it', async (): Promise<void> => {
      expect((await call(boarding(), E.do_board, TILES.tile_horse_west)).read(PRTY.player_transport)).toBe(TILES.tile_horse_west);
    });
  });

  describe('cmd_yell_horse', (): void => {
    it('gallops on a horse', async (): Promise<void> => {
      expect((await command(onHorse(), E.cmd_yell_horse, E.cmd_done)).read(PRTY.horse_mode)).toBe(0xFF);
    });

    it('is WHAT? on foot', async (): Promise<void> => {
      const machine: LiftedMachine = ult4Machine();

      machine.write(PRTY.player_transport, TILES.tile_walk);

      expect((await command(machine, E.cmd_yell_horse, E.done_what)).cpu.pc).toBe(E.done_what);
    });
  });

  describe('cmd_x_it', (): void => {
    it('leaves the horse where the party stands', async (): Promise<void> => {
      const machine: LiftedMachine = onHorse();

      machine.write(PRTY.current_location, 0x00);
      for (let slot: number = MAP_OBJECTS.object_inanimate_first; slot < MAP_OBJECTS.object_last; slot++) {
        machine.write(MAP_OBJECTS.object_tile_type + slot, 0x00);
      }
      await command(machine, E.cmd_x_it, E.cmd_done);

      expect(machine.read(MAP_OBJECTS.object_tile_type + MAP_OBJECTS.object_inanimate_first)).toBe(TILES.tile_horse_west);
    });

    it('puts the party back on foot', async (): Promise<void> => {
      expect((await command(onHorse(), E.cmd_x_it, E.cmd_done)).read(PRTY.player_transport)).toBe(TILES.tile_walk);
    });
  });

  describe('check_cmd_alpha', (): void => {
    it('runs B\'s command from cmd_table', async (): Promise<void> => {
      const machine: LiftedMachine = ult4Machine();

      machine.cpu.a = 0xC2;

      expect((await command(machine, E.check_cmd_alpha, E.cmd_board)).cpu.pc).toBe(E.cmd_board);
    });

    it('says WHAT? to a digit', async (): Promise<void> => {
      const machine: LiftedMachine = ult4Machine();

      machine.cpu.a = 0xB1;

      expect((await command(machine, E.check_cmd_alpha, E.done_what)).cpu.pc).toBe(E.done_what);
    });
  });

  it('wraps a step east off the dungeon level to its west edge', async (): Promise<void> => {
    const machine: LiftedMachine = ult4Machine();

    machine.write(PRTY.player_xpos, 0x07);
    machine.cpu.x = 0x01;

    expect((await command(machine, E.dng_move, E.cmd_done)).read(PRTY.player_xpos)).toBe(0x00);
  });

  it('brings the pirate fleet out at the mouth of the Abyss\'s cove', async (): Promise<void> => {
    expect((await command(ult4Machine(), E.spawn_pirate_fleet, E.cmd_done)).read(MAP_OBJECTS.object_tile_type)).toBe(TILES.tile_pirate);
  });

  describe('dec_stat', (): void => {
    function withGems(gems: number): LiftedMachine {
      const machine: LiftedMachine = ult4Machine();

      machine.write(ROST.party_stats + ROST.party_stat_gems, gems);
      machine.cpu.y = ROST.party_stat_gems;

      return machine;
    }

    it('uses one up, in BCD', async (): Promise<void> => {
      expect((await call(withGems(0x10), E.dec_stat)).read(ROST.party_stats + ROST.party_stat_gems)).toBe(0x09);
    });

    it('says with carry set that there was one', async (): Promise<void> => {
      expect((await call(withGems(0x01), E.dec_stat)).cpu.flag(CARRY)).toBe(true);
    });

    it('says with carry clear that there was none', async (): Promise<void> => {
      expect((await call(withGems(0x00), E.dec_stat)).cpu.flag(CARRY)).toBe(false);
    });

    it('leaves none at none', async (): Promise<void> => {
      expect((await call(withGems(0x00), E.dec_stat)).read(ROST.party_stats + ROST.party_stat_gems)).toBe(0x00);
    });
  });

  it('is WHAT? peering without a gem', async (): Promise<void> => {
    const machine: LiftedMachine = ult4Machine();

    machine.write(ROST.party_stats + ROST.party_stat_gems, 0x00);
    machine.write(TRAINERS.trainer_peer, 0x00);

    expect((await command(machine, E.cmd_peer_gem, E.done_what)).cpu.pc).toBe(E.done_what);
  });

  it('counts a turn on the move counter, in BCD', async (): Promise<void> => {
    const machine: LiftedMachine = ult4Machine();

    machine.write(PRTY.move_counter + 3, 0x09);
    machine.write(PRTY.game_mode, PRTY.mode_world);

    expect((await command(machine, E.end_turn, 0x8102)).read(PRTY.move_counter + 3)).toBe(0x10);
  });

  describe('encode_bcd_value', (): void => {
    it('writes 42 as $42', async (): Promise<void> => {
      expect((await call(ult4Machine(), E.encode_bcd_value, 42)).cpu.a).toBe(0x42);
    });

    it('holds 99 and up at $99', async (): Promise<void> => {
      expect((await call(ult4Machine(), E.encode_bcd_value, 200)).cpu.a).toBe(0x99);
    });
  });

  it('reads $42 as 42', async (): Promise<void> => {
    expect((await call(ult4Machine(), E.decode_bcd_value, 0x42)).cpu.a).toBe(42);
  });

  describe('a virtue', (): void => {
    const VALOR: number = ROST.party_stats + ROST.virtue_valor;

    function withValor(value: number): LiftedMachine {
      const machine: LiftedMachine = ult4Machine();

      machine.write(VALOR, value);
      machine.cpu.y = ROST.virtue_valor;

      return machine;
    }

    it('rises in BCD', async (): Promise<void> => {
      expect((await call(withValor(0x48), E.inc_virtue, 0x05)).read(VALOR)).toBe(0x53);
    });

    it('rises no higher than 99', async (): Promise<void> => {
      expect((await call(withValor(0x97), E.inc_virtue, 0x05)).read(VALOR)).toBe(0x99);
    });

    it('stays at zero, an eighth of avatarhood, when it would rise', async (): Promise<void> => {
      expect((await call(withValor(0x00), E.inc_virtue, 0x05)).read(VALOR)).toBe(0x00);
    });

    it('falls in BCD', async (): Promise<void> => {
      expect((await call(withValor(0x53), E.dec_virtue, 0x05)).read(VALOR)).toBe(0x48);
    });

    it('falls no lower than 1', async (): Promise<void> => {
      expect((await call(withValor(0x03), E.dec_virtue, 0x05)).read(VALOR)).toBe(0x01);
    });

    it('loses its eighth at zero, and falls from 99', async (): Promise<void> => {
      expect((await call(withValor(0x00), E.dec_virtue, 0x05)).read(VALOR)).toBe(0x94);
    });
  });

  it('counts one more of a party stat in BCD', async (): Promise<void> => {
    const machine: LiftedMachine = ult4Machine();

    machine.write(ROST.party_stats + ROST.party_stat_gems, 0x09);
    machine.cpu.y = ROST.party_stat_gems;

    expect((await call(machine, E.inc_stat)).read(ROST.party_stats + ROST.party_stat_gems)).toBe(0x10);
  });
});
