import type { LiftedMachine } from '../../../lifted-runtime/lifted-machine';
import { DUNGEON, PRTY, TABLES, ZP_MAIN } from '../../../state/symbols';
import { overlayMachine, runOverlay } from '../../testing/overlay-machine';
import { DNGD_ENTRIES, DNGD_VARIABLES } from './dngd-data';
import { UNDERWORLD_DNGD_MODULE } from './dngd';

const E = DNGD_ENTRIES;
const V = DNGD_VARIABLES;
const DUNGEON_MAP: number = 0xE800;
const tile_forward_1: number = 0xC9;
const tile_behind: number = 0xCC;
const BLANK: number = 0x80;
const VIEW_ROW: number = 0x50;
/** A line of a sprite a square ahead, which draw_sprite_1 draws from line $68. */
const SPRITE_ROW: number = 0x70;


/** Facing east from (2, 2) on the first level, its halls all empty, with light; TBLS's columns as the game has them. */
function inTheHalls(): LiftedMachine {
  const machine: LiftedMachine = overlayMachine(UNDERWORLD_DNGD_MODULE);
  const high: Uint8Array = machine.apple.languageCard.contents('high');

  for (let x: number = 0; x < 280; x++) {
    high[(TABLES.bmpcol_byte - 0xE000) + x] = Math.floor(x / 7);
    high[(TABLES.bmpcol_bit - 0xE000) + x] = 1 << (x % 7);
  }
  for (let index: number = 0; index < 0x40; index++) {
    machine.write(DUNGEON_MAP + index, 0x00);
  }
  machine.write(PRTY.dungeon_level, 0x00);
  machine.write(PRTY.player_xpos, 0x02);
  machine.write(PRTY.player_ypos, 0x02);
  machine.write(PRTY.dng_direction, DUNGEON.dng_dir_east);
  machine.write(PRTY.light_duration, 0x20);

  return machine;
}


/** The view's bytes on screen line `line`, columns 1 to 22. */
function row(machine: LiftedMachine, line: number): number[] {
  const address: number = machine.read(TABLES.bmplineaddr_lo + line) | (machine.read(TABLES.bmplineaddr_hi + line) << 8);

  return Array.from({ length: 0x16 }, (_: unknown, column: number): number => machine.read(address + column + 1));
}


function middleRow(machine: LiftedMachine): number[] {
  return row(machine, VIEW_ROW);
}


function blank(machine: LiftedMachine): boolean {
  return middleRow(machine).every((byte: number): boolean => byte === BLANK);
}


/** `tile` on the square the party faces. */
function facing(tile: number): LiftedMachine {
  const machine: LiftedMachine = inTheHalls();

  machine.write(DUNGEON_MAP + (0x02 * 8) + 0x03, tile);

  return machine;
}


describe('the underworld DNGD, ported', (): void => {
  describe('the neighbours', (): void => {
    it('reads the tile the party faces', async (): Promise<void> => {
      expect((await runOverlay(facing(DUNGEON.dng_tile_door), E.dungeon_redraw)).read(tile_forward_1)).toBe(DUNGEON.dng_tile_door);
    });

    it('reads the tile behind the party', async (): Promise<void> => {
      const machine: LiftedMachine = inTheHalls();

      machine.write(DUNGEON_MAP + (0x02 * 8) + 0x01, DUNGEON.dng_tile_wall);

      expect((await runOverlay(machine, E.dungeon_redraw)).read(tile_behind)).toBe(DUNGEON.dng_tile_wall);
    });

    it('reads the tile under the party', async (): Promise<void> => {
      const machine: LiftedMachine = inTheHalls();

      machine.write(DUNGEON_MAP + (0x02 * 8) + 0x02, 0x10);

      expect((await runOverlay(machine, E.dungeon_redraw)).read(ZP_MAIN.tile_under_player)).toBe(0x10);
    });
  });

  describe('the view', (): void => {
    it('draws a wall ahead apart from an empty hall', async (): Promise<void> => {
      const hall: number[] = middleRow(await runOverlay(facing(0x00), E.dungeon_redraw));

      expect(middleRow(await runOverlay(facing(DUNGEON.dng_tile_wall), E.dungeon_redraw))).not.toEqual(hall);
    });

    it('draws nothing without light', async (): Promise<void> => {
      const machine: LiftedMachine = facing(DUNGEON.dng_tile_wall);

      machine.write(PRTY.light_duration, 0x00);

      expect(blank(await runOverlay(machine, E.dungeon_redraw))).toBe(true);
    });

    it('fills the view with a field ahead', async (): Promise<void> => {
      expect(middleRow(await runOverlay(facing(DUNGEON.dng_tile_field), E.dungeon_redraw)).some((byte: number): boolean => byte !== BLANK)).toBe(true);
    });

    it('takes a field\'s colours from its own generator', async (): Promise<void> => {
      expect((await runOverlay(facing(DUNGEON.dng_tile_field), E.dungeon_redraw)).read(V.rand_data)).not.toBe(0x49);
    });

    it('remembers where it was drawn from', async (): Promise<void> => {
      expect((await runOverlay(facing(DUNGEON.dng_tile_wall), E.dungeon_redraw)).read(V.last_drawn_forward_1)).toBe(DUNGEON.dng_tile_wall);
    });
  });

  describe('the check for an update', (): void => {
    it('leaves the view as it was when nothing has changed', async (): Promise<void> => {
      const machine: LiftedMachine = await runOverlay(facing(DUNGEON.dng_tile_wall), E.dungeon_redraw);
      const row: number = machine.read(TABLES.bmplineaddr_lo + VIEW_ROW) | (machine.read(TABLES.bmplineaddr_hi + VIEW_ROW) << 8);

      machine.write(row + 0x0B, 0x55);

      expect(middleRow(await runOverlay(machine, E.dungeon_check_update))[0x0A]).toBe(0x55);
    });

    it('draws the view again when the party has moved', async (): Promise<void> => {
      const machine: LiftedMachine = await runOverlay(facing(DUNGEON.dng_tile_wall), E.dungeon_redraw);

      machine.write(PRTY.player_xpos, 0x06);

      expect((await runOverlay(machine, E.dungeon_check_update)).read(V.last_drawn_player_xpos)).toBe(0x06);
    });
  });

  describe('the monsters and items', (): void => {
    it('clears the view without light', async (): Promise<void> => {
      const machine: LiftedMachine = await runOverlay(facing(DUNGEON.dng_tile_wall), E.dungeon_redraw);

      machine.write(PRTY.light_duration, 0x00);

      expect(blank(await runOverlay(machine, E.draw_items_monsters))).toBe(true);
    });

    it('draws a monster ahead from the tile map', async (): Promise<void> => {
      const machine: LiftedMachine = facing(0x05);

      machine.apple.languageCard.contents('bank1').fill(0x7F, 0x0000, 0x1000);
      machine.apple.languageCard.contents('bank2').fill(0x7F, 0x0000, 0x1000);
      machine.write(tile_forward_1, 0x05);

      expect(row(await runOverlay(machine, E.draw_items_monsters), SPRITE_ROW).some((byte: number): boolean => byte !== 0x00)).toBe(true);
    });
  });
});
