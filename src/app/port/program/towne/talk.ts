// towne/TALK.s: talking to a townsperson, ported. ULT4's cmd_talk reads the person's record from
// the towne disk into $EF00, ten strings and two words of their own, and loads TALK at $8800. They
// may turn away or fight; they answer to their name, their look, their job and health and their
// two words, and some ask a question back, whose answer can cost or earn humility. A beggar takes
// gold, for compassion and sacrifice, and each towne's companion may join the party.

import { DECIMAL } from '../../../lifted-runtime/cpu';
import type { LiftedMachine } from '../../../lifted-runtime/lifted-machine';
import { CHAR, JUMP_SUBS, MAP_OBJECTS, PRTY, ROST, TABLES, TILES, ZP_MAIN } from '../../../state/symbols';
import { inline } from '../../inline-data';
import type { IInlineData } from '../../inline-data';
import type { Exit } from '../../routine';
import { encode } from '../../text';
import { KeywordOverlay } from '../keyword-overlay';
import { OVERLAY_ENTRY, overlayModule, text } from '../overlay';

const J = JUMP_SUBS;
const O = MAP_OBJECTS;
const towne_virtue: number = 0xD5;
const zp_number: number = 0xD8;
const zp_save_reg: number = 0xD9;
const zp_inc_amount: number = 0xD9;
const zp_dec_amount: number = 0xDA;
const zp_string: number = 0xEA;
const zp_index: number = 0xEA;

/** The record cmd_talk reads: the strings, each ended by a character without its high bit, then the person's own. */
export const DIALOG = {
  dialog_strings: 0xEF00,
  dialog_keyword_1: 0xEFF5,
  dialog_keyword_2: 0xEFF9,
  dialog_question_trigger: 0xEFFD,
  dialog_humility: 0xEFFE,
  dialog_turns_away_probability: 0xEFFF,
} as const;

const D = DIALOG;

const TALK_VARIABLES = {
  input_index: 0x8A5F,
  keywords: 0x8A83,
  keyword_1: 0x8A97,
  keyword_2: 0x8A9B,
} as const;

const V = TALK_VARIABLES;

const KEYWORDS: readonly string[] = [ 'BYE ', 'NAME', 'LOOK', 'JOB ', 'HEAL', '    ', '    ', 'JOIN', 'GIVE', '    ' ];
const KEYWORD_BYE: number = 0x00;
const KEYWORD_NAME: number = 0x01;
const KEYWORD_LOOK: number = 0x02;
const KEYWORD_JOIN: number = 0x07;
const KEYWORD_GIVE: number = 0x08;
const KEYWORD_EMPTY: number = 0x09;
const STRING_NAME: number = 0x01;
const STRING_PRONOUN: number = 0x02;
const STRING_LOOK: number = 0x03;
const STRING_QUESTION: number = 0x08;
const STRING_YES: number = 0x09;
const STRING_NO: number = 0x0A;
const FIGHT_MARGIN: number = 0x40;
const FIGHT_MARGIN_PROMPT: number = 0x80;
const VIRTUE_TO_JOIN: number = 0x40;
const TOWNES: number = 0x08;
const REASON_EXPERIENCED: number = 0x08;

