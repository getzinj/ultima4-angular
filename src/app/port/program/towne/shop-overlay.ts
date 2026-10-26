import { DECIMAL } from '../../../lifted-runtime/cpu';
import type { LiftedMachine } from '../../../lifted-runtime/lifted-machine';
import { CHAR, JUMP_SUBS, ROST, TABLES, ZP_MAIN } from '../../../state/symbols';
import { inline } from '../../inline-data';
import type { IInlineData } from '../../inline-data';
import { encode } from '../../text';
import { KeywordOverlay } from '../keyword-overlay';

// What the towne's shops, and MIX, each carry a copy of: a key read and echoed, BCD to binary and
// back, a newline, a string of their own table by number, the console's place saved and put back,
// gold spent, and a word typed matched against one after a call. The copies differ in small ways,
// which the shops pass in.

const J = JUMP_SUBS;
const zp_mismatches: number = 0xF0;
const zp_inc_amount: number = 0xD9;
const zp_save_reg: number = 0xD9;
const zp_dec_amount: number = 0xDA;
const BCD_MAX: number = 0x63;


/** A shop's table of strings, each ended by a zero, from string 0. */
export function stringTable(address: number, strings: readonly string[]): IInlineData {
  return inline(address, strings.flatMap((value: string): number[] => [ ...encode(value), 0x00 ]));
}


export class ShopError extends Error {
}


export abstract class ShopOverlay extends KeywordOverlay {
  /** MIX has no table of its own, and prints SUBS's strings. */
  constructor(machine: LiftedMachine, private readonly stringTable: number | null) {
    super(machine);
  }


  protected async printNewline(): Promise<void> {
    this.lda(CHAR.char_enter);
    await this.m.call(J.j_console_out);
  }


  /** input_char: a key, echoed with a newline, in A with its flags; MIX waits past any key without the high bit, the rest past none. */
  protected async inputChar(whilePositive: boolean = false): Promise<void> {
    do {
      await this.m.call(J.j_waitkey);
    } while (whilePositive ? !this.negative() : this.zero());
    this.cpu.push(this.cpu.a);
    await this.m.call(J.j_console_out);
    await this.printNewline();
    this.lda(this.cpu.pull());
  }


  /** encode_bcd_value: A in BCD, 99 at most; SHP1's caps only 99 itself, counting past it. */
  protected encodeBcdValue(onlyAt99: boolean = false): void {
    this.cmp(0x00);
    if (!this.zero()) {
      this.cmp(BCD_MAX);
      if (onlyAt99 ? this.zero() : this.carry()) {
        this.lda(0x99);
      } else {
        this.cpu.setFlag(DECIMAL, true);
        this.ldx(this.cpu.a);
        this.lda(0x00);
        do {
          this.add(0x01);
        } while (this.dex() !== 0);
      }
    }
    this.cpu.setFlag(DECIMAL, false);
  }


