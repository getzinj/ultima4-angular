import type { LiftedMachine } from '../../../lifted-runtime/lifted-machine';
import { MAP_OBJECTS, PRTY, ROST, TILES, ZP_MAIN } from '../../../state/symbols';
import { overlayMachine, runOverlay } from '../../testing/overlay-machine';
import { OVERLAY_ENTRY } from '../overlay';
import { DIALOG, TALK_MODULE } from './talk';

const O = MAP_OBJECTS;
const RETURN: string = '\r';
const PERSON: number = 0x03;
const STRINGS: readonly string[] = [ 'ANNA', 'SHE', 'A MAID', 'I SEW', 'I AM WELL', 'ORBS ARE OLD', 'RUNES ARE NEW', 'ART THOU HUMBLE', 'PROUD', 'GOOD' ];


/** Anna, who answers to ORBS and RUNE, asks her question of humility after RUNE (her word 6), and never turns away. */
function meeting(type: number = 0x50): LiftedMachine {
  const machine: LiftedMachine = overlayMachine(TALK_MODULE);
  let at: number = DIALOG.dialog_strings;

  for (const value of STRINGS) {
    [ ...value ].forEach((character: string, index: number): void => {
      machine.write(at, character.charCodeAt(0) | ((index < value.length - 1) ? 0x80 : 0x00));
      at = at + 1;
    });
  }
  [ ...'ORBSRUNE' ].forEach((character: string, index: number): void => machine.write(DIALOG.dialog_keyword_1 + index, character.charCodeAt(0)));
  machine.write(DIALOG.dialog_question_trigger, 0x06);
  machine.write(DIALOG.dialog_humility, 0x01);
  machine.write(DIALOG.dialog_turns_away_probability, 0x00);
  machine.write(0xEA, PERSON);
  machine.write(O.object_tile_type + PERSON, type);
  machine.write(PRTY.game_mode, PRTY.mode_towne);
  machine.write(PRTY.move_counter + 3, 0x20);
  machine.write(PRTY.last_humility_check, 0x00);
  machine.write(ROST.party_stats + ROST.virtue_humility, 0x50);
  machine.write(ROST.party_stats + ROST.virtue_compassion, 0x50);

  return machine;
}


/** Each word and RETURN; an empty one is a RETURN alone, for the key the question waits for before it is asked. */
function say(machine: LiftedMachine, ...words: readonly string[]): Promise<LiftedMachine> {
  return runOverlay(machine, OVERLAY_ENTRY, words.map((word: string): string => `${ word }${ RETURN }`).join(''));
}


describe('TALK, ported', (): void => {
  describe('a question of humility', (): void => {
    it('answered no, is worth ten humility', async (): Promise<void> => {
      expect((await say(meeting(), 'RUNE', '', 'N', 'BYE')).read(ROST.party_stats + ROST.virtue_humility)).toBe(0x60);
    });

    it('answered yes, costs five', async (): Promise<void> => {
      expect((await say(meeting(), 'RUNE', '', 'Y', 'BYE')).read(ROST.party_stats + ROST.virtue_humility)).toBe(0x45);
    });

    it('is asked again until answered yes or no', async (): Promise<void> => {
      expect((await say(meeting(), 'RUNE', '', 'MAYBE', 'N', 'BYE')).read(ROST.party_stats + ROST.virtue_humility)).toBe(0x60);
    });

    it('is not asked after another word', async (): Promise<void> => {
      expect((await say(meeting(), 'ORBS', 'N', 'BYE')).read(ROST.party_stats + ROST.virtue_humility)).toBe(0x50);
    });
  });

  describe('a beggar', (): void => {
    function begging(): LiftedMachine {
      const machine: LiftedMachine = meeting(TILES.tile_beggar);

      machine.write(ROST.gold_hi, 0x00);
      machine.write(ROST.gold_lo, 0x20);

      return machine;
    }

    it('takes the gold given', async (): Promise<void> => {
      expect((await say(begging(), 'GIVE', '5', 'BYE')).read(ROST.gold_lo)).toBe(0x15);
    });

    it('is worth two compassion', async (): Promise<void> => {
      expect((await say(begging(), 'GIVE', '5', 'BYE')).read(ROST.party_stats + ROST.virtue_compassion)).toBe(0x52);
    });

    it('takes no more than there is', async (): Promise<void> => {
      expect((await say(begging(), 'GIVE', '25', 'BYE')).read(ROST.gold_lo)).toBe(0x20);
    });
  });

  it('does not take gold for one who is no beggar', async (): Promise<void> => {
    const machine: LiftedMachine = meeting();

    machine.write(ROST.gold_lo, 0x20);

    expect((await say(machine, 'GIVE', 'BYE')).read(ROST.gold_lo)).toBe(0x20);
  });

  it('draws a fight from one sure to turn away', async (): Promise<void> => {
    const machine: LiftedMachine = meeting();

    machine.write(DIALOG.dialog_turns_away_probability, 0xFF);
    machine.write(ZP_MAIN.key_buf_len, 0x00);

    expect((await say(machine)).read(O.npc_movement_ai + PERSON)).toBe(O.ai_hostile);
  });
});
