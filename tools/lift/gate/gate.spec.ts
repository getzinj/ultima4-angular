import { join } from 'node:path';

import type { LiftedMachine } from '../../../src/app/lifted-runtime/lifted-machine';
import { GameState } from '../../../src/app/state/game-state';
import { PORTED_MODULES } from '../../../src/app/port/ported-modules';
import { MachineStateMemory } from '../../../src/app/state/state-memory';
import { CHAR, PRTY } from '../../../src/app/state/symbols';
import { liftedSnapshots, oracleSnapshots, runCreation } from './run-gate';
import type { IGateSnapshot } from './run-gate';

// The phase 5 gate: the lifted game, on blank data, matches the oracle at every key of the creation
// scenario. Needs the lifted output: run `npm run lift -- <checkout>` first.

const expected: IGateSnapshot[] = oracleSnapshots(join(import.meta.dirname, 'creation-blank.json'));


describe('the lifted creation scenario on blank data', (): void => {
  let actual: IGateSnapshot[] = [];
  let state: GameState;

  beforeAll(async (): Promise<void> => {
    const run: { machine: LiftedMachine; failure: unknown } = await runCreation();

    actual = liftedSnapshots(run);
    state = new GameState(new MachineStateMemory(run.machine.apple));
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

  describe('read through the state model at the end', (): void => {
    it('has the party in Britannia', (): void => {
      expect(state.party.get('game_mode')).toBe(PRTY.mode_world);
    });

    it('has a party of one', (): void => {
      expect(state.party.get('party_size')).toBe(1);
    });

    it('has the name typed', (): void => {
      expect(state.characters[0].name).toBe('AVATAR');
    });

    it('has the gender chosen', (): void => {
      expect(state.characters[0].gender).toBe(CHAR.glyph_male);
    });
  });
});


describe('the creation scenario on blank data with the ported programs', (): void => {
  let actual: IGateSnapshot[] = [];

  beforeAll(async (): Promise<void> => {
    actual = liftedSnapshots(await runCreation(PORTED_MODULES));
  }, 120_000);

  it.each(expected.map((snapshot: IGateSnapshot, index: number): [ number, IGateSnapshot ] => [ index, snapshot ]))(
    'matches the oracle at snapshot %i',
    (index: number, snapshot: IGateSnapshot): void => {
      expect(actual[index]).toEqual(snapshot);
    },
  );
});
