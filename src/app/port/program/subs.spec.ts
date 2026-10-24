import { CARRY, DECIMAL, NEGATIVE, ZERO } from '../../lifted-runtime/cpu';
import type { LiftedMachine } from '../../lifted-runtime/lifted-machine';
import { MAP_OBJECTS, PRTY, TABLES, ZP_MAIN } from '../../state/symbols';
import { encode, zeroTerminated } from '../text';
import { INLINE, callSubs, subsMachine } from '../testing/subs-machine';
import { SUBS_VARIABLES } from './subs-data';

const J = {
  waitkey: 0x0800,
  primm_cout: 0x081B,
  primm: 0x0821,
  console_out: 0x0824,
  mulax: 0x082A,
  printbcd: 0x0833,
  drawhoriz: 0x083F,
  request_disk: 0x0842,
  blocked_tile: 0x0848,
  rand: 0x084E,
  playsfx: 0x0854,
  getnumber: 0x085A,
  getplayernum: 0x085D,
  centerstring: 0x087B,
  gettile_britannia: 0x0884,
  gettile_towne: 0x0893,
  math_sign: 0x0899,
  drawview: 0x0815,
} as const;


async function withA(machine: LiftedMachine, entry: number, a: number): Promise<LiftedMachine> {
  machine.cpu.a = a;
  await callSubs(machine, entry);

  return machine;
}


function bufferKeys(machine: LiftedMachine, keys: readonly number[]): void {
  keys.forEach((key: number, index: number): void => machine.write(ZP_MAIN.key_buf + index, key));
  machine.write(ZP_MAIN.key_buf_len, keys.length);
}


