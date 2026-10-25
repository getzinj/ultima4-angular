import type { LiftedMachine } from '../../../lifted-runtime/lifted-machine';
import type { INativeModule, NativeRoutine } from '../../../lifted-runtime/native-module';
import { inline } from '../../inline-data';
import type { IInlineData } from '../../inline-data';
import { exitRoutine } from '../../routine';
import type { Exit } from '../../routine';
import { encode } from '../../text';

// A Britannia overlay as a native module: one program at $8800 (or $9000 for TMAP) with the entry
// ULT4 calls when it has loaded the file (LORD has a second), and the bytes it reads as data.

export const OVERLAY_ENTRY: number = 0x8800;


/** A string the overlay prints, with its terminating zero. */
export function text(address: number, value: string): IInlineData {
  return inline(address, [ ...encode(value), 0x00 ]);
}


/** An entry of an overlay's own, past its first: LORD's talk_lord_british. */
export type OverlayEntry<T> = readonly [ number, (program: T) => Exit | Promise<Exit> ];


export function overlayModule<T>(
  name: string,
  load: number,
  data: readonly IInlineData[],
  create: (machine: LiftedMachine) => T,
  body: (program: T) => Exit | Promise<Exit>,
  more: readonly OverlayEntry<T>[] = [],
): INativeModule {
  return {
    disk: 'britannia',
    name,
    load,
    install: (machine: LiftedMachine): void => {
      for (const block of data) {
        block.bytes.forEach((value: number, index: number): void => machine.write(block.address + index, value));
      }
    },
    entries: new Map<number, NativeRoutine>([
      [ load, exitRoutine(create, body) ],
      ...more.map(([ address, entry ]: OverlayEntry<T>): [ number, NativeRoutine ] => [ address, exitRoutine(create, entry) ]),
    ]),
  };
}
