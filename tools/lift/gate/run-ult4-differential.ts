// The ULT4 and Britannia overlay differentials from the command line, with every difference
// spelled out:
//
//   npx tsx apps/Ultima4/tools/lift/gate/run-ult4-differential.ts [routine ...] [--seeds n]

import type { INativeModule } from '../../../src/app/lifted-runtime/native-module';
import { ULT4_MODULE } from '../../../src/app/port/program/ult4-module';
import { differences, runRoutine } from './differential';
import type { ICase, IOutcome } from './differential';
import { OVERLAY_CASES } from './overlay-cases';
import type { IOverlayCase } from './overlay-cases';
import { COMBAT_CASES } from './combat-cases';
import { ULT4_CASES } from './ult4-cases';

const CASES: Readonly<Record<string, readonly [ number, ICase, readonly INativeModule[] ]>> = {
  ...Object.fromEntries(Object.entries({ ...ULT4_CASES, ...COMBAT_CASES }).map(([ name, [ entry, testCase ] ]: [ string, readonly [ number, ICase ] ]):
    [ string, readonly [ number, ICase, readonly INativeModule[] ] ] => [ name, [ entry, testCase, [ ULT4_MODULE ] ] ])),
  ...Object.fromEntries(Object.entries(OVERLAY_CASES).map(([ name, overlay ]: [ string, IOverlayCase ]):
    [ string, readonly [ number, ICase, readonly INativeModule[] ] ] => [ name, [ overlay.entry, overlay.testCase, [ overlay.module ] ] ])),
};


async function main(argv: string[]): Promise<void> {
  const seedsAt: number = argv.indexOf('--seeds');
  const seeds: number = (seedsAt >= 0) ? Number(argv[seedsAt + 1]) : 20;
  const names: string[] = argv.filter((arg: string, index: number): boolean => !arg.startsWith('--') && (index !== seedsAt + 1));
  let failed: number = 0;

  for (const name of (names.length > 0) ? names : Object.keys(CASES)) {
    const [ entry, testCase, natives ] = CASES[name];
    let first: string[] | null = null;
    let bad: number = 0;

    for (let seed: number = 1; seed <= seeds; seed++) {
      const lifted: IOutcome = await runRoutine([], entry, seed, testCase);
      const native: IOutcome = await runRoutine(natives, entry, seed, testCase);
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
