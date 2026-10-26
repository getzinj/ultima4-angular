// underworld/END.s: the Codex's chamber, ported. USE BRUNs it at the Abyss's last altar. Without the
// key of three parts, the word of passage, eight in the party and every virtue at its height, the
// party is sent back to the Abyss's entrance; then the voice asks after the eight virtues and the
// three principles, each answered drawn from CSTRING's packed images, and a wrong answer sends the
// party to the shrine or castle of that question; the last asks for infinity, and with it the
// Codex is revealed, the end told and the game halted. END keeps its strings and variables in its
// own image (end-data.ts), and so do the operands it rewrites.

import type { LiftedMachine } from '../../../lifted-runtime/lifted-machine';
import { APPLE, CHAR, CSTRING, DISKS, JUMP_OVERLAY, JUMP_SUBS, JUMP_SYSTEM, MUSIC, PRTY, ROST, TABLES, ZP_MAIN } from '../../../state/symbols';
import type { IInlineData } from '../../inline-data';
import { PortProgram } from '../../port-program';
import type { Exit } from '../../routine';
import { OVERLAY_ENTRY, overlayModule } from '../overlay';
import { END_DATA, END_ENTRIES, END_INLINE, END_TABLES, END_VARIABLES } from './end-data';

const I = END_INLINE;
const J = JUMP_SUBS;
const T = END_TABLES;
const V = END_VARIABLES;
const zp_input_index: number = 0xEA;
const end_left: number = 0xF9;
const end_right: number = 0xFA;
const cur_row: number = 0xFB;
/** Super-Packer's zero page. */
const spk_pattern_ptr: number = 0xB0;
const spk_byte: number = 0xB2;
const spk_pattern_length: number = 0xB3;
const spk_repeat_code: number = 0xB4;
const spk_pattern_code: number = 0xB5;
const spk_row: number = 0xB6;
const spk_repeat_count: number = 0xB7;
const spk_repeat_flag: number = 0xB8;
const spk_pattern_count: number = 0xB9;
const spk_pattern_flag: number = 0xBA;
const spk_pattern_len_cur: number = 0xBB;
const MAX_SPK_COL: number = 0x16;
const MAX_SPK_ROW: number = 0xB7;
const MIN_SPK_ROW: number = 0x07;
const CSTRING_ADDRESS: number = 0x4000;
/** The world places a party sent back goes to: the Abyss's entrance, and Lord British's castle. */
const TO_THE_ABYSS: number = 0x0C;
const TO_CASTLE_BRITANNIA: number = 0x0B;
const VIRTUES_ASKED: number = 0x09;
const FINAL_QUESTION: number = 0x0C;
const INPUT_MAX: number = 0x0E;
const INPUT_LENGTH: number = 0x0F;
const SHAKE_ROWS: number = 0xAE;
/** delay: its loops of $C0 times $FF, each round a `pha` / `pla`, for each count in A; and its call. */
const DELAY_CYCLES_PER_COUNT: number = 539_721;
const DELAY_CYCLES: number = 9;
/** begin_scroll's pause between steps, $FF times $FF. */
const SCROLL_DELAY_CYCLES: number = 261_632;
const HALT_CYCLES: number = 3;

/** spk_write_byte's labels, where its branches go. */
type SpkLabel = 'read_byte' | 'set_repeat' | 'check_pattern' | 'do_literal' | 'do_repeat' | 'do_pattern' | 'pattern_literal' | 'next_pattern' | 'done';


export class End extends PortProgram {
  constructor(machine: LiftedMachine) {
    super(machine);
  }


