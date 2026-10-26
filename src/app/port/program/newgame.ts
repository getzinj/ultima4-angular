// NEWGAME.s: the story, the gypsy's seven questions and the new party, at $6400, ported. BOOT runs
// it and it runs ULT4, so nothing calls back into it, but it calls SUBS and SEL as the original
// does: the registers it hands them, and the stack's depth when primm_cout takes note of it, are
// the original's. Its variables, tables and strings stay at their addresses in NEWGAME's image
// (newgame-data.ts), and so do the operands its code rewrites, which the port reads back from there.

import { DECIMAL } from '../../lifted-runtime/cpu';
import { APPLE, CARDS, CHAR, JUMP_SUBS, JUMP_SYSTEM, MUSIC, PRTY, ROST, SUPER_PACKER, TABLES, ZP_MAIN } from '../../state/symbols';
import type { IInlineData } from '../inline-data';
import { PortProgram } from '../port-program';
import { SuperPacker } from './super-packer';
import { NEWGAME_INLINE, NEWGAME_STRING, NEWGAME_TABLES, NEWGAME_VARIABLES } from './newgame-data';

const V = NEWGAME_VARIABLES;
const T = NEWGAME_TABLES;
const I = NEWGAME_INLINE;
const J = JUMP_SUBS;
const SPK = SUPER_PACKER;
/** Where portal_appear keeps the picture under the portal. */
const SAVE_PORTAL_BACKGND: number = 0x6000;
const PORTAL_COL_MIN: number = 0x04;
const PORTAL_COL_MAX: number = 0x08;
const PORTAL_ROW_MIN: number = 0x2B;
const PORTAL_ROW_MAX: number = 0x46;
const MAX_SPK_COLUMN: number = 0x27;
const MAX_SPK_ROW: number = 0x8F;
const QUESTIONS: number = 0x07;
/** One turn of sound_portal_line's `dex` / `bne`. */
const FREQUENCY_CYCLES: number = 5;
/** The rest of a portal click's pass: `ldx` / `bit` / `dey` / `bne`, less the `bne` the pitch loop falls through. */
const PORTAL_PASS_CYCLES: number = 11;
/** Between one line's last click and the next line's first, measured, so the two do not fall on one cycle and cancel. */
const PORTAL_APPEAR_LINE_CYCLES: number = 82;
const PORTAL_VANISH_LINE_CYCLES: number = 163;

/** The scenes that do more than print: a picture shown and the next loaded, the portal, the music. */
const SCENE_PICTURES: ReadonlyMap<number, IInlineData> = new Map<number, IInlineData>([
  [ 0x24, I.load_tree_again ],
  [ 0x29, I.load_look ],
  [ 0x2D, I.load_fair ],
  [ 0x2F, I.load_wagon ],
  [ 0x32, I.load_gypsy ],
  [ 0x33, I.load_table ],
]);
/** start_scene's `jsr spk_unpack` sites, by scene. */
const UNPACK_SITES: ReadonlyMap<number, number> = new Map<number, number>([
  [ 0x24, 0x64A6 ], [ 0x29, 0x64CB ], [ 0x2D, 0x64FC ], [ 0x2F, 0x6521 ], [ 0x32, 0x6546 ], [ 0x33, 0x656B ], [ 0x35, 0x6590 ],
]);
const PORTAL_APPEAR: number = 0x21;
const PORTAL_VANISH: number = 0x23;
const MUSIC_TOWNE: number = 0x2C;
const THE_TABLE: number = 0x35;



export class Newgame extends PortProgram {
  /** NEWGAME.s's one entry: the story to the gypsy's table, her questions, and the party they make. */
  public async run(): Promise<void> {
    this.cpu.bit(this.peek(APPLE.hw_LCBANK1));
    this.cpu.bit(this.peek(APPLE.hw_LCBANK1));
    this.poke(V.question_number, this.lda(0x00));
    this.poke(ZP_MAIN.console_ypos, this.lda(0x10));
    await this.callWith(J.j_primm_cout, I.load_tree);
    await this.jsr(0x6453, (): void => this.clearTextArea());
    await this.jsr(0x6456, (): void => this.spkUnpack());
    this.poke(V.scene, this.lda(NEWGAME_STRING.first_scene));
    while (!(await this.scene())) {
      await this.jsr(0x6461, (): Promise<void> => this.waitKey());
      await this.jsr(0x6464, (): void => this.clearTextArea());
      this.lda(this.peek(V.scene));
    }
    await this.jsr(0x65AA, (): Promise<void> => this.waitKey());
    await this.fortuneTelling();
    await this.conclusion();
    await this.startGame();
  }


