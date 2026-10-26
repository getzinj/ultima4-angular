// underworld/USE.s: using an item in a dungeon, ported. The game is suspended while the item is
// asked for, and DNGD loaded again after. Four stones of the right colours on the centre of an
// altar room's floor give its part of the three-part key; on the Abyss's altars, each level's
// virtue answered and its stone used opens the way down, and on the last BRUNs END. The skull clears
// the level's monsters, or in a fight the foes, but does nothing in the Abyss. ULT4's cmd_use_item
// loads it at $8800.

import type { LiftedMachine } from '../../../lifted-runtime/lifted-machine';
import { DUNGEON, JUMP_SUBS, MAP_OBJECTS, PRTY, ROST, ZP_MAIN } from '../../../state/symbols';
import { inline } from '../../inline-data';
import type { IInlineData } from '../../inline-data';
import type { Exit } from '../../routine';
import { encode } from '../../text';
import { OVERLAY_ENTRY, overlayModule, text } from '../overlay';
import { USE_KEYWORDS, UseOverlay, handlerTable } from '../use-overlay';

const J = JUMP_SUBS;
const O = MAP_OBJECTS;
const zp_input_index: number = 0xEA;
const COLOR_KEYWORDS: readonly string[] = [ 'BLUE', 'YELL', 'RED ', 'GREE', 'ORAN', 'PURP', 'WHIT', 'BLAC' ];
const VIRTUE_KEYWORDS: readonly string[] = [ 'HONE', 'COMP', 'VALO', 'JUST', 'SACR', 'HONO', 'SPIR', 'HUMI' ];
const ITEMS: number = USE_KEYWORDS.length;
const COLORS: number = ITEMS + COLOR_KEYWORDS.length;
const KEYWORDS: number = COLORS + VIRTUE_KEYWORDS.length;
/** The centre of an altar room, where the stones go. */
const ALTAR_CENTER: number = 0x05;
const STONES_PLACED: number = 0x03;
const LAST_LEVEL: number = 0x07;

const USE_TABLES = {
  keyword_handlers: 0x887E,
  saved_game_mode: 0x88AF,
  placed_stone_mask: 0x8A78,
  placed_stone_counter: 0x8A79,
  keywords: 0x8C01,
  bit_msb: 0x8D1D,
  principle_keypart: 0x8D25,
  principle_colors: 0x8D28,
  abyss_altar_stone_used: 0x8E72,
} as const;

const T = USE_TABLES;

const HANDLERS = {
  use_stone: 0x88B0,
  use_bell: 0x8A7A,
  use_book: 0x8A83,
  use_candle: 0x8A90,
  use_key: 0x8A99,
  use_horn: 0x8AA1,
  use_wheel: 0x8AA9,
  use_skull: 0x8AB4,
} as const;

export const UNDERWORLD_USE_INLINE = {
  which_item: text(0x8810, 'WHICH ITEM:\n'),
  not_usable: text(0x8828, '\nNOT USABLE ITEM!\n'),
  none_owned: text(0x8841, '\nNONE OWNED!\n'),
  no_effect: text(0x8855, '\nHMM...NO EFFECT!\n'),
  bload_dngd: text(0x8891, '\u0004BLOAD DNGD,A$8C00\n'),
  holes: text(0x88DB, '\nTHERE ARE HOLES\nFOR 4 STONES,\nWHAT COLORS:\n'),
  key_part: text(0x8970, 'THOU DOST FIND\nONE THIRD OF THE\nTHREE PART KEY!\n'),
  approach: text(0x89B7, '\nAS THOU\nDOST APPROACH\n'),
  use_thy_stone: text(0x89D7, '\nTHE VOICE SAYS:\nUSE THY STONE.\n\nCOLOR:\n'),
  altar_changes: text(0x8A39, '\nTHE ALTAR\nCHANGES BEFORE\nTHINE EYES!\n'),
  brun_end: text(0x8A66, '\u0004BRUN END,A$8800\n'),
  skull_aloft: text(0x8AC7, '\nYOU HOLD THE\nEVIL SKULL OF\nMONDAIN THE\nWIZARD ALOFT....\n'),
  lost_an_eighth: text(0x8CFA, '\nTHOU HAST LOST\nAN EIGHTH!\n'),
  voice: text(0x8D37, '\nA VOICE RINGS\nOUT: WHAT VIRTUE\nDOTH STEM FROM\n'),
  truth: text(0x8D6E, 'TRUTH?\n'),
  love: text(0x8D7F, 'LOVE?\n'),
  courage: text(0x8D8F, 'COURAGE?\n'),
  truth_and_love: text(0x8DA2, 'TRUTH AND LOVE?\n'),
  love_and_courage: text(0x8DBC, 'LOVE AND\nCOURAGE?\n'),
  courage_and_truth: text(0x8DD8, 'COURAGE AND\nTRUTH?\n'),
  all_three: text(0x8DF5, 'TRUTH, LOVE\nAND COURAGE?\n'),
  independently: text(0x8E15, 'A VOICE RINGS\nOUT: WHAT\nVIRTUE EXISTS\nINDEPENDENTLY OF\nTRUTH, LOVE AND\nCOURAGE?\n'),
} as const;

