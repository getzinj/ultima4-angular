import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

// What `madge --circular` checks with type imports skipped, without madge as a dependency: no
// file reaches itself again through the files it value-imports. Type imports are erased, so a
// cycle through one is no cycle at run time.

const ROOT: string = resolve(__dirname, '..');
const FOLDERS: readonly string[] = [ 'src', 'tools', 'e2e' ];
const VALUE_IMPORT: RegExp = /^(?:import|export)\s+(?!type\b)(?:[^;'"]*?\sfrom\s+)?'(\.[^']+)'/gm;


function sourceFiles(folder: string): string[] {
  return readdirSync(folder).flatMap((name: string): string[] => {
    const path: string = join(folder, name);
    let files: string[];

    if (statSync(path).isDirectory()) {
      files = [ 'node_modules', 'work', 'lifted' ].includes(name) ? [] : sourceFiles(path);
    } else {
      files = name.endsWith('.ts') ? [ path ] : [];
    }

    return files;
  });
}


function resolved(from: string, specifier: string): string | null {
  const base: string = resolve(dirname(from), specifier);

  return [ `${ base }.ts`, join(base, 'index.ts') ].find((candidate: string): boolean => existsSync(candidate)) ?? null;
}


function valueImports(file: string): string[] {
  return [ ...readFileSync(file, 'utf8').matchAll(VALUE_IMPORT) ]
    .map((match: RegExpMatchArray): string | null => resolved(file, match[1]))
    .filter((path: string | null): path is string => path != null);
}


function cycles(graph: ReadonlyMap<string, readonly string[]>): string[][] {
  const found: string[][] = [];
  const done: Set<string> = new Set<string>();
  const path: string[] = [];

  function visit(file: string): void {
    const at: number = path.indexOf(file);

    if (at >= 0) {
      found.push([ ...path.slice(at), file ].map((step: string): string => relative(ROOT, step)));
    } else if (!done.has(file)) {
      path.push(file);
      for (const next of graph.get(file) ?? []) {
        visit(next);
      }
      path.pop();
      done.add(file);
    }
  }

  for (const file of graph.keys()) {
    visit(file);
  }

  return found;
}


describe('the imports', (): void => {
  it('make no cycle a module could reach at run time', (): void => {
    const files: string[] = FOLDERS.flatMap((folder: string): string[] => sourceFiles(join(ROOT, folder)));

    expect(cycles(new Map<string, string[]>(files.map((file: string): [ string, string[] ] => [ file, valueImports(file) ])))).toEqual([]);
  });
});
