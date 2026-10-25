// britannia/LORD.s: Lord British, ported. He greets a newcomer at length and everyone else by name,
// raises each player whose experience has earned a level, and answers what is asked of him: the
// virtues, the quest, his healing, and his help, which is HELP's, BRUN over him and BRUN back. ULT4's
// cmd_talk loads him at $8800 and calls talk_lord_british; HELP's BRUN enters at $8800.

import { DECIMAL } from '../../../lifted-runtime/cpu';
import type { LiftedMachine } from '../../../lifted-runtime/lifted-machine';
import { CHAR, JUMP_OVERLAY, JUMP_SUBS, JUMP_SYSTEM, MUSIC, PRTY, ROST, SOUND, TABLES, ZP_MAIN } from '../../../state/symbols';
import { inline } from '../../inline-data';
import type { IInlineData } from '../../inline-data';
import { PortProgram } from '../../port-program';
import type { Exit } from '../../routine';
import { OVERLAY_ENTRY, overlayModule, text } from './overlay';

const J = JUMP_SUBS;
const zp_level: number = 0xEA;
const zp_index: number = 0xEA;
const zp_input_index: number = 0xEA;
const INPUT_MAX: number = 0x0F;
const WORD_LENGTH: number = 0x06;
const KEYWORD_LENGTH: number = 0x04;

const LORD_TABLES = {
  keyword_handlers: 0x899A,
  keywords: 0x9842,
} as const;

/** The answers, by where keyword_handlers points. */
const ANSWERS = {
  answer_bye: 0x8A34,
  answer_name: 0x8A6C,
  answer_look: 0x8AAB,
  answer_job: 0x8ADE,
  answer_heal: 0x8B21,
  answer_truth: 0x8BAC,
  answer_love: 0x8C13,
  answer_courage: 0x8C82,
  answer_honesty: 0x8CD3,
  answer_compassion: 0x8D31,
  answer_valor: 0x8D8A,
  answer_justice: 0x8DD3,
  answer_sacrifice: 0x8E18,
  answer_honor: 0x8E6F,
  answer_spirituality: 0x8ED1,
  answer_humility: 0x8F2B,
  answer_pride: 0x900B,
  answer_avatar: 0x90FD,
  answer_quest: 0x91B8,
  answer_britannia: 0x92B0,
  answer_ankh: 0x93FA,
  answer_help: 0x947F,
  answer_abyss: 0x949A,
  answer_mondain: 0x95B5,
  answer_minax: 0x95D0,
  answer_exodus: 0x95E9,
  answer_virtue: 0x9603,
} as const;

const A = ANSWERS;


