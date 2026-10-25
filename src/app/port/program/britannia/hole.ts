// britannia/HOLE.s: making camp, ported. The party lies down in the camp arena and rests; once in
// eight it is ambushed in its sleep, and otherwise, if it has not slept since the last hundred
// moves, it wakes healed and with its magic back. ULT4's cmd_hole_up loads it at $8800.

import { DECIMAL } from '../../../lifted-runtime/cpu';
import type { LiftedMachine } from '../../../lifted-runtime/lifted-machine';
import { JUMP_OVERLAY, JUMP_SUBS, MAP_OBJECTS, PRTY, ROST, TILES, ZP_COMBAT, ZP_MAIN } from '../../../state/symbols';
import { inline } from '../../inline-data';
import type { IInlineData } from '../../inline-data';
import { PortProgram } from '../../port-program';
import type { Exit } from '../../routine';
import { OVERLAY_ENTRY, overlayModule, text } from './overlay';

const J = JUMP_SUBS;
const zp_number: number = 0xDA;
const zp_count: number = 0xEA;
const zp_mp_class: number = 0xD8;
const zp_mp_number: number = 0xD8;
const SLEEP_FRAMES: number = 0x4B;
const BCD_MAX: number = 0x63;

const AMBUSH_MONSTERS: number = 0x890E;

export const HOLE_INLINE = {
  bload_camp: text(0x8803, '\u0004BLOAD CAMP,A$240\n'),
  resting: text(0x8843, 'RESTING...\n'),
  ambushed: text(0x8864, 'AMBUSHED!\n'),
  bload_camp_again: text(0x889E, '\u0004BLOAD CAMP,A$240\n'),
  no_effect: text(0x88BF, 'NO EFFECT.\n'),
  healed: text(0x88FC, 'PLAYERS HEALED!\n'),
} as const;

const I = HOLE_INLINE;

export const HOLE_DATA: readonly IInlineData[] = [
  ...Object.values(HOLE_INLINE),
  inline(AMBUSH_MONSTERS, [
    TILES.tile_orc, TILES.tile_skeleton, TILES.tile_rogue, TILES.tile_python, TILES.tile_insects, TILES.tile_slime, TILES.tile_troll, TILES.tile_wisp,
  ]),
];

/** How much of twice a player's intelligence each class gets back as magic, by class index. */
type Share = 'all' | 'half' | 'none' | 'three-quarters' | 'quarter';

const CLASS_SHARE: readonly Share[] = [ 'all', 'half', 'none', 'three-quarters', 'quarter', 'half', 'half' ];


export class Hole extends PortProgram {
  public async run(): Promise<Exit> {
    let exit: Exit = null;

    await this.callWith(J.j_primm_cout, I.bload_camp);
    this.lda(0x00);
    this.ldx(this.cpu.a);
    do {
      this.poke(MAP_OBJECTS.combat_foe_cur_x + this.cpu.x, this.cpu.a);
    } while (this.dex() !== 0);
    await this.layDown();
    await this.callWith(J.j_primm, I.resting);
    this.poke(zp_count, this.lda(SLEEP_FRAMES));
    do {
      await this.m.call(J.j_update_view_combat);
    } while (this.dec(zp_count) !== 0);
    await this.m.call(J.j_rand);
    if (this.lda(this.cpu.a & 0x07) === 0) {
      await this.ambush();
      exit = JUMP_OVERLAY.j_initialize_arena;
    } else {
      await this.checkSleepEffect();
    }

    return exit;
  }


  /** Each living player, prone at its place in the arena. */
  private async layDown(): Promise<void> {
    this.poke(ZP_MAIN.curr_player, this.lda(this.peek(PRTY.party_size)));
    do {
      await this.isAlive();
      if (!this.negative()) {
        this.lda(TILES.tile_human_prone);
        this.ldx(this.peek(ZP_MAIN.curr_player));
        this.dex();
        this.poke(MAP_OBJECTS.combat_player_tile + this.cpu.x, this.cpu.a);
        this.poke(MAP_OBJECTS.combat_player_xpos + this.cpu.x, this.lda(this.peek(MAP_OBJECTS.map_start_player_x + this.cpu.x)));
        this.poke(MAP_OBJECTS.combat_player_ypos + this.cpu.x, this.lda(this.peek(MAP_OBJECTS.map_start_player_y + this.cpu.x)));
      }
    } while (this.dec(ZP_MAIN.curr_player) !== 0);
  }


