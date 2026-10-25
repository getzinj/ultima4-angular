// towne/USE.s: using an item in a towne, ported. Nothing works there but the skull, which destroys
// everyone about but Lord British, at a price in virtue. ULT4's cmd_use_item loads it at $8800.

import type { LiftedMachine } from '../../../lifted-runtime/lifted-machine';
import { JUMP_SUBS, MAP_OBJECTS, ROST, TILES } from '../../../state/symbols';
import { inline } from '../../inline-data';
import type { IInlineData } from '../../inline-data';
import type { Exit } from '../../routine';
import { OVERLAY_ENTRY, overlayModule, text } from '../overlay';
import { UseOverlay, handlerTable, useKeywordBytes } from '../use-overlay';

const J = JUMP_SUBS;
const O = MAP_OBJECTS;

const USE_TABLES = {
  keyword_handlers: 0x8867,
  keywords: 0x8A1E,
} as const;

const HANDLERS = {
  use_stone: 0x8877,
  use_bell: 0x889B,
  use_book: 0x88A8,
  use_candle: 0x88B5,
  use_key: 0x88C2,
  use_horn: 0x88CD,
  use_wheel: 0x88D8,
  use_skull: 0x88E3,
} as const;

export const TOWNE_USE_INLINE = {
  which_item: text(0x8803, 'WHICH ITEM:\n'),
  not_usable: text(0x881B, '\nNOT USABLE ITEM!\n'),
  none_owned: text(0x8832, '\nNONE OWNED!\n'),
  no_effect: text(0x8844, '\nHMM...NO EFFECT!\n'),
  no_place: text(0x8882, '\nNO PLACE TO\nUSE THEM!\n'),
  skull_aloft: text(0x88F0, '\nYOU HOLD THE\nEVIL SKULL OF\nMONDAIN THE\nWIZARD ALOFT....\n'),
  lost_an_eighth: text(0x8AD7, '\nTHOU HAST LOST\nAN EIGHTH!\n'),
} as const;

const I = TOWNE_USE_INLINE;

export const TOWNE_USE_DATA: readonly IInlineData[] = [
  ...Object.values(TOWNE_USE_INLINE),
  inline(USE_TABLES.keyword_handlers, handlerTable(HANDLERS)),
  inline(USE_TABLES.keywords, useKeywordBytes()),
];


export class TowneUse extends UseOverlay {
  constructor(machine: LiftedMachine) {
    super(machine, { texts: I, keywordHandlers: USE_TABLES.keyword_handlers, keywords: USE_TABLES.keywords });
  }


  protected handlers(): ReadonlyMap<number, () => Promise<void>> {
    const H = HANDLERS;

    return new Map<number, () => Promise<void>>([
      [ H.use_stone, (): Promise<void> => this.useStone() ],
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
    if (owned) {
      await this.print(I.no_effect);
    } else {
      await this.print(I.none_owned);
    }
  }


  private async useSkull(): Promise<void> {
    if (this.haveSkull()) {
      await this.holdSkullAloft((): Promise<void> => this.clearTownsfolk());
    } else {
      await this.print(I.none_owned);
    }
  }


  /** Everyone in the towne gone, but Lord British, whom `object_dng_level` $FF marks as spared. */
  private async clearTownsfolk(): Promise<void> {
    this.ldx(O.object_max);
    do {
      this.lda(0x00);
      this.ldy(this.peek(O.object_tile_type + this.cpu.x));
      this.cpu.compare(this.cpu.y, TILES.tile_lord_british);
      if (this.zero()) {
        this.poke(O.object_dng_level + this.cpu.x, this.lda(0xFF));
      } else {
        this.poke(O.object_tile_type + this.cpu.x, this.cpu.a);
        this.poke(O.object_tile_sprite + this.cpu.x, this.cpu.a);
        this.poke(O.object_dng_level + this.cpu.x, this.cpu.a);
        this.poke(O.npc_dialogue + this.cpu.x, this.cpu.a);
      }
    } while (this.dex() < 0x80);
    await this.m.call(J.j_update_view);
  }
}


export const TOWNE_USE_MODULE = overlayModule('towne', 'USE', OVERLAY_ENTRY, TOWNE_USE_DATA, (machine: LiftedMachine): TowneUse => new TowneUse(machine),
  (program: TowneUse): Promise<Exit> => program.run());
