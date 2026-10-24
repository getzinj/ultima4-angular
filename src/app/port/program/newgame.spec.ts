import type { LiftedMachine } from '../../lifted-runtime/lifted-machine';
import { PRTY, ROST, ZP_MAIN } from '../../state/symbols';
import { encode } from '../text';
import { dosSeen, named, pressUntil } from '../testing/boot-machine';
import { NEWGAME_STRINGS, NEWGAME_TABLES, NEWGAME_VARIABLES, stringTable } from './newgame-data';

// NEWGAME, ported, with nothing lifted: from BOOT's BRUN through the gypsy's seven questions,
// every one answered A, to ULT4.

const PLAYER_1: number = 0xEC00;


async function created(): Promise<LiftedMachine> {
  const machine: LiftedMachine = await named();

  await pressUntil(machine, 'M', dosSeen(machine, 'BRUN NEWGAME'));
  await pressUntil(machine, 'A', dosSeen(machine, 'BRUN ULT4'));

  return machine;
}


function bcd(value: number): number {
  return ((value >> 4) * 10) + (value & 0x0F);
}


describe('NEWGAME, ported', (): void => {
  describe('the string table', (): void => {
    it('holds the 68 strings print_string counts through', (): void => {
      expect(NEWGAME_STRINGS.length).toBe(68);
    });

    it('starts with an empty string, so string n follows the nth zero', (): void => {
      expect(stringTable()[0]).toBe(0x00);
    });

    it('ends a line with $FF', (): void => {
      expect(stringTable().slice(0, 41).filter((value: number): boolean => value === 0xFF).length).toBe(1);
    });
  });

  describe('creation', (): void => {
    let machine: LiftedMachine;

    beforeAll(async (): Promise<void> => {
      machine = await created();
    });

    it('loads the new party and runs ULT4', (): void => {
      expect(machine.dosLog.slice(-4)).toEqual([ 'BLOAD NPRT,A$0', 'BLOAD NLST,A$EE00', 'BLOAD NRST,A$EC00', 'BRUN ULT4,A$4000' ]);
    });

    it('names player 1 as typed', (): void => {
      expect(Array.from({ length: 6 }, (_: unknown, index: number): number => machine.read(PLAYER_1 + index))).toEqual(encode('AVATAR'));
    });

    it('makes player 1 the sex chosen', (): void => {
      expect(machine.read(PLAYER_1 + ROST.player_gender)).toBe(machine.read(ZP_MAIN.gender_chosen));
    });

    it('gives player 1 the strength the answers added up to', (): void => {
      expect(machine.read(PLAYER_1 + ROST.player_strength)).toBe(machine.read(NEWGAME_VARIABLES.cur_str));
    });

    it('raises a virtue by 5 for each of the seven answers', (): void => {
      const levels: number[] = Array.from({ length: 8 }, (_: unknown, index: number): number => bcd(machine.read(ROST.party_stats + index)));

      expect(levels.reduce((sum: number, level: number): number => sum + level, 0)).toBe((8 * 50) + (7 * 5));
    });

    it('starts the party where the last virtue chosen begins', (): void => {
      expect(machine.read(PRTY.player_xpos)).toBe(machine.read(NEWGAME_TABLES.start_world_x + machine.read(NEWGAME_VARIABLES.card_chosen)));
    });

    it('starts with a party of one', (): void => {
      expect(machine.read(PRTY.party_size)).toBe(0x01);
    });
  });
});
