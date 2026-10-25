import type { UltimaDiskName } from '../data/ultima-disks';
import type { LiftedMachine } from './lifted-machine';

// A program ported by hand, standing in for its lifted module: when the game loads the file, the
// machine runs these routines at their entry addresses instead of the lifted code.

/** Runs with the registers and stack as the 6502 code would find them, and leaves them as it would. */
export type NativeRoutine = (machine: LiftedMachine) => Promise<void>;


export interface INativeModule {
  readonly disk: UltimaDiskName;
  readonly name: string;
  readonly load: number;

  /** Sets the variables the program keeps in its own image to what loading it leaves there. */
  install(machine: LiftedMachine): void;

  /** By entry address: every address another program jumps to. */
  readonly entries: ReadonlyMap<number, NativeRoutine>;

  /** Entries other programs store an opcode over, which the routine there reads to decide what to do. */
  readonly opcodeStores?: readonly number[];

  /** Ported in part: the lifted module still runs everything but these entries. */
  readonly partial?: boolean;
}
