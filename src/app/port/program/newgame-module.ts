import type { LiftedMachine } from '../../lifted-runtime/lifted-machine';
import type { INativeModule, NativeRoutine } from '../../lifted-runtime/native-module';
import { routine } from '../routine';
import { Newgame } from './newgame';
import { NEWGAME_LOAD, newgameData } from './newgame-data';

// NEWGAME as a native module: the one entry BOOT's BRUN starts, and its variables, tables and strings.

export const NEWGAME_MODULE: INativeModule = {
  disk: 'program',
  name: 'NEWGAME',
  load: NEWGAME_LOAD,
  install: (machine: LiftedMachine): void => {
    for (const [ address, bytes ] of newgameData()) {
      bytes.forEach((value: number, index: number): void => machine.write(address + index, value));
    }
  },
  entries: new Map<number, NativeRoutine>([
    [ NEWGAME_LOAD, routine((machine: LiftedMachine): Newgame => new Newgame(machine), (program: Newgame): Promise<void> => program.run(), true) ],
  ]),
};
