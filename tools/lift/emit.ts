// One 65C02 instruction as TypeScript, over the Cpu in src/app/lifted-runtime/cpu.ts. Operands are
// literals, except where the program rewrites them at run time: those are read from memory.

import { OPERAND_BYTES } from './opcodes';
import type { IOpcode, Mode } from './opcodes';


export interface IInstruction {
  readonly address: number;
  readonly opcode: IOpcode;
  readonly bytes: readonly number[];
}


function hex(value: number, digits: number): string {
  return `0x${ value.toString(16).toUpperCase().padStart(digits, '0') }`;
}


export class LiftError extends Error {
}


/** The operand as a byte or word expression, read live where it is patched at run time. */
function operand(instruction: IInstruction, patched: ReadonlySet<number>): string {
  const at: number = instruction.address + 1;

  if (OPERAND_BYTES[instruction.opcode.mode] === 1) {
    return patched.has(at) ? `c.read(${ hex(at, 4) })` : hex(instruction.bytes[1], 2);
  } else if (patched.has(at) || patched.has(at + 1)) {
    return `c.word(${ hex(at, 4) })`;
  } else {
    return hex(instruction.bytes[1] | (instruction.bytes[2] << 8), 4);
  }
}


/** The effective address of a memory operand. */
function address(mode: Mode, value: string): string {
  switch (mode) {
    case 'zp':
    case 'abs':
      return value;
    case 'zpx':
      return `((${ value } + c.x) & 0xFF)`;
    case 'zpy':
      return `((${ value } + c.y) & 0xFF)`;
    case 'abx':
      return `((${ value } + c.x) & 0xFFFF)`;
    case 'aby':
      return `((${ value } + c.y) & 0xFFFF)`;
    case 'inx':
      return `c.wrappedWord((${ value } + c.x) & 0xFF)`;
    case 'iny':
      return `((c.wrappedWord(${ value }) + c.y) & 0xFFFF)`;
    case 'zpi':
      return `c.word(${ value })`;
    default:
      throw new LiftError(`no effective address for mode ${ mode }`);
  }
}


const BRANCHES: Readonly<Record<string, string>> = {
  BPL: '(c.p & 0x80) === 0', BMI: '(c.p & 0x80) !== 0', BVC: '(c.p & 0x40) === 0', BVS: '(c.p & 0x40) !== 0',
  BCC: '(c.p & 0x01) === 0', BCS: '(c.p & 0x01) !== 0', BNE: '(c.p & 0x02) === 0', BEQ: '(c.p & 0x02) !== 0',
};

const FLAG_OPS: Readonly<Record<string, string>> = {
  CLC: 'c.p &= ~0x01;', SEC: 'c.p |= 0x01;', CLI: 'c.p &= ~0x04;', SEI: 'c.p |= 0x04;',
  CLD: 'c.p &= ~0x08;', SED: 'c.p |= 0x08;', CLV: 'c.p &= ~0x40;',
};

const IMPLIED: Readonly<Record<string, string>> = {
  TAX: 'c.x = c.nz(c.a);', TAY: 'c.y = c.nz(c.a);', TXA: 'c.a = c.nz(c.x);', TYA: 'c.a = c.nz(c.y);',
  TSX: 'c.x = c.nz(c.sp);', TXS: 'c.sp = c.x;',
  INX: 'c.x = c.nz((c.x + 1) & 0xFF);', INY: 'c.y = c.nz((c.y + 1) & 0xFF);',
  DEX: 'c.x = c.nz((c.x - 1) & 0xFF);', DEY: 'c.y = c.nz((c.y - 1) & 0xFF);',
  PHA: 'c.push(c.a);', PHX: 'c.push(c.x);', PHY: 'c.push(c.y);', PHP: 'c.php();',
  PLA: 'c.a = c.nz(c.pull());', PLX: 'c.x = c.nz(c.pull());', PLY: 'c.y = c.nz(c.pull());', PLP: 'c.plp();',
  NOP: '',
};

const READS: Readonly<Record<string, (value: string) => string>> = {
  LDA: (v: string): string => `c.a = c.nz(${ v });`,
  LDX: (v: string): string => `c.x = c.nz(${ v });`,
  LDY: (v: string): string => `c.y = c.nz(${ v });`,
  AND: (v: string): string => `c.a = c.nz(c.a & ${ v });`,
  ORA: (v: string): string => `c.a = c.nz(c.a | ${ v });`,
  EOR: (v: string): string => `c.a = c.nz(c.a ^ ${ v });`,
  ADC: (v: string): string => `c.adc(${ v });`,
  SBC: (v: string): string => `c.sbc(${ v });`,
  CMP: (v: string): string => `c.compare(c.a, ${ v });`,
  CPX: (v: string): string => `c.compare(c.x, ${ v });`,
  CPY: (v: string): string => `c.compare(c.y, ${ v });`,
  BIT: (v: string): string => `c.bit(${ v });`,
};

