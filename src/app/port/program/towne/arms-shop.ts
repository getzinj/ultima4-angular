import { DECIMAL } from '../../../lifted-runtime/cpu';
import type { LiftedMachine } from '../../../lifted-runtime/lifted-machine';
import { CHAR, JUMP_SUBS, PRTY, ROST, TRAINERS, ZP_MAIN } from '../../../state/symbols';
import type { IInlineData } from '../../inline-data';
import type { Exit } from '../../routine';
import { ShopOverlay } from './shop-overlay';

// towne/SHP0.s and SHP1.s, the weaponry and the armoury, ported: one program but for their words,
// their wares and a handful of differences, which each passes in. Four wares a shop, bought one at a
// time, or anything of the kind sold back for half its price; the party's own shown beside.

const J = JUMP_SUBS;
const zp_item_type: number = 0xD8;
const zp_display_pos: number = 0xD9;
const zp_shop_num: number = 0xEA;
const zp_inv_num: number = 0xF0;
const OWNED_X: number = 0x1B;
const STATUS_X: number = 0x18;
const PROPRIETOR: number = 0x07;
const WARE_NAME: number = 0x0D;
const WARE_PRAISE: number = 0x1D;
const STOCK: number = 0x04;


export interface IArmsTexts {
  readonly welcome_to: IInlineData;
  /** After the proprietor's name: SHP0's greeting and question are two strings, SHP1's one. */
  readonly greeting: readonly IInlineData[];
  readonly buying: IInlineData;
  readonly we_have: IInlineData;
  /** SHP0's plural after each ware; SHP1 ends the line, and lists no ware it does not stock. */
  readonly plural: IInlineData | null;
  readonly interest: IInlineData;
  readonly buy_one: IInlineData;
  readonly too_bad: IInlineData;
  readonly anything_else: IInlineData;
  readonly farewell: IInlineData;
  readonly cannot_pay: IInlineData;
  readonly fine_choice: IInlineData;
  readonly what_to_sell: IInlineData;
  readonly dont_own: IInlineData;
  readonly will_give: IInlineData;
  readonly gp_for_that: IInlineData;
  readonly deal: IInlineData;
  readonly what_else_then: IInlineData;
  readonly fine_what_else: IInlineData;
  readonly owned_title: IInlineData;
  readonly owned_nothing: IInlineData;
}


export interface IArmsLayout {
  readonly texts: IArmsTexts;
  readonly stringTable: number;
  readonly locationTable: number;
  readonly inventory: number;
  readonly price: number;
  readonly payment: number;
  readonly prevConsoleX: number;
  readonly prevConsoleY: number;
  /** The party's arms: weapons or armour, as an address and as a party stat. */
  readonly owned: number;
  readonly ownedStat: number;
  readonly kinds: number;
  /** The name's abbreviation in the list of the party's own. */
  readonly abbreviation: number;
  /** SHP0 lists the party's weapons in two columns of eight. */
  readonly twoColumns: boolean;
  /** SHP0 offers something else when the party cannot pay; SHP1 sends it off. */
  readonly offersAgain: boolean;
  /** SHP0's PRICE_FIX: with the trainer on, an odd hundreds is halved too. */
  readonly priceFix: boolean;
  /** SHP1's encode_bcd_value caps only 99. */
  readonly capsOnlyAt99: boolean;
}


type Next = 'buy_menu' | 'sell_menu' | 'bye';


export class ArmsShop extends ShopOverlay {
  private readonly t: IArmsTexts;


  constructor(machine: LiftedMachine, private readonly layout: IArmsLayout) {
    super(machine, layout.stringTable);
    this.t = layout.texts;
  }


  public async run(): Promise<Exit> {
    let next: Next | null;

    await this.print(this.t.welcome_to);
    this.ldx(this.peek(PRTY.current_location));
    this.dex();
    this.poke(zp_shop_num, this.lda(this.peek(this.layout.locationTable + this.cpu.x)));
    this.dec(zp_shop_num);
    await this.printString(this.cpu.a);
    await this.printNewline();
    next = await this.buyOrSell();
    while (next != null) {
      if (next === 'buy_menu') {
        next = await this.buyMenu();
      } else if (next === 'sell_menu') {
        next = await this.sellMenu();
      } else {
        await this.bye();
        next = null;
      }
    }

    return null;
  }


  private async proprietor(): Promise<void> {
    this.setCarry(false);
    this.lda(this.peek(zp_shop_num));
    this.cpu.adc(PROPRIETOR);
    await this.printString(this.cpu.a);
  }


