import type { LiftedMachine } from '../../../lifted-runtime/lifted-machine';
import type { INativeModule } from '../../../lifted-runtime/native-module';
import { PRTY, ROST, TRAINERS, ZP_MAIN } from '../../../state/symbols';
import { overlayMachine, runOverlay } from '../../testing/overlay-machine';
import { OVERLAY_ENTRY } from '../overlay';
import { SHP0_MODULE } from './shp0';
import { SHP1_MODULE } from './shp1';

const GOLD_HI: number = ROST.party_stats + ROST.party_stat_gold_hi;
const GOLD_LO: number = ROST.party_stats + ROST.party_stat_gold_lo;
const STAFFS: number = ROST.weapons + 0x01;
const SLINGS: number = ROST.weapons + 0x03;
const SWORDS: number = ROST.weapons + 0x06;
const CLOTH: number = ROST.armour + 0x01;
const LEATHER: number = ROST.armour + 0x02;


/** One of Britain's arms shops, with 30 gold, two staffs, a sword and leather armour. */
function britain(module: INativeModule): LiftedMachine {
  const machine: LiftedMachine = overlayMachine(module);

  machine.write(PRTY.game_mode, PRTY.mode_towne);
  machine.write(PRTY.current_location, 0x06);
  machine.write(ZP_MAIN.sfx_volume, 0x00);
  machine.write(GOLD_HI, 0x00);
  machine.write(GOLD_LO, 0x30);
  for (let index: number = 0; index < 0x18; index++) {
    machine.write(ROST.armour + index, 0x00);
  }
  machine.write(STAFFS, 0x02);
  machine.write(SWORDS, 0x01);
  machine.write(LEATHER, 0x01);
  machine.write(TRAINERS.trainer_price, 0x00);

  return machine;
}


describe('the arms shops, ported', (): void => {
  describe('SHP0, the weaponry', (): void => {
    describe('a sling bought', (): void => {
      it('takes its price from the gold', async (): Promise<void> => {
        expect((await runOverlay(britain(SHP0_MODULE), OVERLAY_ENTRY, 'BDYA')).read(GOLD_LO)).toBe(0x05);
      });

      it('adds it to the weapons', async (): Promise<void> => {
        expect((await runOverlay(britain(SHP0_MODULE), OVERLAY_ENTRY, 'BDYA')).read(SLINGS)).toBe(0x01);
      });
    });

    it('offers again after a weapon too dear', async (): Promise<void> => {
      expect((await runOverlay(britain(SHP0_MODULE), OVERLAY_ENTRY, 'BGYDYA')).read(SLINGS)).toBe(0x01);
    });

    describe('a staff sold', (): void => {
      it('pays half its price', async (): Promise<void> => {
        expect((await runOverlay(britain(SHP0_MODULE), OVERLAY_ENTRY, 'SBYA')).read(GOLD_LO)).toBe(0x40);
      });

      it('takes it from the weapons', async (): Promise<void> => {
        expect((await runOverlay(britain(SHP0_MODULE), OVERLAY_ENTRY, 'SBYA')).read(STAFFS)).toBe(0x01);
      });
    });

    it('keeps a staff the deal for which is turned down', async (): Promise<void> => {
      expect((await runOverlay(britain(SHP0_MODULE), OVERLAY_ENTRY, 'SBNA')).read(STAFFS)).toBe(0x02);
    });
  });

  describe('SHP1, the armoury', (): void => {
    it('says goodbye after armour too dear', async (): Promise<void> => {
      expect((await runOverlay(britain(SHP1_MODULE), OVERLAY_ENTRY, 'BBY')).read(CLOTH)).toBe(0x00);
    });

    it('pays a hundred for leather', async (): Promise<void> => {
      expect((await runOverlay(britain(SHP1_MODULE), OVERLAY_ENTRY, 'SCYA')).read(GOLD_HI)).toBe(0x01);
    });

    it('takes leather sold from the armour', async (): Promise<void> => {
      expect((await runOverlay(britain(SHP1_MODULE), OVERLAY_ENTRY, 'SCYA')).read(LEATHER)).toBe(0x00);
    });
  });
});
