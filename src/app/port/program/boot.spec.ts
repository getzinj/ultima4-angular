import { syntheticDiskSet } from '../../data/testing/synthetic-disks';
import { RAW_TRACKS } from '../../data/ultima-disks';
import { LiftedMachine } from '../../lifted-runtime/lifted-machine';
import type { DiskSet } from '../../lifted-runtime/lifted-machine';
import { CHAR, JUMP_SYSTEM, TABLES, TRAINERS, ZP_MAIN } from '../../state/symbols';
import { PORTED_MODULES } from '../ported-modules';
import { encode } from '../text';

// INIT, SEL, SUBS and BOOT, ported, with nothing lifted: the game from its first instruction to
// NEWGAME on the synthetic disks, whose files hold filler, so the pictures are noise but every
// program file the boot runs is ported. The trainers are out of scope and not on those disks, so
// a filler TRAINERS is put there for BOOT to load.

const INPUT_TEXT: number = 0x6FB0;
const RETURN: number = 0x0D;
const TRAINERS_LOAD: number = 0xFB00;


function booting(): LiftedMachine {
  const disks: DiskSet = syntheticDiskSet();

  disks.program.writeBinary('TRAINERS', TRAINERS_LOAD, new Uint8Array(16), RAW_TRACKS.program);
  const machine: LiftedMachine = new LiftedMachine(disks, [], null, PORTED_MODULES);

  machine.boot();

  return machine;
}


function dosSeen(machine: LiftedMachine, prefix: string): () => boolean {
  return (): boolean => machine.dosLog.some((line: string): boolean => line.startsWith(prefix));
}


/** Presses `key` at each poll until `done` holds. */
async function pressUntil(machine: LiftedMachine, key: string, done: () => boolean): Promise<void> {
  let reached: boolean = false;
  const check: () => boolean = (): boolean => {
    reached = reached || done();

    return reached;
  };

  while (!check()) {
    machine.pending = { code: key.charCodeAt(0), polls: 0 };
    machine.polls = 0;
    await machine.runUntil((): boolean => check() || ((machine.pending == null) && ((machine.key & 0x80) === 0)));
  }
  machine.pending = null;
}


async function atBoot(): Promise<LiftedMachine> {
  const machine: LiftedMachine = booting();

  await machine.runUntil(dosSeen(machine, 'BRUN BOOT'));

  return machine;
}


async function atName(): Promise<LiftedMachine> {
  const machine: LiftedMachine = await atBoot();

  await pressUntil(machine, 'I', (): boolean => (machine.cpu.pc === INPUT_TEXT) && (machine.programAt(INPUT_TEXT) === 'BOOT'));

  return machine;
}


async function named(): Promise<LiftedMachine> {
  const machine: LiftedMachine = await atName();

  for (const key of 'AVATAR\r') {
    await machine.press(key.charCodeAt(0));
  }

  return machine;
}


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
