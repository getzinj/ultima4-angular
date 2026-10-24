import { CARRY, NEGATIVE, ZERO } from '../lifted-runtime/cpu';
import type { Cpu } from '../lifted-runtime/cpu';
import type { IInlineData } from './inline-data';
import type { IPortMachine } from './port-machine';

// What every ported program is written with: the CPU is the register file, and these helpers,
// named for the instructions they stand for, set the registers and flags as those would.

export abstract class PortProgram {
  constructor(protected readonly m: IPortMachine) {
  }


  protected get cpu(): Cpu {
    return this.m.cpu;
  }


  protected peek(address: number): number {
    return this.m.read(address & 0xFFFF);
  }


  protected poke(address: number, value: number): void {
    this.m.write(address & 0xFFFF, value & 0xFF);
  }


  protected lda(value: number): number {
    this.cpu.a = this.cpu.nz(value & 0xFF);

    return this.cpu.a;
  }


  protected ldx(value: number): number {
    this.cpu.x = this.cpu.nz(value & 0xFF);

    return this.cpu.x;
  }


  protected ldy(value: number): number {
    this.cpu.y = this.cpu.nz(value & 0xFF);

    return this.cpu.y;
  }


  protected inc(address: number): number {
    const value: number = this.cpu.nz((this.peek(address) + 1) & 0xFF);

    this.poke(address, value);

    return value;
  }


  protected dec(address: number): number {
    const value: number = this.cpu.nz((this.peek(address) - 1) & 0xFF);

    this.poke(address, value);

    return value;
  }


  protected inx(): number {
    return this.ldx(this.cpu.x + 1);
  }


  protected dex(): number {
    return this.ldx(this.cpu.x - 1);
  }


  protected iny(): number {
    return this.ldy(this.cpu.y + 1);
  }


  protected dey(): number {
    return this.ldy(this.cpu.y - 1);
  }


  protected carry(): boolean {
    return this.cpu.flag(CARRY);
  }


  protected zero(): boolean {
    return this.cpu.flag(ZERO);
  }


  protected negative(): boolean {
    return this.cpu.flag(NEGATIVE);
  }


  protected setCarry(on: boolean): void {
    this.cpu.setFlag(CARRY, on);
  }


  /** `clc` / `adc #value`. */
  protected add(value: number): number {
    this.setCarry(false);
    this.cpu.adc(value & 0xFF);

    return this.cpu.a;
  }


  /** `sec` / `sbc #value`. */
  protected subtract(value: number): number {
    this.setCarry(true);
    this.cpu.sbc(value & 0xFF);

    return this.cpu.a;
  }


  protected cmp(value: number): void {
    this.cpu.compare(this.cpu.a, value & 0xFF);
  }


  /** `lsr` four times, as `div16`. */
  protected div16(value: number): number {
    let result: number = value;

    for (let shift: number = 0; shift < 4; shift++) {
      result = this.cpu.lsr(result);
    }
    this.cpu.a = result;

    return result;
  }


  /** `asl` four times, as `mul16`. */
  protected mul16(value: number): number {
    let result: number = value;

    for (let shift: number = 0; shift < 4; shift++) {
      result = this.cpu.asl(result);
    }
    this.cpu.a = result;

    return result;
  }


  /** A zero-page pointer, `(zp)` as the 6502 reads it. */
  protected pointer(address: number): number {
    return this.peek(address) | (this.peek((address + 1) & 0xFF) << 8);
  }


  /** A word in the program's image, such as an operand its code rewrites. */
  protected patchedWord(address: number): number {
    return this.peek(address) | (this.peek(address + 1) << 8);
  }


  /**
   * A JSR from `site` to a routine of the program's own: its return address goes on the stack, as
   * the 6502's would, so that whatever the routine calls out to finds the stack as it would.
   */
  protected async jsr(site: number, body: () => void | Promise<void>): Promise<void> {
    this.cpu.pushWord(site + 2);
    await body();
    this.cpu.pullWord();
  }


  /**
   * A JMP out of a routine entered by `jsr`: the code at `address` runs, and its RTS returns to that
   * routine's caller. Its own return address stands in for the caller's while it runs, so the stack
   * is as deep as the 6502's would be.
   */
  protected async jmp(address: number): Promise<void> {
    const back: number = this.cpu.pullWord();

    await this.m.call(address);
    this.cpu.pushWord(back);
  }


  /** A JSR to `address` with `block` after it, which the routine there reads and returns past. */
  protected callWith(address: number, block: IInlineData): Promise<void> {
    return this.m.callInline(address, block.address, block.bytes.length);
  }
}
