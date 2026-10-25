import type { LiftedMachine } from '../../lifted-runtime/lifted-machine';
import { MAP_OBJECTS, PRTY, TILES, ZP_MAIN } from '../../state/symbols';
import { RETURN, subsMachine } from '../testing/subs-machine';
import { ULT4_ENTRIES } from './ult4-data';
import { ULT4_MODULE } from './ult4-module';
import { SPELL_ENTRIES } from './ult4-spells-data';

// ULT4's spells with nothing lifted: the ones that need no unported code, run with the ported SUBS.

const S = SPELL_ENTRIES;
const E = ULT4_ENTRIES;
const O = MAP_OBJECTS;


function spellMachine(mode: number = PRTY.mode_world): LiftedMachine {
  const machine: LiftedMachine = subsMachine([ ULT4_MODULE ]);

  machine.bload('program', 'ULT4');
  machine.write(PRTY.game_mode, mode);
  machine.write(ZP_MAIN.magic_aura, ZP_MAIN.aura_none);

  return machine;
}


/** Run an entry with A and its N flag until it returns, or reaches `next`. */
async function run(machine: LiftedMachine, entry: number, next: number = RETURN, a: number = 0): Promise<LiftedMachine> {
  machine.cpu.a = machine.cpu.nz(a);
  machine.cpu.pushWord(RETURN - 1);
  machine.cpu.pc = entry;
  await machine.runUntil((): boolean => (machine.cpu.pc === next) || (machine.cpu.pc === RETURN));

  return machine;
}


function withFoe(machine: LiftedMachine, foe: number, tile: number): LiftedMachine {
  machine.write(O.combat_foe_tile_type + foe, tile);
  machine.write(O.combat_foe_hp + foe, 0x40);

  return machine;
}


describe('ULT4 spells, ported', (): void => {
  describe('is_undead', (): void => {
    it('knows a ghost for undead', async (): Promise<void> => {
      expect((await run(spellMachine(), S.is_undead, RETURN, TILES.tile_ghost)).cpu.a).toBe(0x00);
    });

    it('does not take an orc for undead', async (): Promise<void> => {
      expect((await run(spellMachine(), S.is_undead, RETURN, TILES.tile_orc)).cpu.a).toBe(0xFF);
    });
  });

  describe('spell_effect', (): void => {
    it('lets the spell go on with no aura', async (): Promise<void> => {
      expect((await run(spellMachine(), S.spell_effect, S.failed)).cpu.pc).toBe(RETURN);
    });

    it('fails the spell under a negation', async (): Promise<void> => {
      const machine: LiftedMachine = spellMachine();

      machine.write(ZP_MAIN.magic_aura, ZP_MAIN.aura_negate);

      expect((await run(machine, S.spell_effect, S.failed)).cpu.pc).toBe(S.failed);
    });
  });

  it('fails a combat spell outside combat', async (): Promise<void> => {
    expect((await run(spellMachine(), S.combat_only, S.failed)).cpu.pc).toBe(S.failed);
  });

  it('fails a level spell in the Abyss', async (): Promise<void> => {
    const machine: LiftedMachine = spellMachine(PRTY.mode_dungeon);

    machine.write(PRTY.current_location, PRTY.loc_dng_abyss);

    expect((await run(machine, S.not_abyss, S.failed)).cpu.pc).toBe(S.failed);
  });

  describe('set_spell_aura', (): void => {
    it('puts the aura in A on the party', async (): Promise<void> => {
      expect((await run(spellMachine(), S.set_spell_aura, E.done_done, ZP_MAIN.aura_protect)).read(ZP_MAIN.magic_aura)).toBe(ZP_MAIN.aura_protect);
    });

    it('makes it last ten turns', async (): Promise<void> => {
      expect((await run(spellMachine(), S.set_spell_aura, E.done_done, ZP_MAIN.aura_protect)).read(ZP_MAIN.aura_duration)).toBe(0x0A);
    });
  });

  it('lights the way for a hundred turns', async (): Promise<void> => {
    expect((await run(spellMachine(), S.spell_light, E.done_done)).read(PRTY.light_duration)).toBe(0x64);
  });

  describe('spell_resurrect', (): void => {
    it('asks who outside combat', async (): Promise<void> => {
      expect((await run(spellMachine(), S.spell_resurrect, S.try_resurrect)).cpu.pc).toBe(S.try_resurrect);
    });

    it('fails in combat', async (): Promise<void> => {
      expect((await run(spellMachine(PRTY.mode_combat_wandering), S.spell_resurrect, S.res_view_fail)).cpu.pc).toBe(S.res_view_fail);
    });
  });

  it('never puts a ghost to sleep', async (): Promise<void> => {
    const machine: LiftedMachine = withFoe(spellMachine(PRTY.mode_combat_wandering), 0x03, TILES.tile_ghost);

    expect((await run(machine, S.spell_sleep, E.done_done)).read(O.combat_foe_slept + 0x03)).toBe(0x00);
  });

  it('starts the status window\'s next line at its left edge', async (): Promise<void> => {
    expect((await run(spellMachine(), S.next_line)).read(ZP_MAIN.console_xpos)).toBe(0x18);
  });

  it('leaves an orc standing against undead', async (): Promise<void> => {
    const machine: LiftedMachine = withFoe(spellMachine(PRTY.mode_combat_wandering), 0x05, TILES.tile_orc);

    expect((await run(machine, S.spell_undead, E.done_done)).read(O.combat_foe_hp + 0x05)).toBe(0x40);
  });
});
