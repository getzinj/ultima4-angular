/** The NTSC Apple II's CPU clock: 14.31818 MHz divided by 14. */
export const CPU_HZ: number = 14_318_180 / 14;

/** `SUBS.s` `delay` loads X with this before counting X × 256 passes of its inner loop. */
export const IDLE_DELAY_X: number = 0x4B;


/**
 * Cycles `SUBS.s` `delay` takes from `ldx` to `rts`, when neither branch crosses a page:
 * `ldx #x` and `ldy #0` (4), then for each X 255 taken `dey`/`bne` (5 each) and one that falls
 * through (4), and `dex`/`bne` (5, or 4 the last time), then `rts` (6).
 */
export function delayLoopCycles(x: number): number {
  const innerLoop: number = (255 * 5) + 4;

  return 4 + (x * (innerLoop + 5)) - 1 + 6;
}


export type Sleep = (milliseconds: number) => Promise<void>;


function realSleep(milliseconds: number): Promise<void> {
  return new Promise<void>((resolve: () => void): void => {
    setTimeout(resolve, milliseconds);
  });
}


/** Counts CPU cycles, and paces the program against real time where it would have waited. */
export class Clock {
  private elapsed: number = 0;


  constructor(private readonly sleep: Sleep = realSleep) {
  }


  public get cycles(): number {
    return this.elapsed;
  }


  /** Time passing without a pause: work the original did, which the port does at once. */
  public advance(cycles: number): void {
    this.elapsed = this.elapsed + cycles;
  }


  /** Time the original spent waiting, which the port spends too. */
  public async wait(cycles: number): Promise<void> {
    this.advance(cycles);
    await this.sleep((cycles * 1000) / CPU_HZ);
  }

}
