// britannia/SAVE.s: what happens when the whole party is dead, ported. Lord British pulls them back
// to his chamber, heals them, and keeps a little gold and food; their weapons and armour stay in
// the void. ULT4's run_file_dead loads it at $8800 and calls it.

import { OVERFLOW } from '../../../lifted-runtime/cpu';
import type { LiftedMachine } from '../../../lifted-runtime/lifted-machine';
import { CHAR, DISKS, JUMP_SUBS, MAP_OBJECTS, PLACES, PRTY, ROST, TILES, VIEW_MAP, ZP_MAIN } from '../../../state/symbols';
import type { IInlineData } from '../../inline-data';
import { PortProgram } from '../../port-program';
import type { Exit } from '../../routine';
import { OVERLAY_ENTRY, overlayModule, text } from '../overlay';

const J = JUMP_SUBS;
/** delay_long: ldx #$0a round ldy #$ff round a count down from $ff. */
const DELAY_LONG_CYCLES: number = 4_569_670;


export const SAVE_INLINE = {
  all_is_dark: text(0x881F, '\n\nALL IS DARK...\n'),
  but_wait: text(0x8837, '\nBut wait...\n'),
  where_am_i: text(0x884B, 'Where am I?...\n'),
  am_i_dead: text(0x8861, 'Am I dead?...\n'),
  afterlife: text(0x8876, 'Afterlife?...\n'),
  you_hear: text(0x888B, 'YOU HEAR:\n'),
  motion: text(0x88A8, 'I feel motion...\n'),
  bload_map: text(0x88E0, '\u0004BLOAD MAP@,A$8B00\n'),
  lord_british: text(0x8921, '\n\nLORD BRITISH\nSAYS: I HAVE\nPULLED THY\nSPIRIT AND SOME\nPOSSESSIONS FROM\nTHE VOID. BE\nMORE CAREFUL IN\nTHE FUTURE!\n'),
} as const;

export const SAVE_DATA: readonly IInlineData[] = Object.values(SAVE_INLINE);


export class Save extends PortProgram {
  public async run(): Promise<Exit> {
    const I: typeof SAVE_INLINE = SAVE_INLINE;

    this.poke(ZP_MAIN.curr_player, this.lda(this.peek(PRTY.party_size)));
    await this.m.call(J.j_get_stats_ptr);
    this.ldy(ROST.player_status);
    this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.lda(ROST.status_Dead));
    this.ldy(ROST.player_cur_hp_hi);
    this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.lda(0x00));
    this.iny();
    this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.cpu.a);
    await this.m.call(J.j_update_status);
    await this.m.call(J.j_clearview);
    for (const block of [ I.all_is_dark, I.but_wait, I.where_am_i, I.am_i_dead, I.afterlife ]) {
      await this.callWith(J.j_primm, block);
      this.delayLong();
    }
    await this.callWith(J.j_primm, I.you_hear);
    this.poke(ZP_MAIN.curr_player, this.lda(0x01));
    await this.m.call(J.j_centername);
    this.lda(CHAR.char_newline);
    await this.m.call(J.j_console_out);
    this.delayLong();
    await this.callWith(J.j_primm, I.motion);
    await this.toLordBritish();
    await this.callWith(J.j_primm, I.lord_british);
    await this.restore();

    return null;
  }


  /** To Lord British's chamber in his castle, its map from the towne disk. */
  private async toLordBritish(): Promise<void> {
    this.poke(PRTY.player_transport, this.lda(TILES.tile_walk));
    this.poke(PRTY.player_xpos, this.lda(PLACES.xpos_lord_british));
    this.poke(PRTY.player_ypos, this.lda(PLACES.ypos_lord_british));
    this.poke(PRTY.britannia_x, this.lda(PLACES.xpos_castle_britannia));
    this.poke(PRTY.britannia_y, this.lda(PLACES.ypos_castle_britannia));
    this.poke(PRTY.current_location, this.lda(PRTY.loc_castle_britannia));
    this.lda(PRTY.mode_suspended);
    this.poke(PRTY.game_mode, this.cpu.a);
    this.poke(PRTY.horse_mode, this.cpu.a);
    this.lda(DISKS.disk_towne);
    await this.m.call(J.j_request_disk);
    await this.callWith(J.j_primm_cout, SAVE_INLINE.bload_map);
    this.ldx(0x00);
    do {
      for (const page of [ 0x000, 0x100, 0x200, 0x300 ]) {
        this.poke(VIEW_MAP.view_buf + page + this.cpu.x, this.lda(this.peek(VIEW_MAP.load_buf + page + this.cpu.x)));
      }
      this.poke(MAP_OBJECTS.object_tile_sprite + this.cpu.x, this.lda(this.peek(VIEW_MAP.load_buf + 0x400 + this.cpu.x)));
    } while (this.inx() !== 0);
    this.poke(PRTY.game_mode, this.lda(PRTY.mode_towne));
    await this.m.call(J.j_update_view);
  }


  /** The party healed and in good health, without weapons or armour, with two hundred food and gold. */
  private async restore(): Promise<void> {
    this.poke(ZP_MAIN.curr_player, this.lda(this.peek(PRTY.party_size)));
    do {
      await this.m.call(J.j_get_stats_ptr);
      const player: number = this.pointer(ZP_MAIN.ptr1);

      this.ldy(ROST.player_status);
      this.poke(player + this.cpu.y, this.lda(ROST.status_Good));
      this.ldy(ROST.player_max_hp_hi);
      this.lda(this.peek(player + this.cpu.y));
      this.ldy(ROST.player_cur_hp_hi);
      this.poke(player + this.cpu.y, this.cpu.a);
      this.ldy(ROST.player_max_hp_lo);
      this.lda(this.peek(player + this.cpu.y));
      this.ldy(ROST.player_cur_hp_lo);
      this.poke(player + this.cpu.y, this.cpu.a);
    } while (this.dec(ZP_MAIN.curr_player) !== 0);
    this.lda(0x00);
    this.ldx(ROST.weapon_last - 1);
    do {
      this.poke(ROST.weapons + this.cpu.x, this.cpu.a);
    } while (this.dex() !== 0);
    this.ldx(ROST.armour_last - 1);
    do {
      this.poke(ROST.armour + this.cpu.x, this.cpu.a);
    } while (this.dex() !== 0);
    this.poke(ROST.food_lo, this.cpu.a);
    this.poke(ROST.gold_lo, this.cpu.a);
    this.lda(0x02);
    this.poke(ROST.food_hi, this.cpu.a);
    this.poke(ROST.gold_hi, this.cpu.a);
  }


  /** A few seconds of nothing. */
  private delayLong(): void {
    this.cpu.cycles = this.cpu.cycles + DELAY_LONG_CYCLES;
    this.ldy(0x00);
    this.lda(0x00);
    this.ldx(0x00);
    this.setCarry(true);
    this.cpu.setFlag(OVERFLOW, false);
  }
}


export const SAVE_MODULE = overlayModule('britannia', 'SAVE', OVERLAY_ENTRY, SAVE_DATA, (machine: LiftedMachine): Save => new Save(machine), (program: Save): Promise<Exit> => program.run());
