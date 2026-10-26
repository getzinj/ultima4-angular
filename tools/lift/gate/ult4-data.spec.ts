import { PROGRAM_ULT4 } from '../../../src/app/lifted/program/ult4';
import { COMBAT_ENTRIES, combatData } from '../../../src/app/port/program/ult4-combat-data';
import { ULT4_ENTRIES, ult4Data } from '../../../src/app/port/program/ult4-data';
import { MONSTER_ENTRIES, monsterData } from '../../../src/app/port/program/ult4-monsters-data';
import { COMMAND_ENTRIES, commandData } from '../../../src/app/port/program/ult4-commands-data';
import { TOWNE_ENTRIES, towneData } from '../../../src/app/port/program/ult4-townes-data';
import { DUNGEON_ENTRIES, DUNGEON_TABLES, dungeonData } from '../../../src/app/port/program/ult4-dungeons-data';
import { SPELL_ENTRIES, spellData } from '../../../src/app/port/program/ult4-spells-data';

// Every byte the ULT4 port installs, combat's, the spells', the monsters', the commands', the
// townes' and the dungeons' included, against the image the lifter took from the build, and every label it names
// against the build's. Local only, like the rest of the gate: the lifted modules are generated,
// not committed.

const IMAGE: Uint8Array = Uint8Array.from(atob(PROGRAM_ULT4.image), (character: string): number => character.charCodeAt(0));
const LABELS: readonly [ string, number ][] = Object.entries({
  ...ULT4_ENTRIES, ...COMBAT_ENTRIES, ...SPELL_ENTRIES, ...MONSTER_ENTRIES, ...COMMAND_ENTRIES, ...TOWNE_ENTRIES, ...DUNGEON_ENTRIES, ...DUNGEON_TABLES,
});


function asLoaded(address: number, length: number): number[] {
  const offset: number = address - PROGRAM_ULT4.load;

  return Array.from(IMAGE.subarray(offset, offset + length));
}


describe('ULT4\'s data', (): void => {
  it.each([ ...ult4Data(), ...combatData(), ...spellData(), ...monsterData(), ...commandData(), ...towneData(), ...dungeonData() ].map(([ address, bytes ]: [ number, readonly number[] ]):
    [ string, number, readonly number[] ] => [ `$${ address.toString(16) }`, address, bytes ]))('holds the bytes at %s as the image does', (_: string, address: number, bytes: readonly number[]): void => {
    expect(bytes).toEqual(asLoaded(address, bytes.length));
  });

  it.each(LABELS)('puts %s where the build does', (name: string, address: number): void => {
    expect(address).toBe(PROGRAM_ULT4.labels[name]);
  });
});
