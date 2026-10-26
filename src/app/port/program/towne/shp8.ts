// towne/SHP8.s: Paws's horse seller, ported: a horse for a hundred gold a member of the party, the
// party riding it away. ULT4's check_shop loads it at $8800 for row 24 of Paws.

import { DECIMAL } from '../../../lifted-runtime/cpu';
import type { LiftedMachine } from '../../../lifted-runtime/lifted-machine';
import { CHAR, JUMP_SUBS, PRTY, ROST, TILES } from '../../../state/symbols';
import type { IInlineData } from '../../inline-data';
import type { Exit } from '../../routine';
import { OVERLAY_ENTRY, overlayModule, text } from '../overlay';
import { ShopOverlay } from './shop-overlay';

const J = JUMP_SUBS;

export const SHP8_INLINE = {
  welcome: text(0x8803, '\nWELCOME FRIEND!\nCAN I INTEREST\nTHEE IN HORSES?'),
  decline: text(0x883D, '\nA SHAME, THOU\nLOOKS LIKE COULD\nUSE A GOOD\nHORSE!\n'),
  for_only: text(0x8874, '\nFOR ONLY '),
  price: text(0x8887, '00g.p.\nTHOU CAN HAVE\nTHE BEST! WILT\nTHOU BUY?'),
  not_enough: text(0x88CC, '\nIT SEEMS THOU\nHAST NOT GOLD\nENOUGH TO PAY!\n'),
  paid: text(0x8900, '\nHERE, A BETTER\nBREED THOU SHALT\nNOT FIND EVER!\n'),
} as const;

const I = SHP8_INLINE;

export const SHP8_DATA: readonly IInlineData[] = Object.values(SHP8_INLINE);


export class Shp8 extends ShopOverlay {
  constructor(machine: LiftedMachine) {
    super(machine, null);
  }


  public async run(): Promise<Exit> {
    let buying: boolean = false;

    await this.print(I.welcome);
    await this.inputChar();
    this.cmp(CHAR.char_Y);
    if (this.zero()) {
      await this.print(I.for_only);
      this.lda(this.peek(PRTY.party_size));
      await this.m.call(J.j_printdigit);
      await this.print(I.price);
      await this.inputChar();
      this.cmp(CHAR.char_Y);
      buying = this.zero();
    }
    if (buying) {
      await this.tryBuy();
    } else {
      await this.print(I.decline);
    }

    return null;
  }


  /** A hundred gold a member, from the hundreds alone. */
  private async tryBuy(): Promise<void> {
    this.cpu.setFlag(DECIMAL, true);
    this.setCarry(true);
    this.lda(this.peek(ROST.party_stats + ROST.party_stat_gold_hi));
    this.cpu.sbc(this.peek(PRTY.party_size));
    this.cpu.setFlag(DECIMAL, false);
    if (this.carry()) {
      this.poke(ROST.party_stats + ROST.party_stat_gold_hi, this.cpu.a);
      await this.print(I.paid);
      this.poke(PRTY.player_transport, this.lda(TILES.tile_horse_west));
    } else {
      await this.print(I.not_enough);
    }
  }
}


export const SHP8_MODULE = overlayModule('towne', 'SHP8', OVERLAY_ENTRY, SHP8_DATA, (machine: LiftedMachine): Shp8 => new Shp8(machine), (program: Shp8): Promise<Exit> => program.run());
