// BOOT.s: the title, the attract demo and the main menu at $6000, ported. INIT runs it and it runs
// NEWGAME or ULT4 in turn, so nothing calls back into it, but it calls SUBS and SEL as the original
// does: the registers it hands them, and the stack's depth when primm_cout takes note of it, are
// the original's. Its own JSRs push their return addresses for that reason. Its variables, tables
// and inline data stay at their addresses in BOOT's image (boot-data.ts), and so do the operands
// its code rewrites, which the port reads back from there.

import { INTERRUPT } from '../../lifted-runtime/cpu';
import {
  APPLE, APPLE_DETECT, CHAR, DISKS, JUMP_OVERLAY, JUMP_SUBS, JUMP_SYSTEM, MAP_OBJECTS, MUSIC, TABLES, ZP_DEMO, ZP_MAIN, ZP_MUSIC,
} from '../../state/symbols';
import type { IInlineData } from '../inline-data';
import { PortProgram } from '../port-program';
import { BOOT_INLINE, BOOT_TABLES, BOOT_VARIABLES } from './boot-data';

const V = BOOT_VARIABLES;
const T = BOOT_TABLES;
const I = BOOT_INLINE;
const J = JUMP_SUBS;
/** BOOT.s's own use of zero page. */
const ZP_KEYBUF_COUNT: number = 0xEA;
/** The hi-res pages of the pictures BOOT loads, less the screen's: ANIM at $4000, BGND at $7A00. */
const ANIM_PAGES: number = 0x20;
const BGND_PAGES: number = 0x5A;
/** The 80 rows of the map window, from row $68. */
const WINDOW_TOP: number = 0x68;
const CHAR_0: number = 0xB0;
const CHAR_7: number = 0xB7;
const CHAR_9: number = 0xB9;
/** The music banks' letters, in the order the menu tries them. */
const MUSIC_BANKS: readonly number[] = [ CHAR.char_T, CHAR.char_O, CHAR.char_D, CHAR.char_B, CHAR.char_C ];
const MB_TYPE_END: number = CHAR.char_num_first + 0x05;
/** delay_96: ldx #$96 round ldy #$00 / dey. */
const DELAY_96_CYCLES: number = 192_750;
/** input_text's `ldy #$00` / `dey` between polls. */
const TEXT_DELAY_CYCLES: number = 1_280;
/** A pass of attract_loop as the 6502 runs it (the oracle's median), which paces the demo. */
const ATTRACT_STEP_CYCLES: number = 176_477;

type MenuStep = 'return_to_view' | 'menu_main' | 'draw_menu' | 'number_of_drives' | 'journey_onward' | 'init_new_game' | 'activate_mockingboard' | 'done';


export class BootError extends Error {
}


export class Boot extends PortProgram {
  /** BOOT.s boot: loads the pictures, draws the title piece by piece, and runs the demo and menu. */
  public async run(): Promise<void> {
    await this.callWith(J.j_primm_cout, I.load_pictures);
    await this.jsr(0x602A, (): void => this.clearScreen());
    for (const address of [ APPLE.hw_PAGE1, APPLE.hw_HIRES, APPLE.hw_FULLSCREEN, APPLE.hw_GRAPHICS ]) {
      this.cpu.bit(this.peek(address));
    }
    this.poke(ZP_DEMO.ptr_demo, this.lda(T.demo_cmd_table & 0xFF));
    this.poke(ZP_DEMO.ptr_demo + 1, this.lda(T.demo_cmd_table >> 8));
    this.poke(ZP_DEMO.demo_hold_count, this.lda(0x00));
    this.ldx(0x00);
    this.lda(this.cpu.x);
    do {
      this.poke(MAP_OBJECTS.object_tile_sprite + this.cpu.x, this.cpu.a);
    } while (this.dex() !== 0);
    await this.jsr(0x604E, (): Promise<void> => this.drawSignature());
    await this.jsr(0x6051, (): Promise<void> => this.longPause());
    await this.jsr(0x6054, (): Promise<void> => this.drawAnd());
    await this.jsr(0x6057, (): Promise<void> => this.longPause());
    await this.jsr(0x605A, (): Promise<void> => this.drawBlueSeparator());
    await this.jsr(0x605D, (): Promise<void> => this.longPause());
    await this.jsr(0x6060, (): Promise<void> => this.drawOriginSystems());
    await this.jsr(0x6063, (): Promise<void> => this.drawPresent());
    await this.jsr(0x6066, (): Promise<void> => this.longPause());
    await this.jsr(0x6069, (): Promise<void> => this.drawUltimaLogo());
    await this.jsr(0x606C, (): Promise<void> => this.longPause());
    await this.jsr(0x606F, (): Promise<void> => this.drawQuestTitle());
    await this.jsr(0x6072, (): Promise<void> => this.longPause());
    await this.jsr(0x6075, (): Promise<void> => this.drawMapWindow());
    await this.jsr(0x6078, (): Promise<void> => this.drawCaptiveScroll());
    await this.startAttractMode();
  }


  // --- the title (BOOT.s:92-757) ----------------------------------------------------------

  private clearScreen(): void {
    this.ldx(APPLE.screen_HGR1 >> 8);
    this.poke(ZP_DEMO.ptr1_bitmap + 1, this.cpu.x);
    this.ldy(APPLE.screen_HGR1 & 0xFF);
    this.poke(ZP_DEMO.ptr1_bitmap, this.cpu.y);
    this.lda(this.cpu.y);
    do {
      do {
        this.poke(this.pointer(ZP_DEMO.ptr1_bitmap) + this.cpu.y, this.cpu.a);
      } while (this.iny() !== 0);
      this.inc(ZP_DEMO.ptr1_bitmap + 1);
    } while (this.dex() !== 0);
  }


  /** Lord British's signature, a pixel at a time. */
  private async drawSignature(): Promise<void> {
    this.poke(ZP_DEMO.ptr1_bitmap, this.lda(T.pixel_writing & 0xFF));
    this.poke(ZP_DEMO.ptr1_bitmap + 1, this.lda(T.pixel_writing >> 8));
    this.ldx(0x00);
    while (this.lda(this.peek(this.pointer(ZP_DEMO.ptr1_bitmap))) !== 0) {
      this.poke(V.plot_column, this.cpu.a);
      await this.jsr(0x60AC, (): void => this.incPtrTable());
      this.lda(0xBF);
      this.subtract(this.peek(this.pointer(ZP_DEMO.ptr1_bitmap)));
      this.poke(V.plot_row, this.cpu.a);
      await this.jsr(0x60B7, (): void => this.incPtrTable());
      await this.jsr(0x60BA, (): Promise<void> => this.hplotWhite());
      this.lda(0x40);
      await this.jsr(0x60BF, (): Promise<void> => this.shortPause());
      this.ldx(0x00);
    }
  }


  private drawAnd(): Promise<void> {
    this.poke(V.blit_mode, this.lda(0x00));
    this.lda(0x13);
    this.poke(V.src_column, this.cpu.a);
    this.poke(V.dst_column, this.cpu.a);
    this.lda(0x11);
    this.poke(V.src_row, this.cpu.a);
    this.poke(V.dst_row, this.cpu.a);
    this.ldx(0x04);
    this.ldy(0x04);

    return this.jsr(0x60DF, (): void => this.blitImage());
  }


  private async drawBlueSeparator(): Promise<void> {
    this.poke(V.plot_column, this.lda(0x40));
    this.poke(V.plot_row, this.lda(0x1F));
    do {
      await this.jsr(0x60ED, (): void => this.hplotXy());
      this.lda(0x30);
      await this.jsr(0x60F2, (): Promise<void> => this.shortPause());
      this.inc(V.plot_column);
      this.inc(V.plot_column);
      this.lda(this.peek(V.plot_column));
      this.cmp(0xD9);
    } while (!this.carry());
  }


