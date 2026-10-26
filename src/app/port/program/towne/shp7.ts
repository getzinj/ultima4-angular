// towne/SHP7.s: the guilds of Buccaneer's Den and Vesper, ported: torches, gems and keys, and a
// sextant the menu does not mention. ULT4's check_shop loads it at $8800.

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
const PROPRIETOR: number = 0x03;
const SHOP_NAME: number = 0x01;
const WARE: number = 0x05;
const WARES: number = 0x04;
const OWNED_X: number = 0x1A;
const STATUS_X: number = 0x18;

const SHP7_TABLES = {
  item_number: 0x8A1C,
  location_table: 0x8A1D,
  price_hi: 0x8A2D,
  price_lo: 0x8A2E,
  item_count: 0x8A35,
  string_table: 0x8A81,
  prev_cursor_x: 0x8C45,
  prev_cursor_y: 0x8C46,
} as const;

const T = SHP7_TABLES;

export const SHP7_INLINE = {
  avast: text(0x8803, '\nAVAST YE MATE\nSHURE YE WISHES\nTO BUY FROM OL\'\n'),
  welcome_to: text(0x8856, '\nSAYS: WELCOME TO\n'),
  see_goods: text(0x8874, '\nLIKE TO SEE MY\nGOODS?'),
  menu: text(0x88A3, '\nSAYS: GOOD MATE!\nYA SEE I GOTS:\nA-TORCHES\nB-MAGIC GEMS\nC-MAGIC KEYS\nWAT\'L IT BE?'),
  will_buy: text(0x891F, '\nWILL YA BUY?'),
  grumble: text(0x8937, '\nHMMM...GRMBL...\n'),
  cannot_pay: text(0x897E, '\nWHAT? CAN\'T PAY!\nBUZZ OFF SWINE!\n'),
  fine: text(0x89B7, '\nFINE...FINE...\n'),
  see_more: text(0x89DC, '\nSAYS: SEE MORE?'),
  bye: text(0x8A05, '\nSAYS: SEE YA\nMATIE!\n'),
  equipment: inline(0x8BBA, [ 0x1E, 0xC5, 0xD1, 0xD5, 0xC9, 0xD0, 0xCD, 0xC5, 0xCE, 0xD4, 0x1C, 0x00 ]),
  torches: text(0x8BD7, '-TORCHES'),
  gems: text(0x8BF1, '-GEMS'),
  keys: text(0x8C08, '-KEYS'),
  sextants: text(0x8C21, '-SEXTANTS'),
} as const;

const I = SHP7_INLINE;

const LOCATION_TABLE: readonly number[] = [
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x00,
];

/** Each ware's price in BCD, hundreds first: torches, gems, keys and the sextant. */
const PRICE: readonly number[] = [
  0x00, 0x50, 0x00, 0x60, 0x00, 0x60, 0x09, 0x00,
];

const ITEM_COUNT: readonly number[] = [
  0x05, 0x05, 0x06, 0x01,
];

const STRINGS: readonly string[] = [
  '',
  'PIRATES GUILD',
  'THE GUILD SHOP',
  'ONE EYED WILLEY',
  'LONG JOHN LEARY',
  'I CAN GIVE YA 5\nLONG LASTING\nTORCHES FOR A\nMERE 50gp.\n',
  'I\'VE GOT MACICAL\nMAPPING GEMS\n5 FOR ONLY 60gp.\n',
  'MAGICAL KEYS 1\nUSE EACH, A FAIR\nPRICE AT 60gp.\nFOR 6.\n',
  'SO...YA WANT A\nSEXTANT...WELL I\nGOTS ONE WHICH I\nMIGHT PART WITH\nFER 900 GOLD!\n',
];

export const SHP7_DATA: readonly IInlineData[] = [
  ...Object.values(SHP7_INLINE),
  inline(T.item_number, [ 0x00 ]),
  inline(T.location_table, LOCATION_TABLE),
  inline(T.price_hi, PRICE),
  inline(T.item_count, ITEM_COUNT),
  stringTable(T.string_table, STRINGS),
  inline(T.prev_cursor_x, [ 0x00, 0x00 ]),
];

type Next = 'menu' | 'ask_more' | 'bye' | 'done';


export class Shp7 extends ShopOverlay {
  constructor(machine: LiftedMachine) {
    super(machine, T.string_table);
  }


  public async run(): Promise<Exit> {
    let next: Next = 'bye';

    await this.print(I.avast);
    this.ldx(this.peek(PRTY.current_location));
    this.dex();
    this.poke(zp_shop_num, this.lda(this.peek(T.location_table + this.cpu.x)));
    this.dec(zp_shop_num);
    await this.offset(PROPRIETOR);
    await this.printNewline();
    await this.printNewline();
    await this.offset(PROPRIETOR);
    await this.print(I.welcome_to);
    await this.offset(SHOP_NAME);
    await this.print(I.see_goods);
    await this.inputChar();
    this.cmp(CHAR.char_Y);
    if (this.zero()) {
      next = 'menu';
    }
    while (next !== 'done') {
      if (next === 'menu') {
        next = await this.menu();
      } else if (next === 'ask_more') {
        next = await this.askMore();
      } else {
        await this.printNewline();
        await this.offset(PROPRIETOR);
        await this.print(I.bye);
        next = 'done';
      }
    }

    return null;
  }


