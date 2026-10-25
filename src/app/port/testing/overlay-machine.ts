import type { LiftedMachine } from '../../lifted-runtime/lifted-machine';
import type { INativeModule } from '../../lifted-runtime/native-module';
import { RETURN, subsMachine } from './subs-machine';

// A Britannia overlay, ported, loaded over the ported SUBS, and its entry called.

export function overlayMachine(module: INativeModule): LiftedMachine {
  const machine: LiftedMachine = subsMachine([ module ]);

  machine.bload('britannia', module.name);

  return machine;
}


/** JSR to the overlay's entry, with `keys` typed as it asks for them, and run until it returns. */
export async function runOverlay(machine: LiftedMachine, entry: number, keys: string = ''): Promise<LiftedMachine> {
  machine.cpu.pushWord(RETURN - 1);
  machine.cpu.pc = entry;
  for (const key of keys) {
    await machine.press(key.charCodeAt(0));
  }
  await machine.runUntil((): boolean => machine.cpu.pc === RETURN);

  return machine;
}
