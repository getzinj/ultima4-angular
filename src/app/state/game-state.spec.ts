import { GameState } from './game-state';
import { FlatStateMemory } from './state-memory';
import { PRTY } from './symbols';


describe('GameState', (): void => {
  it('has eight characters', (): void => {
    expect(new GameState(new FlatStateMemory()).characters.length).toBe(8);
  });

  it('has 32 map objects', (): void => {
    expect(new GameState(new FlatStateMemory()).objects.length).toBe(32);
  });

  it('counts the party members from party_size', (): void => {
    const memory: FlatStateMemory = new FlatStateMemory();
    const state: GameState = new GameState(memory);

    state.characters[1].name = 'IOLO';
    memory.write(PRTY.party_size, 2);

    expect(state.members.map((member: { name: string }): string => member.name)).toEqual([ '', 'IOLO' ]);
  });
});