export const LORD_INLINE = {
  welcome: text(0x8813, 'LORD BRITISH\nSAYS: WELCOME\n'),
  alone: text(0x8843, '\nMY FRIEND!\n'),
  one_companion: text(0x8856, '\nAND THEE ALSO\n'),
  exclaim: text(0x886E, '!\n'),
  three_or_more: text(0x8877, '\nAND THY WORTHY\nADVENTURERS!\n'),
  now_level: text(0x88ED, '\nTHOU ART NOW\nLEVEL '),
  ask_me: text(0x8924, '\nWHAT WOULDST\nTHOU ASK OF ME?\n'),
  next_question: text(0x894E, '\nWHAT ELSE?\n'),
  cannot_help: text(0x8969, 'I CANNOT HELP\nTHEE WITH THAT.\n'),
  lb_says: text(0x89D5, '\nLORD BRITISH\nSAYS: \n'),
  he_says: text(0x89EF, '\nHE SAYS:\n'),
  he_asks: text(0x89FE, '\nHE ASKS:\n'),
  yes_or_no: text(0x8A20, '\nYES OR NO:\n'),
  bye: text(0x8A3A, 'FARE THEE\nWELL MY FRIEND'),
  bye_friend: text(0x8A5C, '!\n'),
  bye_friends: text(0x8A65, 'S!\n'),
  name: text(0x8A72, 'MY NAME IS\nLORD BRITISH,\nSOVEREIGN OF\nALL BRITANNIA!\n'),
  look: text(0x8AAE, 'THOU SEEST THE\nKING WITH THE\nROYAL SCEPTRE.\n'),
  job: text(0x8AE4, 'I RULE ALL\nBRITANNIA, AND\nSHALL DO MY BEST\nTO HELP THEE!\n'),
  heal: text(0x8B27, 'I AM WELL,\nTHANK YE.\n'),
  heal_2: text(0x8B43, 'ART THOU WELL?\n'),
  heal_3: text(0x8B5E, 'THAT IS GOOD.\n'),
  heal_4: text(0x8B76, 'LET ME HEAL\nTHY WOUNDS!\n'),
  truth: text(0x8BB2, 'MANY TRUTHS CAN\nBE LEARNED AT\nTHE LYCAEUM. IT\nLIES ON THE\nNORTHWESTERN\nSHORE OF VERITY\nISLE!\n'),
  love: text(0x8C19, 'LOOK FOR THE\nMEANING OF LOVE\nAT EMPATH ABBEY.\nTHE ABBEY SITS\nON THE WESTERN\nEDGE OF THE DEEP\nFOREST!\n'),
  courage: text(0x8C88, 'SERPENT CASTLE\nON THE ISLE OF\nDEEDS IS WHERE\nCOURAGE SHOULD\nBE SOUGHT!\n'),
  honesty: text(0x8CD9, 'THE FAIR TOWNE\nOF MOONGLOW, ON\nVERITY ISLE, IS\nWHERE THE VIRTUE\nOF HONESTY\nTHRIVES!\n'),
  compassion: text(0x8D37, 'THE BARDS IN THE\nTOWNE OF BRITAIN\nARE WELL VERSED\nIN THE VIRTUE OF\nCOMPASSION!\n'),
  valor: text(0x8D90, 'MANY VALIANT\nFIGHTERS COME\nFROM JHELOM,\nIN THE VALARIAN\nISLES!\n'),
  justice: text(0x8DD9, 'IN THE CITY OF\nYEW, IN THE DEEP\nFOREST, JUSTICE\nIS SERVED!\n'),
  sacrifice: text(0x8E1E, 'MINOC, TOWNE OF\nSELF-SACRIFICE,\nLIES ON THE\nEASTERN SHORES\nOF LOST HOPE\nBAY!\n'),
  honor: text(0x8E75, 'THE PALADINS WHO\nSTRIVE FOR HONOR\nARE OFT SEEN IN\nTRINSIC, NORTH\nOF THE CAPE OF\nHEROES!\n'),
  spirituality: text(0x8ED7, 'IN SKARA BRAE\nTHE SPIRITUAL\nPATH IS TAUGHT.\nFIND IT ON AN\nISLE NEAR\nSPIRITWOOD!\n'),
  humility: text(0x8F31, 'HUMILITY IS THE\nFOUNDATION OF\nVIRTUE! THE\nRUINS OF PROUD\nMAGINCIA ARE A\nTESTIMONY UNTO\nTHE VIRTUE OF\nHUMILITY!\n'),
  humility_2: text(0x8FA7, '\nFIND THE RUINS\nOF MAGINCIA FAR\nOFF THE SHORES\nOF BRITANNIA,\nON A SMALL ISLE\nIN THE VAST\nOCEAN!\n'),
  pride: text(0x9011, 'OF THE EIGHT\nCOMBINATIONS OF\nTRUTH, LOVE AND\nCOURAGE, THAT\nWHICH CONTAINS\nNEITHER TRUTH,\nLOVE NOR COURAGE\nIS PRIDE.\n'),
  pride_2: text(0x908C, '\nPRIDE BEING NOT\nA VIRTUE MUST BE\nSHUNNED IN FAVOR\nOF HUMILITY, THE\nVIRTUE WHICH IS\nTHE ANTITHESIS\nOF PRIDE!\n'),
  avatar: text(0x9103, 'TO BE AN AVATAR\nIS TO BE THE\nEMBODIMENT OF\nTHE EIGHT\nVIRTUES.\n'),
  avatar_2: text(0x9148, '\nIT IS TO LIVE A\nLIFE CONSTANTLY\nAND FOREVER IN\nTHE QUEST TO\nBETTER THYSELF\nAND THE WORLD IN\nWHICH WE LIVE.\n'),
  quest: text(0x91BE, 'THE QUEST OF\nTHE AVATAR IS\nIS TO KNOW AND\nBECOME THE\nEMBODIMENT OF\nTHE EIGHT\nVIRTUES OF\nGOODNESS!\n'),
  quest_2: text(0x9227, '\nIT IS KNOWN THAT\nALL WHO TAKE ON\nTHIS QUEST MUST\nPROVE THEMSELVES\nBY CONQUERING\nTHE ABYSS AND\nVIEWING THE\nCODEX OF\nULTIMATE WISDOM!\n'),
  britannia: text(0x92B6, 'EVEN THOUGH THE\nGREAT EVIL LORDS\nHAVE BEEN ROUTED\nEVIL YET REMAINS\nIN BRITANNIA.\n'),
  britannia_2: text(0x930E, '\nIF BUT ONE SOUL\nCOULD COMPLETE\nTHE QUEST OF THE\nAVATAR, OUR\nPEOPLE WOULD\nHAVE A NEW HOPE,\nA NEW GOAL FOR\nLIFE.\n'),
  britannia_3: text(0x9385, '\nTHERE WOULD BE A\nSHINING EXAMPLE\nTHAT THERE IS\nMORE TO LIFE\nTHAN THE ENDLESS\nSTRUGGLE FOR\nPOSSESSIONS\nAND GOLD!\n'),
  ankh: text(0x9400, 'THE ANKH IS THE\nSYMBOL OF ONE\nWHO STRIVES FOR\nVIRTUE. KEEP IT\nWITH THEE AT\nALL TIMES FOR BY\nTHIS MARK THOU\nSHALT BE KNOWN!\n'),
  brun_help: text(0x9487, '\u0004BRUN HELP,A$8800\n'),
  abyss: text(0x94A0, 'THE GREAT\nSTYGIAN ABYSS\nIS THE DARKEST\nPOCKET OF EVIL\nREMAINING IN\nBRITANNIA!\n'),
  abyss_2: text(0x94F5, '\nIT IS SAID THAT\nIN THE DEEPEST\nRECESSES OF THE\nABYSS IS THE\nCHAMBER OF THE\nCODEX!\n'),
  abyss_3: text(0x954F, '\nIT IS ALSO SAID\nTHAT ONLY ONE OF\nHIGHEST VIRTUE\nMAY ENTER THIS\nCHAMBER, ONE\nSUCH AS AN\nAVATAR!!!\n'),
  mondain: text(0x95BB, 'MONDAIN IS DEAD!\n'),
  minax: text(0x95D6, 'MINAX IS DEAD!\n'),
  exodus: text(0x95EF, 'EXODUS IS DEAD!\n'),
  virtue: text(0x9609, 'THE EIGHT\nVIRTUES OF THE\nAVATAR ARE:\n'),
  virtue_2: text(0x9635, 'HONESTY,\nCOMPASSION,\nVALOR,\nJUSTICE,\nSACRIFICE,\nHONOR,\nSPIRITUALITY,\nAND HUMILITY!\n'),
  lb_intro: text(0x968F, 'LORD BRITISH\nRISES AND SAYS:\nAT LONG LAST!\n'),
  lb_intro_2: text(0x96C5, '\nTHOU HAST COME!\nWE HAVE WAITED\nSUCH A LONG,\nLONG TIME...\n'),
  lb_intro_3: text(0x9706, '\nLORD BRITISH\nSITS AND SAYS:\nA NEW AGE IS\nUPON BRITANNIA.\nTHE GREAT EVIL\nLORDS ARE GONE\nBUT OUR PEOPLE\nLACK DIRECTION\nAND PURPOSE IN\nTHEIR LIVES...'),
  lb_intro_4: text(0x97A0, '\n\nA CHAMPION OF\nVIRTUE IS CALLED\nFOR. THOU MAYST\nBE THIS\nCHAMPION, BUT\nONLY TIME SHALL\nTELL. I WILL AID\nTHEE ANY WAY\nTHAT I CAN!\n'),
  lb_intro_5: text(0x9828, '\nHOW MAY I\nHELP THEE?\n'),
} as const;

