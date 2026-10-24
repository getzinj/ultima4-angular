// Reads the constants the remaster's `src/include/*.i` files define, as ca65 would: `name = expr`
// lines, evaluated with the other files' names in scope and character constants put through
// `uscii.i`'s charmap, which every program includes first. Macros, assertions and comments are
// skipped.

export class IncludeError extends Error {
}


export interface IIncludeFile {
  readonly name: string;
  readonly text: string;
}


export interface ISymbol {
  readonly name: string;
  readonly value: number;
}


interface IDefinition {
  readonly file: string;
  readonly name: string;
  readonly expression: string;
}


type Token = { readonly kind: 'number'; readonly value: number } | { readonly kind: 'name'; readonly name: string } | { readonly kind: 'operator'; readonly text: string };

const OPERATORS: readonly string[] = [ '<<', '>>', '+', '-', '*', '/', '&', '|', '^', '~', '<', '>', '(', ')' ];


function withoutComment(line: string): string {
  let inQuote: boolean = false;
  let end: number = line.length;

  for (let index: number = 0; index < line.length; index++) {
    if (line[index] === '\'') {
      inQuote = !inQuote;
    } else if ((line[index] === ';') && !inQuote && (end === line.length)) {
      end = index;
    }
  }

  return line.slice(0, end).trim();
}


/** The file's logical lines: comments off, `\` continuations joined, macro bodies left out. */
export function logicalLines(text: string): string[] {
  const lines: string[] = [];
  let pending: string = '';
  let inMacro: boolean = false;

  for (const raw of text.split(/\r?\n/)) {
    const line: string = withoutComment(raw);

    if (line.endsWith('\\')) {
      pending = `${ pending }${ line.slice(0, -1) } `;
    } else {
      const whole: string = `${ pending }${ line }`.trim();

      pending = '';
      if (/^\.mac(?:ro)?\b/i.test(whole)) {
        inMacro = true;
      } else if (/^\.endmac(?:ro)?\b/i.test(whole)) {
        inMacro = false;
      } else if (!inMacro && (whole !== '')) {
        lines.push(whole);
      }
    }
  }

  return lines;
}


export function tokenize(expression: string, charmap: ReadonlyMap<number, number>): Token[] {
  const tokens: Token[] = [];
  let index: number = 0;

  while (index < expression.length) {
    const rest: string = expression.slice(index);
    const space: RegExpMatchArray | null = rest.match(/^\s+/);
    const hex: RegExpMatchArray | null = rest.match(/^\$([0-9A-Fa-f]+)/);
    const binary: RegExpMatchArray | null = rest.match(/^%([01]+)/);
    const decimal: RegExpMatchArray | null = rest.match(/^[0-9]+/);
    const character: RegExpMatchArray | null = rest.match(/^'(.)'/);
    const name: RegExpMatchArray | null = rest.match(/^[A-Za-z_][A-Za-z0-9_]*/);
    const operator: string | undefined = OPERATORS.find((candidate: string): boolean => rest.startsWith(candidate));

    if (space != null) {
      index = index + space[0].length;
    } else if (hex != null) {
      tokens.push({ kind: 'number', value: parseInt(hex[1], 16) });
      index = index + hex[0].length;
    } else if (binary != null) {
      tokens.push({ kind: 'number', value: parseInt(binary[1], 2) });
      index = index + binary[0].length;
    } else if (decimal != null) {
      tokens.push({ kind: 'number', value: parseInt(decimal[0], 10) });
      index = index + decimal[0].length;
    } else if (character != null) {
      const code: number = character[1].charCodeAt(0);

      tokens.push({ kind: 'number', value: charmap.get(code) ?? code });
      index = index + character[0].length;
    } else if (name != null) {
      tokens.push({ kind: 'name', name: name[0] });
      index = index + name[0].length;
    } else if (operator != null) {
      tokens.push({ kind: 'operator', text: operator });
      index = index + operator.length;
    } else {
      throw new IncludeError(`cannot read "${ rest }" in "${ expression }"`);
    }
  }

  return tokens;
}


const BINARY_PRECEDENCE: ReadonlyMap<string, number> = new Map<string, number>([
  [ '|', 1 ], [ '^', 2 ], [ '&', 3 ], [ '<<', 4 ], [ '>>', 4 ], [ '+', 5 ], [ '-', 5 ], [ '*', 6 ], [ '/', 6 ],
]);


