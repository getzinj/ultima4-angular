// underworld/TMAP.s: the map a gem shows in a dungeon, ported. From the party's cell, marked with a
// diamond, the level is explored breadth first (the remaster's fix of the original's depth-first
// stack, which ran out sooner), each cell reached drawn as a character for its tile and walls not
// explored past, the level wrapping round within the 22 x 22 cells of the view; then a key is
// waited for. ULT4's do_view loads it at $9000.

import type { LiftedMachine } from '../../../lifted-runtime/lifted-machine';
import { CHAR, DUNGEON, JUMP_SUBS, PRTY, TABLES, VIEW_MAP, ZP_MAIN } from '../../../state/symbols';
import { inline } from '../../inline-data';
import type { IInlineData } from '../../inline-data';
import { PortProgram } from '../../port-program';
import type { Exit } from '../../routine';
import { overlayModule } from '../overlay';

const J = JUMP_SUBS;
const CELL_MAX: number = 0x17;
const LINE_MIN: number = 0x08;
const LINE_MAX: number = 0xB8;
const CENTER_CELL: number = 0x0B;
/** `($100 - xy_center_cell) .MOD 8`: the view's offset onto the level's eight columns and rows. */
const BASE_OFFSET: number = 0x05;
const BLANK_BYTE: number = 0x80;

const TMAP_TABLES = {
  tile_chars: 0x916E,
  row_offset_hi: 0x918D,
  row_offset_lo: 0x91A4,
  explore_head: 0x91BB,
  explore_tail: 0x91BC,
  view_offset_x: 0x91BD,
  view_offset_y: 0x91BE,
  neighbor_x: 0x91BF,
  neighbor_y: 0x91C0,
  dungeon_x: 0x91C1,
  dungeon_y: 0x91C2,
  saved_console_xpos: 0x91C3,
  saved_console_ypos: 0x91C4,
} as const;

const T = TMAP_TABLES;

/** The character for each kind of dungeon tile, by its high nibble. */
const TILE_CHARS: readonly number[] = [
  0x20, 0x18, 0x19, 0x1A, 0x24, 0x20, 0x20, 0x1B, 0xD4, 0xC6, 0xDE, 0x60, 0x0E, 0x0E, 0x0F, 0x40,
];

/** Each row of the 22 x 22 cells' visited marks in visited_buffer, from row 0. */
const ROW_OFFSET_HI: readonly number[] = [
  0x92, 0x92, 0x92, 0x92, 0x92, 0x92, 0x92, 0x92, 0x92, 0x92, 0x92, 0x92, 0x93, 0x93, 0x93, 0x93, 0x93, 0x93, 0x93, 0x93, 0x93, 0x93, 0x93,
];

const ROW_OFFSET_LO: readonly number[] = [
  0x00, 0x16, 0x2C, 0x42, 0x58, 0x6E, 0x84, 0x9A, 0xB0, 0xC6, 0xDC, 0xF2, 0x08, 0x1E, 0x34, 0x4A, 0x60, 0x76, 0x8C, 0xA2, 0xB8, 0xCE, 0xE4,
];

export const UNDERWORLD_TMAP_DATA: readonly IInlineData[] = [
  inline(T.tile_chars, TILE_CHARS),
  inline(T.row_offset_hi, ROW_OFFSET_HI),
  inline(T.row_offset_lo, ROW_OFFSET_LO),
];


export class UnderworldTmap extends PortProgram {
  constructor(machine: LiftedMachine) {
    super(machine);
  }


  public async run(): Promise<Exit> {
    let key: number = 0;

    this.poke(T.saved_console_xpos, this.lda(this.peek(ZP_MAIN.console_xpos)));
    this.poke(T.saved_console_ypos, this.lda(this.peek(ZP_MAIN.console_ypos)));
    this.clearView();
    this.ldx(0x00);
    this.lda(this.cpu.x);
    do {
      this.poke(VIEW_MAP.visited_buffer + this.cpu.x, this.cpu.a);
      this.poke(VIEW_MAP.visited_buffer + 0x100 + this.cpu.x, this.cpu.a);
    } while (this.inx() !== 0);
    this.lda(0x00);
    this.poke(T.explore_head, this.cpu.a);
    this.poke(T.explore_tail, this.cpu.a);
    this.setCarry(false);
    this.lda(this.peek(PRTY.player_xpos));
    this.cpu.adc(BASE_OFFSET);
    this.poke(T.view_offset_x, this.cpu.a);
    this.lda(this.peek(PRTY.player_ypos));
    this.cpu.adc(BASE_OFFSET);
    this.poke(T.view_offset_y, this.cpu.a);
    await this.markParty();
    this.dec(ZP_MAIN.console_xpos);
    await this.explore();
    await this.markParty();
    this.poke(ZP_MAIN.console_xpos, this.lda(this.peek(T.saved_console_xpos)));
    this.poke(ZP_MAIN.console_ypos, this.lda(this.peek(T.saved_console_ypos)));
    while (key < 0x80) {
      key = this.lda(await this.m.readKeyboard());
    }
    this.cpu.bit(await this.m.clearKeyboardStrobe());

    return null;
  }


