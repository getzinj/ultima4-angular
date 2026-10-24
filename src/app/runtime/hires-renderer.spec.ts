import { NTSC_ARTIFACT_PALETTE } from './apple-palette';
import { HIRES_BYTES, HIRES_HEIGHT, HIRES_WIDTH, hiresRowOffset } from './apple-hires.constants';
import { hiresToAscii, isLit, renderHires } from './hires-renderer';


function pageWith(row: number, byteColumn: number, value: number): Uint8Array {
  const page: Uint8Array = new Uint8Array(HIRES_BYTES);

  page[hiresRowOffset(row) + byteColumn] = value;

  return page;
}


function colorAt(page: Uint8Array, x: number, y: number): number[] {
  const pixels: Uint8ClampedArray = new Uint8ClampedArray(HIRES_WIDTH * HIRES_HEIGHT * 4);
  const index: number = ((y * HIRES_WIDTH) + x) * 4;

  renderHires(page, pixels, NTSC_ARTIFACT_PALETTE);

  return Array.from(pixels.subarray(index, index + 4));
}


describe('hiresRowOffset', (): void => {
  it('puts row 1 a kilobyte after row 0', (): void => {
    expect(hiresRowOffset(1)).toBe(0x400);
  });

  it('puts row 8 128 bytes after row 0', (): void => {
    expect(hiresRowOffset(8)).toBe(0x80);
  });

  it('puts row 64 40 bytes after row 0', (): void => {
    expect(hiresRowOffset(64)).toBe(0x28);
  });

  it('puts row 191 at $3FD0', (): void => {
    expect(hiresRowOffset(191)).toBe(0x1FD0);
  });
});


describe('isLit', (): void => {
  it('takes bit 0 as the leftmost pixel of a byte', (): void => {
    expect(isLit(pageWith(5, 3, 0x01), 21, 5)).toBe(true);
  });

  it('ignores the palette bit', (): void => {
    expect(isLit(pageWith(5, 3, 0x80), 27, 5)).toBe(false);
  });
});


describe('hiresToAscii', (): void => {
  it('draws one byte as its seven pixels', (): void => {
    expect(hiresToAscii(pageWith(0, 0, 0x55), 0, 0, 7, 1)).toEqual([ '#.#.#.#' ]);
  });

  it('draws rows top to bottom', (): void => {
    const page: Uint8Array = pageWith(1, 0, 0x03);

    expect(hiresToAscii(page, 0, 0, 3, 2)).toEqual([ '...', '##.' ]);
  });
});


describe('renderHires', (): void => {
  it('colours an isolated pixel in an even column violet', (): void => {
    expect(colorAt(pageWith(0, 0, 0x01), 0, 0)).toEqual([ 0xD4, 0x00, 0xCC, 255 ]);
  });

  it('colours an isolated pixel in an odd column green', (): void => {
    expect(colorAt(pageWith(0, 0, 0x02), 1, 0)).toEqual([ 0x00, 0xCC, 0x44, 255 ]);
  });

  it('colours an isolated even pixel with the palette bit blue', (): void => {
    expect(colorAt(pageWith(0, 0, 0x81), 0, 0)).toEqual([ 0x00, 0x99, 0xFF, 255 ]);
  });

  it('colours an isolated odd pixel with the palette bit orange', (): void => {
    expect(colorAt(pageWith(0, 0, 0x82), 1, 0)).toEqual([ 0xFF, 0x6A, 0x00, 255 ]);
  });

  it('colours two neighbouring pixels white', (): void => {
    expect(colorAt(pageWith(0, 0, 0x03), 0, 0)).toEqual([ 0xE0, 0xE0, 0xE0, 255 ]);
  });

  it('paints an unlit pixel in the background colour', (): void => {
    expect(colorAt(new Uint8Array(HIRES_BYTES), 100, 100)).toEqual([ 0, 0, 0, 255 ]);
  });
});
