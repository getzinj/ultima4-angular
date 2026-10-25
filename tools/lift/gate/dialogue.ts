import type { Random } from './differential';

// A townsperson's record as the towne disk holds one, for TALK: ten strings, each ended by a
// character without its high bit (a RETURN among them, and one longer than a line), the two words
// they answer to, the string that ends in their question, whether it is one of humility, and their
// chance of turning away.

export const DIALOGUE_WORDS: readonly string[] = [ 'ORBS', 'RUNE', 'WORK', 'HEAL', 'MANT', 'PRAY' ];
const PHRASES: readonly string[] = [
  'ANNA', 'SIR TOM', 'HE', 'SHE', 'IT', 'A TALL MAN', 'I GUARD THE GATE', 'I AM WELL', 'SEEK THE ORB', 'DOST THOU PRAY', 'GOOD', 'PITY', 'X',
  'FAREWELL\r', 'THE ORB WAS LOST IN THE DEEPS OF HYTHLOTH LONG AGO, AND NONE HAS SEEN IT SINCE',
];
const RECORD: number = 0x100;
const STRINGS: number = 0xF5;
const STRING_COUNT: number = 10;


/** A fixed sequence for each seed, for the disks, which are built before any case's own random. */
export function seeded(seed: number): Random {
  let state: number = seed;

  return (): number => {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0;

    return state / 0x100000000;
  };
}


function pick<T>(random: Random, values: readonly T[]): T {
  return values[Math.floor(random() * values.length)];
}


export function dialogue(random: Random): Uint8Array {
  const record: Uint8Array = new Uint8Array(RECORD);
  let at: number = 0;

  for (let string: number = 0; string < STRING_COUNT; string++) {
    const phrase: string = pick(random, PHRASES);

    [ ...phrase ].forEach((character: string, index: number): void => {
      record[at] = character.charCodeAt(0) | ((index < phrase.length - 1) ? 0x80 : 0x00);
      at = at + 1;
    });
  }
  [ pick(random, DIALOGUE_WORDS), pick(random, DIALOGUE_WORDS) ].forEach((word: string, index: number): void => {
    [ ...word ].forEach((character: string, offset: number): void => {
      record[STRINGS + (index * 4) + offset] = character.charCodeAt(0);
    });
  });
  record[0xFD] = pick(random, [ 0x00, 0x03, 0x04, 0x05, 0x06, 0x07, 0x07, 0x09 ]);
  record[0xFE] = pick(random, [ 0x00, 0x00, 0x01 ]);
  record[0xFF] = pick(random, [ 0x00, 0x00, 0x00, 0x10, 0x40, 0x80, 0xC0, 0xFF ]);

  return record;
}
