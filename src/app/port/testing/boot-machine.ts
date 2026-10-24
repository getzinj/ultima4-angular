import { syntheticDiskSet } from '../../data/testing/synthetic-disks';
import { RAW_TRACKS } from '../../data/ultima-disks';
import { LiftedMachine } from '../../lifted-runtime/lifted-machine';
import type { DiskSet } from '../../lifted-runtime/lifted-machine';
import { PORTED_MODULES } from '../ported-modules';

// The ported programs with nothing lifted, from the game's first instruction, on the synthetic
// disks: their files hold filler, so the pictures are noise, but every program file the boot and
// creation run is ported. The trainers are out of scope and not on those disks, so a filler
// TRAINERS is put there for BOOT to load.

export const INPUT_TEXT: number = 0x6FB0;
export const RETURN: number = 0x0D;
const TRAINERS_LOAD: number = 0xFB00;


export function booting(): LiftedMachine {
  const disks: DiskSet = syntheticDiskSet();

  disks.program.writeBinary('TRAINERS', TRAINERS_LOAD, new Uint8Array(16), RAW_TRACKS.program);
  const machine: LiftedMachine = new LiftedMachine(disks, [], null, PORTED_MODULES);

  machine.boot();

  return machine;
}


export function dosSeen(machine: LiftedMachine, prefix: string): () => boolean {
  return (): boolean => machine.dosLog.some((line: string): boolean => line.startsWith(prefix));
}


/** Presses `key` at each poll until `done` holds. */
export async function pressUntil(machine: LiftedMachine, key: string, done: () => boolean): Promise<void> {
  let reached: boolean = false;
  const check: () => boolean = (): boolean => {
    reached = reached || done();

    return reached;
  };

  while (!check()) {
    machine.pending = { code: key.charCodeAt(0), polls: 0 };
    machine.polls = 0;
    await machine.runUntil((): boolean => check() || ((machine.pending == null) && ((machine.key & 0x80) === 0)));
  }
  machine.pending = null;
}


export async function atBoot(): Promise<LiftedMachine> {
  const machine: LiftedMachine = booting();

  await machine.runUntil(dosSeen(machine, 'BRUN BOOT'));

  return machine;
}


export async function atName(): Promise<LiftedMachine> {
  const machine: LiftedMachine = await atBoot();

  await pressUntil(machine, 'I', (): boolean => (machine.cpu.pc === INPUT_TEXT) && (machine.programAt(INPUT_TEXT) === 'BOOT'));

  return machine;
}


export async function named(): Promise<LiftedMachine> {
  const machine: LiftedMachine = await atName();

  for (const key of 'AVATAR\r') {
    await machine.press(key.charCodeAt(0));
  }

  return machine;
}
