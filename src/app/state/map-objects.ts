import { checkIndex, writeByte } from './fields';
import type { IStateMemory } from './state-memory';
import { MAP_OBJECTS } from './symbols';

// The LIST and TLST save files at $EE00: up to 32 objects, each field a 32-byte slice indexed by
// object.

export const OBJECT_COUNT: number = MAP_OBJECTS.object_last;

/** LIST's and TLST's file: one page. */
export const OBJECTS_LENGTH: number = 0x100;


export class MapObject {
  constructor(private readonly memory: IStateMemory, public readonly index: number) {
    checkIndex(index, OBJECT_COUNT, 'object');
  }


  /** The tile it is drawn with now. */
  public get tileSprite(): number {
    return this.memory.read(MAP_OBJECTS.object_tile_sprite + this.index);
  }


  public set tileSprite(value: number) {
    writeByte(this.memory, MAP_OBJECTS.object_tile_sprite + this.index, value);
  }


  public get x(): number {
    return this.memory.read(MAP_OBJECTS.object_xpos + this.index);
  }


  public set x(value: number) {
    writeByte(this.memory, MAP_OBJECTS.object_xpos + this.index, value);
  }


  public get y(): number {
    return this.memory.read(MAP_OBJECTS.object_ypos + this.index);
  }


  public set y(value: number) {
    writeByte(this.memory, MAP_OBJECTS.object_ypos + this.index, value);
  }


  /** What it is; zero for an empty slot. */
  public get tileType(): number {
    return this.memory.read(MAP_OBJECTS.object_tile_type + this.index);
  }


  public set tileType(value: number) {
    writeByte(this.memory, MAP_OBJECTS.object_tile_type + this.index, value);
  }


  public get previousX(): number {
    return this.memory.read(MAP_OBJECTS.object_xpos_prev + this.index);
  }


  public set previousX(value: number) {
    writeByte(this.memory, MAP_OBJECTS.object_xpos_prev + this.index, value);
  }


  public get previousY(): number {
    return this.memory.read(MAP_OBJECTS.object_ypos_prev + this.index);
  }


  public set previousY(value: number) {
    writeByte(this.memory, MAP_OBJECTS.object_ypos_prev + this.index, value);
  }


  /** In a towne, `MAP_OBJECTS.ai_*`; in a dungeon the same byte is the object's level (`dungeonLevel`). */
  public get movement(): number {
    return this.memory.read(MAP_OBJECTS.npc_movement_ai + this.index);
  }


  public set movement(value: number) {
    writeByte(this.memory, MAP_OBJECTS.npc_movement_ai + this.index, value);
  }


  public get dungeonLevel(): number {
    return this.memory.read(MAP_OBJECTS.object_dng_level + this.index);
  }


  public set dungeonLevel(value: number) {
    writeByte(this.memory, MAP_OBJECTS.object_dng_level + this.index, value);
  }


  /** In a towne, the person's conversation record. */
  public get dialogue(): number {
    return this.memory.read(MAP_OBJECTS.npc_dialogue + this.index);
  }


  public set dialogue(value: number) {
    writeByte(this.memory, MAP_OBJECTS.npc_dialogue + this.index, value);
  }
}
