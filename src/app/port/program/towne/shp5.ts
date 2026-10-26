// towne/SHP5.s: the healers, ported: curing, healing and resurrection for one of the party, for
// gold, a cure free to a party without it; and on the way out, blood given or refused for sacrifice.
// ULT4's check_shop loads it at $8800.

import { DECIMAL } from '../../../lifted-runtime/cpu';
import type { LiftedMachine } from '../../../lifted-runtime/lifted-machine';
import { CHAR, JUMP_SUBS, PRTY, ROST, SOUND, TABLES, ZP_MAIN } from '../../../state/symbols';
import { inline } from '../../inline-data';
import type { IInlineData } from '../../inline-data';
import type { Exit } from '../../routine';
import { OVERLAY_ENTRY, overlayModule, text } from '../overlay';
import { ShopOverlay, stringTable } from './shop-overlay';

const J = JUMP_SUBS;
const zp_index: number = 0xEA;
const zp_price: number = 0xD8;
const zp_delay: number = 0xD8;
const zp_count: number = 0xF0;
const PROPRIETOR: number = 0x0B;
const CURE: number = 0x01;
const HEAL: number = 0x02;
const RESURRECT: number = 0x03;
const DONOR_HP_HI: number = 0x04;
const SACRIFICE: number = 0x05;
const DONATION_DELAY: number = 0x0A;

const SHP5_TABLES = {
  location_table: 0x8CD7,
  string_table: 0x8D5C,
} as const;

const T = SHP5_TABLES;

export const SHP5_INLINE = {
  welcome_unto: text(0x8803, '\nWELCOME UNTO\n'),
  greeting: text(0x8830, ' SAYS:\nPEACE AND JOY BE\nWITH YOU FRIEND.\nARE YOU IN NEED\nOF HELP?'),
  menu: text(0x888A, ' SAYS:\nWE CAN PERFORM:\nA-CURING\nB-HEALING\nC-RESURRECTION\nYOUR NEED:'),
  not_poisoned: text(0x88FA, '\nTHOU SUFFERS NOT\nFROM POISON!\n'),
  cure_cost: text(0x8920, '\nA CURING WILL\nCOST THEE 100gp.\n'),
  purse: text(0x894C, '\nI SEE BY THY\nPURSE THAT THOU\nHAST NOT ENOUGH\nGOLD.'),
  free_cure: text(0x8986, '\nI WILL\nCURE THEE FOR\nFREE, BUT GIVE\nUNTO OTHERS WHEN\nEVER THOU MAY!\n'),
  heal_cost: text(0x89EC, '\nA HEALING WILL\nCOST THEE 200gp.\n'),
  not_dead: text(0x8A4A, '\nTHOU ART NOT\nDEAD FOOL!\n'),
  resurrect_cost: text(0x8A6A, '\nRESURRECTION\nWILL COST THEE\n300gp.\n'),
  cannot_afford: text(0x8A99, '\nI SEE BY THY\nPURSE THAT THOU\nHAST NOT ENOUGH\nGOLD. I CANNOT\nAID THEE.\n'),
  who: text(0x8B09, ' ASKS:\nWHO IS IN NEED?'),
  no_one: text(0x8B28, '\nNO ONE?\n'),
  more_help: text(0x8B4F, ' ASKS:\nDO YOU NEED\nMORE HELP?'),
  bye: text(0x8B94, ' SAYS:\nMAY THY LIFE\nBE GUARDED BY\nTHE POWERS OF\nGOOD.\n'),
  donate: text(0x8BCF, '\nART THOU WILLING\nTO GIVE 100pts\nOF THY BLOOD TO\nAID OTHERS?'),
  thanks: text(0x8C2E, '\nTHOU ART A\nGREAT HELP, WE\nARE IN DIRE\nNEED!\n'),
  pay: text(0x8C7D, '\nWILT THOU PAY?'),
  no_aid: text(0x8C99, '\nTHEN I CANNOT\nAID THEE.\n'),
  lost_an_eighth: text(0x8EC2, '\nTHOU HAST LOST\nAN EIGHTH!\n'),
} as const;

