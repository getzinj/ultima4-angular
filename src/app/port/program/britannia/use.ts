// britannia/USE.s: using an item, ported. The bell, book and candle open the Abyss when used in
// order at its entrance; the horn scares off monsters, the wheel strengthens a ship, and the skull
// destroys whatever is about, at a price in virtue, unless it is cast into the Abyss. ULT4's
// cmd_use_item loads it at $8800.

import { DECIMAL } from '../../../lifted-runtime/cpu';
import type { LiftedMachine } from '../../../lifted-runtime/lifted-machine';
import { JUMP_SUBS, MAP_OBJECTS, PLACES, PRTY, ROST, TILES, ZP_MAIN } from '../../../state/symbols';
import { inline } from '../../inline-data';
import type { IInlineData } from '../../inline-data';
import type { Exit } from '../../routine';
import { OVERLAY_ENTRY, overlayModule, text } from '../overlay';
import { UseOverlay, handlerTable, useKeywordBytes } from '../use-overlay';

const J = JUMP_SUBS;
const O = MAP_OBJECTS;
const zp_inc_amount: number = 0xD9;
const zp_index: number = 0xEA;
const HORN_TURNS: number = 0x0A;

const USE_TABLES = {
  keyword_handlers: 0x8867,
  keywords: 0x8BA3,
} as const;

const HANDLERS = {
  use_stone: 0x8877,
  use_bell: 0x889B,
  use_book: 0x88DA,
  use_candle: 0x892B,
  use_key: 0x8986,
  use_horn: 0x8991,
  use_wheel: 0x89C6,
  use_skull: 0x8A1B,
} as const;

export const USE_INLINE = {
  which_item: text(0x8803, 'WHICH ITEM:\n'),
  not_usable: text(0x881B, '\nNOT USABLE ITEM!\n'),
  none_owned: text(0x8832, '\nNONE OWNED!\n'),
  no_effect: text(0x8844, '\nHMM...NO EFFECT!\n'),
  no_place: text(0x8882, '\nNO PLACE TO\nUSE THEM!\n'),
  bell: text(0x88BD, '\nTHE BELL RINGS\nON AND ON!\n'),
  book: text(0x8903, '\nTHE WORDS\nRESONATE WITH\nTHE RINGING!\n'),
  candle: text(0x8954, '\nAS YOU LIGHT THE\nCANDLE THE EARTH\nTREMBLES!\n'),
  horn: text(0x899C, '\nTHE HORN SOUNDS\nAN EERIE TONE!\n'),
  wheel: text(0x89E7, '\nONCE MOUNTED,\nTHE WHEEL GLOWS\nWITH A BLUE\nLIGHT!\n'),
  skull_aloft: text(0x8A32, '\nYOU HOLD THE\nEVIL SKULL OF\nMONDAIN THE\nWIZARD ALOFT....\n'),
  skull_cast: text(0x8AA5, '\nYOU CAST THE\nSKULL OF MONDAIN\nINTO THE ABYSS!\n'),
  lost_an_eighth: text(0x8C70, '\nTHOU HAST LOST\nAN EIGHTH!\n'),
} as const;

const I = USE_INLINE;

export const USE_DATA: readonly IInlineData[] = [
  ...Object.values(USE_INLINE),
  inline(USE_TABLES.keyword_handlers, handlerTable(HANDLERS)),
  inline(USE_TABLES.keywords, useKeywordBytes()),
];


export class Use extends UseOverlay {
  constructor(machine: LiftedMachine) {
    super(machine, { texts: I, keywordHandlers: USE_TABLES.keyword_handlers, keywords: USE_TABLES.keywords });
  }


  protected handlers(): ReadonlyMap<number, () => Promise<void>> {
    const H = HANDLERS;

    return new Map<number, () => Promise<void>>([
      [ H.use_stone, (): Promise<void> => this.useStone(I.no_place) ],
      [ H.use_bell, (): Promise<void> => this.useBell() ],
      [ H.use_book, (): Promise<void> => this.useAfter(ROST.item_have_book, ROST.item_used_bell, ROST.item_used_book, I.book) ],
      [ H.use_candle, (): Promise<void> => this.useAfter(ROST.item_have_candle, ROST.item_used_book, ROST.item_used_candle, I.candle) ],
      [ H.use_key, (): Promise<void> => this.useKey() ],
      [ H.use_horn, (): Promise<void> => this.useHorn() ],
      [ H.use_wheel, (): Promise<void> => this.useWheel() ],
      [ H.use_skull, (): Promise<void> => this.useSkull() ],
    ]);
  }


