import { DECIMAL } from '../../lifted-runtime/cpu';
import { APPLE, JUMP_SUBS, MAP_OBJECTS, PRTY, ROST, SOUND, TABLES, TILES, ZP_MAIN } from '../../state/symbols';
import type { IInlineData } from '../inline-data';
import type { IPortMachine } from '../port-machine';
import type { Exit } from '../routine';
import { encode } from '../text';
import { KeywordOverlay } from './keyword-overlay';

// What the three USEs share, Britannia's, the townes' and the dungeons': the item asked for, its
// handler from the table, the stones outside the dungeons and the key, the skull's destruction in
// combat and its price, and the shaking of the screen.

const J = JUMP_SUBS;
const O = MAP_OBJECTS;
const zp_save_reg: number = 0xD9;
const zp_dec_amount: number = 0xDA;
const zp_index: number = 0xEA;
const zp_input_index: number = 0xEA;
const COPY_BYTES: number = 0x16;
const SHAKE_LINES: number = 0xAE;

export const USE_KEYWORDS: readonly string[] = [ 'STON', 'BELL', 'BOOK', 'CAND', 'KEY ', 'HORN', 'WHEE', 'SKUL' ];


export function useKeywordBytes(): number[] {
  return USE_KEYWORDS.flatMap((keyword: string): number[] => encode(keyword));
}


export function handlerTable(handlers: Readonly<Record<string, number>>): number[] {
  return Object.values(handlers).flatMap((address: number): number[] => [ address & 0xFF, address >> 8 ]);
}


export interface IUseTexts {
  readonly which_item: IInlineData;
  readonly not_usable: IInlineData;
  readonly none_owned: IInlineData;
  readonly no_effect: IInlineData;
  readonly skull_aloft: IInlineData;
  readonly lost_an_eighth: IInlineData;
}


export interface IUseLayout {
  readonly texts: IUseTexts;
  readonly keywordHandlers: number;
  readonly keywords: number;
}


export class UseError extends Error {
}


export abstract class UseOverlay extends KeywordOverlay {
  constructor(machine: IPortMachine, protected readonly layout: IUseLayout) {
    super(machine);
  }


  public async run(): Promise<Exit> {
    await this.print(this.layout.texts.which_item);
    await this.getInput(zp_input_index);
    this.compareKeywords(this.layout.keywords, USE_KEYWORDS.length);
    if (!this.negative()) {
      this.cpu.a = this.cpu.asl(this.cpu.a);
      this.ldy(this.cpu.a);
      this.poke(ZP_MAIN.ptr1, this.lda(this.peek(this.layout.keywordHandlers + this.cpu.y)));
      this.poke(ZP_MAIN.ptr1 + 1, this.lda(this.peek(this.layout.keywordHandlers + 1 + this.cpu.y)));
      await this.use(this.pointer(ZP_MAIN.ptr1));
    } else {
      await this.print(this.layout.texts.not_usable);
    }

    return null;
  }


  /** What each handler's address does. */
  protected abstract handlers(): ReadonlyMap<number, () => Promise<void>>;


  protected async use(handler: number): Promise<void> {
    const body: (() => Promise<void>) | undefined = this.handlers().get(handler);

    if (body == null) {
      throw new UseError(`keyword_handlers points at $${ handler.toString(16) }`);
    } else {
      await body();
    }
  }


  /** Outside the dungeons, the stones have `noPlace` to go. */
  protected async useStone(noPlace: IInlineData): Promise<void> {
    if (this.lda(this.peek(ROST.stones)) !== 0) {
      await this.print(noPlace);
    } else {
      await this.print(this.layout.texts.none_owned);
    }
  }


  protected async useKey(): Promise<void> {
    if (this.lda(this.peek(ROST.threepartkey)) !== 0) {
      await this.print(this.layout.texts.no_effect);
    } else {
      await this.print(this.layout.texts.none_owned);
    }
  }


  protected owned(item: number): boolean {
    return this.lda(this.peek(ROST.bell_book_candle) & item) !== 0;
  }


  protected haveSkull(): boolean {
    this.lda(this.peek(ROST.skull));
    this.cmp(0x01);

    return this.zero();
  }


  protected async shakeAndInvert(): Promise<void> {
    await this.shakeScreen();
    await this.m.call(J.j_invertview);
    await this.shakeScreen();
    await this.m.call(J.j_invertview);
    await this.shakeScreen();
  }


  /** In combat the foes are destroyed, otherwise `clear` does for what is on the map; either way every virtue costs five. */
  protected async holdSkullAloft(clear: () => Promise<void>): Promise<void> {
    await this.print(this.layout.texts.skull_aloft);
    await this.shakeAndInvert();
    if (this.lda(this.peek(PRTY.game_mode)) >= 0x80) {
      await this.skullInCombat();
    } else {
      await clear();
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


  protected async shakeScreen(): Promise<void> {
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


  /** A virtue down, not below one; one at zero (an eighth of the Avatarhood) is lost, and starts again from 99. */
  private async decVirtue(): Promise<void> {
    this.poke(zp_dec_amount, this.cpu.a);
    this.poke(zp_save_reg, this.cpu.y);
    if (this.lda(this.peek(ROST.party_stats + this.cpu.y)) === 0) {
      await this.print(this.layout.texts.lost_an_eighth);
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