  private async markParty(): Promise<void> {
    this.lda(CENTER_CELL);
    this.poke(ZP_MAIN.console_xpos, this.cpu.a);
    this.poke(ZP_MAIN.console_ypos, this.cpu.a);
    this.lda(CHAR.glyph_diamond);
    await this.m.call(J.j_console_out);
  }


  /** The eight neighbours of each cell in turn, from the party's, until none is left to explore. */
  private async explore(): Promise<void> {
    let more: boolean = true;

    while (more) {
      this.lda(0xFF);
      this.poke(T.neighbor_x, this.cpu.a);
      this.poke(T.neighbor_y, this.cpu.a);
      do {
        do {
          if ((this.lda(this.peek(T.neighbor_x)) !== 0) || (this.lda(this.peek(T.neighbor_y)) !== 0)) {
            await this.neighbor();
          }
          this.inc(T.neighbor_x);
          this.lda(this.peek(T.neighbor_x));
          this.cmp(0x02);
        } while (!this.carry());
        this.poke(T.neighbor_x, this.lda(0xFF));
        this.inc(T.neighbor_y);
        this.lda(this.peek(T.neighbor_y));
        this.cmp(0x02);
      } while (!this.carry());
      more = this.popExplore();
    }
  }


  /** The neighbour's place on the level, wrapping round its eight columns and rows, and the cell explored. */
  private async neighbor(): Promise<void> {
    this.setCarry(false);
    this.lda(this.peek(ZP_MAIN.console_xpos));
    this.cpu.adc(this.peek(T.view_offset_x));
    this.cpu.adc(this.peek(T.neighbor_x));
    this.poke(T.dungeon_x, this.lda(this.cpu.a & 0x07));
    this.setCarry(false);
    this.lda(this.peek(ZP_MAIN.console_ypos));
    this.cpu.adc(this.peek(T.view_offset_y));
    this.cpu.adc(this.peek(T.neighbor_y));
    this.poke(T.dungeon_y, this.lda(this.cpu.a & 0x07));
    await this.exploreCell();
  }


