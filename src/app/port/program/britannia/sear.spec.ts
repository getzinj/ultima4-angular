import type { LiftedMachine } from '../../../lifted-runtime/lifted-machine';
import { PRTY, ROST } from '../../../state/symbols';
import { overlayMachine, runOverlay } from '../../testing/overlay-machine';
import { OVERLAY_ENTRY } from './overlay';
import { SEAR_MODULE } from './sear';

const HORN: readonly [ number, number ] = [ 0x2D, 0xAD ];
const BLACK_STONE: readonly [ number, number ] = [ 0xE0, 0x85 ];
const MANDRAKE: readonly [ number, number ] = [ 0xB6, 0x36 ];
const PLAYER_1: number = ROST.player_stats;


function at([ x, y ]: readonly [ number, number ]): LiftedMachine {
  const machine: LiftedMachine = overlayMachine(SEAR_MODULE);

  machine.write(PRTY.player_xpos, x);
  machine.write(PRTY.player_ypos, y);
  machine.write(ROST.party_stats + ROST.virtue_honor, 0x40);
  machine.write(PLAYER_1 + ROST.player_experience_hi, 0x12);

  return machine;
}


function underMoons(machine: LiftedMachine, trammel: number, felucca: number): LiftedMachine {
  machine.write(PRTY.moon_phase_trammel, trammel);
  machine.write(PRTY.moon_phase_felucca, felucca);

  return machine;
}


function search(machine: LiftedMachine): Promise<LiftedMachine> {
  return runOverlay(machine, OVERLAY_ENTRY);
}


describe('SEAR, ported', (): void => {
  describe('at the silver horn\'s spot', (): void => {
    it('finds the horn', async (): Promise<void> => {
      expect((await search(at(HORN))).read(ROST.horn)).toBe(0x01);
    });

    it('raises honour by five, in BCD', async (): Promise<void> => {
      expect((await search(at(HORN))).read(ROST.party_stats + ROST.virtue_honor)).toBe(0x45);
    });

    it('gives the first player four hundred experience, in BCD', async (): Promise<void> => {
      expect((await search(at(HORN))).read(PLAYER_1 + ROST.player_experience_hi)).toBe(0x16);
    });

    it('finds nothing more once the horn is held', async (): Promise<void> => {
      const machine: LiftedMachine = at(HORN);

      machine.write(ROST.horn, 0x01);

      expect((await search(machine)).read(ROST.party_stats + ROST.virtue_honor)).toBe(0x40);
    });
  });

  it('finds nothing a step away from the horn', async (): Promise<void> => {
    expect((await search(at([ HORN[0] + 1, HORN[1] ]))).read(ROST.horn)).toBe(0x00);
  });

  it('leaves no honour to raise at zero', async (): Promise<void> => {
    const machine: LiftedMachine = at(HORN);

    machine.write(ROST.party_stats + ROST.virtue_honor, 0x00);

    expect((await search(machine)).read(ROST.party_stats + ROST.virtue_honor)).toBe(0x00);
  });

  describe('the black stone', (): void => {
    it('is found when both moons are dark', async (): Promise<void> => {
      expect((await search(underMoons(at(BLACK_STONE), 0, 0))).read(ROST.stones)).toBe(ROST.stone_black);
    });

    it('is not found under a moon', async (): Promise<void> => {
      expect((await search(underMoons(at(BLACK_STONE), 0, 3))).read(ROST.stones)).toBe(0x00);
    });
  });

  describe('mandrake root', (): void => {
    function inTheDark(): LiftedMachine {
      const machine: LiftedMachine = underMoons(at(MANDRAKE), 0, 0);

      machine.write(PRTY.move_counter + 3, 0x37);
      machine.write(PRTY.last_found_reagent, 0x00);

      return machine;
    }

    it('notes the moves it was found at', async (): Promise<void> => {
      expect((await search(inTheDark())).read(PRTY.last_found_reagent)).toBe(0x30);
    });

    it('is found two to nine at a time', async (): Promise<void> => {
      const found: number = (await search(inTheDark())).read(ROST.reagents + ROST.reagent_mandrake);

      expect((found >= 0x02) && (found <= 0x09)).toBe(true);
    });

    it('is not found again within the same sixteen moves', async (): Promise<void> => {
      const machine: LiftedMachine = inTheDark();

      machine.write(PRTY.last_found_reagent, 0x30);

      expect((await search(machine)).read(ROST.reagents + ROST.reagent_mandrake)).toBe(0x00);
    });
  });
});
