import type { LiftedMachine } from '../../../lifted-runtime/lifted-machine';
import { JUMP_OVERLAY, PRTY, ROST } from '../../../state/symbols';
import { overlayMachine, runOverlay } from '../../testing/overlay-machine';
import { HELP_MODULE } from './help';
import { LORD_MODULE } from './lord';

const PLAYER_1: number = ROST.player_stats;


function court(): LiftedMachine {
  const machine: LiftedMachine = overlayMachine(LORD_MODULE, [ HELP_MODULE ]);

  machine.write(PRTY.player_has_spoken_to_lb, 0x01);
  machine.write(PRTY.party_size, 0x01);
  machine.write(PLAYER_1 + ROST.player_status, ROST.status_Good);
  machine.write(PLAYER_1 + ROST.player_experience_hi, 0x00);
  machine.write(PLAYER_1 + ROST.player_max_hp_hi, 0x01);
  machine.write(PLAYER_1 + ROST.player_cur_hp_hi, 0x00);

  return machine;
}


function talk(machine: LiftedMachine, keys: string): Promise<LiftedMachine> {
  return runOverlay(machine, JUMP_OVERLAY.talk_lord_british, keys);
}


describe('LORD, ported', (): void => {
  it('remembers that the party has met him', async (): Promise<void> => {
    const machine: LiftedMachine = court();

    machine.write(PRTY.player_has_spoken_to_lb, 0x00);

    expect((await talk(machine, 'ZZZBYE\r')).read(PRTY.player_has_spoken_to_lb)).toBe(0x01);
  });

  describe('a player whose experience has earned a level', (): void => {
    function experienced(): LiftedMachine {
      const machine: LiftedMachine = court();

      machine.write(PLAYER_1 + ROST.player_experience_hi, 0x04);

      return machine;
    }

    it('reaches it: one more than the halvings that empty the experience', async (): Promise<void> => {
      expect((await talk(experienced(), 'BYE\r')).read(PLAYER_1 + ROST.player_max_hp_hi)).toBe(0x04);
    });

    it('is healed to the new level\'s hit points', async (): Promise<void> => {
      expect((await talk(experienced(), 'BYE\r')).read(PLAYER_1 + ROST.player_cur_hp_hi)).toBe(0x04);
    });
  });

  describe('HEAL', (): void => {
    it('heals the party that is not well', async (): Promise<void> => {
      expect((await talk(court(), 'HEAL\rN\rBYE\r')).read(PLAYER_1 + ROST.player_cur_hp_hi)).toBe(0x01);
    });

    it('leaves the party that is well as it is', async (): Promise<void> => {
      expect((await talk(court(), 'HEAL\rY\rBYE\r')).read(PLAYER_1 + ROST.player_cur_hp_hi)).toBe(0x00);
    });
  });

  it('BRUNs HELP, which BRUNs him back to say farewell', async (): Promise<void> => {
    expect((await talk(court(), 'HELP\rZZBYE\r')).dosLog).toContain('BRUN LORD,A$8800');
  });

  it('cannot help with what he does not know, and talks on', async (): Promise<void> => {
    expect((await talk(court(), 'XYZZY\rBYE\r')).cpu.pc).toBe(0xC0FE);
  });
});
