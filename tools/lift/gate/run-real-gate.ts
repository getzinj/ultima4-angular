// The oracle's scenarios on the real game, against the digests recorded from it (tools/oracle/digests):
//
//   npx tsx tools/lift/gate/run-real-gate.ts [--native] [scenario ...]
//
// Needs the disks tools/oracle/build-disks.sh built from your own images. With --native, the
// ported programs stand in for their lifted modules. Every region of every snapshot is compared.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { DiskImage } from '../../../src/app/data/disk-image';
import { Dos33Disk } from '../../../src/app/data/dos33';
import { DISK_NAMES } from '../../../src/app/data/ultima-disks';
import type { UltimaDiskName } from '../../../src/app/data/ultima-disks';
import { LIFTED_MODULES } from '../../../src/app/lifted/lifted-modules';
import type { DiskSet, ISnapshot } from '../../../src/app/lifted-runtime/lifted-machine';
import { LiftedMachine } from '../../../src/app/lifted-runtime/lifted-machine';
import type { ILiftedModule } from '../../../src/app/lifted-runtime/lifted-module';
import type { INativeModule } from '../../../src/app/lifted-runtime/native-module';
import { PORTED_MODULES } from '../../../src/app/port/ported-modules';
import { SCENARIOS, Session } from './session';

const ORACLE: string = 'tools/oracle';
const BUILD: string = join(ORACLE, 'work/u4remasteredA2/output');

interface IStep {
  readonly key: number | null;
  readonly polls: number;
  readonly digests: Readonly<Record<string, string>>;
}


function builtDisks(): DiskSet {
  return Object.fromEntries(DISK_NAMES.map((name: UltimaDiskName): [ UltimaDiskName, Dos33Disk ] =>
    [ name, new Dos33Disk(new DiskImage(new Uint8Array(readFileSync(join(BUILD, `u4${ name }.do`))))) ])) as DiskSet;
}


export async function runScenario(name: string, natives: readonly INativeModule[]): Promise<{ steps: IStep[]; failure: unknown }> {
  const subs: ILiftedModule | undefined = LIFTED_MODULES.find((module: ILiftedModule): boolean => module.name === 'SUBS');
  const machine: LiftedMachine = new LiftedMachine(builtDisks(), LIFTED_MODULES, subs?.labels['rnd0'] ?? null, natives);
  let failure: unknown = null;

  machine.boot();
  try {
    await SCENARIOS[name](new Session(machine));
  } catch (error: unknown) {
    failure = error;
  }

  return {
    steps: machine.snapshots.map((snapshot: ISnapshot): IStep => ({
      key: snapshot.key,
      polls: snapshot.polls,
      digests: Object.fromEntries(Object.entries(snapshot.regions)
        .map(([ region, bytes ]: [ string, Uint8Array ]): [ string, string ] => [ region, createHash('sha256').update(bytes).digest('hex') ])),
    })),
    failure,
  };
}


async function main(argv: string[]): Promise<void> {
  const natives: readonly INativeModule[] = argv.includes('--native') ? PORTED_MODULES : [];
  const names: string[] = argv.filter((arg: string): boolean => !arg.startsWith('--'));

  if (!existsSync(BUILD)) {
    console.error(`no built disks in ${ BUILD }: run ${ ORACLE }/build-disks.sh first`);
    process.exitCode = 2;
  } else {
    for (const name of (names.length > 0) ? names : Object.keys(SCENARIOS)) {
      const expected: IStep[] = JSON.parse(readFileSync(join(ORACLE, 'digests', `${ name }.json`), 'utf8')).steps;
      const started: number = Date.now();
      const { steps, failure } = await runScenario(name, natives);
      const first: number = expected.findIndex((step: IStep, index: number): boolean =>
        (steps[index] == null) || (step.key !== steps[index].key) || (step.polls !== steps[index].polls) || (JSON.stringify(step.digests) !== JSON.stringify(steps[index].digests)));
      const seconds: string = ((Date.now() - started) / 1000).toFixed(0);

      if ((first < 0) && (steps.length === expected.length)) {
        console.log(`${ name }: all ${ expected.length } snapshots match (${ seconds } s)`);
      } else {
        const want: IStep | undefined = expected[first];
        const got: IStep | undefined = steps[first];

        console.log(`${ name }: snapshot ${ first } of ${ expected.length } differs${ (failure != null) ? ` (stopped: ${ String(failure) })` : '' }`);
        console.log(`  key ${ want?.key }/${ got?.key }, polls ${ want?.polls }/${ got?.polls }, regions ${
          Object.keys(want?.digests ?? {}).filter((region: string): boolean => want?.digests[region] !== got?.digests[region]).join(', ') }`);
        process.exitCode = 1;
      }
    }
  }
}


if (process.argv[1]?.endsWith('run-real-gate.ts')) {
  void main(process.argv.slice(2));
}
