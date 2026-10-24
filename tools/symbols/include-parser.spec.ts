import { IncludeError, evaluate, logicalLines, readIncludes, tokenize } from './include-parser';
import type { ISymbol } from './include-parser';

const NO_CHARMAP: ReadonlyMap<number, number> = new Map<number, number>();


function value(expression: string, names: Readonly<Record<string, number>> = {}): number | null {
  return evaluate(tokenize(expression, NO_CHARMAP), (name: string): number | null => names[name] ?? null);
}


function symbols(...files: [ string, string ][]): Map<string, ISymbol[]> {
  return readIncludes(files.map(([ name, text ]: [ string, string ]): { name: string; text: string } => ({ name, text })), 'uscii.i');
}


describe('logicalLines', (): void => {
  it('drops comments', (): void => {
    expect(logicalLines('a = 1 ; one\n; whole line')).toEqual([ 'a = 1' ]);
  });

  it('joins a line ending in a backslash to the next', (): void => {
    expect(logicalLines('a = \\\n  1 + \\\n  2')).toEqual([ 'a =  1 +  2' ]);
  });

  it('drops macro bodies', (): void => {
    expect(logicalLines('.macro m\nx = 1\n.endmacro\ny = 2')).toEqual([ 'y = 2' ]);
  });
});


describe('evaluate', (): void => {
  it('reads hex', (): void => {
    expect(value('$ec00')).toBe(0xEC00);
  });

  it('reads binary', (): void => {
    expect(value('%10000000')).toBe(0x80);
  });

  it('multiplies before adding', (): void => {
    expect(value('1 + 2 * 3')).toBe(7);
  });

  it('honours parentheses', (): void => {
    expect(value('(1 + 2) * 3')).toBe(9);
  });

  it('subtracts left to right', (): void => {
    expect(value('10 - 3 - 2')).toBe(5);
  });

  it('takes the low byte with <', (): void => {
    expect(value('<$1234')).toBe(0x34);
  });

  it('takes the high byte with >', (): void => {
    expect(value('>$1234')).toBe(0x12);
  });

  it('looks names up', (): void => {
    expect(value('torches - party_stats', { torches: 0xED08, party_stats: 0xED00 })).toBe(8);
  });

  it('answers null while a name is unknown', (): void => {
    expect(value('later + 1')).toBeNull();
  });

  it('refuses what it cannot read', (): void => {
    expect((): number | null => value('1 ? 2')).toThrow(IncludeError);
  });
});


describe('readIncludes', (): void => {
  it('resolves a name another file defines', (): void => {
    expect(symbols([ 'a.i', 'b = c + 1' ], [ 'c.i', 'c = 1' ]).get('a.i')).toEqual([ { name: 'b', value: 2 } ]);
  });

  it('puts character constants through uscii.i\'s charmap', (): void => {
    expect(symbols([ 'uscii.i', '.charmap $47, $c7' ], [ 'rost.i', 'status_Good = \'G\'' ]).get('rost.i')).toEqual([ { name: 'status_Good', value: 0xC7 } ]);
  });

  it('allows one name defined alike in two files', (): void => {
    expect(symbols([ 'a.i', 'game_mode = $0b' ], [ 'b.i', 'game_mode = $0b' ]).get('b.i')).toEqual([ { name: 'game_mode', value: 0x0B } ]);
  });

  it('refuses one name defined two ways', (): void => {
    expect((): Map<string, ISymbol[]> => symbols([ 'a.i', 'x = 1' ], [ 'b.i', 'x = 2' ])).toThrow(IncludeError);
  });

  it('refuses a name nothing defines', (): void => {
    expect((): Map<string, ISymbol[]> => symbols([ 'a.i', 'x = y' ])).toThrow('unresolved: a.i x');
  });
});
