import { DECIMAL } from '../../lifted-runtime/cpu';
import { JUMP_SUBS, ROST, ZP_MAIN } from '../../state/symbols';
import type { IInlineData } from '../inline-data';
import { PortProgram } from '../port-program';

// What Britannia's SEAR and the townes' share: a find is worth honour, and the quest's items
// experience to the first player.

const J = JUMP_SUBS;


export abstract class SearchOverlay extends PortProgram {
  protected print(block: IInlineData): Promise<void> {
    return this.callWith(J.j_primm, block);
  }


  /** A find is worth five points of honour, if any is left to add to. */
  protected async youFind(block: IInlineData): Promise<void> {
    await this.print(block);
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


  /** A hundreds of experience to player 1, in BCD, up to 9999. */
  protected async addXp100(): Promise<void> {
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
