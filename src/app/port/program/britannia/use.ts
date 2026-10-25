// britannia/USE.s: using an item, ported. The bell, book and candle open the Abyss when used in
// order at its entrance; the horn scares off monsters, the wheel strengthens a ship, and the skull
// destroys whatever is about, at a price in virtue, unless it is cast into the Abyss. ULT4's
// cmd_use_item loads it at $8800.

import { DECIMAL } from '../../../lifted-runtime/cpu';
import type { LiftedMachine } from '../../../lifted-runtime/lifted-machine';
import { APPLE, CHAR, JUMP_SUBS, MAP_OBJECTS, PLACES, PRTY, ROST, SOUND, TABLES, TILES, ZP_MAIN } from '../../../state/symbols';
import { inline } from '../../inline-data';
import type { IInlineData } from '../../inline-data';
import { PortProgram } from '../../port-program';
import type { Exit } from '../../routine';
import { encode } from '../../text';
import { OVERLAY_ENTRY, overlayModule, text } from './overlay';

const J = JUMP_SUBS;
const O = MAP_OBJECTS;
const zp_save_reg: number = 0xD9;
const zp_inc_amount: number = 0xD9;
const zp_dec_amount: number = 0xDA;
const zp_index: number = 0xEA;
const zp_input_index: number = 0xEA;
const INPUT_LENGTH: number = 0x0F;
const KEYWORD_LENGTH: number = 4;
const PADDED_LENGTH: number = 6;
const COPY_BYTES: number = 0x16;
const SHAKE_LINES: number = 0xAE;
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

const KEYWORDS: readonly string[] = [ 'STON', 'BELL', 'BOOK', 'CAND', 'KEY ', 'HORN', 'WHEE', 'SKUL' ];

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
  inline(USE_TABLES.keyword_handlers, Object.values(HANDLERS).flatMap((address: number): number[] => [ address & 0xFF, address >> 8 ])),
  inline(USE_TABLES.keywords, KEYWORDS.flatMap((keyword: string): number[] => encode(keyword))),
];


export class UseError extends Error {
}


export class Use extends PortProgram {
  public async run(): Promise<Exit> {
    await this.print(I.which_item);
    await this.getInput();
    this.compareKeywords();
    if (!this.negative()) {
      this.cpu.a = this.cpu.asl(this.cpu.a);
      this.ldy(this.cpu.a);
      this.poke(ZP_MAIN.ptr1, this.lda(this.peek(USE_TABLES.keyword_handlers + this.cpu.y)));
      this.poke(ZP_MAIN.ptr1 + 1, this.lda(this.peek(USE_TABLES.keyword_handlers + 1 + this.cpu.y)));
      await this.use(this.pointer(ZP_MAIN.ptr1));
    } else {
      await this.print(I.not_usable);
    }

    return null;
  }


  private print(block: IInlineData): Promise<void> {
    return this.callWith(J.j_primm, block);
  }


  private async use(handler: number): Promise<void> {
    const H = HANDLERS;
    const uses: ReadonlyMap<number, () => Promise<void>> = new Map<number, () => Promise<void>>([
      [ H.use_stone, (): Promise<void> => this.useStone() ],
      [ H.use_bell, (): Promise<void> => this.useBell() ],
      [ H.use_book, (): Promise<void> => this.useAfter(ROST.item_have_book, ROST.item_used_bell, ROST.item_used_book, I.book) ],
      [ H.use_candle, (): Promise<void> => this.useAfter(ROST.item_have_candle, ROST.item_used_book, ROST.item_used_candle, I.candle) ],
      [ H.use_key, (): Promise<void> => this.useKey() ],
      [ H.use_horn, (): Promise<void> => this.useHorn() ],
      [ H.use_wheel, (): Promise<void> => this.useWheel() ],
      [ H.use_skull, (): Promise<void> => this.useSkull() ],
    ]);
    const body: (() => Promise<void>) | undefined = uses.get(handler);

    if (body == null) {
      throw new UseError(`keyword_handlers points at $${ handler.toString(16) }`);
    } else {
      await body();
    }
  }