  /** The shop's string at `at` past its number. */
  private async offset(at: number): Promise<void> {
    this.setCarry(false);
    this.lda(this.peek(zp_shop_num));
    this.cpu.adc(at);
    await this.printString(this.cpu.a);
  }


  /** A ware, A to D: the sextant too, though the menu lists only three. */
  private async menu(): Promise<Next> {
    let next: Next = 'bye';

    await this.printNewline();
    await this.offset(PROPRIETOR);
    await this.print(I.menu);
    await this.displayOwned();
    await this.inputChar();
    this.cpu.push(this.cpu.a);
    await this.m.call(J.j_clearstatwindow);
    await this.m.call(J.j_update_status);
    this.lda(this.cpu.pull());
    this.subtract(CHAR.char_alpha_first);
    this.cmp(WARES);
    if (!this.carry()) {
      next = await this.askBuy();
    }

    return next;
  }


  private async askBuy(): Promise<Next> {
    let next: Next = 'ask_more';

    this.poke(T.item_number, this.cpu.a);
    await this.printNewline();
    this.lda(this.peek(T.item_number));
    await this.printString(this.add(WARE));
    await this.print(I.will_buy);
    await this.inputChar();
    this.cmp(CHAR.char_Y);
    if (this.zero()) {
      next = await this.spendOnWare();
    } else {
      await this.print(I.grumble);
    }

    return next;
  }


  /** The ware's price from the gold, in BCD; or none taken and the party sent off. */
  private async spendOnWare(): Promise<Next> {
    let next: Next = 'done';
    const gold: number = ROST.party_stats + ROST.party_stat_gold_hi;

    this.lda(this.peek(T.item_number));
    this.ldy(this.cpu.asl(this.cpu.a));
    this.cpu.setFlag(DECIMAL, true);
    this.setCarry(true);
    this.lda(this.peek(gold + 1));
    this.cpu.sbc(this.peek(T.price_lo + this.cpu.y));
    this.poke(gold + 1, this.cpu.a);
    this.lda(this.peek(gold));
    this.cpu.sbc(this.peek(T.price_hi + this.cpu.y));
    this.poke(gold, this.cpu.a);
    if (this.carry()) {
      this.setCarry(false);
      this.ldy(this.peek(T.item_number));
      this.lda(this.peek(ROST.party_items + this.cpu.y));
      this.cpu.adc(this.peek(T.item_count + this.cpu.y));
      if (this.carry()) {
        this.lda(0x99);
      }
      this.poke(ROST.party_items + this.cpu.y, this.cpu.a);
      this.cpu.setFlag(DECIMAL, false);
      await this.print(I.fine);
      await this.m.call(J.j_update_status);
      next = 'ask_more';
    } else {
      this.setCarry(false);
      this.lda(this.peek(gold + 1));
      this.cpu.adc(this.peek(T.price_lo + this.cpu.y));
      this.poke(gold + 1, this.cpu.a);
      this.lda(this.peek(gold));
      this.cpu.adc(this.peek(T.price_hi + this.cpu.y));
      this.poke(gold, this.cpu.a);
      this.cpu.setFlag(DECIMAL, false);
      await this.print(I.cannot_pay);
    }

    return next;
  }


  private async askMore(): Promise<Next> {
    let next: Next = 'bye';

    await this.printNewline();
    await this.offset(PROPRIETOR);
    await this.print(I.see_more);
    await this.inputChar();
    this.cmp(CHAR.char_Y);
    if (this.zero()) {
      next = 'menu';
    }

    return next;
  }


  /** The party's torches, gems and keys in the status window, and its sextants if it has any. */
  private async displayOwned(): Promise<void> {
    await this.m.call(J.j_clearstatwindow);
    this.saveConsoleXy(T.prev_cursor_x, T.prev_cursor_y);
    this.ldx(OWNED_X);
    this.ldy(0x00);
    await this.callWith(J.j_primm_xy, I.equipment);
    await this.ownedLine(ROST.party_stat_torches, I.torches);
    await this.ownedLine(ROST.party_stat_gems, I.gems);
    await this.ownedLine(ROST.party_stat_keys, I.keys);
    this.inc(ZP_MAIN.console_ypos);
    this.poke(ZP_MAIN.console_xpos, this.lda(STATUS_X));
    this.ldy(ROST.party_stat_sextant);
    if (this.lda(this.peek(ROST.party_stats + this.cpu.y)) !== 0) {
      await this.m.call(J.j_printbcd);
      await this.print(I.sextants);
    }
    this.restoreConsoleXy(T.prev_cursor_x, T.prev_cursor_y);
  }


  private async ownedLine(stat: number, name: IInlineData): Promise<void> {
    this.inc(ZP_MAIN.console_ypos);
    this.poke(ZP_MAIN.console_xpos, this.lda(STATUS_X));
    this.ldy(stat);
    this.lda(this.peek(ROST.party_stats + this.cpu.y));
    await this.m.call(J.j_printbcd);
    await this.print(name);
  }
}


export const SHP7_MODULE = overlayModule('towne', 'SHP7', OVERLAY_ENTRY, SHP7_DATA, (machine: LiftedMachine): Shp7 => new Shp7(machine), (program: Shp7): Promise<Exit> => program.run());