  private async startGame(): Promise<void> {
    this.poke(ZP_MAIN.key_buf_len, this.lda(0x00));
    this.lda(MUSIC.music_off);
    await this.m.call(JUMP_SYSTEM.music_ctl);
    await this.callWith(J.j_primm_cout, I.run_ult4);
    await this.waitKey();
  }


  private async waitKey(): Promise<void> {
    do {
      await this.m.call(J.j_waitkey);
    } while (!this.negative());
  }


  /** NEWGAME.s start_scene: the scene in A printed, and what comes with the next. True once the cards are on the table. */
  private async scene(): Promise<boolean> {
    await this.jsr(0x646A, (): Promise<void> => this.printString());
    this.inc(V.scene);
    const scene: number = this.lda(this.peek(V.scene));
    const picture: IInlineData | undefined = SCENE_PICTURES.get(scene);
    const unpackSite: number | undefined = UNPACK_SITES.get(scene);

    if (scene === PORTAL_APPEAR) {
      await this.jsr(0x6477, (): void => this.portalAppear());
    } else if (scene === PORTAL_VANISH) {
      await this.jsr(0x6481, (): void => this.portalVanish());
      await this.callWith(J.j_primm_cout, I.load_portal);
    } else if (scene === MUSIC_TOWNE) {
      this.lda(MUSIC.music_Towne);
      await this.m.call(JUMP_SYSTEM.music_ctl);
    } else if (unpackSite != null) {
      await this.jsr(unpackSite, (): void => this.spkUnpack());
      await this.callWith(J.j_primm_cout, picture ?? I.load_cards);
    }

    return scene === THE_TABLE;
  }


  // --- the gypsy (NEWGAME.s:166-388) ------------------------------------------------------

  private async fortuneTelling(): Promise<void> {
    this.poke(V.question_number, this.lda(0x00));
    this.ldx(0x07);
    this.lda(0x00);
    do {
      this.poke(V.card_eligible + this.cpu.x, this.cpu.a);
      this.dex();
    } while (!this.negative());
    do {
      await this.question();
      this.inc(V.question_number);
      this.lda(this.peek(V.question_number));
      this.cmp(QUESTIONS);
    } while (!this.zero());
  }


  /** One of the seven questions: two cards, the choice between their virtues, and the beads. */
  private async question(): Promise<void> {
    this.fillGreen();
    this.lda(this.peek(V.question_number));
    this.cmp(0x04);
    if (!this.zero()) {
      this.cmp(0x06);
    }
    if (this.zero()) {
      await this.jsr(0x65EE, (): void => this.markRunoffCards());
    }
    await this.jsr(0x65F1, (): void => this.clearTextArea());
    await this.pickCards();
    await this.showCards();
    await this.choose();
    this.ldy(this.peek(V.question_number));
    this.lda(0x00);
    await this.jsr(0x66EA, (): void => this.drawBead());
    this.ldx(this.peek(V.card_right));
    this.poke(V.card_eligible + this.cpu.x, this.lda(0xFF));
    this.ldy(this.peek(V.question_number));
    this.lda(0x01);
    await this.jsr(0x66FA, (): void => this.drawBead());
  }