export const TALK_INLINE = {
  you_meet: text(0x881F, '\nYOU MEET\n'),
  i_am: text(0x884C, ' I AM\n'),
  your_interest: text(0x887A, '\nYour interest:\n'),
  cannot_help: text(0x88B8, ' THAT,\nI CANNOT HELP\nTHEE WITH.\n'),
  bye: text(0x88EA, ' BYE.\n'),
  you_see: text(0x8902, 'YOU SEE\n'),
  asks: text(0x894B, ' ASKS:\n'),
  you_respond: text(0x895B, '\n\nYou respond:\n'),
  yes_or_no: text(0x899E, 'YES, OR NO:'),
  turns_away: text(0x89B5, ' TURNS AWAY!\n\n'),
  en_garde: text(0x89CF, ' SAYS:\nEN GARDE! FOOL!\n'),
  says: text(0x89F9, ' SAYS:'),
  cannot_join: text(0x8B13, 'I CANNOT\nJOIN THEE.\n'),
  thou_art_not: text(0x8B33, 'THOU ART NOT\n'),
  enough_to_join: text(0x8B47, '\nENOUGH FOR ME\nTO JOIN THEE.\n'),
  honored: text(0x8B75, 'I AM HONORED\nTO JOIN THEE!\n'),
  keep_it: text(0x8BF2, ' I DO\nNOT NEED THY\nGOLD, KEEP IT!\n'),
  how_much: text(0x8C1B, 'How much-'),
  not_that_much: text(0x8C3C, '\nTHOU HAST NOT\nTHAT MUCH GOLD!\n'),
  thank_thee: text(0x8C6D, ' OH,\nTHANK THEE!\nI SHALL NEVER\nFORGET THY\nKINDNESS!\n'),
  honest: text(0x8CCD, 'HONEST'),
  compassionate: text(0x8CDB, 'COMPASSIONATE'),
  valiant: text(0x8CF0, 'VALIANT'),
  just: text(0x8CFF, 'JUST'),
  sacrificial: text(0x8D0B, 'SACRIFICIAL'),
  honorable: text(0x8D1E, 'HONORABLE'),
  spiritual: text(0x8D2F, 'SPIRITUAL'),
  humble: text(0x8D40, 'HUMBLE'),
  experienced: text(0x8D4B, 'EXPERIENCED'),
  lost_an_eighth: text(0x8DDD, '\nTHOU HAST LOST\nAN EIGHTH!\n'),
} as const;

const I = TALK_INLINE;

/** decline_reason's words, by the virtue the companion asks for, and the experience they ask for last. */
const REASONS: readonly IInlineData[] = [ I.honest, I.compassionate, I.valiant, I.just, I.sacrificial, I.honorable, I.spiritual, I.humble, I.experienced ];

export const TALK_DATA: readonly IInlineData[] = [
  ...Object.values(TALK_INLINE),
  inline(V.input_index, [ 0x00 ]),
  inline(V.keywords, KEYWORDS.flatMap((keyword: string): number[] => encode(keyword))),
];

/** Where the talk goes next: TALK.s's labels that its branches jump back to. */
type Next = 'talk_prompt' | 'print_name' | 'check_question_trigger' | 'talk_done';


export class Talk extends KeywordOverlay {
  public async run(): Promise<Exit> {
    let next: Next = await this.meet();

    while (next !== 'talk_done') {
      if (next === 'print_name') {
        next = await this.printName();
      } else if (next === 'talk_prompt') {
        next = await this.talkPrompt();
      } else {
        next = await this.checkQuestionTrigger();
      }
    }

    return null;
  }


  /** The person's two words, with their high bits, into the table of words they answer to. */
  private async meet(): Promise<Next> {
    let next: Next;

    this.ldx(0x03);
    do {
      this.poke(V.keyword_1 + this.cpu.x, this.lda(this.peek(D.dialog_keyword_1 + this.cpu.x) | 0x80));
      this.poke(V.keyword_2 + this.cpu.x, this.lda(this.peek(D.dialog_keyword_2 + this.cpu.x) | 0x80));
    } while (this.dex() < 0x80);
    this.ldx(this.peek(zp_index));
    this.poke(ZP_MAIN.npc_type, this.lda(this.peek(O.object_tile_type + this.cpu.x)));
    await this.print(I.you_meet);
    await this.printString(STRING_LOOK);
    await this.newline();
    await this.m.call(J.j_rand);
    this.cmp(this.peek(D.dialog_turns_away_probability));
    if (!this.carry()) {
      next = await this.maybeFight(FIGHT_MARGIN);
    } else {
      await this.m.call(J.j_rand);
      if (this.negative()) {
        next = 'talk_prompt';
      } else {
        await this.newline();
        next = 'print_name';
      }
    }

    return next;
  }