const I = UNDERWORLD_USE_INLINE;

/** What each of the Abyss's first seven levels asks the virtue of. */
const QUESTIONS: readonly IInlineData[] = [ I.truth, I.love, I.courage, I.truth_and_love, I.love_and_courage, I.courage_and_truth, I.all_three ];

export const UNDERWORLD_USE_DATA: readonly IInlineData[] = [
  ...Object.values(UNDERWORLD_USE_INLINE),
  inline(T.keyword_handlers, handlerTable(HANDLERS)),
  inline(T.saved_game_mode, [ 0x00 ]),
  inline(T.placed_stone_mask, [ 0x00, 0x00 ]),
  inline(T.keywords, [ ...USE_KEYWORDS, ...COLOR_KEYWORDS, ...VIRTUE_KEYWORDS ].flatMap((keyword: string): number[] => encode(keyword))),
  inline(T.bit_msb, [ 0x80, 0x40, 0x20, 0x10, 0x08, 0x04, 0x02, 0x01 ]),
  inline(T.principle_keypart, [ 0x04, 0x02, 0x01 ]),
  inline(T.principle_colors, [ 0x96, 0x5A, 0x2E ]),
  inline(T.abyss_altar_stone_used, [ 0x00 ]),
];


export class UnderworldUse extends UseOverlay {
  private ended: boolean = false;

  constructor(machine: LiftedMachine) {
    super(machine, { texts: I, keywordHandlers: T.keyword_handlers, keywords: T.keywords });
  }


  /** The item asked for with the game suspended in a dungeon, and DNGD loaded after, unless END was. */
  public override async run(): Promise<Exit> {
    this.lda(this.peek(PRTY.game_mode));
    this.cmp(PRTY.mode_dungeon);
    if (this.zero()) {
      this.poke(T.saved_game_mode, this.cpu.a);
      this.poke(PRTY.game_mode, this.lda(PRTY.mode_suspended));
    }
    await this.print(I.which_item);
    await this.getInput(zp_input_index);
    this.compareKeywords(T.keywords, KEYWORDS);
    let usable: boolean = !this.negative();

    if (usable) {
      this.cmp(ITEMS);
      usable = !this.carry();
    }
    if (usable) {
      this.cpu.a = this.cpu.asl(this.cpu.a);
      this.ldy(this.cpu.a);
      this.poke(ZP_MAIN.ptr1, this.lda(this.peek(T.keyword_handlers + this.cpu.y)));
      this.poke(ZP_MAIN.ptr1 + 1, this.lda(this.peek(T.keyword_handlers + 1 + this.cpu.y)));
      await this.use(this.pointer(ZP_MAIN.ptr1));
    } else {
      await this.print(I.not_usable);
    }
    if (!this.ended) {
      await this.returnToDungeon();
    }

    return null;
  }


  private async returnToDungeon(): Promise<void> {
    await this.callWith(J.j_primm_cout, I.bload_dngd);
    this.lda(this.peek(T.saved_game_mode));
    this.cmp(PRTY.mode_dungeon);
    if (this.zero()) {
      this.poke(PRTY.game_mode, this.cpu.a);
    }
  }


  protected handlers(): ReadonlyMap<number, () => Promise<void>> {
    const H = HANDLERS;

    return new Map<number, () => Promise<void>>([
      [ H.use_stone, (): Promise<void> => this.useStones() ],
      [ H.use_bell, (): Promise<void> => this.useOwned(this.owned(ROST.item_have_bell)) ],
      [ H.use_book, (): Promise<void> => this.useOwned(this.owned(ROST.item_have_book)) ],
      [ H.use_candle, (): Promise<void> => this.useOwned(this.owned(ROST.item_have_candle)) ],
      [ H.use_key, (): Promise<void> => this.useKey() ],
      [ H.use_horn, (): Promise<void> => this.useOwned(this.lda(this.peek(ROST.horn)) !== 0) ],
      [ H.use_wheel, (): Promise<void> => this.useOwned(this.lda(this.peek(ROST.wheel)) !== 0) ],
      [ H.use_skull, (): Promise<void> => this.useSkull() ],
    ]);
  }


