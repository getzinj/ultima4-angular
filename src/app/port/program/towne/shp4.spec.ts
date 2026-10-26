import type { LiftedMachine } from '../../../lifted-runtime/lifted-machine';
import { PRTY, ROST, ZP_MAIN } from '../../../state/symbols';
import { overlayMachine, runOverlay } from '../../testing/overlay-machine';
import { OVERLAY_ENTRY } from '../overlay';
import { SHP4_MODULE } from './shp4';

const GOLD_LO: number = ROST.party_stats + ROST.party_stat_gold_lo;
const HONESTY: number = ROST.party_stats + ROST.virtue_honesty;


/** Moonglow's herbalist, her ash at 2 gold, with 100 gold, no reagents and every virtue at 50. */
function herbs(): LiftedMachine {
  const machine: LiftedMachine = overlayMachine(SHP4_MODULE);

  machine.write(PRTY.game_mode, PRTY.mode_towne);
  machine.write(PRTY.current_location, 0x05);
  machine.write(ZP_MAIN.sfx_volume, 0x00);
  machine.write(ROST.party_stats + ROST.party_stat_gold_hi, 0x01);
  machine.write(GOLD_LO, 0x00);
  for (let virtue: number = 0; virtue < ROST.virtue_last; virtue++) {
    machine.write(ROST.party_stats + virtue, 0x50);
  }
  for (let reagent: number = 0; reagent < ROST.reagent_max; reagent++) {
    machine.write(ROST.reagents + reagent, 0x00);
  }

  return machine;
}


describe('SHP4, the reagent shop, ported', (): void => {
  describe('five ash paid for in full', (): void => {
    it('adds them to the reagents', async (): Promise<void> => {
      expect((await runOverlay(herbs(), OVERLAY_ENTRY, 'YA510\rN')).read(ROST.reagents)).toBe(0x05);
    });

    it('takes what was paid', async (): Promise<void> => {
      expect((await runOverlay(herbs(), OVERLAY_ENTRY, 'YA510\rN')).read(GOLD_LO)).toBe(0x90);
    });

    it('raises honesty by two', async (): Promise<void> => {
      expect((await runOverlay(herbs(), OVERLAY_ENTRY, 'YA510\rN')).read(HONESTY)).toBe(0x52);
    });
  });

  describe('five ash paid for short', (): void => {
    it('takes only what was paid', async (): Promise<void> => {
      expect((await runOverlay(herbs(), OVERLAY_ENTRY, 'YA55\rN')).read(GOLD_LO)).toBe(0x95);
    });

    it('costs four honesty before the two it gives', async (): Promise<void> => {
      expect((await runOverlay(herbs(), OVERLAY_ENTRY, 'YA55\rN')).read(HONESTY)).toBe(0x48);
    });
  });

  it('sells nothing when asked for none', async (): Promise<void> => {
    expect((await runOverlay(herbs(), OVERLAY_ENTRY, 'YA0N')).read(GOLD_LO)).toBe(0x00);
  });

  it('sells nothing when turned down', async (): Promise<void> => {
    expect((await runOverlay(herbs(), OVERLAY_ENTRY, 'N')).read(ROST.reagents)).toBe(0x00);
  });
});
