import { CHAR, JUMP_SUBS, TABLES, ZP_MAIN } from '../../state/symbols';
import type { IInlineData } from '../inline-data';
import { PortProgram } from '../port-program';

// What the overlays that read a word share, USE and TALK in Britannia and the townes: each has its
// own copy of get_input and compare_keywords, which differ only in where they keep the count of
// characters typed and the table of words they know.

const J = JUMP_SUBS;
const zp_index: number = 0xEA;
const INPUT_LENGTH: number = 0x0F;
const KEYWORD_LENGTH: number = 4;
const PADDED_LENGTH: number = 6;


export abstract class KeywordOverlay extends PortProgram {
  protected print(block: IInlineData): Promise<void> {
    return this.callWith(J.j_primm, block);
  }


  /** A word typed at `?`, up to fifteen characters, into inbuffer padded with spaces to six. */
  protected async getInput(inputIndex: number): Promise<void> {
    let done: boolean = false;

    this.lda(CHAR.char_question);
    await this.m.call(J.j_console_out);
    this.poke(inputIndex, this.lda(0x00));
    while (!done) {
      await this.m.call(J.j_waitkey);
      this.cmp(CHAR.char_enter);
      if (this.zero()) {
        done = true;
      } else {
        this.cmp(CHAR.char_left_arrow);
        if (this.zero()) {
          await this.backspace(inputIndex);
        } else {
          this.cmp(CHAR.char_space);
          if (this.carry()) {
            this.ldx(this.peek(inputIndex));
            this.poke(TABLES.inbuffer + this.cpu.x, this.cpu.a);
            await this.m.call(J.j_console_out);
            this.inc(inputIndex);
            this.lda(this.peek(inputIndex));
            this.cmp(INPUT_LENGTH);
            done = this.carry();
          }
        }
      }
    }
    this.ldx(this.peek(inputIndex));
    this.lda(CHAR.char_space);
    do {
      this.poke(TABLES.inbuffer + this.cpu.x, this.cpu.a);
      this.inx();
      this.cpu.compare(this.cpu.x, PADDED_LENGTH);
    } while (!this.carry());
    this.lda(CHAR.char_enter);
    await this.m.call(J.j_console_out);
  }


  private async backspace(inputIndex: number): Promise<void> {
    if (this.lda(this.peek(inputIndex)) !== 0) {
      this.dec(inputIndex);
      this.dec(ZP_MAIN.console_xpos);
      this.lda(CHAR.char_space);
      await this.m.call(J.j_console_out);
      this.dec(ZP_MAIN.console_xpos);
    }
  }


  /** The last of the `count` four-letter words at `keywords` that the first four characters typed match, in A, or $FF (negative) for none. */
  protected compareKeywords(keywords: number, count: number): void {
    let matched: boolean = false;

    this.poke(zp_index, this.lda(count - 1));
    do {
      let differs: boolean = false;

      this.lda(this.peek(zp_index));
      this.ldy(this.cpu.asl(this.cpu.asl(this.cpu.a)));
      this.ldx(0x00);
      do {
        this.lda(this.peek(keywords + this.cpu.y));
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
}
