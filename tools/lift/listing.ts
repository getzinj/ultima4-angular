// Reading what ca65 and ld65 say about a program: the listing (-l) for which bytes each source line
// emitted, the map (-m) for where each segment starts, and the label file (-Ln) for names.

import { OPCODES } from './opcodes';
import type { IOpcode } from './opcodes';

const MNEMONICS: ReadonlySet<string> = new Set<string>(Array.from(OPCODES.values(), (opcode: IOpcode): string => opcode.mnemonic.toLowerCase()));
const LISTING_LINE: RegExp = /^([0-9A-F]{6})r (\d) {2}((?:(?:[0-9A-F]{2}|rr) )*)/;
const PATCH_POINT: RegExp = /^\s*@?\w+\s*=\s*\*\s*\+\s*\$?([0-9A-Fa-f]+)\s*(?:;.*)?$/;


export interface ISpan {
  readonly address: number;
  readonly length: number;
  readonly kind: 'code' | 'data';
  readonly source: string;
}


export interface IListing {
  readonly spans: readonly ISpan[];

  /** Operand bytes the program rewrites at run time (`@name=*+$01`). */
  readonly patchPoints: ReadonlySet<number>;
}


function withoutComment(source: string): string {
  let inQuotes: boolean = false;
  let end: number = source.length;

  for (let index: number = 0; index < source.length; index++) {
    if (source[index] === '"') {
      inQuotes = !inQuotes;
    } else if ((source[index] === ';') && !inQuotes && (end === source.length)) {
      end = index;
    }
  }

  return source.slice(0, end).trim();
}


/** The statement on a line, with any labels in front of it taken off. */
export function statementOf(source: string): string {
  let statement: string = withoutComment(source);
  let label: RegExpMatchArray | null = statement.match(/^(@?\w*:)\s*/);

  while (label != null) {
    statement = statement.slice(label[0].length);
    label = statement.match(/^(@?\w*:)\s*/);
  }

  return statement;
}


export function segmentStarts(map: string): Map<string, number> {
  const starts: Map<string, number> = new Map<string, number>();
  const section: string = map.slice(map.indexOf('Segment list:'));

  for (const line of section.split('\n').slice(4)) {
    const match: RegExpMatchArray | null = line.match(/^(\w+)\s+([0-9A-F]{6})\s+[0-9A-F]{6}\s+[0-9A-F]{6}/);

    if (match != null) {
      starts.set(match[1], parseInt(match[2], 16));
    } else if (line.trim() === '') {
      break;
    }
  }

  return starts;
}


function macroKinds(lines: readonly string[]): Map<string, 'code' | 'data'> {
  const bodies: Map<string, string> = new Map<string, string>();
  let current: string | null = null;

  for (const line of lines) {
    const statement: string = statementOf(line.slice(24));
    const start: RegExpMatchArray | null = statement.match(/^\.mac(?:ro)?\s+(\w+)/i);

    if (start != null) {
      current = start[1];
    } else if (/^\.endmac(?:ro)?\b/i.test(statement)) {
      current = null;
    } else if ((current != null) && (statement !== '') && !bodies.has(current)) {
      bodies.set(current, statement.split(/\s+/)[0]);
    }
  }

  const kinds: Map<string, 'code' | 'data'> = new Map<string, 'code' | 'data'>();
  const kindOf: (name: string, depth: number) => 'code' | 'data' = (name: string, depth: number): 'code' | 'data' => {
    const first: string = (bodies.get(name) ?? '.').toLowerCase();

    if (MNEMONICS.has(first)) {
      return 'code';
    } else if (bodies.has(first) && (depth < 8)) {
      return kindOf(first, depth + 1);
    } else {
      return 'data';
    }
  };

  for (const name of bodies.keys()) {
    kinds.set(name, kindOf(name, 0));
  }

  return kinds;
}


export function parseListing(text: string, segments: ReadonlyMap<string, number>): IListing {
  const lines: string[] = text.split('\n');
  const macros: Map<string, 'code' | 'data'> = macroKinds(lines);
  const spans: { address: number; length: number; kind: 'code' | 'data'; source: string }[] = [];
  const patchPoints: Set<number> = new Set<number>();
  let base: number = 0;
  let inMacroDefinition: boolean = false;

  for (const line of lines) {
    const match: RegExpMatchArray | null = line.match(LISTING_LINE);

    if (match != null) {
      const source: string = line.slice(24);
      const statement: string = statementOf(source);
      const segment: RegExpMatchArray | null = statement.match(/^\.segment\s+"(\w+)"/);
      const address: number = base + parseInt(match[1], 16);
      const byteCount: number = match[3].trim() === '' ? 0 : match[3].trim().split(/\s+/).length;
      const patch: RegExpMatchArray | null = source.match(PATCH_POINT);

      if (/^\.mac(?:ro)?\b/i.test(statement)) {
        inMacroDefinition = true;
      } else if (/^\.endmac(?:ro)?\b/i.test(statement)) {
        inMacroDefinition = false;
      } else if (segment != null) {
        base = segments.get(segment[1]) ?? 0;
      } else if (patch != null) {
        patchPoints.add(address + parseInt(patch[1], 16));
      }

      if ((byteCount > 0) && !inMacroDefinition) {
        const previous: { address: number; length: number; kind: 'code' | 'data' } | undefined = spans[spans.length - 1];
        const word: string = statement.split(/\s+/)[0] ?? '';
        const kind: 'code' | 'data' = MNEMONICS.has(word.toLowerCase()) || (macros.get(word) === 'code') ? 'code' : 'data';

        if ((statement === '') && (previous != null) && ((previous.address + previous.length) === address)) {
          previous.length = previous.length + byteCount;
        } else if ((previous != null) && ((previous.address + previous.length) === address) && (previous.kind === kind) && (kind === 'data')) {
          previous.length = previous.length + byteCount;
        } else {
          spans.push({ address, length: byteCount, kind, source: statement });
        }
      }
    }
  }

  return { spans, patchPoints };
}


export function readLabels(text: string, start: number, end: number): Map<string, number> {
  const labels: Map<string, number> = new Map<string, number>();

  for (const line of text.split('\n')) {
    const match: RegExpMatchArray | null = line.match(/^al\s+(?:C:)?([0-9A-Fa-f]+)\s+\.(\w+)/);

    if (match != null) {
      const address: number = parseInt(match[1], 16);

      if ((address >= start) && (address < end) && !labels.has(match[2])) {
        labels.set(match[2], address);
      }
    }
  }

  return labels;
}
