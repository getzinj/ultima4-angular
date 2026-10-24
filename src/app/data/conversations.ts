// One person's conversation: a 256-byte sector of the towne disk's talk area. The retail game and
// the remaster lay it out differently (its `TALK.s` was rewritten along with `tools/gen_talk.py`):
//
// - retail: each of the ten strings follows a zero byte, in plain ASCII with $8D for a new line,
//   within $F0 bytes; two 6-character keywords; then trigger, an unused "special" flag, humility
//   and the chance of turning away.
// - remaster: the strings have bit 7 set except on each one's last character, within $F5 bytes;
//   two 4-character keywords with bit 7 set; then trigger, humility and the chance of turning away.

export const CONVERSATION_STRINGS: readonly ConversationText[] = [
  'name', 'pronoun', 'description', 'job', 'health',
  'keywordResponse1', 'keywordResponse2', 'question', 'questionYesAnswer', 'questionNoAnswer',
];

export type ConversationText =
  'name' | 'pronoun' | 'description' | 'job' | 'health' |
  'keywordResponse1' | 'keywordResponse2' | 'question' | 'questionYesAnswer' | 'questionNoAnswer';

export const TRIGGER_NONE: number = 0;
export const TRIGGER_JOB: number = 3;
export const TRIGGER_HEALTH: number = 4;
export const TRIGGER_KEYWORD_1: number = 5;
export const TRIGGER_KEYWORD_2: number = 6;

const RECORD_SIZE: number = 256;
const RETAIL_TEXT_SIZE: number = 0xF0;
const RETAIL_KEYWORD_SIZE: number = 6;
const FIXED_TEXT_SIZE: number = 0xF5;
const FIXED_KEYWORD_SIZE: number = 4;
const NEW_LINE: number = 0x8D;


export interface IConversation {
  readonly text: Readonly<Record<ConversationText, string>>;
  readonly keyword1: string;
  readonly keyword2: string;

  /** When the question is asked: TRIGGER_NONE, _JOB, _HEALTH, _KEYWORD_1 or _KEYWORD_2. */
  readonly trigger: number;
  readonly humilityQuestion: boolean;

  /** The chance of turning away, as the BCD byte the game compares. */
  readonly turnsAway: number;
}


export class ConversationError extends Error {
}


function characterOf(code: number): string {
  return (code & 0x7F) === (NEW_LINE & 0x7F) ? '\n' : String.fromCharCode(code & 0x7F);
}


function retailCode(character: string): number {
  return character === '\n' ? NEW_LINE : character.charCodeAt(0);
}


function keywordOf(bytes: Uint8Array): string {
  return Array.from(bytes, (code: number): string => String.fromCharCode(code & 0x7F)).join('').trimEnd();
}


export function decodeRetailConversation(record: Uint8Array): IConversation {
  const strings: string[] = [];
  let position: number = 0;

  for (let index: number = 0; index < CONVERSATION_STRINGS.length; index++) {
    let value: string = '';

    if (record[position] !== 0) {
      throw new ConversationError(`string ${ index } does not start with a zero byte at ${ position }`);
    }
    position++;
    while ((position < RETAIL_TEXT_SIZE) && (record[position] !== 0)) {
      value = value + characterOf(record[position]);
      position++;
    }
    strings.push(value);
  }

  return {
    text: Object.fromEntries(CONVERSATION_STRINGS.map((key: ConversationText, index: number): [ string, string ] => [ key, strings[index] ])) as Record<ConversationText, string>,
    keyword1: keywordOf(record.subarray(RETAIL_TEXT_SIZE, RETAIL_TEXT_SIZE + RETAIL_KEYWORD_SIZE)),
    keyword2: keywordOf(record.subarray(RETAIL_TEXT_SIZE + RETAIL_KEYWORD_SIZE, RETAIL_TEXT_SIZE + (2 * RETAIL_KEYWORD_SIZE))),
    trigger: record[0xFC],
    humilityQuestion: record[0xFE] !== 0,
    turnsAway: record[0xFF],
  };
}


/** The retail layout, for synthetic disks and round trips; the game never writes it. */
export function encodeRetailConversation(conversation: IConversation): Uint8Array {
  const record: Uint8Array = new Uint8Array(RECORD_SIZE);
  const text: number[] = CONVERSATION_STRINGS.flatMap((key: ConversationText): number[] =>
    [ 0, ...Array.from(conversation.text[key], retailCode) ]);

  if (text.length >= RETAIL_TEXT_SIZE) {
    throw new ConversationError(`the strings take ${ text.length } bytes; the retail layout holds ${ RETAIL_TEXT_SIZE - 1 }`);
  } else {
    record.set(text);
    record.set(Array.from(conversation.keyword1.padEnd(RETAIL_KEYWORD_SIZE).slice(0, RETAIL_KEYWORD_SIZE), retailCode), RETAIL_TEXT_SIZE);
    record.set(Array.from(conversation.keyword2.padEnd(RETAIL_KEYWORD_SIZE).slice(0, RETAIL_KEYWORD_SIZE), retailCode), RETAIL_TEXT_SIZE + RETAIL_KEYWORD_SIZE);
    record[0xFC] = conversation.trigger;
    record[0xFE] = conversation.humilityQuestion ? 1 : 0;
    record[0xFF] = conversation.turnsAway;

    return record;
  }
}


/** The remaster's layout, which its `TALK.s` (and so this port) reads. */
export function encodeFixedConversation(conversation: IConversation): Uint8Array {
  const record: Uint8Array = new Uint8Array(RECORD_SIZE);
  const text: number[] = CONVERSATION_STRINGS.flatMap((key: ConversationText): number[] => {
    const value: string = conversation.text[key];

    if (value.length === 0) {
      throw new ConversationError(`${ key } is empty, which the remaster's layout cannot hold`);
    } else {
      const codes: number[] = Array.from(value, (character: string): number => retailCode(character) | 0x80);

      codes[codes.length - 1] = codes[codes.length - 1] & 0x7F;

      return codes;
    }
  });

  if (text.length >= FIXED_TEXT_SIZE) {
    throw new ConversationError(`the strings take ${ text.length } bytes; the remaster's layout holds ${ FIXED_TEXT_SIZE - 1 }`);
  } else {
    record.set(text);
    record.set(Array.from(conversation.keyword1.padEnd(FIXED_KEYWORD_SIZE).slice(0, FIXED_KEYWORD_SIZE), (character: string): number => retailCode(character) | 0x80), FIXED_TEXT_SIZE);
    record.set(Array.from(conversation.keyword2.padEnd(FIXED_KEYWORD_SIZE).slice(0, FIXED_KEYWORD_SIZE), (character: string): number => retailCode(character) | 0x80), FIXED_TEXT_SIZE + FIXED_KEYWORD_SIZE);
    record[0xFD] = conversation.trigger;
    record[0xFE] = conversation.humilityQuestion ? 1 : 0;
    record[0xFF] = conversation.turnsAway;

    return record;
  }
}
