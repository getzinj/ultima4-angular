import vectors from './cpu-vectors.json';
import { BREAK, CARRY, Cpu, DECIMAL, NEGATIVE, OVERFLOW, UNUSED, ZERO } from './cpu';
import type { IBus } from './cpu';

type Vector = readonly [ number, number, number, number, number ];


class FlatBus implements IBus {
  public readonly memory: Uint8Array = new Uint8Array(0x10000);


  public read(address: number): number {
    return this.memory[address];
  }


  public write(address: number, value: number): void {
    this.memory[address] = value;
  }
}


function results(operation: (cpu: Cpu, data: number) => void, rows: readonly Vector[]): number[][] {
  return rows.map(([ a, data, p ]: Vector): number[] => {
    const cpu: Cpu = new Cpu(new FlatBus());

    cpu.a = a;
    cpu.p = p;
    operation(cpu, data);

    return [ a, data, p, cpu.a, cpu.p ];
  });
}


function inMode(rows: readonly Vector[], decimal: boolean): Vector[] {
  return rows.filter((row: Vector): boolean => ((row[2] & DECIMAL) !== 0) === decimal);
}


describe('Cpu', (): void => {
  describe('against py65', (): void => {
    const operations: readonly [ string, (cpu: Cpu, data: number) => void ][] = [
      [ 'adc', (cpu: Cpu, data: number): void => cpu.adc(data) ],
      [ 'sbc', (cpu: Cpu, data: number): void => cpu.sbc(data) ],
      [ 'cmp', (cpu: Cpu, data: number): void => cpu.compare(cpu.a, data) ],
    ];

    for (const [ name, operation ] of operations) {
      for (const decimal of [ false, true ]) {
        it(`${ name } in ${ decimal ? 'decimal' : 'binary' } mode gives py65's A and P for every vector`, (): void => {
          const rows: Vector[] = inMode((vectors as unknown as Record<string, Vector[]>)[name], decimal);

          expect(results(operation, rows)).toEqual(rows);
        });
      }
    }
  });

  describe('the status register', (): void => {
    it('starts with only the break and unused bits set', (): void => {
      expect(new Cpu(new FlatBus()).p).toBe(BREAK | UNUSED);
    });

    it('PHP pushes the break and unused bits set', (): void => {
      const bus: FlatBus = new FlatBus();
      const cpu: Cpu = new Cpu(bus);

      cpu.p = CARRY;
      cpu.php();

      expect(bus.memory[0x01FF]).toBe(CARRY | BREAK | UNUSED);
    });

    it('PLP forces the break and unused bits on', (): void => {
      const cpu: Cpu = new Cpu(new FlatBus());

      cpu.push(NEGATIVE);
      cpu.plp();

      expect(cpu.p).toBe(NEGATIVE | BREAK | UNUSED);
    });

    it('BIT immediate leaves N and V alone', (): void => {
      const cpu: Cpu = new Cpu(new FlatBus());

      cpu.a = 0x01;
      cpu.p = BREAK | UNUSED;
      cpu.bitImmediate(0xC0);

      expect(cpu.p).toBe(BREAK | UNUSED | ZERO);
    });

    it('BIT on memory copies bits 7 and 6 into N and V', (): void => {
      const cpu: Cpu = new Cpu(new FlatBus());

      cpu.a = 0xFF;
      cpu.p = BREAK | UNUSED;
      cpu.bit(0xC0);

      expect(cpu.p).toBe(BREAK | UNUSED | NEGATIVE | OVERFLOW);
    });
  });

  describe('addressing', (): void => {
    it('reads a zero-page pointer at $FF from $FF and $00', (): void => {
      const bus: FlatBus = new FlatBus();

      bus.memory[0xFF] = 0x34;
      bus.memory[0x00] = 0x12;

      expect(new Cpu(bus).wrappedWord(0xFF)).toBe(0x1234);
    });

    it('reads an absolute word across a page boundary', (): void => {
      const bus: FlatBus = new FlatBus();

      bus.memory[0x10FF] = 0x34;
      bus.memory[0x1100] = 0x12;

      expect(new Cpu(bus).word(0x10FF)).toBe(0x1234);
    });
  });

  describe('the stack', (): void => {
    it('pulls back the word it pushed', (): void => {
      const cpu: Cpu = new Cpu(new FlatBus());

      cpu.pushWord(0xBEEF);

      expect(cpu.pullWord()).toBe(0xBEEF);
    });

    it('wraps the stack pointer within page 1', (): void => {
      const cpu: Cpu = new Cpu(new FlatBus());

      cpu.sp = 0x00;
      cpu.push(0x42);

      expect(cpu.sp).toBe(0xFF);
    });
  });

  describe('tracing', (): void => {
    it('stopAt records where the lifted code is', (): void => {
      const cpu: Cpu = new Cpu(new FlatBus());

      cpu.stopAt(0x1234);

      expect(cpu.pc).toBe(0x1234);
    });

    it('stopAt answers what the tracer says', (): void => {
      const cpu: Cpu = new Cpu(new FlatBus());

      cpu.trace = (pc: number): boolean => pc === 0x1234;

      expect(cpu.stopAt(0x1234)).toBe(true);
    });
  });
});
