import type { LiftedMachine } from '../../../lifted-runtime/lifted-machine';
import { DUNGEON, PRTY, ROST, ZP_MAIN } from '../../../state/symbols';
import { DNGD_STILL } from '../../testing/dngd-still';
import { overlayMachine, runOverlay } from '../../testing/overlay-machine';
import { OVERLAY_ENTRY } from '../overlay';
import { UNDERWORLD_SEAR_MODULE } from './sear';

const D = DUNGEON;
const LEADER: number = ROST.player_stats;
const DUNGEON_MAP: number = 0xE800;


/** On `tile` at (2, 2) of Deceit's first level, the leader good with 500 of 800 hit points, no stones held. */
function onTile(tile: number): LiftedMachine {
  const machine: LiftedMachine = overlayMachine(UNDERWORLD_SEAR_MODULE, [ DNGD_STILL ]);

  machine.bload('underworld', 'DNGD');
  machine.write(PRTY.game_mode, PRTY.mode_dungeon);
  machine.write(PRTY.current_location, PRTY.loc_dng_first);
  machine.write(PRTY.dungeon_level, 0x00);
  machine.write(PRTY.player_xpos, 0x02);
  machine.write(PRTY.player_ypos, 0x02);
  machine.write(PRTY.party_size, 0x01);
  machine.write(ZP_MAIN.sfx_volume, 0x00);
  machine.write(ZP_MAIN.tile_under_player, tile);
  machine.write(DUNGEON_MAP + (0x02 * 0x08) + 0x02, tile);
  machine.write(LEADER + ROST.player_status, ROST.status_Good);
  machine.write(LEADER + ROST.player_cur_hp_hi, 0x05);
  machine.write(LEADER + ROST.player_max_hp_hi, 0x08);
  machine.write(LEADER + ROST.player_intelligence, 0x20);
  machine.write(ROST.stones, 0x00);
  machine.write(ROST.party_stats + ROST.virtue_honor, 0x50);

  return machine;
}


describe('the underworld SEAR, ported', (): void => {
  it('heals at a fountain that heals', async (): Promise<void> => {
    expect((await runOverlay(onTile(D.dng_tile_fountain | D.fountain_heal), OVERLAY_ENTRY, '1')).read(LEADER + ROST.player_cur_hp_hi)).toBe(0x08);
  });

  it('hurts at a fountain that harms', async (): Promise<void> => {
    expect((await runOverlay(onTile(D.dng_tile_fountain | D.fountain_harm), OVERLAY_ENTRY, '1')).read(LEADER + ROST.player_cur_hp_hi)).toBe(0x04);
  });

  it('poisons at a fountain that poisons', async (): Promise<void> => {
    expect((await runOverlay(onTile(D.dng_tile_fountain | D.fountain_poison), OVERLAY_ENTRY, '1')).read(LEADER + ROST.player_status)).toBe(ROST.status_Poison);
  });

  describe('Deceit\'s orb', (): void => {
    it('raises intelligence by five', async (): Promise<void> => {
      expect((await runOverlay(onTile(D.dng_tile_orb), OVERLAY_ENTRY, '1')).read(LEADER + ROST.player_intelligence)).toBe(0x25);
    });

    it('costs two hundred hit points', async (): Promise<void> => {
      expect((await runOverlay(onTile(D.dng_tile_orb), OVERLAY_ENTRY, '1')).read(LEADER + ROST.player_cur_hp_hi)).toBe(0x03);
    });

    it('is gone once touched', async (): Promise<void> => {
      expect((await runOverlay(onTile(D.dng_tile_orb), OVERLAY_ENTRY, '1')).read(DUNGEON_MAP + 0x12)).toBe(0x00);
    });
  });

  describe('Deceit\'s altar', (): void => {
    it('holds the blue stone', async (): Promise<void> => {
      expect((await runOverlay(onTile(D.dng_tile_altar), OVERLAY_ENTRY)).read(ROST.stones)).toBe(0x80);
    });

    it('raises honour by five', async (): Promise<void> => {
      expect((await runOverlay(onTile(D.dng_tile_altar), OVERLAY_ENTRY)).read(ROST.party_stats + ROST.virtue_honor)).toBe(0x55);
    });
  });

  it('finds no stone at Hythloth\'s altar', async (): Promise<void> => {
    const machine: LiftedMachine = onTile(D.dng_tile_altar);

    machine.write(PRTY.current_location, PRTY.loc_dng_first + PRTY.dng_hythloth);

    expect((await runOverlay(machine, OVERLAY_ENTRY)).read(ROST.stones)).toBe(0x00);
  });
});
