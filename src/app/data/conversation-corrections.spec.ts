import { createHash } from 'node:crypto';

import type { ICorrectionResult, ITextCorrection, IValueCorrection } from './conversation-corrections';
import { applyConversationCorrections } from './conversation-corrections';
import type { IConversation } from './conversations';
import { syntheticConversation } from './testing/synthetic-disks';
import { TALK_TEXT_CORRECTIONS, TALK_VALUE_CORRECTIONS } from './talk-corrections';


function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}


const RETAIL: IConversation = { ...syntheticConversation(0), text: { ...syntheticConversation(0).text, description: 'A JESTER' } };
const DESCRIPTION_FIX: ITextCorrection = { record: 0, field: 'description', retailSha256: sha256('A JESTER'), at: 1, remove: 7, insert: '\nJESTER.' };
const KEYWORD_FIX: ITextCorrection = { record: 0, field: 'keyword2', retailSha256: sha256('KEY2'), at: 0, remove: 4, insert: 'VISIT' };
const TRIGGER_FIX: IValueCorrection = { record: 0, field: 'trigger', from: 0, to: 6 };


describe('applyConversationCorrections', (): void => {
  it('edits text that matches its digest', async (): Promise<void> => {
    const result: ICorrectionResult = await applyConversationCorrections([ RETAIL ], [ DESCRIPTION_FIX ], []);

    expect(result.conversations[0].text.description).toBe('A\nJESTER.');
  });

  it('edits a keyword', async (): Promise<void> => {
    const result: ICorrectionResult = await applyConversationCorrections([ RETAIL ], [ KEYWORD_FIX ], []);

    expect(result.conversations[0].keyword2).toBe('VISIT');
  });

  it('leaves text that does not match its digest alone', async (): Promise<void> => {
    const other: IConversation = { ...RETAIL, text: { ...RETAIL.text, description: 'A JUGGLER' } };
    const result: ICorrectionResult = await applyConversationCorrections([ other ], [ DESCRIPTION_FIX ], []);

    expect(result.conversations[0].text.description).toBe('A JUGGLER');
  });

  it('reports text that does not match its digest', async (): Promise<void> => {
    const other: IConversation = { ...RETAIL, text: { ...RETAIL.text, description: 'A JUGGLER' } };
    const result: ICorrectionResult = await applyConversationCorrections([ other ], [ DESCRIPTION_FIX ], []);

    expect(result.skipped).toEqual([ 'record 0 description: the text is not the retail text' ]);
  });

  it('changes a value that holds the retail value', async (): Promise<void> => {
    const result: ICorrectionResult = await applyConversationCorrections([ RETAIL ], [], [ TRIGGER_FIX ]);

    expect(result.conversations[0].trigger).toBe(6);
  });

  it('turns on a humility flag', async (): Promise<void> => {
    const result: ICorrectionResult = await applyConversationCorrections([ RETAIL ], [], [ { record: 0, field: 'humilityQuestion', from: 0, to: 1 } ]);

    expect(result.conversations[0].humilityQuestion).toBe(true);
  });

  it('reports a correction for a record that is not there', async (): Promise<void> => {
    const result: ICorrectionResult = await applyConversationCorrections([], [ DESCRIPTION_FIX ], []);

    expect(result.skipped).toEqual([ 'record 0 description: no such record' ]);
  });

  it('leaves the conversations it was given unchanged', async (): Promise<void> => {
    const retail: IConversation[] = [ RETAIL ];

    await applyConversationCorrections(retail, [ DESCRIPTION_FIX ], [ TRIGGER_FIX ]);

    expect(retail[0]).toBe(RETAIL);
  });
});


describe('the generated table', (): void => {
  it('holds the remaster\'s 112 text corrections', (): void => {
    expect(TALK_TEXT_CORRECTIONS.length).toBe(112);
  });

  it('holds its 9 value corrections', (): void => {
    expect(TALK_VALUE_CORRECTIONS.length).toBe(9);
  });

  it('touches only the 256 records there are', (): void => {
    expect(TALK_TEXT_CORRECTIONS.every((correction: ITextCorrection): boolean => (correction.record >= 0) && (correction.record < 256))).toBe(true);
  });
});
