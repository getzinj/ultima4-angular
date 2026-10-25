import type { LiftedMachine } from '../../../lifted-runtime/lifted-machine';
import { PRTY, TABLES, VIEW_MAP } from '../../../state/symbols';
import { overlayMachine, runOverlay } from '../../testing/overlay-machine';
import { TOWNE_TMAP_MODULE } from './tmap';

/** The hi-res byte holding the cell for (16, 16), the party's. */
const PARTY_CELL: number = 0x2000 + (0x4 * 0x400) + (0x5 * 0x80) + 0x0D;
/** The hi-res byte holding columns 21 to 27 of line 30: the first cell's top row and the next's. */
const FIRST_CELLS: number = 0x2000 + (6 * 0x400) + (3 * 0x80) + 3;
const GRASS: number = 0x04;
const VIEW_SIZE: number = 0x400;


function telescope(mode: number, tile: number = 0x3D): LiftedMachine {
  const machine: LiftedMachine = overlayMachine(TOWNE_TMAP_MODULE);
  const high: Uint8Array = machine.apple.languageCard.contents('high');

  for (let x: number = 0; x < 287; x++) {
    high[(TABLES.bmpcol_byte - 0xE000) + x] = Math.floor(x / 7);
    high[(TABLES.bmpcol_bit - 0xE000) + x] = 1 << (x % 7);
  }
  for (let index: number = 0; index < VIEW_SIZE; index++) {
    machine.write(VIEW_MAP.view_buf + index, tile);
  }
  machine.write(PRTY.game_mode, mode);
  machine.write(PRTY.current_location, 0x05);
  machine.write(PRTY.player_xpos, 0x10);
  machine.write(PRTY.player_ypos, 0x10);

  return machine;
}


describe('the towne TMAP, ported', (): void => {
  it('draws grass from its own table of patterns', async (): Promise<void> => {
    expect((await runOverlay(telescope(PRTY.mode_suspended, GRASS), VIEW_MAP.j_viewmap, ' ')).read(FIRST_CELLS)).toBe(0x11);
  });

  it('leaves it dark while the game is suspended for the telescope', async (): Promise<void> => {
    expect((await runOverlay(telescope(PRTY.mode_suspended), VIEW_MAP.j_viewmap, ' ')).read(PARTY_CELL)).toBe(0x00);
  });
});
