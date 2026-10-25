import { CARRY } from '../../lifted-runtime/cpu';
import type { LiftedMachine } from '../../lifted-runtime/lifted-machine';
import { MAP_OBJECTS, PRTY, ROST, TABLES, TILES, TRAINERS, ZP_MAIN } from '../../state/symbols';
import { RETURN, subsMachine } from '../testing/subs-machine';
import { COMMAND_ENTRIES, COMMAND_VARIABLES } from './ult4-commands-data';
import { ULT4_ENTRIES } from './ult4-data';
import { ULT4_MODULE } from './ult4-module';

// The rest of ULT4's Britannia commands with nothing lifted: the routines that need no unported
// code, run with the ported SUBS.

const CE = COMMAND_ENTRIES;
const CV = COMMAND_VARIABLES;
const E = ULT4_ENTRIES;
const O = MAP_OBJECTS;
const PLAYER_1: number = ROST.player_stats;
const ZP_NUMBER1: number = 0xD8;


function commandMachine(): LiftedMachine {
  const machine: LiftedMachine = subsMachine([ ULT4_MODULE ]);

  machine.bload('program', 'ULT4');
  machine.write(PRTY.party_size, 0x01);
  machine.write(ZP_MAIN.curr_player, 0x01);
  machine.write(PLAYER_1 + ROST.player_status, ROST.status_Good);

  return machine;
}


