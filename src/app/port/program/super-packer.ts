import type { IPortMachine } from '../port-machine';
import { PortProgram } from '../port-program';
import { SUPER_PACKER, ZP_MAIN } from '../../state/symbols';

// Super-Packer's unpacker, which NEWGAME and SHRN each carry a copy of: one byte of a packed
// picture at a time, a literal, the next of a run, or the next of a repeated pattern. SHRN's copy
// ORs each byte onto the screen rather than storing it.

const SPK = SUPER_PACKER;

type SpkStep = 'read_byte' | 'set_repeat' | 'set_pattern' | 'do_repeat' | 'do_pattern' | 'next_pattern' | 'rts';


export class SuperPacker extends PortProgram {
  constructor(m: IPortMachine, private readonly combines: boolean) {
    super(m);
  }


  /** One byte of the picture at (ptr1),Y: a literal, or the next of a run or a repeated pattern. */
  public writeByte(): void {
    let step: SpkStep = 'read_byte';

    this.ldx(0x00);
    this.cpu.bit(this.peek(SPK.spk_repeat_flag));
    if (this.negative()) {
      step = 'do_repeat';
    } else {
      this.cpu.bit(this.peek(SPK.spk_pattern_flag));
      if (this.negative()) {
        step = 'do_pattern';
      }
    }
    while (step !== 'rts') {
      step = this.spkStep(step);
    }
  }


  private spkStep(step: SpkStep): SpkStep {
    let next: SpkStep = 'rts';

    if (step === 'read_byte') {
      this.poke(SPK.spk_byte, this.lda(this.peek(this.pointer(ZP_MAIN.ptr2))));
      this.cmp(this.peek(SPK.spk_repeat_code));
      if (this.zero()) {
        next = 'set_repeat';
      } else {
        this.cmp(this.peek(SPK.spk_pattern_code));
        if (this.zero()) {
          next = 'set_pattern';
        } else {
          this.put(this.lda(this.peek(SPK.spk_byte)));
          this.incPtr2();
        }
      }
    } else if (step === 'set_repeat') {
      this.incPtr2();
      this.poke(SPK.spk_repeat_count, this.lda(this.peek(this.pointer(ZP_MAIN.ptr2))));
      this.incPtr2();
      this.poke(SPK.spk_byte, this.lda(this.peek(this.pointer(ZP_MAIN.ptr2))));
      this.incPtr2();
      this.poke(SPK.spk_repeat_flag, this.lda(0x80));
      next = 'do_repeat';
    } else if (step === 'set_pattern') {
      this.incPtr2();
      this.lda(this.peek(this.pointer(ZP_MAIN.ptr2)));
      this.poke(SPK.spk_pattern_length, this.cpu.a);
      this.poke(SPK.spk_pattern_len_cur, this.cpu.a);
      this.incPtr2();
      this.poke(SPK.spk_pattern_count, this.lda(this.peek(this.pointer(ZP_MAIN.ptr2))));
      this.incPtr2();
      this.poke(SPK.spk_pattern_ptr, this.lda(this.peek(ZP_MAIN.ptr2)));
      this.poke(SPK.spk_pattern_ptr + 1, this.lda(this.peek(ZP_MAIN.ptr2 + 1)));
      this.poke(SPK.spk_pattern_flag, this.lda(0x80));
      next = 'do_pattern';
    } else if (step === 'do_repeat') {
      next = this.repeatByte();
    } else if (step === 'do_pattern') {
      next = this.patternByte();
    } else if (step === 'next_pattern') {
      this.nextPattern();
    }

    return next;
  }


  private repeatByte(): SpkStep {
    let next: SpkStep = 'rts';

    this.put(this.lda(this.peek(SPK.spk_byte)));
    if (this.dec(SPK.spk_repeat_count) === 0) {
      this.poke(SPK.spk_repeat_flag, this.lda(0x00));
      this.cpu.bit(this.peek(SPK.spk_pattern_flag));
      if (this.negative()) {
        this.dec(SPK.spk_pattern_len_cur);
        next = (this.dec(SPK.spk_pattern_len_cur) !== 0) ? 'next_pattern' : 'do_pattern';
      }
    }

    return next;
  }


  private patternByte(): SpkStep {
    let next: SpkStep = 'next_pattern';

    this.lda(this.peek(this.pointer(ZP_MAIN.ptr2)));
    this.cmp(this.peek(SPK.spk_repeat_code));
    if (this.zero()) {
      if (this.lda(this.peek(SPK.spk_pattern_len_cur)) === 0) {
        this.poke(ZP_MAIN.ptr2, this.lda(this.peek(SPK.spk_pattern_ptr)));
        this.poke(ZP_MAIN.ptr2 + 1, this.lda(this.peek(SPK.spk_pattern_ptr + 1)));
      }
      next = 'set_repeat';
    } else {
      this.put(this.cpu.a);
      this.incPtr2();
    }

    return next;
  }


  private nextPattern(): void {
    if (this.dec(SPK.spk_pattern_len_cur) === 0) {
      this.poke(SPK.spk_pattern_len_cur, this.lda(this.peek(SPK.spk_pattern_length)));
      if (this.dec(SPK.spk_pattern_count) === 0) {
        this.poke(SPK.spk_pattern_flag, this.lda(0x00));
      } else {
        this.poke(ZP_MAIN.ptr2, this.lda(this.peek(SPK.spk_pattern_ptr)));
        this.poke(ZP_MAIN.ptr2 + 1, this.lda(this.peek(SPK.spk_pattern_ptr + 1)));
      }
    }
  }


  /** `sta (ptr1),y`, or `ora (ptr1),y` / `sta (ptr1),y` for a copy that combines. */
  private put(value: number): void {
    const address: number = this.pointer(ZP_MAIN.ptr1) + this.cpu.y;

    this.poke(address, this.combines ? this.lda(value | this.peek(address)) : value);
  }


  private incPtr2(): void {
    if (this.inc(ZP_MAIN.ptr2) === 0) {
      this.inc(ZP_MAIN.ptr2 + 1);
    }
  }
}