  private async buyOrSell(): Promise<Next> {
    let next: Next | null = null;

    while (next == null) {
      await this.printNewline();
      await this.proprietor();
      for (const block of this.t.greeting) {
        await this.print(block);
      }
      await this.inputChar();
      this.cmp(CHAR.char_B);
      if (this.zero()) {
        await this.print(this.t.buying);
        next = 'buy_menu';
      } else {
        this.cmp(CHAR.char_S);
        if (this.zero()) {
          await this.print(this.t.what_to_sell);
          next = 'sell_menu';
        }
      }
    }

    return next;
  }


  /** `lda zp_shop_num` / `asl` / `asl` / `adc zp_inv_num`: the stock's index, with whatever carry the shifts leave. */
  private stockIndex(): void {
    this.lda(this.peek(zp_shop_num));
    this.cpu.a = this.cpu.asl(this.cpu.asl(this.cpu.a));
    this.cpu.adc(this.peek(zp_inv_num));
    this.ldy(this.cpu.a);
  }


  private async buyMenu(): Promise<Next> {
    let next: Next;

    await this.print(this.t.we_have);
    this.poke(zp_inv_num, this.lda(0x00));
    do {
      this.stockIndex();
      this.poke(zp_item_type, this.lda(this.peek(this.layout.inventory + this.cpu.y)));
      if ((this.t.plural != null) || !this.zero()) {
        await this.listWare();
      }
      this.inc(zp_inv_num);
      this.lda(this.peek(zp_inv_num));
      this.cmp(STOCK);
    } while (!this.carry());
    await this.print(this.t.interest);
    await this.displayOwned();
    await this.inputChar();
    this.cpu.push(this.cpu.a);
    await this.m.call(J.j_clearstatwindow);
    await this.m.call(J.j_update_status);
    this.lda(this.cpu.pull());
    this.subtract(CHAR.char_alpha_first);
    if (this.zero()) {
      next = 'bye';
    } else {
      next = await this.chooseWare();
    }

    return next;
  }


  private async listWare(): Promise<void> {
    this.add(CHAR.char_alpha_first);
    await this.m.call(J.j_console_out);
    this.lda(CHAR.char_hyphen);
    await this.m.call(J.j_console_out);
    this.lda(this.peek(zp_item_type));
    await this.printString(this.add(WARE_NAME));
    if (this.t.plural != null) {
      await this.print(this.t.plural);
    } else {
      await this.printNewline();
    }
  }


  /** The ware asked for, if the shop stocks it: its praise, and the question until it is answered. */
  private async chooseWare(): Promise<Next> {
    let next: Next | null = null;
    let found: boolean = false;

    this.poke(zp_item_type, this.cpu.a);
    await this.printNewline();
    this.poke(zp_inv_num, this.lda(0x03));
    do {
      this.stockIndex();
      this.lda(this.peek(this.layout.inventory + this.cpu.y));
      this.cmp(this.peek(zp_item_type));
      found = this.zero();
    } while (!found && (this.dec(zp_inv_num) < 0x80));
    if (!found) {
      next = 'buy_menu';
    } else {
      this.lda(this.peek(zp_item_type));
      await this.printString(this.add(WARE_PRAISE));
      while (next == null) {
        await this.print(this.t.buy_one);
        await this.inputChar();
        this.cpu.push(this.cpu.a);
        await this.printNewline();
        this.lda(this.cpu.pull());
        this.cmp(CHAR.char_Y);
        if (this.zero()) {
          next = await this.tryBuy();
        } else {
          this.cmp(CHAR.char_N);
          if (this.zero()) {
            await this.print(this.t.too_bad);
            next = await this.anythingElse();
          }
        }
      }
    }

    return next;
  }


  private async anythingElse(): Promise<Next> {
    let next: Next | null = null;

    while (next == null) {
      await this.print(this.t.anything_else);
      await this.inputChar();
      this.cmp(CHAR.char_Y);
      if (this.zero()) {
        next = 'buy_menu';
      } else {
        this.cmp(CHAR.char_N);
        if (this.zero()) {
          next = 'bye';
        }
      }
    }

    return next;
  }


  private async bye(): Promise<void> {
    await this.printNewline();
    await this.proprietor();
    await this.print(this.t.farewell);
  }


