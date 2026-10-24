import { BYTES_PER_ROW, HIRES_HEIGHT, HIRES_PAGE_1, hiresRowOffset } from './apple-hires.constants';
import type { AppleMachine } from './apple-machine';


/**
 * Bytes for the bars, left to right: violet, green, white, blue, orange, white with the palette bit.
 * Seven pixels to a byte puts alternate bytes on columns of the other parity, so each bar has a
 * byte for even byte columns and one for odd.
 */
export const TEST_PATTERN_BARS: readonly (readonly [ number, number ])[] = [
  [ 0x55, 0x2A ],
  [ 0x2A, 0x55 ],
  [ 0x7F, 0x7F ],
  [ 0xD5, 0xAA ],
  [ 0xAA, 0xD5 ],
  [ 0xFF, 0xFF ],
];

const BAR_TOP: number = 64;
const BAR_HEIGHT: number = 64;
const BAR_BYTES: number = 6;
const BARS_LEFT: number = 2;


/**
 * What the screen shows until there is a game: a one-pixel frame round the edge and six
 * colour bars, drawn through the soft switches and memory as the game will draw.
 */
export function drawTestPattern(machine: AppleMachine): void {
  machine.read(0xC050);
  machine.read(0xC052);
  machine.read(0xC054);
  machine.read(0xC057);

  for (let row: number = 0; row < HIRES_HEIGHT; row++) {
    const rowBase: number = HIRES_PAGE_1 + hiresRowOffset(row);
    const edge: boolean = (row === 0) || (row === (HIRES_HEIGHT - 1));

    for (let column: number = 0; column < BYTES_PER_ROW; column++) {
      let value: number = edge ? 0x7F : 0x00;

      if (column === 0) {
        value = value | 0x01;
      }
      if (column === (BYTES_PER_ROW - 1)) {
        value = value | 0x40;
      }
      if ((row >= BAR_TOP) && (row < (BAR_TOP + BAR_HEIGHT))) {
        const bar: number = Math.floor((column - BARS_LEFT) / BAR_BYTES);

        if ((column >= BARS_LEFT) && (bar < TEST_PATTERN_BARS.length)) {
          value = TEST_PATTERN_BARS[bar][column & 1];
        }
      }

      machine.write(rowBase + column, value);
    }
  }
}
