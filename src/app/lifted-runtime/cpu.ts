// The registers and arithmetic the lifted code runs on, with py65's semantics so that it agrees
// with the oracle bit for bit: the status register as one byte, PHP and PLP forcing bits 4 and 5,
// ADC and SBC in decimal mode as py65's 6502 does them (its 65C02 inherits them), and indirect
// zero-page pointers wrapping within their page.

export const CARRY: number = 0x01;
export const ZERO: number = 0x02;
export const INTERRUPT: number = 0x04;
export const DECIMAL: number = 0x08;
export const BREAK: number = 0x10;
export const UNUSED: number = 0x20;
export const OVERFLOW: number = 0x40;
export const NEGATIVE: number = 0x80;


export interface IBus {
  read(address: number): number;
  write(address: number, value: number): void;
}


export class Cpu {
  public a: number = 0;
  public x: number = 0;
  public y: number = 0;
  public sp: number = 0xFF;
  public p: number = BREAK | UNUSED;
  public pc: number = 0;
  public cycles: number = 0;

  /** When set, the lifted code asks `trace` before every instruction whether to stop there. */
  public tracing: boolean = false;
  public trace: (pc: number) => boolean = (): boolean => false;


  constructor(public readonly bus: IBus) {
  }


  /** Called by lifted code; stops it at `pc` when the tracer says so. */
  public stopAt(pc: number): boolean {
    this.pc = pc;

    return this.trace(pc);
  }


  public read(address: number): number {
    return this.bus.read(address);
  }


  public write(address: number, value: number): void {
    this.bus.write(address, value & 0xFF);
  }


  public word(address: number): number {
    return this.bus.read(address) | (this.bus.read((address + 1) & 0xFFFF) << 8);
  }


  /** A pointer in zero page, or any page, whose high byte wraps within the page. */
  public wrappedWord(address: number): number {
    return this.bus.read(address) | (this.bus.read((address & 0xFF00) | ((address + 1) & 0xFF)) << 8);
  }


  public flag(mask: number): boolean {
    return (this.p & mask) !== 0;
  }


  public setFlag(mask: number, on: boolean): void {
    this.p = on ? (this.p | mask) : (this.p & ~mask);
  }


  /** Sets N and Z from a value and returns it. */
  public nz(value: number): number {
    this.p = (this.p & ~(ZERO | NEGATIVE)) | (value === 0 ? ZERO : (value & NEGATIVE));

    return value;
  }


  public push(value: number): void {
    this.bus.write(0x100 + this.sp, value & 0xFF);
    this.sp = (this.sp - 1) & 0xFF;
  }


  public pull(): number {
    this.sp = (this.sp + 1) & 0xFF;

    return this.bus.read(0x100 + this.sp);
  }


  public pushWord(value: number): void {
    this.push((value >> 8) & 0xFF);
    this.push(value & 0xFF);
  }


  public pullWord(): number {
    const low: number = this.pull();

    return low | (this.pull() << 8);
  }


  public php(): void {
    this.push(this.p | BREAK | UNUSED);
  }


  public plp(): void {
    this.p = this.pull() | BREAK | UNUSED;
  }


  public adc(data: number): void {
    const carry: number = this.p & CARRY;

    if ((this.p & DECIMAL) !== 0) {
      let halfCarry: number = 0;
      let decimalCarry: number = 0;
      let adjust0: number = 0;
      let adjust1: number = 0;
      let nibble0: number = (data & 0xF) + (this.a & 0xF) + carry;
      let nibble1: number;

      if (nibble0 > 9) {
        adjust0 = 6;
        halfCarry = 1;
      }
      nibble1 = ((data >> 4) & 0xF) + ((this.a >> 4) & 0xF) + halfCarry;
      if (nibble1 > 9) {
        adjust1 = 6;
        decimalCarry = 1;
      }
      nibble0 = nibble0 & 0xF;
      nibble1 = nibble1 & 0xF;

      const aluResult: number = (nibble1 << 4) + nibble0;

      this.p = this.p & ~(CARRY | OVERFLOW | NEGATIVE | ZERO);
      this.p = this.p | (aluResult === 0 ? ZERO : (aluResult & NEGATIVE));
      this.p = this.p | (decimalCarry === 1 ? CARRY : 0);
      this.p = this.p | (((~(this.a ^ data) & (this.a ^ aluResult)) & NEGATIVE) !== 0 ? OVERFLOW : 0);
      this.a = (((nibble1 + adjust1) & 0xF) << 4) + ((nibble0 + adjust0) & 0xF);
    } else {
      const result: number = data + this.a + carry;

      this.p = this.p & ~(CARRY | OVERFLOW | NEGATIVE | ZERO);
      this.p = this.p | (((~(this.a ^ data) & (this.a ^ result)) & NEGATIVE) !== 0 ? OVERFLOW : 0);
      this.p = this.p | (result > 0xFF ? CARRY : 0);
      this.a = this.nz(result & 0xFF);
    }
  }


