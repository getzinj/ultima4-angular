// towne/SEAR.s: searching a towne, ported. Thirteen places hold something: the eight runes, the
// book and the candle, Lycaeum's telescope, which shows any towne's map, and for an Avatar the
// mystic armour and weapons. ULT4's cmd_search loads it at $8800.

import type { LiftedMachine } from '../../../lifted-runtime/lifted-machine';
import { CHAR, JUMP_SUBS, PRTY, ROST, STRINGS, VIEW_MAP } from '../../../state/symbols';
import { inline } from '../../inline-data';
import type { IInlineData } from '../../inline-data';
import type { Exit } from '../../routine';
import { OVERLAY_ENTRY, overlayModule, text } from '../overlay';
import { SearchOverlay } from '../search-overlay';

const J = JUMP_SUBS;
const zp_index: number = 0xD8;
const ITEM_RUNES: number = 0x08;
const ITEM_CANDLE: number = 0x09;
const ITEM_TELESCOPE: number = 0x0A;
const ITEM_ARMOUR: number = 0x0B;
const MYSTIC: number = 0x08;

const SEAR_TABLES = {
  bit_msb: 0x8A3A,
  item_xpos: 0x8A5D,
  item_ypos: 0x8A6A,
  item_location: 0x8A77,
} as const;

const SEAR_VARIABLES = {
  /** find_telescope: the map's letter, patched into its BLOAD. */
  file_char_map: 0x893B,
} as const;

const ITEM_X: readonly number[] = [ 0x08, 0x19, 0x1E, 0x0D, 0x1C, 0x02, 0x11, 0x1D, 0x06, 0x16, 0x16, 0x16, 0x08 ];
const ITEM_Y: readonly number[] = [ 0x06, 0x01, 0x1E, 0x06, 0x1E, 0x1D, 0x08, 0x1D, 0x06, 0x01, 0x03, 0x04, 0x0F ];
const ITEM_LOCATION: readonly number[] = [ 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x01, 0x0D, 0x02, 0x10, 0x02, 0x03, 0x04 ];

export const TOWNE_SEAR_INLINE = {
  nothing_here: text(0x880D, 'NOTHING HERE!\n'),
  rune_of: text(0x8851, 'THE RUNE OF\n'),
  rune_end: text(0x8869, '!\n'),
  book: text(0x888A, 'THE BOOK\nOF TRUTH!\n'),
  candle: text(0x88BC, 'THE CANDLE\nOF LOVE!\n'),
  telescope: text(0x88DA, 'YOU SEE A KNOB\nON THE TELESCOPE\nMARKED A-P\nYOU SELECT:'),
  bload_map: text(0x8931, '\u0004BLOAD MAP@,A$8B00\n'),
  bload_tmap: text(0x894B, '\u0004BLOAD TMAP,A$9000\n'),
  bload_mapb: text(0x896D, '\u0004BLOAD MAPB,A$8B00\n'),
  mystic_armour: text(0x89C2, 'MYSTIC ARMOUR!\n'),
  mystic_weapons: text(0x89FC, 'MYSTIC WEAPONS!\n'),
  you_find: text(0x8A1B, 'YOU FIND...\n'),
} as const;

const I = TOWNE_SEAR_INLINE;

export const TOWNE_SEAR_DATA: readonly IInlineData[] = [
  ...Object.values(TOWNE_SEAR_INLINE),
  inline(SEAR_TABLES.bit_msb, [ 0x80, 0x40, 0x20, 0x10, 0x08, 0x04, 0x02, 0x01 ]),
  inline(SEAR_TABLES.item_xpos, ITEM_X),
  inline(SEAR_TABLES.item_ypos, ITEM_Y),
  inline(SEAR_TABLES.item_location, ITEM_LOCATION),
];


export class TowneSear extends SearchOverlay {
  public async run(): Promise<Exit> {
    let found: boolean = false;

    this.ldy(ITEM_LOCATION.length - 1);
    while (!found && !this.negative()) {
      this.comparePosition();
      found = this.zero();
      if (!found) {
        this.dey();
      }
    }
    if (found) {
      await this.itemAtCoordinate();
    } else {
      await this.nothingHere();
    }

    return null;
  }


  private nothingHere(): Promise<void> {
    return this.print(I.nothing_here);
  }


  private async itemAtCoordinate(): Promise<void> {
    this.cpu.compare(this.cpu.y, ITEM_RUNES);
    if (!this.carry()) {
      await this.findRune();
    } else if (this.zero()) {
      await this.findBellBookCandle(ROST.item_have_book, I.book);
    } else {
      this.cpu.compare(this.cpu.y, ITEM_CANDLE);
      if (this.zero()) {
        await this.findBellBookCandle(ROST.item_have_candle, I.candle);
      } else {
        this.cpu.compare(this.cpu.y, ITEM_TELESCOPE);
        if (this.zero()) {
          await this.findTelescope();
        } else {
          this.cpu.compare(this.cpu.y, ITEM_ARMOUR);
          if (this.zero()) {
            await this.findMystic(ROST.armour_mystic, I.mystic_armour);
          } else {
            await this.findMystic(ROST.weapon_mystic, I.mystic_weapons);
          }
        }
      }
    }
  }


