import type { LiftedMachine } from '../../../lifted-runtime/lifted-machine';
import { PRTY, ROST, ZP_MAIN } from '../../../state/symbols';
import { overlayMachine, runOverlay } from '../../testing/overlay-machine';
import { OVERLAY_ENTRY } from '../overlay';
import { SHP3_MODULE } from './shp3';

const GOLD_LO: number = ROST.party_stats + ROST.party_stat_gold_lo;
const FOOD_LO: number = ROST.party_stats + ROST.party_stat_food_lo;


/** Britain's pub, its lamb chops at 4 gold and the black stone's rumour at 20, with 100 gold and no food. */
function pub(): LiftedMachine {
  const machine: LiftedMachine = overlayMachine(SHP3_MODULE);

  machine.write(PRTY.game_mode, PRTY.mode_towne);
  machine.write(PRTY.current_location, 0x06);
  machine.write(ZP_MAIN.sfx_volume, 0x00);
  machine.write(ROST.party_stats + ROST.party_stat_gold_hi, 0x01);
  machine.write(GOLD_LO, 0x00);
  machine.write(ROST.party_stats + ROST.party_stat_food_hi, 0x00);
  machine.write(FOOD_LO, 0x00);

  return machine;
}


describe('SHP3, the pub, ported', (): void => {
  describe('two plates of food', (): void => {
    it('take their price from the gold', async (): Promise<void> => {
      expect((await runOverlay(pub(), OVERLAY_ENTRY, 'F2\rN')).read(GOLD_LO)).toBe(0x92);
    });

    it('are a ration each', async (): Promise<void> => {
      expect((await runOverlay(pub(), OVERLAY_ENTRY, 'F2\rN')).read(FOOD_LO)).toBe(0x02);
    });
  });

  it('takes the ale and the bribe that buys the black stone\'s rumour', async (): Promise<void> => {
    expect((await runOverlay(pub(), OVERLAY_ENTRY, 'A5\rBLACK STONE\r20\rN')).read(GOLD_LO)).toBe(0x75);
  });

  it('takes only the ale when the rumour is asked of the wrong pub', async (): Promise<void> => {
    expect((await runOverlay(pub(), OVERLAY_ENTRY, 'A5\rSEXTANT\rN')).read(GOLD_LO)).toBe(0x95);
  });

  it('takes nothing for an ale not paid for, and sees the party out', async (): Promise<void> => {
    expect((await runOverlay(pub(), OVERLAY_ENTRY, 'A1\r')).read(GOLD_LO)).toBe(0x00);
  });
});