  /** Monsters, and the party asleep: HOLE drops ULT4's return and goes straight into combat. */
  private async ambush(): Promise<void> {
    await this.callWith(J.j_primm, I.ambushed);
    await this.m.call(J.j_rand);
    this.lda(this.cpu.a & 0x07);
    this.ldy(this.cpu.a);
    this.lda(this.peek(AMBUSH_MONSTERS + this.cpu.y));
    this.poke(ZP_COMBAT.foe_type_encountered, this.cpu.a);
    this.poke(ZP_MAIN.foe_type_combat, this.cpu.a);
    this.poke(ZP_COMBAT.pre_combat_x, this.lda(this.peek(PRTY.player_xpos)));
    this.poke(ZP_COMBAT.pre_combat_y, this.lda(this.peek(PRTY.player_ypos)));
    this.poke(ZP_MAIN.curr_player, this.lda(this.peek(PRTY.party_size)));
    do {
      await this.m.call(J.j_get_stats_ptr);
      this.ldy(ROST.player_status);
      this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y));
      this.cmp(ROST.status_Good);
      if (this.zero()) {
        this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.lda(ROST.status_Sleep));
      }
    } while (this.dec(ZP_MAIN.curr_player) !== 0);
    await this.callWith(J.j_primm_cout, I.bload_camp_again);
    this.cpu.pull();
    this.lda(this.cpu.pull());
  }


  /** Rest counts once between one hundred moves and the next. */
  private async checkSleepEffect(): Promise<void> {
    this.lda(this.peek(PRTY.move_counter + 2));
    this.cmp(this.peek(PRTY.last_sleep));
    if (this.zero()) {
      await this.callWith(J.j_primm, I.no_effect);
    } else {
      this.poke(PRTY.last_sleep, this.cpu.a);
      await this.heal();
      await this.restoreMp();
      await this.callWith(J.j_primm, I.healed);
    }
  }


  private async heal(): Promise<void> {
    this.poke(ZP_MAIN.curr_player, this.lda(this.peek(PRTY.party_size)));
    do {
      await this.isAlive();
      if (!this.negative()) {
        this.ldy(ROST.player_status);
        this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y));
        this.cmp(ROST.status_Sleep);
        if (this.zero()) {
          this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.lda(ROST.status_Good));
        }
        await this.m.call(J.j_rand);
        this.lda(this.cpu.a & 0x77);
        await this.increaseHp();
        this.lda(0x99);
        await this.increaseHp();
      }
    } while (this.dec(ZP_MAIN.curr_player) !== 0);
  }


  private async isAlive(): Promise<void> {
    await this.m.call(J.j_get_stats_ptr);
    this.ldy(ROST.player_status);
    this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y));
    const status: number = this.cpu.a;
    let alive: boolean = false;

    for (const living of [ ROST.status_Good, ROST.status_Poison, ROST.status_Sleep ]) {
      if (!alive) {
        this.cmp(living);
        alive = (status === living);
      }
    }
    this.lda(alive ? 0x00 : 0xFF);
  }


  /** BCD hit points, up to the player's maximum as the original compares it, a byte at a time. */
  private async increaseHp(): Promise<void> {
    this.poke(zp_number, this.cpu.a);
    await this.m.call(J.j_get_stats_ptr);
    const player: number = this.pointer(ZP_MAIN.ptr1);

    this.ldy(ROST.player_cur_hp_lo);
    this.cpu.setFlag(DECIMAL, true);
    this.setCarry(false);
    this.lda(this.peek(player + this.cpu.y));
    this.cpu.adc(this.peek(zp_number));
    this.poke(player + this.cpu.y, this.cpu.a);
    this.dey();
    this.lda(this.peek(player + this.cpu.y));
    this.cpu.adc(0x00);
    this.poke(player + this.cpu.y, this.cpu.a);
    this.cpu.setFlag(DECIMAL, false);
    this.ldy(ROST.player_cur_hp_hi);
    this.lda(this.peek(player + this.cpu.y));
    this.ldy(ROST.player_max_hp_hi);
    this.cmp(this.peek(player + this.cpu.y));
    if (this.carry()) {
      this.ldy(ROST.player_cur_hp_lo);
      this.lda(this.peek(player + this.cpu.y));
      this.ldy(ROST.player_max_hp_lo);
      this.cmp(this.peek(player + this.cpu.y));
      if (this.carry()) {
        this.ldy(ROST.player_max_hp_hi);
        this.lda(this.peek(player + this.cpu.y));
        this.ldy(ROST.player_cur_hp_hi);
        this.poke(player + this.cpu.y, this.cpu.a);
        this.ldy(ROST.player_max_hp_lo);
        this.lda(this.peek(player + this.cpu.y));
        this.ldy(ROST.player_cur_hp_lo);
        this.poke(player + this.cpu.y, this.cpu.a);
      }
    }
  }


  /** Magic for every living player, and, as the loop runs down through zero, for player 0 too. */
  private async restoreMp(): Promise<void> {
    this.poke(ZP_MAIN.curr_player, this.lda(this.peek(PRTY.party_size)));
    do {
      await this.isAlive();
      if (!this.negative()) {
        const player: number = this.pointer(ZP_MAIN.ptr1);

        this.ldy(ROST.player_class_index);
        this.poke(zp_mp_class, this.lda(this.peek(player + this.cpu.y)));
        this.ldy(ROST.player_intelligence);
        this.lda(this.peek(player + this.cpu.y));
        this.decodeBcd();
        this.cpu.a = this.cpu.asl(this.cpu.a);
        this.share(this.classShare());
        this.encodeBcd();
        this.ldy(ROST.player_magic_points);
        this.poke(player + this.cpu.y, this.cpu.a);
      }
    } while ((this.dec(ZP_MAIN.curr_player) & 0x80) === 0);
  }


  /** `ldx zp_mp_class`, then `beq` / `dex` down the classes; past the ranger, none. */
  private classShare(): Share {
    let index: number = 0;

    this.ldx(this.peek(zp_mp_class));
    while (!this.zero() && (index < CLASS_SHARE.length - 1)) {
      this.dex();
      index++;
    }

    return this.zero() ? CLASS_SHARE[index] : 'none';
  }


  private share(share: Share): void {
    if (share === 'none') {
      this.lda(0x00);
    } else if (share === 'half') {
      this.cpu.a = this.cpu.lsr(this.cpu.a);
    } else if (share === 'quarter') {
      this.cpu.a = this.cpu.lsr(this.cpu.lsr(this.cpu.a));
    } else if (share === 'three-quarters') {
      this.cpu.a = this.cpu.lsr(this.cpu.a);
      this.poke(zp_mp_number, this.cpu.a);
      this.cpu.a = this.cpu.lsr(this.cpu.a);
      this.cpu.adc(this.peek(zp_mp_number));
    }
  }


  /** A binary number as BCD, counted up in decimal mode, up to 99. */
  private encodeBcd(): void {
    this.cmp(0x00);
    if (!this.zero()) {
      this.cmp(BCD_MAX);
      if (this.carry()) {
        this.lda(0x99);
      } else {
        this.cpu.setFlag(DECIMAL, true);
        this.ldx(this.cpu.a);
        this.lda(0x00);
        do {
          this.add(0x01);
        } while (this.dex() !== 0);
      }
    }
    this.cpu.setFlag(DECIMAL, false);
  }


  /** A BCD number as binary, counted down in decimal mode. */
  private decodeBcd(): void {
    this.cmp(0x00);
    if (!this.zero()) {
      this.ldx(0x00);
      this.cpu.setFlag(DECIMAL, true);
      do {
        this.inx();
      } while (this.subtract(0x01) !== 0);
      this.lda(this.cpu.x);
      this.cpu.setFlag(DECIMAL, false);
    }
  }
}


export const HOLE_MODULE = overlayModule('HOLE', OVERLAY_ENTRY, HOLE_DATA, (machine: LiftedMachine): Hole => new Hole(machine), (program: Hole): Promise<Exit> => program.run());
