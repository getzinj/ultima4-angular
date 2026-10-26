// towne/SHP2.s: the grocers of Moonglow, Britain, Yew, Skara Brae and Paws, ported: rations in packs
// of 25 at the towne's price, as many as the party can afford. ULT4's load_shop loads it at $8800.

import { DECIMAL } from '../../../lifted-runtime/cpu';
import type { LiftedMachine } from '../../../lifted-runtime/lifted-machine';
import { CHAR, JUMP_SUBS, PRTY, ROST, ZP_MAIN } from '../../../state/symbols';
import { inline } from '../../inline-data';
import type { IInlineData } from '../../inline-data';
import type { Exit } from '../../routine';
import { OVERLAY_ENTRY, overlayModule, text } from '../overlay';
import { ShopOverlay, stringTable } from './shop-overlay';

const J = JUMP_SUBS;
const zp_shop_num: number = 0xEA;
const zp_attempts: number = 0xF0;
const PROPRIETOR: number = 0x06;
const PACK: number = 0x25;

const SHP2_TABLES = {
  price: 0x89ED,
  location_table: 0x89EE,
  price_table: 0x89FE,
  string_table: 0x8A73,
} as const;

const T = SHP2_TABLES;

export const SHP2_INLINE = {
  welcome_to: text(0x8803, '\nWELCOME TO\n'),
  greeting: text(0x882E, ' SAYS:\nGOOD DAY, AND\nWELCOME FRIEND.\n\nMAY I INTEREST\nYOU IN SOME\nRATIONS?'),
  rations: text(0x8885, '\nWE HAVE THE\nBEST ADVENTURE\nRATIONS, 25 FOR\nONLY '),
  gp: text(0x88C5, 'gp.\n'),
  how_many: text(0x88CD, '\nHOW MANY PACKS\nOF 25 WOULD\nYOU LIKE?'),
  thank_you: text(0x8948, '\nTHANK YOU,\nANYTHING ELSE?'),
  goodbye: text(0x8970, '\nGOODBYE,\nCOME AGAIN!\n'),
  cannot_afford: text(0x89A2, '\nYOU CANNOT\nAFFORD ANY!'),
  only: text(0x89C0, '\nYOU CAN ONLY\nAFFORD '),
  packs: text(0x89E1, ' PACKS.\n'),
} as const;

const LOCATION_TABLE: readonly number[] = [
  0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x00, 0x03, 0x00, 0x00, 0x04, 0x00, 0x05, 0x00, 0x00, 0x00,
];

const PRICE_TABLE: readonly number[] = [
  0x25, 0x40, 0x35, 0x20, 0x30,
];

const STRINGS: readonly string[] = [
  '',
  'THE SAGE DELI',
  'ADVENTURE FOOD',
  'THE DRY GOODS',
  'FOOD FOR THOUGHT',
  'THE MARKET',
  'SHAMAN',
  'WINDRICK',
  'DONNAR',
  'MINTOL',
  'MAX',
];


const I = SHP2_INLINE;

export const SHP2_DATA: readonly IInlineData[] = [
  ...Object.values(SHP2_INLINE),
  inline(T.price, [ 0x00 ]),
  inline(T.location_table, LOCATION_TABLE),
  inline(T.price_table, PRICE_TABLE),
  stringTable(T.string_table, STRINGS),
];


export class Shp2 extends ShopOverlay {
  constructor(machine: LiftedMachine) {
    super(machine, T.string_table);
  }


  public async run(): Promise<Exit> {
    await this.print(I.welcome_to);
    this.ldx(this.peek(PRTY.current_location));
    this.dex();
    this.poke(zp_shop_num, this.lda(this.peek(T.location_table + this.cpu.x)));
    this.dec(zp_shop_num);
    await this.printString(this.cpu.a);
    await this.printNewline();
    await this.printNewline();
    this.setCarry(false);
    this.lda(this.peek(zp_shop_num));
    this.cpu.adc(PROPRIETOR);
    await this.printString(this.cpu.a);
    await this.print(I.greeting);
    await this.inputChar();
    this.cmp(CHAR.char_Y);
    if (this.zero()) {
      await this.print(I.rations);
      this.ldy(this.peek(zp_shop_num));
      this.poke(T.price, this.lda(this.peek(T.price_table + this.cpu.y)));
      await this.m.call(J.j_printbcd);
      await this.print(I.gp);
      await this.buy();
    }
    await this.print(I.goodbye);

    return null;
  }


