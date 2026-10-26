import { hiresRowOffset } from '../runtime/apple-hires.constants';

export const TEXT_COLUMNS: number = 40;
export const TEXT_ROWS: number = 24;
const GLYPH_ROWS: number = 8;
/** The font's stride: a glyph's next row is 128 bytes on. */
const FONT_STRIDE: number = 0x80;
const PIXEL_BITS: number = 0x7F;
const FIRST_PRINTABLE: number = 0x20;
/** The cursor cycles through $7C-$7F, so they read as spaces. */
const LAST_PRINTABLE: number = 0x7B;
/** The status pane, which changes every turn: the party and the food and gold, right of the map. */
const STATUS_FIRST_ROW: number = 1;
const STATUS_LAST_ROW: number = 10;
const STATUS_FIRST_COLUMN: number = 24;
/** Text this far apart is two lines, as the map's wind and the message pane are; the wind pads its direction to five letters, so two spaces are not enough. */
const GAP: RegExp = / {3,}/;

/** A cell's eight rows of pixels, without the palette bit, as a key. */
type CellKey = string;


function keyOf(rows: readonly number[]): CellKey {
  return rows.map((row: number): string => (row & PIXEL_BITS).toString(16).padStart(2, '0')).join('');
}


/**
 * The printable glyphs of the game's font (its `font_data`, a glyph's rows 128 bytes apart), each
 * by its pixels and by its pixels inverted, as `invert_player_name` draws a name.
 */
export function glyphTable(font: Uint8Array): ReadonlyMap<CellKey, string> {
  const table: Map<CellKey, string> = new Map<CellKey, string>();

  for (let glyph: number = FIRST_PRINTABLE; glyph <= LAST_PRINTABLE; glyph++) {
    const rows: number[] = Array.from({ length: GLYPH_ROWS }, (_: unknown, row: number): number => font[(row * FONT_STRIDE) + glyph]);
    const character: string = String.fromCharCode(glyph);

    for (const key of [ keyOf(rows), keyOf(rows.map((row: number): number => row ^ PIXEL_BITS)) ]) {
      if (!table.has(key)) {
        table.set(key, character);
      }
    }
  }

  return table;
}


/** The screen's 40 by 24 character cells read back through the font; a cell holding anything else reads as a space. */
export function readScreenText(page: Uint8Array, table: ReadonlyMap<CellKey, string>): string[] {
  return Array.from({ length: TEXT_ROWS }, (_: unknown, row: number): string => {
    let line: string = '';

    for (let column: number = 0; column < TEXT_COLUMNS; column++) {
      const rows: number[] = Array.from({ length: GLYPH_ROWS }, (__: unknown, pixelRow: number): number =>
        page[hiresRowOffset((row * GLYPH_ROWS) + pixelRow) + column]);

      line = line + (table.get(keyOf(rows)) ?? ' ');
    }

    return line;
  });
}


function isStatusRow(row: number): boolean {
  return (row >= STATUS_FIRST_ROW) && (row <= STATUS_LAST_ROW);
}


/** The status pane's lines: the party's names and hit points, and the food and gold. */
export function statusLines(screen: readonly string[]): string[] {
  return screen.slice(STATUS_FIRST_ROW, STATUS_LAST_ROW + 1)
    .map((line: string): string => line.slice(STATUS_FIRST_COLUMN).trim())
    .filter((line: string): boolean => line.length > 0);
}


/** Every other piece of text on the screen, a piece to a run of words. */
export function messageLines(screen: readonly string[]): string[] {
  return screen.flatMap((line: string, row: number): string[] => (isStatusRow(row) ? line.slice(0, STATUS_FIRST_COLUMN) : line)
    .split(GAP)
    .map((piece: string): string => piece.trim())
    .filter((piece: string): boolean => piece.length > 0));
}


/** The lines of `current` not already in `previous`, counting repeats, so a scrolled line is not new and a repeated message is. */
export function newLines(previous: readonly string[], current: readonly string[]): string[] {
  const left: Map<string, number> = new Map<string, number>();

  for (const line of previous) {
    left.set(line, (left.get(line) ?? 0) + 1);
  }

  return current.filter((line: string): boolean => {
    const count: number = left.get(line) ?? 0;

    left.set(line, count - 1);

    return count <= 0;
  });
}
