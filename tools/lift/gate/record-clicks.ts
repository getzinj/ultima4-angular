// When the ported game's speaker clicks in an oracle scenario, for tools/oracle/clicks.py to compare:
//
//   npx tsx tools/lift/gate/record-clicks.ts <scenario> <out.json>
//
// Needs the disks tools/oracle/build-disks.sh built from your own images.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { DiskImage } from '../../../src/app/data/disk-image';
import { Dos33Disk } from '../../../src/app/data/dos33';
import { DISK_NAMES } from '../../../src/app/data/ultima-disks';
import type { UltimaDiskName } from '../../../src/app/data/ultima-disks';
import { LIFTED_MODULES } from '../../../src/app/lifted/lifted-modules';
import type { DiskSet } from '../../../src/app/lifted-runtime/lifted-machine';
import { LiftedMachine } from '../../../src/app/lifted-runtime/lifted-machine';
import { PORTED_MODULES } from '../../../src/app/port/ported-modules';
import { SCENARIOS, Session } from './session';

const BUILD: string = 'tools/oracle/work/u4remasteredA2/output';


async function main(name: string, out: string): Promise<void> {
  const disks: DiskSet = Object.fromEntries(DISK_NAMES.map((disk: UltimaDiskName): [ UltimaDiskName, Dos33Disk ] =>
    [ disk, new Dos33Disk(new DiskImage(new Uint8Array(readFileSync(join(BUILD, `u4${ disk }.do`))))) ])) as DiskSet;
  const machine: LiftedMachine = new LiftedMachine(disks, LIFTED_MODULES, null, PORTED_MODULES);
  const clicks: number[] = [];

  machine.apple.speaker.toggle = (cycle: number): void => {
    clicks.push(cycle);
  };
  machine.boot();
  await SCENARIOS[name](new Session(machine));
  writeFileSync(out, JSON.stringify(clicks));
  console.log(`${ clicks.length } clicks`);
}


void main(process.argv[2], process.argv[3]);
