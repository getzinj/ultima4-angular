import type { LiftedMachine } from '../../../lifted-runtime/lifted-machine';
import { PRTY, ROST, TILES, ZP_MAIN } from '../../../state/symbols';
import { overlayMachine, runOverlay } from '../../testing/overlay-machine';
import { OVERLAY_ENTRY } from '../overlay';
import { SHP8_MODULE } from './shp8';

const GOLD_HI: number = ROST.party_stats + ROST.party_stat_gold_hi;


/** Paws's horse seller, with two in the party on foot and `hundreds` of gold. */
function stable(hundreds: number): LiftedMachine {
  const machine: LiftedMachine = overlayMachine(SHP8_MODULE);

  machine.write(PRTY.game_mode, PRTY.mode_towne);
  machine.write(PRTY.current_location, 0x0D);
  machine.write(PRTY.party_size, 0x02);
  machine.write(PRTY.player_transport, TILES.tile_walk);
  machine.write(ZP_MAIN.sfx_volume, 0x00);
  machine.write(GOLD_HI, hundreds);

  return machine;
}


describe('SHP8, the horse seller, ported', (): void => {
  describe('a horse bought', (): void => {
    it('costs a hundred a member', async (): Promise<void> => {
      expect((await runOverlay(stable(0x03), OVERLAY_ENTRY, 'YY')).read(GOLD_HI)).toBe(0x01);
    });

    it('is ridden away', async (): Promise<void> => {
      expect((await runOverlay(stable(0x03), OVERLAY_ENTRY, 'YY')).read(PRTY.player_transport)).toBe(TILES.tile_horse_west);
    });
  });

  it('sells no horse to a party that cannot pay', async (): Promise<void> => {
    expect((await runOverlay(stable(0x01), OVERLAY_ENTRY, 'YY')).read(PRTY.player_transport)).toBe(TILES.tile_walk);
  });

  it('sells no horse when the price is refused', async (): Promise<void> => {
    expect((await runOverlay(stable(0x03), OVERLAY_ENTRY, 'YN')).read(GOLD_HI)).toBe(0x03);
  });
});
