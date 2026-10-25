import { PROGRAM_ULT4 } from '../../../src/app/lifted/program/ult4';
import { COMBAT_ENTRIES, COMBAT_LIFTED, combatData } from '../../../src/app/port/program/ult4-combat-data';
import { ULT4_ENTRIES, ULT4_LIFTED, ult4Data } from '../../../src/app/port/program/ult4-data';
import { MONSTER_ENTRIES, MONSTER_LIFTED, monsterData } from '../../../src/app/port/program/ult4-monsters-data';
import { COMMAND_ENTRIES, commandData } from '../../../src/app/port/program/ult4-commands-data';
import { TOWNE_ENTRIES, towneData } from '../../../src/app/port/program/ult4-townes-data';
import { SPELL_ENTRIES, spellData } from '../../../src/app/port/program/ult4-spells-data';

// Every byte the ULT4 port installs, combat's, the spells', the monsters', the commands' and the
// townes' included, against the image the lifter took from the build, and every label it names
// against the build's. Local only, like the rest of the gate: the lifted modules are generated,
// not committed.

const IMAGE: Uint8Array = Uint8Array.from(atob(PROGRAM_ULT4.image), (character: string): number => character.charCodeAt(0));
const LABELS: readonly [ string, number ][] = Object.entries({
  ...ULT4_ENTRIES, ...ULT4_LIFTED, ...COMBAT_ENTRIES, ...COMBAT_LIFTED, ...SPELL_ENTRIES, ...MONSTER_ENTRIES, ...MONSTER_LIFTED, ...COMMAND_ENTRIES, ...TOWNE_ENTRIES,
});


function asLoaded(address: number, length: number): number[] {
  const offset: number = address - PROGRAM_ULT4.load;

  return Array.from(IMAGE.subarray(offset, offset + length));
}


describe('ULT4\'s data', (): void => {
  it.each([ ...ult4Data(), ...combatData(), ...spellData(), ...monsterData(), ...commandData(), ...towneData() ].map(([ address, bytes ]: [ number, readonly number[] ]):
    [ string, number, readonly number[] ] => [ `$${ address.toString(16) }`, address, bytes ]))('holds the bytes at %s as the image does', (_: string, address: number, bytes: readonly number[]): void => {
    expect(bytes).toEqual(asLoaded(address, bytes.length));
  });

  it.each(LABELS)('puts %s where the build does', (name: string, address: number): void => {
    expect(address).toBe(PROGRAM_ULT4.labels[name]);
  });
});
