// The ULT4 differential from the command line, with every difference spelled out:
//
//   npx tsx apps/Ultima4/tools/lift/gate/run-ult4-differential.ts [routine ...] [--seeds n]

import { ULT4_MODULE } from '../../../src/app/port/program/ult4-module';
import { differences, runRoutine } from './differential';
import type { IOutcome } from './differential';
import { ULT4_CASES } from './ult4-cases';


async function main(argv: string[]): Promise<void> {
  const seedsAt: number = argv.indexOf('--seeds');
  const seeds: number = (seedsAt >= 0) ? Number(argv[seedsAt + 1]) : 20;
  const names: string[] = argv.filter((arg: string, index: number): boolean => !arg.startsWith('--') && (index !== seedsAt + 1));
  let failed: number = 0;

  for (const name of (names.length > 0) ? names : Object.keys(ULT4_CASES)) {
    const [ entry, testCase ] = ULT4_CASES[name];
    let first: string[] | null = null;
    let bad: number = 0;

    for (let seed: number = 1; seed <= seeds; seed++) {
      const lifted: IOutcome = await runRoutine([], entry, seed, testCase);
      const native: IOutcome = await runRoutine([ ULT4_MODULE ], entry, seed, testCase);
      const found: string[] = differences(lifted, native);

      if (found.length > 0) {
        bad = bad + 1;
        first = first ?? [ `seed ${ seed }`, ...found ];
      }
    }
    console.log(`${ name.padEnd(22) } ${ bad === 0 ? 'ok' : `${ bad }/${ seeds } differ: ${ (first ?? []).join('; ') }` }`);
    failed = failed + ((bad > 0) ? 1 : 0);
  }
  process.exitCode = (failed === 0) ? 0 : 1;
}


void main(process.argv.slice(2));
