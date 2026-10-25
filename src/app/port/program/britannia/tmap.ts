// britannia/TMAP.s: the map a gem shows, ported. Each of the 32 x 32 tiles about the party is drawn
// as a 4 x 4-pixel pattern for its kind of terrain, and the party's cell flashes until a key is
// pressed. ULT4's do_view loads it at $9000.

import type { LiftedMachine } from '../../../lifted-runtime/lifted-machine';
import { PRTY, TABLES, VIEW_MAP, ZP_MAIN } from '../../../state/symbols';
import { inline } from '../../inline-data';
import type { IInlineData } from '../../inline-data';
import { PortProgram } from '../../port-program';
import type { Exit } from '../../routine';
import { overlayModule } from '../overlay';

const VIEW_MAX: number = 0x20;
const LINE_MIN: number = 0x08;
const LINE_MAX: number = 0xB8;
const COL_MAX: number = 0x16;
const LINE_OFFSET: number = 30;
const COLUMN_OFFSET: number = 20;
const BLACK_CELL: number = 13;

const TILE_PATTERN_TABLE: number = 0x9316;

export const TILE_PATTERNS: readonly number[] = [
  0x0C, 0x0B, 0x0A, 0x01, 0x01, 0x09, 0x02, 0x08, 0x07, 0x05, 0x05, 0x05, 0x05, 0x04, 0x04, 0x04,
  0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x04, 0x05, 0x04, 0x04, 0x05, 0x05, 0x06, 0x06, 0x05,
  0x06, 0x06, 0x06, 0x06, 0x06, 0x06, 0x06, 0x06, 0x06, 0x06, 0x06, 0x06, 0x06, 0x06, 0x06, 0x06,
  0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x05, 0x05, 0x07, 0x06, 0x06, 0x05, 0x00, 0x03, 0x04,
  0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x07, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03,
  0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05,
  0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04,
  0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x06, 0x00, 0x07,
];

export const TMAP_DATA: readonly IInlineData[] = [ inline(TILE_PATTERN_TABLE, TILE_PATTERNS) ];

/** The pixels each pattern sets, as `[00xx 00yy]` within the cell, in the order the original sets them. */
const P01: readonly number[] = [ 0x10, 0x31, 0x12, 0x33 ];
const P04: readonly number[] = [ 0x00, 0x10, 0x20, 0x30, 0x03, 0x13, 0x23, 0x33 ];
const P05: readonly number[] = [ 0x11, 0x12, 0x21, 0x22 ];
const P06: readonly number[] = [ ...P04, 0x01, 0x02, 0x31, 0x32 ];

const PATTERNS: readonly (readonly number[])[] = [
  [],
  P01,
  [ ...P01, 0x30, 0x11, 0x32, 0x13 ],
  [ 0x00, 0x01, 0x02, 0x03, 0x20, 0x21, 0x22, 0x23 ],
  P04,
  P05,
  P06,
  [ ...P05, ...P06 ],
  [ 0x00, 0x01, 0x10, 0x11, 0x22, 0x23, 0x32, 0x33 ],
  [ 0x10, 0x11, 0x12, 0x30, 0x32, 0x33 ],
  [ 0x00, 0x02, 0x21, 0x23 ],
  [ 0x00, 0x22 ],
];

const PATTERN_05: number = 5;
const PATTERN_0C: number = 12;

/** flash_location: every pixel of the cell. */
const WHOLE_CELL: readonly number[] = [
  0x00, 0x01, 0x02, 0x03, 0x10, 0x11, 0x12, 0x13, 0x20, 0x21, 0x22, 0x23, 0x30, 0x31, 0x32, 0x33,
];


export class Tmap extends PortProgram {
  constructor(machine: LiftedMachine, private readonly patternTable: number = TILE_PATTERN_TABLE) {
    super(machine);
  }


  public async run(): Promise<Exit> {
    let key: number = 0;

    this.clearView();
    this.lda(0x00);
    this.poke(ZP_MAIN.temp_x, this.cpu.a);
    this.poke(ZP_MAIN.temp_y, this.cpu.a);
    while (this.peek(ZP_MAIN.temp_x) < VIEW_MAX) {
      while (this.peek(ZP_MAIN.temp_y) < VIEW_MAX) {
        this.drawTile();
        this.inc(ZP_MAIN.temp_y);
        this.lda(this.peek(ZP_MAIN.temp_y));
        this.cmp(VIEW_MAX);
      }
      this.poke(ZP_MAIN.temp_y, this.lda(0x00));
      this.inc(ZP_MAIN.temp_x);
      this.lda(this.peek(ZP_MAIN.temp_x));
      this.cmp(VIEW_MAX);
    }
    if (this.lda(this.peek(PRTY.current_location)) === 0) {
      this.poke(ZP_MAIN.temp_x, this.lda(this.peek(PRTY.tile_xpos)));
      this.poke(ZP_MAIN.temp_y, this.lda(this.peek(PRTY.tile_ypos)));
    } else {
      this.poke(ZP_MAIN.temp_x, this.lda(this.peek(PRTY.player_xpos)));
      this.poke(ZP_MAIN.temp_y, this.lda(this.peek(PRTY.player_ypos)));
    }
    while (key < 0x80) {
      this.flashLocation();
      key = this.lda(await this.m.readKeyboard());
    }
    this.cpu.bit(await this.m.clearKeyboardStrobe());

    return null;
  }


  /** The pattern for the tile at (temp_x, temp_y): `ldy tile_pattern_table,x` and a `dey` / `bne` for each. */
  private drawTile(): void {
    this.getAtXy();
    if (this.negative()) {
      this.pattern(PATTERN_05);
    } else {
      let index: number = 0;

      this.ldx(this.cpu.a);
      this.ldy(this.peek(this.patternTable + this.cpu.x));
      while (!this.zero() && (index < BLACK_CELL - 1)) {
        this.dey();
        index++;
      }
      if (this.zero()) {
        this.pattern(index);
      }
    }
  }


