import type { LiftedMachine } from '../../lifted-runtime/lifted-machine';
import type { INativeModule, NativeRoutine } from '../../lifted-runtime/native-module';
import { routine } from '../routine';
import { Boot } from './boot';
import { BOOT_LOAD, bootData } from './boot-data';

// BOOT as a native module: the one entry INIT's BRUN starts, and its variables, tables and strings.

export const BOOT_MODULE: INativeModule = {
  disk: 'program',
  name: 'BOOT',
  load: BOOT_LOAD,
  install: (machine: LiftedMachine): void => {
    for (const [ address, bytes ] of bootData()) {
      bytes.forEach((value: number, index: number): void => machine.write(address + index, value));
    }
  },
  entries: new Map<number, NativeRoutine>([
    [ BOOT_LOAD, routine((machine: LiftedMachine): Boot => new Boot(machine), (program: Boot): Promise<void> => program.run(), true) ],
  ]),
};
