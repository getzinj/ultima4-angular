// Builds src/app/data/talk-corrections.ts from the remaster's two talk.json files, and checks this
// port's conversation code against them on the way. Run from the workspace root, given a checkout
// of each branch of sean-gugler/u4remasteredA2:
//
//   npx tsx tools/generate-talk-corrections.ts <documented checkout> <fixed checkout> [fixed TLK.bin]
//
// The table holds only the edits and a SHA-256 of each retail field, never the retail text.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import type { CorrectedText, ITextCorrection, IValueCorrection } from '../src/app/data/conversation-corrections';
import { applyConversationCorrections } from '../src/app/data/conversation-corrections';
import type { ConversationText, IConversation } from '../src/app/data/conversations';
import { CONVERSATION_STRINGS, decodeRetailConversation, encodeFixedConversation, encodeRetailConversation } from '../src/app/data/conversations';

type TalkEntry = Record<string, string | number | boolean | null>;

const JSON_TEXT_KEYS: Readonly<Record<ConversationText, string>> = {
  name: 'name',
  pronoun: 'pronoun',
  description: 'description',
  job: 'job',
  health: 'health',
  keywordResponse1: 'keyword_response_1',
  keywordResponse2: 'keyword_response_2',
  question: 'question',
  questionYesAnswer: 'question_yes_answer',
  questionNoAnswer: 'question_no_answer',
};

const TRIGGERS: Readonly<Record<string, number>> = { job: 3, health: 4, 'keyword 1': 5, 'keyword 2': 6, mistake: 10 };
const OUTPUT: string = join(process.cwd(), 'src/app/data/talk-corrections.ts');


function conversationOf(entry: TalkEntry): IConversation {
  const trigger: string | number | boolean | null = entry['question_trigger'];

  return {
    text: Object.fromEntries(CONVERSATION_STRINGS.map((key: ConversationText): [ string, string ] => [ key, String(entry[JSON_TEXT_KEYS[key]]) ])) as Record<ConversationText, string>,
    keyword1: String(entry['keyword_1']),
    keyword2: String(entry['keyword_2']),
    trigger: trigger == null ? 0 : TRIGGERS[String(trigger)],
    humilityQuestion: entry['humility_question'] === true,
    turnsAway: parseInt(String(entry['turns_away_prob']), 16),
  };
}


function load(checkout: string): IConversation[] {
  return (JSON.parse(readFileSync(join(checkout, 'src/talk/talk.json'), 'utf8')) as TalkEntry[]).map(conversationOf);
}


function textOf(conversation: IConversation, field: CorrectedText): string {
  return field === 'keyword1' ? conversation.keyword1 : field === 'keyword2' ? conversation.keyword2 : conversation.text[field];
}


function edit(record: number, field: CorrectedText, retail: string, fixed: string): ITextCorrection {
  let prefix: number = 0;
  let suffix: number = 0;

  while ((prefix < Math.min(retail.length, fixed.length)) && (retail[prefix] === fixed[prefix])) {
    prefix++;
  }
  while ((suffix < (Math.min(retail.length, fixed.length) - prefix)) && (retail[retail.length - 1 - suffix] === fixed[fixed.length - 1 - suffix])) {
    suffix++;
  }

  return {
    record,
    field,
    retailSha256: createHash('sha256').update(retail, 'utf8').digest('hex'),
    at: prefix,
    remove: retail.length - prefix - suffix,
    insert: fixed.slice(prefix, fixed.length - suffix),
  };
}


async function main(documentedCheckout: string, fixedCheckout: string, fixedTalkBinary: string | undefined): Promise<void> {
  const retail: IConversation[] = load(documentedCheckout);
  const fixed: IConversation[] = load(fixedCheckout);
  const textCorrections: ITextCorrection[] = [];
  const valueCorrections: IValueCorrection[] = [];

  retail.forEach((conversation: IConversation, record: number): void => {
    if (!isDeepStrictEqual(decodeRetailConversation(encodeRetailConversation(conversation)), conversation)) {
      throw new Error(`record ${ record } does not survive the retail layout`);
    }
    for (const field of [ ...CONVERSATION_STRINGS, 'keyword1', 'keyword2' ] as CorrectedText[]) {
      if (textOf(conversation, field) !== textOf(fixed[record], field)) {
        textCorrections.push(edit(record, field, textOf(conversation, field), textOf(fixed[record], field)));
      }
    }
    if (conversation.trigger !== fixed[record].trigger) {
      valueCorrections.push({ record, field: 'trigger', from: conversation.trigger, to: fixed[record].trigger });
    }
    if (conversation.humilityQuestion !== fixed[record].humilityQuestion) {
      valueCorrections.push({ record, field: 'humilityQuestion', from: Number(conversation.humilityQuestion), to: Number(fixed[record].humilityQuestion) });
    }
    if (conversation.turnsAway !== fixed[record].turnsAway) {
      throw new Error(`record ${ record } changes its chance of turning away, which the table cannot say`);
    }
  });

  const corrected: readonly IConversation[] = (await applyConversationCorrections(retail, textCorrections, valueCorrections)).conversations;

  if (!isDeepStrictEqual(corrected, fixed)) {
    throw new Error('the corrections do not turn the retail conversations into the remaster\'s');
  }
  if (fixedTalkBinary != null) {
    const expected: Buffer = readFileSync(fixedTalkBinary);
    const actual: Buffer = Buffer.concat(corrected.map((conversation: IConversation): Uint8Array => encodeFixedConversation(conversation)));

    if (!expected.equals(actual)) {
      throw new Error(`the remaster's layout written here differs from ${ fixedTalkBinary }`);
    }
  }

  writeFileSync(OUTPUT, [
    '// Generated by tools/generate-talk-corrections.ts from sean-gugler/u4remasteredA2',
    '// (documented and fixed branches; the edits are © 2021 Sean Gugler, CC BY-SA 4.0). Do not edit.',
    '',
    'import type { ITextCorrection, IValueCorrection } from \'./conversation-corrections\';',
    '',
    'export const TALK_TEXT_CORRECTIONS: readonly ITextCorrection[] = [',
    ...textCorrections.map((correction: ITextCorrection): string =>
      `  { record: ${ correction.record }, field: '${ correction.field }', retailSha256: '${ correction.retailSha256 }', at: ${ correction.at }, remove: ${ correction.remove }, insert: ${ JSON.stringify(correction.insert).replace(/'/g, '\\\'').replace(/^"|"$/g, '\'').replace(/\\"/g, '"') } },`),
    '];',
    '',
    'export const TALK_VALUE_CORRECTIONS: readonly IValueCorrection[] = [',
    ...valueCorrections.map((correction: IValueCorrection): string =>
      `  { record: ${ correction.record }, field: '${ correction.field }', from: ${ correction.from }, to: ${ correction.to } },`),
    '];',
    '',
  ].join('\n'));
  console.log(`${ textCorrections.length } text and ${ valueCorrections.length } value corrections written to ${ OUTPUT }`);
}


main(process.argv[2], process.argv[3], process.argv[4]).catch((thrown: unknown): void => {
  console.error(thrown);
  process.exitCode = 1;
});
