import { differences, runRoutine } from './differential';
import { OVERLAY_CASES } from './overlay-cases';
import type { IOverlayCase } from './overlay-cases';
import { SHOP_CASES } from './shop-cases';

// Each ported overlay against the lifted original from ten random states, with SUBS
// and ULT4 lifted on both sides: registers, flags, memory, the language card, polls, DOS
// commands and clicks must all agree, where the overlay returns or where it jumps on to; for
// the talks and meditations, so must every write to the screen.

const SEEDS: number = 10;


describe('the overlays, ported, against the lifted originals', (): void => {
  it.each(Object.entries({ ...OVERLAY_CASES, ...SHOP_CASES }))('%s agrees', async (_: string, overlay: IOverlayCase): Promise<void> => {
    const found: string[] = [];

    for (let seed: number = 1; seed <= SEEDS; seed++) {
      found.push(...differences(await runRoutine([], overlay.entry, seed, overlay.testCase), await runRoutine(overlay.modules ?? [ overlay.module ], overlay.entry, seed, overlay.testCase)));
    }

    expect(found).toEqual([]);
  }, 300_000);
});