  /** The logo, fading in through random masks; a key makes the next pass the last. */
  private async drawUltimaLogo(): Promise<void> {
    this.poke(V.blit_mode, this.lda(0xFF));
    this.poke(V.blit_progress, this.lda(0x00));
    do {
      this.lda(0x05);
      this.poke(V.src_column, this.cpu.a);
      this.poke(V.dst_column, this.cpu.a);
      this.lda(0x22);
      this.poke(V.src_row, this.cpu.a);
      this.poke(V.dst_row, this.cpu.a);
      this.cpu.bit(await this.m.readKeyboard());
      if (this.negative()) {
        this.poke(V.blit_progress, this.lda(0x38));
      }
      this.ldx(0x1E);
      this.ldy(0x2D);
      await this.jsr(0x612B, (): void => this.blitImage());
      this.lda(this.peek(V.blit_progress));
      this.add(0x01);
      this.poke(V.blit_progress, this.cpu.a);
      this.cmp(0x39);
    } while (!this.carry());
  }


  /** X bytes by Y rows of BGND onto the screen: solid, or through a mask that fills in with blit_progress. */
  private blitImage(): void {
    this.poke(V.blit_width, this.cpu.x);
    this.poke(V.num_rows, this.cpu.y);
    do {
      this.poke(V.num_columns, this.lda(this.peek(V.blit_width)));
      this.ldy(this.peek(V.src_row));
      this.poke(ZP_DEMO.ptr1_bitmap, this.lda(this.peek(TABLES.bmplineaddr_lo + this.cpu.y)));
      this.lda(this.peek(TABLES.bmplineaddr_hi + this.cpu.y));
      this.poke(ZP_DEMO.ptr1_bitmap + 1, this.add(BGND_PAGES));
      this.ldy(this.peek(V.dst_row));
      this.poke(ZP_DEMO.ptr2_bitmap, this.lda(this.peek(TABLES.bmplineaddr_lo + this.cpu.y)));
      this.poke(ZP_DEMO.ptr2_bitmap + 1, this.lda(this.peek(TABLES.bmplineaddr_hi + this.cpu.y)));
      this.ldy(this.peek(V.dst_column));
      do {
        if (this.lda(this.peek(this.pointer(ZP_DEMO.ptr1_bitmap) + this.cpu.y) & 0x7F) !== 0) {
          this.cpu.bit(this.peek(V.blit_mode));
          if (!this.zero()) {
            this.maskByte();
          }
          this.poke(this.pointer(ZP_DEMO.ptr2_bitmap) + this.cpu.y, this.cpu.a);
        }
        this.iny();
      } while (this.dec(V.num_columns) !== 0);
      this.inc(V.src_row);
      this.inc(V.dst_row);
    } while (this.dec(V.num_rows) !== 0);
  }


  /** blit_image's random mode: the byte in A through a mask picked by a running random number. */
  private maskByte(): void {
    this.cpu.push(this.cpu.a);
    this.lda(this.peek(V.mask_rand1));
    this.cpu.adc(0x1D);
    this.ldx(this.cpu.a);
    this.cpu.adc(this.peek(V.mask_rand2));
    this.poke(V.mask_rand1, this.cpu.a);
    this.poke(V.mask_rand2, this.cpu.x);
    this.cpu.push(this.cpu.a);
    this.poke(V.rand_8, this.lda(this.cpu.a & 0x07));
    this.lda(this.cpu.pull());
    this.add(this.peek(V.blit_progress));
    if (this.carry()) {
      this.cpu.bit(this.peek(APPLE.hw_SPEAKER));
    }
    this.lda(this.peek(V.blit_progress));
    this.ldx(this.add(this.peek(V.rand_8)));
    this.poke(V.blit_mask, this.lda(this.peek(T.blit_mask_table + this.cpu.x)));
    this.lda(this.cpu.pull());
    this.lda(this.cpu.a & this.peek(V.blit_mask));
    this.lda(this.cpu.a | 0x80);
  }


  private async hplotWhite(): Promise<void> {
    this.inc(V.plot_column);
    await this.jsr(0x6205, (): void => this.hplotXy());
    this.dec(V.plot_column);
    this.hplotXy();
  }


  /** The pixel at (plot_column, plot_row), in the colour of the row's parity. */
  private hplotXy(): void {
    this.ldy(this.lda(this.peek(V.plot_row)));
    this.cpu.a = this.cpu.lsr(this.cpu.a);
    this.lda(0x00);
    this.cpu.a = this.cpu.ror(this.cpu.a);
    this.poke(V.row_parity, this.cpu.a);
    this.poke(ZP_DEMO.ptr_bitmap, this.lda(this.peek(TABLES.bmplineaddr_lo + this.cpu.y)));
    this.poke(ZP_DEMO.ptr_bitmap + 1, this.lda(this.peek(TABLES.bmplineaddr_hi + this.cpu.y)));
    this.ldx(this.peek(V.plot_column));
    this.lda(this.peek(TABLES.bmpcol_bit + this.cpu.x));
    this.ldy(this.peek(TABLES.bmpcol_byte + this.cpu.x));
    this.lda(this.cpu.a | this.peek(this.pointer(ZP_DEMO.ptr_bitmap) + this.cpu.y));
    this.lda(this.cpu.a | this.peek(V.row_parity));
    this.poke(this.pointer(ZP_DEMO.ptr_bitmap) + this.cpu.y, this.cpu.a);
  }


  private incPtrTable(): void {
    if (this.inc(ZP_DEMO.ptr1_bitmap) === 0) {
      this.inc(ZP_DEMO.ptr1_bitmap + 1);
    }
  }


  private async longPause(): Promise<void> {
    this.ldy(0x04);
    do {
      this.lda(0xFF);
      await this.jsr(0x623D, (): Promise<void> => this.shortPause());
    } while (this.dey() !== 0);
  }


  /** A wait that grows with the square of A, cut short by a key. */
  private async shortPause(): Promise<void> {
    this.cpu.bit(await this.m.readKeyboard());
    if (!this.negative()) {
      let cycles: number = 2;

      this.setCarry(true);
      do {
        this.cpu.push(this.cpu.a);
        do {
          this.cpu.sbc(0x01);
          cycles = cycles + 5;
        } while (this.cpu.a !== 0);
        this.lda(this.cpu.pull());
        this.cpu.sbc(0x01);
        cycles = cycles + 12;
      } while (this.cpu.a !== 0);
      this.cpu.cycles = this.cpu.cycles + cycles;
    }
  }


  private async drawOriginSystems(): Promise<void> {
    this.poke(V.blit_page_offset, this.lda(BGND_PAGES));
    this.poke(V.blitanim_loop_I, this.lda(0x00));
    do {
      this.poke(V.blitanim_loop_J, this.lda(0x00));
      do {
        this.poke(V.blitanim_loop_K, this.lda(0x09));
        do {
          this.lda(this.peek(V.blitanim_loop_K));
          this.poke(V.src_column, this.cpu.a);
          this.poke(V.dst_column, this.cpu.a);
          this.lda(0x15);
          this.poke(V.src_row, this.add(this.peek(V.blitanim_loop_J)));
          this.lda(0x1D);
          this.add(this.peek(V.blitanim_loop_J));
          this.poke(V.dst_row, this.subtract(this.peek(V.blitanim_loop_I)));
          await this.jsr(0x649D, (): void => this.blitFrom(BGND_PAGES));
          this.inc(V.blitanim_loop_K);
          this.lda(this.peek(V.blitanim_loop_K));
          this.cmp(0x1E);
        } while (this.atMost());
        this.inc(V.blitanim_loop_J);
        this.lda(this.peek(V.blitanim_loop_J));
        this.cmp(this.peek(V.blitanim_loop_I));
      } while (this.atMost());
      this.lda(0xC0);
      await this.jsr(0x64BB, (): Promise<void> => this.shortPause());
      this.inc(V.blitanim_loop_I);
      this.lda(this.peek(V.blitanim_loop_I));
      this.cmp(0x08);
    } while (this.atMost());
  }


