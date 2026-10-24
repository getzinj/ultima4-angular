import type { IApplePalette, IRgb } from './apple-palette';
import { artifactColor } from './apple-palette';
import { BYTES_PER_ROW, HIRES_HEIGHT, HIRES_WIDTH, PIXELS_PER_BYTE, hiresRowOffset } from './apple-hires.constants';


export function isLit(page: Uint8Array, x: number, y: number): boolean {
  return (page[hiresRowOffset(y) + Math.floor(x / PIXELS_PER_BYTE)] & (1 << (x % PIXELS_PER_BYTE))) !== 0;
}


/** Paints 280 x 192 pixels of RGBA, colouring each pixel by its neighbours, column and palette bit. */
export function renderHires(page: Uint8Array, target: Uint8ClampedArray, palette: IApplePalette): void {
  const lit: boolean[] = new Array<boolean>(HIRES_WIDTH);
  const paletteBits: boolean[] = new Array<boolean>(HIRES_WIDTH);

  for (let pixelRow: number = 0; pixelRow < HIRES_HEIGHT; pixelRow++) {
    const rowBase: number = hiresRowOffset(pixelRow);

    for (let byteIndex: number = 0; byteIndex < BYTES_PER_ROW; byteIndex++) {
      const value: number = page[rowBase + byteIndex];

      for (let bit: number = 0; bit < PIXELS_PER_BYTE; bit++) {
        const column: number = (byteIndex * PIXELS_PER_BYTE) + bit;

        lit[column] = (value & (1 << bit)) !== 0;
        paletteBits[column] = (value & 0x80) !== 0;
      }
    }

    for (let column: number = 0; column < HIRES_WIDTH; column++) {
      const leftLit: boolean = (column > 0) && lit[column - 1];
      const rightLit: boolean = (column < (HIRES_WIDTH - 1)) && lit[column + 1];
      const color: IRgb = artifactColor(palette, lit[column], leftLit, rightLit, column, paletteBits[column]);
      const index: number = ((pixelRow * HIRES_WIDTH) + column) * 4;

      target[index] = color.r;
      target[index + 1] = color.g;
      target[index + 2] = color.b;
      target[index + 3] = 255;
    }
  }
}


/** '#' for lit and '.' for dark, one string per pixel row, for specs. */
export function hiresToAscii(page: Uint8Array, left: number, top: number, width: number, height: number): string[] {
  const rows: string[] = [];

  for (let pixelRow: number = top; pixelRow < (top + height); pixelRow++) {
    let line: string = '';

    for (let column: number = left; column < (left + width); column++) {
      line = line + (isLit(page, column, pixelRow) ? '#' : '.');
    }

    rows.push(line);
  }

  return rows;
}
