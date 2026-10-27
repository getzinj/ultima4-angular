// Checks src/app/state/symbols.ts against ca65 itself: each include file is assembled after uscii.i,
// with every symbol it defines emitted as a .dword, and the bytes compared with the generated values.
//
//   npx tsx tools/symbols/verify-symbols.ts <checkout>   (needs cc65 2.19)

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import * as SYMBOLS from '../../src/app/state/symbols';


function main(checkout: string): void {
  const work: string = mkdtempSync(join(tmpdir(), 'u4-symbols-'));
  const files: Map<string, string> = new Map<string, string>(readdirSync(join(checkout, 'src/include'))
    .map((name: string): [ string, string ] => [ name.replace(/\.i$/, '').toUpperCase(), name ]));
  let mismatches: number = 0;
  let checked: number = 0;

  for (const [ constant, table ] of Object.entries(SYMBOLS)) {
    const file: string = files.get(constant) ?? `${ constant }.i`;
    const prelude: string[] = (file === 'uscii.i') ? [] : [ '\t.include "uscii.i"' ];
    const names: string[] = Object.keys(table);
    const source: string = join(work, `${ constant }.s`);

    writeFileSync(source, [ ...prelude, `\t.include "${ file }"`, ...names.map((name: string): string => `\t.dword ${ name }`), '' ].join('\n'));
    execFileSync('ca65', [ '-t', 'none', '-I', 'src/include', '-o', join(work, `${ constant }.o`), source ], { cwd: checkout });
    execFileSync('ld65', [ '-t', 'none', '-o', join(work, `${ constant }.bin`), join(work, `${ constant }.o`) ]);

    const bytes: Buffer = readFileSync(join(work, `${ constant }.bin`));

    names.forEach((name: string, index: number): void => {
      const assembled: number = bytes.readInt32LE(index * 4);
      const generated: number = (table as Record<string, number>)[name];

      checked = checked + 1;
      if (assembled !== generated) {
        mismatches = mismatches + 1;
        console.error(`${ file } ${ name }: ca65 ${ assembled }, generated ${ generated }`);
      }
    });
  }

  console.log(`${ checked } symbols checked, ${ mismatches } mismatches`);
  process.exitCode = (mismatches === 0) ? 0 : 1;
}


main(process.argv[2]);
