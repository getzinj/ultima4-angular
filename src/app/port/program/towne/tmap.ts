// towne/TMAP.s: the map a telescope shows, ported. It is Britannia's TMAP but for its cell for the
// party, which SEAR's telescope leaves unmarked by suspending the game while the map is up.

import type { LiftedMachine } from '../../../lifted-runtime/lifted-machine';
import { PRTY, VIEW_MAP } from '../../../state/symbols';
import { inline } from '../../inline-data';
import type { IInlineData } from '../../inline-data';
import type { Exit } from '../../routine';
import { TILE_PATTERNS, Tmap } from '../britannia/tmap';
import { overlayModule } from '../overlay';

const TILE_PATTERN_TABLE: number = 0x931B;

export const TOWNE_TMAP_DATA: readonly IInlineData[] = [ inline(TILE_PATTERN_TABLE, TILE_PATTERNS) ];


export class TowneTmap extends Tmap {
  constructor(machine: LiftedMachine) {
    super(machine, TILE_PATTERN_TABLE);
  }


  protected override flashLocation(): void {
    if (this.lda(this.peek(PRTY.game_mode)) !== PRTY.mode_suspended) {
      super.flashLocation();
    }
  }
}


export const TOWNE_TMAP_MODULE = overlayModule('towne', 'TMAP', VIEW_MAP.j_viewmap, TOWNE_TMAP_DATA, (machine: LiftedMachine): TowneTmap => new TowneTmap(machine),
  (program: TowneTmap): Promise<Exit> => program.run());