  private async findRune(): Promise<void> {
    if (this.lda(this.peek(SEAR_TABLES.bit_msb + this.cpu.y) & this.peek(ROST.runes)) !== 0) {
      await this.nothingHere();
    } else {
      this.poke(ROST.runes, this.lda(this.peek(ROST.runes) | this.peek(SEAR_TABLES.bit_msb + this.cpu.y)));
      this.poke(zp_index, this.cpu.y);
      await this.youFind(I.you_find);
      await this.print(I.rune_of);
      this.lda(this.peek(zp_index));
      this.add(STRINGS.string_virtues);
      await this.m.call(J.j_printstring);
      await this.print(I.rune_end);
      this.lda(0x01);
      await this.addXp100();
    }
  }


  private async findBellBookCandle(item: number, block: IInlineData): Promise<void> {
    if (this.lda(this.peek(ROST.bell_book_candle) & item) === 0) {
      this.poke(ROST.bell_book_candle, this.lda(this.peek(ROST.bell_book_candle) | item));
      await this.youFind(I.you_find);
      await this.print(block);
      this.lda(0x04);
      await this.addXp100();
    } else {
      await this.nothingHere();
    }
  }


  /** A towne's map, A to P, drawn by TMAP with the game suspended, and the towne's own put back. */
  private async findTelescope(): Promise<void> {
    await this.print(I.telescope);
    do {
      await this.m.call(J.j_waitkey);
    } while (this.zero());
    this.cpu.push(this.cpu.a);
    await this.m.call(J.j_console_out);
    this.lda(CHAR.char_enter);
    await this.m.call(J.j_console_out);
    this.lda(this.cpu.pull());
    let letter: boolean = false;

    this.cmp(CHAR.char_A);
    if (this.carry()) {
      this.cmp(CHAR.char_P + 1);
      letter = !this.carry();
    }
    if (letter) {
      this.poke(SEAR_VARIABLES.file_char_map, this.cpu.a);
      await this.callWith(J.j_primm_cout, I.bload_map);
      this.copyMap();
      await this.callWith(J.j_primm_cout, I.bload_tmap);
      this.poke(PRTY.game_mode, this.lda(PRTY.mode_suspended));
      await this.m.call(VIEW_MAP.j_viewmap);
      this.poke(PRTY.game_mode, this.lda(PRTY.mode_towne));
      await this.callWith(J.j_primm_cout, I.bload_mapb);
      this.copyMap();
    } else {
      await this.nothingHere();
    }
  }


  /** load_buf's four pages into view_buf. */
  private copyMap(): void {
    this.ldx(0x00);
    do {
      for (let page: number = 0; page < 4; page++) {
        this.poke(VIEW_MAP.view_buf + (page * 0x100) + this.cpu.x, this.lda(this.peek(VIEW_MAP.load_buf + (page * 0x100) + this.cpu.x)));
      }
    } while (this.inx() !== 0);
  }


  /** Only an Avatar, every virtue spent to nothing, finds the mystic arms, and only once. */
  private async findMystic(item: number, block: IInlineData): Promise<void> {
    this.ldx(ROST.virtue_last - 1);
    this.lda(0x00);
    do {
      this.lda(this.cpu.a | this.peek(ROST.party_stats + this.cpu.x));
    } while (this.dex() < 0x80);
    this.cmp(0x00);
    if (this.zero() && (this.lda(this.peek(item)) === 0)) {
      await this.youFind(I.you_find);
      await this.print(block);
      this.poke(item, this.lda(MYSTIC));
      this.lda(0x04);
      await this.addXp100();
    } else {
      await this.nothingHere();
    }
  }


  private comparePosition(): void {
    let here: boolean = false;

    this.lda(this.peek(PRTY.player_xpos));
    this.cmp(this.peek(SEAR_TABLES.item_xpos + this.cpu.y));
    if (this.zero()) {
      this.lda(this.peek(PRTY.player_ypos));
      this.cmp(this.peek(SEAR_TABLES.item_ypos + this.cpu.y));
      if (this.zero()) {
        this.lda(this.peek(PRTY.current_location));
        this.cmp(this.peek(SEAR_TABLES.item_location + this.cpu.y));
        here = this.zero();
      }
    }
    this.lda(here ? 0x00 : 0xFF);
  }
}


export const TOWNE_SEAR_MODULE = overlayModule('towne', 'SEAR', OVERLAY_ENTRY, TOWNE_SEAR_DATA, (machine: LiftedMachine): TowneSear => new TowneSear(machine),
  (program: TowneSear): Promise<Exit> => program.run());
