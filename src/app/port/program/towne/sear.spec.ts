import type { LiftedMachine } from '../../../lifted-runtime/lifted-machine';
import { PRTY, ROST } from '../../../state/symbols';
import { overlayMachine, runOverlay } from '../../testing/overlay-machine';
import { OVERLAY_ENTRY } from '../overlay';
import { TOWNE_SEAR_MODULE } from './sear';

const MOONGLOW: number = 0x05;
const LYCAEUM: number = 0x02;
const EMPATH_ABBEY: number = 0x03;


function at(location: number, x: number, y: number): LiftedMachine {
  const machine: LiftedMachine = overlayMachine(TOWNE_SEAR_MODULE);

  machine.write(PRTY.game_mode, PRTY.mode_towne);
  machine.write(PRTY.current_location, location);
  machine.write(PRTY.player_xpos, x);
  machine.write(PRTY.player_ypos, y);
  machine.write(ROST.runes, 0x00);
  machine.write(ROST.bell_book_candle, 0x00);
  machine.write(ROST.armour_mystic, 0x00);
  machine.write(ROST.player_stats + ROST.player_experience_hi, 0x00);
  for (let virtue: number = 0; virtue < ROST.virtue_last; virtue++) {
    machine.write(ROST.party_stats + virtue, 0x50);
  }

  return machine;
}


function search(machine: LiftedMachine): Promise<LiftedMachine> {
  return runOverlay(machine, OVERLAY_ENTRY);
}


describe('the towne SEAR, ported', (): void => {
  describe('the rune of honesty, in Moonglow', (): void => {
    it('is found at its spot', async (): Promise<void> => {
      expect((await search(at(MOONGLOW, 0x08, 0x06))).read(ROST.runes)).toBe(0x80);
    });

    it('is worth a hundred experience', async (): Promise<void> => {
      expect((await search(at(MOONGLOW, 0x08, 0x06))).read(ROST.player_stats + ROST.player_experience_hi)).toBe(0x01);
    });

    it('is worth five honour', async (): Promise<void> => {
      expect((await search(at(MOONGLOW, 0x08, 0x06))).read(ROST.party_stats + ROST.virtue_honor)).toBe(0x55);
    });

    it('is not at its spot in another towne', async (): Promise<void> => {
      expect((await search(at(MOONGLOW + 1, 0x08, 0x06))).read(ROST.runes)).toBe(0x00);
    });
  });

  describe('the book of truth, in the Lycaeum', (): void => {
    it('is found at its spot', async (): Promise<void> => {
      expect((await search(at(LYCAEUM, 0x06, 0x06))).read(ROST.bell_book_candle)).toBe(ROST.item_have_book);
    });

    it('is worth four hundred experience', async (): Promise<void> => {
      expect((await search(at(LYCAEUM, 0x06, 0x06))).read(ROST.player_stats + ROST.player_experience_hi)).toBe(0x04);
    });
  });

  describe('the mystic armour, in Empath Abbey', (): void => {
    it('is not found by one short of Avatarhood', async (): Promise<void> => {
      expect((await search(at(EMPATH_ABBEY, 0x16, 0x04))).read(ROST.armour_mystic)).toBe(0x00);
    });

    it('is found by an Avatar', async (): Promise<void> => {
      const machine: LiftedMachine = at(EMPATH_ABBEY, 0x16, 0x04);

      for (let virtue: number = 0; virtue < ROST.virtue_last; virtue++) {
        machine.write(ROST.party_stats + virtue, 0x00);
      }

      expect((await search(machine)).read(ROST.armour_mystic)).toBe(0x08);
    });
  });
});