const I = LORD_INLINE;

/** keywords: the first four letters of each subject, in keyword_handlers' order, then the end. */
const KEYWORDS: readonly string[] = [
  '    ', 'BYE ', 'NAME', 'LOOK', 'JOB ', 'HEAL', 'TRUT', 'LOVE', 'COUR', 'HONE', 'COMP', 'VALO', 'JUST', 'SACR', 'HONO', 'SPIR', 'HUMI', 'PRID',
  'AVAT', 'QUES', 'BRIT', 'ANKH', 'HELP', 'ABYS', 'MOND', 'MINA', 'EXOD', 'VIRT',
];

const HANDLERS: readonly number[] = [
  A.answer_bye, A.answer_bye, A.answer_name, A.answer_look, A.answer_job, A.answer_heal, A.answer_truth, A.answer_love, A.answer_courage,
  A.answer_honesty, A.answer_compassion, A.answer_valor, A.answer_justice, A.answer_sacrifice, A.answer_honor, A.answer_spirituality,
  A.answer_humility, A.answer_pride, A.answer_avatar, A.answer_quest, A.answer_britannia, A.answer_ankh, A.answer_help, A.answer_abyss,
  A.answer_mondain, A.answer_minax, A.answer_exodus, A.answer_virtue,
];

export const LORD_DATA: readonly IInlineData[] = [
  ...Object.values(LORD_INLINE),
  inline(LORD_TABLES.keyword_handlers, HANDLERS.flatMap((address: number): number[] => [ address & 0xFF, address >> 8 ])),
  inline(LORD_TABLES.keywords, [ ...KEYWORDS.flatMap((keyword: string): number[] => [ ...keyword ].map((letter: string): number => letter.charCodeAt(0) | 0x80)), 0, 0, 0, 0 ]),
];

