// towne/SHP3.s: the pubs of Britain, Jhelom, Trinsic, Paws, Buccaneer's Den and Vesper, ported. Food
// by the plate; or ale, three mugs at most, and for three gold or more a rumour, each pub knowing one
// and telling it for enough gold. ULT4's load_shop loads it at $8800.

import { DECIMAL } from '../../../lifted-runtime/cpu';
import type { LiftedMachine } from '../../../lifted-runtime/lifted-machine';
import { CHAR, JUMP_SUBS, PRTY, ROST, ZP_MAIN } from '../../../state/symbols';
import { inline } from '../../inline-data';
import type { IInlineData } from '../../inline-data';
import type { Exit } from '../../routine';
import { OVERLAY_ENTRY, overlayModule, text } from '../overlay';
import { ShopOverlay, stringTable } from './shop-overlay';

const J = JUMP_SUBS;
const zp_amount: number = 0xD8;
const zp_input_index: number = 0xD8;
const zp_index: number = 0xEA;
const zp_count: number = 0xF0;
const PUB: number = 0x07;
const SPECIALTY: number = 0x0D;
const RUMOR: number = 0x13;
const DRINKS: number = 0x03;
const ALE: number = 0x02;
const RUMOR_GOLD: number = 0x03;

const SHP3_TABLES = {
  price_current: 0x8CB9,
  unused: 0x8CBA,
  count_drinks: 0x8CBB,
  paid_rumor: 0x8CBC,
  location_table: 0x8CBD,
  price_food: 0x8CCD,
  price_rumor: 0x8CD3,
  string_table: 0x8D49,
} as const;

const T = SHP3_TABLES;

export const SHP3_INLINE = {
  welcome_mate: text(0x8813, ' SAYS:\nWELCOME MATE TO\n'),
  says: text(0x8844, ' SAYS:'),
  what_be: text(0x884E, '\nWHAT\'L IT BE,\n'),
  food_or_ale: text(0x8861, 'FOOD ER ALE?'),
  specialty: text(0x887F, '\nOUR SPECIALTY IS\n'),
  which_costs: text(0x889D, '\nWHICH COSTS '),
  gp: text(0x88B9, 'gp.\n'),
  how_many_plates: text(0x88C1, '\nHOW MANY PLATES\nWOULD YOU\nLIKE?'),
  here_ye_arr: text(0x8937, '\nHERE YE ARR\nSOMETHIN ELSE?'),
  see_ya: text(0x8963, '\nSEE YA MATE!\n'),
  cannot_afford: text(0x898D, '\nYA CANNOT\nAFFORD ANY!'),
  only: text(0x89AA, '\nYA CAN ONLY\nAFFORD '),
  plates: text(0x89C7, ' PLATES.\n'),
  mug: text(0x89E4, '\nHERE\'S A MUG\nOF OUR BEST\nTHAT\'L BE 2gp.\nYOU PAY?'),
  wont_pay: text(0x8A27, '\nWON\'T PAY, EH\nYA SCUM, BE GONE\nFORE EY CALL\nTHE GUARDS!\n'),
  no_gold: text(0x8A6A, '\nIT SEEMS THAT\nYOU HAVE NOT\nTHE GOLD,\nGOOD DAY!\n'),
  what_know: text(0x8AAB, '\nWHAT\'D YA LIKE\nTO KNOW FRIEND?\n'),
  word_black: text(0x8AD2, 'BLAC'),
  word_sextant: text(0x8ADC, 'SEXT'),
  word_white: text(0x8AE6, 'WHIT'),
  word_mandrake: text(0x8AF0, 'MAND'),
  word_skull: text(0x8AFA, 'SKUL'),
  word_nightshade: text(0x8B04, 'NIGH'),
  cant_help: text(0x8B0E, '\n\'FRAID I CAN\'T\nHELP YA THERE\nFRIEND!\n'),
  foggy: text(0x8B6C, '\nTHAT SUBJECT IS\nA BIT FOGGY,\nPERHAPS MORE\nGOLD WILL\nREFRESH MY\nMEMORY.\n'),
  you_give: text(0x8BB8, '\nYOU GIVE:'),
  dont_have: text(0x8BD5, '\nYER DON\'T HAVE\nTHAT MATE!\n'),
  says_line: text(0x8C14, ' SAYS:\n'),
  sorry: text(0x8C2D, '\nSORRY, I COULD\nNOT HEP YA MATE!\n'),
  anythin_else: text(0x8C55, '\nANYTHIN\' ELSE?'),
  too_many: text(0x8C89, ' SAYS:\nSORRY, YOU SEEM\nTO HAVE TOO\nMANY, BYE!\n'),
} as const;

