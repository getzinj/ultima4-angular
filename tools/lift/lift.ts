// Lifts the remaster's `fixed` build into TypeScript, one module per program:
//
//   npx tsx apps/Ultima4/tools/lift/lift.ts <checkout of sean-gugler/u4remasteredA2 at 428a793>
//
// Needs cc65 2.19 and GNU Make: it builds each program with the remaster's Makefile, then
// assembles it again with a listing to tell code from data, and writes
// apps/Ultima4/src/app/lifted/<disk>/<program>.ts and apps/Ultima4/src/app/lifted/lifted-modules.ts.

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { LiftError, emitInstruction, emitOpcodeStore } from './emit';
import type { IInstruction } from './emit';
import type { IListing, ISpan } from './listing';
import { parseListing, readLabels, segmentStarts } from './listing';
import { OPCODES, OPERAND_BYTES } from './opcodes';
import type { IOpcode } from './opcodes';

const COMMIT: string = '428a793a4d6327cc9734ec151bf377f3d328f2cc';
const OUT: string = join(process.cwd(), 'apps/Ultima4/src/app/lifted');

/** Opcodes the game itself rewrites, by program: INIT.s:82 and BOOT.s:1005 store RTS and JMP over `music_ctl`. */
const OPCODE_STORES: Readonly<Record<string, readonly number[]>> = {
  'program/SEL': [ 0x0320 ],
};

/** Every program but the Mockingboard drivers (phase 17) and the trainer menu (D7). */
const PROGRAMS: readonly [ string, string, string ][] = [
  ...[ 'INIT', 'SEL', 'SUBS', 'BOOT', 'NEWGAME', 'ULT4' ].map((name: string): [ string, string, string ] => [ 'program', name, `src/patchedgame/program/${ name }` ]),
  [ 'program', 'TRAINERS', 'src/trainer/TRAINERS' ],
  ...[ 'HELP', 'HOLE', 'LORD', 'SAVE', 'SEAR', 'SHRN', 'TMAP', 'USE' ].map((name: string): [ string, string, string ] => [ 'britannia', name, `src/patchedgame/britannia/${ name }` ]),
  ...[ 'MIX', 'SEAR', 'SHP0', 'SHP1', 'SHP2', 'SHP3', 'SHP4', 'SHP5', 'SHP6', 'SHP7', 'SHP8', 'SHP9', 'TALK', 'TMAP', 'USE' ]
    .map((name: string): [ string, string, string ] => [ 'towne', name, `src/patchedgame/towne/${ name }` ]),
  ...[ 'DNGD', 'END', 'SEAR', 'TMAP', 'USE' ].map((name: string): [ string, string, string ] => [ 'underworld', name, `src/patchedgame/underworld/${ name }` ]),
];


function hex(value: number, digits: number): string {
  return `0x${ value.toString(16).toUpperCase().padStart(digits, '0') }`;
}


