// Building one program of the remaster's `fixed` build and reading it back as instructions: the
// remaster's Makefile makes the .prg, .map and .lab, and a second assembly with a listing (-l)
// tells code from data. Shared by the lifter and the contract report.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { LiftError } from './emit';
import type { IInstruction } from './emit';
import type { IListing, ISpan } from './listing';
import { parseListing, readLabels, segmentStarts } from './listing';
import { OPCODES, OPERAND_BYTES } from './opcodes';
import type { IOpcode } from './opcodes';

export const COMMIT: string = '428a793a4d6327cc9734ec151bf377f3d328f2cc';

/** Every program but the Mockingboard drivers (phase 17) and the trainer menu (D7). */
export const PROGRAMS: readonly [ string, string, string ][] = [
  ...[ 'INIT', 'SEL', 'SUBS', 'BOOT', 'NEWGAME', 'ULT4' ].map((name: string): [ string, string, string ] => [ 'program', name, `src/patchedgame/program/${ name }` ]),
  [ 'program', 'TRAINERS', 'src/trainer/TRAINERS' ],
  ...[ 'HELP', 'HOLE', 'LORD', 'SAVE', 'SEAR', 'SHRN', 'TMAP', 'USE' ].map((name: string): [ string, string, string ] => [ 'britannia', name, `src/patchedgame/britannia/${ name }` ]),
  ...[ 'MIX', 'SEAR', 'SHP0', 'SHP1', 'SHP2', 'SHP3', 'SHP4', 'SHP5', 'SHP6', 'SHP7', 'SHP8', 'SHP9', 'TALK', 'TMAP', 'USE' ]
    .map((name: string): [ string, string, string ] => [ 'towne', name, `src/patchedgame/towne/${ name }` ]),
  ...[ 'DNGD', 'END', 'SEAR', 'TMAP', 'USE' ].map((name: string): [ string, string, string ] => [ 'underworld', name, `src/patchedgame/underworld/${ name }` ]),
];


export function hex(value: number, digits: number): string {
  return `0x${ value.toString(16).toUpperCase().padStart(digits, '0') }`;
}


export function decode(span: ISpan, image: Uint8Array, load: number): IInstruction[] {
  const instructions: IInstruction[] = [];
  let address: number = span.address;

  while (address < (span.address + span.length)) {
    const opcode: IOpcode | undefined = OPCODES.get(image[address - load]);

    if (opcode == null) {
      throw new LiftError(`${ hex(image[address - load], 2) } at ${ hex(address, 4)} is not an instruction (${ span.source })`);
    } else {
      const length: number = 1 + OPERAND_BYTES[opcode.mode];

      instructions.push({ address, opcode, bytes: Array.from(image.subarray(address - load, address - load + length)) });
      address = address + length;
    }
  }

  if (address !== (span.address + span.length)) {
    throw new LiftError(`instructions overrun the line at ${ hex(span.address, 4) } (${ span.source })`);
  }

  return instructions;
}



export interface IAssembled {
  readonly disk: string;
  readonly name: string;
  readonly path: string;
  readonly load: number;
  readonly image: Uint8Array;
  readonly listing: IListing;
  readonly instructions: readonly IInstruction[];
  readonly labels: ReadonlyMap<string, number>;
}


export function checkPinned(checkout: string): void {
  const head: string = execFileSync('git', [ '-C', checkout, 'rev-parse', 'HEAD' ], { encoding: 'utf8' }).trim();

  if (head !== COMMIT) {
    throw new LiftError(`${ checkout } is at ${ head }; the tools are pinned to ${ COMMIT }`);
  }
}


export function assemble(checkout: string, work: string, disk: string, name: string, path: string): IAssembled {
  const listingPath: string = join(work, `${ disk }-${ name }.lst`);

  execFileSync('make', [ '-s', '-C', checkout, `${ path }.prg` ], { stdio: 'inherit' });
  execFileSync('ca65', [ '-t', 'apple2', '-I', '.', '-I', 'src/include', '-l', listingPath, '-o', join(work, `${ disk }-${ name }.o`), `${ path }.s` ], { cwd: checkout });

  const prg: Uint8Array = new Uint8Array(readFileSync(join(checkout, `${ path }.prg`)));
  const load: number = prg[0] | (prg[1] << 8);
  const image: Uint8Array = prg.slice(2);
  const listing: IListing = parseListing(readFileSync(listingPath, 'latin1'), segmentStarts(readFileSync(join(checkout, `${ path }.map`), 'latin1')));
  const instructions: IInstruction[] = listing.spans
    .filter((span: ISpan): boolean => (span.kind === 'code') && (span.address >= load) && ((span.address + span.length) <= (load + image.length)))
    .flatMap((span: ISpan): IInstruction[] => decode(span, image, load));
  const labels: Map<string, number> = readLabels(readFileSync(join(checkout, `${ path }.lab`), 'latin1'), load, load + image.length);

  return { disk, name, path, load, image, listing, instructions, labels };
}
