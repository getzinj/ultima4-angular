import type { LiftedMachine } from '../lifted-runtime/lifted-machine';

/**
 * What ported code needs of the machine: the registers, the bus, the keyboard (whose reads a
 * scenario may stop after), and calls out to code that is not ported yet.
 */
export type IPortMachine = Pick<LiftedMachine, 'cpu' | 'read' | 'write' | 'readKeyboard' | 'clearKeyboardStrobe' | 'checkpoint' | 'call' | 'callInline' | 'rts' | 'at'>;
