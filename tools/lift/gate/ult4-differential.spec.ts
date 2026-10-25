import { ULT4_MODULE } from '../../../src/app/port/program/ult4-module';
import { differences, runRoutine } from './differential';
import type { ICase } from './differential';
import { COMBAT_CASES } from './combat-cases';
import { COMMAND_CASES } from './command-cases';
import { MONSTER_CASES } from './monster-cases';
import { SPELL_CASES } from './spell-cases';
import { ULT4_CASES } from './ult4-cases';

// Each ported ULT4 entry against the lifted original from five random states, with SUBS lifted on
// both sides: registers, flags, memory, the language card, polls, DOS commands and clicks must
// all agree, where the routine returns or where it jumps on to.

const SEEDS: number = 5;


describe('ULT4, ported in part, against the lifted original', (): void => {
  it.each(Object.entries({ ...ULT4_CASES, ...COMBAT_CASES, ...SPELL_CASES, ...MONSTER_CASES, ...COMMAND_CASES }))('%s agrees', async (_: string, [ entry, testCase ]: readonly [ number, ICase ]): Promise<void> => {
    const found: string[] = [];

    for (let seed: number = 1; seed <= SEEDS; seed++) {
      found.push(...differences(await runRoutine([], entry, seed, testCase), await runRoutine([ ULT4_MODULE ], entry, seed, testCase)));
    }

    expect(found).toEqual([]);
  }, 300_000);
});