  private clearView(): void {
    this.ldx(LINE_MIN);
    do {
      this.poke(ZP_MAIN.ptr1, this.lda(this.peek(TABLES.bmplineaddr_lo + this.cpu.x)));
      this.poke(ZP_MAIN.ptr1 + 1, this.lda(this.peek(TABLES.bmplineaddr_hi + this.cpu.x)));
      this.ldy(CELL_MAX - 1);
      this.lda(BLANK_BYTE);
      do {
        this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.cpu.a);
      } while (this.dey() !== 0);
      this.inx();
      this.cpu.compare(this.cpu.x, LINE_MAX);
    } while (!this.carry());
  }


  /** The cell at the console's place queued to be explored from. */
  private pushExplore(): void {
    this.ldx(this.peek(T.explore_tail));
    this.poke(VIEW_MAP.explore_buffer + this.cpu.x, this.lda(this.peek(ZP_MAIN.console_xpos)));
    this.inx();
    this.poke(VIEW_MAP.explore_buffer + this.cpu.x, this.lda(this.peek(ZP_MAIN.console_ypos)));
    this.inx();
    this.poke(T.explore_tail, this.cpu.x);
  }


  /** The next cell queued, at the console's place; false (Z set) if none is. */
  private popExplore(): boolean {
    let popped: boolean = false;

    this.ldx(this.peek(T.explore_head));
    this.cpu.compare(this.cpu.x, this.peek(T.explore_tail));
    if (!this.zero()) {
      this.poke(ZP_MAIN.console_xpos, this.lda(this.peek(VIEW_MAP.explore_buffer + this.cpu.x)));
      this.inx();
      this.poke(ZP_MAIN.console_ypos, this.lda(this.peek(VIEW_MAP.explore_buffer + this.cpu.x)));
      this.inx();
      this.poke(T.explore_head, this.cpu.x);
      this.lda(0xFF);
      popped = true;
    }

    return popped;
  }


  /** get_dng_tile: the tile at (dungeon_x, dungeon_y) on the party's level, four levels a page of view_buf. */
  private getDngTile(): void {
    this.lda(this.peek(PRTY.dungeon_level));
    this.cpu.a = this.cpu.lsr(this.cpu.lsr(this.cpu.a));
    this.poke(ZP_MAIN.ptr2 + 1, this.add(VIEW_MAP.view_buf >> 8));
    this.lda(this.peek(PRTY.dungeon_level) & 0x03);
    this.cpu.a = this.cpu.asl(this.cpu.asl(this.cpu.asl(this.cpu.a)));
    this.lda(this.cpu.a | this.peek(T.dungeon_y));
    this.cpu.a = this.cpu.asl(this.cpu.asl(this.cpu.asl(this.cpu.a)));
    this.poke(ZP_MAIN.ptr2, this.lda(this.cpu.a | this.peek(T.dungeon_x)));
    this.ldy(0x00);
    this.lda(this.peek(this.pointer(ZP_MAIN.ptr2) + this.cpu.y));
  }


  /** A neighbour within the view not yet visited: marked, drawn, and queued unless it is a wall. */
  private async exploreCell(): Promise<void> {
    this.setCarry(false);
    this.lda(this.peek(ZP_MAIN.console_xpos));
    this.cpu.adc(this.peek(T.neighbor_x));
    this.poke(ZP_MAIN.console_xpos, this.cpu.a);
    this.setCarry(false);
    this.lda(this.peek(ZP_MAIN.console_ypos));
    this.cpu.adc(this.peek(T.neighbor_y));
    this.poke(ZP_MAIN.console_ypos, this.cpu.a);
    if (this.withinView()) {
      this.getVisitedPtr();
      if (this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y)) === 0) {
        this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.lda(0xFF));
        this.getDngTile();
        this.cpu.push(this.cpu.a);
        await this.plotChar();
        this.lda(this.cpu.pull());
        this.cmp(DUNGEON.dng_tile_wall);
        if (!this.zero()) {
          this.pushExplore();
        }
      }
    }
    this.setCarry(true);
    this.lda(this.peek(ZP_MAIN.console_xpos));
    this.cpu.sbc(this.peek(T.neighbor_x));
    this.poke(ZP_MAIN.console_xpos, this.cpu.a);
    this.setCarry(true);
    this.lda(this.peek(ZP_MAIN.console_ypos));
    this.cpu.sbc(this.peek(T.neighbor_y));
    this.poke(ZP_MAIN.console_ypos, this.cpu.a);
  }


  /** Columns and rows 1 to 22, the view's cells. */
  private withinView(): boolean {
    let within: boolean = false;

    if (this.lda(this.peek(ZP_MAIN.console_xpos)) !== 0) {
      this.cmp(CELL_MAX);
      if (!this.carry() && (this.lda(this.peek(ZP_MAIN.console_ypos)) !== 0)) {
        this.cmp(CELL_MAX);
        within = !this.carry();
      }
    }

    return within;
  }


  private async plotChar(): Promise<void> {
    this.ldx(this.div16(this.cpu.a));
    this.lda(this.peek(T.tile_chars + this.cpu.x));
    await this.m.call(J.j_console_out);
    this.dec(ZP_MAIN.console_xpos);
  }


  /** get_visited_ptr: `(ptr1),y` the console's cell in the visited marks. */
  private getVisitedPtr(): void {
    this.ldx(this.peek(ZP_MAIN.console_ypos));
    this.poke(ZP_MAIN.ptr1 + 1, this.lda(this.peek(T.row_offset_hi + this.cpu.x)));
    this.poke(ZP_MAIN.ptr1, this.lda(this.peek(T.row_offset_lo + this.cpu.x)));
    this.ldy(this.peek(ZP_MAIN.console_xpos));
  }
}


export const UNDERWORLD_TMAP_MODULE = overlayModule('underworld', 'TMAP', VIEW_MAP.j_viewmap, UNDERWORLD_TMAP_DATA, (machine: LiftedMachine): UnderworldTmap => new UnderworldTmap(machine),
  (program: UnderworldTmap): Promise<Exit> => program.run());