  /** How many packs, again while the party wants more, until it asks for none or can afford no more. */
  private async buy(): Promise<void> {
    let more: boolean = true;

    while (more) {
      await this.print(I.how_many);
      await this.m.call(J.j_getnumber);
      await this.printNewline();
      if (this.lda(this.peek(ZP_MAIN.bcdnum)) === 0) {
        more = false;
      } else {
        this.decodeBcdValue();
        this.poke(ZP_MAIN.hexnum, this.cpu.a);
        this.poke(zp_attempts, this.lda(0x00));
        this.cpu.setFlag(DECIMAL, true);
        more = await this.spend() && await this.askMore();
      }
    }
  }


  /** A pack's price at a time, in BCD, until all are bought or the gold runs out; false if none could be. */
  private async spend(): Promise<boolean> {
    let afford: boolean = true;
    let bought: boolean = false;
    const gold: number = ROST.party_stats + ROST.party_stat_gold_hi;
    const food: number = ROST.party_stats + ROST.party_stat_food_lo;

    while (afford && !bought) {
      this.ldy(ROST.party_stat_gold_hi);
      this.setCarry(true);
      this.lda(this.peek(gold + 1));
      this.cpu.sbc(this.peek(T.price));
      this.poke(gold + 1, this.cpu.a);
      this.lda(this.peek(gold));
      this.cpu.sbc(0x00);
      this.poke(gold, this.cpu.a);
      afford = this.carry();
      if (afford) {
        this.ldy(ROST.party_stat_food_lo);
        this.setCarry(false);
        this.lda(this.peek(food));
        this.cpu.adc(PACK);
        this.poke(food, this.cpu.a);
        this.dey();
        this.lda(this.peek(food - 1));
        this.cpu.adc(0x00);
        this.poke(food - 1, this.cpu.a);
        if (this.carry()) {
          this.poke(food - 1, this.lda(0x99));
          this.poke(food, this.cpu.a);
        }
        this.inc(zp_attempts);
        bought = this.dec(ZP_MAIN.hexnum) === 0;
      }
    }
    if (afford) {
      this.cpu.setFlag(DECIMAL, false);
    } else {
      afford = await this.cannotAfford();
    }

    return afford;
  }


  /** The pack's price back; then none bought, or only some. */
  private async cannotAfford(): Promise<boolean> {
    const gold: number = ROST.party_stats + ROST.party_stat_gold_hi;
    let some: boolean = false;

    this.setCarry(false);
    this.lda(this.peek(gold + 1));
    this.cpu.adc(this.peek(T.price));
    this.poke(gold + 1, this.cpu.a);
    this.lda(this.peek(gold));
    this.cpu.adc(0x00);
    this.poke(gold, this.cpu.a);
    this.cpu.setFlag(DECIMAL, false);
    if (this.lda(this.peek(zp_attempts)) === 0) {
      await this.print(I.cannot_afford);
    } else {
      await this.print(I.only);
      this.lda(this.peek(zp_attempts));
      this.encodeBcdValue();
      await this.m.call(J.j_printbcd);
      await this.print(I.packs);
      some = true;
    }

    return some;
  }


  private async askMore(): Promise<boolean> {
    await this.m.call(J.j_update_status);
    await this.print(I.thank_you);
    await this.inputChar();
    this.cmp(CHAR.char_Y);

    return this.zero();
  }
}


export const SHP2_MODULE = overlayModule('towne', 'SHP2', OVERLAY_ENTRY, SHP2_DATA, (machine: LiftedMachine): Shp2 => new Shp2(machine), (program: Shp2): Promise<Exit> => program.run());