function decode(span: ISpan, image: Uint8Array, load: number): IInstruction[] {
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


function ranges(instructions: readonly IInstruction[], patched: ReadonlySet<number>): [ number, number ][] {
  const result: [ number, number ][] = [];

  for (const instruction of instructions) {
    for (let index: number = 0; index < instruction.bytes.length; index++) {
      const address: number = instruction.address + index;
      const last: [ number, number ] | undefined = result[result.length - 1];

      if (!patched.has(address)) {
        if ((last != null) && (last[1] === address)) {
          last[1] = address + 1;
        } else {
          result.push([ address, address + 1 ]);
        }
      }
    }
  }

  return result;
}


function lift(checkout: string, work: string, disk: string, name: string, path: string): { constant: string; file: string } {
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
  const constant: string = `${ disk.toUpperCase() }_${ name }`;
  const opcodeStores: readonly number[] = OPCODE_STORES[`${ disk }/${ name }`] ?? [];
  const cases: string[] = instructions.map((instruction: IInstruction): string => {
    const body: string = opcodeStores.includes(instruction.address) ? emitOpcodeStore(instruction, listing.patchPoints) : emitInstruction(instruction, listing.patchPoints);

    return `      case ${ hex(instruction.address, 4) }: if (c.tracing && c.stopAt(${ hex(instruction.address, 4) })) { return; } ${ body }`;
  });
  const usesTemporary: boolean = cases.some((line: string): boolean => line.includes('t = '));
  const file: string = `${ disk }/${ name.toLowerCase() }.ts`;

  mkdirSync(join(OUT, disk), { recursive: true });
  writeFileSync(join(OUT, file), [
    `// Generated by apps/Ultima4/tools/lift/lift.ts from sean-gugler/u4remasteredA2 (fixed, ${ COMMIT.slice(0, 7) }), ${ path }.s.`,
    '// Do not edit: rerun the lifter. The code is the game\'s, as reconstructed and labelled by Sean Gugler.',
    '',
    'import type { Cpu } from \'../../lifted-runtime/cpu\';',
    'import { LiftedBreakError, LiftedSelfModifyError } from \'../../lifted-runtime/lifted-module\';',
    'import type { ILiftedModule } from \'../../lifted-runtime/lifted-module\';',
    '',
    '',
    'function run(c: Cpu, start: number): void {',
    '  let pc: number = start;',
    usesTemporary ? '  let t: number = 0;' : '',
    '',
    '  for (;;) {',
    '    switch (pc) {',
    ...cases,
    '      default: c.pc = pc; return;',
    '    }',
    '  }',
    '}',
    '',
    '',
    `export const ${ constant }: ILiftedModule = {`,
    `  disk: '${ disk }',`,
    `  name: '${ name }',`,
    `  load: ${ hex(load, 4) },`,
    `  image: '${ Buffer.from(image).toString('base64') }',`,
    `  code: ${ JSON.stringify(ranges(instructions, listing.patchPoints)) },`,
    `  opcodeStores: [ ${ opcodeStores.map((address: number): string => hex(address, 4)).join(', ') } ],`,
    `  patchPoints: [ ${ Array.from(listing.patchPoints).sort((a: number, b: number): number => a - b).map((address: number): string => hex(address, 4)).join(', ') } ],`,
    `  labels: { ${ Array.from(labels).map(([ label, address ]: [ string, number ]): string => `${ label }: ${ hex(address, 4) }`).join(', ') } },`,
    '  run,',
    '};',
    '',
  ].filter((line: string, index: number, all: string[]): boolean => !((line === '') && (all[index - 1] === '  let pc: number = start;'))).join('\n'));
  console.log(`${ file }: ${ instructions.length } instructions, ${ listing.patchPoints.size } patch points`);

  return { constant, file };
}


function main(checkout: string): void {
  const work: string = mkdtempSync(join(tmpdir(), 'u4-lift-'));
  const head: string = execFileSync('git', [ '-C', checkout, 'rev-parse', 'HEAD' ], { encoding: 'utf8' }).trim();

  if (head !== COMMIT) {
    throw new LiftError(`${ checkout } is at ${ head }; the lifter is pinned to ${ COMMIT }`);
  } else {
    const lifted: { constant: string; file: string }[] = PROGRAMS.map(([ disk, name, path ]: [ string, string, string ]) => lift(checkout, work, disk, name, path));

    writeFileSync(join(OUT, 'lifted-modules.ts'), [
      '// Generated by apps/Ultima4/tools/lift/lift.ts. Do not edit.',
      '',
      'import type { ILiftedModule } from \'../lifted-runtime/lifted-module\';',
      ...lifted.map((entry: { constant: string; file: string }): string => `import { ${ entry.constant } } from './${ entry.file.replace(/\.ts$/, '') }';`),
      '',
      '',
      'export const LIFTED_MODULES: readonly ILiftedModule[] = [',
      ...lifted.map((entry: { constant: string }): string => `  ${ entry.constant },`),
      '];',
      '',
    ].join('\n'));
  }
}


main(process.argv[2]);