const LOCATION_TABLE: readonly number[] = [
  0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x00, 0x00, 0x03, 0x00, 0x00, 0x04, 0x05, 0x06, 0x00,
];

const PRICE_FOOD: readonly number[] = [
  0x04, 0x02, 0x03, 0x02, 0x04, 0x02,
];

const PRICE_RUMOR: readonly number[] = [
  0x20, 0x30, 0x10, 0x40, 0x99, 0x25,
];

const STRINGS: readonly string[] = [
  '',
  'SAM',
  'CELESTIAL',
  'TERRAN',
  'GREG N ROB',
  'THE CAP\'N',
  'ARRON',
  'JOLLY SPIRITS',
  'THE BLOODY PUB',
  'THE KEG TAP',
  'FOLLEY TAVERN',
  'CAPTAIN BLACK\nTAVERN',
  'AXE N ALE',
  'LAMB CHOPS',
  'DRAGON TARTAR',
  'BROWN BEANS',
  'FOLLEY FILET',
  'DOG MEAT PIE',
  'GREEN GRANUKIT',
  'AH, THE BLACK\nSTONE, YES I\'VE\nHEARD OF IT.\nBUT, THE ONLY\nONE WHO KNOWS\nWHERE IT LIES\nIS THE WIZARD\nMERLIN.\n',
  'FOR NAVIGATION\nA SEXTANT IS\nVITAL... ASK\nFOR ITEM \'D\'\nIN THE GUILD\nSHOPS!\n',
  'HMMM, NOW LET\nME SEE...\nYES, IT WAS THE\nOLD HERMIT...\nSLOVEN! HE IS\nTOUGH TO FIND,\nLIVES NEAR LOCK\nLAKE I HEAR.\n',
  'THE LAST PERSON\nI KNEW THAT HAD\nANY MANDRAKE\nWAS AN OLD\nALCHEMIST NAMED\nCALUMNY.\n',
  'IF THOU MUST\nKNOW OF THAT\nEVILEST OF ALL\nTHINGS... FIND\nTHE BEGGAR\nJUDE. HE IS VERY\nVERY POOR!\n',
  'OF NIGHTSHADE I\nKNOW BUT THIS...\nSEEK OUT VIRGIL\nOR THOU SHALT\nMISS!\nTRY IN TRINSIC!\n',
];


const I = SHP3_INLINE;

/** The subjects asked of the barkeep, by the pub that knows each. */
const SUBJECTS: readonly IInlineData[] = [ I.word_black, I.word_sextant, I.word_white, I.word_mandrake, I.word_skull, I.word_nightshade ];

export const SHP3_DATA: readonly IInlineData[] = [
  ...Object.values(SHP3_INLINE),
  inline(T.price_current, [ 0x00, 0x00, 0x00, 0x00 ]),
  inline(T.location_table, LOCATION_TABLE),
  inline(T.price_food, PRICE_FOOD),
  inline(T.price_rumor, PRICE_RUMOR),
  stringTable(T.string_table, STRINGS),
];

/** Where the pub goes next: SHP3.s's labels that its branches jump back to. */
type Next = 'ask_again' | 'ask_food_or_ale' | 'ask_more' | 'anything_else' | 'bye' | 'done';


export class Shp3 extends ShopOverlay {
  constructor(machine: LiftedMachine) {
    super(machine, T.string_table);
  }


  public async run(): Promise<Exit> {
    let next: Next = 'ask_food_or_ale';

    await this.printNewline();
    this.ldx(this.peek(PRTY.current_location));
    this.dex();
    this.poke(zp_index, this.lda(this.peek(T.location_table + this.cpu.x)));
    this.dec(zp_index);
    await this.printString(this.cpu.a);
    await this.print(I.welcome_mate);
    await this.printString(this.offset(PUB));
    await this.printNewline();
    while (next !== 'done') {
      if (next === 'ask_again') {
        await this.barkeep();
        await this.print(I.says);
        next = 'ask_food_or_ale';
      } else if (next === 'ask_food_or_ale') {
        next = await this.askFoodOrAle();
      } else if (next === 'ask_more') {
        next = await this.askMore();
      } else if (next === 'anything_else') {
        next = await this.anythingElse();
      } else {
        await this.print(I.see_ya);
        next = 'done';
      }
    }

    return null;
  }


