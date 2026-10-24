import { BYTES_PER_ROW, HIRES_BYTES, hiresRowOffset } from '../../runtime/apple-hires.constants';

// Stephen Meuse's Super Packer, which the creation slides (*.SPK) and the ending (CSTRING) use.
// The stream's first two bytes name its repeat and pattern codes. A repeat code is followed by a
// count and the byte to repeat; a pattern code by a length, a count, and that many bytes to unpack
// count times, themselves packed the same way. Any other byte stands for itself.

export class SuperPackerError extends Error {
}


function unpackRun(source: Uint8Array, start: number, end: number, repeat: number, pattern: number, out: number[]): void {
  let position: number = start;

  while (position < end) {
    const code: number = source[position];

    if (code === repeat) {
      if ((position + 2) >= end) {
        throw new SuperPackerError(`a repeat at ${ position } runs off the end`);
      } else {
        for (let count: number = 0; count < source[position + 1]; count++) {
          out.push(source[position + 2]);
        }
        position = position + 3;
      }
    } else if (code === pattern) {
      const length: number = source[position + 1];
      const times: number = source[position + 2];

      if ((position + 3 + length) > end) {
        throw new SuperPackerError(`a pattern at ${ position } runs off the end`);
      } else {
        for (let count: number = 0; count < times; count++) {
          unpackRun(source, position + 3, position + 3 + length, repeat, pattern, out);
        }
        position = position + 3 + length;
      }
    } else {
      out.push(code);
      position++;
    }
  }
}


export function unpackSuperPacker(stream: Uint8Array): Uint8Array {
  const out: number[] = [];

  if (stream.length < 2) {
    throw new SuperPackerError('a packed stream starts with its two codes');
  } else {
    unpackRun(stream, 2, stream.length, stream[0], stream[1], out);

    return Uint8Array.from(out);
  }
}


export const SLIDE_COLUMNS: number = 40;
export const SLIDE_ROWS: number = 144;


/**
 * A creation slide as an HGR page: the unpacked bytes fill columns from the right, each from the
 * bottom row up (`tools/spk.py`).
 */
export function slideToHires(stream: Uint8Array): Uint8Array {
  const bytes: Uint8Array = unpackSuperPacker(stream);
  const page: Uint8Array = new Uint8Array(HIRES_BYTES);
  let index: number = 0;

  if (bytes.length < (SLIDE_COLUMNS * SLIDE_ROWS)) {
    throw new SuperPackerError(`a slide unpacks to ${ SLIDE_COLUMNS * SLIDE_ROWS } bytes; this one to ${ bytes.length }`);
  } else {
    for (let column: number = BYTES_PER_ROW - 1; column >= 0; column--) {
      for (let row: number = SLIDE_ROWS - 1; row >= 0; row--) {
        page[hiresRowOffset(row) + column] = bytes[index];
        index++;
      }
    }

    return page;
  }
}
