import type { IConversation } from './conversations';
import { ConversationError, decodeRetailConversation, encodeFixedConversation, encodeRetailConversation } from './conversations';
import { syntheticConversation } from './testing/synthetic-disks';


const SAMPLE: IConversation = {
  ...syntheticConversation(7),
  text: { ...syntheticConversation(7).text, job: 'I MAKE\nTHINGS' },
  keyword1: 'HELP',
  keyword2: 'RIDDLE',
  trigger: 6,
  humilityQuestion: true,
  turnsAway: 0x25,
};


describe('the retail layout', (): void => {
  it('survives a round trip', (): void => {
    expect(decodeRetailConversation(encodeRetailConversation(SAMPLE))).toEqual(SAMPLE);
  });

  it('starts each string with a zero byte', (): void => {
    expect(encodeRetailConversation(SAMPLE)[0]).toBe(0);
  });

  it('keeps six characters of a keyword', (): void => {
    expect(String.fromCharCode(...encodeRetailConversation(SAMPLE).subarray(0xF6, 0xFC))).toBe('RIDDLE');
  });

  it('puts the trigger at $FC', (): void => {
    expect(encodeRetailConversation(SAMPLE)[0xFC]).toBe(6);
  });

  it('refuses a record that does not start with a zero byte', (): void => {
    expect((): unknown => decodeRetailConversation(new Uint8Array(256).fill(0xC1))).toThrow(ConversationError);
  });
});


describe('the remaster\'s layout', (): void => {
  it('sets bit 7 on all but the last character of a string', (): void => {
    const record: Uint8Array = encodeFixedConversation(SAMPLE);
    const name: string = SAMPLE.text.name;

    expect(Array.from(record.subarray(0, name.length), (code: number): boolean => (code & 0x80) !== 0)).toEqual([ ...new Array<boolean>(name.length - 1).fill(true), false ]);
  });

  it('writes a new line as $8D', (): void => {
    const record: Uint8Array = encodeFixedConversation(SAMPLE);

    expect(Array.from(record)).toContain(0x8D);
  });

  it('keeps four characters of a keyword, with bit 7 set', (): void => {
    expect(Array.from(encodeFixedConversation(SAMPLE).subarray(0xF9, 0xFD))).toEqual([ 0xD2, 0xC9, 0xC4, 0xC4 ]);
  });

  it('puts the trigger at $FD', (): void => {
    expect(encodeFixedConversation(SAMPLE)[0xFD]).toBe(6);
  });

  it('puts the humility flag at $FE', (): void => {
    expect(encodeFixedConversation(SAMPLE)[0xFE]).toBe(1);
  });

  it('puts the chance of turning away at $FF', (): void => {
    expect(encodeFixedConversation(SAMPLE)[0xFF]).toBe(0x25);
  });

  it('refuses an empty string', (): void => {
    expect((): unknown => encodeFixedConversation({ ...SAMPLE, text: { ...SAMPLE.text, health: '' } })).toThrow(ConversationError);
  });
});
