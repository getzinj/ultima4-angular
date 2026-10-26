import type { LiftedMachine } from '../../../lifted-runtime/lifted-machine';
import { PRTY, ROST, ZP_MAIN } from '../../../state/symbols';
import { overlayMachine, runOverlay } from '../../testing/overlay-machine';
import { OVERLAY_ENTRY } from '../overlay';
import { SHP5_MODULE } from './shp5';

const GOLD_HI: number = ROST.party_stats + ROST.party_stat_gold_hi;
const LEADER: number = ROST.player_stats;
const SECOND: number = ROST.player_stats + 0x20;
const SACRIFICE: number = ROST.party_stats + ROST.virtue_sacrifice;


/** Moonglow's healer, with 900 gold, the leader poisoned and weak, the second dead, sacrifice at 50. */
function healer(): LiftedMachine {
  const machine: LiftedMachine = overlayMachine(SHP5_MODULE);

  machine.write(PRTY.game_mode, PRTY.mode_towne);
  machine.write(PRTY.current_location, 0x05);
  machine.write(PRTY.party_size, 0x02);
  machine.write(ZP_MAIN.sfx_volume, 0x00);
  machine.write(GOLD_HI, 0x09);
  machine.write(LEADER + ROST.player_status, ROST.status_Poison);
  machine.write(LEADER + ROST.player_cur_hp_hi, 0x01);
  machine.write(LEADER + ROST.player_max_hp_hi, 0x02);
  machine.write(SECOND + ROST.player_status, ROST.status_Dead);
  machine.write(SACRIFICE, 0x50);

  return machine;
}


describe('SHP5, the healer, ported', (): void => {
  describe('a cure paid for', (): void => {
    it('cures the poison', async (): Promise<void> => {
      expect((await runOverlay(healer(), OVERLAY_ENTRY, 'YA1YN')).read(LEADER + ROST.player_status)).toBe(ROST.status_Good);
    });

    it('costs a hundred', async (): Promise<void> => {
      expect((await runOverlay(healer(), OVERLAY_ENTRY, 'YA1YN')).read(GOLD_HI)).toBe(0x08);
    });
  });

  it('cures for nothing a party with under a hundred', async (): Promise<void> => {
    const machine: LiftedMachine = healer();

    machine.write(GOLD_HI, 0x00);

    expect((await runOverlay(machine, OVERLAY_ENTRY, 'YA1 N')).read(LEADER + ROST.player_status)).toBe(ROST.status_Good);
  });

  it('heals to the most hit points', async (): Promise<void> => {
    expect((await runOverlay(healer(), OVERLAY_ENTRY, 'YB1YN')).read(LEADER + ROST.player_cur_hp_hi)).toBe(0x02);
  });

  describe('a resurrection paid for', (): void => {
    it('brings the dead back', async (): Promise<void> => {
      expect((await runOverlay(healer(), OVERLAY_ENTRY, 'YC2YN')).read(SECOND + ROST.player_status)).toBe(ROST.status_Good);
    });

    it('costs three hundred', async (): Promise<void> => {
      expect((await runOverlay(healer(), OVERLAY_ENTRY, 'YC2YN')).read(GOLD_HI)).toBe(0x06);
    });
  });

  it('takes nothing for no one', async (): Promise<void> => {
    expect((await runOverlay(healer(), OVERLAY_ENTRY, 'YA0N')).read(GOLD_HI)).toBe(0x09);
  });

  it('takes nothing when the price is refused', async (): Promise<void> => {
    expect((await runOverlay(healer(), OVERLAY_ENTRY, 'YA1NN')).read(GOLD_HI)).toBe(0x09);
  });

  describe('a strong leader', (): void => {
    function strong(): LiftedMachine {
      const machine: LiftedMachine = healer();

      machine.write(LEADER + ROST.player_cur_hp_hi, 0x05);

      return machine;
    }

    it('gives a hundred hit points of blood', async (): Promise<void> => {
      expect((await runOverlay(strong(), OVERLAY_ENTRY, 'NY')).read(LEADER + ROST.player_cur_hp_hi)).toBe(0x04);
    });

    it('gains five sacrifice for it', async (): Promise<void> => {
      expect((await runOverlay(strong(), OVERLAY_ENTRY, 'NY')).read(SACRIFICE)).toBe(0x55);
    });

    it('loses five sacrifice for refusing', async (): Promise<void> => {
      expect((await runOverlay(strong(), OVERLAY_ENTRY, 'NN')).read(SACRIFICE)).toBe(0x45);
    });
  });
});