  /** The green of the two card places, rows $0F-$7F. */
  private fillGreen(): void {
    this.ldx(0x0F);
    do {
      this.poke(ZP_MAIN.ptr1, this.lda(this.peek(TABLES.bmplineaddr_lo + this.cpu.x)));
      this.poke(ZP_MAIN.ptr1 + 1, this.lda(this.peek(TABLES.bmplineaddr_hi + this.cpu.x)));
      this.ldy(CARDS.card1_col_min);
      let more: boolean = true;

      while (more) {
        this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.lda(APPLE.gfx_green_even));
        this.iny();
        this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.lda(APPLE.gfx_green_odd));
        this.iny();
        this.cpu.compare(this.cpu.y, CARDS.card1_col_max);
        if (this.zero()) {
          this.ldy(CARDS.card2_col_min);
        } else {
          this.cpu.compare(this.cpu.y, 0x26);
          more = !this.carry();
        }
      }
      this.inx();
    } while (!this.negative());
  }


  /** Two different eligible cards, the lower on the left. */
  private async pickCards(): Promise<void> {
    await this.jsr(0x65F4, (): Promise<void> => this.chooseFreshCard());
    this.poke(V.card_left, this.cpu.x);
    do {
      await this.jsr(0x65FA, (): Promise<void> => this.chooseFreshCard());
      this.cpu.compare(this.cpu.x, this.peek(V.card_left));
    } while (this.zero());
    this.poke(V.card_right, this.cpu.x);
    this.cpu.compare(this.cpu.x, this.peek(V.card_left));
    if (!this.carry()) {
      this.ldy(this.peek(V.card_left));
      this.poke(V.card_left, this.cpu.x);
      this.poke(V.card_right, this.cpu.y);
    }
  }


  private async showCards(): Promise<void> {
    this.lda(this.peek(V.question_number));
    if (this.cpu.a === 0) {
      this.lda(NEWGAME_STRING.cards_first);
      await this.jsr(0x661A, (): Promise<void> => this.printString());
    } else {
      this.cmp(0x06);
      if (this.zero()) {
        this.lda(NEWGAME_STRING.cards_last);
        await this.jsr(0x662E, (): Promise<void> => this.printString());
      } else {
        this.lda(NEWGAME_STRING.cards_more);
        await this.jsr(0x6626, (): Promise<void> => this.printString());
      }
    }
    this.lda(NEWGAME_STRING.cards_of);
    await this.jsr(0x6633, (): Promise<void> => this.printString());
    this.lda(this.peek(V.card_left));
    this.add(NEWGAME_STRING.virtue_first);
    await this.jsr(0x663C, (): Promise<void> => this.printString());
    this.lda(this.peek(V.card_left));
    this.ldx(0x00);
    await this.jsr(0x6644, (): void => this.drawCard());
    await this.callWith(J.j_primm, I.and);
    this.lda(this.peek(V.card_right));
    this.add(NEWGAME_STRING.virtue_first);
    await this.jsr(0x6656, (): Promise<void> => this.printString());
    await this.callWith(J.j_primm, I.she_says);
    this.poke(ZP_MAIN.console_xpos, this.lda(0x00));
    this.inc(ZP_MAIN.console_ypos);
    await this.callWith(J.j_primm, I.consider_this);
    this.lda(this.peek(V.card_right));
    this.ldx(0x01);
    await this.jsr(0x6687, (): void => this.drawCard());
    await this.jsr(0x668A, (): Promise<void> => this.waitKey());
    await this.jsr(0x668D, (): void => this.clearTextArea());
    this.ldx(this.peek(V.card_left));
    this.lda(this.peek(T.question_table + this.cpu.x));
    this.add(this.peek(V.card_right));
    await this.jsr(0x669A, (): Promise<void> => this.printString());
  }


  /** A or B: the chosen virtue is set aside for the runoff and adds to the player's stats, in BCD. */
  private async choose(): Promise<void> {
    let chosen: boolean = false;

    while (!chosen) {
      await this.jsr(0x669D, (): Promise<void> => this.waitKey());
      this.cmp(CHAR.char_A);
      if (this.zero()) {
        chosen = true;
      } else {
        this.cmp(CHAR.char_B);
        if (this.zero()) {
          this.ldx(this.peek(V.card_right));
          this.ldy(this.peek(V.card_left));
          this.poke(V.card_left, this.cpu.x);
          this.poke(V.card_right, this.cpu.y);
          chosen = true;
        }
      }
    }
    this.ldx(this.peek(V.card_left));
    this.poke(V.card_chosen, this.cpu.x);
    this.poke(V.card_eligible + this.cpu.x, this.lda(0x01));
    this.setCarry(false);
    this.cpu.setFlag(DECIMAL, true);
    this.lda(this.peek(V.virtue_level + this.cpu.x));
    this.cpu.adc(0x05);
    this.poke(V.virtue_level + this.cpu.x, this.cpu.a);
    for (const [ stat, current ] of [ [ T.virtue_str, V.cur_str ], [ T.virtue_dex, V.cur_dex ], [ T.virtue_int, V.cur_int ] ]) {
      this.lda(this.peek(stat + this.cpu.x));
      this.cpu.adc(this.peek(current));
      this.poke(current, this.cpu.a);
    }
    this.cpu.setFlag(DECIMAL, false);
  }


  private async chooseFreshCard(): Promise<void> {
    do {
      await this.m.call(J.j_rand);
      this.ldx(this.lda(this.cpu.a & 0x07));
    } while (this.lda(this.peek(V.card_eligible + this.cpu.x)) !== 0);
  }


  /** Before the fifth and seventh questions, every card not discarded is eligible again. */
  private markRunoffCards(): void {
    this.ldx(0x07);
    do {
      if (!(this.lda(this.peek(V.card_eligible + this.cpu.x)) & 0x80)) {
        this.poke(V.card_eligible + this.cpu.x, this.lda(0x00));
      }
      this.dex();
    } while (!this.negative());
  }


  /** The farewell, the vertigo, and the new party: the chosen virtue's character, renamed, becomes player 1. */
  private async conclusion(): Promise<void> {
    await this.jsr(0x670A, (): void => this.clearTextArea());
    this.lda(NEWGAME_STRING.farewell);
    await this.jsr(0x670F, (): Promise<void> => this.printString());
    await this.jsr(0x6712, (): Promise<void> => this.waitKey());
    await this.jsr(0x6715, (): void => this.clearTextArea());
    this.lda(MUSIC.music_off);
    await this.m.call(JUMP_SYSTEM.music_ctl);
    this.lda(NEWGAME_STRING.transport);
    await this.jsr(0x671F, (): Promise<void> => this.printString());
    await this.jsr(0x6722, (): Promise<void> => this.waitKey());
    this.lda(MUSIC.music_off);
    await this.m.call(JUMP_SYSTEM.music_ctl);
    await this.callWith(J.j_primm_cout, I.load_party);
    this.poke(ZP_MAIN.game_mode_pre_combat, this.lda(this.peek(PRTY.game_mode)));
    this.poke(PRTY.game_mode, this.lda(PRTY.mode_suspended));
    this.poke(ZP_MAIN.curr_player, this.lda(this.peek(V.card_chosen)));
    this.inc(ZP_MAIN.curr_player);
    await this.m.call(J.j_get_stats_ptr);
    this.poke(ZP_MAIN.ptr2, this.lda(this.peek(ZP_MAIN.ptr1)));
    this.poke(ZP_MAIN.ptr2 + 1, this.lda(this.peek(ZP_MAIN.ptr1 + 1)));
    this.poke(ZP_MAIN.curr_player, this.lda(0x01));
    await this.m.call(J.j_get_stats_ptr);
    this.writePlayer();
    this.ldx(ROST.virtue_last - 1);
    do {
      this.poke(ROST.party_stats + this.cpu.x, this.lda(this.peek(V.virtue_level + this.cpu.x)));
      this.dex();
    } while (!this.negative());
    this.poke(PRTY.party_size, this.lda(0x01));
    this.ldx(this.peek(V.card_chosen));
    this.poke(PRTY.player_xpos, this.lda(this.peek(T.start_world_x + this.cpu.x)));
    this.poke(PRTY.player_ypos, this.lda(this.peek(T.start_world_y + this.cpu.x)));
  }


  /** Player 1 swaps records with the chosen class's, and takes the name, sex and stats. */
  private writePlayer(): void {
    const player: number = this.pointer(ZP_MAIN.ptr1);
    const chosen: number = this.pointer(ZP_MAIN.ptr2);

    this.ldy(ROST.player_stat_max);
    do {
      this.cpu.push(this.lda(this.peek(player + this.cpu.y)));
      this.poke(player + this.cpu.y, this.lda(this.peek(chosen + this.cpu.y)));
      this.poke(chosen + this.cpu.y, this.lda(this.cpu.pull()));
      this.dey();
    } while (!this.negative());
    this.ldy(0x0F);
    do {
      this.poke(player + this.cpu.y, this.lda(this.peek(TABLES.inbuffer + this.cpu.y)));
      this.dey();
    } while (!this.negative());
    this.ldy(ROST.player_gender);
    this.poke(player + this.cpu.y, this.lda(this.peek(ZP_MAIN.gender_chosen)));
    this.setCarry(false);
    for (const [ field, value ] of [ [ ROST.player_strength, V.cur_str ], [ ROST.player_dexterity, V.cur_dex ], [ ROST.player_intelligence, V.cur_int ] ]) {
      this.ldy(field);
      this.poke(player + this.cpu.y, this.lda(this.peek(value)));
    }
  }


  // --- pictures and words (NEWGAME.s:429-565, 708-1000) -----------------------------------

  /** One line of the portal, rising or falling, sounded at a pitch that follows its row; ptr1 to the row. */
  private soundPortalLine(): void {
    this.ldy(0x28);
    this.cpu.bit(this.peek(APPLE.hw_SPEAKER));
    do {
      this.ldx(this.peek(ZP_MAIN.temp_y));
      this.cpu.cycles = this.cpu.cycles + PORTAL_PASS_CYCLES + (FREQUENCY_CYCLES * ((this.cpu.x === 0) ? 0x100 : this.cpu.x));
      this.ldx(0x00);
      this.cpu.bit(this.peek(APPLE.hw_SPEAKER));
    } while (this.dey() !== 0);
    this.setPtr1Line();
  }


  private setPtr1Line(): void {
    this.ldx(this.peek(ZP_MAIN.temp_y));
    this.poke(ZP_MAIN.ptr1 + 1, this.lda(this.peek(TABLES.bmplineaddr_hi + this.cpu.x)));
    this.poke(ZP_MAIN.ptr1, this.lda(this.peek(TABLES.bmplineaddr_lo + this.cpu.x)));
  }


  private incPtr2(): void {
    if (this.inc(ZP_MAIN.ptr2) === 0) {
      this.inc(ZP_MAIN.ptr2 + 1);
    }
  }


  /** The picture under the portal kept at $6000, and the portal drawn upward in blue. */
  private portalAppear(): void {
    this.poke(ZP_MAIN.ptr2, this.lda(SAVE_PORTAL_BACKGND & 0xFF));
    this.poke(ZP_MAIN.ptr2 + 1, this.lda(SAVE_PORTAL_BACKGND >> 8));
    this.ldx(PORTAL_ROW_MIN);
    this.poke(ZP_MAIN.temp_y, this.cpu.x);
    do {
      this.setPtr1Line();
      this.ldy(PORTAL_COL_MIN);
      this.ldx(0x00);
      do {
        this.poke(this.pointer(ZP_MAIN.ptr2), this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y)));
        this.incPtr2();
        this.iny();
        this.cpu.compare(this.cpu.y, PORTAL_COL_MAX);
      } while (!this.carry());
      this.inc(ZP_MAIN.temp_y);
      this.lda(this.peek(ZP_MAIN.temp_y));
      this.cmp(PORTAL_ROW_MAX);
    } while (!this.carry());
    this.dec(ZP_MAIN.temp_y);
    do {
      this.soundPortalLine();
      this.ldy(PORTAL_COL_MIN);
      this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.lda(APPLE.gfx_blue_even));
      this.iny();
      this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.lda(APPLE.gfx_blue_odd));
      this.iny();
      this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.lda(APPLE.gfx_blue_even));
      this.cpu.cycles = this.cpu.cycles + PORTAL_APPEAR_LINE_CYCLES;
      this.dec(ZP_MAIN.temp_y);
      this.lda(this.peek(ZP_MAIN.temp_y));
      this.cmp(PORTAL_ROW_MIN);
    } while (this.carry());
  }


  /** The portal sinks away, the picture under it put back from $6000. */
  private portalVanish(): void {
    this.poke(ZP_MAIN.ptr2, this.lda(SAVE_PORTAL_BACKGND & 0xFF));
    this.poke(ZP_MAIN.ptr2 + 1, this.lda(SAVE_PORTAL_BACKGND >> 8));
    this.ldx(PORTAL_ROW_MIN);
    this.poke(ZP_MAIN.temp_y, this.cpu.x);
    do {
      this.soundPortalLine();
      this.ldy(PORTAL_COL_MIN);
      this.ldx(0x00);
      do {
        this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.lda(this.peek(this.pointer(ZP_MAIN.ptr2))));
        this.incPtr2();
        this.iny();
        this.cpu.compare(this.cpu.y, PORTAL_COL_MAX);
      } while (!this.carry());
      this.cpu.cycles = this.cpu.cycles + PORTAL_VANISH_LINE_CYCLES;
      this.inc(ZP_MAIN.temp_y);
      this.lda(this.peek(ZP_MAIN.temp_y));
      this.cmp(PORTAL_ROW_MAX);
    } while (!this.carry());
  }


  /** Rows $90-$BF cleared, and the console to the start of row $12. */
  private clearTextArea(): void {
    this.ldx(0xBF);
    do {
      this.poke(ZP_MAIN.ptr1, this.lda(this.peek(TABLES.bmplineaddr_lo + this.cpu.x)));
      this.poke(ZP_MAIN.ptr1 + 1, this.lda(this.peek(TABLES.bmplineaddr_hi + this.cpu.x)));
      this.lda(0x00);
      this.ldy(0x27);
      do {
        this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.cpu.a);
        this.dey();
      } while (!this.negative());
      this.dex();
      this.cpu.compare(this.cpu.x, 0x90);
    } while (this.carry());
    this.poke(ZP_MAIN.console_xpos, this.lda(0x00));
    this.poke(ZP_MAIN.console_ypos, this.lda(0x12));
  }


  /** String A of the table at the console, $FF starting a new line. */
  private async printString(): Promise<void> {
    this.ldy(this.cpu.a);
    this.poke(ZP_MAIN.ptr1, this.lda(T.string_table & 0xFF));
    this.poke(ZP_MAIN.ptr1 + 1, this.lda(T.string_table >> 8));
    this.ldx(0x00);
    let found: boolean = false;

    while (!found) {
      if (this.lda(this.peek(this.pointer(ZP_MAIN.ptr1))) === 0) {
        found = this.dey() === 0;
      }
      if (!found) {
        this.incPtr1();
      }
    }
    let done: boolean = false;

    while (!done) {
      this.incPtr1();
      this.ldx(0x00);
      if (this.lda(this.peek(this.pointer(ZP_MAIN.ptr1))) === 0) {
        done = true;
      } else {
        this.cmp(0xFF);
        if (this.zero()) {
          this.inc(ZP_MAIN.console_ypos);
          this.poke(ZP_MAIN.console_xpos, this.lda(0x00));
        } else {
          await this.m.call(J.j_console_out);
        }
      }
    }
  }


  private incPtr1(): void {
    if (this.inc(ZP_MAIN.ptr1) === 0) {
      this.inc(ZP_MAIN.ptr1 + 1);
    }
  }


  /** A bead on the abacus: A white (0) or black (1), X the virtue's column, Y the question's row. */
  private drawBead(): void {
    this.cpu.push(this.cpu.a);
    this.poke(CARDS.draw_row, this.lda(this.peek(T.bead_row + this.cpu.y)));
    this.poke(CARDS.draw_col, this.lda(this.peek(T.bead_col + this.cpu.x)));
    this.cpu.a = this.cpu.lsr(this.cpu.a);
    this.lda(this.cpu.pull());
    this.cpu.a = this.cpu.rol(this.cpu.a);
    this.cpu.a = this.cpu.asl(this.cpu.a);
    this.ldx(this.cpu.a);
    this.poke(V.bead_src, this.lda(this.peek(T.bead_addr + this.cpu.x)));
    this.poke(V.bead_src + 1, this.lda(this.peek(T.bead_addr + 1 + this.cpu.x)));
    this.ldx(0x00);
    do {
      this.ldy(this.peek(CARDS.draw_row));
      this.poke(CARDS.draw_ptr, this.lda(this.peek(TABLES.bmplineaddr_lo + this.cpu.y)));
      this.poke(CARDS.draw_ptr + 1, this.lda(this.peek(TABLES.bmplineaddr_hi + this.cpu.y)));
      this.ldy(this.peek(CARDS.draw_col));
      this.poke(this.pointer(CARDS.draw_ptr) + this.cpu.y, this.lda(this.peek(this.patchedWord(V.bead_src) + this.cpu.x)));
      this.inc(CARDS.draw_row);
      this.inx();
      this.cpu.compare(this.cpu.x, 0x0E);
    } while (!this.carry());
  }


  /** Card A from CRDS, on the left (X = 0) or the right (X = 1). */
  private drawCard(): void {
    this.cpu.push(this.cpu.a);
    this.poke(CARDS.draw_row, this.lda(CARDS.card_row_top));
    this.poke(CARDS.draw_col, this.lda(this.peek(T.card_col_table + this.cpu.x)));
    this.lda(this.cpu.pull());
    this.cpu.a = this.cpu.asl(this.cpu.a);
    this.ldx(this.cpu.a);
    this.poke(V.card_src, this.lda(this.peek(T.card_addr + this.cpu.x)));
    this.poke(V.card_src + 1, this.lda(this.peek(T.card_addr + 1 + this.cpu.x)));
    this.ldx(0x00);
    do {
      this.ldy(this.peek(CARDS.draw_row));
      this.poke(CARDS.draw_ptr, this.lda(this.peek(TABLES.bmplineaddr_lo + this.cpu.y)));
      this.poke(CARDS.draw_ptr + 1, this.lda(this.peek(TABLES.bmplineaddr_hi + this.cpu.y)));
      this.poke(CARDS.col_count, this.lda(CARDS.card_col_count));
      this.ldy(this.peek(CARDS.draw_col));
      do {
        this.poke(this.pointer(CARDS.draw_ptr) + this.cpu.y, this.lda(this.peek(this.patchedWord(V.card_src) + this.cpu.x)));
        if (this.inx() === 0) {
          this.inc(V.card_src + 1);
        }
        this.iny();
      } while (this.dec(CARDS.col_count) !== 0);
      this.inc(CARDS.draw_row);
      this.lda(this.peek(CARDS.draw_row));
      this.cmp(CARDS.card_row_bottom);
    } while (!this.zero());
  }


  /** Super-Packer: the picture packed at $4000 onto the screen, column by column from the right, each from the bottom up. */
  private spkUnpack(): void {
    const packer: SuperPacker = new SuperPacker(this.m, false);

    this.poke(ZP_MAIN.ptr2 + 1, this.lda(APPLE.screen_HGR2 >> 8));
    this.ldx(0x00);
    this.poke(SPK.spk_repeat_flag, this.cpu.x);
    this.poke(SPK.spk_pattern_flag, this.cpu.x);
    this.poke(ZP_MAIN.ptr2, this.cpu.x);
    this.poke(SPK.spk_pattern_len_cur, this.cpu.x);
    this.poke(SPK.spk_repeat_code, this.lda(this.peek(this.pointer(ZP_MAIN.ptr2))));
    this.inc(ZP_MAIN.ptr2);
    this.poke(SPK.spk_pattern_code, this.lda(this.peek(this.pointer(ZP_MAIN.ptr2))));
    this.inc(ZP_MAIN.ptr2);
    this.ldy(MAX_SPK_COLUMN);
    do {
      this.ldx(MAX_SPK_ROW);
      this.poke(SPK.spk_row, this.cpu.x);
      do {
        this.poke(ZP_MAIN.ptr1, this.lda(this.peek(TABLES.bmplineaddr_lo + this.cpu.x)));
        this.poke(ZP_MAIN.ptr1 + 1, this.lda(this.peek(TABLES.bmplineaddr_hi + this.cpu.x)));
        packer.writeByte();
        this.dec(SPK.spk_row);
        this.ldx(this.peek(SPK.spk_row));
        this.cpu.compare(this.cpu.x, 0xFF);
      } while (!this.zero());
      this.dey();
      this.cpu.compare(this.cpu.y, 0xFF);
    } while (!this.zero());
  }

}