  public sbc(data: number): void {
    const carry: number = this.p & CARRY;

    if ((this.p & DECIMAL) !== 0) {
      let halfCarry: number = 1;
      let adjust0: number = 0;
      let adjust1: number = 0;
      const nibble0: number = (this.a & 0xF) + (~data & 0xF) + carry;

      if (nibble0 <= 0xF) {
        halfCarry = 0;
        adjust0 = 10;
      }
      if ((((this.a >> 4) & 0xF) + ((~data >> 4) & 0xF) + halfCarry) <= 0xF) {
        adjust1 = 10 << 4;
      }

      const sum: number = this.a + (~data & 0xFF) + carry;
      const aluResult: number = sum & 0xFF;

      this.p = this.p & ~(CARRY | ZERO | NEGATIVE | OVERFLOW);
      this.p = this.p | (aluResult === 0 ? ZERO : (aluResult & NEGATIVE));
      this.p = this.p | (sum > 0xFF ? CARRY : 0);
      this.p = this.p | ((((this.a ^ data) & (this.a ^ aluResult)) & NEGATIVE) !== 0 ? OVERFLOW : 0);
      this.a = ((((aluResult + adjust1) >> 4) & 0xF) << 4) + ((aluResult + adjust0) & 0xF);
    } else {
      const result: number = this.a + (~data & 0xFF) + carry;

      this.p = this.p & ~(CARRY | ZERO | OVERFLOW | NEGATIVE);
      this.p = this.p | ((((this.a ^ data) & (this.a ^ result)) & NEGATIVE) !== 0 ? OVERFLOW : 0);
      this.p = this.p | ((result & 0x100) !== 0 ? CARRY : 0);
      this.a = this.nz(result & 0xFF);
    }
  }


  public compare(register: number, data: number): void {
    const result: number = (register - data) & 0x1FF;

    this.p = this.p & ~(CARRY | ZERO | NEGATIVE);
    this.p = this.p | (register >= data ? CARRY : 0) | ((result & 0xFF) === 0 ? ZERO : 0) | (result & NEGATIVE);
  }


  public bit(data: number): void {
    this.p = (this.p & ~(ZERO | NEGATIVE | OVERFLOW)) | ((this.a & data) === 0 ? ZERO : 0) | (data & (NEGATIVE | OVERFLOW));
  }


  public bitImmediate(data: number): void {
    this.p = (this.p & ~ZERO) | ((this.a & data) === 0 ? ZERO : 0);
  }


  public asl(value: number): number {
    this.p = (this.p & ~CARRY) | ((value & 0x80) !== 0 ? CARRY : 0);

    return this.nz((value << 1) & 0xFF);
  }


  public lsr(value: number): number {
    this.p = (this.p & ~CARRY) | (value & 1);

    return this.nz(value >> 1);
  }


  public rol(value: number): number {
    const result: number = ((value << 1) | (this.p & CARRY)) & 0xFF;

    this.p = (this.p & ~CARRY) | ((value & 0x80) !== 0 ? CARRY : 0);

    return this.nz(result);
  }


  public ror(value: number): number {
    const result: number = (value >> 1) | ((this.p & CARRY) !== 0 ? 0x80 : 0);

    this.p = (this.p & ~CARRY) | (value & 1);

    return this.nz(result);
  }


  public tsb(address: number): void {
    const value: number = this.read(address);

    this.p = (this.p & ~ZERO) | ((value & this.a) === 0 ? ZERO : 0);
    this.write(address, value | this.a);
  }


  public trb(address: number): void {
    const value: number = this.read(address);

    this.p = (this.p & ~ZERO) | ((value & this.a) === 0 ? ZERO : 0);
    this.write(address, value & ~this.a);
  }

}
