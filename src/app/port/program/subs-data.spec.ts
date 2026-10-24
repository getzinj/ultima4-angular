import { STRINGS, SUBS_INLINE, SUBS_VARIABLES, subsData } from './subs-data';
import type { IInlineData } from './subs-data';


describe('SUBS data', (): void => {
  it('starts the string table with an empty string', (): void => {
    expect(STRINGS[0]).toBe(0x00);
  });

  it('holds 163 strings, each ended by a byte with bit 7 clear', (): void => {
    expect(STRINGS.filter((value: number): boolean => value < 0x80).length).toBe(163);
  });

  it('seeds the random number generator as the image does', (): void => {
    expect(subsData().get(SUBS_VARIABLES.rnd0)?.slice(0, 3)).toEqual([ 0x64, 0x76, 0x85 ]);
  });

  it('keeps every block apart', (): void => {
    const spans: [ number, number ][] = Array.from(subsData()).map(([ address, bytes ]: [ number, readonly number[] ]): [ number, number ] => [ address, address + bytes.length ])
      .sort((a: [ number, number ], b: [ number, number ]): number => a[0] - b[0]);

    expect(spans.every((span: [ number, number ], index: number): boolean => (index === 0) || (spans[index - 1][1] <= span[0]))).toBe(true);
  });

  it('keeps every block inside SUBS', (): void => {
    expect(Object.values(SUBS_INLINE).every((block: IInlineData): boolean => (block.address >= 0x0800) && ((block.address + block.bytes.length) <= 0x1FE9))).toBe(true);
  });
});
