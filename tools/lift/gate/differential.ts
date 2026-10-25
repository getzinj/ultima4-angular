// Runs one routine from the same random state on two machines, one lifted and one with the
// native port in place, and reports every difference: registers, flags, memory, the language
// card, keyboard polls, DOS commands and speaker clicks. Local only, like the rest of the gate.

import { LIFTED_MODULES } from '../../../src/app/lifted/lifted-modules';
import { LiftedMachine } from '../../../src/app/lifted-runtime/lifted-machine';
import type { INativeModule } from '../../../src/app/lifted-runtime/native-module';
import { DOS, MAP_OBJECTS, PRTY, ZP_MAIN } from '../../../src/app/state/symbols';
import { smokeDisks } from './smoke-disks';

/** Where a routine under test returns to: in the I/O page, never owned by any program. */
const RETURN: number = 0xC0FE;
const DATA: number = 0x9000;

export type Random = () => number;

export interface ICase {
  /** Extra state for the routine: inline data, sane inputs, keys. */
  readonly setup?: (machine: LiftedMachine, random: Random) => void;

  /** Inline data after the JSR, for primm and the like: the routine returns past it. */
  readonly inline?: (random: Random) => readonly number[];

  /** A key the keyboard delivers after some polls. */
  readonly key?: (random: Random) => { readonly code: number; readonly polls: number } | null;

  /** Load ULT4 too, for its routines. */
  readonly ult4?: boolean;

  /** Where a routine that jumps on rather than returning is stopped: the turn's next steps. */
  readonly stops?: readonly number[] | ((machine: LiftedMachine) => readonly number[]);
}

export interface IOutcome {
  readonly registers: Readonly<Record<string, number>>;
  readonly memory: Uint8Array;
  readonly card: readonly number[];
  readonly polls: number;
  readonly clicks: number;
  readonly dos: readonly string[];
  readonly failure: string | null;
}


