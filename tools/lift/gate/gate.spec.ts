import { join } from 'node:path';

import { liftedSnapshots, oracleSnapshots } from './run-gate';
import type { IGateSnapshot } from './run-gate';

// The phase 5 gate: the lifted game, on blank data, matches the oracle at every key of the creation
// scenario. Needs the lifted output: run `npx nx run Ultima4:lift <checkout>` first.

const expected: IGateSnapshot[] = oracleSnapshots(join(import.meta.dirname, 'creation-blank.json'));


describe('the lifted creation scenario on blank data', (): void => {
  let actual: IGateSnapshot[] = [];

  beforeAll((): void => {
    actual = liftedSnapshots();
  }, 120_000);

  it('takes as many snapshots as the oracle', (): void => {
    expect(actual.length).toBe(expected.length);
  });

  it.each(expected.map((snapshot: IGateSnapshot, index: number): [ number, IGateSnapshot ] => [ index, snapshot ]))(
    'matches the oracle at snapshot %i',
    (index: number, snapshot: IGateSnapshot): void => {
      expect(actual[index]).toEqual(snapshot);
    },
  );
});
