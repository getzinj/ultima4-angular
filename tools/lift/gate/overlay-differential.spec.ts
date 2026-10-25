import { differences, runRoutine } from './differential';
import { OVERLAY_CASES } from './overlay-cases';
import type { IOverlayCase } from './overlay-cases';

// Each ported Britannia overlay against the lifted original from ten random states, with SUBS
// and ULT4 lifted on both sides: registers, flags, memory, the language card, polls, DOS
// commands and clicks must all agree, where the overlay returns or where it jumps on to.

const SEEDS: number = 10;


describe('the Britannia overlays, ported, against the lifted originals', (): void => {
  it.each(Object.entries(OVERLAY_CASES))('%s agrees', async (_: string, overlay: IOverlayCase): Promise<void> => {
    const found: string[] = [];

    for (let seed: number = 1; seed <= SEEDS; seed++) {
      found.push(...differences(await runRoutine([], overlay.entry, seed, overlay.testCase), await runRoutine([ overlay.module ], overlay.entry, seed, overlay.testCase)));
    }

    expect(found).toEqual([]);
  }, 300_000);
});
