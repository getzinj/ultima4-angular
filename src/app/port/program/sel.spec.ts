import { syntheticDiskSet } from '../../data/testing/synthetic-disks';
import { LiftedMachine } from '../../lifted-runtime/lifted-machine';
import { DOS, JUMP_SUBS, JUMP_SYSTEM } from '../../state/symbols';
import { callSubs } from '../testing/subs-machine';
import { SEL_MODULE } from './sel-module';
import { SUBS_MODULE } from './subs-module';


function selMachine(): LiftedMachine {
  const machine: LiftedMachine = new LiftedMachine(syntheticDiskSet(), [], null, [ SEL_MODULE, SUBS_MODULE ]);

  machine.bload('program', 'SEL', 0x0320);
  machine.cpu.sp = 0xF0;

  return machine;
}


describe('SEL, ported', (): void => {
  describe('j_music_ctl', (): void => {
    it('does nothing with INIT\'s RTS stored over it', async (): Promise<void> => {
      const machine: LiftedMachine = selMachine();

      machine.write(JUMP_SYSTEM.music_ctl, 0x60);
      machine.cpu.a = 0x83;
      await callSubs(machine, JUMP_SYSTEM.music_ctl);

      expect(machine.cpu.a).toBe(0x83);
    });

    it('stays its own entry when an opcode is stored over it', (): void => {
      const machine: LiftedMachine = selMachine();

      machine.write(JUMP_SYSTEM.music_ctl, 0x60);

      expect(machine.programAt(JUMP_SYSTEM.music_ctl)).toBe('SEL');
    });

    it('fails on an opcode neither INIT nor BOOT stores', async (): Promise<void> => {
      const machine: LiftedMachine = selMachine();

      machine.write(JUMP_SYSTEM.music_ctl, 0xEA);

      await expect(callSubs(machine, JUMP_SYSTEM.music_ctl)).rejects.toThrow('j_music_ctl holds $ea');
    });
  });

  describe('spin_drive_motor', (): void => {
    async function spun(): Promise<LiftedMachine> {
      const machine: LiftedMachine = selMachine();

      machine.write(DOS.RWTS_slot, 0x60);
      machine.cpu.a = 0x42;
      machine.cpu.y = 0x07;
      await callSubs(machine, JUMP_SYSTEM.spin_drive_motor);

      return machine;
    }

    it('keeps A', async (): Promise<void> => {
      expect((await spun()).cpu.a).toBe(0x42);
    });

    it('leaves the slot in X', async (): Promise<void> => {
      expect((await spun()).cpu.x).toBe(0x60);
    });

    it('leaves Y at zero', async (): Promise<void> => {
      expect((await spun()).cpu.y).toBe(0x00);
    });
  });

  describe('on_dos_error', (): void => {
    async function failed(): Promise<LiftedMachine> {
      const machine: LiftedMachine = selMachine();

      machine.write(JUMP_SYSTEM.err_resume_stack, 0xE0);
      machine.write(JUMP_SYSTEM.err_resume_addr, 0x34);
      machine.write(JUMP_SYSTEM.err_resume_addr + 1, 0x12);
      machine.cpu.pc = JUMP_SYSTEM.on_dos_error;
      await machine.runUntil((): boolean => machine.cpu.pc === JUMP_SUBS.j_primm_cout);

      return machine;
    }

    it('goes back to the stack depth primm_cout kept', async (): Promise<void> => {
      expect((await failed()).cpu.sp).toBe(0xDE);
    });

    it('resumes the string primm_cout was printing', async (): Promise<void> => {
      expect((await failed()).cpu.pullWord()).toBe(0x1234);
    });
  });
});
