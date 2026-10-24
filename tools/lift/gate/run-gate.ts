// Runs the creation scenario on the lifted game and compares it with the oracle's fixture:
//
//   npx tsx apps/Ultima4/tools/lift/gate/run-gate.ts   (from the workspace root)
//
// The gate spec does the same; this prints the first divergence in full.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { LIFTED_MODULES } from '../../../src/app/lifted/lifted-modules';
import type { ISnapshot } from '../../../src/app/lifted-runtime/lifted-machine';
import { LiftedMachine } from '../../../src/app/lifted-runtime/lifted-machine';
import type { ILiftedModule } from '../../../src/app/lifted-runtime/lifted-module';
import type { INativeModule } from '../../../src/app/lifted-runtime/native-module';
import { Session, creation } from './session';
import { smokeDisks } from './smoke-disks';

export interface IGateSnapshot {
  readonly key: number | null;
  readonly polls: number;
  readonly dos: readonly string[];
  readonly digests: Readonly<Record<string, string>>;
}


export function oracleSnapshots(fixture: string): IGateSnapshot[] {
  return JSON.parse(readFileSync(fixture, 'utf8')).snapshots;
}


/** The lifted machine after the creation scenario, or as far as it got. */
export async function runCreation(natives: readonly INativeModule[] = []): Promise<{ machine: LiftedMachine; failure: unknown }> {
  const subs: ILiftedModule | undefined = LIFTED_MODULES.find((module: ILiftedModule): boolean => module.name === 'SUBS');
  const machine: LiftedMachine = new LiftedMachine(smokeDisks(), LIFTED_MODULES, subs?.labels['rnd0'] ?? null, natives);
  let failure: unknown = null;

  machine.boot();
  try {
    await creation(new Session(machine));
  } catch (error: unknown) {
    failure = error;
  }

  return { machine, failure };
}


export function liftedSnapshots({ machine, failure }: { machine: LiftedMachine; failure: unknown }): IGateSnapshot[] {
  const snapshots: IGateSnapshot[] = machine.snapshots.map((snapshot: ISnapshot): IGateSnapshot => ({
    key: snapshot.key,
    polls: snapshot.polls,
    dos: snapshot.dos,
    digests: Object.fromEntries(Object.entries(snapshot.regions)
      .map(([ name, bytes ]: [ string, Uint8Array ]): [ string, string ] => [ name, createHash('sha256').update(bytes).digest('hex') ])),
  }));

  if (failure != null) {
    console.error(`stopped after ${ snapshots.length } snapshots at PC=$${ machine.cpu.pc.toString(16) }: ${ String(failure) }`);
  }

  return snapshots;
}


async function main(): Promise<void> {
  const expected: IGateSnapshot[] = oracleSnapshots('apps/Ultima4/tools/lift/gate/creation-blank.json');
  const actual: IGateSnapshot[] = liftedSnapshots(await runCreation());
  const first: number = expected.findIndex((snapshot: IGateSnapshot, index: number): boolean => JSON.stringify(snapshot) !== JSON.stringify(actual[index]));

  if (first < 0) {
    console.log(`all ${ expected.length } snapshots match`);
  } else {
    const wanted: IGateSnapshot = expected[first];
    const got: IGateSnapshot | undefined = actual[first];

    console.log(`snapshot ${ first } of ${ expected.length } differs`);
    console.log(`key ${ wanted.key }/${ got?.key }, polls ${ wanted.polls }/${ got?.polls }`);
    console.log(`dos ${ JSON.stringify(wanted.dos) }\n    ${ JSON.stringify(got?.dos) }`);
    console.log(`regions: ${ Object.keys(wanted.digests).filter((name: string): boolean => wanted.digests[name] !== got?.digests[name]).join(', ') }`);
    process.exitCode = 1;
  }
}


if (process.argv[1]?.endsWith('run-gate.ts')) {
  void main();
}
