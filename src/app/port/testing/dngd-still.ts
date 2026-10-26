import type { LiftedMachine } from '../../lifted-runtime/lifted-machine';
import type { INativeModule, NativeRoutine } from '../../lifted-runtime/native-module';
import { JUMP_OVERLAY } from '../../state/symbols';

// A DNGD for the specs that draws nothing: each of its entries returns at once.

const J = JUMP_OVERLAY;


export const DNGD_STILL: INativeModule = {
  disk: 'underworld',
  name: 'DNGD',
  load: J.j_dng_check_update,
  install: (): void => undefined,
  entries: new Map<number, NativeRoutine>([ J.j_dng_check_update, J.j_dng_draw_items_monsters, J.j_dng_neighbor_tiles ].map((entry: number): [ number, NativeRoutine ] =>
    [ entry, (machine: LiftedMachine): Promise<void> => Promise.resolve(machine.rts()) ])),
};
