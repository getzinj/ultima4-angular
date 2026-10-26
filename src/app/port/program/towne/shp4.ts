// towne/SHP4.s: the reagent shops of Moonglow, Skara Brae, Paws and Buccaneer's Den, ported. The
// blind herbalist sells by the reagent, up to nine at a time, and takes what the party says it pays:
// paying the price is worth honesty, justice and honour, and paying less costs them. ULT4's
// load_shop loads it at $8800.

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
const zp_index: number = 0xEA;
const PROPRIETOR: number = 0x05;
const REAGENT_NAME: number = 0x09;
const REAGENTS_SOLD: number = 0x06;
const OWNED_X: number = 0x1A;
const STATUS_X: number = 0x18;

const SHP4_TABLES = {
  location_table: 0x8B49,
  unused_stock_table: 0x8B59,
  price_table: 0x8B69,
  reagent_price: 0x8B89,
  reagent_type: 0x8B8A,
  reagent_amount: 0x8B8B,
  reagent_to_buy: 0x8B8C,
  how_many: 0x8B8D,
  string_table: 0x8BFE,
  saved_cursor_x: 0x8CB8,
  saved_cursor_y: 0x8CB9,
} as const;

const T = SHP4_TABLES;

export const SHP4_INLINE = {
  blind_woman: text(0x8803, '\nA BLIND WOMAN\nTURNS TO YOU AND\nSAYS: WELCOME TO\n'),
  i_am: text(0x8845, '\n\nI AM '),
  need_reagents: text(0x8858, '\nARE YOU IN NEED\nOF REAGENTS?'),
  another_time: text(0x8891, ' SAYS:\nPERHAPS ANOTHER\nTIME THEN....\nAND SLOWLY\nTURNS AWAY.\n'),
  very_well: text(0x88D2, '\nVERY WELL,\n'),
  i_have: text(0x88E2, 'I HAVE\nA-SULFEROUS ASH\nB-GINSENG\nC-GARLIC\nD-SPIDER SILK\nE-BLOOD MOSS\nF-BLACK PEARL\nYOUR INTEREST:'),
  we_sell: text(0x8962, '\nVERY WELL,\nWE SELL\n'),
  for: text(0x8983, '\nFOR '),
  how_many: text(0x89A7, 'gp.\n\nHOW MANY WOULD\nYOU LIKE,\n(0-9)?'),
  i_see: text(0x89D4, '\nI SEE, THEN\n'),
  that_will_be: text(0x89F8, '\nVERY GOOD, THAT\nWILL BE '),
  gp: text(0x8A1B, 'g.p.\n'),
  you_pay: text(0x8A24, '\nYOU PAY:'),
  gold_drop: text(0x8A3F, '\nHEY, COME ON\nLETS HEAR THE\nGOLD DROP!\n'),
  no_gold: text(0x8A89, '\nIT SEEMS YOU\nHAVE NOT THE\nGOLD!\n'),
  very_good: text(0x8ADA, '\nVERY GOOD,\n'),
  anything_else: text(0x8AF0, 'ANYTHING ELSE?'),
  bye: text(0x8B0C, '\nSHE SAYS:\nPERHAPS ANOTHER\nTIME.... AND\nSLOWLY TURNS\nAWAY.\n'),
  owned_title: inline(0x8CCA, [ 0x1E, 0xD2, 0xC5, 0xC1, 0xC7, 0xC5, 0xCE, 0xD4, 0xD3, 0x1D, 0x00 ]),
  lost_an_eighth: text(0x8D87, '\nTHOU HAST LOST\nAN EIGHTH!\n'),
} as const;

const LOCATION_TABLE: readonly number[] = [
  0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x02, 0x00, 0x03, 0x04, 0x00, 0x00,
];

const UNUSED_STOCK_TABLE: readonly number[] = [
  0x01, 0x02, 0x03, 0x06, 0x01, 0x02, 0x03, 0x05, 0x01, 0x02, 0x03, 0x04, 0x01, 0x02, 0x03, 0x00,
];

const PRICE_TABLE: readonly number[] = [
  0x02, 0x05, 0x06, 0x03, 0x06, 0x09, 0x00, 0x00, 0x02, 0x04, 0x09, 0x06, 0x04, 0x08, 0x00, 0x00,
  0x03, 0x04, 0x02, 0x09, 0x06, 0x07, 0x00, 0x00, 0x06, 0x07, 0x09, 0x09, 0x09, 0x01, 0x00, 0x00,
];

