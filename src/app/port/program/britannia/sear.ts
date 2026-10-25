// britannia/SEAR.s: searching Britannia, ported. Ten places hold something: the reagents that
// grow only under dark moons, the bell, the horn, the wheel, the skull and two stones. Finding one
// is worth honour, and the quest items experience. ULT4's cmd_search loads it at $8800.

import { DECIMAL } from '../../../lifted-runtime/cpu';
import type { LiftedMachine } from '../../../lifted-runtime/lifted-machine';
import { JUMP_SUBS, PRTY, ROST, ZP_MAIN } from '../../../state/symbols';
import { inline } from '../../inline-data';
import type { IInlineData } from '../../inline-data';
import { PortProgram } from '../../port-program';
import type { Exit } from '../../routine';
import { OVERLAY_ENTRY, overlayModule, text } from './overlay';

const J = JUMP_SUBS;
const ITEM_COUNT: number = 10;

const SEAR_TABLES = {
  jump_table: 0x882D,
  item_xpos: 0x8A23,
  item_ypos: 0x8A2D,
} as const;

/** The finds, by where jump_table points. */
const HANDLERS = {
  find_mandrake: 0x8863,
  find_nightshade: 0x88A7,
  find_bell: 0x88D5,
  find_black_stone: 0x8909,
  find_white_stone: 0x893F,
  find_horn: 0x896F,
  find_wheel: 0x8996,
  find_skull: 0x89CD,
} as const;

const H = HANDLERS;


function words(...addresses: readonly number[]): number[] {
  return addresses.flatMap((address: number): number[] => [ address & 0xFF, address >> 8 ]);
}


export const SEAR_INLINE = {
  nothing_here: text(0x880D, 'NOTHING HERE!\n'),
  you_find: text(0x8844, 'YOU FIND...\n'),
  mandrake: text(0x887F, 'MANDRAKE ROOT!\n'),
  nightshade: text(0x88C3, 'NIGHTSHADE!\n'),
  bell: text(0x88ED, 'THE BELL OF\nCOURAGE!\n'),
  black_stone: text(0x8927, 'THE BLACK STONE!\n'),
  white_stone: text(0x8957, 'THE WHITE STONE!\n'),
  horn: text(0x8980, 'A SILVER HORN!\n'),
  wheel: text(0x89A7, 'THE WHEEL FROM\nTHE H.M.S. CAPE!'),
  skull: text(0x89E7, 'THE SKULL\nOF MONDAIN\nTHE WIZARD!\n'),
} as const;

const I = SEAR_INLINE;

export const SEAR_DATA: readonly IInlineData[] = [
  ...Object.values(SEAR_INLINE),
  inline(SEAR_TABLES.jump_table, words(
    H.find_mandrake, H.find_mandrake, H.find_nightshade, H.find_nightshade, H.find_bell, H.find_horn, H.find_wheel, H.find_skull, H.find_black_stone,
    H.find_white_stone,
  )),
  inline(SEAR_TABLES.item_xpos, [ 0xB6, 0x64, 0x2E, 0xCD, 0xB0, 0x2D, 0x60, 0xC5, 0xE0, 0x40 ]),
  inline(SEAR_TABLES.item_ypos, [ 0x36, 0xA5, 0x95, 0x2C, 0xD0, 0xAD, 0xD7, 0xF5, 0x85, 0x50 ]),
];


export class SearError extends Error {
}


export class Sear extends PortProgram {
  public async run(): Promise<Exit> {
    let found: boolean = false;

    this.ldy(ITEM_COUNT - 1);
    while (!found && !this.negative()) {
      this.comparePosition();
      found = this.zero();
      if (!found) {
        this.dey();
      }
    }
    if (found) {
      this.lda(this.cpu.y);
      this.cpu.a = this.cpu.asl(this.cpu.a);
      this.ldy(this.cpu.a);
      this.poke(ZP_MAIN.ptr1, this.lda(this.peek(SEAR_TABLES.jump_table + this.cpu.y)));
      this.poke(ZP_MAIN.ptr1 + 1, this.lda(this.peek(SEAR_TABLES.jump_table + 1 + this.cpu.y)));
      await this.find(this.pointer(ZP_MAIN.ptr1));
    } else {
      await this.nothingHere();
    }

    return null;
  }


  private async find(handler: number): Promise<void> {
    const finds: ReadonlyMap<number, () => Promise<void>> = new Map<number, () => Promise<void>>([
      [ H.find_mandrake, (): Promise<void> => this.findReagent(I.mandrake, ROST.reagent_mandrake) ],
      [ H.find_nightshade, (): Promise<void> => this.findReagent(I.nightshade, ROST.reagent_nightshade) ],
      [ H.find_bell, (): Promise<void> => this.findBell() ],
      [ H.find_black_stone, (): Promise<void> => this.findBlackStone() ],
      [ H.find_white_stone, (): Promise<void> => this.findStone(ROST.stone_white, I.white_stone) ],
      [ H.find_horn, (): Promise<void> => this.findOnce(ROST.horn, I.horn, false) ],
      [ H.find_wheel, (): Promise<void> => this.findOnce(ROST.wheel, I.wheel, false) ],
      [ H.find_skull, (): Promise<void> => this.findOnce(ROST.skull, I.skull, true) ],
    ]);
    const body: (() => Promise<void>) | undefined = finds.get(handler);

    if (body == null) {
      throw new SearError(`jump_table points at $${ handler.toString(16) }`);
    } else {
      await body();
    }
  }