  /** $8800, by USE's BRUN: the two frames it leaves dropped, CSTRING loaded, and the chamber. */
  public async run(): Promise<Exit> {
    let exit: Exit;

    for (let pull: number = 0; pull < 4; pull++) {
      this.lda(this.cpu.pull());
    }
    this.cpu.bit(this.peek(APPLE.hw_LCBANK1));
    this.cpu.bit(this.peek(APPLE.hw_LCBANK1));
    await this.callWith(J.j_primm_cout, I.bload_cstring);
    this.poke(V.save_party_size, this.lda(this.peek(PRTY.party_size)));
    this.poke(PRTY.party_size, this.lda(0x01));
    this.poke(PRTY.game_mode, this.lda(PRTY.mode_suspended));
    await this.m.call(J.j_update_status);
    await this.m.call(J.j_clearview);
    await this.print(I.darkness);
    this.delay(0x04);
    this.drawSpk(CSTRING.spk_LOCK);
    this.lda(this.peek(ROST.threepartkey) & ROST.key3_have_all);
    this.cmp(ROST.key3_have_all);
    if (this.zero()) {
      exit = await this.passage();
    } else {
      await this.print(I.no_key);
      exit = await this.returnToWorld(TO_THE_ABYSS);
    }

    return exit;
  }


  /** The key used and the word of passage asked for; then a leader of eight, and an avatar in every virtue. */
  private async passage(): Promise<Exit> {
    let exit: Exit;
    let granted: boolean = false;

    await this.print(I.use_key);
    this.delay(0x03);
    await this.print(I.word_of_passage);
    await this.getInput();
    this.matchInputInline(I.veramocor);
    this.cpu.php();
    this.delay(0x03);
    this.cpu.plp();
    if (this.zero()) {
      this.lda(this.peek(V.save_party_size));
      this.cmp(0x08);
      if (!this.zero()) {
        await this.print(I.not_leader);
        this.delay(0x08);
      } else {
        granted = this.allAvatar();
        if (!granted) {
          await this.print(I.not_ready);
        }
      }
    }
    if (granted) {
      await this.print(I.granted);
      this.delay(0x05);
      await this.m.call(J.j_clearview);
      exit = await this.questions();
    } else {
      await this.print(I.not_granted);
      exit = await this.returnToWorld(TO_THE_ABYSS);
    }

    return exit;
  }


  /** `ldy #virtue_last - 1` / `lda party_stats,y` / `bne`: every virtue at 0, its height. */
  private allAvatar(): boolean {
    let avatar: boolean = true;

    this.ldy(ROST.virtue_last - 1);
    do {
      avatar = this.lda(this.peek(ROST.party_stats + this.cpu.y)) === 0;
    } while (avatar && (this.dey() < 0x80));

    return avatar;
  }


  /** The eight virtues and the three principles, each answered drawn; then the last question. */
  private async questions(): Promise<Exit> {
    let exit: Exit = null;

    this.poke(V.question_number, this.lda(0x01));
    while (exit == null) {
      if (!await this.voiceAsks()) {
        await this.print(I.not_complete);
        this.dec(V.question_number);
        exit = await this.returnToWorld(this.lda(this.peek(V.question_number)));
      } else {
        this.ldx(this.peek(V.question_number));
        this.dex();
        this.lda(this.cpu.x);
        this.drawSpk(this.cpu.a);
        this.inc(V.question_number);
        this.lda(this.peek(V.question_number));
        this.cmp(VIRTUES_ASKED);
        if (this.zero()) {
          this.delay(0x03);
          await this.print(I.voice_says);
          this.delay(0x03);
          await this.print(I.well_versed);
          this.delay(0x05);
        } else {
          this.cmp(FINAL_QUESTION);
          if (this.carry()) {
            exit = await this.finalQuestion();
          }
        }
      }
    }

    return exit;
  }


  private async finalQuestion(): Promise<Exit> {
    let exit: Exit;

    await this.print(I.rumbles);
    await this.shakeScreen();
    await this.shakeScreen();
    this.delay(0x05);
    await this.print(I.above_the_din);
    await this.printString(this.peek(V.question_number));
    await this.waitkey();
    this.inc(V.question_number);
    if (await this.inputAnswer()) {
      exit = await this.gameOverWin();
    } else {
      await this.print(I.not_know);
      exit = await this.returnToWorld(TO_CASTLE_BRITANNIA);
    }

    return exit;
  }


