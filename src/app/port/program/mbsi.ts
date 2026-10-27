// program/MBSI.s: the sound board's set-up, standing in until phase 17 ports it. It answers as the
// original does when no board responds (its `@abort`: carry clear), so BOOT goes back to its menu
// and the game plays on without music.

import type { INativeModule } from '../../lifted-runtime/native-module';
import { JUMP_OVERLAY } from '../../state/symbols';
import { PortProgram } from '../port-program';
import type { IPortMachine } from '../port-machine';
import type { Exit } from '../routine';
import { overlayModule } from './overlay';


export class Mbsi extends PortProgram {
  /** init_mockingboards, as when no board answers: carry clear. */
  public initMockingboards(): Exit {
    this.setCarry(false);

    return null;
  }

}


export const MBSI_MODULE: INativeModule = overlayModule('program', 'MBSI', JUMP_OVERLAY.j_mbsi, [],
  (machine: IPortMachine): Mbsi => new Mbsi(machine), (program: Mbsi): Exit => program.initMockingboards());