  private async useOwned(owned: boolean): Promise<void> {
    await this.print(owned ? I.no_effect : I.none_owned);
  }


  /** The stones, if the party has any: in the Abyss on its altars, elsewhere on the centre of an altar room. */
  private async useStones(): Promise<void> {
    if (this.lda(this.peek(ROST.stones)) === 0) {
      await this.print(I.none_owned);
    } else {
      this.lda(this.peek(PRTY.current_location));
      this.cmp(PRTY.loc_dng_abyss);
      if (this.zero()) {
        await this.useStoneInAbyss();
      } else {
        this.lda(this.peek(PRTY.game_mode));
        this.cmp(PRTY.mode_combat_dng_room);
        if (this.zero() && this.atAltarCenter()) {
          await this.placeStones();
        } else {
          await this.print(I.no_effect);
        }
      }
    }
  }


  private atAltarCenter(): boolean {
    let center: boolean = false;

    this.ldx(this.peek(ZP_MAIN.curr_player));
    this.lda(ALTAR_CENTER);
    this.cmp(this.peek(O.combat_player_xpos - 1 + this.cpu.x));
    if (this.zero()) {
      this.cmp(this.peek(O.combat_player_ypos - 1 + this.cpu.x));
      center = this.zero();
    }

    return center;
  }


  /** Four colours the party has, none twice; the room's part of the key if they are its principle's. */
  private async placeStones(): Promise<void> {
    let owned: boolean = true;

    await this.print(I.holes);
    this.poke(T.placed_stone_mask, this.lda(0x00));
    this.poke(T.placed_stone_counter, this.lda(STONES_PLACED));
    while (owned && (this.peek(T.placed_stone_counter) < 0x80)) {
      this.lda(0x04);
      this.setCarry(true);
      this.cpu.sbc(this.peek(T.placed_stone_counter));
      await this.m.call(J.j_printdigit);
      owned = await this.askColor();
      if (owned) {
        this.lda(this.peek(T.bit_msb + this.cpu.y) & this.peek(T.placed_stone_mask));
        owned = this.zero();
      }
      if (owned) {
        this.poke(T.placed_stone_mask, this.lda(this.peek(T.bit_msb + this.cpu.y) | this.peek(T.placed_stone_mask)));
        this.dec(T.placed_stone_counter);
      }
    }
    if (owned) {
      await this.checkStones();
    } else {
      await this.print(I.none_owned);
    }
  }


  /** A colour typed, Y its stone, true if the party has it. */
  private async askColor(): Promise<boolean> {
    let owned: boolean = await this.inputColor();

    if (owned) {
      this.ldy(this.cpu.a);
      owned = this.lda(this.peek(T.bit_msb + this.cpu.y) & this.peek(ROST.stones)) !== 0;
    }

    return owned;
  }


  /** A word typed: true, A its colour from blue, if it is one; carry set, not a colour, otherwise. */
  private async inputColor(): Promise<boolean> {
    await this.getInput(zp_input_index);
    this.compareKeywords(T.keywords, COLORS);
    this.subtract(ITEMS);
    this.cmp(COLOR_KEYWORDS.length);

    return !this.carry();
  }


  private async checkStones(): Promise<void> {
    let found: boolean = false;

    this.lda(this.peek(T.placed_stone_mask));
    this.ldy(this.peek(PRTY.altar_room_principle));
    this.cmp(this.peek(T.principle_colors + this.cpu.y));
    if (this.zero()) {
      this.ldy(this.peek(PRTY.altar_room_principle));
      found = this.lda(this.peek(T.principle_keypart + this.cpu.y) & this.peek(ROST.threepartkey)) === 0;
    }
    if (found) {
      this.poke(ROST.threepartkey, this.lda(this.peek(T.principle_keypart + this.cpu.y) | this.peek(ROST.threepartkey)));
      await this.print(I.key_part);
    } else {
      await this.print(I.no_effect);
    }
  }