/** Who speaks before an answer: Lord British by name, or "he". */
type Speaker = 'lord_british' | 'he' | 'none';

/** An answer that is only told: its speaker, and its pages, a key waited for between each. */
type Telling = readonly [ Speaker, ...IInlineData[] ];

const TELLINGS: ReadonlyMap<number, Telling> = new Map<number, Telling>([
  [ A.answer_name, [ 'he', I.name ] ],
  [ A.answer_look, [ 'none', I.look ] ],
  [ A.answer_job, [ 'he', I.job ] ],
  [ A.answer_truth, [ 'he', I.truth ] ],
  [ A.answer_love, [ 'he', I.love ] ],
  [ A.answer_courage, [ 'he', I.courage ] ],
  [ A.answer_honesty, [ 'he', I.honesty ] ],
  [ A.answer_compassion, [ 'he', I.compassion ] ],
  [ A.answer_valor, [ 'he', I.valor ] ],
  [ A.answer_justice, [ 'he', I.justice ] ],
  [ A.answer_sacrifice, [ 'he', I.sacrifice ] ],
  [ A.answer_honor, [ 'he', I.honor ] ],
  [ A.answer_spirituality, [ 'he', I.spirituality ] ],
  [ A.answer_humility, [ 'he', I.humility, I.humility_2 ] ],
  [ A.answer_pride, [ 'he', I.pride, I.pride_2 ] ],
  [ A.answer_avatar, [ 'lord_british', I.avatar, I.avatar_2 ] ],
  [ A.answer_quest, [ 'lord_british', I.quest, I.quest_2 ] ],
  [ A.answer_britannia, [ 'he', I.britannia, I.britannia_2, I.britannia_3 ] ],
  [ A.answer_ankh, [ 'he', I.ankh ] ],
  [ A.answer_abyss, [ 'he', I.abyss, I.abyss_2, I.abyss_3 ] ],
  [ A.answer_mondain, [ 'he', I.mondain ] ],
  [ A.answer_minax, [ 'he', I.minax ] ],
  [ A.answer_exodus, [ 'he', I.exodus ] ],
  [ A.answer_virtue, [ 'he', I.virtue, I.virtue_2 ] ],
]);

/** Where the conversation goes after an answer: the next question, farewell, or out to HELP. */
type Next = 'question' | 'bye' | number;


export class LordError extends Error {
}


export class Lord extends PortProgram {
  /** $8800, from HELP's BRUN: the two frames it leaves dropped, and the next question. */
  public run(): Promise<Exit> {
    for (let pull: number = 0; pull < 4; pull++) {
      this.lda(this.cpu.pull());
    }

    return this.converse(true);
  }


  /** ULT4.s talk_lord_british: the first meeting, or a welcome and a level for each who has earned one. */
  public async talkLordBritish(): Promise<Exit> {
    if (this.lda(this.peek(PRTY.player_has_spoken_to_lb)) === 0) {
      this.inc(PRTY.player_has_spoken_to_lb);
      await this.intro();
    } else {
      await this.welcome();
      await this.checkXp();
      await this.callWith(J.j_primm, I.ask_me);
    }

    return this.converse(false);
  }


