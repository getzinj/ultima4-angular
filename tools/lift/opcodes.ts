// The documented 65C02 instruction set, as py65's mpu65c02 implements it (less the Rockwell bit
// instructions, which Ultima IV never uses): opcode to mnemonic, addressing mode and base cycles.

export type Mode = 'imp' | 'acc' | 'imm' | 'zp' | 'zpx' | 'zpy' | 'abs' | 'abx' | 'aby' | 'ind' | 'inx' | 'iny' | 'zpi' | 'iax' | 'rel';

export interface IOpcode {
  readonly mnemonic: string;
  readonly mode: Mode;
  readonly cycles: number;
}

export const OPERAND_BYTES: Readonly<Record<Mode, number>> = {
  imp: 0, acc: 0, imm: 1, zp: 1, zpx: 1, zpy: 1, abs: 2, abx: 2, aby: 2, ind: 2, inx: 1, iny: 1, zpi: 1, iax: 2, rel: 1,
};

const TABLE: readonly [ number, string, Mode, number ][] = [
  [ 0x00, 'BRK', 'imp', 7 ], [ 0x01, 'ORA', 'inx', 6 ], [ 0x04, 'TSB', 'zp', 5 ], [ 0x05, 'ORA', 'zp', 3 ], [ 0x06, 'ASL', 'zp', 5 ],
  [ 0x08, 'PHP', 'imp', 3 ], [ 0x09, 'ORA', 'imm', 2 ], [ 0x0A, 'ASL', 'acc', 2 ], [ 0x0C, 'TSB', 'abs', 6 ], [ 0x0D, 'ORA', 'abs', 4 ],
  [ 0x0E, 'ASL', 'abs', 6 ], [ 0x10, 'BPL', 'rel', 2 ], [ 0x11, 'ORA', 'iny', 5 ], [ 0x12, 'ORA', 'zpi', 5 ], [ 0x14, 'TRB', 'zp', 5 ],
  [ 0x15, 'ORA', 'zpx', 4 ], [ 0x16, 'ASL', 'zpx', 6 ], [ 0x18, 'CLC', 'imp', 2 ], [ 0x19, 'ORA', 'aby', 4 ], [ 0x1A, 'INC', 'acc', 2 ],
  [ 0x1C, 'TRB', 'abs', 6 ], [ 0x1D, 'ORA', 'abx', 4 ], [ 0x1E, 'ASL', 'abx', 7 ], [ 0x20, 'JSR', 'abs', 6 ], [ 0x21, 'AND', 'inx', 6 ],
  [ 0x24, 'BIT', 'zp', 3 ], [ 0x25, 'AND', 'zp', 3 ], [ 0x26, 'ROL', 'zp', 5 ], [ 0x28, 'PLP', 'imp', 4 ], [ 0x29, 'AND', 'imm', 2 ],
  [ 0x2A, 'ROL', 'acc', 2 ], [ 0x2C, 'BIT', 'abs', 4 ], [ 0x2D, 'AND', 'abs', 4 ], [ 0x2E, 'ROL', 'abs', 6 ], [ 0x30, 'BMI', 'rel', 2 ],
  [ 0x31, 'AND', 'iny', 5 ], [ 0x32, 'AND', 'zpi', 5 ], [ 0x34, 'BIT', 'zpx', 4 ], [ 0x35, 'AND', 'zpx', 4 ], [ 0x36, 'ROL', 'zpx', 6 ],
  [ 0x38, 'SEC', 'imp', 2 ], [ 0x39, 'AND', 'aby', 4 ], [ 0x3A, 'DEC', 'acc', 2 ], [ 0x3C, 'BIT', 'abx', 4 ], [ 0x3D, 'AND', 'abx', 4 ],
  [ 0x3E, 'ROL', 'abx', 7 ], [ 0x40, 'RTI', 'imp', 6 ], [ 0x41, 'EOR', 'inx', 6 ], [ 0x45, 'EOR', 'zp', 3 ], [ 0x46, 'LSR', 'zp', 5 ],
  [ 0x48, 'PHA', 'imp', 3 ], [ 0x49, 'EOR', 'imm', 2 ], [ 0x4A, 'LSR', 'acc', 2 ], [ 0x4C, 'JMP', 'abs', 3 ], [ 0x4D, 'EOR', 'abs', 4 ],
  [ 0x4E, 'LSR', 'abs', 6 ], [ 0x50, 'BVC', 'rel', 2 ], [ 0x51, 'EOR', 'iny', 5 ], [ 0x52, 'EOR', 'zpi', 5 ], [ 0x55, 'EOR', 'zpx', 4 ],
  [ 0x56, 'LSR', 'zpx', 6 ], [ 0x58, 'CLI', 'imp', 2 ], [ 0x59, 'EOR', 'aby', 4 ], [ 0x5A, 'PHY', 'imp', 3 ], [ 0x5D, 'EOR', 'abx', 4 ],
  [ 0x5E, 'LSR', 'abx', 7 ], [ 0x60, 'RTS', 'imp', 6 ], [ 0x61, 'ADC', 'inx', 6 ], [ 0x64, 'STZ', 'zp', 3 ], [ 0x65, 'ADC', 'zp', 3 ],
  [ 0x66, 'ROR', 'zp', 5 ], [ 0x68, 'PLA', 'imp', 4 ], [ 0x69, 'ADC', 'imm', 2 ], [ 0x6A, 'ROR', 'acc', 2 ], [ 0x6C, 'JMP', 'ind', 6 ],
  [ 0x6D, 'ADC', 'abs', 4 ], [ 0x6E, 'ROR', 'abs', 6 ], [ 0x70, 'BVS', 'rel', 2 ], [ 0x71, 'ADC', 'iny', 5 ], [ 0x72, 'ADC', 'zpi', 5 ],
  [ 0x74, 'STZ', 'zpx', 4 ], [ 0x75, 'ADC', 'zpx', 4 ], [ 0x76, 'ROR', 'zpx', 6 ], [ 0x78, 'SEI', 'imp', 2 ], [ 0x79, 'ADC', 'aby', 4 ],
  [ 0x7A, 'PLY', 'imp', 4 ], [ 0x7C, 'JMP', 'iax', 6 ], [ 0x7D, 'ADC', 'abx', 4 ], [ 0x7E, 'ROR', 'abx', 7 ], [ 0x80, 'BRA', 'rel', 1 ],
  [ 0x81, 'STA', 'inx', 6 ], [ 0x84, 'STY', 'zp', 3 ], [ 0x85, 'STA', 'zp', 3 ], [ 0x86, 'STX', 'zp', 3 ], [ 0x88, 'DEY', 'imp', 2 ],
  [ 0x89, 'BIT', 'imm', 2 ], [ 0x8A, 'TXA', 'imp', 2 ], [ 0x8C, 'STY', 'abs', 4 ], [ 0x8D, 'STA', 'abs', 4 ], [ 0x8E, 'STX', 'abs', 4 ],
  [ 0x90, 'BCC', 'rel', 2 ], [ 0x91, 'STA', 'iny', 6 ], [ 0x92, 'STA', 'zpi', 5 ], [ 0x94, 'STY', 'zpx', 4 ], [ 0x95, 'STA', 'zpx', 4 ],
  [ 0x96, 'STX', 'zpy', 4 ], [ 0x98, 'TYA', 'imp', 2 ], [ 0x99, 'STA', 'aby', 5 ], [ 0x9A, 'TXS', 'imp', 2 ], [ 0x9C, 'STZ', 'abs', 4 ],
  [ 0x9D, 'STA', 'abx', 5 ], [ 0x9E, 'STZ', 'abx', 5 ], [ 0xA0, 'LDY', 'imm', 2 ], [ 0xA1, 'LDA', 'inx', 6 ], [ 0xA2, 'LDX', 'imm', 2 ],
  [ 0xA4, 'LDY', 'zp', 3 ], [ 0xA5, 'LDA', 'zp', 3 ], [ 0xA6, 'LDX', 'zp', 3 ], [ 0xA8, 'TAY', 'imp', 2 ], [ 0xA9, 'LDA', 'imm', 2 ],
  [ 0xAA, 'TAX', 'imp', 2 ], [ 0xAC, 'LDY', 'abs', 4 ], [ 0xAD, 'LDA', 'abs', 4 ], [ 0xAE, 'LDX', 'abs', 4 ], [ 0xB0, 'BCS', 'rel', 2 ],
  [ 0xB1, 'LDA', 'iny', 5 ], [ 0xB2, 'LDA', 'zpi', 5 ], [ 0xB4, 'LDY', 'zpx', 4 ], [ 0xB5, 'LDA', 'zpx', 4 ], [ 0xB6, 'LDX', 'zpy', 4 ],
  [ 0xB8, 'CLV', 'imp', 2 ], [ 0xB9, 'LDA', 'aby', 4 ], [ 0xBA, 'TSX', 'imp', 2 ], [ 0xBC, 'LDY', 'abx', 4 ], [ 0xBD, 'LDA', 'abx', 4 ],
  [ 0xBE, 'LDX', 'aby', 4 ], [ 0xC0, 'CPY', 'imm', 2 ], [ 0xC1, 'CMP', 'inx', 6 ], [ 0xC4, 'CPY', 'zp', 3 ], [ 0xC5, 'CMP', 'zp', 3 ],
  [ 0xC6, 'DEC', 'zp', 5 ], [ 0xC8, 'INY', 'imp', 2 ], [ 0xC9, 'CMP', 'imm', 2 ], [ 0xCA, 'DEX', 'imp', 2 ], [ 0xCC, 'CPY', 'abs', 4 ],
  [ 0xCD, 'CMP', 'abs', 4 ], [ 0xCE, 'DEC', 'abs', 6 ], [ 0xD0, 'BNE', 'rel', 2 ], [ 0xD1, 'CMP', 'iny', 5 ], [ 0xD2, 'CMP', 'zpi', 5 ],
  [ 0xD5, 'CMP', 'zpx', 4 ], [ 0xD6, 'DEC', 'zpx', 6 ], [ 0xD8, 'CLD', 'imp', 2 ], [ 0xD9, 'CMP', 'aby', 4 ], [ 0xDA, 'PHX', 'imp', 3 ],
  [ 0xDD, 'CMP', 'abx', 4 ], [ 0xDE, 'DEC', 'abx', 7 ], [ 0xE0, 'CPX', 'imm', 2 ], [ 0xE1, 'SBC', 'inx', 6 ], [ 0xE4, 'CPX', 'zp', 3 ],
  [ 0xE5, 'SBC', 'zp', 3 ], [ 0xE6, 'INC', 'zp', 5 ], [ 0xE8, 'INX', 'imp', 2 ], [ 0xE9, 'SBC', 'imm', 2 ], [ 0xEA, 'NOP', 'imp', 2 ],
  [ 0xEC, 'CPX', 'abs', 4 ], [ 0xED, 'SBC', 'abs', 4 ], [ 0xEE, 'INC', 'abs', 6 ], [ 0xF0, 'BEQ', 'rel', 2 ], [ 0xF1, 'SBC', 'iny', 5 ],
  [ 0xF2, 'SBC', 'zpi', 5 ], [ 0xF5, 'SBC', 'zpx', 4 ], [ 0xF6, 'INC', 'zpx', 6 ], [ 0xF8, 'SED', 'imp', 2 ], [ 0xF9, 'SBC', 'aby', 4 ],
  [ 0xFA, 'PLX', 'imp', 4 ], [ 0xFD, 'SBC', 'abx', 4 ], [ 0xFE, 'INC', 'abx', 7 ],
];

export const OPCODES: ReadonlyMap<number, IOpcode> = new Map<number, IOpcode>(
  TABLE.map(([ code, mnemonic, mode, cycles ]: [ number, string, Mode, number ]): [ number, IOpcode ] => [ code, { mnemonic, mode, cycles } ]));