  /** The ware's price, in BCD, from the gold: tried first without taking it. */
  private async tryBuy(): Promise<Next> {
    let next: Next = 'buy_menu';
    const gold: number = ROST.party_stats + ROST.party_stat_gold_hi;
    const payment: number = this.layout.payment;

    this.lda(this.peek(zp_item_type));
    this.ldy(this.cpu.asl(this.cpu.a));
    this.poke(payment, this.lda(this.peek(this.layout.price + this.cpu.y)));
    this.poke(payment + 1, this.lda(this.peek(this.layout.price + 1 + this.cpu.y)));
    this.ldy(ROST.party_stat_gold_hi);
    this.cpu.setFlag(DECIMAL, true);
    this.setCarry(true);
    this.lda(this.peek(gold + 1));
    this.cpu.sbc(this.peek(payment + 1));
    this.lda(this.peek(gold));
    this.cpu.sbc(this.peek(payment));
    this.cpu.setFlag(DECIMAL, false);
    if (this.carry()) {
      await this.doSpend();
    } else {
      await this.print(this.t.cannot_pay);
      next = this.layout.offersAgain ? 'buy_menu' : 'bye';
    }

    return next;
  }


  private async doSpend(): Promise<void> {
    const gold: number = ROST.party_stats + ROST.party_stat_gold_hi;
    const payment: number = this.layout.payment;

    this.cpu.setFlag(DECIMAL, true);
    this.setCarry(true);
    this.lda(this.peek(gold + 1));
    this.cpu.sbc(this.peek(payment + 1));
    this.poke(gold + 1, this.cpu.a);
    this.lda(this.peek(gold));
    this.cpu.sbc(this.peek(payment));
    this.poke(gold, this.cpu.a);
    this.setCarry(false);
    this.ldy(this.peek(zp_item_type));
    this.lda(this.peek(this.layout.owned + this.cpu.y));
    this.cpu.adc(0x01);
    if (!this.carry()) {
      this.poke(this.layout.owned + this.cpu.y, this.cpu.a);
    }
    this.cpu.setFlag(DECIMAL, false);
    await this.m.call(J.j_update_status);
    await this.proprietor();
    await this.print(this.t.fine_choice);
  }


  private async sellMenu(): Promise<Next> {
    let next: Next = 'sell_menu';
    let offer: boolean = false;

    await this.displayOwned();
    await this.inputChar();
    this.cpu.push(this.cpu.a);
    await this.m.call(J.j_clearstatwindow);
    await this.m.call(J.j_update_status);
    this.lda(this.cpu.pull());
    this.subtract(CHAR.char_alpha_first);
    this.poke(zp_item_type, this.cpu.a);
    if (this.zero()) {
      next = 'bye';
    } else {
      this.cmp(this.layout.kinds);
      if (this.carry()) {
        next = 'bye';
      } else {
        this.ldy(this.cpu.a);
        offer = this.lda(this.peek(this.layout.owned + this.cpu.y)) !== 0;
        if (!offer) {
          await this.print(this.t.dont_own);
        }
      }
    }
    if (offer) {
      await this.makeOffer();
    }

    return next;
  }


  /** Half the price, each byte decoded, halved and encoded again; the hundreds' odd half lost but for SHP0's fix. */
  private async makeOffer(): Promise<void> {
    const payment: number = this.layout.payment;
    let sold: boolean | null = null;

    this.lda(this.peek(zp_item_type));
    this.ldy(this.cpu.asl(this.cpu.a));
    this.lda(this.peek(this.layout.price + this.cpu.y));
    this.decodeBcdValue();
    this.cpu.a = this.cpu.lsr(this.cpu.a);
    if (this.layout.priceFix) {
      this.cpu.php();
    }
    this.encodeBcdValue(this.layout.capsOnlyAt99);
    this.poke(payment, this.cpu.a);
    this.lda(this.peek(this.layout.price + 1 + this.cpu.y));
    this.decodeBcdValue();
    if (this.layout.priceFix) {
      this.cpu.plp();
      if (this.carry() && (this.ldx(this.peek(TRAINERS.trainer_price)) !== 0)) {
        this.cpu.adc(99);
      }
    }
    this.cpu.a = this.cpu.lsr(this.cpu.a);
    this.encodeBcdValue(this.layout.capsOnlyAt99);
    this.poke(payment + 1, this.cpu.a);
    await this.print(this.t.will_give);
    if (this.lda(this.peek(payment)) !== 0) {
      await this.m.call(J.j_printbcd);
    }
    this.lda(this.peek(payment + 1));
    await this.m.call(J.j_printbcd);
    await this.print(this.t.gp_for_that);
    this.lda(this.peek(zp_item_type));
    await this.printString(this.add(WARE_NAME));
    await this.printNewline();
    while (sold == null) {
      await this.print(this.t.deal);
      await this.inputChar();
      this.cmp(CHAR.char_Y);
      if (this.zero()) {
        sold = true;
      } else {
        this.cmp(CHAR.char_N);
        if (this.zero()) {
          sold = false;
        }
      }
    }
    if (sold) {
      await this.sellItem();
    } else {
      await this.print(this.t.what_else_then);
    }
  }


