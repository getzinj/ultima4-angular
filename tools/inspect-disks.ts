// Runs the checks the app runs on imported disks, from the command line, and prints what it finds:
//
//   npm run inspect-disks -- <image> [<image> ...]
//
// Nothing is written; the images are only read.

import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

import type { IDataPatch, PatchOutcome } from '../src/app/data/data-patches';
import type { ICatalogEntry } from '../src/app/data/dos33';
import { GameDisks } from '../src/app/data/game-disks';
import type { DiskSet } from '../src/app/data/game-disks';
import { DISK_NAMES, identifyDiskSet } from '../src/app/data/ultima-disks';
import type { IDiskSetResult, UltimaDiskName } from '../src/app/data/ultima-disks';


async function main(paths: readonly string[]): Promise<void> {
  const result: IDiskSetResult = identifyDiskSet(paths.map((path: string): { name: string; bytes: Uint8Array } =>
    ({ name: basename(path), bytes: new Uint8Array(readFileSync(path)) })));

  for (const name of DISK_NAMES) {
    const entries: ICatalogEntry[] = result.disks[name]?.catalog() ?? [];

    console.log(`${ name }: ${ result.disks[name] == null ? 'not found' : `${ entries.length } files: ${ entries.map((entry: ICatalogEntry): string => entry.name).join(' ') }` }`);
  }
  for (const problem of result.problems) {
    console.log(`problem: ${ problem }`);
  }

  if (DISK_NAMES.every((name: UltimaDiskName): boolean => result.disks[name] != null)) {
    const disks: GameDisks = await GameDisks.prepare(result.disks as DiskSet);

    for (const entry of disks.report.patches) {
      const { patch, outcome }: { patch: IDataPatch; outcome: PatchOutcome } = entry;

      console.log(`patch ${ outcome.padEnd(15) } ${ patch.disk } ${ patch.file ?? 'raw' } +$${ patch.offset.toString(16) }: ${ patch.reason }`);
    }
    console.log(`conversations: ${ disks.report.conversations }, ${ disks.report.skippedCorrections.length } corrections skipped`);
    for (const skipped of disks.report.skippedCorrections) {
      console.log(`  skipped ${ skipped }`);
    }
  } else {
    process.exitCode = 1;
  }
}


main(process.argv.slice(2)).catch((thrown: unknown): void => {
  console.error(thrown);
  process.exitCode = 1;
});