describe('SUBS, ported', (): void => {
  describe('rand', (): void => {
    it('starts from the seed SUBS is loaded with, as the original does', async (): Promise<void> => {
      const machine: LiftedMachine = subsMachine();
      const values: number[] = [];

      for (let draw: number = 0; draw < 3; draw++) {
        await callSubs(machine, J.rand);
        values.push(machine.cpu.a);
      }

      expect(values).toEqual([ 0x8C, 0xE4, 0x55 ]);
    });

    it('keeps X', async (): Promise<void> => {
      const machine: LiftedMachine = subsMachine();

      machine.cpu.x = 0x42;
      await callSubs(machine, J.rand);

      expect(machine.cpu.x).toBe(0x42);
    });
  });

  describe('math_sign', (): void => {
    it('gives -1 for a negative byte', async (): Promise<void> => {
      expect((await withA(subsMachine(), J.math_sign, 0x80)).cpu.a).toBe(0xFF);
    });

    it('gives 1 for a positive byte', async (): Promise<void> => {
      expect((await withA(subsMachine(), J.math_sign, 0x05)).cpu.a).toBe(0x01);
    });

    it('gives 0 for zero', async (): Promise<void> => {
      expect((await withA(subsMachine(), J.math_sign, 0x00)).cpu.a).toBe(0x00);
    });
  });

  it('mulax multiplies A by X', async (): Promise<void> => {
    const machine: LiftedMachine = subsMachine();

    machine.cpu.x = 7;

    expect((await withA(machine, J.mulax, 6)).cpu.a).toBe(42);
  });

  describe('blocked_tile', (): void => {
    it('lets the party walk on grass', async (): Promise<void> => {
      expect((await withA(subsMachine(), J.blocked_tile, 0x04)).cpu.flag(NEGATIVE)).toBe(false);
    });

    it('stops the party at deep water', async (): Promise<void> => {
      expect((await withA(subsMachine(), J.blocked_tile, 0x00)).cpu.flag(NEGATIVE)).toBe(true);
    });
  });

  describe('console_out', (): void => {
    it('moves the cursor on a column', async (): Promise<void> => {
      const machine: LiftedMachine = subsMachine();

      machine.write(ZP_MAIN.console_xpos, 0x18);
      machine.write(ZP_MAIN.console_ypos, 0x10);

      expect((await withA(machine, J.console_out, 0xC1)).read(ZP_MAIN.console_xpos)).toBe(0x19);
    });

    it('draws the glyph\'s rows from the font', async (): Promise<void> => {
      const machine: LiftedMachine = subsMachine();

      machine.write(ZP_MAIN.console_xpos, 0x18);
      machine.write(ZP_MAIN.console_ypos, 0x10);
      await withA(machine, J.console_out, 0xC1);

      expect(machine.read(0x2050 + 0x18)).toBe(0x41);
    });

    it('wraps to the next line past column 39', async (): Promise<void> => {
      const machine: LiftedMachine = subsMachine();

      machine.write(ZP_MAIN.console_xpos, 0x28);
      machine.write(ZP_MAIN.console_ypos, 0x10);
      await withA(machine, J.console_out, 0xC1);

      expect([ machine.read(ZP_MAIN.console_xpos), machine.read(ZP_MAIN.console_ypos) ]).toEqual([ 0x19, 0x11 ]);
    });

    it('scrolls the message pane at the bottom', async (): Promise<void> => {
      const machine: LiftedMachine = subsMachine();

      machine.write(ZP_MAIN.console_ypos, 0x17);

      expect((await withA(machine, J.console_out, 0x8D)).read(ZP_MAIN.console_ypos)).toBe(0x17);
    });
  });

  describe('primm', (): void => {
    it('returns past the string', async (): Promise<void> => {
      const machine: LiftedMachine = subsMachine();

      await callSubs(machine, J.primm, zeroTerminated('HELLO'));

      expect(machine.cpu.pc).toBe(INLINE + 6);
    });

    it('prints each character', async (): Promise<void> => {
      const machine: LiftedMachine = subsMachine();

      machine.write(ZP_MAIN.console_xpos, 0x18);
      await callSubs(machine, J.primm, zeroTerminated('HELLO'));

      expect(machine.read(ZP_MAIN.console_xpos)).toBe(0x1D);
    });
  });

  describe('primm_cout', (): void => {
    it('hands a Ctrl-D line to DOS', async (): Promise<void> => {
      const machine: LiftedMachine = subsMachine();

      await callSubs(machine, J.primm_cout, [ 0x0D, 0x04, ...Array.from('NOMON C', (character: string): number => character.charCodeAt(0)), 0x0D, 0x00 ]);

      expect(machine.dosLog).toEqual([ 'NOMON C' ]);
    });

    it('clears the type-ahead', async (): Promise<void> => {
      const machine: LiftedMachine = subsMachine();

      machine.write(ZP_MAIN.key_buf_len, 3);
      await callSubs(machine, J.primm_cout, [ 0x41, 0x00 ]);

      expect(machine.read(ZP_MAIN.key_buf_len)).toBe(0);
    });

    it('keeps where to resume if DOS fails', async (): Promise<void> => {
      const machine: LiftedMachine = subsMachine();

      await callSubs(machine, J.primm_cout, [ 0x41, 0x00 ]);

      expect(machine.read(0x0326) | (machine.read(0x0327) << 8)).toBe(INLINE - 1);
    });
  });

  it('printbcd prints two digits', async (): Promise<void> => {
    const machine: LiftedMachine = subsMachine();

    machine.write(ZP_MAIN.console_xpos, 0x18);

    expect((await withA(machine, J.printbcd, 0x42)).read(ZP_MAIN.console_xpos)).toBe(0x1A);
  });

  it('drawhoriz puts the cursor back where it was', async (): Promise<void> => {
    const machine: LiftedMachine = subsMachine();

    machine.write(ZP_MAIN.console_xpos, 0x05);
    await callSubs(machine, J.drawhoriz, [ 0x18, 0x00, 0x04, 0x05, 0xFF ]);

    expect(machine.read(ZP_MAIN.console_xpos)).toBe(0x05);
  });

  describe('waitkey', (): void => {
    it('takes the oldest key typed ahead', async (): Promise<void> => {
      const machine: LiftedMachine = subsMachine();

      bufferKeys(machine, [ 0xC1, 0xC2 ]);
      await callSubs(machine, J.waitkey);

      expect(machine.cpu.a).toBe(0xC1);
    });

    it('leaves the next key in the buffer', async (): Promise<void> => {
      const machine: LiftedMachine = subsMachine();

      bufferKeys(machine, [ 0xC1, 0xC2 ]);
      await callSubs(machine, J.waitkey);

      expect(machine.read(ZP_MAIN.key_buf)).toBe(0xC2);
    });

    it('sets carry, as cmp #$00 does', async (): Promise<void> => {
      const machine: LiftedMachine = subsMachine();

      bufferKeys(machine, [ 0xC1 ]);
      await callSubs(machine, J.waitkey);

      expect(machine.cpu.flag(CARRY)).toBe(true);
    });

    it('reads a key from the keyboard when none is waiting', async (): Promise<void> => {
      const machine: LiftedMachine = subsMachine();

      machine.pending = { code: 0x59, polls: 2 };
      await callSubs(machine, J.waitkey);

      expect(machine.cpu.a).toBe(0xD9);
    });

    it('gives up with zero after 128 idle ticks', async (): Promise<void> => {
      const machine: LiftedMachine = subsMachine();

      await callSubs(machine, J.waitkey);

      expect([ machine.cpu.a, machine.cpu.flag(ZERO) ]).toEqual([ 0x00, true ]);
    });
  });

  describe('getnumber', (): void => {
    async function typed(keys: readonly number[]): Promise<LiftedMachine> {
      const machine: LiftedMachine = subsMachine();

      bufferKeys(machine, keys);
      await callSubs(machine, J.getnumber);

      return machine;
    }

    it('keeps two digits in BCD', async (): Promise<void> => {
      expect((await typed([ ...encode('42'), 0x8D ])).read(ZP_MAIN.bcdnum)).toBe(0x42);
    });

    it('keeps two digits in binary', async (): Promise<void> => {
      expect((await typed([ ...encode('42'), 0x8D ])).read(ZP_MAIN.hexnum)).toBe(42);
    });

    it('takes one digit and RETURN', async (): Promise<void> => {
      expect((await typed([ ...encode('7'), 0x8D ])).read(ZP_MAIN.hexnum)).toBe(7);
    });

    it('leaves decimal mode off', async (): Promise<void> => {
      expect((await typed([ ...encode('42'), 0x8D ])).cpu.flag(DECIMAL)).toBe(false);
    });
  });

  it('getplayernum takes a party member\'s number', async (): Promise<void> => {
    const machine: LiftedMachine = subsMachine();

    bufferKeys(machine, encode('3'));
    await callSubs(machine, J.getplayernum);

    expect(machine.read(ZP_MAIN.curr_player)).toBe(3);
  });

  it('request_disk checks the disk with DOS', async (): Promise<void> => {
    const machine: LiftedMachine = subsMachine();

    machine.write(ZP_MAIN.numdrives, 1);
    machine.write(ZP_MAIN.currdisk_drive1, 1);
    await withA(machine, J.request_disk, 1);

    expect(machine.dosLog).toEqual([ 'BLOADDISK,D1' ]);
  });

  describe('playsfx', (): void => {
    function counted(machine: LiftedMachine): () => number {
      let clicks: number = 0;

      machine.apple.speaker.toggle = (): void => {
        clicks = clicks + 1;
      };

      return (): number => clicks;
    }

    it('clicks the speaker six times to walk', async (): Promise<void> => {
      const machine: LiftedMachine = subsMachine();
      const clicks: () => number = counted(machine);

      machine.write(ZP_MAIN.sfx_volume, 0xFF);
      await withA(machine, J.playsfx, 0);

      expect(clicks()).toBe(6);
    });

    it('is silent with the sound off', async (): Promise<void> => {
      const machine: LiftedMachine = subsMachine();
      const clicks: () => number = counted(machine);

      machine.write(ZP_MAIN.sfx_volume, 0x00);
      await withA(machine, J.playsfx, 0);

      expect(clicks()).toBe(0);
    });
  });

  it('centerstring centres a name in 15 columns', async (): Promise<void> => {
    const machine: LiftedMachine = subsMachine();

    machine.write(ZP_MAIN.console_xpos, 0x18);

    expect((await withA(machine, J.centerstring, 9)).read(ZP_MAIN.console_xpos)).toBe(0x18 + 6 + 3);
  });

  describe('the maps', (): void => {
    it('gettile_towne reads row y, column x of the towne', async (): Promise<void> => {
      const machine: LiftedMachine = subsMachine();

      machine.write(ZP_MAIN.temp_x, 3);
      machine.write(ZP_MAIN.temp_y, 2);
      machine.write(MAP_OBJECTS.towne_map + (2 * 32) + 3, 0x4C);
      await callSubs(machine, J.gettile_towne);

      expect(machine.cpu.a).toBe(0x4C);
    });

    it('gettile_britannia reads the chunk holding (dest_x, dest_y)', async (): Promise<void> => {
      const machine: LiftedMachine = subsMachine();

      machine.write(PRTY.dest_x, 0x12);
      machine.write(PRTY.dest_y, 0x03);
      machine.write(MAP_OBJECTS.world_map_NE + (3 * 16) + 2, 0x06);
      await callSubs(machine, J.gettile_britannia);

      expect(machine.cpu.a).toBe(0x06);
    });
  });

  describe('drawview', (): void => {
    it('copies a tile\'s first row from the tile sheet to the screen', async (): Promise<void> => {
      const machine: LiftedMachine = subsMachine();

      machine.write(MAP_OBJECTS.drawn_tiles, 0x07);
      machine.apple.languageCard.contents('bank1')[(TABLES.tilemap - 0xD000) + 0x07] = 0x2A;
      await callSubs(machine, J.drawview);

      expect(machine.read(0x2080 + 1)).toBe(0x2A);
    });

    it('rewrites its own source operand to the last tile drawn', async (): Promise<void> => {
      const machine: LiftedMachine = subsMachine();

      await callSubs(machine, J.drawview);

      expect(machine.read(SUBS_VARIABLES.src_tile)).toBe(0x79);
    });
  });
});