  private async sellItem(): Promise<void> {
    const gold: number = ROST.party_stats + ROST.party_stat_gold_hi;
    const payment: number = this.layout.payment;

    this.cpu.setFlag(DECIMAL, true);
    this.setCarry(false);
    this.ldy(ROST.party_stat_gold_hi);
    this.lda(this.peek(gold + 1));
    this.cpu.adc(this.peek(payment + 1));
    this.poke(gold + 1, this.cpu.a);
    this.lda(this.peek(gold));
    this.cpu.adc(this.peek(payment));
    this.poke(gold, this.cpu.a);
    if (this.carry()) {
      this.poke(gold, this.lda(0x99));
      this.poke(gold + 1, this.cpu.a);
    }
    this.setCarry(true);
    this.ldy(this.peek(zp_item_type));
    this.lda(this.peek(this.layout.owned + this.cpu.y));
    this.cpu.sbc(0x01);
    this.poke(this.layout.owned + this.cpu.y, this.cpu.a);
    this.cpu.setFlag(DECIMAL, false);
    await this.m.call(J.j_update_status);
    await this.print(this.t.fine_what_else);
  }


  /** The party's arms in the status window: SHP0's weapons in two columns, SHP1's armour in one. */
  private async displayOwned(): Promise<void> {
    await this.m.call(J.j_clearstatwindow);
    this.saveConsoleXy(this.layout.prevConsoleX, this.layout.prevConsoleY);
    this.ldx(OWNED_X);
    this.ldy(0x00);
    this.poke(zp_item_type, this.cpu.y);
    this.poke(zp_display_pos, this.cpu.y);
    await this.callWith(J.j_primm_xy, this.t.owned_title);
    do {
      if (this.layout.twoColumns) {
        this.lda(this.peek(zp_display_pos) & 0x08);
        this.add(STATUS_X);
      } else {
        this.lda(STATUS_X);
      }
      this.poke(ZP_MAIN.console_xpos, this.cpu.a);
      this.lda(this.peek(zp_display_pos));
      if (this.layout.twoColumns) {
        this.lda(this.cpu.a & 0x07);
      }
      this.poke(ZP_MAIN.console_ypos, this.cpu.a);
      this.inc(ZP_MAIN.console_ypos);
      if (this.lda(this.peek(zp_item_type)) === 0) {
        await this.print(this.t.owned_nothing);
        this.inc(zp_display_pos);
      } else {
        await this.ownedLine();
      }
      this.inc(zp_item_type);
      this.lda(this.peek(zp_item_type));
      this.cmp(this.layout.kinds);
    } while (!this.carry());
    this.restoreConsoleXy(this.layout.prevConsoleX, this.layout.prevConsoleY);
  }


  private async ownedLine(): Promise<void> {
    this.add(this.layout.ownedStat);
    this.ldy(this.cpu.a);
    if (this.lda(this.peek(ROST.party_stats + this.cpu.y)) !== 0) {
      this.cpu.push(this.cpu.a);
      this.lda(this.peek(zp_item_type));
      this.add(CHAR.char_alpha_first);
      await this.m.call(J.j_console_out);
      this.lda(this.cpu.pull());
      this.cmp(0x10);
      if (this.carry()) {
        await this.m.call(J.j_printbcd);
      } else {
        this.cpu.push(this.cpu.a);
        this.lda(CHAR.char_hyphen);
        await this.m.call(J.j_console_out);
        this.lda(this.cpu.pull());
        await this.m.call(J.j_printdigit);
      }
      this.lda(CHAR.char_hyphen);
      await this.m.call(J.j_console_out);
      this.lda(this.peek(zp_item_type));
      await this.printString(this.add(this.layout.abbreviation));
      this.inc(zp_display_pos);
    }
  }
}
