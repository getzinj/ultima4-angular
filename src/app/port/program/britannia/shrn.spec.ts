import type { LiftedMachine } from '../../../lifted-runtime/lifted-machine';
import { PRTY, ROST } from '../../../state/symbols';
import { overlayMachine, runOverlay } from '../../testing/overlay-machine';
import { OVERLAY_ENTRY } from '../overlay';
import { SHRN_MODULE } from './shrn';

const SPIRITUALITY: number = ROST.party_stats + ROST.virtue_spirituality;
const HONESTY: number = ROST.party_stats + ROST.virtue_honesty;


/** The shrine of Honesty, its rune held, the party rested. */
function shrine(): LiftedMachine {
  const machine: LiftedMachine = overlayMachine(SHRN_MODULE);

  machine.write(PRTY.current_location, PRTY.loc_shrine_first);
  machine.write(ROST.runes, 0x80);
  machine.write(PRTY.move_counter + 2, 0x01);
  machine.write(PRTY.last_meditated, 0x00);
  machine.write(SPIRITUALITY, 0x50);
  machine.write(HONESTY, 0x50);

  return machine;
}


/** The keys at SHRN's prompts; its pages take a letter, since SPACE would empty the type-ahead buffer. */
function meditate(machine: LiftedMachine, keys: string): Promise<LiftedMachine> {
  return runOverlay(machine, OVERLAY_ENTRY, keys);
}


describe('SHRN, ported', (): void => {
  it('turns the party out without the shrine\'s rune', async (): Promise<void> => {
    const machine: LiftedMachine = shrine();

    machine.write(ROST.runes, 0x7F);

    expect((await meditate(machine, '')).dosLog).not.toContain('BLOAD SHRI,A$280');
  });

  it('grants a vision, and three of spirituality, for one cycle with the right mantra', async (): Promise<void> => {
    expect((await meditate(shrine(), 'HONESTY\r1AHM\rZZ')).read(SPIRITUALITY)).toBe(0x53);
  });

  it('costs three of spirituality for the wrong mantra', async (): Promise<void> => {
    expect((await meditate(shrine(), 'HONESTY\r1OM\r')).read(SPIRITUALITY)).toBe(0x47);
  });

  it('loses an eighth, and starts again from 99, for a wrong mantra with spirituality spent', async (): Promise<void> => {
    const machine: LiftedMachine = shrine();

    machine.write(SPIRITUALITY, 0x00);

    expect((await meditate(machine, 'HONESTY\r1OM\r')).read(SPIRITUALITY)).toBe(0x96);
  });

  it('lets a weary party do nothing', async (): Promise<void> => {
    const machine: LiftedMachine = shrine();

    machine.write(PRTY.last_meditated, 0x01);

    expect((await meditate(machine, 'HONESTY\r1Z')).read(SPIRITUALITY)).toBe(0x50);
  });

  it('records when the party last meditated', async (): Promise<void> => {
    expect((await meditate(shrine(), 'HONESTY\r1AHM\rZZ')).read(PRTY.last_meditated)).toBe(0x01);
  });

  it('makes a party with the virtue at its height a partial avatar after three cycles', async (): Promise<void> => {
    const machine: LiftedMachine = shrine();

    machine.write(HONESTY, 0x99);

    expect((await meditate(machine, 'HONE\r3AHM\rAHM\rAHM\rZZ')).read(HONESTY)).toBe(0x00);
  });

  it('cannot focus on another shrine\'s virtue', async (): Promise<void> => {
    expect((await meditate(shrine(), 'VALOR\r1Z')).read(PRTY.last_meditated)).toBe(0x00);
  });

  it('leaves the party in Britannia afterwards', async (): Promise<void> => {
    expect((await meditate(shrine(), 'HONESTY\r1AHM\rZZ')).read(PRTY.game_mode)).toBe(PRTY.mode_world);
  });
});
