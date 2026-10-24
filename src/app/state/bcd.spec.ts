import { fromBcd, toBcd } from './bcd';
import { StateError } from './state-memory';


describe('fromBcd', (): void => {
  it('reads two digits a byte', (): void => {
    expect(fromBcd([ 0x42 ])).toBe(42);
  });

  it('reads the most significant byte first', (): void => {
    expect(fromBcd([ 0x12, 0x34 ])).toBe(1234);
  });

  it('reads an empty run as zero', (): void => {
    expect(fromBcd([])).toBe(0);
  });
});


describe('toBcd', (): void => {
  it('writes the most significant byte first', (): void => {
    expect(toBcd(1234, 2)).toEqual([ 0x12, 0x34 ]);
  });

  it('pads with leading zeros', (): void => {
    expect(toBcd(7, 2)).toEqual([ 0x00, 0x07 ]);
  });

  it('refuses a number with too many digits', (): void => {
    expect((): number[] => toBcd(100, 1)).toThrow(StateError);
  });

  it('refuses a negative number', (): void => {
    expect((): number[] => toBcd(-1, 1)).toThrow(StateError);
  });

  it('refuses a fraction', (): void => {
    expect((): number[] => toBcd(1.5, 1)).toThrow(StateError);
  });
});
