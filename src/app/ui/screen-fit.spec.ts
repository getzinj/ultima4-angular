import { fitScreen } from './screen-fit';

describe('fitScreen', (): void => {
  it('fills the width of a wide, short space', (): void => {
    expect(fitScreen(1600, 600).width).toBe(800);
  });

  it('keeps 4:3 in a wide, short space', (): void => {
    expect(fitScreen(1600, 600).height).toBe(600);
  });

  it('fills the width of a narrow, tall space', (): void => {
    expect(fitScreen(400, 900).width).toBe(400);
  });

  it('keeps 4:3 in a narrow, tall space', (): void => {
    expect(fitScreen(400, 900).height).toBe(300);
  });

  it('never goes below the 280 pixel width of the picture', (): void => {
    expect(fitScreen(100, 100).width).toBe(280);
  });
});
