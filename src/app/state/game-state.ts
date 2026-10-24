import { MapObject, OBJECT_COUNT } from './map-objects';
import { Party } from './party';
import { CHARACTER_COUNT, PartyStats, RosterCharacter } from './roster';
import type { IStateMemory } from './state-memory';

// The game's state as typed views over its memory: what the save files hold, read and written in
// place, so the views always agree with the game.

export class GameState {
  public readonly party: Party;
  public readonly characters: readonly RosterCharacter[];
  public readonly stats: PartyStats;
  public readonly objects: readonly MapObject[];


  constructor(public readonly memory: IStateMemory) {
    this.party = new Party(memory);
    this.characters = Array.from({ length: CHARACTER_COUNT }, (_: unknown, slot: number): RosterCharacter => new RosterCharacter(memory, slot));
    this.stats = new PartyStats(memory);
    this.objects = Array.from({ length: OBJECT_COUNT }, (_: unknown, index: number): MapObject => new MapObject(memory, index));
  }


  /** The characters in the party, in order. */
  public get members(): readonly RosterCharacter[] {
    return this.characters.slice(0, this.party.get('party_size'));
  }
}
