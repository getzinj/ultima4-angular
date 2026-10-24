import { Party } from './party';
import { FlatStateMemory, StateError } from './state-memory';
import { PRTY } from './symbols';


describe('Party', (): void => {
  it('reads a field at its zero-page address', (): void => {
    const memory: FlatStateMemory = new FlatStateMemory();

    memory.write(PRTY.party_size, 4);

    expect(new Party(memory).get('party_size')).toBe(4);
  });

  it('writes a field at its zero-page address', (): void => {
    const memory: FlatStateMemory = new FlatStateMemory();

    new Party(memory).set('game_mode', PRTY.mode_towne);

    expect(memory.read(0x0B)).toBe(PRTY.mode_towne);
  });

  it('refuses a value that is not a byte', (): void => {
    expect((): void => new Party(new FlatStateMemory()).set('player_xpos', 256)).toThrow(StateError);
  });

  it('reads the move counter as eight BCD digits', (): void => {
    const memory: FlatStateMemory = new FlatStateMemory();

    [ 0x00, 0x01, 0x23, 0x45 ].forEach((byte: number, index: number): void => memory.write(PRTY.move_counter + index, byte));

    expect(new Party(memory).moveCounter).toBe(12345);
  });

  it('writes the move counter most significant byte first', (): void => {
    const memory: FlatStateMemory = new FlatStateMemory();

    new Party(memory).moveCounter = 12345678;

    expect(Array.from(memory.bytes.subarray(0x1C, 0x20))).toEqual([ 0x12, 0x34, 0x56, 0x78 ]);
  });
});