const STRINGS: readonly string[] = [
  '',
  'MAGICAL HERBS',
  'HERBS AND SPICE',
  'THE MAGICS',
  'MAGIC MENTAR',
  'MARGOT',
  'SASHA',
  'SHIELA',
  'SHANNON',
  'SULFER ASH',
  'GINSENG',
  'GARLIC',
  'SPIDER SILK',
  'BLOOD MOSS',
  'BLACK PEARL',
  'NIGHTSHADE',
  'MANDRAKE',
];


const I = SHP4_INLINE;

export const SHP4_DATA: readonly IInlineData[] = [
  ...Object.values(SHP4_INLINE),
  inline(T.location_table, LOCATION_TABLE),
  inline(T.unused_stock_table, UNUSED_STOCK_TABLE),
  inline(T.price_table, PRICE_TABLE),
  inline(T.reagent_price, [ 0x00, 0x00, 0x00, 0x00, 0x00 ]),
  stringTable(T.string_table, STRINGS),
  inline(T.saved_cursor_x, [ 0x00, 0x00 ]),
];


export class Shp4 extends ShopOverlay {
  constructor(machine: LiftedMachine) {
    super(machine, T.string_table);
  }


  public async run(): Promise<Exit> {
    let buying: boolean;

    await this.print(I.blind_woman);
    this.ldx(this.peek(PRTY.current_location));
    this.dex();
    this.poke(zp_index, this.lda(this.peek(T.location_table + this.cpu.x)));
    this.dec(zp_index);
    await this.printString(this.cpu.a);
    await this.print(I.i_am);
    await this.proprietor();
    await this.print(I.need_reagents);
    await this.inputChar();
    this.cmp(CHAR.char_Y);
    buying = this.zero();
    if (buying) {
      while (buying) {
        buying = await this.buyMenu();
      }
      await this.print(I.bye);
    } else {
      await this.m.call(J.j_clearstatwindow);
      await this.m.call(J.j_update_status);
      await this.printNewline();
      await this.proprietor();
      await this.print(I.another_time);
    }

    return null;
  }


  private async proprietor(): Promise<void> {
    this.setCarry(false);
    this.lda(this.peek(zp_index));
    this.cpu.adc(PROPRIETOR);
    await this.printString(this.cpu.a);
  }


  /** A reagent chosen, its price and the count; true to go round again. */
  private async buyMenu(): Promise<boolean> {
    let more: boolean = false;

    await this.print(I.very_well);
    await this.print(I.i_have);
    await this.displayOwned();
    await this.inputChar();
    this.cpu.push(this.cpu.a);
    await this.m.call(J.j_clearstatwindow);
    await this.m.call(J.j_update_status);
    this.lda(this.cpu.pull());
    this.subtract(CHAR.char_alpha_first);
    this.cmp(REAGENTS_SOLD);
    if (!this.carry()) {
      await this.offer();
      more = await this.more();
    }

    return more;
  }


  private async offer(): Promise<void> {
    this.poke(T.reagent_to_buy, this.cpu.a);
    await this.print(I.we_sell);
    this.setCarry(false);
    this.lda(this.peek(T.reagent_to_buy));
    this.cpu.adc(REAGENT_NAME);
    await this.printString(this.cpu.a);
    await this.print(I.for);
    this.lda(this.peek(zp_index));
    this.cpu.a = this.cpu.asl(this.cpu.asl(this.cpu.asl(this.cpu.a)));
    this.cpu.adc(this.peek(T.reagent_to_buy));
    this.ldy(this.cpu.a);
    this.poke(T.reagent_price, this.lda(this.peek(T.price_table + this.cpu.y)));
    await this.m.call(J.j_printbcd);
    this.lda(this.peek(T.reagent_price));
    this.decodeBcdValue();
    this.poke(T.reagent_price, this.cpu.a);
    await this.print(I.how_many);
    await this.inputDigit();
    if (this.zero()) {
      await this.print(I.i_see);
    } else {
      await this.priceCount();
    }
  }


  /** The count's price, and what the party says it pays until it pays anything. */
  private async priceCount(): Promise<void> {
    let paid: boolean = false;

    this.poke(T.how_many, this.cpu.a);
    this.ldx(this.cpu.a);
    this.lda(this.peek(T.reagent_price));
    await this.m.call(J.j_mulax);
    this.encodeBcdValue();
    this.poke(T.reagent_price, this.cpu.a);
    await this.print(I.that_will_be);
    this.lda(this.peek(T.reagent_price));
    await this.m.call(J.j_printbcd);
    await this.print(I.gp);
    while (!paid) {
      await this.print(I.you_pay);
      await this.m.call(J.j_getnumber);
      this.lda(this.peek(ZP_MAIN.bcdnum));
      this.cmp(this.peek(T.reagent_price));
      if (this.carry()) {
        paid = true;
      } else {
        this.cmp(0x00);
        if (this.zero()) {
          await this.print(I.gold_drop);
        } else {
          await this.penalty();
          paid = true;
        }
      }
    }
    await this.spend();
  }


