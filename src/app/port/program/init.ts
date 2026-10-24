// INIT.s: the first program DOS runs, at $4000, ported. It prints the title, loads SEL and SUBS,
// hooks DOS's output, copies the monitor ROM into the language card, loads the shapes and tables
// there, and runs BOOT (or, with T held down, the trainer menu). Nothing calls back into it.

import { APPLE, APPLE_DETECT, DISKS, DOS, JUMP_SUBS, JUMP_SYSTEM, TRAINERS, ZP_MAIN } from '../../state/symbols';
import { inline } from '../inline-data';
import type { IInlineData } from '../inline-data';
import { PortProgram } from '../port-program';
import { encode } from '../text';

export const INIT_LOAD: number = 0x4000;
/** Where INIT stores an RTS for COUT to go to while DOS isn't printing. */
const COUT_STUB: number = 0x1FFF;
/** Zero-page bytes INIT sets to $80, for reasons unknown. */
const ZP_UNKNOWN: readonly number[] = [ 0xD8, 0xD9, 0x33, 0x76 ];
const CHAR_T: number = 0xD4;
const ROM_COPY_END: number = 0x10000;


function line(address: number, text: string): IInlineData {
  return inline(address, [ ...encode(text), 0x00 ]);
}


export const INIT_INLINE = {
  nomon: line(0x400E, '\n\u0004NOMON I,O,C\n\u0004MAXFILES 1\n'),
  title: line(0x402F, `${ '\n'.repeat(8) }               ULTIMA IV\n\n          QUEST OF THE AVATAR\n\n\n\n  COPYRIGHT 1985, ORIGIN SYSTEMS, INC.\n`),
  load_sel: line(0x409D, '\u0004BLOAD SEL,A$320\n\u0004BLOAD SUBS\n'),
  load_shp0: line(0x411E, '\u0004BLOAD SHP0\n'),
  load_shp1: line(0x4131, '\u0004BLOAD SHP1\n\u0004BLOAD TBLS,A$E000\n\u0004BLOAD HTXT,A$E400\n'),
  run_boot: line(0x4170, '\u0004BRUN BOOT,A$6000\n'),
  run_menu: line(0x4186, '\u0004BRUN MENU,A$6000\n'),
} as const;

const SITES = {
  detect_hw_model: 0x4000,
  set_iigs_color: 0x4005,
} as const;


export class Init extends PortProgram {
  /** INIT.s's one entry. */
  public async run(): Promise<void> {
    await this.jsr(SITES.detect_hw_model, (): Promise<void> => this.detectHwModel());
    if (this.negative()) {
      await this.jsr(SITES.set_iigs_color, (): void => this.setIigsColor());
    }
    await this.m.call(APPLE.rom_HOME);
    await this.printCout(INIT_INLINE.nomon);
    await this.m.call(APPLE.rom_HOME);
    await this.printCout(INIT_INLINE.title);
    await this.printCout(INIT_INLINE.load_sel);
    this.poke(ZP_MAIN.disk_id, this.lda(DISKS.disk_program));
    this.poke(DOS.DOS_ASIBSW, this.lda(0x40));
    this.poke(DOS.DOS_BREAK, this.lda(JUMP_SYSTEM.on_dos_error & 0xFF));
    this.poke(DOS.DOS_BREAK + 1, this.lda(JUMP_SYSTEM.on_dos_error >> 8));
    this.lda(0x80);
    for (const address of ZP_UNKNOWN) {
      this.poke(address, this.cpu.a);
    }
    this.poke(JUMP_SYSTEM.music_ctl, this.lda(APPLE.opcode_RTS));
    this.poke(COUT_STUB, this.cpu.a);
    this.poke(APPLE.zp_CSWL, this.lda(COUT_STUB & 0xFF));
    this.poke(APPLE.zp_CSWL + 1, this.lda(COUT_STUB >> 8));
    await this.m.call(DOS.DOS_hook_cout);
    this.cpu.bit(this.peek(APPLE.hw_ROMIN));
    this.cpu.bit(this.peek(APPLE.hw_ROMIN));
    this.poke(ZP_MAIN.key_buf_len, this.lda(0x00));
    this.copyRom();
    this.lda(0x00);
    this.ldx(TRAINERS.num_trainers);
    do {
      this.poke(TRAINERS.trainer_first + this.cpu.x, this.cpu.a);
      this.dex();
    } while (!this.negative());
    this.cpu.bit(this.peek(APPLE.hw_LCBANK2));
    this.cpu.bit(this.peek(APPLE.hw_LCBANK1));
    this.cpu.bit(this.peek(APPLE.hw_LCBANK1));
    await this.callWith(JUMP_SUBS.j_primm_cout, INIT_INLINE.load_shp0);
    this.cpu.bit(this.peek(APPLE.hw_LCBANK2));
    await this.callWith(JUMP_SUBS.j_primm_cout, INIT_INLINE.load_shp1);
    this.lda(await this.m.readKeyboard());
    this.lda(this.cpu.a | 0x80);
    this.cmp(CHAR_T);
    if (!this.zero()) {
      await this.callWith(JUMP_SUBS.j_primm_cout, INIT_INLINE.run_boot);
    }
    await this.callWith(JUMP_SUBS.j_primm_cout, INIT_INLINE.run_menu);
  }


