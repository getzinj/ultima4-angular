import type { MockInstance } from 'vitest';

import { AppleMachine } from './apple-machine';
import { Clock } from './clock';


describe('AppleMachine', (): void => {
  describe('main RAM', (): void => {
    it('reads back what was written', (): void => {
      const machine: AppleMachine = new AppleMachine();

      machine.write(0x0800, 0x4C);

      expect(machine.read(0x0800)).toBe(0x4C);
    });

    it('keeps only the low byte of a value', (): void => {
      const machine: AppleMachine = new AppleMachine();

      machine.write(0x0300, 0x1FF);

      expect(machine.read(0x0300)).toBe(0xFF);
    });

    it('reads loaded bytes at their address', (): void => {
      const machine: AppleMachine = new AppleMachine();

      machine.load(0x4000, new Uint8Array([ 0x20, 0x09, 0x40 ]));

      expect(machine.read(0x4002)).toBe(0x40);
    });
  });

  describe('keyboard', (): void => {
    it('reads the latched key at $C000', (): void => {
      const machine: AppleMachine = new AppleMachine();

      machine.keyboard.pressKey('q');

      expect(machine.read(0xC000)).toBe(0xD1);
    });

    it('clears the strobe on a read of $C010', (): void => {
      const machine: AppleMachine = new AppleMachine();

      machine.keyboard.pressKey('q');
      machine.read(0xC010);

      expect(machine.read(0xC000)).toBe(0x51);
    });

    it('clears the strobe on a write to $C010', (): void => {
      const machine: AppleMachine = new AppleMachine();

      machine.keyboard.pressKey('q');
      machine.write(0xC010, 0);

      expect(machine.keyboard.keyWaiting).toBe(false);
    });
  });

  describe('speaker', (): void => {
    it('flips at the current cycle on an access to $C030', (): void => {
      const clock: Clock = new Clock();
      const machine: AppleMachine = new AppleMachine(clock);
      const toggle: MockInstance<(cycle: number) => void> = vi.spyOn(machine.speaker, 'toggle');

      clock.advance(1234);
      machine.read(0xC030);

      expect(toggle).toHaveBeenCalledWith(1234);
    });
  });

  describe('display', (): void => {
    it('switches to graphics on $C050', (): void => {
      const machine: AppleMachine = new AppleMachine();

      machine.read(0xC050);

      expect(machine.video.text).toBe(false);
    });

    it('is dirty after a write to the page on show', (): void => {
      const machine: AppleMachine = new AppleMachine();

      machine.dirty = false;
      machine.write(0x2000, 1);

      expect(machine.dirty).toBe(true);
    });

    it('stays clean after a write outside the page on show', (): void => {
      const machine: AppleMachine = new AppleMachine();

      machine.dirty = false;
      machine.write(0x4000, 1);

      expect(machine.dirty).toBe(false);
    });

    it('shows page 2 after $C055', (): void => {
      const machine: AppleMachine = new AppleMachine();

      machine.write(0x4000, 0x7F);
      machine.read(0xC055);

      expect(machine.displayedPage[0]).toBe(0x7F);
    });
  });

  describe('language card', (): void => {
    it('reads the ROM stub after reset', (): void => {
      expect(new AppleMachine().read(0xFBB3)).toBe(0x06);
    });

    it('reads its RAM after $C083', (): void => {
      const machine: AppleMachine = new AppleMachine();

      machine.write(0xD000, 0x5A);
      machine.read(0xC083);
      machine.read(0xC083);

      expect(machine.read(0xD000)).toBe(0x5A);
    });
  });

  describe('unemulated I/O', (): void => {
    it('reads zero', (): void => {
      expect(new AppleMachine().read(0xC0E9)).toBe(0);
    });
  });
});
