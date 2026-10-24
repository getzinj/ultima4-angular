import { StateError } from './state-memory';

// The game keeps its counts in binary-coded decimal, most significant byte first: two digits a
// byte, added and subtracted in the 6502's decimal mode.


/** The number BCD bytes hold. A nibble above 9, which the game never writes, counts at face value. */
export function fromBcd(bytes: readonly number[]): number {
  return bytes.reduce((total: number, byte: number): number => (total * 100) + ((byte >> 4) * 10) + (byte & 0x0F), 0);
}


export function toBcd(value: number, byteCount: number): number[] {
  if (!Number.isInteger(value) || (value < 0) || (value >= (100 ** byteCount))) {
    throw new StateError(`${ value } does not fit in ${ byteCount * 2 } BCD digits`);
  } else {
    const bytes: number[] = [];
    let rest: number = value;

    for (let index: number = 0; index < byteCount; index++) {
      const pair: number = rest % 100;

      bytes.unshift(((Math.floor(pair / 10)) << 4) | (pair % 10));
      rest = Math.floor(rest / 100);
    }

    return bytes;
  }
}