  /** `rom_SHADOW` to the top of memory, each byte read from the ROM and written to the card under it. */
  private copyRom(): void {
    this.ldy(APPLE.rom_SHADOW & 0xFF);
    this.poke(ZP_MAIN.ptr1, this.cpu.y);
    this.poke(ZP_MAIN.ptr1 + 1, this.lda(APPLE.rom_SHADOW >> 8));
    for (let page: number = APPLE.rom_SHADOW; page < ROM_COPY_END; page = page + 0x100) {
      do {
        this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y));
        this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.cpu.a);
      } while (this.iny() !== 0);
      this.inc(ZP_MAIN.ptr1 + 1);
    }
  }


  /** INIT.s print_cout: the string after the JSR, each character through the ROM's COUT. */
  private async printCout(block: IInlineData): Promise<void> {
    this.cpu.pushWord(block.address - 1);
    this.poke(ZP_MAIN.ptr1, this.lda(this.cpu.pull()));
    this.poke(ZP_MAIN.ptr1 + 1, this.lda(this.cpu.pull()));
    this.ldy(0x00);
    for (;;) {
      if (this.inc(ZP_MAIN.ptr1) === 0) {
        this.inc(ZP_MAIN.ptr1 + 1);
      }
      if (this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y)) === 0) {
        break;
      }
      this.lda(this.cpu.a | 0x80);
      await this.m.call(APPLE.rom_COUT);
    }
    this.lda(this.peek(ZP_MAIN.ptr1 + 1));
    this.lda(this.peek(ZP_MAIN.ptr1));
  }


  /** INIT.s detect_hw_model: $81 on a IIgs, $01 on a IIe or II, $00 on a IIc, in zp_hw_model and A. */
  private async detectHwModel(): Promise<void> {
    this.lda(0x00);
    this.cpu.bit(this.peek(APPLE.hw_ROMIN));
    this.ldx(this.peek(APPLE.rom_signature));
    this.cpu.compare(this.cpu.x, 0x06);
    if (!this.zero()) {
      this.supportMockingboard();
    } else if (this.ldx(this.peek(APPLE.rom_ZIDBYTE)) === 0) {
      this.poke(APPLE_DETECT.zp_hw_model, this.cpu.a);
    } else {
      this.setCarry(true);
      await this.m.call(APPLE.rom_IIgs_ID);
      if (!this.carry()) {
        this.lda(0x80);
      }
      this.supportMockingboard();
    }
  }


  private supportMockingboard(): void {
    this.poke(APPLE_DETECT.zp_hw_model, this.lda(this.cpu.a | 0x01));
  }


  /** INIT.s set_iigs_color: white text on black, and a black border. */
  private setIigsColor(): void {
    this.poke(APPLE.hw_TBCOLOR, this.lda(0xF0));
    this.lda(this.peek(APPLE.hw_CLOCKCTL) & APPLE.CLOCKCTL_border_color_mask);
    this.poke(APPLE.hw_CLOCKCTL, this.lda(this.cpu.a | 0x00));
  }
}
