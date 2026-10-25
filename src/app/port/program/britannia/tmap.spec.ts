import type { LiftedMachine } from '../../../lifted-runtime/lifted-machine';
import { PRTY, TABLES, VIEW_MAP } from '../../../state/symbols';
import { overlayMachine, runOverlay } from '../../testing/overlay-machine';
import { TMAP_MODULE } from './tmap';

const BLACK_TILE: number = 0x3D;
const GRASS: number = 0x04;
const VIEW_SIZE: number = 0x400;
/** The hi-res byte holding columns 21 to 27 of line 30: the first cell's top row and the next's. */
const FIRST_CELLS: number = 0x2000 + (6 * 0x400) + (3 * 0x80) + 3;


/** Every tile in view `tile`, the party's flashing cell well away from the first, and TBLS's column tables. */
function mapOf(tile: number): LiftedMachine {
  const machine: LiftedMachine = overlayMachine(TMAP_MODULE);
  const high: Uint8Array = machine.apple.languageCard.contents('high');

  for (let x: number = 0; x < 287; x++) {
    high[(TABLES.bmpcol_byte - 0xE000) + x] = Math.floor(x / 7);
    high[(TABLES.bmpcol_bit - 0xE000) + x] = 1 << (x % 7);
  }
  for (let index: number = 0; index < VIEW_SIZE; index++) {
    machine.write(VIEW_MAP.view_buf + index, tile);
  }
  machine.write(PRTY.current_location, 0x00);
  machine.write(PRTY.tile_xpos, 0x10);
  machine.write(PRTY.tile_ypos, 0x10);
  machine.write(FIRST_CELLS, 0x7F);

  return machine;
}


function peer(machine: LiftedMachine): Promise<LiftedMachine> {
  return runOverlay(machine, VIEW_MAP.j_viewmap, ' ');
}


describe('TMAP, ported', (): void => {
  it('clears the view and leaves a tile it has no pattern for black', async (): Promise<void> => {
    expect((await peer(mapOf(BLACK_TILE))).read(FIRST_CELLS)).toBe(0x00);
  });

  it('draws grass as its pattern of dots', async (): Promise<void> => {
    expect((await peer(mapOf(GRASS))).read(FIRST_CELLS)).toBe(0x11);
  });
});
