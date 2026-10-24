// SEL.s: the music control and DOS error handler at $0320, ported. ULT4 and the overlays reach it
// through its three entries, so each leaves the registers as the original does. INIT stores an
// RTS over `j_music_ctl` to silence the music and BOOT a JMP again when a sound board is fitted,
// so that entry reads its own opcode, as the 6502 would run it.

import { APPLE, DOS, JUMP_SUBS, JUMP_SYSTEM, MUSIC, MUSIC_STATE, ZP_MUSIC } from '../../state/symbols';
import { inline } from '../inline-data';
import type { IInlineData } from '../inline-data';
import { PortProgram } from '../port-program';
import { encode } from '../text';

export const SEL_LOAD: number = 0x0320;
const MUSIC_CTL: number = 0x0338;

export const SEL_VARIABLES = {
  file_char_music: 0x0372,
} as const;

/** load_music's `BLOAD MUSA,A$F000`, whose fifth letter it rewrites. */
export const SEL_BLOAD_MUSIC: IInlineData = inline(0x0368, [ ...encode('\u0004BLOAD MUSA,A$F000\n'), 0x00 ]);

/** The two JMPs of the jump table, which j_music_ctl reads as the 6502 would run them. */
export const SEL_JUMPS: readonly number[] = [ APPLE.opcode_JMP, MUSIC_CTL & 0xFF, MUSIC_CTL >> 8, APPLE.opcode_JMP, 0x80, 0x03 ];

/** spin_drive_motor's delay, ldx #$05 round ldy #$00 / iny. */
const SPIN_CYCLES: number = 6_460;
/** One turn of `lda tune_playing` / `bne`. */
const WAIT_CYCLES: number = 6;


export class SelError extends Error {
}


export class Sel extends PortProgram {
  /** SEL.s j_music_ctl: the music control, or nothing while INIT's RTS is stored over it. */
  public async jMusicCtl(): Promise<void> {
    const opcode: number = this.peek(JUMP_SYSTEM.music_ctl);

    if ((opcode === APPLE.opcode_JMP) && (this.patchedWord(JUMP_SYSTEM.music_ctl + 1) === MUSIC_CTL)) {
      await this.musicCtl();
    } else if (opcode !== APPLE.opcode_RTS) {
      throw new SelError(`j_music_ctl holds $${ opcode.toString(16) }`);
    }
  }


  /** SEL.s music_ctl: A < $80 plays that tune of the loaded music, or stops it; A >= $80 loads MUSx. */
  private async musicCtl(): Promise<void> {
    this.ldx(this.cpu.a);
    if (this.negative()) {
      await this.loadMusic();
    } else {
      this.cmp(this.peek(MUSIC_STATE.music_data));
      if (!this.carry()) {
        this.poke(ZP_MUSIC.tune_req_now, this.cpu.a);
        this.poke(ZP_MUSIC.tune_queue_next, this.cpu.a);
        this.cmp(MUSIC.music_off);
        if (this.zero()) {
          while (this.lda(this.peek(ZP_MUSIC.tune_playing)) !== 0) {
            this.cpu.cycles = this.cpu.cycles + WAIT_CYCLES;
            await this.m.checkpoint();
          }
        } else {
          await this.playTune();
        }
      }
    }
  }


  private async playTune(): Promise<void> {
    if (this.lda(this.peek(ZP_MUSIC.tune_playing)) === 0) {
      this.poke(ZP_MUSIC.mus_ptr, this.lda(MUSIC_STATE.music_data & 0xFF));
      this.poke(ZP_MUSIC.mus_ptr + 1, this.lda(MUSIC_STATE.music_data >> 8));
      await this.m.call(MUSIC_STATE.music_start);
    }
  }


  private async loadMusic(): Promise<void> {
    this.poke(SEL_VARIABLES.file_char_music, this.cpu.a);
    this.lda(MUSIC.music_off);
    await this.jsr(0x0362, (): Promise<void> => this.musicCtl());
    await this.callWith(JUMP_SUBS.j_primm_cout, SEL_BLOAD_MUSIC);
    this.lda(MUSIC.music_main);
    await this.musicCtl();
  }


  /** SEL.s spin_drive_motor: the drive motor on for a moment, so the next read finds it up to speed. */
  public spinDriveMotor(): void {
    const value: number = this.cpu.a;

    this.cpu.push(value);
    this.ldx(this.peek(DOS.RWTS_slot));
    this.lda(this.peek(APPLE.drive_motor_on + this.cpu.x));
    this.cpu.cycles = this.cpu.cycles + SPIN_CYCLES;
    this.ldy(0x00);
    this.ldx(this.peek(DOS.RWTS_slot));
    this.lda(this.peek(APPLE.drive_motor_off + this.cpu.x));
    this.lda(this.cpu.pull());
  }


  /** SEL.s on_dos_error: DOS's break vector, which resumes the primm_cout that failed. */
  public onDosError(): void {
    this.cpu.sp = this.ldx(this.peek(JUMP_SYSTEM.err_resume_stack));
    this.cpu.push(this.lda(this.peek(JUMP_SYSTEM.err_resume_addr + 1)));
    this.cpu.push(this.lda(this.peek(JUMP_SYSTEM.err_resume_addr)));
    this.cpu.pc = JUMP_SUBS.j_primm_cout;
  }
}