  /** `clc` / `lda zp_index` / `adc #offset`: the pub's string at that offset in the table. */
  private offset(at: number): number {
    this.setCarry(false);
    this.lda(this.peek(zp_index));
    this.cpu.adc(at);

    return this.cpu.a;
  }


  private async barkeep(): Promise<void> {
    await this.printString(this.offset(0x01));
  }


  private async askFoodOrAle(): Promise<Next> {
    let next: Next | null = null;

    await this.print(I.what_be);
    while (next == null) {
      await this.print(I.food_or_ale);
      await this.inputChar();
      this.cmp(CHAR.char_F);
      if (this.zero()) {
        next = await this.buyFood();
      } else {
        this.cmp(CHAR.char_A);
        if (this.zero()) {
          next = await this.buyAle();
        }
      }
    }

    return next;
  }


  private async buyFood(): Promise<Next> {
    let next: Next = 'bye';

    await this.print(I.specialty);
    await this.printString(this.offset(SPECIALTY));
    await this.print(I.which_costs);
    this.ldy(this.peek(zp_index));
    this.poke(T.price_current, this.lda(this.peek(T.price_food + this.cpu.y)));
    await this.m.call(J.j_printdigit);
    await this.print(I.gp);
    await this.print(I.how_many_plates);
    await this.m.call(J.j_getnumber);
    await this.printNewline();
    if (this.lda(this.peek(ZP_MAIN.bcdnum)) !== 0) {
      this.decodeBcdValue();
      this.poke(ZP_MAIN.hexnum, this.cpu.a);
      this.poke(zp_count, this.lda(0x00));
      this.cpu.setFlag(DECIMAL, true);
      next = await this.spendOnPlates();
    }

    return next;
  }


  /** A plate's price at a time, in BCD, each a ration more, until all are bought or the gold runs out. */
  private async spendOnPlates(): Promise<Next> {
    let next: Next = 'ask_more';
    let afford: boolean = true;
    let bought: boolean = false;
    const gold: number = ROST.party_stats + ROST.party_stat_gold_hi;
    const food: number = ROST.party_stats + ROST.party_stat_food_lo;

    while (afford && !bought) {
      this.ldy(ROST.party_stat_gold_hi);
      this.setCarry(true);
      this.lda(this.peek(gold + 1));
      this.cpu.sbc(this.peek(T.price_current));
      this.poke(gold + 1, this.cpu.a);
      this.lda(this.peek(gold));
      this.cpu.sbc(0x00);
      this.poke(gold, this.cpu.a);
      afford = this.carry();
      if (afford) {
        this.ldy(ROST.party_stat_food_lo);
        this.setCarry(false);
        this.lda(this.peek(food));
        this.cpu.adc(0x01);
        this.poke(food, this.cpu.a);
        this.dey();
        this.lda(this.peek(food - 1));
        this.cpu.adc(0x00);
        this.poke(food - 1, this.cpu.a);
        if (this.carry()) {
          this.poke(food - 1, this.lda(0x99));
          this.poke(food, this.cpu.a);
        }
        this.inc(zp_count);
        bought = this.dec(ZP_MAIN.hexnum) === 0;
      }
    }
    if (afford) {
      this.cpu.setFlag(DECIMAL, false);
    } else {
      next = await this.cannotAfford();
    }

    return next;
  }


  /** The plate's price back; then none bought, or only some, the count printed as BCD though it is not. */
  private async cannotAfford(): Promise<Next> {
    const gold: number = ROST.party_stats + ROST.party_stat_gold_hi;
    let next: Next = 'bye';

    this.setCarry(false);
    this.lda(this.peek(gold + 1));
    this.cpu.adc(this.peek(T.price_current));
    this.poke(gold + 1, this.cpu.a);
    this.lda(this.peek(gold));
    this.cpu.adc(0x00);
    this.poke(gold, this.cpu.a);
    this.cpu.setFlag(DECIMAL, false);
    if (this.lda(this.peek(zp_count)) === 0) {
      await this.print(I.cannot_afford);
    } else {
      await this.print(I.only);
      this.lda(this.peek(zp_count));
      await this.m.call(J.j_printbcd);
      await this.print(I.plates);
      next = 'ask_more';
    }

    return next;
  }


  private async askMore(): Promise<Next> {
    let next: Next = 'bye';

    await this.m.call(J.j_update_status);
    await this.print(I.here_ye_arr);
    await this.inputChar();
    this.cmp(CHAR.char_Y);
    if (this.zero()) {
      await this.printNewline();
      next = 'ask_again';
    }

    return next;
  }