const I = SHP5_INLINE;

const LOCATION_TABLE: readonly number[] = [
  0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x00, 0x00, 0x09, 0x00, 0x00, 0x00, 0x00, 0x0A,
];

const STRINGS: readonly string[] = [
  '',
  'THE ROYAL HEALER',
  'THE TRUTH HEALER',
  'THE LOVE HEALER',
  'COURAGE HEALER',
  'THE HEALER',
  'WOUND HEALING',
  'HEAL AND HEALTH',
  'JUST HEALING',
  'THE MYSTIC HEAL',
  'THE HEALER SHOP',
  'PENDRAGON',
  'STARFIRE',
  'SALLE\'',
  'WINDWALKER',
  'HARMONY',
  'CELEST',
  'TRIPLET',
  'JUSTIN',
  'SPIRAN',
  'QUAT',
];

export const SHP5_DATA: readonly IInlineData[] = [
  ...Object.values(SHP5_INLINE),
  inline(T.location_table, LOCATION_TABLE),
  stringTable(T.string_table, STRINGS),
];

type Next = 'menu' | 'ask_more' | 'try_donate';


export class Shp5 extends ShopOverlay {
  constructor(machine: LiftedMachine) {
    super(machine, T.string_table);
  }


  public async run(): Promise<Exit> {
    let next: Next = 'try_donate';

    await this.print(I.welcome_unto);
    this.ldx(this.peek(PRTY.current_location));
    this.dex();
    this.poke(zp_index, this.lda(this.peek(T.location_table + this.cpu.x)));
    this.dec(zp_index);
    await this.printString(this.cpu.a);
    await this.printNewline();
    await this.printNewline();
    await this.proprietor();
    await this.print(I.greeting);
    await this.inputChar();
    this.cmp(CHAR.char_Y);
    if (this.zero()) {
      next = 'menu';
    }
    while (next !== 'try_donate') {
      next = (next === 'menu') ? await this.menu() : await this.askMore();
    }
    await this.tryDonate();

    return null;
  }


  private async proprietor(): Promise<void> {
    this.setCarry(false);
    this.lda(this.peek(zp_index));
    this.cpu.adc(PROPRIETOR);
    await this.printString(this.cpu.a);
  }


  private async menu(): Promise<Next> {
    let next: Next = 'ask_more';

    await this.printNewline();
    await this.proprietor();
    await this.print(I.menu);
    await this.inputChar();
    this.cmp(CHAR.char_A);
    if (this.zero()) {
      await this.askCure();
    } else {
      this.cmp(CHAR.char_B);
      if (this.zero()) {
        await this.askHeal();
      } else {
        this.cmp(CHAR.char_C);
        if (this.zero()) {
          await this.askResurrect();
        } else {
          next = 'try_donate';
        }
      }
    }

    return next;
  }


  private statsAt(offset: number): number {
    return this.pointer(ZP_MAIN.ptr1) + offset;
  }


  /** A poisoned player cured for 100 gold, or for nothing if the party has under 100. */
  private async askCure(): Promise<void> {
    let cure: boolean = false;

    if (await this.askWhichPlayer()) {
      await this.m.call(J.j_get_stats_ptr);
      this.ldy(ROST.player_status);
      this.lda(this.peek(this.statsAt(ROST.player_status)));
      this.cmp(ROST.status_Poison);
      if (this.zero()) {
        await this.print(I.cure_cost);
        if (this.lda(this.peek(ROST.party_stats + ROST.party_stat_gold_hi)) === 0) {
          await this.print(I.purse);
          await this.m.call(J.j_waitkey);
          await this.print(I.free_cure);
          cure = true;
        } else {
          this.lda(CURE);
          cure = await this.askPay();
        }
      } else {
        await this.print(I.not_poisoned);
      }
    }
    if (cure) {
      await this.m.call(J.j_get_stats_ptr);
      this.ldy(ROST.player_status);
      this.poke(this.statsAt(ROST.player_status), this.lda(ROST.status_Good));
      await this.specialFx();
      await this.m.call(J.j_update_status);
    }
  }