  /** A roll under the chance of turning away: by enough, a fight. */
  private async maybeFight(margin: number): Promise<Next> {
    this.poke(zp_number, this.cpu.a);
    this.lda(this.peek(D.dialog_turns_away_probability));
    this.setCarry(true);
    this.cpu.sbc(this.peek(zp_number));
    this.cmp(margin);
    if (this.carry()) {
      await this.startCombat();
    } else {
      await this.pronounTurnsAway();
    }

    return 'talk_done';
  }


  private async printName(): Promise<Next> {
    await this.pronounSays();
    await this.print(I.i_am);
    await this.printString(STRING_NAME);
    this.lda(CHAR.char_period);
    await this.m.call(J.j_console_out);
    await this.newline();

    return 'talk_prompt';
  }


  private async talkPrompt(): Promise<Next> {
    let next: Next;

    await this.print(I.your_interest);
    await this.getInput(V.input_index);
    await this.newline();
    await this.m.call(J.j_rand);
    this.cmp(this.peek(D.dialog_turns_away_probability));
    if (this.carry()) {
      next = await this.checkInput();
    } else {
      next = await this.maybeFight(FIGHT_MARGIN_PROMPT);
    }

    return next;
  }


  private async checkInput(): Promise<Next> {
    let next: Next;

    this.compareKeywords(V.keywords, KEYWORDS.length);
    if (this.negative()) {
      await this.pronounSays();
      await this.print(I.cannot_help);
      next = 'check_question_trigger';
    } else {
      next = await this.keywordMatched();
    }

    return next;
  }


  private async keywordMatched(): Promise<Next> {
    let next: Next;

    if (this.isKeyword(KEYWORD_BYE) || this.isKeyword(KEYWORD_EMPTY)) {
      await this.pronounSays();
      await this.print(I.bye);
      next = 'talk_done';
    } else if (this.isKeyword(KEYWORD_NAME)) {
      next = 'print_name';
    } else if (this.isKeyword(KEYWORD_LOOK)) {
      await this.print(I.you_see);
      next = await this.printResponseNewline(STRING_LOOK);
    } else if (this.isKeyword(KEYWORD_JOIN)) {
      next = await this.checkJoin();
    } else if (this.isKeyword(KEYWORD_GIVE)) {
      next = await this.checkGive();
    } else {
      await this.pronounSaysNewline();
      this.lda(this.peek(zp_string));
      next = await this.printResponseNewline(this.add(0x01));
    }

    return next;
  }


  private isKeyword(keyword: number): boolean {
    this.cmp(keyword);

    return this.zero();
  }


  private async printResponseNewline(string: number): Promise<Next> {
    await this.printString(string);
    await this.newline();

    return 'check_question_trigger';
  }


  private async checkQuestionTrigger(): Promise<Next> {
    let next: Next = 'talk_prompt';

    this.lda(this.peek(zp_string));
    this.cmp(this.peek(D.dialog_question_trigger));
    if (this.zero()) {
      next = await this.askQuestion();
    }

    return next;
  }


  /** Asked until the answer starts with Y or N; for a question of humility, yes is pride. */
  private async askQuestion(): Promise<Next> {
    let answer: number | null = null;

    await this.m.call(J.j_waitkey);
    await this.newline();
    await this.printString(STRING_PRONOUN);
    await this.print(I.asks);
    await this.printString(STRING_QUESTION);
    while (answer == null) {
      await this.print(I.you_respond);
      await this.getInput(V.input_index);
      await this.newline();
      this.lda(this.peek(TABLES.inbuffer));
      this.cmp(CHAR.char_N);
      if (this.zero()) {
        this.incHumility();
        answer = STRING_NO;
      } else {
        this.cmp(CHAR.char_Y);
        if (this.zero()) {
          await this.decHumility();
          answer = STRING_YES;
        } else {
          await this.pronounSaysNewline();
          await this.print(I.yes_or_no);
        }
      }
    }
    await this.pronounSaysNewline();
    this.poke(zp_string, this.lda(answer));

    return this.printResponseNewline(this.cpu.a);
  }


  private async pronounTurnsAway(): Promise<void> {
    await this.printString(STRING_PRONOUN);
    await this.print(I.turns_away);
  }