/** JSR to a routine with A, and run until it returns. */
async function call(machine: LiftedMachine, entry: number, a: number = 0): Promise<LiftedMachine> {
  machine.cpu.a = machine.cpu.nz(a);
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


function withFood(hi: number, lo: number, frac: number): LiftedMachine {
  const machine: LiftedMachine = commandMachine();

  machine.write(ROST.food_hi, hi);
  machine.write(ROST.food_lo, lo);
  machine.write(ROST.food_frac, frac);
  machine.write(TRAINERS.trainer_food, 0x00);

  return machine;
}


function withHp(current: number, maximum: number): LiftedMachine {
  const machine: LiftedMachine = commandMachine();

  machine.write(PLAYER_1 + ROST.player_cur_hp_hi, current >> 8);
  machine.write(PLAYER_1 + ROST.player_cur_hp_lo, current & 0xFF);
  machine.write(PLAYER_1 + ROST.player_max_hp_hi, maximum >> 8);
  machine.write(PLAYER_1 + ROST.player_max_hp_lo, maximum & 0xFF);

  return machine;
}


function hp(machine: LiftedMachine): number {
  return (machine.read(PLAYER_1 + ROST.player_cur_hp_hi) << 8) | machine.read(PLAYER_1 + ROST.player_cur_hp_lo);
}


function inTowne(countdown: number): LiftedMachine {
  const machine: LiftedMachine = commandMachine();

  machine.write(PRTY.game_mode, PRTY.mode_towne);
  machine.write(CV.door_open_x, 0x03);
  machine.write(CV.door_open_y, 0x04);
  machine.write(CV.door_open_countdown, countdown);
  machine.write(O.towne_map + (0x04 * 0x20) + 0x03, TILES.tile_floor_brick);

  return machine;
}


describe('ULT4\'s Britannia commands, ported', (): void => {
  describe('is_evil', (): void => {
    it('finds an orc evil', async (): Promise<void> => {
      expect((await call(commandMachine(), CE.is_evil, 0xC0)).cpu.a).toBe(0xFF);
    });

    it('spares a rat', async (): Promise<void> => {
      expect((await call(commandMachine(), CE.is_evil, TILES.tile_rat)).cpu.a).toBe(0x00);
    });

    it('spares anything that is not a monster', async (): Promise<void> => {
      expect((await call(commandMachine(), CE.is_evil, TILES.tile_guard)).cpu.a).toBe(0x00);
    });
  });

  describe('eat_food', (): void => {
    it('eats from the hundredths of a ration in BCD', async (): Promise<void> => {
      expect((await call(withFood(0x00, 0x05, 0x10), CE.eat_food, 0x03)).read(ROST.food_frac)).toBe(0x07);
    });

    it('borrows a ration when the hundredths run short', async (): Promise<void> => {
      expect((await call(withFood(0x00, 0x05, 0x01), CE.eat_food, 0x03)).read(ROST.food_lo)).toBe(0x04);
    });

    it('clears carry when the food runs out', async (): Promise<void> => {
      expect((await call(withFood(0x00, 0x00, 0x01), CE.eat_food, 0x03)).cpu.flag(CARRY)).toBe(false);
    });

    it('leaves the food at zero when it runs out', async (): Promise<void> => {
      expect((await call(withFood(0x00, 0x00, 0x01), CE.eat_food, 0x03)).read(ROST.food_frac)).toBe(0x00);
    });

    it('eats nothing with the trainer\'s free food', async (): Promise<void> => {
      const machine: LiftedMachine = withFood(0x00, 0x00, 0x01);

      machine.write(TRAINERS.trainer_food, 0x01);

      expect((await call(machine, CE.eat_food, 0x03)).read(ROST.food_frac)).toBe(0x01);
    });
  });

  describe('dec_player_hp', (): void => {
    it('takes the hit points in BCD', async (): Promise<void> => {
      expect(hp(await call(withHp(0x0150, 0x0200), CE.dec_player_hp, 0x51))).toBe(0x0099);
    });

    it('kills a player with none left', async (): Promise<void> => {
      expect((await call(withHp(0x0010, 0x0200), CE.dec_player_hp, 0x11)).read(PLAYER_1 + ROST.player_status)).toBe(ROST.status_Dead);
    });

    it('leaves a dead player no hit points', async (): Promise<void> => {
      expect(hp(await call(withHp(0x0010, 0x0200), CE.dec_player_hp, 0x11))).toBe(0x0000);
    });
  });

  describe('inc_player_hp', (): void => {
    it('adds the hit points in BCD', async (): Promise<void> => {
      expect(hp(await call(withHp(0x0095, 0x0200), CE.inc_player_hp, 0x07))).toBe(0x0102);
    });

    it('stops at the maximum', async (): Promise<void> => {
      expect(hp(await call(withHp(0x0195, 0x0200), CE.inc_player_hp, 0x07))).toBe(0x0200);
    });
  });

  describe('inc_party_gold', (): void => {
    it('adds the gold in BCD', async (): Promise<void> => {
      const machine: LiftedMachine = commandMachine();

      machine.write(ROST.party_stats + ROST.party_stat_gold_hi, 0x01);
      machine.write(ROST.party_stats + ROST.party_stat_gold_lo, 0x95);

      expect((await call(machine, CE.inc_party_gold, 0x07)).read(ROST.party_stats + ROST.party_stat_gold_hi)).toBe(0x02);
    });

    it('holds the gold at 9999', async (): Promise<void> => {
      const machine: LiftedMachine = commandMachine();

      machine.write(ROST.party_stats + ROST.party_stat_gold_hi, 0x99);
      machine.write(ROST.party_stats + ROST.party_stat_gold_lo, 0x95);

      expect((await call(machine, CE.inc_party_gold, 0x07)).read(ROST.party_stats + ROST.party_stat_gold_lo)).toBe(0x99);
    });
  });

  it('adds experience to the player\'s low digits', async (): Promise<void> => {
    const machine: LiftedMachine = commandMachine();

    machine.write(PLAYER_1 + ROST.player_experience_lo, 0x10);

    expect((await call(machine, CE.inc_player_exp, 0x05)).read(PLAYER_1 + ROST.player_experience_lo)).toBe(0x15);
  });

  it('keeps the amount to add in zp_number1, as collect_gold reads it back', async (): Promise<void> => {
    expect((await call(commandMachine(), CE.inc_party_gold, 0x42)).read(ZP_NUMBER1)).toBe(0x42);
  });

  describe('close_open_door', (): void => {
    it('shuts the door when its count runs out', async (): Promise<void> => {
      expect((await call(inTowne(0x01), CE.close_open_door)).read(O.towne_map + (0x04 * 0x20) + 0x03)).toBe(TILES.tile_door_unlocked);
    });

    it('counts down a door still open', async (): Promise<void> => {
      expect((await call(inTowne(0x03), CE.close_open_door)).read(CV.door_open_countdown)).toBe(0x02);
    });

    it('forgets an open door outside a towne', async (): Promise<void> => {
      const machine: LiftedMachine = inTowne(0x03);

      machine.write(PRTY.game_mode, PRTY.mode_world);

      expect((await call(machine, CE.close_open_door)).read(CV.door_open_countdown)).toBe(0x00);
    });
  });

  it('inverts the player\'s name in the status window, keeping the colour bit', async (): Promise<void> => {
    const machine: LiftedMachine = commandMachine();
    const row: number = machine.read(TABLES.bmplineaddr_lo + 0x08) | (machine.read(TABLES.bmplineaddr_hi + 0x08) << 8);

    machine.write(row + 0x20, 0x81);

    expect((await call(machine, CE.invert_player_name)).read(row + 0x20)).toBe(0xFE);
  });

  describe('anyone_awake', (): void => {
    it('finds a player who can act', async (): Promise<void> => {
      expect((await call(commandMachine(), CE.anyone_awake)).cpu.a).toBe(0x00);
    });

    it('finds none when everyone alive is asleep', async (): Promise<void> => {
      const machine: LiftedMachine = commandMachine();

      machine.write(PLAYER_1 + ROST.player_status, ROST.status_Sleep);

      expect((await call(machine, CE.anyone_awake)).cpu.a).toBe(0xFF);
    });
  });

  it('gives a mage a magic point back', async (): Promise<void> => {
    const machine: LiftedMachine = commandMachine();

    machine.write(PLAYER_1 + ROST.player_class_index, 0x00);
    machine.write(PLAYER_1 + ROST.player_intelligence, 0x20);
    machine.write(PLAYER_1 + ROST.player_magic_points, 0x09);

    expect((await call(machine, CE.recover_mp)).read(PLAYER_1 + ROST.player_magic_points)).toBe(0x10);
  });

  it('gives a fighter no magic points', async (): Promise<void> => {
    const machine: LiftedMachine = commandMachine();

    machine.write(PLAYER_1 + ROST.player_class_index, 0x02);
    machine.write(PLAYER_1 + ROST.player_intelligence, 0x20);
    machine.write(PLAYER_1 + ROST.player_magic_points, 0x00);

    expect((await call(machine, CE.recover_mp)).read(PLAYER_1 + ROST.player_magic_points)).toBe(0x00);
  });

  it('does nothing to a party aloft', async (): Promise<void> => {
    const machine: LiftedMachine = commandMachine();

    machine.write(PRTY.terrain_occlusion, 0xFF);
    machine.write(ZP_MAIN.tile_under_player, TILES.tile_field_sleep);

    expect((await call(machine, CE.tile_effect)).read(PLAYER_1 + ROST.player_status)).toBe(ROST.status_Good);
  });

  describe('Volume', (): void => {
    it('turns the sound off', async (): Promise<void> => {
      const machine: LiftedMachine = commandMachine();

      machine.write(ZP_MAIN.sfx_volume, 0xFF);

      expect((await command(machine, CE.cmd_volume, E.cmd_done)).read(ZP_MAIN.sfx_volume)).toBe(0x00);
    });

    it('turns the sound back on', async (): Promise<void> => {
      const machine: LiftedMachine = commandMachine();

      machine.write(ZP_MAIN.sfx_volume, 0x00);

      expect((await command(machine, CE.cmd_volume, E.cmd_done)).read(ZP_MAIN.sfx_volume)).toBe(0xFF);
    });
  });

  describe('Ignite', (): void => {
    function withTorches(torches: number): LiftedMachine {
      const machine: LiftedMachine = commandMachine();

      machine.write(PRTY.game_mode, PRTY.mode_world);
      machine.write(TRAINERS.trainer_torch, 0x00);
      machine.write(ROST.party_stats + ROST.party_stat_torches, torches);
      machine.write(PRTY.light_duration, 0x00);

      return machine;
    }

    it('lights a torch for a hundred turns', async (): Promise<void> => {
      expect((await command(withTorches(0x02), CE.cmd_ignite, E.cmd_done)).read(PRTY.light_duration)).toBe(0x64);
    });

    it('uses up a torch', async (): Promise<void> => {
      expect((await command(withTorches(0x02), CE.cmd_ignite, E.cmd_done)).read(ROST.party_stats + ROST.party_stat_torches)).toBe(0x01);
    });

    it('has none to light without torches', async (): Promise<void> => {
      expect((await command(withTorches(0x00), CE.cmd_ignite, E.done_have_none)).read(PRTY.light_duration)).toBe(0x00);
    });
  });
});
