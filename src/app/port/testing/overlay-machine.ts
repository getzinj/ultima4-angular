import type { LiftedMachine } from '../../lifted-runtime/lifted-machine';
import type { INativeModule } from '../../lifted-runtime/native-module';
import { SEL_MODULE } from '../program/sel-module';
import { ZP_MAIN } from '../../state/symbols';
import { RETURN, subsMachine } from './subs-machine';

const KEY_POLLS: number = 10;

// An overlay, ported, loaded over the ported SUBS and SEL (for music_ctl), with any other overlay
// it BRUNs and its own disk in the drive for what it loads, and its entry called.

export function overlayMachine(module: INativeModule, others: readonly INativeModule[] = []): LiftedMachine {
  const machine: LiftedMachine = subsMachine([ module, SEL_MODULE, ...others ]);

  machine.bload('program', 'SEL', 0x0320);
  machine.bload(module.disk, module.name);
  machine.insertDisk(1, module.disk);

  return machine;
}


/**
 * JSR to the overlay's entry, with `keys` typed as it asks for them, each once the game has taken
 * the last from its type-ahead buffer (as the scenarios type), and run until it returns.
 */
export async function runOverlay(machine: LiftedMachine, entry: number, keys: string = ''): Promise<LiftedMachine> {
  machine.cpu.pushWord(RETURN - 1);
  machine.cpu.pc = entry;
  for (const key of keys) {
    await machine.press(key.charCodeAt(0), KEY_POLLS);
    await machine.runUntil((): boolean => machine.read(ZP_MAIN.key_buf_len) === 0);
  }
  await machine.runUntil((): boolean => machine.cpu.pc === RETURN);

  return machine;
}