  /** `bcc` / `beq` back: the comparison found A no greater. */
  private atMost(): boolean {
    return !this.carry() || this.zero();
  }


  /** blit_from_slowpaint (BGND) and blit_from_animsheet (ANIM): one byte from the picture to the screen. */
  private blitFrom(pages: number): void {
    this.poke(V.blit_page_offset, this.lda(pages));
    this.ldy(this.peek(V.src_row));
    this.poke(ZP_DEMO.ptr1_bitmap, this.lda(this.peek(TABLES.bmplineaddr_lo + this.cpu.y)));
    this.lda(this.peek(TABLES.bmplineaddr_hi + this.cpu.y));
    this.poke(ZP_DEMO.ptr1_bitmap + 1, this.add(this.peek(V.blit_page_offset)));
    this.ldy(this.peek(V.dst_row));
    this.poke(ZP_DEMO.ptr2_bitmap, this.lda(this.peek(TABLES.bmplineaddr_lo + this.cpu.y)));
    this.poke(ZP_DEMO.ptr2_bitmap + 1, this.lda(this.peek(TABLES.bmplineaddr_hi + this.cpu.y)));
    this.ldy(this.peek(V.src_column));
    this.lda(this.peek(this.pointer(ZP_DEMO.ptr1_bitmap) + this.cpu.y));
    this.ldy(this.peek(V.dst_column));
    this.poke(this.pointer(ZP_DEMO.ptr2_bitmap) + this.cpu.y, this.cpu.a);
  }


  private async drawPresent(): Promise<void> {
    this.poke(V.blitanim_loop_I, this.lda(0x00));
    do {
      this.poke(V.blitanim_loop_J, this.lda(0x00));
      do {
        this.poke(V.blitanim_loop_K, this.lda(0x10));
        do {
          this.lda(this.peek(V.blitanim_loop_K));
          this.poke(V.src_column, this.cpu.a);
          this.poke(V.dst_column, this.cpu.a);
          this.lda(0x04);
          this.add(this.peek(V.blitanim_loop_J));
          this.poke(V.src_row, this.subtract(this.peek(V.blitanim_loop_I)));
          this.lda(0x21);
          this.poke(V.dst_row, this.add(this.peek(V.blitanim_loop_J)));
          await this.jsr(0x656F, (): void => this.blitFrom(BGND_PAGES));
          this.inc(V.blitanim_loop_K);
          this.lda(this.peek(V.blitanim_loop_K));
          this.cmp(0x18);
        } while (this.atMost());
        this.inc(V.blitanim_loop_J);
        this.lda(this.peek(V.blitanim_loop_J));
        this.cmp(this.peek(V.blitanim_loop_I));
      } while (this.atMost());
      this.lda(0xC0);
      await this.jsr(0x658D, (): Promise<void> => this.shortPause());
      this.inc(V.blitanim_loop_I);
      this.lda(this.peek(V.blitanim_loop_I));
      this.cmp(0x04);
    } while (this.atMost());
  }


  private async drawQuestTitle(): Promise<void> {
    this.poke(V.blit_page_offset, this.lda(BGND_PAGES));
    this.poke(V.blitanim_loop_I, this.lda(0x00));
    do {
      this.poke(V.blitanim_loop_J, this.lda(0x00));
      do {
        this.poke(V.blitanim_loop_K, this.lda(0x03));
        do {
          this.lda(this.peek(V.blitanim_loop_K));
          this.poke(V.src_column, this.cpu.a);
          this.poke(V.dst_column, this.cpu.a);
          this.lda(0x51);
          this.poke(V.src_row, this.add(this.peek(V.blitanim_loop_J)));
          this.lda(0x56);
          this.add(this.peek(V.blitanim_loop_J));
          this.poke(V.dst_row, this.subtract(this.peek(V.blitanim_loop_I)));
          await this.jsr(0x65D0, (): void => this.blitFrom(BGND_PAGES));
          this.lda(0x5C);
          this.add(this.peek(V.blitanim_loop_J));
          this.poke(V.src_row, this.subtract(this.peek(V.blitanim_loop_I)));
          this.lda(0x57);
          this.poke(V.dst_row, this.add(this.peek(V.blitanim_loop_J)));
          await this.jsr(0x65E9, (): void => this.blitFrom(BGND_PAGES));
          this.inc(V.blitanim_loop_K);
          this.lda(this.peek(V.blitanim_loop_K));
          this.cmp(0x24);
        } while (this.atMost());
        this.inc(V.blitanim_loop_J);
        this.lda(this.peek(V.blitanim_loop_J));
        this.cmp(this.peek(V.blitanim_loop_I));
      } while (this.atMost());
      this.lda(0xC0);
      await this.jsr(0x6607, (): Promise<void> => this.shortPause());
      this.inc(V.blitanim_loop_I);
      this.lda(this.peek(V.blitanim_loop_I));
      this.cmp(0x05);
    } while (this.atMost());
  }


  private async drawMapWindow(): Promise<void> {
    this.poke(V.blit_page_offset, this.lda(BGND_PAGES));
    this.poke(V.blitanim_loop_J, this.lda(0x00));
    do {
      this.poke(V.blitanim_loop_K, this.lda(0x60));
      do {
        this.lda(this.peek(V.blitanim_loop_K));
        this.poke(V.src_row, this.cpu.a);
        this.poke(V.dst_row, this.cpu.a);
        this.lda(0x13);
        this.poke(V.src_column, this.subtract(this.peek(V.blitanim_loop_J)));
        this.lda(0x13);
        this.poke(V.dst_column, this.subtract(this.peek(V.blitanim_loop_J)));
        await this.jsr(0x6641, (): void => this.blitFrom(BGND_PAGES));
        this.lda(0x14);
        this.add(this.peek(V.blitanim_loop_J));
        this.poke(V.src_column, this.cpu.a);
        this.poke(V.dst_column, this.cpu.a);
        await this.jsr(0x6650, (): void => this.blitFrom(BGND_PAGES));
        this.inc(V.blitanim_loop_K);
        this.lda(this.peek(V.blitanim_loop_K));
        this.cmp(0xBF);
      } while (this.atMost());
      this.lda(0xC0);
      await this.jsr(0x6661, (): Promise<void> => this.shortPause());
      this.inc(V.blitanim_loop_J);
      this.lda(this.peek(V.blitanim_loop_J));
      this.cmp(0x13);
    } while (this.atMost());
  }


  /** The balron and the dragon rise into view with the demo running behind them, until a key. */
  private async drawCaptiveScroll(): Promise<void> {
    this.poke(V.plot_row, this.lda(0xE1));
    this.lda(0x1E);
    this.poke(V.balron_anim_cur, this.cpu.a);
    this.poke(V.dragon_anim_cur, this.cpu.a);
    let pressed: boolean = false;

    do {
      await this.jsr(0x667E, (): Promise<void> => this.drawCaptiveFrame());
      await this.jsr(0x6681, (): void => this.nextCaptiveFrame());
      await this.jsr(0x6684, (): Promise<void> => this.updateAttract());
      await this.jsr(0x6687, (): Promise<void> => this.updateAttract());
      this.cpu.bit(await this.m.readKeyboard());
      if (this.negative()) {
        pressed = true;
      } else {
        this.inc(V.plot_row);
        this.lda(this.peek(V.plot_row));
        this.cmp(0x01);
      }
    } while (!pressed && !this.zero());
  }


