import { RAW_TRACKS } from '../../../data/ultima-disks';
import { syntheticDiskSet } from '../../../data/testing/synthetic-disks';
import type { DiskSet, LiftedMachine } from '../../../lifted-runtime/lifted-machine';
import { APPLE, DISKS, JUMP_OVERLAY, JUMP_SYSTEM, PRTY, ROST, ZP_MAIN } from '../../../state/symbols';
import { overlayMachine } from '../../testing/overlay-machine';
import { OVERLAY_ENTRY } from '../overlay';
import { END_MODULE } from './end';
import { END_ENTRIES } from './end-data';

const RETURN: string = '\r';
const ESC: string = '\u001B';
const KEY_POLLS: number = 10;
const ANSWERS: readonly string[] = [ 'HONESTY', 'COMPASSION', 'VALOR', 'JUSTICE', 'SACRIFICE', 'HONOR', 'SPIRITUALITY', 'HUMILITY', 'TRUTH', 'LOVE', 'COURAGE' ];
const ABYSS_X: number = 0xE9;
const MOONGLOW_X: number = 0xE7;
const SPK_OFFSETS: readonly number[] = [ 0x0F36, 0x0FFB, 0x10AB, 0x10C8, 0x10E5, 0x11B0, 0x126D, 0x12AC, 0x146E, 0x14EB, 0x156E, 0x15EC, 0x181B ];
const CSTRING_LENGTH: number = 0x2800;


/** CSTRING's pictures as zeros, each with run and pattern codes of its own that nothing after it holds, so each ends with no run pending. */
function blankPictures(): DiskSet {
  const disks: DiskSet = syntheticDiskSet();
  const pictures: Uint8Array = new Uint8Array(CSTRING_LENGTH);

  SPK_OFFSETS.forEach((offset: number, image: number): void => {
    pictures[offset] = 0xE6 + (image * 2);
    pictures[offset + 1] = 0xE7 + (image * 2);
  });
  disks.underworld.writeBinary('CSTRING', 0x4000, pictures, RAW_TRACKS.underworld);

  return disks;
}


/** At the Abyss's last altar with eight in the party, an avatar in every virtue, and the key of three parts; the program disk wanted in drive 1, Britannia's in drive 2; no music. */
function inTheChamber(): LiftedMachine {
  const machine: LiftedMachine = overlayMachine(END_MODULE, [], blankPictures());

  machine.insertDisk(2, 'britannia');
  machine.write(PRTY.party_size, 0x08);
  machine.write(ROST.threepartkey, ROST.key3_have_all);
  for (let virtue: number = 0; virtue < ROST.virtue_last; virtue++) {
    machine.write(ROST.party_stats + virtue, 0x00);
  }
  machine.write(ZP_MAIN.numdrives, 0x02);
  machine.write(ZP_MAIN.currdisk_drive1, DISKS.disk_dungeon);
  machine.write(ZP_MAIN.currdisk_drive2, DISKS.disk_britannia);
  machine.write(ZP_MAIN.sfx_volume, 0x00);
  machine.write(JUMP_SYSTEM.music_ctl, APPLE.opcode_RTS);

  return machine;
}


/** END run from its entry with `typed` given to it, a key at a time, until it is back in the world or halted. */
async function runEnd(machine: LiftedMachine, typed: string): Promise<LiftedMachine> {
  const done = (): boolean => (machine.cpu.pc === JUMP_OVERLAY.j_game_init) || (machine.cpu.pc === END_ENTRIES.halt);

  machine.cpu.pushWord(0xC0FE - 1);
  machine.cpu.pushWord(0xC0FE - 1);
  machine.cpu.pc = OVERLAY_ENTRY;
  for (const key of typed) {
    await machine.press(key.charCodeAt(0), KEY_POLLS);
    await machine.runUntil((): boolean => done() || (machine.pending == null));
  }
  await machine.runUntil(done);

  return machine;
}


function words(...typed: readonly string[]): string {
  return typed.map((word: string): string => `${ word }${ RETURN }`).join('');
}


describe('the underworld END, ported', (): void => {
  describe('the way back', (): void => {
    it('sends a party without the key of three parts back to the Abyss', async (): Promise<void> => {
      const machine: LiftedMachine = inTheChamber();

      machine.write(ROST.threepartkey, 0x03);

      expect((await runEnd(machine, ESC)).read(PRTY.player_xpos)).toBe(ABYSS_X);
    });

    it('gives the party its size back', async (): Promise<void> => {
      const machine: LiftedMachine = inTheChamber();

      machine.write(ROST.threepartkey, 0x03);

      expect((await runEnd(machine, ESC)).read(PRTY.party_size)).toBe(0x08);
    });

    it('puts the game back in the world', async (): Promise<void> => {
      const machine: LiftedMachine = inTheChamber();

      machine.write(ROST.threepartkey, 0x03);

      expect((await runEnd(machine, ESC)).read(PRTY.game_mode)).toBe(PRTY.mode_world);
    });
  });

  describe('the word of passage', (): void => {
    it('turns away the wrong word', async (): Promise<void> => {
      expect((await runEnd(inTheChamber(), `${ words('VERAMOCAR') }${ ESC }`)).read(PRTY.player_xpos)).toBe(ABYSS_X);
    });

    it('turns away a party of fewer than eight', async (): Promise<void> => {
      const machine: LiftedMachine = inTheChamber();

      machine.write(PRTY.party_size, 0x07);

      expect((await runEnd(machine, `${ words('VERAMOCOR') }${ ESC }`)).read(PRTY.player_xpos)).toBe(ABYSS_X);
    });

    it('turns away a party not yet avatars in every virtue', async (): Promise<void> => {
      const machine: LiftedMachine = inTheChamber();

      machine.write(ROST.party_stats + 0x05, 0x01);

      expect((await runEnd(machine, `${ words('VERAMOCOR') }${ ESC }`)).read(PRTY.player_xpos)).toBe(ABYSS_X);
    });
  });

  describe('the questions', (): void => {
    it('sends a party wrong about honesty to its shrine by Moonglow', async (): Promise<void> => {
      expect((await runEnd(inTheChamber(), `${ words('VERAMOCOR', 'LOVE') }${ ESC }`)).read(PRTY.player_xpos)).toBe(MOONGLOW_X);
    });

    it('takes an answer on its first four letters', async (): Promise<void> => {
      expect((await runEnd(inTheChamber(), `${ words('VERAMOCOR', 'HONE', 'LOVE') }${ ESC }`)).read(PRTY.player_xpos)).toBe(0x53);
    });

    it('halts the game once every question is answered', async (): Promise<void> => {
      expect((await runEnd(inTheChamber(), `${ words('VERAMOCOR', ...ANSWERS) } ${ words('INFINITY') }${ ' '.repeat(10) }`)).cpu.pc).toBe(END_ENTRIES.halt);
    });
  });
});