  private async askHeal(): Promise<void> {
    if (await this.askWhichPlayer()) {
      await this.print(I.heal_cost);
      this.lda(this.peek(ROST.party_stats + ROST.party_stat_gold_hi));
      this.cmp(HEAL);
      if (!this.carry()) {
        await this.print(I.cannot_afford);
      } else {
        this.lda(HEAL);
        if (await this.askPay()) {
          await this.m.call(J.j_get_stats_ptr);
          this.ldy(ROST.player_max_hp_hi);
          this.lda(this.peek(this.statsAt(ROST.player_max_hp_hi)));
          this.ldy(ROST.player_cur_hp_hi);
          this.poke(this.statsAt(ROST.player_cur_hp_hi), this.cpu.a);
          this.ldy(ROST.player_max_hp_lo);
          this.lda(this.peek(this.statsAt(ROST.player_max_hp_lo)));
          this.ldy(ROST.player_cur_hp_lo);
          this.poke(this.statsAt(ROST.player_cur_hp_lo), this.cpu.a);
          await this.specialFx();
          await this.m.call(J.j_update_status);
        }
      }
    }
  }


  private async askResurrect(): Promise<void> {
    if (await this.askWhichPlayer()) {
      await this.m.call(J.j_get_stats_ptr);
      this.ldy(ROST.player_status);
      this.lda(this.peek(this.statsAt(ROST.player_status)));
      this.cmp(ROST.status_Dead);
      if (!this.zero()) {
        await this.print(I.not_dead);
      } else {
        await this.print(I.resurrect_cost);
        this.lda(this.peek(ROST.party_stats + ROST.party_stat_gold_hi));
        this.cmp(RESURRECT);
        if (!this.carry()) {
          await this.print(I.cannot_afford);
        } else {
          this.lda(RESURRECT);
          if (await this.askPay()) {
            await this.m.call(J.j_get_stats_ptr);
            this.ldy(ROST.player_status);
            this.poke(this.statsAt(ROST.player_status), this.lda(ROST.status_Good));
            await this.specialFx();
            await this.m.call(J.j_update_status);
          }
        }
      }
    }
  }


  /** A member of the party chosen, asked again past its size; false, the 6502's `pla` / `pla`, for none. */
  private async askWhichPlayer(): Promise<boolean> {
    let chosen: boolean | null = null;

    while (chosen == null) {
      await this.printNewline();
      await this.proprietor();
      await this.print(I.who);
      await this.m.call(J.j_getplayernum);
      if (this.zero()) {
        await this.print(I.no_one);
        chosen = false;
      } else {
        this.cmp(this.peek(PRTY.party_size));
        if (!this.carry() || this.zero()) {
          chosen = true;
        }
      }
    }

    return chosen;
  }


  private async askMore(): Promise<Next> {
    let next: Next = 'try_donate';

    await this.printNewline();
    await this.proprietor();
    await this.print(I.more_help);
    await this.inputChar();
    this.cmp(CHAR.char_Y);
    if (this.zero()) {
      next = 'menu';
    }

    return next;
  }


  /** The leader asked for blood if it has 400 hit points or more: sacrifice up for yes, down for no. */
  private async tryDonate(): Promise<void> {
    let answer: boolean | null = null;

    this.poke(ZP_MAIN.curr_player, this.lda(0x01));
    await this.m.call(J.j_get_stats_ptr);
    this.ldy(ROST.player_cur_hp_hi);
    this.lda(this.peek(this.statsAt(ROST.player_cur_hp_hi)));
    this.cmp(DONOR_HP_HI);
    if (this.carry()) {
      while (answer == null) {
        await this.print(I.donate);
        await this.inputChar();
        this.cmp(CHAR.char_N);
        if (this.zero()) {
          answer = false;
        } else {
          this.cmp(CHAR.char_Y);
          if (this.zero()) {
            answer = true;
          }
        }
      }
      this.ldy(ROST.virtue_sacrifice);
      this.lda(SACRIFICE);
      if (answer) {
        await this.giveBlood();
      } else {
        await this.decVirtue(I.lost_an_eighth);
      }
    }
    await this.printNewline();
    await this.proprietor();
    await this.print(I.bye);
  }