const STORES: Readonly<Record<string, string>> = { STA: 'c.a', STX: 'c.x', STY: 'c.y', STZ: '0' };

const SHIFTS: Readonly<Record<string, (value: string) => string>> = {
  ASL: (v: string): string => `c.asl(${ v })`,
  LSR: (v: string): string => `c.lsr(${ v })`,
  ROL: (v: string): string => `c.rol(${ v })`,
  ROR: (v: string): string => `c.ror(${ v })`,
  INC: (v: string): string => `c.nz((${ v } + 1) & 0xFF)`,
  DEC: (v: string): string => `c.nz((${ v } - 1) & 0xFF)`,
};


/** The statements for one instruction, ending with `pc` set to what runs next and `continue`. */
export function emitInstruction(instruction: IInstruction, patched: ReadonlySet<number>): string {
  const { mnemonic, mode, cycles } = instruction.opcode;
  const next: number = instruction.address + 1 + OPERAND_BYTES[mode];
  const value: string = mode === 'imp' || mode === 'acc' ? '' : operand(instruction, patched);
  const head: string = `c.cycles += ${ cycles };`;
  let body: string;

  if (mode === 'rel') {
    const offset: number = instruction.bytes[1];
    const target: number = (next + (offset >= 0x80 ? offset - 0x100 : offset)) & 0xFFFF;

    body = mnemonic === 'BRA' ? `pc = ${ hex(target, 4) }; continue;` : `if (${ BRANCHES[mnemonic] }) { pc = ${ hex(target, 4) }; continue; }`;
  } else if (mnemonic === 'JMP') {
    body = mode === 'abs' ? `pc = ${ value }; continue;`
      : mode === 'ind' ? `pc = c.word(${ value }); continue;`
        : `pc = c.word((${ value } + c.x) & 0xFFFF); continue;`;
  } else if (mnemonic === 'JSR') {
    body = `c.pushWord(${ hex(next - 1, 4) }); pc = ${ value }; continue;`;
  } else if (mnemonic === 'RTS') {
    body = 'pc = (c.pullWord() + 1) & 0xFFFF; continue;';
  } else if (mnemonic === 'RTI') {
    body = 'c.plp(); pc = c.pullWord(); continue;';
  } else if (mnemonic === 'BRK') {
    body = `throw new LiftedBreakError(${ hex(instruction.address, 4) });`;
  } else if (FLAG_OPS[mnemonic] != null) {
    body = FLAG_OPS[mnemonic];
  } else if (IMPLIED[mnemonic] != null) {
    body = IMPLIED[mnemonic];
  } else if ((mnemonic === 'BIT') && (mode === 'imm')) {
    body = `c.bitImmediate(${ value });`;
  } else if (READS[mnemonic] != null) {
    body = READS[mnemonic](mode === 'imm' ? value : `c.read(${ address(mode, value) })`);
  } else if (STORES[mnemonic] != null) {
    body = `c.write(${ address(mode, value) }, ${ STORES[mnemonic] });`;
  } else if (SHIFTS[mnemonic] != null) {
    if (mode === 'acc') {
      body = `c.a = ${ SHIFTS[mnemonic]('c.a') };`;
    } else {
      body = `t = ${ address(mode, value) }; c.write(t, ${ SHIFTS[mnemonic]('c.read(t)') });`;
    }
  } else if ((mnemonic === 'TSB') || (mnemonic === 'TRB')) {
    body = `c.${ mnemonic.toLowerCase() }(${ address(mode, value) });`;
  } else {
    throw new LiftError(`no translation for ${ mnemonic } ${ mode } at ${ hex(instruction.address, 4) }`);
  }

  return body.endsWith('continue;') || body.startsWith('throw') ? `${ head } ${ body }` : `${ head } ${ body } pc = ${ hex(next, 4) }; continue;`;
}


/**
 * An instruction whose opcode the game rewrites to RTS and back (INIT and BOOT do this to SEL's
 * `j_music_ctl`): reads the opcode live, and fails loudly on any other value.
 */
export function emitOpcodeStore(instruction: IInstruction, patched: ReadonlySet<number>): string {
  const at: string = hex(instruction.address, 4);

  return `if (c.read(${ at }) === 0x60) { c.cycles += 6; pc = (c.pullWord() + 1) & 0xFFFF; continue; } `
    + `if (c.read(${ at }) !== ${ hex(instruction.bytes[0], 2) }) { throw new LiftedSelfModifyError(${ at }, c.read(${ at })); } `
    + emitInstruction(instruction, patched);
}
