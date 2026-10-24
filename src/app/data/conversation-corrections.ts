import type { ConversationText, IConversation } from './conversations';
import { TALK_TEXT_CORRECTIONS, TALK_VALUE_CORRECTIONS } from './talk-corrections';

// The remaster's corrections to the conversations, as edits to the retail text. Each text edit
// carries the SHA-256 of the field it expects, so a disk whose text differs is left alone and
// reported rather than edited blindly.

export type CorrectedText = ConversationText | 'keyword1' | 'keyword2';
export type CorrectedValue = 'trigger' | 'humilityQuestion';


export interface ITextCorrection {
  readonly record: number;
  readonly field: CorrectedText;
  readonly retailSha256: string;
  readonly at: number;
  readonly remove: number;
  readonly insert: string;
}


export interface IValueCorrection {
  readonly record: number;
  readonly field: CorrectedValue;
  readonly from: number;
  readonly to: number;
}


export interface ICorrectionResult {
  readonly conversations: readonly IConversation[];

  /** One line for each correction whose field did not hold what it expected. */
  readonly skipped: readonly string[];
}


async function sha256Hex(text: string): Promise<string> {
  const digest: ArrayBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));

  return Array.from(new Uint8Array(digest), (byte: number): string => byte.toString(16).padStart(2, '0')).join('');
}


function textOf(conversation: IConversation, field: CorrectedText): string {
  if (field === 'keyword1') {
    return conversation.keyword1;
  } else if (field === 'keyword2') {
    return conversation.keyword2;
  } else {
    return conversation.text[field];
  }
}


function withText(conversation: IConversation, field: CorrectedText, value: string): IConversation {
  if (field === 'keyword1') {
    return { ...conversation, keyword1: value };
  } else if (field === 'keyword2') {
    return { ...conversation, keyword2: value };
  } else {
    return { ...conversation, text: { ...conversation.text, [field]: value } };
  }
}


function valueOf(conversation: IConversation, field: CorrectedValue): number {
  return field === 'trigger' ? conversation.trigger : Number(conversation.humilityQuestion);
}


function withValue(conversation: IConversation, field: CorrectedValue, value: number): IConversation {
  return field === 'trigger' ? { ...conversation, trigger: value } : { ...conversation, humilityQuestion: value !== 0 };
}


export async function applyConversationCorrections(retail: readonly IConversation[],
                                                   textCorrections: readonly ITextCorrection[] = TALK_TEXT_CORRECTIONS,
                                                   valueCorrections: readonly IValueCorrection[] = TALK_VALUE_CORRECTIONS): Promise<ICorrectionResult> {
  const conversations: IConversation[] = [ ...retail ];
  const skipped: string[] = [];

  for (const correction of textCorrections) {
    const current: IConversation | undefined = conversations[correction.record];

    if (current == null) {
      skipped.push(`record ${ correction.record } ${ correction.field }: no such record`);
    } else {
      const text: string = textOf(current, correction.field);

      if (await sha256Hex(text) === correction.retailSha256) {
        const edited: string = text.slice(0, correction.at) + correction.insert + text.slice(correction.at + correction.remove);

        conversations[correction.record] = withText(current, correction.field, edited);
      } else {
        skipped.push(`record ${ correction.record } ${ correction.field }: the text is not the retail text`);
      }
    }
  }

  for (const correction of valueCorrections) {
    const current: IConversation | undefined = conversations[correction.record];

    if ((current != null) && (valueOf(current, correction.field) === correction.from)) {
      conversations[correction.record] = withValue(current, correction.field, correction.to);
    } else {
      skipped.push(`record ${ correction.record } ${ correction.field }: not the retail value`);
    }
  }

  return { conversations, skipped };
}
