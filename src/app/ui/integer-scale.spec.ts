import { integerScaleFor } from './integer-scale';


describe('integerScaleFor', (): void => {
  it('is 1 when the space is exactly one screen', (): void => {
    expect(integerScaleFor(280, 192)).toBe(1);
  });

  it('is 1 when the space is smaller than one screen', (): void => {
    expect(integerScaleFor(100, 50)).toBe(1);
  });

  it('is limited by the height when the space is wide', (): void => {
    expect(integerScaleFor(2800, 384)).toBe(2);
  });

  it('is limited by the width when the space is tall', (): void => {
    expect(integerScaleFor(840, 2000)).toBe(3);
  });

  it('rounds down to a whole number', (): void => {
    expect(integerScaleFor(839, 2000)).toBe(2);
  });
});
