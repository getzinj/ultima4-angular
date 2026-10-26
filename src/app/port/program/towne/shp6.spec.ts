import type { LiftedMachine } from '../../../lifted-runtime/lifted-machine';
import { PRTY, ROST, TILES, ZP_MAIN } from '../../../state/symbols';
import { overlayMachine, runOverlay } from '../../testing/overlay-machine';
import { OVERLAY_ENTRY } from '../overlay';
import { SHP6_MODULE } from './shp6';

const GOLD_LO: number = ROST.party_stats + ROST.party_stat_gold_lo;
const SECOND: number = ROST.player_stats + 0x20;


/** An inn, its room at 20 gold in Moonglow, with 100 gold, on foot, the leader dead (so no rogue comes) and a mage asleep. */
function inn(location: number = 0x05): LiftedMachine {
  const machine: LiftedMachine = overlayMachine(SHP6_MODULE);

  machine.write(PRTY.game_mode, PRTY.mode_towne);
  machine.write(PRTY.current_location, location);
  machine.write(PRTY.player_transport, TILES.tile_walk);
  machine.write(PRTY.party_size, 0x02);
  machine.write(ZP_MAIN.sfx_volume, 0x00);
  machine.write(ROST.party_stats + ROST.party_stat_gold_hi, 0x01);
  machine.write(GOLD_LO, 0x00);
  machine.write(ROST.player_stats + ROST.player_status, ROST.status_Dead);
  machine.write(SECOND + ROST.player_status, ROST.status_Sleep);
  machine.write(SECOND + ROST.player_class_index, 0x00);
  machine.write(SECOND + ROST.player_intelligence, 0x20);
  machine.write(SECOND + ROST.player_magic_points, 0x00);

  return machine;
}


describe('SHP6, the inn, ported', (): void => {
  describe('a night taken', (): void => {
    it('takes the room\'s price', async (): Promise<void> => {
      expect((await runOverlay(inn(), OVERLAY_ENTRY, 'YY')).read(GOLD_LO)).toBe(0x80);
    });

    it('puts the party in the bed', async (): Promise<void> => {
      expect((await runOverlay(inn(), OVERLAY_ENTRY, 'YY')).read(PRTY.player_xpos)).toBe(0x1C);
    });

    it('wakes a sleeper', async (): Promise<void> => {
      expect((await runOverlay(inn(), OVERLAY_ENTRY, 'YY')).read(SECOND + ROST.player_status)).toBe(ROST.status_Good);
    });

    it('restores a mage\'s magic to twice the intelligence', async (): Promise<void> => {
      expect((await runOverlay(inn(), OVERLAY_ENTRY, 'YY')).read(SECOND + ROST.player_magic_points)).toBe(0x40);
    });

    it('stands the party up again', async (): Promise<void> => {
      expect((await runOverlay(inn(), OVERLAY_ENTRY, 'YY')).read(PRTY.player_transport)).toBe(TILES.tile_walk);
    });
  });

  describe('Minoc\'s room of two beds', (): void => {
    it('costs sixty', async (): Promise<void> => {
      expect((await runOverlay(inn(0x09), OVERLAY_ENTRY, 'Y2')).read(GOLD_LO)).toBe(0x40);
    });

    it('is the inn\'s bed from then on', async (): Promise<void> => {
      expect((await runOverlay(inn(0x09), OVERLAY_ENTRY, 'Y2')).read(PRTY.player_ypos)).toBe(0x02);
    });
  });

  it('turns away a party on a horse', async (): Promise<void> => {
    const machine: LiftedMachine = inn();

    machine.write(PRTY.player_transport, TILES.tile_horse_west);

    expect((await runOverlay(machine, OVERLAY_ENTRY)).read(GOLD_LO)).toBe(0x00);
  });

  it('takes nothing when the room is turned down', async (): Promise<void> => {
    expect((await runOverlay(inn(), OVERLAY_ENTRY, 'YN')).read(GOLD_LO)).toBe(0x00);
  });

  it('keeps out a party that cannot pay', async (): Promise<void> => {
    const machine: LiftedMachine = inn();

    machine.write(ROST.party_stats + ROST.party_stat_gold_hi, 0x00);
    machine.write(GOLD_LO, 0x10);

    expect((await runOverlay(machine, OVERLAY_ENTRY, 'YY')).read(GOLD_LO)).toBe(0x10);
  });
});