export function mulberry32(seed: number): Random {
  let state: number = seed >>> 0;

  return (): number => {
    state = (state + 0x6D2B79F5) >>> 0;

    let t: number = state;

    t = Math.imul(t ^ (t >>> 15), t | 1);
    t = t ^ (t + Math.imul(t ^ (t >>> 7), t | 61));

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}


export function byte(random: Random): number {
  return Math.floor(random() * 256);
}


function fill(target: Uint8Array, start: number, end: number, random: Random): void {
  for (let index: number = start; index < end; index++) {
    target[index] = byte(random);
  }
}


/** A machine with SEL, SUBS and the tables loaded, and random game state everywhere the library looks. */
function prepare(natives: readonly INativeModule[], seed: number, testCase: ICase): { machine: LiftedMachine; clicks: () => number; returnTo: number } {
  const machine: LiftedMachine = new LiftedMachine(smokeDisks(), LIFTED_MODULES, null, natives);
  const random: Random = mulberry32(seed);
  const card: LiftedMachine['apple']['languageCard'] = machine.apple.languageCard;
  let clicks: number = 0;
  const main: Uint8Array = new Uint8Array(0xC000);

  machine.read(0xC083);
  machine.read(0xC083);
  machine.bload('program', 'SEL', 0x0320);
  machine.bload('program', 'SUBS');
  machine.bload('program', 'TBLS', 0xE000);
  machine.bload('underworld', 'DNGD');
  if (testCase.ult4 === true) {
    machine.bload('program', 'ULT4');
  }
  fill(main, 0x0000, 0x0100, random);
  fill(main, 0x0200, 0x0320, random);
  fill(main, 0x2000, 0x4000, random);
  for (let address: number = 0; address < 0x4000; address++) {
    if ((address < 0x0100) || ((address >= 0x0200) && (address < 0x0320)) || (address >= 0x2000)) {
      machine.apple.write(address, main[address]);
    }
  }
  machine.apple.write(0x36, 0xBD);
  machine.apple.write(0x37, 0x9E);
  fill(card.contents('bank1'), 0x0000, 0x1000, random);
  fill(card.contents('bank2'), 0x0000, 0x1000, random);
  fill(card.contents('high'), 0x0400, 0x2000, random);
  for (const variable of [ 0x0ADE, 0x0B45, 0x1080, 0x118F, 0x1190, 0x1654, 0x1655, 0x1656, 0x1833, 0x1834, 0x1835, 0x1A5D, 0x1A5E ]) {
    machine.apple.write(variable, byte(random));
  }
  for (let index: number = 0; index < 16; index++) {
    machine.apple.write(0x1549 + index, byte(random));
  }
  machine.apple.write(PRTY.map_x, byte(random) & 0x0F);
  machine.apple.write(PRTY.map_y, byte(random) & 0x0F);
  machine.apple.write(ZP_MAIN.diskio_track, byte(random) & 0x0F);
  machine.apple.write(ZP_MAIN.diskio_sector, byte(random) & 0x0F);
  machine.apple.write(PRTY.game_mode, [ 0x00, 0x01, 0x02, 0x04, 0x80, 0x82, 0xFF ][Math.floor(random() * 7)]);
  machine.apple.write(PRTY.party_size, 1 + Math.floor(random() * 8));
  machine.apple.write(ZP_MAIN.key_buf_len, Math.floor(random() * 9));
  machine.apple.write(DOS.RWTS_slot, 0x60);
  machine.apple.write(DOS.RWTS_slot + 1, 0x02);
  machine.apple.write(MAP_OBJECTS.attack_sprite, (random() < 0.5) ? 0 : byte(random));
  machine.cpu.a = byte(random);
  machine.cpu.x = byte(random);
  machine.cpu.y = byte(random);
  machine.cpu.p = 0x30 | (byte(random) & 0xC3);
  machine.cpu.sp = 0xF0;
  testCase.setup?.(machine, random);

  const inline: readonly number[] = testCase.inline?.(random) ?? [];

  inline.forEach((value: number, index: number): void => machine.apple.write(DATA + index, value));
  machine.cpu.pushWord((inline.length > 0) ? DATA - 1 : RETURN - 1);
  machine.pending = testCase.key?.(random) ?? null;
  machine.polls = 0;
  machine.apple.speaker.toggle = (): void => {
    clicks = clicks + 1;
  };

  return { machine, clicks: (): number => clicks, returnTo: (inline.length > 0) ? DATA + inline.length : RETURN };
}


export async function runRoutine(natives: readonly INativeModule[], entry: number, seed: number, testCase: ICase): Promise<IOutcome> {
  const { machine, clicks, returnTo } = prepare(natives, seed, testCase);
  const card: LiftedMachine['apple']['languageCard'] = machine.apple.languageCard;
  let failure: string | null = null;

  machine.maxCyclesPerStep = 50_000_000;
  const stops: ReadonlySet<number> = new Set<number>((typeof testCase.stops === 'function') ? testCase.stops(machine) : (testCase.stops ?? []));

  machine.cpu.pc = entry;
  try {
    await machine.runUntil((): boolean => (machine.cpu.pc === returnTo) || ((machine.cpu.pc !== entry) && stops.has(machine.cpu.pc)));
  } catch (error: unknown) {
    failure = String(error);
  }

  const memory: Uint8Array = new Uint8Array(0x10000 + 0x1000);

  for (let address: number = 0; address < 0xC000; address++) {
    memory[address] = (address >> 8) === 0x01 ? 0 : machine.apple.read(address);
  }
  memory.set(card.contents('bank2'), 0xD000);
  memory.set(card.contents('high'), 0xE000);
  memory.set(card.contents('bank1'), 0x10000);

  return {
    registers: { a: machine.cpu.a, x: machine.cpu.x, y: machine.cpu.y, p: machine.cpu.p, sp: machine.cpu.sp, pc: machine.cpu.pc },
    memory,
    card: [ card.readsRam, card.writesRam, card.bank === 1, card.armedForWrite ].map((on: boolean): number => (on ? 1 : 0)),
    polls: machine.polls,
    clicks: clicks(),
    dos: machine.dosLog,
    failure,
  };
}


/** Every difference between two outcomes, briefly. */
export function differences(lifted: IOutcome, native: IOutcome): string[] {
  const found: string[] = [];

  if (lifted.failure !== native.failure) {
    found.push(`failure: ${ lifted.failure } / ${ native.failure }`);
  }
  for (const name of Object.keys(lifted.registers)) {
    if (lifted.registers[name] !== native.registers[name]) {
      found.push(`${ name }: $${ lifted.registers[name].toString(16) } / $${ native.registers[name].toString(16) }`);
    }
  }
  if (lifted.card.join() !== native.card.join()) {
    found.push(`card: ${ lifted.card.join('') } / ${ native.card.join('') }`);
  }
  for (const key of [ 'polls', 'clicks' ] as const) {
    if (lifted[key] !== native[key]) {
      found.push(`${ key }: ${ lifted[key] } / ${ native[key] }`);
    }
  }
  if (lifted.dos.join('|') !== native.dos.join('|')) {
    found.push(`dos: ${ lifted.dos.join('|') } / ${ native.dos.join('|') }`);
  }

  const addresses: number[] = [];

  for (let address: number = 0; address < lifted.memory.length; address++) {
    if (lifted.memory[address] !== native.memory[address]) {
      addresses.push(address);
    }
  }
  if (addresses.length > 0) {
    found.push(`memory: ${ addresses.length } bytes, from ${ addresses.slice(0, 8).map((address: number): string =>
      `$${ address.toString(16) }=${ lifted.memory[address].toString(16) }/${ native.memory[address].toString(16) }`).join(' ') }`);
  }

  return found;
}