  /** On the Abyss's altar, out of a fight: the level's virtue, then its stone, which opens the way down; on the last level, END. */
  private async useStoneInAbyss(): Promise<void> {
    let effect: boolean = false;

    this.lda(this.peek(T.saved_game_mode));
    this.cmp(PRTY.mode_dungeon);
    if (this.zero()) {
      this.lda(this.peek(ZP_MAIN.tile_under_player));
      this.cmp(DUNGEON.dng_tile_altar);
      if (this.zero()) {
        await this.print(I.approach);
        effect = await this.askVirtue();
      }
    }
    if (effect) {
      await this.print(I.use_thy_stone);
      effect = await this.inputColor();
    }
    if (effect) {
      await this.useAbyssStone();
    } else {
      await this.print(I.no_effect);
    }
  }


  private async useAbyssStone(): Promise<void> {
    this.poke(T.abyss_altar_stone_used, this.cpu.a);
    this.ldy(this.cpu.a);
    if (this.lda(this.peek(T.bit_msb + this.cpu.y) & this.peek(ROST.stones)) === 0) {
      await this.print(I.none_owned);
    } else {
      this.lda(this.peek(T.abyss_altar_stone_used));
      this.cmp(this.peek(PRTY.dungeon_level));
      if (!this.zero()) {
        await this.print(I.no_effect);
      } else {
        this.cmp(LAST_LEVEL);
        if (this.zero()) {
          this.ended = true;
          await this.callWith(J.j_primm_cout, I.brun_end);
        } else {
          this.poke(PRTY.dest_x, this.lda(this.peek(PRTY.player_xpos)));
          this.poke(PRTY.dest_y, this.lda(this.peek(PRTY.player_ypos)));
          await this.m.call(J.j_gettile_dungeon);
          this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.lda(DUNGEON.dng_tile_ladder_d));
          await this.print(I.altar_changes);
        }
      }
    }
  }


  /** ask_virtue: the level's question, true (Z set) if the virtue typed is the level's own, honesty's on the first. */
  private async askVirtue(): Promise<boolean> {
    this.lda(this.peek(PRTY.dungeon_level));
    this.cmp(LAST_LEVEL);
    if (this.zero()) {
      await this.print(I.independently);
    } else {
      let level: number = 0;

      await this.print(I.voice);
      this.ldx(this.peek(PRTY.dungeon_level));
      while ((level < QUESTIONS.length - 1) && !this.zero()) {
        this.dex();
        level++;
      }
      await this.print(this.zero() ? QUESTIONS[level] : I.independently);
    }
    await this.getInput(zp_input_index);
    this.compareKeywords(T.keywords, KEYWORDS);
    this.subtract(COLORS);
    this.cmp(this.peek(PRTY.dungeon_level));

    return this.zero();
  }


  private async useSkull(): Promise<void> {
    if (!this.haveSkull()) {
      await this.print(I.none_owned);
    } else {
      this.lda(this.peek(PRTY.current_location));
      this.cmp(PRTY.loc_dng_abyss);
      if (this.zero()) {
        await this.print(I.no_effect);
      } else {
        await this.holdSkullAloft((): Promise<void> => this.clearLevel());
      }
    }
  }


  /** The remaster's fix: only the level's monsters cleared, from the map's tiles as well as the objects. */
  private async clearLevel(): Promise<void> {
    this.ldx(O.object_max);
    do {
      this.lda(this.peek(O.object_dng_level + this.cpu.x));
      this.cmp(this.peek(PRTY.dungeon_level));
      if (this.zero()) {
        this.poke(PRTY.dest_x, this.lda(this.peek(O.object_xpos + this.cpu.x)));
        this.poke(PRTY.dest_y, this.lda(this.peek(O.object_ypos + this.cpu.x)));
        await this.m.call(J.j_gettile_dungeon);
        this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.lda(this.cpu.a & DUNGEON.dng_tile_type_mask));
        this.lda(0x00);
        this.poke(O.object_tile_type + this.cpu.x, this.cpu.a);
        this.poke(O.object_tile_sprite + this.cpu.x, this.cpu.a);
      }
    } while (this.dex() < 0x80);
    await this.m.call(J.j_update_view);
  }
}


export const UNDERWORLD_USE_MODULE = overlayModule('underworld', 'USE', OVERLAY_ENTRY, UNDERWORLD_USE_DATA, (machine: LiftedMachine): UnderworldUse => new UnderworldUse(machine),
  (program: UnderworldUse): Promise<Exit> => program.run());