/** Evaluates ca65's integer expressions; `lookup` returns null for a name not yet known. */
export function evaluate(tokens: readonly Token[], lookup: (name: string) => number | null): number | null {
  let position: number = 0;
  let unresolved: boolean = false;

  const peek: () => Token | undefined = (): Token | undefined => tokens[position];
  const isOperator: (token: Token | undefined, text: string) => boolean = (token: Token | undefined, text: string): boolean =>
    (token != null) && (token.kind === 'operator') && (token.text === text);

  const primary: () => number = (): number => {
    const token: Token | undefined = tokens[position];
    let value: number;

    position = position + 1;
    if (token == null) {
      throw new IncludeError('expression ends too soon');
    } else if (token.kind === 'number') {
      value = token.value;
    } else if (token.kind === 'name') {
      const known: number | null = lookup(token.name);

      if (known == null) {
        unresolved = true;
        value = 0;
      } else {
        value = known;
      }
    } else if (token.text === '(') {
      value = binary(0);
      if (isOperator(peek(), ')')) {
        position = position + 1;
      } else {
        throw new IncludeError('missing )');
      }
    } else if (token.text === '-') {
      value = -primary();
    } else if (token.text === '~') {
      value = ~primary();
    } else if (token.text === '<') {
      value = primary() & 0xFF;
    } else if (token.text === '>') {
      value = (primary() >> 8) & 0xFF;
    } else {
      throw new IncludeError(`unexpected ${ token.text }`);
    }

    return value;
  };

  const binary: (minimum: number) => number = (minimum: number): number => {
    let left: number = primary();
    let token: Token | undefined = peek();

    while ((token != null) && (token.kind === 'operator') && ((BINARY_PRECEDENCE.get(token.text) ?? 0) > minimum)) {
      const operator: string = token.text;

      position = position + 1;
      left = apply(operator, left, binary(BINARY_PRECEDENCE.get(operator) ?? 0));
      token = peek();
    }

    return left;
  };

  const result: number = binary(0);

  if (position !== tokens.length) {
    throw new IncludeError('trailing tokens');
  } else {
    return unresolved ? null : result;
  }
}


function apply(operator: string, left: number, right: number): number {
  const operations: Readonly<Record<string, (a: number, b: number) => number>> = {
    '|': (a: number, b: number): number => a | b,
    '^': (a: number, b: number): number => a ^ b,
    '&': (a: number, b: number): number => a & b,
    '<<': (a: number, b: number): number => a << b,
    '>>': (a: number, b: number): number => a >> b,
    '+': (a: number, b: number): number => a + b,
    '-': (a: number, b: number): number => a - b,
    '*': (a: number, b: number): number => a * b,
    '/': (a: number, b: number): number => Math.trunc(a / b),
  };

  return operations[operator](left, right);
}


function definitions(file: IIncludeFile): IDefinition[] {
  return logicalLines(file.text)
    .filter((line: string): boolean => !line.startsWith('.'))
    .map((line: string): IDefinition => {
      const match: RegExpMatchArray | null = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:?=\s*(.+)$/);

      if (match == null) {
        throw new IncludeError(`${ file.name }: not a definition: ${ line }`);
      } else {
        return { file: file.name, name: match[1], expression: match[2] };
      }
    });
}


function charmapOf(file: IIncludeFile, lookup: (name: string) => number | null): Map<number, number> {
  const charmap: Map<number, number> = new Map<number, number>();

  for (const line of logicalLines(file.text)) {
    const match: RegExpMatchArray | null = line.match(/^\.charmap\s+(.+?)\s*,\s*(.+)$/i);

    if (match != null) {
      const from: number | null = evaluate(tokenize(match[1], charmap), lookup);
      const to: number | null = evaluate(tokenize(match[2], charmap), lookup);

      if ((from == null) || (to == null)) {
        throw new IncludeError(`${ file.name }: cannot read ${ line }`);
      } else {
        charmap.set(from, to);
      }
    }
  }

  return charmap;
}


/** Every file's symbols, in the order the file defines them. */
export function readIncludes(files: readonly IIncludeFile[], charmapFile: string): Map<string, ISymbol[]> {
  const all: IDefinition[] = files.flatMap(definitions);
  const values: Map<string, number> = new Map<string, number>();
  const lookup: (name: string) => number | null = (name: string): number | null => values.get(name) ?? null;
  const charmapSource: IIncludeFile | undefined = files.find((file: IIncludeFile): boolean => file.name === charmapFile);
  let pending: IDefinition[] = all;
  let charmap: Map<number, number> = new Map<number, number>();

  for (let pass: number = 0; (pass < 2) && (pending.length > 0); pass++) {
    let progress: boolean = true;

    while ((pending.length > 0) && progress) {
      const before: number = pending.length;

      pending = pending.filter((definition: IDefinition): boolean => {
        const value: number | null = evaluate(tokenize(definition.expression, charmap), lookup);
        const previous: number | undefined = values.get(definition.name);

        if (value == null) {
          return true;
        } else if ((previous != null) && (previous !== value)) {
          throw new IncludeError(`${ definition.name } is both ${ previous } and ${ value }`);
        } else {
          values.set(definition.name, value);

          return false;
        }
      });
      progress = pending.length < before;
    }
    if ((pass === 0) && (charmapSource != null)) {
      charmap = charmapOf(charmapSource, lookup);
      values.clear();
      pending = all;
    }
  }

  if (pending.length > 0) {
    throw new IncludeError(`unresolved: ${ pending.map((definition: IDefinition): string => `${ definition.file } ${ definition.name }`).join(', ') }`);
  } else {
    const result: Map<string, ISymbol[]> = new Map<string, ISymbol[]>();

    for (const definition of all) {
      const symbols: ISymbol[] = result.get(definition.file) ?? [];
      const value: number | undefined = values.get(definition.name);

      if ((value != null) && !symbols.some((symbol: ISymbol): boolean => symbol.name === definition.name)) {
        symbols.push({ name: definition.name, value });
      }
      result.set(definition.file, symbols);
    }

    return result;
  }
}
