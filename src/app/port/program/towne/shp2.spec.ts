import type { LiftedMachine } from '../../../lifted-runtime/lifted-machine';
import { PRTY, ROST, ZP_MAIN } from '../../../state/symbols';
import { overlayMachine, runOverlay } from '../../testing/overlay-machine';
import { OVERLAY_ENTRY } from '../overlay';
import { SHP2_MODULE } from './shp2';

const GOLD_HI: number = ROST.party_stats + ROST.party_stat_gold_hi;
const GOLD_LO: number = ROST.party_stats + ROST.party_stat_gold_lo;
const FOOD_LO: number = ROST.party_stats + ROST.party_stat_food_lo;


/** Moonglow's deli, its packs at 25 gold, with `gold` in BCD and no food. */
function deli(gold: number): LiftedMachine {
  const machine: LiftedMachine = overlayMachine(SHP2_MODULE);

  machine.write(PRTY.game_mode, PRTY.mode_towne);
  machine.write(PRTY.current_location, 0x05);
  machine.write(ZP_MAIN.sfx_volume, 0x00);
  machine.write(GOLD_HI, gold >> 8);
  machine.write(GOLD_LO, gold & 0xFF);
  machine.write(ROST.party_stats + ROST.party_stat_food_hi, 0x00);
  machine.write(FOOD_LO, 0x00);

  return machine;
}


describe('SHP2, the food shop, ported', (): void => {
  describe('two packs bought', (): void => {
    it('takes their price from the gold', async (): Promise<void> => {
      expect((await runOverlay(deli(0x0100), OVERLAY_ENTRY, 'Y2\rN')).read(GOLD_LO)).toBe(0x50);
    });

    it('adds 25 rations for each', async (): Promise<void> => {
      expect((await runOverlay(deli(0x0100), OVERLAY_ENTRY, 'Y2\rN')).read(FOOD_LO)).toBe(0x50);
    });
  });

  it('takes no gold when no packs are asked for', async (): Promise<void> => {
    expect((await runOverlay(deli(0x0100), OVERLAY_ENTRY, 'Y0\r')).read(GOLD_HI)).toBe(0x01);
  });

  it('gives back the price of a pack it cannot sell', async (): Promise<void> => {
    expect((await runOverlay(deli(0x0010), OVERLAY_ENTRY, 'Y1\r')).read(GOLD_LO)).toBe(0x10);
  });

  it('sells nothing when turned down', async (): Promise<void> => {
    expect((await runOverlay(deli(0x0100), OVERLAY_ENTRY, 'N')).read(FOOD_LO)).toBe(0x00);
  });
});