  /** decode_bcd_value: A from BCD. */
  protected decodeBcdValue(): void {
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


  /** print_string: string A of the table, each ended by a zero, the count wrapping past 255 for A = 0. */
  protected async printString(string: number): Promise<void> {
    if (this.stringTable == null) {
      throw new ShopError('print_string with no table of strings');
    } else {
      this.lda(string);
      this.ldy(this.cpu.a);
      this.poke(ZP_MAIN.ptr1, this.lda(this.stringTable & 0xFF));
      this.poke(ZP_MAIN.ptr1 + 1, this.lda(this.stringTable >> 8));
      this.ldx(0x00);
      this.skipStrings();
      await this.printToZero();
    }
  }


  private skipStrings(): void {
    let found: boolean = false;

    while (!found) {
      while (this.lda(this.peek(this.pointer(ZP_MAIN.ptr1))) !== 0) {
        this.incPtr();
      }
      if (this.dey() === 0) {
        found = true;
      } else {
        this.incPtr();
      }
    }
  }


  private async printToZero(): Promise<void> {
    let ended: boolean = false;

    while (!ended) {
      this.incPtr();
      this.ldx(0x00);
      if (this.lda(this.peek(this.pointer(ZP_MAIN.ptr1))) === 0) {
        ended = true;
      } else {
        await this.m.call(J.j_console_out);
      }
    }
  }


  private incPtr(): void {
    if (this.inc(ZP_MAIN.ptr1) === 0) {
      this.inc(ZP_MAIN.ptr1 + 1);
    }
  }


  protected saveConsoleXy(x: number, y: number): void {
    this.poke(x, this.lda(this.peek(ZP_MAIN.console_xpos)));
    this.poke(y, this.lda(this.peek(ZP_MAIN.console_ypos)));
  }


  protected restoreConsoleXy(x: number, y: number): void {
    this.poke(ZP_MAIN.console_xpos, this.lda(this.peek(x)));
    this.poke(ZP_MAIN.console_ypos, this.lda(this.peek(y)));
  }


  /**
   * match_input_inline: the mismatches between inbuffer and the word after the call, in A, the
   * routine returning past the word's zero by the pointer it leaves in ptr1.
   */
  protected matchInputInline(word: IInlineData): void {
    let ended: boolean = false;

    this.poke(ZP_MAIN.ptr1, (word.address - 1) & 0xFF);
    this.poke(ZP_MAIN.ptr1 + 1, (word.address - 1) >> 8);
    this.ldy(0x00);
    this.poke(zp_mismatches, this.cpu.y);
    this.ldx(0xFF);
    while (!ended) {
      this.inx();
      this.incPtr();
      if (this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y)) === 0) {
        ended = true;
      } else {
        this.cmp(this.peek(TABLES.inbuffer + this.cpu.x));
        if (!this.zero()) {
          this.inc(zp_mismatches);
        }
      }
    }
    if (this.pointer(ZP_MAIN.ptr1) !== word.address + word.bytes.length - 1) {
      throw new ShopError(`match_input_inline ended at $${ this.pointer(ZP_MAIN.ptr1).toString(16) }`);
    } else {
      this.lda(this.peek(zp_mismatches));
    }
  }


  /** try_spend: A gold from the party's in BCD, and A 0; or none, and A $FF, if there is not that much. */
  protected trySpend(zpAmount: number): void {
    const y: number = ROST.party_stat_gold_hi;

    this.poke(zpAmount, this.cpu.a);
    this.cpu.setFlag(DECIMAL, true);
    this.ldy(y);
    this.lda(this.peek(ROST.party_stats + 1 + y));
    this.subtract(this.peek(zpAmount));
    this.poke(ROST.party_stats + 1 + y, this.cpu.a);
    this.lda(this.peek(ROST.party_stats + y));
    this.cpu.sbc(0x00);
    this.poke(ROST.party_stats + y, this.cpu.a);
    if (this.carry()) {
      this.lda(0x00);
    } else {
      this.setCarry(false);
      this.lda(this.peek(ROST.party_stats + 1 + y));
      this.cpu.adc(this.peek(zpAmount));
      this.poke(ROST.party_stats + 1 + y, this.cpu.a);
      this.lda(this.peek(ROST.party_stats + y));
      this.cpu.adc(0x00);
      this.poke(ROST.party_stats + y, this.cpu.a);
      this.lda(0xFF);
    }
    this.cpu.setFlag(DECIMAL, false);
  }

  /** inc_virtue: virtue Y up by A in BCD, to 99 at most; one at zero, an eighth of the Avatarhood, stays there. */
  protected incVirtue(): void {
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


  /** dec_virtue: virtue Y down by A, not below one; one at zero is lost, `lost` said, and starts again from 99. */
  protected async decVirtue(lost: IInlineData): Promise<void> {
    this.poke(zp_dec_amount, this.cpu.a);
    this.poke(zp_save_reg, this.cpu.y);
    if (this.lda(this.peek(ROST.party_stats + this.cpu.y)) === 0) {
      await this.print(lost);
      this.ldy(this.peek(zp_save_reg));
      this.lda(0x99);
    }
    this.cpu.setFlag(DECIMAL, true);
    this.setCarry(true);
    this.cpu.sbc(this.peek(zp_dec_amount));
    if (this.zero() || !this.carry()) {
      this.lda(0x01);
    }
    this.poke(ROST.party_stats + this.cpu.y, this.cpu.a);
    this.cpu.setFlag(DECIMAL, false);
  }
}
