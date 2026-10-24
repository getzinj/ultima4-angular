import { SUBS_MODULE } from '../../../src/app/port/program/subs-module';
import { differences, runRoutine } from './differential';
import type { ICase } from './differential';
import { SUBS_CASES } from './subs-cases';

// Each SUBS entry, ported, against the lifted original from five random states: registers,
// flags, memory, the language card, polls, DOS commands and clicks must all agree.

const SEEDS: number = 5;


describe('SUBS, ported, against the lifted original', (): void => {
  it.each(Object.entries(SUBS_CASES))('%s agrees', async (_: string, [ entry, testCase ]: readonly [ number, ICase ]): Promise<void> => {
    const found: string[] = [];

    for (let seed: number = 1; seed <= SEEDS; seed++) {
      found.push(...differences(await runRoutine([], entry, seed, testCase), await runRoutine([ SUBS_MODULE ], entry, seed, testCase)));
    }

    expect(found).toEqual([]);
  }, 300_000);
});