  private async drawCaptiveFrame(): Promise<void> {
    this.ldx(this.peek(V.balron_anim_cur));
    this.ldy(this.peek(T.balron_anim_sequence + this.cpu.x));
    this.poke(V.balron_sheet_x, this.lda(this.peek(T.sheet_balron_col + this.cpu.y)));
    this.poke(V.balron_sheet_y, this.lda(this.peek(T.sheet_balron_row + this.cpu.y)));
    this.ldx(this.peek(V.dragon_anim_cur));
    this.ldy(this.peek(T.dragon_anim_sequence + this.cpu.x));
    this.poke(V.dragon_sheet_x, this.lda(this.peek(T.sheet_dragon_col + this.cpu.y)));
    this.poke(V.dragon_sheet_y, this.lda(this.peek(T.sheet_dragon_row + this.cpu.y)));
    this.poke(V.blitanim_loop_I, this.lda(0x00));
    do {
      this.poke(V.blitanim_loop_J, this.lda(0x00));
      do {
        this.lda(this.peek(V.blitanim_loop_J));
        this.poke(V.src_column, this.add(this.peek(V.balron_sheet_x)));
        this.poke(V.dst_column, this.lda(this.peek(V.blitanim_loop_J)));
        this.lda(this.peek(V.blitanim_loop_I));
        this.poke(V.src_row, this.add(this.peek(V.balron_sheet_y)));
        this.lda(this.peek(V.blitanim_loop_I));
        this.add(this.peek(V.plot_row));
        if (!this.negative()) {
          this.poke(V.dst_row, this.cpu.a);
          await this.jsr(0x66ED, (): void => this.blitFrom(ANIM_PAGES));
        }
        this.lda(this.peek(V.blitanim_loop_J));
        this.poke(V.src_column, this.add(this.peek(V.dragon_sheet_x)));
        this.lda(this.peek(V.blitanim_loop_J));
        this.add(0x22);
        this.cmp(0x28);
        if (!this.carry()) {
          this.poke(V.dst_column, this.cpu.a);
          this.lda(this.peek(V.blitanim_loop_I));
          this.poke(V.src_row, this.add(this.peek(V.dragon_sheet_y)));
          this.lda(this.peek(V.blitanim_loop_I));
          this.add(this.peek(V.plot_row));
          if (!this.negative()) {
            this.poke(V.dst_row, this.cpu.a);
            await this.jsr(0x671B, (): void => this.blitFrom(ANIM_PAGES));
          }
        }
        this.inc(V.blitanim_loop_J);
        this.lda(this.peek(V.blitanim_loop_J));
        this.cmp(0x07);
      } while (!this.carry());
      this.inc(V.blitanim_loop_I);
      this.lda(this.peek(V.blitanim_loop_I));
      this.cmp(0x1F);
    } while (!this.carry());
  }


  private nextCaptiveFrame(): void {
    this.inc(V.balron_anim_cur);
    this.poke(V.balron_anim_cur, this.lda(this.peek(V.balron_anim_cur) & 0x7F));
    this.inc(V.dragon_anim_cur);
    this.poke(V.dragon_anim_cur, this.lda(this.peek(V.dragon_anim_cur) & 0x3F));
  }


  // --- the menu (BOOT.s:762-1058, 1169-1258, 1656-1689) -----------------------------------

  /** BOOT.s start_attract_mode, entered by JMP: the demo until a key, then the menu, until a choice runs another program. */
  private async startAttractMode(): Promise<void> {
    this.lda(0x00);
    this.poke(ZP_DEMO.game_mode, this.cpu.a);
    this.poke(ZP_MAIN.currdisk_drive2, this.cpu.a);
    this.lda(0x01);
    this.poke(ZP_MAIN.numdrives, this.cpu.a);
    this.poke(ZP_MAIN.currdisk_drive1, this.cpu.a);
    await this.jsr(0x6757, (): void => undefined);
    let step: MenuStep = 'return_to_view';

    while (step !== 'done') {
      step = await this.menuStep(step);
    }
  }


  private async menuStep(step: MenuStep): Promise<MenuStep> {
    let next: MenuStep;

    if (step === 'return_to_view') {
      await this.jsr(0x675A, (): Promise<void> => this.attractLoop());
      this.cpu.php();
      this.cpu.setFlag(INTERRUPT, false);
      this.poke(ZP_MUSIC.tune_queue_next, this.lda(this.peek(ZP_MUSIC.tune_playing)));
      this.cpu.plp();
      next = 'menu_main';
    } else if (step === 'menu_main') {
      await this.jsr(0x6764, (): void => this.clearWindow());
      next = 'draw_menu';
    } else if (step === 'draw_menu') {
      next = await this.drawMenu();
    } else if (step === 'number_of_drives') {
      this.poke(ZP_MAIN.numdrives, this.lda(this.peek(ZP_MAIN.numdrives) ^ 0x03));
      this.poke(V.num_drives, this.lda(this.peek(V.num_drives) ^ 0x03));
      next = 'draw_menu';
    } else if (step === 'journey_onward') {
      await this.journeyOnward();
      next = 'init_new_game';
    } else if (step === 'init_new_game') {
      await this.initNewGame();
      next = 'done';
    } else if (step === 'activate_mockingboard') {
      await this.activateMockingboard();
      next = 'menu_main';
    } else {
      next = 'done';
    }

    return next;
  }


  private async drawMenu(): Promise<MenuStep> {
    this.poke(V.cursor_y, this.lda(0x10));
    this.poke(V.cursor_x, this.lda(0x17));
    await this.primmXy(0x02, 0x0E, I.intro);
    await this.primmXy(0x0F, 0x10, I.options);
    await this.primmXy(0x0B, 0x11, I.return_to_view);
    await this.primmXy(0x0B, 0x12, I.number_of_drives);
    await this.primmXy(0x0D, 0x13, I.journey_onward);
    await this.primmXy(0x0B, 0x14, I.initiate_new_game);
    this.cpu.bit(this.peek(V.mockingboard_active));
    if (!this.negative()) {
      await this.primmXy(0x09, 0x15, I.activate_sound_board);
    }
    let next: MenuStep | null = null;

    while (next == null) {
      next = await this.menuChoice();
    }

    return next;
  }


  /** One key of the main menu: a digit or a bank letter picks music, and the rest pick an option. */
  private async menuChoice(): Promise<MenuStep | null> {
    let next: MenuStep | null = null;

    await this.jsr(0x6831, (): Promise<void> => this.inputChar());
    this.cmp(CHAR_0);
    if (this.carry()) {
      this.cmp(CHAR_9 + 1);
      if (!this.carry()) {
        this.subtract(CHAR_0);
        await this.jsr(0x683F, (): Promise<void> => this.loadMusic());
      } else if (MUSIC_BANKS.includes(this.cpu.a)) {
        this.cmp(this.cpu.a);
        await this.jsr(0x6859, (): Promise<void> => this.loadMusic());
      } else {
        next = this.menuOption();
      }
    }

    return next;
  }


  private menuOption(): MenuStep | null {
    const options: readonly [ number, MenuStep ][] = [
      [ CHAR.char_R, 'return_to_view' ],
      [ CHAR.char_N, 'number_of_drives' ],
      [ CHAR.char_J, 'journey_onward' ],
      [ CHAR.char_I, 'init_new_game' ],
    ];
    const option: readonly [ number, MenuStep ] | undefined = options.find(([ key ]: readonly [ number, MenuStep ]): boolean => key === this.cpu.a);
    let next: MenuStep | null = null;

    this.cmp(option?.[0] ?? CHAR.char_A);
    if (option != null) {
      next = option[1];
    } else if (this.zero()) {
      this.cpu.bit(this.peek(V.mockingboard_active));
      if (!this.negative()) {
        next = 'activate_mockingboard';
      }
    }

    return next;
  }