  /** game_over_win: the door opened, the Codex revealed and the end told, a key after each page; the turns taken; and the halt. */
  private async gameOverWin(): Promise<Exit> {
    this.delay(0x02);
    for (let shake: number = 0; shake < 4; shake++) {
      await this.shakeScreen();
    }
    this.delay(0x03);
    this.animOpenDoor();
    this.delay(0x03);
    await this.print(I.codex);
    this.lda(MUSIC.music_British);
    await this.m.call(JUMP_SYSTEM.music_ctl);
    await this.waitkey();
    for (const page of [ I.truly_good, I.endless_quest, I.living_gift, I.stray, I.return_now ]) {
      await this.print(page);
      await this.waitkey();
    }
    await this.m.call(J.j_clearview);
    await this.print(I.vertigo);
    await this.waitkey();
    this.drawSpk(CSTRING.spk_WIN);
    for (const page of [ I.circle_of_stones, I.the_ankh, I.the_gates ]) {
      await this.print(page);
      await this.waitkey();
    }
    await this.print(I.congratulations);
    this.poke(V.leading_spaces, this.lda(0x00));
    for (let digits: number = 0; digits < 4; digits++) {
      await this.printBcd(this.peek(PRTY.move_counter + digits));
    }
    await this.print(I.turns);

    return END_ENTRIES.halt;
  }


  /** halt: `jmp halt`, for ever. */
  public halt(): Exit {
    this.cpu.cycles = this.cpu.cycles + HALT_CYCLES;

    return END_ENTRIES.halt;
  }


  private async printBcd(value: number): Promise<void> {
    this.lda(value);
    this.cpu.push(this.cpu.a);
    await this.printDigit(this.div16(this.cpu.a));
    this.lda(this.cpu.pull());
    await this.printDigit(this.lda(this.cpu.a & 0x0F));
  }


  /** A digit, leading zeroes as spaces. */
  private async printDigit(digit: number): Promise<void> {
    let show: boolean = true;

    this.cmp(0x00);
    if (!this.zero()) {
      this.inc(V.leading_spaces);
    } else if (this.ldx(this.peek(V.leading_spaces)) === 0) {
      this.lda(CHAR.char_space);
      show = false;
    }
    if (show) {
      this.lda(digit);
      this.add(CHAR.char_num_first);
    }
    await this.m.call(J.j_console_out);
  }


  /** return_to_world: ULT4 loaded again from the program disk, and the party, as many as came, at the world place `place` names. */
  private async returnToWorld(place: number): Promise<Exit> {
    this.cpu.push(place);
    this.delay(0x05);
    await this.print(I.newline);
    await this.insertDisk(DISKS.disk_program);
    await this.callWith(J.j_primm_cout, I.bload_ult4);
    this.lda(DISKS.disk_britannia);
    await this.m.call(J.j_request_disk);
    this.lda(this.cpu.pull());
    this.ldy(this.cpu.a);
    this.poke(PRTY.player_ypos, this.lda(this.peek(T.world_location_y + this.cpu.y)));
    this.poke(PRTY.player_xpos, this.lda(this.peek(T.world_location_x + this.cpu.y)));
    this.poke(PRTY.party_size, this.lda(this.peek(V.save_party_size)));
    this.poke(PRTY.current_location, this.lda(PRTY.loc_world));
    this.poke(PRTY.game_mode, this.lda(PRTY.mode_world));
    await this.m.call(J.j_player_teleport);

    return JUMP_OVERLAY.j_game_init;
  }


  /** insert_disk: `disk` in its drive, the player asked for it until the drive holds it. */
  private async insertDisk(disk: number): Promise<void> {
    let loaded: boolean = false;

    this.poke(ZP_MAIN.reqdisk, this.lda(disk));
    while (!loaded) {
      if (!this.inDrive()) {
        await this.print(I.place_disk);
        this.lda(this.peek(ZP_MAIN.currdrive));
        await this.m.call(J.j_printdigit);
        await this.print(I.press_esc);
        do {
          await this.m.call(J.j_waitkey);
          this.cmp(CHAR.char_ESC);
        } while (!this.zero());
      }
      this.lda(this.peek(ZP_MAIN.currdrive));
      this.poke(V.drive_number, this.add(CHAR.char_num_first));
      await this.callWith(J.j_primm_cout, I.bload_disk);
      this.ldx(this.peek(ZP_MAIN.currdrive));
      this.poke(ZP_MAIN.numdrives + this.cpu.x, this.lda(this.peek(ZP_MAIN.disk_id)));
      this.cmp(this.peek(ZP_MAIN.reqdisk));
      loaded = this.zero();
    }
  }


