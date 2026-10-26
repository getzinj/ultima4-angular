import type { LiftedMachine } from '../../../lifted-runtime/lifted-machine';
import { PRTY, ROST, ZP_MAIN } from '../../../state/symbols';
import { overlayMachine, runOverlay } from '../../testing/overlay-machine';
import { OVERLAY_ENTRY } from '../overlay';
import { SHP7_MODULE } from './shp7';

const GOLD_HI: number = ROST.party_stats + ROST.party_stat_gold_hi;
const GOLD_LO: number = ROST.party_stats + ROST.party_stat_gold_lo;
const TORCHES: number = ROST.party_stats + ROST.party_stat_torches;
const SEXTANT: number = ROST.party_stats + ROST.party_stat_sextant;


/** Buccaneer's Den's guild, with `gold` in BCD, two torches and no sextant. */
function guild(gold: number): LiftedMachine {
  const machine: LiftedMachine = overlayMachine(SHP7_MODULE);

  machine.write(PRTY.game_mode, PRTY.mode_towne);
  machine.write(PRTY.current_location, 0x0E);
  machine.write(ZP_MAIN.sfx_volume, 0x00);
  machine.write(GOLD_HI, gold >> 8);
  machine.write(GOLD_LO, gold & 0xFF);
  machine.write(TORCHES, 0x02);
  machine.write(SEXTANT, 0x00);

  return machine;
}


describe('SHP7, the guild, ported', (): void => {
  describe('torches bought', (): void => {
    it('are five more', async (): Promise<void> => {
      expect((await runOverlay(guild(0x0100), OVERLAY_ENTRY, 'YAYN')).read(TORCHES)).toBe(0x07);
    });

    it('cost fifty', async (): Promise<void> => {
      expect((await runOverlay(guild(0x0100), OVERLAY_ENTRY, 'YAYN')).read(GOLD_LO)).toBe(0x50);
    });
  });

  it('sells the sextant the menu does not mention', async (): Promise<void> => {
    expect((await runOverlay(guild(0x1000), OVERLAY_ENTRY, 'YDYN')).read(SEXTANT)).toBe(0x01);
  });

  it('gives back the gold of a ware it cannot sell', async (): Promise<void> => {
    expect((await runOverlay(guild(0x0010), OVERLAY_ENTRY, 'YAY')).read(GOLD_LO)).toBe(0x10);
  });

  it('sells nothing when the goods are not wanted', async (): Promise<void> => {
    expect((await runOverlay(guild(0x0100), OVERLAY_ENTRY, 'N')).read(GOLD_HI)).toBe(0x01);
  });
});
