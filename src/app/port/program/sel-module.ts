import type { LiftedMachine } from '../../lifted-runtime/lifted-machine';
import type { INativeModule, NativeRoutine } from '../../lifted-runtime/native-module';
import { JUMP_SYSTEM } from '../../state/symbols';
import { routine } from '../routine';
import { SEL_BLOAD_MUSIC, SEL_JUMPS, SEL_LOAD, Sel } from './sel';

// SEL as a native module: its jump table and DOS's break vector, and what loading it leaves in
// its image.

function sel(machine: LiftedMachine): Sel {
  return new Sel(machine);
}


export const SEL_MODULE: INativeModule = {
  disk: 'program',
  name: 'SEL',
  load: SEL_LOAD,
  install: (machine: LiftedMachine): void => {
    const blocks: [ number, readonly number[] ][] = [
      [ SEL_LOAD, SEL_JUMPS ],
      [ JUMP_SYSTEM.err_resume_addr, [ 0x00, 0x00, 0x00 ] ],
      [ SEL_BLOAD_MUSIC.address, SEL_BLOAD_MUSIC.bytes ],
    ];

    for (const [ address, bytes ] of blocks) {
      bytes.forEach((value: number, index: number): void => machine.write(address + index, value));
    }
  },
  entries: new Map<number, NativeRoutine>([
    [ JUMP_SYSTEM.music_ctl, routine(sel, (program: Sel): Promise<void> => program.jMusicCtl(), true) ],
    [ JUMP_SYSTEM.spin_drive_motor, routine(sel, (program: Sel): void => program.spinDriveMotor(), true) ],
    [ JUMP_SYSTEM.on_dos_error, routine(sel, (program: Sel): void => program.onDosError(), false) ],
  ]),
  opcodeStores: [ JUMP_SYSTEM.music_ctl ],
};
