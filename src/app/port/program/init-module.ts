import type { LiftedMachine } from '../../lifted-runtime/lifted-machine';
import type { INativeModule, NativeRoutine } from '../../lifted-runtime/native-module';
import type { IInlineData } from '../inline-data';
import { routine } from '../routine';
import { INIT_INLINE, INIT_LOAD, Init } from './init';

// INIT as a native module: the one entry DOS's BRUN starts, and its strings.

export const INIT_MODULE: INativeModule = {
  disk: 'program',
  name: 'INIT',
  load: INIT_LOAD,
  install: (machine: LiftedMachine): void => {
    for (const block of Object.values(INIT_INLINE) as IInlineData[]) {
      block.bytes.forEach((value: number, index: number): void => machine.write(block.address + index, value));
    }
  },
  entries: new Map<number, NativeRoutine>([
    [ INIT_LOAD, routine((machine: LiftedMachine): Init => new Init(machine), (program: Init): Promise<void> => program.run(), false) ],
  ]),
};