  private async intro(): Promise<void> {
    await this.callWith(J.j_primm, I.lb_intro);
    this.poke(ZP_MAIN.curr_player, this.lda(0x01));
    await this.m.call(J.j_printname);
    await this.callWith(J.j_primm, I.lb_intro_2);
    for (const page of [ I.lb_intro_3, I.lb_intro_4, I.lb_intro_5 ]) {
      await this.m.call(J.j_waitkey);
      await this.callWith(J.j_primm, page);
    }
  }


  private async welcome(): Promise<void> {
    await this.callWith(J.j_primm, I.welcome);
    this.poke(ZP_MAIN.curr_player, this.lda(0x01));
    await this.m.call(J.j_printname);
    this.lda(this.peek(PRTY.party_size));
    this.cmp(0x02);
    if (!this.carry()) {
      await this.callWith(J.j_primm, I.alone);
    } else if (this.zero()) {
      await this.callWith(J.j_primm, I.one_companion);
      this.inc(ZP_MAIN.curr_player);
      await this.m.call(J.j_printname);
      await this.callWith(J.j_primm, I.exclaim);
    } else {
      await this.callWith(J.j_primm, I.three_or_more);
    }
  }


  /** Each player's level: one more than the number of halvings that empty its experience's high byte. */
  private async checkXp(): Promise<void> {
    this.poke(ZP_MAIN.curr_player, this.lda(this.peek(PRTY.party_size)));
    do {
      await this.m.call(J.j_get_stats_ptr);
      this.ldy(ROST.player_experience_hi);
      this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y));
      this.decodeBcdValue();
      this.ldx(0x01);
      while (this.cpu.a !== 0) {
        this.cpu.a = this.cpu.lsr(this.cpu.a);
        this.inx();
      }
      this.lda(this.cpu.x);
      this.ldy(ROST.player_max_hp_hi);
      this.cmp(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y));
      if (!this.zero()) {
        await this.levelUp();
      }
    } while (this.dec(ZP_MAIN.curr_player) !== 0);
  }


  private async levelUp(): Promise<void> {
    this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.cpu.a);
    this.poke(zp_level, this.cpu.a);
    this.ldy(ROST.player_cur_hp_hi);
    this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.cpu.a);
    this.lda(0x00);
    this.iny();
    this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.cpu.a);
    await this.m.call(J.j_get_stats_ptr);
    this.ldy(ROST.player_status);
    this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.lda(ROST.status_Good));
    this.ldy(ROST.player_intelligence);
    do {
      await this.m.call(J.j_rand);
      this.lda(this.cpu.a & 0x07);
      this.cpu.setFlag(DECIMAL, true);
      this.setCarry(true);
      this.cpu.adc(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y));
      this.cpu.setFlag(DECIMAL, false);
      this.cmp(ROST.stat_max + 1);
      if (this.carry()) {
        this.lda(ROST.stat_max);
      }
      this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.cpu.a);
      this.dey();
      this.cpu.compare(this.cpu.y, ROST.player_strength);
    } while (this.carry());
    await this.printNewline();
    await this.m.call(J.j_printname);
    await this.callWith(J.j_primm, I.now_level);
    this.lda(this.peek(zp_level));
    await this.m.call(J.j_printdigit);
    await this.printNewline();
    await this.spellEffect();
    await this.m.call(J.j_update_status);
  }


  private async spellEffect(): Promise<void> {
    await this.m.call(J.j_invertview);
    this.lda(SOUND.sound_spell_effect);
    this.ldx(0xC0);
    await this.m.call(J.j_playsfx);
    await this.m.call(J.j_invertview);
  }


  /** The conversation from the next question, or from the first word, until farewell or HELP. */
  private async converse(asking: boolean): Promise<Exit> {
    let next: Next = 'question';
    let ask: boolean = asking;

    while (next === 'question') {
      if (ask) {
        await this.nextQuestion();
      }
      ask = true;
      next = await this.inputWord();
    }

    return (next === 'bye') ? null : next;
  }


  private async nextQuestion(): Promise<void> {
    this.lda(MUSIC.music_hail_britannia);
    await this.m.call(JUMP_SYSTEM.music_ctl);
    await this.callWith(J.j_primm, I.next_question);
  }


  private async inputWord(): Promise<Next> {
    let next: Next = 'question';

    await this.getInput();
    this.checkKeywords();
    if (this.negative()) {
      await this.printHeSays();
      await this.callWith(J.j_primm, I.cannot_help);
    } else {
      this.cpu.a = this.cpu.asl(this.cpu.a);
      this.ldy(this.cpu.a);
      this.poke(ZP_MAIN.ptr1, this.lda(this.peek(LORD_TABLES.keyword_handlers + this.cpu.y)));
      this.poke(ZP_MAIN.ptr1 + 1, this.lda(this.peek(LORD_TABLES.keyword_handlers + 1 + this.cpu.y)));
      next = await this.answer(this.pointer(ZP_MAIN.ptr1));
    }

    return next;
  }


  private async answer(handler: number): Promise<Next> {
    const telling: Telling | undefined = TELLINGS.get(handler);
    let next: Next = 'question';

    if (telling != null) {
      await this.tell(telling);
    } else if (handler === A.answer_bye) {
      await this.bye();
      next = 'bye';
    } else if (handler === A.answer_heal) {
      await this.heal();
    } else if (handler === A.answer_help) {
      next = await this.help();
    } else {
      throw new LordError(`keyword_handlers points at $${ handler.toString(16) }`);
    }

    return next;
  }


  private async tell([ speaker, ...pages ]: Telling): Promise<void> {
    if (speaker === 'he') {
      await this.printHeSays();
    } else if (speaker === 'lord_british') {
      await this.callWith(J.j_primm, I.lb_says);
    }
    for (const [ index, page ] of pages.entries()) {
      if (index > 0) {
        await this.m.call(J.j_waitkey);
      }
      await this.callWith(J.j_primm, page);
    }
  }


  private async bye(): Promise<void> {
    await this.callWith(J.j_primm, I.lb_says);
    await this.callWith(J.j_primm, I.bye);
    this.lda(this.peek(PRTY.party_size));
    this.cmp(0x01);
    await this.callWith(J.j_primm, this.zero() ? I.bye_friend : I.bye_friends);
  }


  /** HEAL: well, and nothing happens; not, and the party is healed. */
  private async heal(): Promise<void> {
    await this.printHeSays();
    await this.callWith(J.j_primm, I.heal);
    await this.callWith(J.j_primm, I.he_asks);
    await this.printNewline();
    await this.callWith(J.j_primm, I.heal_2);
    await this.askYOrN();
    const well: boolean = this.zero();

    await this.printHeSays();
    if (well) {
      await this.callWith(J.j_primm, I.heal_3);
    } else {
      await this.callWith(J.j_primm, I.heal_4);
      this.ldx(0x14);
      this.lda(SOUND.sound_cast);
      await this.m.call(J.j_playsfx);
      await this.spellEffect();
      await this.restorePartyHp();
      await this.m.call(J.j_update_status);
    }
  }


  /** HELP: HELP BRUN over this overlay, by a JSR to primm_cout whose BRUN never returns. */
  private async help(): Promise<number> {
    this.lda(MUSIC.music_off);
    await this.m.call(JUMP_SYSTEM.music_ctl);
    this.cpu.pushWord(I.brun_help.address - 1);

    return J.j_primm_cout;
  }


  private async printHeSays(): Promise<void> {
    await this.callWith(J.j_primm, I.he_says);
  }


  private async printNewline(): Promise<void> {
    this.lda(CHAR.char_enter);
    await this.m.call(J.j_console_out);
  }


  private async askYOrN(): Promise<void> {
    await this.getInput();
    this.lda(this.peek(TABLES.inbuffer));
    this.cmp(CHAR.char_Y);
    if (this.zero()) {
      this.lda(0x00);
    } else {
      this.cmp(CHAR.char_N);
      if (this.zero()) {
        this.lda(0x01);
      } else {
        await this.callWith(J.j_primm, I.yes_or_no);
      }
    }
  }


  /** check_keywords: A the subject whose four letters the word starts with, or $FF. */
  private checkKeywords(): void {
    let result: 'found' | 'end' | null = null;

    this.poke(zp_index, this.lda(0x00));
    while (result == null) {
      this.lda(this.peek(zp_index));
      this.ldy(this.cpu.asl(this.cpu.asl(this.cpu.a)));
      this.ldx(0x00);
      let matching: boolean = true;

      while ((result == null) && matching) {
        if (this.lda(this.peek(LORD_TABLES.keywords + this.cpu.y)) === 0) {
          result = 'end';
        } else {
          this.cmp(this.peek(TABLES.inbuffer + this.cpu.x));
          matching = this.zero();
          if (matching) {
            this.iny();
            this.inx();
            this.cpu.compare(this.cpu.x, KEYWORD_LENGTH);
            result = this.carry() ? 'found' : null;
          }
        }
      }
      if (!matching) {
        this.inc(zp_index);
      }
    }
    this.lda((result === 'found') ? this.peek(zp_index) : 0xFF);
  }


  /** get_input: a word of up to fifteen letters, ended by RETURN, with the left arrow to rub out, padded with spaces to six. */
  private async getInput(): Promise<void> {
    let done: boolean = false;

    this.lda(CHAR.char_question);
    await this.m.call(J.j_console_out);
    this.poke(zp_input_index, this.lda(0x00));
    while (!done) {
      await this.m.call(J.j_waitkey);
      this.cmp(CHAR.char_enter);
      if (this.zero()) {
        done = true;
      } else {
        this.cmp(CHAR.char_left_arrow);
        if (this.zero()) {
          await this.rubOut();
        } else {
          this.cmp(CHAR.char_space);
          if (this.carry()) {
            this.ldx(this.peek(zp_input_index));
            this.poke(TABLES.inbuffer + this.cpu.x, this.cpu.a);
            await this.m.call(J.j_console_out);
            this.inc(zp_input_index);
            this.lda(this.peek(zp_input_index));
            this.cmp(INPUT_MAX);
            done = this.carry();
          }
        }
      }
    }
    this.ldx(this.peek(zp_input_index));
    this.lda(CHAR.char_space);
    do {
      this.poke(TABLES.inbuffer + this.cpu.x, this.cpu.a);
      this.inx();
      this.cpu.compare(this.cpu.x, WORD_LENGTH);
    } while (!this.carry());
    this.lda(CHAR.char_enter);
    await this.m.call(J.j_console_out);
  }


  private async rubOut(): Promise<void> {
    if (this.lda(this.peek(zp_input_index)) !== 0) {
      this.dec(zp_input_index);
      this.dec(ZP_MAIN.console_xpos);
      this.lda(CHAR.char_space);
      await this.m.call(J.j_console_out);
      this.dec(ZP_MAIN.console_xpos);
    }
  }


  /** Every player not dead is made well, with all its hit points. */
  private async restorePartyHp(): Promise<void> {
    this.poke(ZP_MAIN.curr_player, this.lda(this.peek(PRTY.party_size)));
    do {
      await this.m.call(J.j_get_stats_ptr);
      this.ldy(ROST.player_status);
      this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y));
      this.cmp(ROST.status_Dead);
      if (!this.zero()) {
        this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.lda(ROST.status_Good));
        for (const [ from, to ] of [ [ ROST.player_max_hp_hi, ROST.player_cur_hp_hi ], [ ROST.player_max_hp_lo, ROST.player_cur_hp_lo ] ]) {
          this.ldy(from);
          this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y));
          this.ldy(to);
          this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.cpu.a);
        }
      }
    } while (this.dec(ZP_MAIN.curr_player) !== 0);
  }


  /** LORD's own decode_bcd_value: A from BCD to binary, by counting down in decimal mode. */
  private decodeBcdValue(): void {
    this.cmp(0x00);
    if (!this.zero()) {
      this.ldx(0x00);
      this.cpu.setFlag(DECIMAL, true);
      do {
        this.inx();
        this.subtract(0x01);
      } while (!this.zero());
      this.lda(this.cpu.x);
      this.cpu.setFlag(DECIMAL, false);
    }
  }
}


export const LORD_MODULE = overlayModule('LORD', OVERLAY_ENTRY, LORD_DATA, (machine: LiftedMachine): Lord => new Lord(machine),
  (program: Lord): Promise<Exit> => program.run(),
  [ [ JUMP_OVERLAY.talk_lord_british, (program: Lord): Promise<Exit> => program.talkLordBritish() ] ]);
