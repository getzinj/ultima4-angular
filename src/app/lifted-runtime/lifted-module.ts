import type { Cpu } from './cpu';


/** One program lifted from the remaster's build by tools/lift. */
export interface ILiftedModule {
  readonly disk: string;
  readonly name: string;
  readonly load: number;

  /** The program's bytes as BLOAD puts them in memory, base64. */
  readonly image: string;

  /** The address ranges, end exclusive, of its instruction bytes, less the patch points. */
  readonly code: readonly (readonly [ number, number ])[];

  /** Opcodes the game rewrites at run time, read live by the lifted code. */
  readonly opcodeStores: readonly number[];

  /** Operand bytes it rewrites at run time. */
  readonly patchPoints: readonly number[];
  readonly labels: Readonly<Record<string, number>>;

  /** Runs from `start` until control leaves the program; `cpu.pc` then says where it went. */
  run(cpu: Cpu, start: number): void;
}


export class LiftedBreakError extends Error {
  constructor(public readonly address: number) {
    super(`BRK at $${ address.toString(16).toUpperCase().padStart(4, '0') }`);
  }
}


export class LiftedSelfModifyError extends Error {
  constructor(public readonly address: number, public readonly value: number) {
    super(`unlifted opcode $${ value.toString(16).toUpperCase().padStart(2, '0') } stored at $${ address.toString(16).toUpperCase().padStart(4, '0') }`);
  }
}