  private async startCombat(): Promise<void> {
    await this.printString(STRING_PRONOUN);
    await this.print(I.en_garde);
    this.ldx(this.peek(zp_index));
    this.poke(O.npc_movement_ai + this.cpu.x, this.lda(O.ai_hostile));
  }


  private async pronounSays(): Promise<void> {
    await this.printString(STRING_PRONOUN);
    await this.print(I.says);
  }


  private async pronounSaysNewline(): Promise<void> {
    await this.pronounSays();
    await this.newline();
  }


  private async newline(): Promise<void> {
    this.lda(CHAR.char_enter);
    await this.m.call(J.j_console_out);
  }


  /**
   * String A of the record: skipped to past A - 1 ends, then printed to its end, whose character
   * lacks the high bit. The pointer's high byte never moves, as the original's does not.
   */
  private async printString(string: number): Promise<void> {
    let found: boolean = false;
    let ended: boolean = false;

    this.lda(string);
    this.ldx(this.cpu.a);
    this.poke(ZP_MAIN.ptr1, this.lda(D.dialog_strings & 0xFF));
    this.poke(ZP_MAIN.ptr1 + 1, this.lda(D.dialog_strings >> 8));
    while (!found) {
      if (this.dex() === 0) {
        found = true;
      } else {
        let skipping: boolean = true;

        this.ldy(0x00);
        while (skipping) {
          skipping = (this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y)) >= 0x80) && (this.iny() !== 0);
        }
        this.lda(this.cpu.y);
        this.setCarry(true);
        this.cpu.adc(this.peek(ZP_MAIN.ptr1));
        this.poke(ZP_MAIN.ptr1, this.cpu.a);
        found = this.zero();
      }
    }
    while (!ended) {
      this.ldy(0x00);
      if (this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y)) >= 0x80) {
        await this.m.call(J.j_console_out);
        ended = this.inc(ZP_MAIN.ptr1) === 0;
      } else {
        ended = true;
      }
    }
    this.lda(this.cpu.a | 0x80);
    await this.m.call(J.j_console_out);
  }


  // --- joining (TALK.s check_join, accept_join) ---------------------------------------------

  /** Each towne's companion, always its person 0, joins an Avatar or one high enough in its virtue, if the party's leader has the experience. */
  private async checkJoin(): Promise<Next> {
    let next: Next = 'talk_prompt';
    let can: boolean = false;

    if (this.lda(this.peek(ZP_MAIN.diskio_sector)) === 0) {
      this.lda(this.peek(PRTY.current_location));
      this.subtract(0x05);
      this.cmp(TOWNES);
      can = !this.carry();
    }
    if (can) {
      this.poke(towne_virtue, this.cpu.a);
      this.poke(ZP_MAIN.curr_player, this.lda(0x01));
      await this.m.call(J.j_get_stats_ptr);
      this.ldy(ROST.player_class_index);
      this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y));
      this.cmp(this.peek(towne_virtue));
      can = !this.zero();
    }
    if (can) {
      next = await this.joinIfWorthy();
    } else {
      await this.pronounSaysNewline();
      await this.print(I.cannot_join);
    }

    return next;
  }


  private async joinIfWorthy(): Promise<Next> {
    let next: Next = 'talk_prompt';
    let worthy: boolean = true;

    this.ldx(this.peek(towne_virtue));
    if (this.lda(this.peek(ROST.party_stats + this.cpu.x)) !== 0) {
      this.cmp(VIRTUE_TO_JOIN);
      worthy = this.carry();
    }
    if (!worthy) {
      this.poke(zp_number, this.cpu.x);
      await this.printDecline();
    } else {
      this.lda(this.peek(PRTY.party_size));
      this.cmp(this.peek(ROST.player_stats + ROST.player_max_hp_hi));
      if (this.carry()) {
        this.poke(zp_number, this.lda(REASON_EXPERIENCED));
        await this.printDecline();
      } else {
        await this.acceptJoin();
        next = 'talk_done';
      }
    }

    return next;
  }


  private async printDecline(): Promise<void> {
    await this.pronounSaysNewline();
    await this.print(I.thou_art_not);
    await this.declineReason();
    await this.print(I.enough_to_join);
  }


  /** The companion leaves the towne, and its record takes the next place in the party. */
  private async acceptJoin(): Promise<void> {
    let found: boolean = false;

    await this.pronounSaysNewline();
    await this.print(I.honored);
    this.ldx(O.object_max);
    this.lda(0x00);
    this.poke(O.object_tile_type + this.cpu.x, this.cpu.a);
    this.poke(O.object_tile_sprite + this.cpu.x, this.cpu.a);
    this.poke(O.npc_movement_ai + this.cpu.x, this.cpu.a);
    this.poke(O.npc_dialogue + this.cpu.x, this.cpu.a);
    await this.m.call(J.j_update_view);
    this.poke(ZP_MAIN.curr_player, this.lda(ROST.player_last));
    do {
      await this.m.call(J.j_get_stats_ptr);
      this.ldy(ROST.player_class_index);
      this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y));
      this.cmp(this.peek(towne_virtue));
      found = this.zero();
    } while (!found && (this.dec(ZP_MAIN.curr_player) < 0x80));
    if (found) {
      await this.swapIntoParty();
    }
  }


  private async swapIntoParty(): Promise<void> {
    await this.m.call(J.j_get_stats_ptr);
    this.poke(ZP_MAIN.ptr2, this.lda(this.peek(ZP_MAIN.ptr1)));
    this.poke(ZP_MAIN.ptr2 + 1, this.lda(this.peek(ZP_MAIN.ptr1 + 1)));
    this.inc(PRTY.party_size);
    this.poke(ZP_MAIN.curr_player, this.lda(this.peek(PRTY.party_size)));
    await this.m.call(J.j_get_stats_ptr);
    this.ldy(ROST.player_stat_max);
    do {
      const to: number = this.pointer(ZP_MAIN.ptr1) + this.cpu.y;
      const from: number = this.pointer(ZP_MAIN.ptr2) + this.cpu.y;

      this.cpu.push(this.lda(this.peek(to)));
      this.poke(to, this.lda(this.peek(from)));
      this.poke(from, this.lda(this.cpu.pull()));
    } while (this.dey() < 0x80);
    await this.m.call(J.j_clearstatwindow);
    await this.m.call(J.j_update_status);
  }


  /** decline_reason's chain of `dex` / `bne`: the virtue in zp_number, or experience for anything past humility. */
  private async declineReason(): Promise<void> {
    let reason: number = 0;

    this.ldx(this.peek(zp_number));
    while (!this.zero() && (reason < REASON_EXPERIENCED - 1)) {
      this.dex();
      reason++;
    }
    if (!this.zero()) {
      reason = REASON_EXPERIENCED;
    }
    await this.print(REASONS[reason]);
  }


  // --- giving (TALK.s check_give) -----------------------------------------------------------

  private async checkGive(): Promise<Next> {
    this.lda(this.peek(ZP_MAIN.npc_type));
    this.cmp(TILES.tile_beggar);
    if (this.zero()) {
      await this.print(I.how_much);
      await this.m.call(J.j_getnumber);
      await this.newline();
      if (this.lda(this.peek(ZP_MAIN.bcdnum)) !== 0) {
        await this.giveAmount();
      }
    } else {
      await this.pronounSays();
      await this.print(I.keep_it);
    }

    return 'check_question_trigger';
  }


  private async giveAmount(): Promise<void> {
    await this.decGold();
    if (this.negative()) {
      await this.print(I.not_that_much);
    } else {
      this.giveGoldAddVirtue();
      await this.newline();
      await this.pronounSays();
      await this.print(I.thank_thee);
    }
  }


  /** Giving the last of the gold is sacrifice; giving at all is compassion, once in each sixteen moves. */
  private giveGoldAddVirtue(): void {
    if (this.lda(this.peek(ROST.gold_lo) | this.peek(ROST.gold_hi)) === 0) {
      this.lda(0x03);
      this.ldy(ROST.virtue_sacrifice);
      this.incVirtue();
    }
    this.lda(this.peek(PRTY.move_counter + 3) & 0xF0);
    this.cmp(this.peek(PRTY.last_humility_check));
    if (!this.zero()) {
      this.poke(PRTY.last_humility_check, this.cpu.a);
      this.lda(0x02);
      this.ldy(ROST.virtue_compassion);
      this.incVirtue();
    }
  }


  /** Yes to a question of humility is pride: five points of humility. */
  private async decHumility(): Promise<void> {
    if (this.isHumilityQuestion()) {
      this.lda(0x05);
      this.ldy(ROST.virtue_humility);
      await this.decVirtue();
      this.poke(PRTY.last_humility_check, this.lda(this.peek(PRTY.move_counter + 3) & 0xF0));
    }
  }


  /** No is humble: ten points, once in each sixteen moves. */
  private incHumility(): void {
    if (this.isHumilityQuestion()) {
      this.lda(this.peek(PRTY.move_counter + 3) & 0xF0);
      this.cmp(this.peek(PRTY.last_humility_check));
      if (!this.zero()) {
        this.poke(PRTY.last_humility_check, this.cpu.a);
        this.lda(0x0A);
        this.ldy(ROST.virtue_humility);
        this.incVirtue();
      }
    }
  }


  private isHumilityQuestion(): boolean {
    this.lda(this.peek(D.dialog_humility));
    this.cmp(0x01);

    return this.zero();
  }


  /** The amount asked, from the party's gold in BCD, or nothing and $FF if there is not that much. */
  private async decGold(): Promise<void> {
    this.cpu.setFlag(DECIMAL, true);
    this.setCarry(true);
    this.lda(this.peek(ROST.gold_lo));
    this.cpu.sbc(this.peek(ZP_MAIN.bcdnum));
    this.poke(ROST.gold_lo, this.cpu.a);
    this.lda(this.peek(ROST.gold_hi));
    this.cpu.sbc(0x00);
    if (this.carry()) {
      this.poke(ROST.gold_hi, this.cpu.a);
      this.cpu.setFlag(DECIMAL, false);
      await this.m.call(J.j_update_status);
      this.lda(0x00);
    } else {
      this.setCarry(false);
      this.lda(this.peek(ROST.gold_lo));
      this.cpu.adc(this.peek(ZP_MAIN.bcdnum));
      this.poke(ROST.gold_lo, this.cpu.a);
      this.cpu.setFlag(DECIMAL, false);
      this.lda(0xFF);
    }
  }


  private incVirtue(): void {
    this.poke(zp_inc_amount, this.cpu.a);
    this.cpu.setFlag(DECIMAL, true);
    this.setCarry(false);
    if (this.lda(this.peek(ROST.party_stats + this.cpu.y)) !== 0) {
      this.cpu.adc(this.peek(zp_inc_amount));
      if (this.carry()) {
        this.lda(0x99);
      }
    }
    this.poke(ROST.party_stats + this.cpu.y, this.cpu.a);
    this.cpu.setFlag(DECIMAL, false);
  }


  /** A virtue down; one at zero (an eighth of the Avatarhood) is lost, and starts again from 99. Only a borrow to nothing leaves one. */
  private async decVirtue(): Promise<void> {
    this.poke(zp_dec_amount, this.cpu.a);
    this.poke(zp_save_reg, this.cpu.y);
    if (this.lda(this.peek(ROST.party_stats + this.cpu.y)) === 0) {
      await this.print(I.lost_an_eighth);
      this.ldy(this.peek(zp_save_reg));
      this.lda(0x99);
    }
    this.cpu.setFlag(DECIMAL, true);
    this.setCarry(true);
    this.cpu.sbc(this.peek(zp_dec_amount));
    if (!this.carry() && this.zero()) {
      this.lda(0x01);
    }
    this.poke(ROST.party_stats + this.cpu.y, this.cpu.a);
    this.cpu.setFlag(DECIMAL, false);
  }
}


export const TALK_MODULE = overlayModule('towne', 'TALK', OVERLAY_ENTRY, TALK_DATA, (machine: LiftedMachine): Talk => new Talk(machine), (program: Talk): Promise<Exit> => program.run());
