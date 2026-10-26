// towne/MIX.s: mixing reagents into spells, ported. A spell is chosen, reagents taken one by one
// into its mixture, and the mixture made if it is the spell's own; or it fizzles, the reagents spent
// all the same. ULT4's cmd_mix_reagents loads it at $8800.

import { DECIMAL } from '../../../lifted-runtime/cpu';
import type { LiftedMachine } from '../../../lifted-runtime/lifted-machine';
import { CHAR, JUMP_SUBS, ROST, STRINGS, ZP_MAIN } from '../../../state/symbols';
import { inline } from '../../inline-data';
import type { IInlineData } from '../../inline-data';
import type { Exit } from '../../routine';
import { OVERLAY_ENTRY, overlayModule, text } from '../overlay';
import { ShopOverlay } from './shop-overlay';

const J = JUMP_SUBS;
const zp_index: number = 0xD8;
const zp_display_line: number = 0xD9;
const zp_reagent_count: number = 0xEA;
const zp_reagent_index: number = 0xF0;
const OWNED_X: number = 0x1A;
const STATUS_X: number = 0x18;
const COLUMN_WIDTH: number = 0x05;
const COLUMNS_END: number = 0x24;

const MIX_TABLES = {
  mixture: 0x890B,
  bit_msb: 0x890C,
  prev_console_x: 0x8A07,
  prev_console_y: 0x8A08,
  spell: 0x8A09,
  mixture_table: 0x8A0B,
} as const;

const T = MIX_TABLES;

export const MIX_INLINE = {
  mix_reagents: text(0x8809, 'Mix reagents\n'),
  for_spell: text(0x881A, 'For spell:'),
  none: text(0x8832, 'NONE!\n'),
  reagent: text(0x885F, 'REAGENT:'),
  none_owned: text(0x8881, 'NONE OWNED!\n'),
  you_mix: text(0x88A8, 'YOU MIX THE\nREAGENTS AND...\n'),
  fizzles: text(0x88D3, 'IT FIZZLES!\n'),
  success: text(0x88E9, 'SUCCESS!\n'),
  reagents_title: inline(0x8937, [ 0x1E, 0xD2, 0xC5, 0xC1, 0xC7, 0xC5, 0xCE, 0xD4, 0xD3, 0x1D, 0x00 ]),
  mixtures_title: inline(0x899A, [ 0x1E, 0xCD, 0xC9, 0xD8, 0xD4, 0xD5, 0xD2, 0xC5, 0xD3, 0x1D, 0x00 ]),
} as const;

const I = MIX_INLINE;

/** Each spell's reagents, a bit for each from ash at $80 to mandrake at $01. */
export const MIXTURE_TABLE: readonly number[] = [
  0x60, 0x18, 0x60, 0xA4, 0x94, 0x84, 0x85, 0x50, 0x05, 0x07, 0x06, 0x80, 0x84, 0xA1, 0x88, 0xE0,
  0xC8, 0xF9, 0x50, 0x89, 0xA0, 0x03, 0x88, 0x98, 0x18, 0x18,
];

export const MIX_DATA: readonly IInlineData[] = [
  ...Object.values(MIX_INLINE),
  inline(T.mixture, [ 0x00 ]),
  inline(T.bit_msb, [ 0x80, 0x40, 0x20, 0x10, 0x08, 0x04, 0x02, 0x01 ]),
  inline(T.prev_console_x, [ 0x00, 0x00, 0x00 ]),
  inline(T.mixture_table, MIXTURE_TABLE),
];


export class Mix extends ShopOverlay {
  constructor(machine: LiftedMachine) {
    super(machine, null);
  }


  /** `jmp prompt_spell`, and round again from prompt_mix after each mixture until no spell is chosen. */
  public async run(): Promise<Exit> {
    let mixing: boolean = await this.promptSpell();

    while (mixing) {
      await this.displaySpells();
      await this.print(I.mix_reagents);
      mixing = await this.promptSpell();
    }

    return null;
  }


  private async promptSpell(): Promise<boolean> {
    await this.print(I.for_spell);
    await this.inputChar(true);
    this.subtract(CHAR.char_alpha_first);
    this.cmp(ROST.spells_max);
    const chosen: boolean = !this.carry();

    if (chosen) {
      await this.mixSpell();
    } else {
      await this.print(I.none);
      await this.m.call(J.j_clearstatwindow);
      await this.m.call(J.j_update_status);
    }

    return chosen;
  }


  private async mixSpell(): Promise<void> {
    let mixed: boolean = false;

    this.poke(T.spell, this.cpu.a);
    await this.printNewline();
    this.lda(this.peek(T.spell));
    this.add(STRINGS.string_spell_first);
    await this.m.call(J.j_printstring);
    await this.printNewline();
    this.poke(T.mixture, this.lda(0x00));
    while (!mixed) {
      await this.displayReagents();
      await this.print(I.reagent);
      await this.inputChar(true);
      this.cmp(CHAR.char_enter);
      if (this.zero()) {
        mixed = true;
      } else {
        await this.addReagent();
      }
    }
    await this.doMix();
  }


