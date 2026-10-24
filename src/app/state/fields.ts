import { fromBcd, toBcd } from './bcd';
import type { IStateMemory } from './state-memory';
import { StateError } from './state-memory';

// Reading and writing a run of bytes as a byte, a BCD number or text, shared by the views.


export function readBcd(memory: IStateMemory, address: number, byteCount: number): number {
  return fromBcd(Array.from({ length: byteCount }, (_: unknown, index: number): number => memory.read(address + index)));
}


export function writeBcd(memory: IStateMemory, address: number, byteCount: number, value: number): void {
  toBcd(value, byteCount).forEach((byte: number, index: number): void => memory.write(address + index, byte));
}


export function writeByte(memory: IStateMemory, address: number, value: number): void {
  if (Number.isInteger(value) && (value >= 0) && (value <= 0xFF)) {
    memory.write(address, value);
  } else {
    throw new StateError(`${ value } is not a byte`);
  }
}


export function checkIndex(index: number, count: number, what: string): number {
  if (Number.isInteger(index) && (index >= 0) && (index < count)) {
    return index;
  } else {
    throw new StateError(`${ what } ${ index } is not in 0-${ count - 1 }`);
  }
}
