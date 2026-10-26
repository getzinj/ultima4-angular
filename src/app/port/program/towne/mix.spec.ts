import type { LiftedMachine } from '../../../lifted-runtime/lifted-machine';
import { PRTY, ROST, ZP_MAIN } from '../../../state/symbols';
import { overlayMachine, runOverlay } from '../../testing/overlay-machine';
import { OVERLAY_ENTRY } from '../overlay';
import { MIX_MODULE } from './mix';

const GINSENG: number = ROST.reagents + 1;
const GARLIC: number = ROST.reagents + 2;


/** Three ginseng, four garlic, no other reagent and no mixtures. */
function mixing(): LiftedMachine {
  const machine: LiftedMachine = overlayMachine(MIX_MODULE);

  machine.write(PRTY.game_mode, PRTY.mode_towne);
  machine.write(ZP_MAIN.sfx_volume, 0x00);
  for (let reagent: number = 0; reagent < ROST.reagent_max; reagent++) {
    machine.write(ROST.reagents + reagent, 0x00);
  }
  for (let spell: number = 0; spell < ROST.spells_max; spell++) {
    machine.write(ROST.mixtures + spell, 0x00);
  }
  machine.write(GINSENG, 0x03);
  machine.write(GARLIC, 0x04);

  return machine;
}


describe('MIX, ported', (): void => {
  describe('awaken mixed from ginseng and garlic', (): void => {
    it('makes a mixture', async (): Promise<void> => {
      expect((await runOverlay(mixing(), OVERLAY_ENTRY, 'ABC\r1')).read(ROST.mixtures)).toBe(0x01);
    });

    it('spends a ginseng', async (): Promise<void> => {
      expect((await runOverlay(mixing(), OVERLAY_ENTRY, 'ABC\r1')).read(GINSENG)).toBe(0x02);
    });
  });

  describe('awaken mixed from ginseng alone', (): void => {
    it('fizzles', async (): Promise<void> => {
      expect((await runOverlay(mixing(), OVERLAY_ENTRY, 'AB\r1')).read(ROST.mixtures)).toBe(0x00);
    });

    it('spends the ginseng all the same', async (): Promise<void> => {
      expect((await runOverlay(mixing(), OVERLAY_ENTRY, 'AB\r1')).read(GINSENG)).toBe(0x02);
    });
  });

  it('spends no reagent the party does not own', async (): Promise<void> => {
    expect((await runOverlay(mixing(), OVERLAY_ENTRY, 'AH\r1')).read(ROST.reagents + 7)).toBe(0x00);
  });
});
