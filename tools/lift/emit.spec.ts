import { emitInstruction, emitOpcodeStore } from './emit';
import type { IInstruction } from './emit';
import { OPCODES } from './opcodes';
import type { IOpcode } from './opcodes';


function instruction(address: number, ...bytes: number[]): IInstruction {
  const opcode: IOpcode | undefined = OPCODES.get(bytes[0]);

  if (opcode == null) {
    throw new Error(`no opcode ${ bytes[0] }`);
  } else {
    return { address, opcode, bytes };
  }
}


const NONE: ReadonlySet<number> = new Set<number>();


describe('emitInstruction', (): void => {
  it('counts the instruction\'s cycles', (): void => {
    expect(emitInstruction(instruction(0x1000, 0xEA), NONE)).toMatch(/^c\.cycles \+= 2;/);
  });

  it('carries on at the next instruction', (): void => {
    expect(emitInstruction(instruction(0x1000, 0xA9, 0x05), NONE)).toMatch(/pc = 0x1002; continue;$/);
  });

  it('loads an immediate operand as a constant', (): void => {
    expect(emitInstruction(instruction(0x1000, 0xA9, 0x05), NONE)).toContain('c.a = c.nz(0x05);');
  });

  it('reads a patched immediate operand from memory', (): void => {
    expect(emitInstruction(instruction(0x1000, 0xA9, 0x05), new Set<number>([ 0x1001 ]))).toContain('c.a = c.nz(c.read(0x1001));');
  });

  it('reads a patched absolute operand as a word from memory', (): void => {
    expect(emitInstruction(instruction(0x1000, 0xAD, 0x00, 0x20), new Set<number>([ 0x1001, 0x1002 ]))).toContain('c.read(c.word(0x1001))');
  });

  it('branches backwards on a taken BNE', (): void => {
    expect(emitInstruction(instruction(0x1010, 0xD0, 0xFE), NONE)).toContain('if ((c.p & 0x02) === 0) { pc = 0x1010; continue; }');
  });

  it('pushes the address of its last byte on JSR', (): void => {
    expect(emitInstruction(instruction(0x1000, 0x20, 0x00, 0x08), NONE)).toContain('c.pushWord(0x1002); pc = 0x0800; continue;');
  });

  it('returns to the pulled address plus one on RTS', (): void => {
    expect(emitInstruction(instruction(0x1000, 0x60), NONE)).toContain('pc = (c.pullWord() + 1) & 0xFFFF; continue;');
  });

  it('throws on BRK', (): void => {
    expect(emitInstruction(instruction(0x1000, 0x00), NONE)).toContain('throw new LiftedBreakError(0x1000);');
  });

  it('reads and writes memory once for a read-modify-write', (): void => {
    expect(emitInstruction(instruction(0x1000, 0xEE, 0x00, 0x20), NONE)).toContain('t = 0x2000; c.write(t, c.nz((c.read(t) + 1) & 0xFF));');
  });
});


describe('emitOpcodeStore', (): void => {
  it('returns when the opcode reads as RTS', (): void => {
    expect(emitOpcodeStore(instruction(0x0320, 0x4C, 0x38, 0x03), NONE)).toMatch(/^if \(c\.read\(0x0320\) === 0x60\) \{ c\.cycles \+= 6; pc = \(c\.pullWord\(\) \+ 1\) & 0xFFFF; continue; \}/);
  });

  it('fails on any opcode but RTS and the original', (): void => {
    expect(emitOpcodeStore(instruction(0x0320, 0x4C, 0x38, 0x03), NONE)).toContain('if (c.read(0x0320) !== 0x4C) { throw new LiftedSelfModifyError(0x0320, c.read(0x0320)); }');
  });

  it('runs the original instruction otherwise', (): void => {
    expect(emitOpcodeStore(instruction(0x0320, 0x4C, 0x38, 0x03), NONE)).toMatch(/pc = 0x0338; continue;$/);
  });
});
