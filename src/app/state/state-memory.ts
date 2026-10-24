import type { AppleMachine } from '../runtime/apple-machine';

// What the state views read and write: the game's bytes by address, whatever holds them.

export interface IStateMemory {
  read(address: number): number;
  write(address: number, value: number): void;
}


export class StateError extends Error {
}


/** A plain 64 KB image, for save files and tests. */
export class FlatStateMemory implements IStateMemory {
  public readonly bytes: Uint8Array = new Uint8Array(0x10000);


  public read(address: number): number {
    return this.bytes[address];
  }


  public write(address: number, value: number): void {
    this.bytes[address] = value & 0xFF;
  }
}


/**
 * A running machine's state: main RAM, and the language card's top 8 KB (the roster and the map
 * objects) whichever way its switches are set, so reading the state never disturbs the game.
 */
export class MachineStateMemory implements IStateMemory {
  constructor(private readonly machine: AppleMachine) {
  }


  public read(address: number): number {
    if (address < 0xC000) {
      return this.machine.read(address);
    } else {
      return this.high()[this.highOffset(address)];
    }
  }


  public write(address: number, value: number): void {
    if (address < 0xC000) {
      this.machine.write(address, value);
    } else {
      this.high()[this.highOffset(address)] = value & 0xFF;
    }
  }


  private high(): Uint8Array {
    return this.machine.languageCard.contents('high');
  }


  private highOffset(address: number): number {
    if ((address >= 0xE000) && (address <= 0xFFFF)) {
      return address - 0xE000;
    } else {
      throw new StateError(`$${ address.toString(16).toUpperCase() } is not game state`);
    }
  }
}
