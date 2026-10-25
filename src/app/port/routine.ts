import type { LiftedMachine } from '../lifted-runtime/lifted-machine';
import type { NativeRoutine } from '../lifted-runtime/native-module';

/** An entry of a ported program: a fresh instance runs `body`, and then the RTS, if it ends in one. */
export function routine<T>(create: (machine: LiftedMachine) => T, body: (program: T) => void | Promise<void>, returns: boolean): NativeRoutine {
  return async (machine: LiftedMachine): Promise<void> => {
    await body(create(machine));
    if (returns) {
      machine.rts();
    }
  };
}


/** Where an entry goes when it is done: null for its RTS, or the address it jumps to. */
export type Exit = number | null;


/** An entry that returns where it goes: its RTS, or a JMP to the address it gives. */
export function exitRoutine<T>(create: (machine: LiftedMachine) => T, body: (program: T) => Exit | Promise<Exit>): NativeRoutine {
  return async (machine: LiftedMachine): Promise<void> => {
    const exit: Exit = await body(create(machine));

    if (exit == null) {
      machine.rts();
    } else {
      machine.cpu.pc = exit;
    }
  };
}