  /** A reagent the party has into the mixture, one spent. */
  private async addReagent(): Promise<void> {
    let owned: boolean = false;

    this.subtract(CHAR.char_alpha_first);
    this.cmp(ROST.reagent_max);
    if (!this.carry()) {
      this.ldy(this.cpu.a);
      owned = this.lda(this.peek(ROST.party_stats + ROST.party_stat_reagents + this.cpu.y)) !== 0;
    }
    if (owned) {
      this.cpu.setFlag(DECIMAL, true);
      this.subtract(0x01);
      this.cpu.setFlag(DECIMAL, false);
      this.poke(ROST.party_stats + ROST.party_stat_reagents + this.cpu.y, this.cpu.a);
      this.poke(T.mixture, this.lda(this.peek(T.bit_msb + this.cpu.y) | this.peek(T.mixture)));
    } else {
      await this.print(I.none_owned);
    }
  }


  private async doMix(): Promise<void> {
    await this.print(I.you_mix);
    this.ldy(this.peek(T.spell));
    this.lda(this.peek(T.mixture_table + this.cpu.y));
    this.cmp(this.peek(T.mixture));
    if (this.zero()) {
      await this.print(I.success);
      this.ldy(this.peek(T.spell));
      this.cpu.setFlag(DECIMAL, true);
      this.lda(this.peek(ROST.party_stats + ROST.party_stat_spells + this.cpu.y));
      this.add(0x01);
      if (this.carry()) {
        this.lda(0x99);
      }
      this.poke(ROST.party_stats + ROST.party_stat_spells + this.cpu.y, this.cpu.a);
      this.cpu.setFlag(DECIMAL, false);
    } else {
      await this.print(I.fizzles);
    }
    await this.printNewline();
  }


  /** The party's reagents in the status window, one line for each it has. */
  private async displayReagents(): Promise<void> {
    await this.m.call(J.j_clearstatwindow);
    this.saveConsoleXy(T.prev_console_x, T.prev_console_y);
    this.ldx(OWNED_X);
    this.ldy(0x00);
    this.poke(zp_reagent_index, this.cpu.y);
    await this.callWith(J.j_primm_xy, I.reagents_title);
    do {
      this.lda(this.peek(zp_reagent_index));
      this.ldy(this.add(ROST.party_stat_reagents));
      if (this.lda(this.peek(ROST.party_stats + this.cpu.y)) !== 0) {
        await this.reagentLine();
      }
      this.inc(zp_reagent_index);
      this.lda(this.peek(zp_reagent_index));
      this.cmp(ROST.reagent_max);
    } while (!this.carry());
    this.restoreConsoleXy(T.prev_console_x, T.prev_console_y);
  }


  private async reagentLine(): Promise<void> {
    this.poke(zp_reagent_count, this.cpu.a);
    this.inc(ZP_MAIN.console_ypos);
    this.poke(ZP_MAIN.console_xpos, this.lda(STATUS_X));
    this.lda(this.peek(zp_reagent_index));
    this.add(CHAR.char_alpha_first);
    await this.m.call(J.j_console_out);
    this.lda(this.peek(zp_reagent_count));
    this.cmp(0x10);
    if (this.carry()) {
      await this.m.call(J.j_printbcd);
    } else {
      this.lda(CHAR.char_hyphen);
      await this.m.call(J.j_console_out);
      this.lda(this.peek(zp_reagent_count));
      await this.m.call(J.j_printdigit);
    }
    this.lda(CHAR.char_hyphen);
    await this.m.call(J.j_console_out);
    this.lda(this.peek(zp_reagent_index));
    this.add(STRINGS.string_reagent_first);
    await this.m.call(J.j_printstring);
  }


  /** The party's mixtures in the status window, eight to a column, as many columns as fit. */
  private async displaySpells(): Promise<void> {
    await this.m.call(J.j_clearstatwindow);
    this.saveConsoleXy(T.prev_console_x, T.prev_console_y);
    this.ldx(OWNED_X);
    this.ldy(0x00);
    this.poke(zp_index, this.cpu.y);
    this.poke(zp_display_line, this.cpu.y);
    await this.callWith(J.j_primm_xy, I.mixtures_title);
    do {
      await this.spellLine();
      this.inc(zp_index);
      this.lda(this.peek(zp_index));
      this.cmp(ROST.spells_max);
    } while (!this.carry());
    this.restoreConsoleXy(T.prev_console_x, T.prev_console_y);
  }


  private async spellLine(): Promise<void> {
    this.lda(this.peek(zp_display_line));
    this.cpu.a = this.cpu.lsr(this.cpu.lsr(this.cpu.lsr(this.cpu.a)));
    this.ldx(COLUMN_WIDTH);
    await this.m.call(J.j_mulax);
    this.poke(ZP_MAIN.console_xpos, this.add(STATUS_X));
    this.cmp(COLUMNS_END);
    if (!this.carry()) {
      this.lda(this.peek(zp_display_line) & 0x07);
      this.poke(ZP_MAIN.console_ypos, this.cpu.a);
      this.inc(ZP_MAIN.console_ypos);
      this.ldy(this.peek(zp_index));
      if (this.lda(this.peek(ROST.party_stats + ROST.party_stat_spells + this.cpu.y)) !== 0) {
        this.lda(this.peek(zp_index));
        this.add(CHAR.char_alpha_first);
        await this.m.call(J.j_console_out);
        this.lda(CHAR.char_hyphen);
        await this.m.call(J.j_console_out);
        this.ldy(this.peek(zp_index));
        this.lda(this.peek(ROST.party_stats + ROST.party_stat_spells + this.cpu.y));
        await this.m.call(J.j_printbcd);
        this.inc(zp_display_line);
      }
    }
  }
}


export const MIX_MODULE = overlayModule('towne', 'MIX', OVERLAY_ENTRY, MIX_DATA, (machine: LiftedMachine): Mix => new Mix(machine), (program: Mix): Promise<Exit> => program.run());