  private nothingHere(): Promise<void> {
    return this.callWith(J.j_primm, I.nothing_here);
  }


  /** A find is worth five points of honour, if any is left to add to. */
  private async youFind(): Promise<void> {
    await this.callWith(J.j_primm, I.you_find);
    this.cpu.setFlag(DECIMAL, true);
    this.setCarry(false);
    if (this.lda(this.peek(ROST.party_stats + ROST.virtue_honor)) !== 0) {
      this.cpu.adc(0x05);
      if (this.carry()) {
        this.lda(0x99);
      }
    }
    this.poke(ROST.party_stats + ROST.virtue_honor, this.cpu.a);
    this.cpu.setFlag(DECIMAL, false);
  }


  private darkMoons(): boolean {
    this.lda(this.peek(PRTY.moon_phase_trammel) | this.peek(PRTY.moon_phase_felucca));

    return this.zero();
  }


  /** Mandrake and nightshade: under dark moons, once in each sixteen moves. */
  private async findReagent(block: IInlineData, reagent: number): Promise<void> {
    let found: boolean = false;

    if (this.darkMoons()) {
      this.lda(this.peek(PRTY.move_counter + 3) & 0xF0);
      this.cmp(this.peek(PRTY.last_found_reagent));
      found = !this.zero();
    }
    if (found) {
      this.poke(PRTY.last_found_reagent, this.cpu.a);
      await this.youFind();
      await this.callWith(J.j_primm, block);
      this.ldy(reagent);
      await this.awardReagent();
    } else {
      await this.nothingHere();
    }
  }


  private async awardReagent(): Promise<void> {
    await this.m.call(J.j_rand);
    this.lda(this.cpu.a & 0x07);
    this.add(0x02);
    this.cpu.setFlag(DECIMAL, true);
    this.setCarry(false);
    this.cpu.adc(this.peek(ROST.reagents + this.cpu.y));
    if (this.carry()) {
      this.lda(0x99);
    }
    this.poke(ROST.reagents + this.cpu.y, this.cpu.a);
    this.cpu.setFlag(DECIMAL, false);
  }


  private async findBell(): Promise<void> {
    if (this.lda(this.peek(ROST.bell_book_candle) & ROST.item_have_bell) === 0) {
      this.poke(ROST.bell_book_candle, this.lda(this.peek(ROST.bell_book_candle) | ROST.item_have_bell));
      await this.found(I.bell, 0x04);
    } else {
      await this.nothingHere();
    }
  }


  /** The black stone shows only when both moons are dark. */
  private async findBlackStone(): Promise<void> {
    if (this.darkMoons()) {
      await this.findStone(ROST.stone_black, I.black_stone);
    } else {
      await this.nothingHere();
    }
  }


  private async findStone(stone: number, block: IInlineData): Promise<void> {
    if (this.lda(this.peek(ROST.stones) & stone) === 0) {
      this.poke(ROST.stones, this.lda(this.peek(ROST.stones) | stone));
      await this.found(block, 0x02);
    } else {
      await this.nothingHere();
    }
  }


  /** The horn, the wheel and (under dark moons) the skull, each found once. */
  private async findOnce(item: number, block: IInlineData, dark: boolean): Promise<void> {
    const showing: boolean = !dark || this.darkMoons();

    if (showing && (this.lda(this.peek(item)) === 0)) {
      this.inc(item);
      await this.found(block, 0x04);
    } else {
      await this.nothingHere();
    }
  }


  private async found(block: IInlineData, hundreds: number): Promise<void> {
    await this.youFind();
    await this.callWith(J.j_primm, block);
    this.lda(hundreds);
    await this.addXp100();
  }


  private comparePosition(): void {
    let here: boolean = false;

    this.lda(this.peek(PRTY.player_xpos));
    this.cmp(this.peek(SEAR_TABLES.item_xpos + this.cpu.y));
    if (this.zero()) {
      this.lda(this.peek(PRTY.player_ypos));
      this.cmp(this.peek(SEAR_TABLES.item_ypos + this.cpu.y));
      here = this.zero();
    }
    this.lda(here ? 0x00 : 0xFF);
  }


  /** A hundreds of experience to player 1, in BCD, up to 9999. */
  private async addXp100(): Promise<void> {
    this.cpu.push(this.cpu.a);
    this.poke(ZP_MAIN.curr_player, this.lda(0x01));
    await this.m.call(J.j_get_stats_ptr);
    const player: number = this.pointer(ZP_MAIN.ptr1);

    this.ldy(ROST.player_experience_hi);
    this.cpu.setFlag(DECIMAL, true);
    this.setCarry(false);
    this.lda(this.cpu.pull());
    this.cpu.adc(this.peek(player + this.cpu.y));
    this.cpu.setFlag(DECIMAL, false);
    if (this.carry()) {
      this.lda(0x99);
      this.iny();
      this.poke(player + this.cpu.y, this.cpu.a);
      this.dey();
    }
    this.poke(player + this.cpu.y, this.cpu.a);
  }
}


export const SEAR_MODULE = overlayModule('SEAR', OVERLAY_ENTRY, SEAR_DATA, (machine: LiftedMachine): Sear => new Sear(machine), (program: Sear): Promise<Exit> => program.run());
