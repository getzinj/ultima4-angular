import type { LiftedMachine } from '../../../lifted-runtime/lifted-machine';
import { DUNGEON, PRTY, VIEW_MAP } from '../../../state/symbols';
import { overlayMachine, runOverlay } from '../../testing/overlay-machine';
import { UNDERWORLD_TMAP_MODULE } from './tmap';

const ROW: number = 22;
const CENTER: number = 0x0B;


/** The gem's map on the first level, the party at (2, 2), the level all `tile`. */
function level(tile: number): LiftedMachine {
  const machine: LiftedMachine = overlayMachine(UNDERWORLD_TMAP_MODULE);

  machine.write(PRTY.dungeon_level, 0x00);
  machine.write(PRTY.player_xpos, 0x02);
  machine.write(PRTY.player_ypos, 0x02);
  for (let index: number = 0; index < 0x40; index++) {
    machine.write(VIEW_MAP.view_buf + index, tile);
  }

  return machine;
}


function visited(machine: LiftedMachine, x: number, y: number): number {
  return machine.read(VIEW_MAP.visited_buffer + (y * ROW) + x);
}


describe('the underworld TMAP, ported', (): void => {
  it('visits the cells next to the party', async (): Promise<void> => {
    expect(visited(await runOverlay(level(0x00), VIEW_MAP.j_viewmap, ' '), CENTER + 1, CENTER)).toBe(0xFF);
  });

  it('explores on past an open cell', async (): Promise<void> => {
    expect(visited(await runOverlay(level(0x00), VIEW_MAP.j_viewmap, ' '), CENTER + 2, CENTER)).toBe(0xFF);
  });

  it('explores no further than a wall', async (): Promise<void> => {
    expect(visited(await runOverlay(level(DUNGEON.dng_tile_wall), VIEW_MAP.j_viewmap, ' '), CENTER + 2, CENTER)).toBe(0x00);
  });
});