  /** Ale: three mugs at most, two gold at least; three gold or more buys a question. */
  private async buyAle(): Promise<Next> {
    let next: Next = 'done';

    this.lda(this.peek(T.count_drinks));
    this.cmp(DRINKS);
    if (this.carry()) {
      await this.printNewline();
      await this.barkeep();
      await this.print(I.too_many);
    } else {
      this.inc(T.count_drinks);
      await this.print(I.mug);
      await this.m.call(J.j_getnumber);
      await this.printNewline();
      this.poke(zp_count, this.lda(this.peek(ZP_MAIN.bcdnum)));
      this.cmp(ALE);
      if (!this.carry()) {
        await this.print(I.wont_pay);
      } else {
        this.trySpend(zp_amount);
        if (this.negative()) {
          await this.print(I.no_gold);
        } else {
          await this.m.call(J.j_update_status);
          this.lda(this.peek(ZP_MAIN.hexnum));
          this.cmp(RUMOR_GOLD);
          next = this.carry() ? await this.askRumor() : 'anything_else';
        }
      }
    }

    return next;
  }


  /** A subject asked: only this pub's own, and told for the gold it asks, more given until it is enough. */
  private async askRumor(): Promise<Next> {
    let next: Next = 'anything_else';
    let subject: number = 0;
    let matched: boolean = false;

    await this.print(I.what_know);
    await this.getInput(zp_input_index);
    while (!matched && (subject < SUBJECTS.length)) {
      this.matchInputInline(SUBJECTS[subject]);
      matched = this.zero();
      if (!matched) {
        subject++;
      }
    }
    if (matched) {
      this.lda(subject);
      this.cmp(this.peek(zp_index));
      matched = this.zero();
    }
    if (matched) {
      this.poke(T.paid_rumor, this.lda(this.peek(ZP_MAIN.bcdnum)));
      next = await this.checkBribe();
    } else {
      await this.print(I.cant_help);
    }

    return next;
  }


  private async checkBribe(): Promise<Next> {
    let next: Next | null = null;

    while (next == null) {
      this.lda(this.peek(T.paid_rumor));
      this.ldy(this.peek(zp_index));
      this.cmp(this.peek(T.price_rumor + this.cpu.y));
      if (this.carry()) {
        await this.printRumor();
        next = 'anything_else';
      } else {
        next = await this.priceNotMet();
      }
    }

    return next;
  }


  /** More gold asked for; null to weigh the bribe again with it. */
  private async priceNotMet(): Promise<Next | null> {
    let next: Next | null = null;

    await this.print(I.foggy);
    await this.print(I.you_give);
    await this.m.call(J.j_getnumber);
    await this.printNewline();
    if (this.lda(this.peek(ZP_MAIN.bcdnum)) === 0) {
      next = await this.bribeNotMet();
    } else {
      this.trySpend(zp_amount);
      if (this.negative()) {
        await this.print(I.dont_have);
        next = await this.bribeNotMet();
      } else {
        this.cpu.setFlag(DECIMAL, true);
        this.lda(this.peek(ZP_MAIN.bcdnum));
        this.add(this.peek(T.paid_rumor));
        if (this.carry()) {
          this.lda(0x99);
        }
        this.poke(T.paid_rumor, this.cpu.a);
        this.cpu.setFlag(DECIMAL, false);
      }
    }

    return next;
  }


  private async bribeNotMet(): Promise<Next> {
    await this.print(I.sorry);

    return 'bye';
  }


  private async printRumor(): Promise<void> {
    await this.printNewline();
    await this.barkeep();
    await this.print(I.says_line);
    await this.printString(this.offset(RUMOR));
    await this.printNewline();
  }


  private async anythingElse(): Promise<Next> {
    let next: Next | null = null;

    while (next == null) {
      await this.print(I.anythin_else);
      await this.inputChar();
      this.cmp(CHAR.char_Y);
      if (this.zero()) {
        await this.printNewline();
        next = 'ask_again';
      } else {
        this.cmp(CHAR.char_N);
        if (this.zero()) {
          next = 'bye';
        }
      }
    }

    return next;
  }
}


export const SHP3_MODULE = overlayModule('towne', 'SHP3', OVERLAY_ENTRY, SHP3_DATA, (machine: LiftedMachine): Shp3 => new Shp3(machine), (program: Shp3): Promise<Exit> => program.run());
