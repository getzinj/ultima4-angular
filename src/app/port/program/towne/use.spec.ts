import type { LiftedMachine } from '../../../lifted-runtime/lifted-machine';
import { MAP_OBJECTS, PRTY, ROST, TILES, ZP_MAIN } from '../../../state/symbols';
import { overlayMachine, runOverlay } from '../../testing/overlay-machine';
import { OVERLAY_ENTRY } from '../overlay';
import { TOWNE_USE_MODULE } from './use';

const O = MAP_OBJECTS;
const RETURN: string = '\r';


function useMachine(): LiftedMachine {
  const machine: LiftedMachine = overlayMachine(TOWNE_USE_MODULE);

  machine.write(PRTY.game_mode, PRTY.mode_towne);
  machine.write(ZP_MAIN.sfx_volume, 0x00);

  return machine;
}


function use(machine: LiftedMachine, word: string): Promise<LiftedMachine> {
  return runOverlay(machine, OVERLAY_ENTRY, `${ word }${ RETURN }`);
}


/** The skull held, a guard in slot 3 and Lord British in slot 4, every virtue at 50. */
function withSkull(): LiftedMachine {
  const machine: LiftedMachine = useMachine();

  machine.write(ROST.skull, 0x01);
  machine.write(O.object_tile_type + 3, TILES.tile_guard);
  machine.write(O.npc_dialogue + 3, 0x05);
  machine.write(O.object_tile_type + 4, TILES.tile_lord_british);
  for (let virtue: number = 0; virtue < ROST.virtue_last; virtue++) {
    machine.write(ROST.party_stats + virtue, 0x50);
  }

  return machine;
}


describe('the towne USE, ported', (): void => {
  describe('the horn', (): void => {
    it('raises no aura in a towne', async (): Promise<void> => {
      const machine: LiftedMachine = useMachine();

      machine.write(ROST.horn, 0x01);
      machine.write(ZP_MAIN.aura_duration, 0x00);

      expect((await use(machine, 'HORN')).read(ZP_MAIN.aura_duration)).toBe(0x00);
    });
  });

  describe('the bell', (): void => {
    it('is not rung in a towne', async (): Promise<void> => {
      const machine: LiftedMachine = useMachine();

      machine.write(ROST.bell_book_candle, ROST.item_have_bell);

      expect((await use(machine, 'BELL')).read(ROST.bell_book_candle)).toBe(ROST.item_have_bell);
    });
  });

  describe('the skull', (): void => {
    it('destroys the townsfolk', async (): Promise<void> => {
      expect((await use(withSkull(), 'SKULL')).read(O.object_tile_type + 3)).toBe(0x00);
    });

    it('silences them', async (): Promise<void> => {
      expect((await use(withSkull(), 'SKULL')).read(O.npc_dialogue + 3)).toBe(0x00);
    });

    it('spares Lord British', async (): Promise<void> => {
      expect((await use(withSkull(), 'SKULL')).read(O.object_tile_type + 4)).toBe(TILES.tile_lord_british);
    });

    it('marks Lord British as spared', async (): Promise<void> => {
      expect((await use(withSkull(), 'SKULL')).read(O.object_dng_level + 4)).toBe(0xFF);
    });

    it('costs five points of each virtue', async (): Promise<void> => {
      expect((await use(withSkull(), 'SKULL')).read(ROST.party_stats + ROST.virtue_honor)).toBe(0x45);
    });

    it('does nothing unowned', async (): Promise<void> => {
      const machine: LiftedMachine = withSkull();

      machine.write(ROST.skull, 0x00);

      expect((await use(machine, 'SKULL')).read(O.object_tile_type + 3)).toBe(TILES.tile_guard);
    });
  });
});