  /** BOOT.s input_char: a key, with the cursor at (cursor_x, cursor_y) and the captives moving. */
  private async inputChar(): Promise<void> {
    do {
      this.ldx(this.peek(V.cursor_x));
      this.ldy(this.peek(V.cursor_y));
      await this.m.call(J.j_drawcursor_xy);
      await this.jsr(0x6B33, (): void => this.updateCaptives());
      await this.m.call(J.j_rand);
      await this.jsr(0x6B39, (): void => this.delay96());
      this.lda(await this.m.readKeyboard());
    } while (!this.negative());
    this.cpu.bit(await this.m.clearKeyboardStrobe());
    this.cpu.push(this.cpu.a);
    await this.m.call(J.j_console_out);
    this.lda(this.cpu.pull());
  }


  private delay96(): void {
    this.cpu.cycles = this.cpu.cycles + DELAY_96_CYCLES;
    this.ldx(0x00);
    this.ldy(0x00);
  }


  /** BOOT.s load_music: a digit plays that tune; a letter picks that bank's music and loads it. */
  private async loadMusic(): Promise<void> {
    this.ldx(this.cpu.a);
    if (this.negative()) {
      this.poke(V.music_bank, this.cpu.a);
      this.ldx(MUSIC.music_main);
      this.poke(V.music_tune, this.cpu.x);
    } else {
      this.poke(V.music_tune, this.cpu.a);
    }
    await this.jmp(JUMP_SYSTEM.music_ctl);
  }


  /** BOOT.s update_music: when a tune ends, the next of the bank's, or the next bank's music. */
  private async updateMusic(): Promise<void> {
    this.lda(this.peek(ZP_MUSIC.tune_playing));
    this.cmp(this.peek(ZP_MUSIC.tune_queue_next));
    if (this.zero()) {
      this.cmp(MUSIC.music_off);
      if (!this.zero()) {
        this.poke(V.music_tune, this.cpu.a);
      }
      this.ldx(0xFF);
      let found: boolean = false;

      while (!found && (this.lda(this.peek(T.music_bank_letter + this.inx())) !== 0)) {
        this.cmp(this.peek(V.music_bank));
        found = this.zero();
      }
      if (found) {
        this.nextTune();
      }
      await this.advanceDemoTune();
    }
  }


  /** update_music's @get_tune_number: X to the bank's entry for music_tune, and on to its next tune. */
  private nextTune(): void {
    this.lda(this.cpu.x);
    this.cpu.a = this.cpu.asl(this.cpu.a);
    this.cpu.a = this.cpu.asl(this.cpu.a);
    this.ldx(this.add(this.peek(V.music_tune)));
    while ((this.lda(this.peek(T.music_bank_tunes + this.cpu.x)) === 0) && (this.inx() !== 0)) {
      // the bank's next tune, past its gaps
    }
    if (this.negative()) {
      this.ldx(0x00);
    }
  }


  private async advanceDemoTune(): Promise<void> {
    this.lda(this.cpu.x);
    this.cpu.a = this.cpu.lsr(this.cpu.a);
    this.cpu.a = this.cpu.lsr(this.cpu.a);
    this.ldy(this.cpu.a);
    this.lda(this.peek(T.music_bank_letter + this.cpu.y));
    this.cmp(this.peek(V.music_bank));
    if (this.zero()) {
      this.poke(ZP_MUSIC.tune_queue_next, this.lda(this.peek(T.music_bank_tunes + this.cpu.x)));
    } else {
      this.ldy(MUSIC.music_off);
      this.poke(ZP_MUSIC.tune_queue_next, this.cpu.y);
      if (this.ldy(this.peek(ZP_MUSIC.tune_playing)) === 0) {
        await this.jsr(0x6ADA, (): Promise<void> => this.loadMusic());
      }
    }
  }


  private async journeyOnward(): Promise<void> {
    this.lda(0x00);
    this.poke(ZP_DEMO.party_size, this.cpu.a);
    this.poke(ZP_MAIN.key_buf_len, this.cpu.a);
    this.lda(MUSIC.music_off);
    await this.jsr(0x6B54, (): Promise<void> => this.loadMusic());
    await this.callWith(J.j_primm_cout, I.run_ult4);
  }


  /** BOOT.s init_new_game: the Britannia disk if there are two drives, the player's name and sex, and NEWGAME. */
  private async initNewGame(): Promise<void> {
    this.lda(MUSIC.music_off);
    await this.jsr(0x6B7F, (): Promise<void> => this.loadMusic());
    this.lda(this.peek(ZP_MAIN.numdrives));
    this.cmp(0x01);
    if (!this.zero()) {
      this.lda(DISKS.disk_britannia);
      await this.jsr(0x6B8A, (): Promise<void> => this.insertDisk());
      this.poke(ZP_MAIN.disk_id, this.lda(DISKS.disk_program));
    }
    await this.jsr(0x6B91, (): void => this.clearWindow());
    await this.primmXy(0x04, 0x10, I.ask_name);
    await this.primmXy(0x04, 0x11, I.ask_name_2);
    this.poke(ZP_MAIN.console_ypos, this.lda(0x13));
    this.poke(ZP_MAIN.console_xpos, this.lda(0x0C));
    await this.jsr(0x6BE4, (): Promise<void> => this.inputText());
    await this.jsr(0x6BE7, (): void => this.clearWindow());
    await this.primmXy(0x04, 0x11, I.ask_sex);
    this.poke(V.cursor_x, this.lda(this.peek(ZP_MAIN.console_xpos)));
    this.poke(V.cursor_y, this.lda(this.peek(ZP_MAIN.console_ypos)));
    const glyphs: ReadonlyMap<number, number> = new Map<number, number>([
      [ CHAR.char_M, CHAR.glyph_male ],
      [ CHAR.char_F, CHAR.glyph_female ],
      [ CHAR.char_N, CHAR.glyph_neutral ],
    ]);
    let glyph: number | undefined;

    do {
      await this.jsr(0x6C15, (): Promise<void> => this.inputChar());
      glyph = glyphs.get(this.cpu.a);
    } while (glyph == null);
    this.cmp(this.cpu.a);
    this.poke(ZP_MAIN.gender_chosen, this.lda(glyph));
    await this.jsr(0x6C30, (): void => this.clearWindow());
    this.lda(MUSIC.music_off);
    await this.jsr(0x6C35, (): Promise<void> => this.loadMusic());
    await this.callWith(J.j_primm_cout, I.run_newgame);
  }


  private async primmXy(x: number, y: number, block: IInlineData): Promise<void> {
    this.ldx(x);
    this.ldy(y);
    await this.callWith(J.j_primm_xy, block);
  }