  private pattern(index: number): void {
    if (index === PATTERN_0C) {
      this.lda(this.peek(ZP_MAIN.temp_x));
      this.cpu.a = this.cpu.lsr(this.cpu.a);
      this.setBit(this.carry() ? 0x22 : 0x20);
    } else {
      for (const pixel of PATTERNS[index]) {
        this.setBit(pixel);
      }
    }
  }


  private clearView(): void {
    this.ldx(LINE_MIN);
    do {
      this.poke(ZP_MAIN.ptr1, this.lda(this.peek(TABLES.bmplineaddr_lo + this.cpu.x)));
      this.poke(ZP_MAIN.ptr1 + 1, this.lda(this.peek(TABLES.bmplineaddr_hi + this.cpu.x)));
      this.ldy(COL_MAX);
      this.lda(0x00);
      do {
        this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.cpu.a);
      } while (this.dey() !== 0);
      this.inx();
      this.cpu.compare(this.cpu.x, LINE_MAX);
    } while (!this.carry());
  }


  /** The tile at (temp_x, temp_y) in view_buf, in A: in Britannia four 16 x 16 chunks, elsewhere one 32 x 32 map. */
  private getAtXy(): void {
    const ptr2: number = ZP_MAIN.ptr2;

    if (this.lda(this.peek(PRTY.current_location)) === 0) {
      this.lda(this.peek(ZP_MAIN.temp_y));
      this.poke(ptr2, this.lda(this.cpu.asl(this.cpu.asl(this.cpu.asl(this.cpu.asl(this.cpu.a))))));
      this.lda(this.peek(ZP_MAIN.temp_x) & 0x0F);
      this.poke(ptr2, this.lda(this.cpu.a | this.peek(ptr2)));
      this.lda(this.peek(ZP_MAIN.temp_y) & 0x10);
      this.lda(this.cpu.asl(this.cpu.a) | this.peek(ZP_MAIN.temp_x));
      this.lda(this.cpu.lsr(this.cpu.lsr(this.cpu.lsr(this.cpu.lsr(this.cpu.a)))));
      this.poke(ptr2 + 1, this.add(VIEW_MAP.view_buf >> 8));
    } else {
      this.poke(ptr2 + 1, this.lda(this.peek(ZP_MAIN.temp_y)));
      this.lda(0x00);
      for (let shift: number = 0; shift < 3; shift++) {
        this.poke(ptr2 + 1, this.cpu.lsr(this.peek(ptr2 + 1)));
        this.cpu.a = this.cpu.ror(this.cpu.a);
      }
      this.cpu.adc(this.peek(ZP_MAIN.temp_x));
      this.poke(ptr2, this.cpu.a);
      this.lda(this.peek(ptr2 + 1));
      this.poke(ptr2 + 1, this.add(VIEW_MAP.view_buf >> 8));
    }
    this.ldy(0x00);
    this.lda(this.peek(this.pointer(ptr2) + this.cpu.y));
  }


  /** A pixel of the cell for (temp_x, temp_y): which byte of which line, and its bit in A. */
  private cellPixel(pixel: number): number {
    this.cpu.push(pixel);
    this.lda(pixel & 0x0F);
    this.poke(ZP_MAIN.delta_y, this.cpu.a);
    this.lda(this.cpu.pull());
    this.poke(ZP_MAIN.delta_x, this.div16(this.cpu.a));
    this.lda(this.peek(ZP_MAIN.temp_x));
    this.cpu.a = this.cpu.asl(this.cpu.asl(this.cpu.a));
    this.cpu.adc(this.peek(ZP_MAIN.delta_x));
    this.poke(ZP_MAIN.temp2_x, this.cpu.a);
    this.lda(this.peek(ZP_MAIN.temp_y));
    this.cpu.a = this.cpu.asl(this.cpu.asl(this.cpu.a));
    this.cpu.adc(this.peek(ZP_MAIN.delta_y));
    this.poke(ZP_MAIN.temp2_y, this.cpu.a);
    this.ldy(this.peek(ZP_MAIN.temp2_y));
    this.poke(ZP_MAIN.ptr1, this.lda(this.peek(TABLES.bmplineaddr_lo + LINE_OFFSET + this.cpu.y)));
    this.poke(ZP_MAIN.ptr1 + 1, this.lda(this.peek(TABLES.bmplineaddr_hi + LINE_OFFSET + this.cpu.y)));
    this.ldx(this.peek(ZP_MAIN.temp2_x));
    this.ldy(this.peek(TABLES.bmpcol_byte + COLUMN_OFFSET + this.cpu.x));
    this.lda(this.peek(TABLES.bmpcol_bit + COLUMN_OFFSET + this.cpu.x));

    return this.pointer(ZP_MAIN.ptr1) + this.cpu.y;
  }


  private setBit(pixel: number): void {
    this.lda(pixel);
    const address: number = this.cellPixel(pixel);

    this.lda(this.cpu.a | this.peek(address));
    this.poke(address, this.lda(this.cpu.a & 0x7F));
  }


  protected flashLocation(): void {
    for (const pixel of WHOLE_CELL) {
      this.lda(pixel);
      const address: number = this.cellPixel(pixel);

      this.poke(address, this.lda(this.cpu.a ^ this.peek(address)));
    }
  }
}


export const TMAP_MODULE = overlayModule('britannia', 'TMAP', VIEW_MAP.j_viewmap, TMAP_DATA, (machine: LiftedMachine): Tmap => new Tmap(machine), (program: Tmap): Promise<Exit> => program.run());