  /** `lda #xpos_abyss_entrance` / `cmp player_xpos` / `cmp player_ypos`: the entrance's x and y are the same. */
  private atAbyss(): boolean {
    let here: boolean = false;

    this.lda(PLACES.xpos_abyss_entrance);
    this.cmp(this.peek(PRTY.player_xpos));
    if (this.zero()) {
      this.cmp(this.peek(PRTY.player_ypos));
      here = this.zero();
    }

    return here;
  }


  private markUsed(used: number): void {
    this.poke(ROST.bell_book_candle, this.lda(this.peek(ROST.bell_book_candle) | used));
  }


  private async useBell(): Promise<void> {
    if (!this.owned(ROST.item_have_bell)) {
      await this.print(I.none_owned);
    } else if (this.atAbyss()) {
      this.markUsed(ROST.item_used_bell);
      await this.print(I.bell);
    } else {
      await this.print(I.no_effect);
    }
  }


  /** The book after the bell, the candle after the book; the candle shakes the earth. */
  private async useAfter(have: number, before: number, used: number, block: IInlineData): Promise<void> {
    if (!this.owned(have)) {
      await this.print(I.none_owned);
    } else if (this.atAbyss() && this.owned(before)) {
      this.markUsed(used);
      await this.print(block);
      if (used === ROST.item_used_candle) {
        await this.shakeScreen();
      }
    } else {
      await this.print(I.no_effect);
    }
  }


  private async useHorn(): Promise<void> {
    if (this.lda(this.peek(ROST.horn)) !== 0) {
      await this.print(I.horn);
      this.poke(ZP_MAIN.magic_aura, this.lda(ZP_MAIN.aura_horn));
      this.poke(ZP_MAIN.aura_duration, this.lda(HORN_TURNS));
    } else {
      await this.print(I.none_owned);
    }
  }


  /** The wheel goes only onto a ship whose hull is whole. */
  private async useWheel(): Promise<void> {
    let fits: boolean = false;

    if (this.lda(this.peek(ROST.wheel)) === 0) {
      await this.print(I.none_owned);
    } else {
      this.lda(this.peek(PRTY.player_transport));
      this.cmp(TILES.tile_ship_last);
      if (!this.carry()) {
        this.lda(this.peek(PRTY.ship_hull));
        this.cmp(PRTY.ship_hull_full);
        fits = this.zero();
      }
      if (fits) {
        this.poke(PRTY.ship_hull, this.lda(PRTY.ship_hull_with_wheel));
        await this.print(I.wheel);
      } else {
        await this.print(I.no_effect);
      }
    }
  }


  private async useSkull(): Promise<void> {
    if (!this.haveSkull()) {
      await this.print(I.none_owned);
    } else if (this.atAbyss()) {
      await this.castSkull();
    } else {
      await this.holdSkullAloft((): Promise<void> => this.clearMonsters());
    }
  }


  private async clearMonsters(): Promise<void> {
    this.ldx(O.object_mobs_max);
    this.lda(0x00);
    do {
      this.poke(O.object_tile_type + this.cpu.x, this.cpu.a);
      this.poke(O.object_tile_sprite + this.cpu.x, this.cpu.a);
    } while (this.dex() < 0x80);
    await this.m.call(J.j_update_view);
  }


  /** The skull into the Abyss: gone for good, and every virtue ten more. */
  private async castSkull(): Promise<void> {
    await this.print(I.skull_cast);
    this.poke(ROST.skull, this.lda(0xFF));
    this.poke(zp_index, this.lda(ROST.virtue_last - 1));
    do {
      this.ldy(this.peek(zp_index));
      this.lda(0x10);
      this.incVirtue();
    } while (this.dec(zp_index) < 0x80);
    await this.shakeAndInvert();
  }


  private incVirtue(): void {
    this.poke(zp_inc_amount, this.cpu.a);
    this.cpu.setFlag(DECIMAL, true);
    this.setCarry(false);
    if (this.lda(this.peek(ROST.party_stats + this.cpu.y)) !== 0) {
      this.cpu.adc(this.peek(zp_inc_amount));
      if (this.carry()) {
        this.lda(0x99);
      }
    }
    this.poke(ROST.party_stats + this.cpu.y, this.cpu.a);
    this.cpu.setFlag(DECIMAL, false);
  }
}


export const USE_MODULE = overlayModule('britannia', 'USE', OVERLAY_ENTRY, USE_DATA, (machine: LiftedMachine): Use => new Use(machine), (program: Use): Promise<Exit> => program.run());