  private clearWindow(): void {
    this.ldx(0x4F);
    do {
      this.poke(ZP_MAIN.ptr1, this.lda(this.peek(TABLES.bmplineaddr_lo + WINDOW_TOP + this.cpu.x)));
      this.poke(ZP_MAIN.ptr1 + 1, this.lda(this.peek(TABLES.bmplineaddr_hi + WINDOW_TOP + this.cpu.x)));
      this.ldy(0x26);
      this.lda(0x00);
      do {
        this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.cpu.a);
      } while (this.dey() !== 0);
      this.dex();
    } while (!this.negative());
  }


  // --- the sound board (BOOT.s:857-1031, 1111-1166) ---------------------------------------

  private async activateMockingboard(): Promise<void> {
    this.lda(MUSIC.music_off);
    await this.jsr(0x6886, (): Promise<void> => this.loadMusic());
    this.lda(this.peek(APPLE_DETECT.zp_hw_model));
    if (!this.negative()) {
      this.poke(V.init_mb_iigs, this.lda(APPLE.opcode_RTS));
    }
    this.lda(0x00);
    for (const address of [ ZP_MUSIC.mb_1_slot, ZP_MUSIC.mb_1_type, ZP_MUSIC.mb_2_slot, ZP_MUSIC.mb_2_type ]) {
      this.poke(address, this.cpu.a);
    }
    this.inc(V.cursor_x);
    await this.jsr(0x689F, (): void => this.clearWindow());
    await this.primmXy(0x0F, 0x10, I.how_many);
    await this.primmXy(0x0C, 0x12, I.one_board);
    await this.primmXy(0x0C, 0x13, I.two_boards);
    let count: number | null = null;

    while (count == null) {
      await this.jsr(0x68D6, (): Promise<void> => this.inputChar());
      count = (this.cpu.a === CHAR.char_O) ? 0x00 : ((this.cpu.a === CHAR.char_T) ? 0x80 : null);
      if ((count == null) && (this.cpu.a === CHAR.char_ESC)) {
        count = -1;
      }
    }
    if (count >= 0) {
      this.poke(ZP_MUSIC.mb_count, this.lda(count));
      await this.chooseBoards();
    }
  }


  /** Which kind and which slot for each board, and then the drivers. ESC goes back to the menu. */
  private async chooseBoards(): Promise<void> {
    let escaped: boolean = false;
    let chosen: boolean = false;

    while (!escaped && !chosen) {
      escaped = !(await this.chooseSetting(0x68F0, 0x68F3, 0x6964, CHAR.char_num_first + 1, MB_TYPE_END, ZP_MUSIC.mb_1_type, async (): Promise<void> => {
        await this.primmXy(0x0D, 0x10, I.which_kind);
        await this.primmXy(0x0A, 0x12, I.sound_1);
        await this.primmXy(0x0A, 0x13, I.sound_speech);
        await this.primmXy(0x0A, 0x14, I.mockingboard_a_or_c);
        await this.primmXy(0x0A, 0x15, I.echo_plus);
      }));
      if (!escaped) {
        escaped = !(await this.chooseSetting(0x6981, 0x6984, 0x69B4, CHAR.char_1, CHAR_7 + 1, ZP_MUSIC.mb_1_slot, async (): Promise<void> => {
          await this.primmXy(0x0D, 0x10, I.which_slot);
          await this.primmXy(0x0B, 0x13, I.slot_number);
        }));
      }
      if (!escaped) {
        this.cpu.bit(this.peek(ZP_MUSIC.mb_count));
        if (this.negative()) {
          this.inc(ZP_MUSIC.mb_count);
          this.inc(ZP_MUSIC.mb_count);
        } else {
          chosen = true;
        }
      }
    }
    if (chosen) {
      await this.loadSoundDrivers();
    }
  }


  /** A page of the sound board's questions: a digit from `first` to before `end`, kept for this board at `setting`. False on ESC. */
  private async chooseSetting(clearSite: number, headingSite: number, inputSite: number, first: number, end: number, setting: number, ask: () => Promise<void>): Promise<boolean> {
    let answered: boolean = false;
    let escaped: boolean = false;

    await this.jsr(clearSite, (): void => this.clearWindow());
    await this.jsr(headingSite, (): Promise<void> => this.printMockboard12());
    await ask();
    while (!answered && !escaped) {
      await this.jsr(inputSite, (): Promise<void> => this.inputChar());
      this.cmp(CHAR.char_ESC);
      if (this.zero()) {
        escaped = true;
      } else {
        this.cmp(first);
        if (this.carry()) {
          this.cmp(end);
          answered = !this.carry();
        }
      }
    }
    if (answered) {
      this.ldy(this.subtract(CHAR.char_num_first));
      this.ldx(this.lda(this.peek(ZP_MUSIC.mb_count) & 0x02));
      this.poke(setting + this.cpu.x, this.cpu.y);
    }

    return answered;
  }


  private async printMockboard12(): Promise<void> {
    this.ldy(0x0E);
    this.ldx(0x08);
    this.lda(this.peek(ZP_MUSIC.mb_count));
    if (this.negative()) {
      if (this.lda(this.cpu.a & 0x02) === 0) {
        await this.callWith(J.j_primm_xy, I.first_mockingboard);
      } else {
        await this.callWith(J.j_primm_xy, I.second_mockingboard);
      }
    }
  }


  private async loadSoundDrivers(): Promise<void> {
    await this.callWith(J.j_primm_cout, I.load_sound_drivers);
    await this.m.call(JUMP_OVERLAY.j_mbsi);
    if (this.carry()) {
      if (this.peek(V.init_mb_iigs) !== APPLE.opcode_RTS) {
        throw new BootError('init_mb_iigs: the IIgs interrupt set-up is 65816 code');
      }
      this.poke(JUMP_SYSTEM.music_ctl, this.lda(APPLE.opcode_JMP));
      this.poke(ZP_MUSIC.tune_playing, this.lda(MUSIC.music_off));
      this.lda(MUSIC.music_Towne);
      await this.jsr(0x6A19, (): Promise<void> => this.loadMusic());
      this.lda(MUSIC.music_explore);
      await this.jsr(0x6A1E, (): Promise<void> => this.loadMusic());
      this.dec(V.mockingboard_active);
    }
  }


  // --- the attract demo (BOOT.s:1260-1592) ------------------------------------------------

  private async attractLoop(): Promise<void> {
    do {
      await this.jsr(0x6C68, (): Promise<void> => this.updateAttractAndCaptives());
      await this.jsr(0x6C6B, (): Promise<void> => this.updateMusic());
      this.cpu.cycles = this.cpu.cycles + ATTRACT_STEP_CYCLES;
      this.lda(await this.m.readKeyboard());
    } while (!this.negative());
    this.cpu.bit(await this.m.clearKeyboardStrobe());
  }


  private async updateAttractAndCaptives(): Promise<void> {
    do {
      await this.jsr(0x6C77, (): Promise<void> => this.updateAttract());
      this.poke(V.attract_twice, this.lda(this.peek(V.attract_twice) ^ 0xFF));
    } while (!this.negative());
    this.updateCaptives();
  }


  /** The next frame of the balron and the dragon, straight from ANIM. */
  private updateCaptives(): void {
    this.poke(V.captive_row_cur, this.lda(0x00));
    this.inc(V.balron_anim_cur);
    this.ldx(this.lda(this.peek(V.balron_anim_cur) & 0x7F));
    this.ldy(this.peek(T.balron_anim_sequence + this.cpu.x));
    this.poke(V.captive_sheet_y, this.lda(this.peek(T.sheet_balron_row + this.cpu.y)));
    this.poke(V.captive_sheet_x, this.lda(this.peek(T.sheet_balron_col + this.cpu.y)));
    this.blitCaptive(0x00, 0x06);
    this.poke(V.captive_row_cur, this.lda(0x00));
    this.inc(V.dragon_anim_cur);
    this.ldx(this.lda(this.peek(V.dragon_anim_cur) & 0x3F));
    this.ldy(this.peek(T.dragon_anim_sequence + this.cpu.x));
    this.poke(V.captive_sheet_y, this.lda(this.peek(T.sheet_dragon_row + this.cpu.y)));
    this.poke(V.captive_sheet_x, this.lda(this.peek(T.sheet_dragon_col + this.cpu.y)));
    this.blitCaptive(0x22, 0x05);
  }


  /** 32 rows of one captive, `last` + 1 bytes wide, to column `column`. */
  private blitCaptive(column: number, last: number): void {
    do {
      this.ldx(this.peek(V.captive_row_cur));
      this.lda(this.peek(TABLES.bmplineaddr_lo + this.cpu.x));
      if (column !== 0) {
        this.add(column);
      }
      this.poke(ZP_MAIN.ptr1, this.cpu.a);
      this.poke(ZP_MAIN.ptr1 + 1, this.lda(this.peek(TABLES.bmplineaddr_hi + this.cpu.x)));
      this.setCarry(false);
      this.lda(this.peek(V.captive_sheet_y));
      this.cpu.adc(this.peek(V.captive_row_cur));
      this.ldx(this.cpu.a);
      this.lda(this.peek(TABLES.bmplineaddr_hi + this.cpu.x));
      this.poke(ZP_MAIN.ptr2 + 1, this.add(ANIM_PAGES));
      this.lda(this.peek(TABLES.bmplineaddr_lo + this.cpu.x));
      this.poke(ZP_MAIN.ptr2, this.add(this.peek(V.captive_sheet_x)));
      this.ldy(last);
      do {
        this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.lda(this.peek(this.pointer(ZP_MAIN.ptr2) + this.cpu.y)));
        this.dey();
      } while (!this.negative());
      this.inc(V.captive_row_cur);
      this.lda(this.peek(V.captive_row_cur));
      this.cmp(0x20);
    } while (!this.carry());
  }


  /** The demo's map and its objects into drawn_tiles. */
  private drawWorldTiles(): void {
    this.ldx(0x5E);
    do {
      this.poke(MAP_OBJECTS.drawn_tiles + this.cpu.x, this.lda(this.peek(T.attract_map + this.cpu.x)));
      this.dex();
    } while (!this.negative());
    this.ldx(0x00);
    do {
      if (this.lda(this.peek(MAP_OBJECTS.object_tile_sprite + this.cpu.x)) !== 0) {
        this.ldy(this.peek(MAP_OBJECTS.object_ypos + this.cpu.x));
        this.lda(this.peek(T.world_row_index + this.cpu.y));
        this.ldy(this.add(this.peek(MAP_OBJECTS.object_xpos + this.cpu.x)));
        this.poke(MAP_OBJECTS.drawn_tiles + this.cpu.y, this.lda(this.peek(MAP_OBJECTS.object_tile_sprite + this.cpu.x)));
      }
      this.inx();
      this.cpu.compare(this.cpu.x, MAP_OBJECTS.object_last);
    } while (!this.zero());
  }


  /** One step of the demo, and the map window drawn: 5 rows of 19 tiles, each half from bank 1 and half from bank 2. */
  private async updateAttract(): Promise<void> {
    await this.jsr(0x6E65, (): Promise<void> => this.updateDemo());
    await this.m.call(J.j_animate_tiles);
    await this.jsr(0x6E6B, (): void => this.drawWorldTiles());
    this.lda(0x00);
    this.poke(ZP_MAIN.current_draw_line, this.cpu.a);
    this.poke(V.tile_index, this.cpu.a);
    let done: boolean = false;

    while (!done) {
      this.drawWindowLine();
      this.inc(ZP_MAIN.current_draw_line);
      this.lda(this.peek(ZP_MAIN.current_draw_line));
      this.cmp(0x50);
      if (this.zero()) {
        done = true;
      } else if (this.lda(this.cpu.a & 0x0F) !== 0) {
        this.lda(this.peek(V.tile_index));
        this.poke(V.tile_index, this.subtract(0x13));
      }
    }
  }


  private drawWindowLine(): void {
    this.ldy(this.peek(ZP_MAIN.current_draw_line));
    this.lda(this.peek(TABLES.bmplineaddr_lo + WINDOW_TOP + this.cpu.y));
    this.poke(V.dst1, this.cpu.a);
    this.poke(V.dst2, this.cpu.a);
    this.lda(this.peek(TABLES.bmplineaddr_hi + WINDOW_TOP + this.cpu.y));
    this.poke(V.dst1 + 1, this.cpu.a);
    this.poke(V.dst2 + 1, this.cpu.a);
    this.lda(this.cpu.y);
    this.lda((this.cpu.a & 0x0F) | 0xD0);
    this.poke(V.src1 + 1, this.cpu.a);
    this.poke(V.src2 + 1, this.cpu.a);
    this.ldx(0x01);
    do {
      this.ldy(this.peek(this.patchedWord(V.tile_index)));
      this.cpu.bit(this.peek(APPLE.hw_LCBANK1));
      this.poke(this.patchedWord(V.dst1) + this.cpu.x, this.lda(this.peek(this.patchedWord(V.src1) + this.cpu.y)));
      this.inx();
      this.cpu.bit(this.peek(APPLE.hw_LCBANK2));
      this.poke(this.patchedWord(V.dst2) + this.cpu.x, this.lda(this.peek(this.patchedWord(V.src2) + this.cpu.y)));
      this.inc(V.tile_index);
      this.inx();
      this.cpu.compare(this.cpu.x, 0x27);
    } while (!this.carry());
  }


  /** The demo script's next commands: objects placed or removed until a hold. */
  private async updateDemo(): Promise<void> {
    this.dec(ZP_DEMO.demo_hold_count);
    if (this.negative()) {
      let holding: boolean = false;

      this.ldy(0x00);
      while (!holding) {
        this.lda(this.peek(this.pointer(ZP_DEMO.ptr_demo) + this.cpu.y));
        if (!this.negative()) {
          await this.demoObject();
        } else {
          this.ldx(this.cpu.a);
          this.lda(this.cpu.a & 0xF0);
          this.cmp(0x80);
          if (this.zero()) {
            this.lda(this.cpu.x & 0x0F);
            this.cpu.a = this.cpu.asl(this.cpu.a);
            this.poke(ZP_DEMO.demo_hold_count, this.cpu.a);
            this.incPtrDemo();
            holding = true;
          } else {
            this.poke(ZP_DEMO.ptr_demo, this.lda(T.demo_cmd_table & 0xFF));
            this.poke(ZP_DEMO.ptr_demo + 1, this.lda(T.demo_cmd_table >> 8));
          }
        }
      }
    }
  }


  /** A command byte below $80: the object in its low nibble to the row in its high one, or away at row 7. */
  private async demoObject(): Promise<void> {
    this.cpu.push(this.cpu.a);
    this.ldx(this.lda(this.cpu.a & 0x0F));
    this.lda(this.cpu.pull());
    this.div16(this.lda(this.cpu.a & 0xF0));
    this.cmp(0x07);
    if (this.zero()) {
      this.lda(0x00);
      this.poke(MAP_OBJECTS.object_tile_sprite + this.cpu.x, this.cpu.a);
      this.poke(MAP_OBJECTS.object_tile_type + this.cpu.x, this.cpu.a);
      await this.jsr(0x6F9B, (): void => this.incPtrDemo());
    } else {
      this.poke(MAP_OBJECTS.object_ypos + this.cpu.x, this.cpu.a);
      await this.jsr(0x6F6B, (): void => this.incPtrDemo());
      this.lda(this.peek(this.pointer(ZP_DEMO.ptr_demo) + this.cpu.y));
      this.cpu.push(this.cpu.a);
      this.poke(MAP_OBJECTS.object_xpos + this.cpu.x, this.lda(this.cpu.a & 0x1F));
      this.lda(this.cpu.pull());
      for (let shift: number = 0; shift < 5; shift++) {
        this.cpu.a = this.cpu.lsr(this.cpu.a);
      }
      this.poke(MAP_OBJECTS.object_tile_sprite + this.cpu.x, this.add(this.peek(T.demo_mob_type + this.cpu.x)));
      this.cpu.compare(this.cpu.x, 0x01);
      if (this.zero()) {
        this.lda(this.peek(T.demo_mob_type + this.cpu.x));
      }
      this.poke(MAP_OBJECTS.object_tile_type + this.cpu.x, this.cpu.a);
      await this.jsr(0x6F8D, (): void => this.incPtrDemo());
    }
  }


  private incPtrDemo(): void {
    if (this.inc(ZP_DEMO.ptr_demo) === 0) {
      this.inc(ZP_DEMO.ptr_demo + 1);
    }
  }


  // --- typing a name, and asking for disks (BOOT.s:1593-1655, 1714-1841) -------------------

  /** BOOT.s input_text: up to 15 characters into inbuffer, padded with zeros, ended by RETURN. */
  private async inputText(): Promise<void> {
    await this.m.at('BOOT', 0x6FB0);
    this.poke(ZP_KEYBUF_COUNT, this.lda(0x00));
    let entered: boolean = false;

    while (!entered) {
      this.ldx(this.peek(ZP_MAIN.console_xpos));
      this.ldy(this.peek(ZP_MAIN.console_ypos));
      await this.m.call(J.j_drawcursor_xy);
      await this.jsr(0x6FBB, (): void => this.updateCaptives());
      this.poke(ZP_DEMO.cursor_hold, this.lda(0x00));
      while (!entered && !(this.inc(ZP_DEMO.cursor_hold) & 0x80)) {
        this.cpu.cycles = this.cpu.cycles + TEXT_DELAY_CYCLES;
        this.ldy(0x00);
        this.lda(await this.m.readKeyboard());
        if (this.negative()) {
          entered = await this.typed();
        }
      }
    }
  }


  /** A key input_text has read: true once RETURN has ended a name. */
  private async typed(): Promise<boolean> {
    let entered: boolean = false;

    this.cpu.bit(await this.m.clearKeyboardStrobe());
    this.cmp(CHAR.char_DEL);
    if (this.zero()) {
      this.lda(CHAR.char_left_arrow);
    }
    this.cmp(CHAR.char_enter);
    if (this.zero()) {
      if (this.ldx(this.peek(ZP_KEYBUF_COUNT)) !== 0) {
        this.lda(0x00);
        do {
          this.poke(TABLES.inbuffer + this.cpu.x, this.cpu.a);
          this.inx();
          this.cpu.compare(this.cpu.x, 0x10);
        } while (!this.carry());
        this.lda(CHAR.char_enter);
        await this.m.call(J.j_console_out);
        entered = true;
      }
    } else {
      this.cmp(CHAR.char_left_arrow);
      if (this.zero()) {
        await this.backspace();
      } else {
        this.cmp(CHAR.char_space);
        if (this.carry()) {
          this.ldx(this.peek(ZP_KEYBUF_COUNT));
          this.cpu.compare(this.cpu.x, 0x0F);
          if (!this.zero()) {
            this.poke(TABLES.inbuffer + this.cpu.x, this.cpu.a);
            await this.m.call(J.j_console_out);
            this.inc(ZP_KEYBUF_COUNT);
          }
        }
      }
    }

    return entered;
  }


  private async backspace(): Promise<void> {
    if (this.lda(this.peek(ZP_KEYBUF_COUNT)) !== 0) {
      this.dec(ZP_KEYBUF_COUNT);
      this.lda(CHAR.char_space);
      await this.m.call(J.j_console_out);
      this.dec(ZP_MAIN.console_xpos);
      this.dec(ZP_MAIN.console_xpos);
      this.lda(CHAR.char_space);
      await this.m.call(J.j_console_out);
      this.dec(ZP_MAIN.console_xpos);
    }
  }


  /** BOOT.s insert_disk: asks for disk A until DISK on the drive it goes in says it is there. */
  private async insertDisk(): Promise<void> {
    let inserted: boolean = false;

    this.poke(ZP_MAIN.reqdisk, this.cpu.a);
    while (!inserted) {
      await this.jsr(0x707D, (): void => this.clearWindow());
      this.poke(ZP_MAIN.console_ypos, this.lda(0x10));
      this.lda(this.peek(ZP_MAIN.reqdisk));
      this.cmp(DISKS.disk_britannia);
      let second: boolean = this.zero();

      if (!second) {
        this.cmp(DISKS.disk_dungeon);
        second = this.zero();
      }
      if (second) {
        this.lda(this.peek(ZP_MAIN.numdrives));
        this.cmp(0x02);
        second = this.carry();
      }
      if (second) {
        await this.askForDisk(2, ZP_MAIN.currdisk_drive2, I.please_place_2, 0x7120, I.into_drive_2);
      } else {
        await this.askForDisk(1, ZP_MAIN.currdisk_drive1, I.please_place_1, 0x70B2, I.into_drive_1);
      }
      inserted = await this.loadDiskId();
    }
  }


  /** Drive `drive`'s half of insert_disk: the prompt and a wait for ESC, unless the disk is in it already. */
  private async askForDisk(drive: number, current: number, place: IInlineData, nameSite: number, into: IInlineData): Promise<void> {
    this.poke(ZP_MAIN.currdrive, this.lda(drive));
    this.lda(this.peek(ZP_MAIN.reqdisk));
    this.cmp(this.peek(current));
    if (!this.zero()) {
      this.ldy(this.peek(ZP_MAIN.console_ypos));
      this.ldx(0x0B);
      await this.callWith(J.j_primm_xy, place);
      this.inc(ZP_MAIN.console_ypos);
      await this.jsr(nameSite, (): Promise<void> => this.printDiskName());
      this.ldy(this.peek(ZP_MAIN.console_ypos));
      this.ldx(0x0D);
      await this.callWith(J.j_primm_xy, into);
      this.inc(ZP_MAIN.console_ypos);
      this.ldy(this.peek(ZP_MAIN.console_ypos));
      this.ldx(0x0B);
      await this.callWith(J.j_primm_xy, I.press_esc);
      this.poke(V.cursor_x, this.lda(this.peek(ZP_MAIN.console_xpos)));
      this.poke(V.cursor_y, this.lda(this.peek(ZP_MAIN.console_ypos)));
      do {
        await this.jsr(0x70EC, (): Promise<void> => this.inputChar());
        this.cmp(CHAR.char_ESC);
      } while (!this.zero());
    }
  }


  /** BOOT.s @load_disk_id: DISK from the current drive; true when its id is the disk asked for. */
  private async loadDiskId(): Promise<boolean> {
    this.lda(this.peek(ZP_MAIN.currdrive));
    this.poke(V.drive_number, this.add(CHAR.char_num_first));
    await this.callWith(J.j_primm_cout, I.bload_disk);
    this.ldx(this.peek(ZP_MAIN.currdrive));
    this.lda(this.peek(ZP_MAIN.disk_id));
    this.poke(ZP_MAIN.numdrives + this.cpu.x, this.cpu.a);
    this.cmp(this.peek(ZP_MAIN.reqdisk));
    const inserted: boolean = this.zero();

    if (!inserted) {
      this.dec(ZP_MAIN.console_ypos);
      this.dec(ZP_MAIN.console_ypos);
    }

    return inserted;
  }


  private async printDiskName(): Promise<void> {
    const names: readonly [ number, IInlineData ][] = [
      [ 0x0D, I.ultima_disk ],
      [ 0x0C, I.britannia_disk ],
      [ 0x0E, I.town_disk ],
      [ 0x0D, I.dungeon_disk ],
    ];
    let index: number = 0;
    let printed: boolean = false;

    this.ldx(this.peek(ZP_MAIN.reqdisk));
    while (!printed && (index < names.length)) {
      if (this.dex() === 0) {
        this.ldy(this.peek(ZP_MAIN.console_ypos));
        this.ldx(names[index][0]);
        await this.callWith(J.j_primm_xy, names[index][1]);
        this.inc(ZP_MAIN.console_ypos);
        printed = true;
      } else {
        index = index + 1;
      }
    }
  }
}