  /** The drive the requested disk goes in, in currdrive: the second, if there is one, for Britannia's and the dungeons'; true if it is there already. */
  private inDrive(): boolean {
    let second: boolean = false;

    this.lda(this.peek(ZP_MAIN.reqdisk));
    this.cmp(DISKS.disk_britannia);
    if (!this.zero()) {
      this.cmp(DISKS.disk_dungeon);
    }
    if (this.zero()) {
      this.lda(this.peek(ZP_MAIN.numdrives));
      this.cmp(0x02);
      second = this.carry();
    }
    this.poke(ZP_MAIN.currdrive, this.lda(second ? 0x02 : 0x01));
    this.lda(this.peek(ZP_MAIN.reqdisk));
    this.cmp(this.peek(second ? ZP_MAIN.currdisk_drive2 : ZP_MAIN.currdisk_drive1));

    return this.zero();
  }


  /** voice_asks: the voice, and input_answer; true (Z set) if the answer is right. */
  private async voiceAsks(): Promise<boolean> {
    this.delay(0x02);
    await this.print(I.voice_asks);

    return this.inputAnswer();
  }


  /** input_answer: the question, an answer typed, and it compared with the question's word, its first four letters. */
  private async inputAnswer(): Promise<boolean> {
    this.delay(0x02);
    await this.printString(this.peek(V.question_number));
    await this.getInput();
    this.lda(this.peek(V.question_number));
    this.subtract(0x01);
    this.cpu.a = this.cpu.asl(this.cpu.asl(this.cpu.a));
    this.poke(ZP_MAIN.ptr1, this.add(T.answer_table & 0xFF));
    this.lda(T.answer_table >> 8);
    this.cpu.adc(0x00);
    this.poke(ZP_MAIN.ptr1 + 1, this.cpu.a);
    this.ldy(0x03);
    do {
      this.poke(V.keyword_compare + this.cpu.y, this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y)));
    } while (this.dey() < 0x80);

    return this.matchInputInline(END_INLINE_KEYWORD);
  }


  private async waitkey(): Promise<void> {
    do {
      await this.m.call(J.j_waitkey);
    } while (!this.negative());
  }


  /** delay: A counts of a pause, the time it takes passed on the clock. */
  private delay(counts: number): void {
    this.lda(counts);
    this.cpu.cycles = this.cpu.cycles + (counts * DELAY_CYCLES_PER_COUNT) + DELAY_CYCLES;
    this.poke(ZP_MAIN.ptr1, 0x00);
    this.ldy(0x00);
    this.ldx(0x00);
  }


  /**
   * match_input_inline: `block`, the string after the JSR, against what was typed, as far as the
   * string goes; true (A 0, Z set) if each letter matched. The pointer it steps and the mismatch
   * are left in its image.
   */
  private matchInputInline(block: IInlineData): boolean {
    let pointer: number = block.address - 1;
    let more: boolean = true;

    this.poke(V.match_mismatch, this.lda(0x00));
    this.ldx(0xFF);
    while (more) {
      pointer = (pointer + 1) & 0xFFFF;
      this.poke(V.match_pointer, pointer & 0xFF);
      this.poke(V.match_pointer + 1, pointer >> 8);
      this.inx();
      if (this.lda(this.peek(pointer)) === 0) {
        more = false;
      } else {
        this.cmp(this.peek(TABLES.inbuffer + this.cpu.x));
        if (!this.zero()) {
          this.poke(V.match_mismatch, this.lda(0x01));
        }
      }
    }
    this.lda(this.peek(V.match_mismatch));

    return this.zero();
  }


  /** get_input: a word typed after a question mark, fourteen letters at most, the rest of the buffer zeroed. */
  private async getInput(): Promise<void> {
    let done: boolean = false;

    this.poke(zp_input_index, this.lda(0x00));
    this.lda(CHAR.char_question);
    await this.m.call(J.j_console_out);
    while (!done) {
      await this.waitkey();
      this.cmp(CHAR.char_enter);
      if (this.zero()) {
        done = this.ldx(this.peek(zp_input_index)) !== 0;
      } else {
        this.cmp(CHAR.char_left_arrow);
        if (this.zero()) {
          await this.backspace();
        } else {
          this.cmp(CHAR.char_space);
          if (this.carry()) {
            this.ldx(this.peek(zp_input_index));
            this.cpu.compare(this.cpu.x, INPUT_MAX);
            if (!this.zero()) {
              this.poke(TABLES.inbuffer + this.cpu.x, this.cpu.a);
              await this.m.call(J.j_console_out);
              this.inc(zp_input_index);
            }
          }
        }
      }
    }
    this.lda(0x00);
    do {
      this.poke(TABLES.inbuffer + this.cpu.x, this.cpu.a);
      this.inx();
      this.cpu.compare(this.cpu.x, INPUT_LENGTH);
    } while (!this.carry());
    this.lda(CHAR.char_enter);
    await this.m.call(J.j_console_out);
  }


  private async backspace(): Promise<void> {
    if (this.lda(this.peek(zp_input_index)) !== 0) {
      this.dec(zp_input_index);
      this.lda(CHAR.char_space);
      await this.m.call(J.j_console_out);
      this.dec(ZP_MAIN.console_xpos);
      this.dec(ZP_MAIN.console_xpos);
      this.lda(CHAR.char_space);
      await this.m.call(J.j_console_out);
      this.dec(ZP_MAIN.console_xpos);
    }
  }


  private async print(block: IInlineData): Promise<void> {
    await this.callWith(J.j_primm, block);
  }


  // --- the screen (END.s:684-889) ----------------------------------------------------------------

  /** shake_screen: the view a line up and back down, four times. */
  private async shakeScreen(): Promise<void> {
    for (let shake: number = 0; shake < 4; shake++) {
      await this.shakeUp();
      await this.shakeDown();
    }
  }


  private async shakeDown(): Promise<void> {
    this.ldx(SHAKE_ROWS);
    do {
      await this.shakeRow(9, 7);
    } while (this.dex() !== 0);
  }


  private async shakeUp(): Promise<void> {
    this.ldx(0x00);
    do {
      await this.shakeRow(8, 10);
      this.inx();
      this.cpu.compare(this.cpu.x, SHAKE_ROWS);
    } while (!this.carry());
  }


  /** Row X + `to` of the view copied from row X + `from`, and now and then a click with the sound on. */
  private async shakeRow(to: number, from: number): Promise<void> {
    this.poke(ZP_MAIN.ptr1, this.lda(this.peek(TABLES.bmplineaddr_lo + to + this.cpu.x)));
    this.poke(ZP_MAIN.ptr1 + 1, this.lda(this.peek(TABLES.bmplineaddr_hi + to + this.cpu.x)));
    this.poke(ZP_MAIN.ptr2, this.lda(this.peek(TABLES.bmplineaddr_lo + from + this.cpu.x)));
    this.poke(ZP_MAIN.ptr2 + 1, this.lda(this.peek(TABLES.bmplineaddr_hi + from + this.cpu.x)));
    this.ldy(MAX_SPK_COL);
    do {
      this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.lda(this.peek(this.pointer(ZP_MAIN.ptr2) + this.cpu.y)));
    } while (this.dey() !== 0);
    this.cpu.bit(this.peek(ZP_MAIN.sfx_volume));
    if (this.negative()) {
      await this.m.call(J.j_rand);
      if (!this.negative()) {
        this.cpu.bit(this.peek(APPLE.hw_SPEAKER));
      }
    }
  }


  /** print_string: string A of the table, counting its terminators to it. */
  private async printString(number: number): Promise<void> {
    let printing: boolean = true;

    this.ldy(this.lda(number));
    this.poke(ZP_MAIN.ptr1, this.lda(T.string_table & 0xFF));
    this.poke(ZP_MAIN.ptr1 + 1, this.lda(T.string_table >> 8));
    this.ldx(0x00);
    this.toEndOfString();
    while (this.dey() !== 0) {
      this.incPtr();
      this.toEndOfString();
    }
    while (printing) {
      this.incPtr();
      this.ldx(0x00);
      if (this.lda(this.peek(this.pointer(ZP_MAIN.ptr1))) === 0) {
        printing = false;
      } else {
        await this.m.call(J.j_console_out);
      }
    }
  }


  /** @next_char / @next_string: ptr1 on to the string's terminator. */
  private toEndOfString(): void {
    while (this.lda(this.peek(this.pointer(ZP_MAIN.ptr1))) !== 0) {
      this.incPtr();
    }
  }


  private incPtr(): void {
    if (this.inc(ZP_MAIN.ptr1) === 0) {
      this.inc(ZP_MAIN.ptr1 + 1);
    }
  }


  /** anim_open_door: the door's edges drawn, then CSTRING's picture beyond it scrolled in from the middle, a column a side at a time. */
  private animOpenDoor(): void {
    this.ldx(MAX_SPK_ROW);
    do {
      this.setPtr2Line();
      this.ldy(0x0B);
      this.orInto(0x60);
      this.iny();
      this.orInto(0x03);
      this.dex();
      this.cpu.compare(this.cpu.x, MIN_SPK_ROW);
    } while (!this.zero());
    this.beginScroll();
  }


  /** `lda (ptr2),y` / `ora #bits` / `sta (ptr2),y`. */
  private orInto(bits: number): void {
    const address: number = this.pointer(ZP_MAIN.ptr2) + this.cpu.y;

    this.poke(address, this.lda(this.peek(address) | bits));
  }


  private beginScroll(): void {
    let more: boolean = true;

    this.poke(ZP_MAIN.ptr1, this.lda(CSTRING_ADDRESS & 0xFF));
    this.poke(ZP_MAIN.ptr1 + 1, this.lda(CSTRING_ADDRESS >> 8));
    this.poke(end_left, this.lda(0x0C));
    this.poke(end_right, this.lda(0x0B));
    while (more) {
      this.ldx(MAX_SPK_ROW);
      do {
        this.poke(cur_row, this.cpu.x);
        this.setPtr2Line();
        this.scrollOut();
        this.ldx(this.peek(cur_row));
        this.dex();
        this.cpu.compare(this.cpu.x, MIN_SPK_ROW);
      } while (!this.zero());
      this.cpu.cycles = this.cpu.cycles + SCROLL_DELAY_CYCLES;
      this.ldy(0x00);
      this.ldx(0x00);
      this.inc(end_right);
      this.dec(end_left);
      this.lda(this.peek(end_left));
      this.cmp(0x02);
      more = !this.zero();
    }
    this.endScroll();
  }


  /** A row's left half moved a byte left and its right half a byte right, and the picture's next two bytes in at the middle. */
  private scrollOut(): void {
    const row = (y: number): number => this.pointer(ZP_MAIN.ptr2) + y;

    this.ldy(0x02);
    do {
      this.lda(this.peek(row(this.cpu.y)));
      this.dey();
      this.poke(row(this.cpu.y), this.cpu.a);
      this.iny();
      this.iny();
      this.cpu.compare(this.cpu.y, this.peek(end_left));
    } while (!this.zero());
    this.dey();
    this.nextPtr1();
    this.poke(row(this.cpu.y), this.cpu.a);
    this.ldy(0x15);
    do {
      this.lda(this.peek(row(this.cpu.y)));
      this.iny();
      this.poke(row(this.cpu.y), this.cpu.a);
      this.dey();
      this.dey();
      this.cpu.compare(this.cpu.y, this.peek(end_right));
    } while (!this.zero());
    this.iny();
    this.nextPtr1();
    this.poke(row(this.cpu.y), this.cpu.a);
  }


  /** end_scroll: the picture's outermost columns, each row. */
  private endScroll(): void {
    this.ldx(MAX_SPK_ROW);
    do {
      this.poke(cur_row, this.cpu.x);
      this.setPtr2Line();
      this.nextPtr1();
      this.ldy(0x01);
      this.poke(this.pointer(ZP_MAIN.ptr2) + this.cpu.y, this.cpu.a);
      this.nextPtr1();
      this.ldy(MAX_SPK_COL);
      this.poke(this.pointer(ZP_MAIN.ptr2) + this.cpu.y, this.cpu.a);
      this.ldx(this.peek(cur_row));
      this.dex();
      this.cpu.compare(this.cpu.x, MIN_SPK_ROW);
    } while (!this.zero());
  }


  /** next_ptr1: the picture's next byte in A, the flags from stepping past it. */
  private nextPtr1(): void {
    const byte: number = this.peek(this.pointer(ZP_MAIN.ptr1));

    this.ldx(0x00);
    this.lda(byte);
    this.incPtr();
    this.cpu.a = byte;
  }


  private setPtr2Line(): void {
    this.poke(ZP_MAIN.ptr2 + 1, this.lda(this.peek(TABLES.bmplineaddr_hi + this.cpu.x)));
    this.poke(ZP_MAIN.ptr2, this.lda(this.peek(TABLES.bmplineaddr_lo + this.cpu.x)));
  }


  // --- Super-Packer (END.s:890-1059) -------------------------------------------------------------

  /** draw_spk: CSTRING's packed image A, a column at a time from the right, each from the bottom, ORed onto the view. */
  private drawSpk(image: number): void {
    this.lda(image);
    this.ldx(this.cpu.asl(this.cpu.a));
    this.poke(ZP_MAIN.ptr2 + 1, this.lda(this.peek(T.spk_addr_table + 1 + this.cpu.x)));
    this.poke(ZP_MAIN.ptr2, this.lda(this.peek(T.spk_addr_table + this.cpu.x)));
    this.ldx(0x00);
    this.poke(spk_repeat_flag, this.cpu.x);
    this.poke(spk_pattern_flag, this.cpu.x);
    this.poke(spk_pattern_len_cur, this.cpu.x);
    this.poke(spk_repeat_code, this.lda(this.peek(this.pointer(ZP_MAIN.ptr2))));
    this.incPtr2();
    this.poke(spk_pattern_code, this.lda(this.peek(this.pointer(ZP_MAIN.ptr2))));
    this.incPtr2();
    this.ldy(MAX_SPK_COL);
    do {
      this.ldx(MAX_SPK_ROW);
      this.poke(spk_row, this.cpu.x);
      do {
        this.poke(ZP_MAIN.ptr1, this.lda(this.peek(TABLES.bmplineaddr_lo + this.cpu.x)));
        this.poke(ZP_MAIN.ptr1 + 1, this.lda(this.peek(TABLES.bmplineaddr_hi + this.cpu.x)));
        this.spkWriteByte();
        this.dec(spk_row);
        this.ldx(this.peek(spk_row));
        this.cpu.compare(this.cpu.x, MIN_SPK_ROW);
      } while (!this.zero());
      this.dey();
      this.cpu.compare(this.cpu.y, 0x00);
    } while (!this.zero());
  }


  private incPtr2(): void {
    if (this.inc(ZP_MAIN.ptr2) === 0) {
      this.inc(ZP_MAIN.ptr2 + 1);
    }
  }


  /** `lda (ptr2,x)` with X 0. */
  private packed(): number {
    return this.lda(this.peek(this.pointer(ZP_MAIN.ptr2)));
  }


  /** `ora (ptr1),y` / `sta (ptr1),y`: A onto the view's byte. */
  private plot(): void {
    const address: number = this.pointer(ZP_MAIN.ptr1) + this.cpu.y;

    this.poke(address, this.lda(this.cpu.a | this.peek(address)));
  }


  /** spk_write_byte: the next byte of the image, a literal, a run of one byte or a repeated pattern, followed through its labels. */
  private spkWriteByte(): void {
    let at: SpkLabel = 'read_byte';

    this.ldx(0x00);
    this.cpu.bit(this.peek(spk_repeat_flag));
    if (this.negative()) {
      at = 'do_repeat';
    } else {
      this.cpu.bit(this.peek(spk_pattern_flag));
      if (this.negative()) {
        at = 'do_pattern';
      }
    }
    while (at !== 'done') {
      at = this.spkStep(at);
    }
  }


  private spkStep(at: SpkLabel): SpkLabel {
    let next: SpkLabel = 'done';

    if (at === 'read_byte') {
      this.poke(spk_byte, this.packed());
      this.cmp(this.peek(spk_repeat_code));
      next = this.zero() ? 'set_repeat' : 'check_pattern';
    } else if (at === 'set_repeat') {
      this.incPtr2();
      this.poke(spk_repeat_count, this.packed());
      this.incPtr2();
      this.poke(spk_byte, this.packed());
      this.incPtr2();
      this.poke(spk_repeat_flag, this.lda(0x80));
      next = 'do_repeat';
    } else if (at === 'check_pattern') {
      this.cmp(this.peek(spk_pattern_code));
      next = this.zero() ? this.setPattern() : 'do_literal';
    } else if (at === 'do_literal') {
      this.lda(this.peek(spk_byte));
      this.plot();
      this.incPtr2();
    } else if (at === 'do_repeat') {
      next = this.doRepeat();
    } else if (at === 'do_pattern') {
      next = this.doPattern();
    } else if (at === 'pattern_literal') {
      this.plot();
      this.incPtr2();
      next = 'next_pattern';
    } else {
      this.nextPattern();
    }

    return next;
  }


  private setPattern(): SpkLabel {
    this.incPtr2();
    this.poke(spk_pattern_length, this.packed());
    this.poke(spk_pattern_len_cur, this.cpu.a);
    this.incPtr2();
    this.poke(spk_pattern_count, this.packed());
    this.incPtr2();
    this.poke(spk_pattern_ptr, this.lda(this.peek(ZP_MAIN.ptr2)));
    this.poke(spk_pattern_ptr + 1, this.lda(this.peek(ZP_MAIN.ptr2 + 1)));
    this.poke(spk_pattern_flag, this.lda(0x80));

    return 'do_pattern';
  }


  /** @do_repeat: the run's byte plotted; at its end, a pattern it was part of two bytes on, or on to its next byte. */
  private doRepeat(): SpkLabel {
    let next: SpkLabel = 'done';

    this.lda(this.peek(spk_byte));
    this.plot();
    if (this.dec(spk_repeat_count) === 0) {
      this.poke(spk_repeat_flag, this.lda(0x00));
      this.cpu.bit(this.peek(spk_pattern_flag));
      if (this.negative()) {
        this.dec(spk_pattern_len_cur);
        next = (this.dec(spk_pattern_len_cur) !== 0) ? 'next_pattern' : 'do_pattern';
      }
    }

    return next;
  }


  /** @do_pattern: the pattern's next byte, a run within it (from its start again if it is spent: the dead code, which falls through to a literal on a zero page), or a literal. */
  private doPattern(): SpkLabel {
    let next: SpkLabel = 'pattern_literal';

    this.packed();
    this.cmp(this.peek(spk_repeat_code));
    if (this.zero()) {
      if (this.lda(this.peek(spk_pattern_len_cur)) === 0) {
        this.poke(ZP_MAIN.ptr2, this.lda(this.peek(spk_pattern_ptr)));
        this.poke(ZP_MAIN.ptr2 + 1, this.lda(this.peek(spk_pattern_ptr + 1)));
      }
      next = this.zero() ? 'pattern_literal' : 'set_repeat';
    }

    return next;
  }


  /** @next_pattern: one byte of the pattern spent; at its end, the pattern again from its start, or done with it. */
  private nextPattern(): void {
    if (this.dec(spk_pattern_len_cur) === 0) {
      this.poke(spk_pattern_len_cur, this.lda(this.peek(spk_pattern_length)));
      if (this.dec(spk_pattern_count) === 0) {
        this.poke(spk_pattern_flag, this.lda(0x00));
      } else {
        this.poke(ZP_MAIN.ptr2, this.lda(this.peek(spk_pattern_ptr)));
        this.poke(ZP_MAIN.ptr2 + 1, this.lda(this.peek(spk_pattern_ptr + 1)));
      }
    }
  }
}


/** input_answer's inline word, after its `jsr match_input_inline`: the question's four letters, copied in. */
const END_INLINE_KEYWORD: IInlineData = { address: END_VARIABLES.keyword_compare, bytes: [ 0x00, 0x00, 0x00, 0x00, 0x00 ] };


export const END_MODULE = overlayModule('underworld', 'END', OVERLAY_ENTRY, END_DATA, (machine: LiftedMachine): End => new End(machine),
  (program: End): Promise<Exit> => program.run(),
  [ [ END_ENTRIES.halt, (program: End): Exit => program.halt() ] ]);
