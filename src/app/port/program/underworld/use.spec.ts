import type { LiftedMachine } from '../../../lifted-runtime/lifted-machine';
import { DUNGEON, MAP_OBJECTS, PRTY, ROST, TILES, ZP_MAIN } from '../../../state/symbols';
import { overlayMachine, runOverlay } from '../../testing/overlay-machine';
import { OVERLAY_ENTRY } from '../overlay';
import { UNDERWORLD_USE_MODULE } from './use';

const O = MAP_OBJECTS;
const DUNGEON_MAP: number = 0xE800;
const MONSTER: number = 0x03;
const RETURN: string = '\r';


/** At (2, 2) on level `level` of dungeon `location`, a monster on the level, every virtue at 50, all the stones and the skull held. */
function below(location: number = PRTY.loc_dng_first, level: number = 0x00): LiftedMachine {
  const machine: LiftedMachine = overlayMachine(UNDERWORLD_USE_MODULE);

  machine.write(PRTY.game_mode, PRTY.mode_dungeon);
  machine.write(PRTY.current_location, location);
  machine.write(PRTY.dungeon_level, level);
  machine.write(PRTY.player_xpos, 0x02);
  machine.write(PRTY.player_ypos, 0x02);
  machine.write(ZP_MAIN.sfx_volume, 0x00);
  for (let index: number = 0; index < 0x200; index++) {
    machine.write(DUNGEON_MAP + index, 0x00);
  }
  for (let slot: number = 0; slot <= O.object_max; slot++) {
    machine.write(O.object_tile_type + slot, 0x00);
  }
  machine.write(O.object_tile_type + MONSTER, TILES.tile_monster_dungeon);
  machine.write(O.object_dng_level + MONSTER, level);
  for (let virtue: number = 0; virtue < ROST.virtue_last; virtue++) {
    machine.write(ROST.party_stats + virtue, 0x50);
  }
  machine.write(ROST.stones, 0xFF);
  machine.write(ROST.skull, 0x01);
  machine.write(ROST.threepartkey, 0x00);

  return machine;
}


/** In the fight in truth's altar room, the leader on its centre. */
function inTruthsAltarRoom(): LiftedMachine {
  const machine: LiftedMachine = below();

  machine.write(PRTY.game_mode, PRTY.mode_combat_dng_room);
  machine.write(PRTY.altar_room_principle, PRTY.principle_truth);
  machine.write(ZP_MAIN.curr_player, 0x01);
  machine.write(O.combat_player_xpos, 0x05);
  machine.write(O.combat_player_ypos, 0x05);

  return machine;
}


describe('the underworld USE, ported', (): void => {
  describe('the skull', (): void => {
    it('destroys the level\'s monsters', async (): Promise<void> => {
      expect((await runOverlay(below(), OVERLAY_ENTRY, `SKULL${ RETURN }`)).read(O.object_tile_type + MONSTER)).toBe(0x00);
    });

    it('costs five points of each virtue', async (): Promise<void> => {
      expect((await runOverlay(below(), OVERLAY_ENTRY, `SKULL${ RETURN }`)).read(ROST.party_stats + ROST.virtue_honor)).toBe(0x45);
    });

    it('does nothing in the Abyss', async (): Promise<void> => {
      expect((await runOverlay(below(0x18), OVERLAY_ENTRY, `SKULL${ RETURN }`)).read(O.object_tile_type + MONSTER)).toBe(TILES.tile_monster_dungeon);
    });
  });

  it('gives the game back to the dungeon once done', async (): Promise<void> => {
    expect((await runOverlay(below(), OVERLAY_ENTRY, `BELL${ RETURN }`)).read(PRTY.game_mode)).toBe(PRTY.mode_dungeon);
  });

  describe('the stones on an altar room\'s centre', (): void => {
    it('give truth\'s part of the key for its four colours', async (): Promise<void> => {
      expect((await runOverlay(inTruthsAltarRoom(), OVERLAY_ENTRY, `STONE${ RETURN }BLUE${ RETURN }GREEN${ RETURN }PURPLE${ RETURN }WHITE${ RETURN }`)).read(ROST.threepartkey))
        .toBe(0x04);
    });

    it('give nothing for the wrong colours', async (): Promise<void> => {
      expect((await runOverlay(inTruthsAltarRoom(), OVERLAY_ENTRY, `STONE${ RETURN }RED${ RETURN }GREEN${ RETURN }PURPLE${ RETURN }WHITE${ RETURN }`)).read(ROST.threepartkey))
        .toBe(0x00);
    });
  });

  describe('the Abyss\'s first altar', (): void => {
    function atFirstAltar(): LiftedMachine {
      const machine: LiftedMachine = below(0x18);

      machine.write(ZP_MAIN.tile_under_player, DUNGEON.dng_tile_altar);

      return machine;
    }

    it('opens the way down for honesty and the blue stone', async (): Promise<void> => {
      expect((await runOverlay(atFirstAltar(), OVERLAY_ENTRY, `STONE${ RETURN }HONESTY${ RETURN }BLUE${ RETURN }`)).read(DUNGEON_MAP + 0x12)).toBe(DUNGEON.dng_tile_ladder_d);
    });

    it('stays shut for the wrong virtue', async (): Promise<void> => {
      expect((await runOverlay(atFirstAltar(), OVERLAY_ENTRY, `STONE${ RETURN }VALOR${ RETURN }`)).read(DUNGEON_MAP + 0x12)).toBe(0x00);
    });
  });
});
