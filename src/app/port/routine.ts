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
