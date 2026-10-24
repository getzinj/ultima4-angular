import { CPU_HZ, Clock, IDLE_DELAY_X, delayLoopCycles } from './clock';


describe('delayLoopCycles', (): void => {
  it('is 96,309 cycles for the idle delay', (): void => {
    expect(delayLoopCycles(IDLE_DELAY_X)).toBe(96_309);
  });

  it('is 1,293 cycles for a single pass', (): void => {
    expect(delayLoopCycles(1)).toBe(1_293);
  });

  it('makes one idle delay about 94 ms', (): void => {
    expect(Math.round((delayLoopCycles(IDLE_DELAY_X) * 1000) / CPU_HZ)).toBe(94);
  });
});


describe('Clock', (): void => {
  it('adds advanced cycles to the count', (): void => {
    const clock: Clock = new Clock();

    clock.advance(100);
    clock.advance(23);

    expect(clock.cycles).toBe(123);
  });

  it('adds waited cycles to the count', async (): Promise<void> => {
    const clock: Clock = new Clock((): Promise<void> => Promise.resolve());

    await clock.wait(CPU_HZ);

    expect(clock.cycles).toBe(CPU_HZ);
  });

  it('sleeps for the real time a wait takes', async (): Promise<void> => {
    const sleep: (milliseconds: number) => Promise<void> = vi.fn((): Promise<void> => Promise.resolve());
    const clock: Clock = new Clock(sleep);

    await clock.wait(CPU_HZ / 2);

    expect(sleep).toHaveBeenCalledWith(500);
  });
});
