import type { LiftedMachine } from '../../lifted-runtime/lifted-machine';
import { CHAR, JUMP_SYSTEM, TABLES, TRAINERS, ZP_MAIN } from '../../state/symbols';
import { encode } from '../text';
import { INPUT_TEXT, RETURN, atBoot, atName, booting, dosSeen, named, pressUntil } from '../testing/boot-machine';

// INIT, SEL, SUBS and BOOT, ported, with nothing lifted, from the first instruction to NEWGAME.


describe('the boot, ported', (): void => {
  describe('INIT', (): void => {
    it('loads SEL, SUBS and the shapes and tables, and runs BOOT', async (): Promise<void> => {
      expect((await atBoot()).dosLog).toEqual([
        'BRUN INIT', 'NOMON I,O,C', 'MAXFILES 1', 'BLOAD SEL,A$320', 'BLOAD SUBS', 'BLOAD SHP0', 'BLOAD SHP1', 'BLOAD TBLS,A$E000',
        'BLOAD HTXT,A$E400', 'BRUN BOOT,A$6000',
      ]);
    });

    it('stores an RTS over j_music_ctl', async (): Promise<void> => {
      expect((await atBoot()).read(JUMP_SYSTEM.music_ctl)).toBe(0x60);
    });

    it('starts on the program disk', async (): Promise<void> => {
      expect((await atBoot()).read(ZP_MAIN.disk_id)).toBe(0x01);
    });

    it('clears the trainers', async (): Promise<void> => {
      const machine: LiftedMachine = booting();

      machine.write(TRAINERS.trainer_food, 0xFF);
      await machine.runUntil(dosSeen(machine, 'BRUN BOOT'));

      expect(machine.read(TRAINERS.trainer_food)).toBe(0x00);
    });
  });

  describe('BOOT', (): void => {
    it('loads the pictures', async (): Promise<void> => {
      const machine: LiftedMachine = await atBoot();

      await machine.runUntil(dosSeen(machine, 'BLOAD BGND'));

      expect(machine.dosLog.slice(-2)).toEqual([ 'BLOAD ANIM,A$4000', 'BLOAD BGND,A$7A00' ]);
    });

    it('asks for a name when the menu\'s I is pressed', async (): Promise<void> => {
      expect((await atName()).programAt(INPUT_TEXT)).toBe('BOOT');
    });

    it('keeps the name typed, padded with zeros', async (): Promise<void> => {
      const machine: LiftedMachine = await named();

      expect(Array.from({ length: 16 }, (_: unknown, index: number): number => machine.read(TABLES.inbuffer + index)))
        .toEqual([ ...encode('AVATAR'), ...Array.from({ length: 10 }, (): number => 0x00) ]);
    });

    it('takes back a character for the left arrow', async (): Promise<void> => {
      const machine: LiftedMachine = await atName();

      for (const key of [ 0x41, 0x42, 0x08, 0x43, RETURN ]) {
        await machine.press(key);
      }

      expect([ machine.read(TABLES.inbuffer), machine.read(TABLES.inbuffer + 1) ]).toEqual(encode('AC'));
    });

    it('runs NEWGAME once the player is female', async (): Promise<void> => {
      const machine: LiftedMachine = await named();

      await pressUntil(machine, 'F', dosSeen(machine, 'BRUN NEWGAME'));

      expect(machine.read(ZP_MAIN.gender_chosen)).toBe(CHAR.glyph_female);
    });

    it('loads the trainers and NEWGAME from drive 1', async (): Promise<void> => {
      const machine: LiftedMachine = await named();

      await pressUntil(machine, 'M', dosSeen(machine, 'BRUN NEWGAME'));

      expect(machine.dosLog.slice(-2)).toEqual([ 'BLOAD TRAINERS,D1', 'BRUN NEWGAME,A$6400,D1' ]);
    });
  });
});
