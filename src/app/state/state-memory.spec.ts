import { AppleMachine } from '../runtime/apple-machine';
import { FlatStateMemory, MachineStateMemory, StateError } from './state-memory';


describe('FlatStateMemory', (): void => {
  it('keeps the low byte of what is written', (): void => {
    const memory: FlatStateMemory = new FlatStateMemory();

    memory.write(0x10, 0x1FF);

    expect(memory.read(0x10)).toBe(0xFF);
  });
});


describe('MachineStateMemory', (): void => {
  it('reads main RAM', (): void => {
    const machine: AppleMachine = new AppleMachine();

    machine.write(0x0F, 3);

    expect(new MachineStateMemory(machine).read(0x0F)).toBe(3);
  });

  it('reads the language card while the ROM is switched in', (): void => {
    const machine: AppleMachine = new AppleMachine();

    machine.languageCard.write(0xEC00, 0xC1);

    expect(new MachineStateMemory(machine).read(0xEC00)).toBe(0xC1);
  });

  it('writes the language card while its writing is off', (): void => {
    const machine: AppleMachine = new AppleMachine();

    machine.languageCard.switch(0xC080, false);
    new MachineStateMemory(machine).write(0xEE00, 0x42);

    expect(machine.languageCard.contents('high')[0x0E00]).toBe(0x42);
  });

  it('refuses the I/O page', (): void => {
    expect((): number => new MachineStateMemory(new AppleMachine()).read(0xC000)).toThrow(StateError);
  });
});
