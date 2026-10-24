import { MapObject } from './map-objects';
import { FlatStateMemory, StateError } from './state-memory';
import { MAP_OBJECTS } from './symbols';


describe('MapObject', (): void => {
  it('keeps each field in its own 32-byte slice', (): void => {
    const memory: FlatStateMemory = new FlatStateMemory();

    new MapObject(memory, 5).y = 9;

    expect(memory.read(MAP_OBJECTS.object_ypos + 5)).toBe(9);
  });

  it('shares the towne movement byte with the dungeon level', (): void => {
    const object: MapObject = new MapObject(new FlatStateMemory(), 3);

    object.movement = MAP_OBJECTS.ai_hostile;

    expect(object.dungeonLevel).toBe(0xFF);
  });

  it('reads the conversation record', (): void => {
    const memory: FlatStateMemory = new FlatStateMemory();

    memory.write(MAP_OBJECTS.npc_dialogue + 31, 7);

    expect(new MapObject(memory, 31).dialogue).toBe(7);
  });

  it('refuses a 33rd object', (): void => {
    expect((): MapObject => new MapObject(new FlatStateMemory(), 32)).toThrow(StateError);
  });
});