  private async giveBlood(): Promise<void> {
    this.incVirtue();
    await this.print(I.thanks);
    await this.m.call(J.j_get_stats_ptr);
    this.ldy(ROST.player_cur_hp_hi);
    this.lda(this.peek(this.statsAt(ROST.player_cur_hp_hi)));
    this.setCarry(true);
    this.cpu.setFlag(DECIMAL, true);
    this.cpu.sbc(0x01);
    this.cpu.setFlag(DECIMAL, false);
    this.poke(this.statsAt(ROST.player_cur_hp_hi), this.cpu.a);
    this.poke(zp_delay, this.lda(DONATION_DELAY));
    do {
      await this.m.call(J.j_update_view);
    } while (this.dec(zp_delay) !== 0);
  }


  /** ask_pay: A hundreds of gold taken if the party says it will pay; false, the 6502's `pla` / `pla`, if not. */
  private async askPay(): Promise<boolean> {
    let paid: boolean = false;

    this.poke(zp_price, this.cpu.a);
    await this.print(I.pay);
    await this.inputChar();
    this.cmp(CHAR.char_Y);
    if (this.zero()) {
      this.cpu.setFlag(DECIMAL, true);
      this.setCarry(true);
      this.lda(this.peek(ROST.party_stats + ROST.party_stat_gold_hi));
      this.cpu.sbc(this.peek(zp_price));
      this.poke(ROST.party_stats + ROST.party_stat_gold_hi, this.cpu.a);
      this.cpu.setFlag(DECIMAL, false);
      paid = true;
    } else {
      await this.print(I.no_aid);
    }

    return paid;
  }


  /** The view and the player's line inverted, the spell's sound, and both put back. */
  private async specialFx(): Promise<void> {
    this.invertView();
    this.invertPlayer();
    this.lda(SOUND.sound_spell_effect);
    this.ldx(0xC0);
    await this.m.call(J.j_playsfx);
    this.invertPlayer();
    this.invertView();
  }


  /** The current player's eight lines of the status window, columns 24 to 38. */
  private invertPlayer(): void {
    this.lda(this.peek(ZP_MAIN.curr_player));
    this.ldx(this.cpu.asl(this.cpu.asl(this.cpu.asl(this.cpu.a))));
    this.poke(zp_count, this.lda(0x08));
    do {
      this.poke(ZP_MAIN.ptr1, this.lda(this.peek(TABLES.bmplineaddr_lo + this.cpu.x)));
      this.poke(ZP_MAIN.ptr1 + 1, this.lda(this.peek(TABLES.bmplineaddr_hi + this.cpu.x)));
      this.ldy(0x26);
      do {
        this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y) ^ 0x7F));
        this.dey();
        this.cpu.compare(this.cpu.y, 0x18);
      } while (this.carry());
      this.inx();
    } while (this.dec(zp_count) !== 0);
  }


  /** Lines 8 to 183 of the view, columns 1 to 22. */
  private invertView(): void {
    this.ldx(0x08);
    do {
      this.poke(ZP_MAIN.ptr2, this.lda(this.peek(TABLES.bmplineaddr_lo + this.cpu.x)));
      this.poke(ZP_MAIN.ptr2 + 1, this.lda(this.peek(TABLES.bmplineaddr_hi + this.cpu.x)));
      this.ldy(0x16);
      do {
        this.poke(this.pointer(ZP_MAIN.ptr2) + this.cpu.y, this.lda(this.peek(this.pointer(ZP_MAIN.ptr2) + this.cpu.y) ^ 0xFF));
      } while (this.dey() !== 0);
      this.inx();
      this.cpu.compare(this.cpu.x, 0xB8);
    } while (!this.carry());
  }
}


export const SHP5_MODULE = overlayModule('towne', 'SHP5', OVERLAY_ENTRY, SHP5_DATA, (machine: LiftedMachine): Shp5 => new Shp5(machine), (program: Shp5): Promise<Exit> => program.run());