  private async useStone(): Promise<void> {
    if (this.lda(this.peek(ROST.stones)) !== 0) {
      await this.print(I.no_place);
    } else {
      await this.print(I.none_owned);
    }
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


  private owned(item: number): boolean {
    return this.lda(this.peek(ROST.bell_book_candle) & item) !== 0;
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


  private async useKey(): Promise<void> {
    if (this.lda(this.peek(ROST.threepartkey)) !== 0) {
      await this.print(I.no_effect);
    } else {
      await this.print(I.none_owned);
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
    this.lda(this.peek(ROST.skull));
    this.cmp(0x01);
    if (!this.zero()) {
      await this.print(I.none_owned);
    } else if (this.atAbyss()) {
      await this.castSkull();
    } else {
      await this.holdSkullAloft();
    }
  }


  private async shakeAndInvert(): Promise<void> {
    await this.shakeScreen();
    await this.m.call(J.j_invertview);
    await this.shakeScreen();
    await this.m.call(J.j_invertview);
    await this.shakeScreen();
  }


  /** Everything about is destroyed, in combat the foes and otherwise the monsters on the map, and every virtue costs five. */
  private async holdSkullAloft(): Promise<void> {
    await this.print(I.skull_aloft);
    await this.shakeAndInvert();
    if (this.lda(this.peek(PRTY.game_mode)) >= 0x80) {
      await this.skullInCombat();
    } else {
      this.ldx(O.object_mobs_max);
      this.lda(0x00);
      do {
        this.poke(O.object_tile_type + this.cpu.x, this.cpu.a);
        this.poke(O.object_tile_sprite + this.cpu.x, this.cpu.a);
      } while (this.dex() < 0x80);
      await this.m.call(J.j_update_view);
    }
    await this.skullPenalty();
  }


  private async skullInCombat(): Promise<void> {
    this.ldx(O.foes_max);
    do {
      let kill: boolean = false;

      if (this.lda(this.peek(O.combat_foe_tile_type + this.cpu.x)) !== 0) {
        this.cmp(TILES.tile_lord_british);
        kill = !this.zero();
      }
      if (kill) {
        this.poke(zp_index, this.cpu.x);
        this.poke(O.target_x, this.lda(this.peek(O.combat_foe_cur_x + this.cpu.x)));
        this.poke(O.target_y, this.lda(this.peek(O.combat_foe_cur_y + this.cpu.x)));
        this.poke(O.attack_sprite, this.lda(TILES.tile_attack_red));
        await this.m.call(J.j_update_view_combat);
        this.lda(SOUND.sound_damage);
        await this.m.call(J.j_playsfx);
        this.ldx(this.peek(zp_index));
        this.lda(0x00);
        this.poke(O.attack_sprite, this.cpu.a);
        this.poke(O.combat_foe_hp + this.cpu.x, this.cpu.a);
        this.poke(O.combat_foe_tile_type + this.cpu.x, this.cpu.a);
      }
    } while (this.dex() < 0x80);
  }


  private async skullPenalty(): Promise<void> {
    this.poke(zp_index, this.lda(ROST.virtue_last - 1));
    do {
      this.ldy(this.peek(zp_index));
      this.lda(0x05);
      await this.decVirtue();
    } while (this.dec(zp_index) < 0x80);
    await this.m.call(J.j_update_status);
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


  /** A word typed at `?`, up to fifteen characters, into inbuffer padded with spaces to six. */
  private async getInput(): Promise<void> {
    let done: boolean = false;

    this.lda(CHAR.char_question);
    await this.m.call(J.j_console_out);
    this.poke(zp_input_index, this.lda(0x00));
    while (!done) {
      await this.m.call(J.j_waitkey);
      this.cmp(CHAR.char_enter);
      if (this.zero()) {
        done = true;
      } else {
        this.cmp(CHAR.char_left_arrow);
        if (this.zero()) {
          await this.backspace();
        } else {
          this.cmp(CHAR.char_space);
          if (this.carry()) {
            this.ldx(this.peek(zp_input_index));
            this.poke(TABLES.inbuffer + this.cpu.x, this.cpu.a);
            await this.m.call(J.j_console_out);
            this.inc(zp_input_index);
            this.lda(this.peek(zp_input_index));
            this.cmp(INPUT_LENGTH);
            done = this.carry();
          }
        }
      }
    }
    this.ldx(this.peek(zp_input_index));
    this.lda(CHAR.char_space);
    do {
      this.poke(TABLES.inbuffer + this.cpu.x, this.cpu.a);
      this.inx();
      this.cpu.compare(this.cpu.x, PADDED_LENGTH);
    } while (!this.carry());
    this.lda(CHAR.char_enter);
    await this.m.call(J.j_console_out);
  }


  private async backspace(): Promise<void> {
    if (this.lda(this.peek(zp_input_index)) !== 0) {
      this.dec(zp_input_index);
      this.dec(ZP_MAIN.console_xpos);
      this.lda(CHAR.char_space);
      await this.m.call(J.j_console_out);
      this.dec(ZP_MAIN.console_xpos);
    }
  }


  /** The keyword the first four characters typed match, in A, or $FF (negative) for none. */
  private compareKeywords(): void {
    let matched: boolean = false;

    this.poke(zp_index, this.lda(KEYWORDS.length - 1));
    do {
      let differs: boolean = false;

      this.lda(this.peek(zp_index));
      this.ldy(this.cpu.asl(this.cpu.asl(this.cpu.a)));
      this.ldx(0x00);
      do {
        this.lda(this.peek(USE_TABLES.keywords + this.cpu.y));
        this.cmp(this.peek(TABLES.inbuffer + this.cpu.x));
        differs = !this.zero();
        if (!differs) {
          this.iny();
          this.inx();
          this.cpu.compare(this.cpu.x, KEYWORD_LENGTH);
          matched = this.carry();
        }
      } while (!differs && !matched);
    } while (!matched && (this.dec(zp_index) < 0x80));
    this.lda(this.peek(zp_index));
  }


  private async shakeScreen(): Promise<void> {
    this.lda(SOUND.sound_damage);
    await this.m.call(J.j_playsfx);
    for (let shake: number = 0; shake < 4; shake++) {
      await this.shakeUp();
      await this.shakeDown();
    }
  }


  /** Each line of the view from two lines above, from the bottom up. */
  private async shakeDown(): Promise<void> {
    this.ldx(SHAKE_LINES);
    do {
      this.copyLine(9, 7);
      await this.click();
    } while (this.dex() !== 0);
  }


  /** Each line of the view from two lines below, from the top down. */
  private async shakeUp(): Promise<void> {
    this.ldx(0x00);
    do {
      this.copyLine(8, 10);
      await this.click();
      this.inx();
      this.cpu.compare(this.cpu.x, SHAKE_LINES);
    } while (!this.carry());
  }


  /** Bytes 1 to $16 of the bitmap line X + `to` from line X + `from`. */
  private copyLine(to: number, from: number): void {
    this.poke(ZP_MAIN.ptr1, this.lda(this.peek(TABLES.bmplineaddr_lo + to + this.cpu.x)));
    this.poke(ZP_MAIN.ptr1 + 1, this.lda(this.peek(TABLES.bmplineaddr_hi + to + this.cpu.x)));
    this.poke(ZP_MAIN.ptr2, this.lda(this.peek(TABLES.bmplineaddr_lo + from + this.cpu.x)));
    this.poke(ZP_MAIN.ptr2 + 1, this.lda(this.peek(TABLES.bmplineaddr_hi + from + this.cpu.x)));
    this.ldy(COPY_BYTES);
    do {
      this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.lda(this.peek(this.pointer(ZP_MAIN.ptr2) + this.cpu.y)));
    } while (this.dey() !== 0);
  }


  /** With sound on, a click of the speaker on about half the lines. */
  private async click(): Promise<void> {
    this.cpu.bit(this.peek(ZP_MAIN.sfx_volume));
    if (this.negative()) {
      await this.m.call(J.j_rand);
      if (!this.negative()) {
        this.cpu.bit(this.m.read(APPLE.hw_SPEAKER));
      }
    }
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


  /** A virtue down, not below one; one at zero (an eighth of the Avatarhood) is lost, and starts again from 99. */
  private async decVirtue(): Promise<void> {
    this.poke(zp_dec_amount, this.cpu.a);
    this.poke(zp_save_reg, this.cpu.y);
    if (this.lda(this.peek(ROST.party_stats + this.cpu.y)) === 0) {
      await this.print(I.lost_an_eighth);
      this.lda(0x99);
      this.ldy(this.peek(zp_save_reg));
    }
    this.cpu.setFlag(DECIMAL, true);
    this.setCarry(true);
    this.cpu.sbc(this.peek(zp_dec_amount));
    if (this.zero() || !this.carry()) {
      this.lda(0x01);
    }
    this.poke(ROST.party_stats + this.cpu.y, this.cpu.a);
    this.cpu.setFlag(DECIMAL, false);
  }
}


export const USE_MODULE = overlayModule('USE', OVERLAY_ENTRY, USE_DATA, (machine: LiftedMachine): Use => new Use(machine), (program: Use): Promise<Exit> => program.run());