  /** Less than the price: four of honesty, justice and honour each. */
  private async penalty(): Promise<void> {
    for (const virtue of [ ROST.virtue_honesty, ROST.virtue_justice, ROST.virtue_honor ]) {
      this.ldy(virtue);
      this.lda(0x04);
      await this.decVirtue(I.lost_an_eighth);
    }
  }


  private async spend(): Promise<void> {
    this.lda(this.peek(ZP_MAIN.bcdnum));
    this.trySpend(zp_amount);
    if (this.negative()) {
      await this.print(I.no_gold);
    } else {
      for (const virtue of [ ROST.virtue_honesty, ROST.virtue_justice, ROST.virtue_honor ]) {
        this.ldy(virtue);
        this.lda(0x02);
        this.incVirtue();
      }
      this.ldy(this.peek(T.reagent_to_buy));
      this.cpu.setFlag(DECIMAL, true);
      this.setCarry(false);
      this.lda(this.peek(ROST.reagents + this.cpu.y));
      this.setCarry(false);
      this.cpu.adc(this.peek(T.how_many));
      if (this.carry()) {
        this.lda(0x99);
      }
      this.poke(ROST.reagents + this.cpu.y, this.cpu.a);
      this.cpu.setFlag(DECIMAL, false);
      await this.print(I.very_good);
    }
  }


  private async more(): Promise<boolean> {
    await this.m.call(J.j_update_status);
    await this.print(I.anything_else);
    await this.inputChar();
    this.cmp(CHAR.char_Y);

    return this.zero();
  }


  /** input_digit: 0 to 9, anything else 0, printed and in A with its flags. */
  private async inputDigit(): Promise<void> {
    do {
      await this.m.call(J.j_waitkey);
    } while (this.zero());
    this.subtract(CHAR.char_num_first);
    this.cmp(0x0A);
    if (this.carry()) {
      this.lda(0x00);
    }
    this.cpu.push(this.cpu.a);
    await this.m.call(J.j_printdigit);
    this.lda(CHAR.char_enter);
    await this.m.call(J.j_console_out);
    this.lda(this.cpu.pull());
    this.cmp(0x00);
  }


  /** The party's reagents in the status window, one line for each it has. */
  private async displayOwned(): Promise<void> {
    await this.m.call(J.j_clearstatwindow);
    this.saveConsoleXy(T.saved_cursor_x, T.saved_cursor_y);
    this.ldx(OWNED_X);
    this.ldy(0x00);
    this.poke(T.reagent_type, this.cpu.y);
    await this.callWith(J.j_primm_xy, I.owned_title);
    do {
      this.lda(this.peek(T.reagent_type));
      this.ldy(this.add(ROST.party_stat_reagents));
      if (this.lda(this.peek(ROST.party_stats + this.cpu.y)) !== 0) {
        await this.ownedLine();
      }
      this.inc(T.reagent_type);
      this.lda(this.peek(T.reagent_type));
      this.cmp(ROST.reagent_max);
    } while (!this.carry());
    this.restoreConsoleXy(T.saved_cursor_x, T.saved_cursor_y);
  }


  private async ownedLine(): Promise<void> {
    this.poke(T.reagent_amount, this.cpu.a);
    this.inc(ZP_MAIN.console_ypos);
    this.poke(ZP_MAIN.console_xpos, this.lda(STATUS_X));
    this.lda(this.peek(T.reagent_type));
    this.add(CHAR.char_alpha_first);
    await this.m.call(J.j_console_out);
    this.lda(this.peek(T.reagent_amount));
    this.cmp(0x10);
    if (this.carry()) {
      await this.m.call(J.j_printbcd);
    } else {
      this.lda(CHAR.char_hyphen);
      await this.m.call(J.j_console_out);
      this.lda(this.peek(T.reagent_amount));
      await this.m.call(J.j_printdigit);
    }
    this.lda(CHAR.char_hyphen);
    await this.m.call(J.j_console_out);
    this.lda(this.peek(T.reagent_type));
    await this.printString(this.add(REAGENT_NAME));
  }

}


export const SHP4_MODULE = overlayModule('towne', 'SHP4', OVERLAY_ENTRY, SHP4_DATA, (machine: LiftedMachine): Shp4 => new Shp4(machine), (program: Shp4): Promise<Exit> => program.run());
