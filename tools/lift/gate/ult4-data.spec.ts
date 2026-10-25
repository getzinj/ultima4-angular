import { PROGRAM_ULT4 } from '../../../src/app/lifted/program/ult4';
import { combatData } from '../../../src/app/port/program/ult4-combat-data';
import { ult4Data } from '../../../src/app/port/program/ult4-data';

// Every byte the ULT4 port installs, combat's included, against the image the lifter took from the
// build. Local only, like the rest of the gate: the lifted modules are generated, not committed.

const IMAGE: Uint8Array = Uint8Array.from(atob(PROGRAM_ULT4.image), (character: string): number => character.charCodeAt(0));


function asLoaded(address: number, length: number): number[] {
  const offset: number = address - PROGRAM_ULT4.load;

  return Array.from(IMAGE.subarray(offset, offset + length));
}


describe('ULT4\'s data', (): void => {
  it.each([ ...ult4Data(), ...combatData() ].map(([ address, bytes ]: [ number, readonly number[] ]): [ string, number, readonly number[] ] =>
    [ `$${ address.toString(16) }`, address, bytes ]))('holds the bytes at %s as the image does', (_: string, address: number, bytes: readonly number[]): void => {
    expect(bytes).toEqual(asLoaded(address, bytes.length));
  });
});
