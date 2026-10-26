import type { LiftedMachine } from '../../../lifted-runtime/lifted-machine';
import { PRTY, ROST, ZP_MAIN } from '../../../state/symbols';
import { overlayMachine, runOverlay } from '../../testing/overlay-machine';
import { OVERLAY_ENTRY } from '../overlay';
import { SHP9_MODULE } from './shp9';

const SPIRITUALITY: number = ROST.party_stats + ROST.virtue_spirituality;
const VISIT: string = ' HONESTY\rLOVE\rBYE\r';


/** Hawkwind, the leader well, spirituality at 50, and the last visit `sameCycle` or another cycle. */
function seer(sameCycle: boolean): LiftedMachine {
  const machine: LiftedMachine = overlayMachine(SHP9_MODULE);

  machine.write(PRTY.game_mode, PRTY.mode_towne);
  machine.write(PRTY.current_location, 0x01);
  machine.write(ZP_MAIN.sfx_volume, 0x00);
  machine.write(ROST.player_stats + ROST.player_status, ROST.status_Good);
  machine.write(ROST.party_stats + ROST.virtue_honesty, 0x10);
  machine.write(SPIRITUALITY, 0x50);
  machine.write(PRTY.move_counter + 2, 0x07);
  machine.write(PRTY.last_meditated, sameCycle ? 0x07 : 0x06);

  return machine;
}


describe('SHP9, Hawkwind, ported', (): void => {
  it('raises spirituality by three for a visit in a new cycle', async (): Promise<void> => {
    expect((await runOverlay(seer(false), OVERLAY_ENTRY, VISIT)).read(SPIRITUALITY)).toBe(0x53);
  });

  it('marks the cycle visited', async (): Promise<void> => {
    expect((await runOverlay(seer(false), OVERLAY_ENTRY, VISIT)).read(PRTY.last_meditated)).toBe(0x07);
  });

  it('raises it no more for a second visit in the cycle', async (): Promise<void> => {
    expect((await runOverlay(seer(true), OVERLAY_ENTRY, VISIT)).read(SPIRITUALITY)).toBe(0x50);
  });

  it('takes NONE for goodbye', async (): Promise<void> => {
    expect((await runOverlay(seer(false), OVERLAY_ENTRY, ' NONE\r')).read(SPIRITUALITY)).toBe(0x53);
  });

  it('speaks with no one while the leader is dead', async (): Promise<void> => {
    const machine: LiftedMachine = seer(false);

    machine.write(ROST.player_stats + ROST.player_status, ROST.status_Dead);

    expect((await runOverlay(machine, OVERLAY_ENTRY)).read(SPIRITUALITY)).toBe(0x50);
  });
});
