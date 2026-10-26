// towne/SHP6.s: the inns, ported: a night's lodging for gold, Minoc's choice of three rooms, the
// party asleep in the bed, healed and its magic restored by morning; or a rogue in the night, or in
// Skara Brae a ghost. ULT4's check_shop loads it at $8800.

import { DECIMAL } from '../../../lifted-runtime/cpu';
import type { LiftedMachine } from '../../../lifted-runtime/lifted-machine';
import { CHAR, JUMP_OVERLAY, JUMP_SUBS, MAP_OBJECTS, PRTY, ROST, TILES, ZP_MAIN } from '../../../state/symbols';
import { inline } from '../../inline-data';
import type { IInlineData } from '../../inline-data';
import type { Exit } from '../../routine';
import { OVERLAY_ENTRY, overlayModule, text } from '../overlay';
import { ShopOverlay, stringTable } from './shop-overlay';

const J = JUMP_SUBS;
const O = MAP_OBJECTS;
const zp_amount: number = 0xD8;
const zp_class: number = 0xD8;
const zp_delay: number = 0xD8;
const zp_amount_hp: number = 0xDA;
const zp_shop_num: number = 0xEA;
const PROPRIETOR: number = 0x08;
const ROOM: number = 0x0F;
const INN_COMBAT_SITE: number = 0x8AE0;
const GHOST_DIALOGUE: number = 0x10;

type Share = 'all' | 'half' | 'none' | 'three_quarters' | 'quarter';

/** Of twice the intelligence, by class from mage to ranger: the `dex` / `beq` chain of restore_mp. */
const MP_SHARES: readonly Share[] = [ 'all', 'half', 'none', 'three_quarters', 'quarter', 'half', 'half' ];

const SHP6_TABLES = {
  location_table: 0x8B47,
  table_bed_x: 0x8B57,
  table_bed_y: 0x8B5E,
  hotel_bed_x: 0x8B69,
  hotel_bed_y: 0x8B6C,
  price: 0x8B6F,
  hotel_price: 0x8B76,
  string_table: 0x8BC1,
  modulus: 0x8EED,
} as const;

const T = SHP6_TABLES;

export const SHP6_INLINE = {
  horse: text(0x8809, 'THE INNKEEPER\nSAYS: GET THAT\nHORSE OUT OF\nHERE!!!\n'),
  welcome_to: text(0x8840, '\nTHE INNKEEPER\nSAYS: WELCOME TO\n'),
  i_am: text(0x8871, '\n\nI AM '),
  need_lodging: text(0x8884, '\nARE YOU IN NEED\nOF LODGING?'),
  wrong_place: text(0x88BC, ' SAYS:\nTHEN YOU HAVE\nCOME TO THE\nWRONG PLACE!\nGOOD DAY.\n'),
  beds: text(0x890A, '\n1, 2 OR 3 BEDS?'),
  take_it: text(0x8940, '\n\nTAKE IT?'),
  cancel: text(0x8955, '\nYOU WON\'T FIND\nA BETTER DEAL IN\nTHIS TOWNE!\n'),
  cannot_pay: text(0x8991, '\nIF YOU CAN\'T PAY\nYOU CAN\'T STAY!\nGOOD BYE.\n'),
  pleasant_night: text(0x89C5, '\nVERY GOOD, HAVE\nA PLEASANT\nNIGHT.\n'),
  rats: text(0x89F3, '\nOH, AND DON\'T\nMIND THE STRANGE\nNOISES, IT\'S\nONLY RATS!\n'),
  stroll: text(0x8AA9, '\nIN THE MIDDLE\nOF THE NIGHT\nWHILE OUT FOR A\nSTROLL...\n'),
  eerie_noise: text(0x8AF6, '\nYOU WAKE TO AN\nEERIE NOISE!\n'),
  morning: text(0x8B3B, '\nMORNING!\n'),
} as const;

const I = SHP6_INLINE;

const LOCATION_TABLE: readonly number[] = [
  0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x00, 0x04, 0x05, 0x06, 0x00, 0x00, 0x00, 0x07, 0x00,
];

const TABLE_BED_X: readonly number[] = [
  0x1C, 0x1D, 0x0A, 0x02, 0x1D, 0x1C, 0x19,
];

const TABLE_BED_Y: readonly number[] = [
  0x06, 0x06, 0x1A, 0x06, 0x02, 0x0B, 0x17,
];

/** Minoc's three rooms, of one, two and three beds. */
const HOTEL_BED_X: readonly number[] = [
  0x02, 0x02, 0x08,
];

const HOTEL_BED_Y: readonly number[] = [
  0x06, 0x02, 0x02,
];

const PRICE: readonly number[] = [
  0x20, 0x15, 0x10, 0x30, 0x15, 0x05, 0x01,
];

const HOTEL_PRICE: readonly number[] = [
  0x30, 0x60, 0x90,
];

const STRINGS: readonly string[] = [
  '',
  'THE HONEST INN',
  'BRITANNIA MANOR',
  'THE INN OF ENDS',
  'WAYFARERS INN',
  'HONORABLE INN',
  'THE INN OF\nTHE SPIRITS',
  'THE SLEEP SHOP',
  'SCATU',
  'JASON',
  'SMIRK',
  'ESTRO',
  'ZAJAC',
  'TYRONE',
  'TYMUS',
  'WE HAVE A ROOM\nWITH 2 BEDS\nTHAT RENTS FOR\n20gp.',
  'WE HAVE A MODEST\nSIZED ROOM WITH\n1 BED FOR 15gp.',
  'WE HAVE A VERY\nSECURE ROOM OF\nMODEST SIZE AND\n1 BED FOR 10gp.',
  'WE HAVE THREE\nROOMS AVAILABLE,\nA 1, 2 AND 3 BED\nROOM FOR 30, 60\nAND 90gp EACH.',
  'WE HAVE A SINGLE\nBED ROOM WITH\nA BACK DOOR\nFOR 15gp.',
  'UNFORTUNATELY, I\nHAVE BUT ONLY\nA VERY SMALL\nROOM WITH 1 BED.\nWORSE YET, IT IS\nHAUNTED! IF YOU\nDO WISH TO STAY\nIT COSTS 5gp.',
  'ALL WE HAVE IS\nTHAT COT OVER\nTHERE, BUT IT IS\nCOMFORTABLE, AND\nONLY 1gp.',
];

export const SHP6_DATA: readonly IInlineData[] = [
  ...Object.values(SHP6_INLINE),
  inline(T.location_table, LOCATION_TABLE),
  inline(T.table_bed_x, TABLE_BED_X),
  inline(T.table_bed_y, TABLE_BED_Y),
  inline(T.hotel_bed_x, HOTEL_BED_X),
  inline(T.hotel_bed_y, HOTEL_BED_Y),
  inline(T.price, PRICE),
  inline(T.hotel_price, HOTEL_PRICE),
  stringTable(T.string_table, STRINGS),
  inline(T.modulus, [ 0x00 ]),
];


export class Shp6 extends ShopOverlay {
  constructor(machine: LiftedMachine) {
    super(machine, T.string_table);
  }


  public async run(): Promise<Exit> {
    this.lda(this.peek(PRTY.player_transport));
    this.cmp(TILES.tile_walk);
    if (this.zero()) {
      await this.askLodging();
    } else {
      await this.print(I.horse);
    }

    return null;
  }


  private async offset(at: number): Promise<void> {
    this.setCarry(false);
    this.lda(this.peek(zp_shop_num));
    this.cpu.adc(at);
    await this.printString(this.cpu.a);
  }


  private async askLodging(): Promise<void> {
    await this.print(I.welcome_to);
    this.ldx(this.peek(PRTY.current_location));
    this.dex();
    this.poke(zp_shop_num, this.lda(this.peek(T.location_table + this.cpu.x)));
    this.dec(zp_shop_num);
    await this.printString(this.cpu.a);
    await this.print(I.i_am);
    await this.offset(PROPRIETOR);
    await this.print(I.need_lodging);
    await this.inputChar();
    this.cmp(CHAR.char_Y);
    if (this.zero()) {
      await this.printPrice();
    } else {
      await this.m.call(J.j_clearstatwindow);
      await this.m.call(J.j_update_status);
      await this.printNewline();
      await this.offset(PROPRIETOR);
      await this.print(I.wrong_place);
    }
  }


  /** The room and its price; in Minoc a room of one, two or three beds, which becomes the inn's. */
  private async printPrice(): Promise<void> {
    let taken: boolean = false;

    await this.printNewline();
    await this.offset(ROOM);
    this.lda(this.peek(zp_shop_num));
    this.cmp(PRTY.towne_minoc);
    if (this.zero()) {
      await this.print(I.beds);
      await this.inputChar();
      this.subtract(CHAR.char_1);
      this.cmp(0x03);
      taken = !this.carry();
      if (taken) {
        this.ldy(this.cpu.a);
        this.ldx(this.peek(zp_shop_num));
        this.poke(T.table_bed_x + this.cpu.x, this.lda(this.peek(T.hotel_bed_x + this.cpu.y)));
        this.poke(T.table_bed_y + this.cpu.x, this.lda(this.peek(T.hotel_bed_y + this.cpu.y)));
        this.poke(T.price + this.cpu.x, this.lda(this.peek(T.hotel_price + this.cpu.y)));
      }
    } else {
      await this.print(I.take_it);
      await this.inputChar();
      this.cmp(CHAR.char_Y);
      taken = this.zero();
    }
    if (taken) {
      await this.tryPay();
    } else {
      await this.print(I.cancel);
    }
  }


  private async tryPay(): Promise<void> {
    this.ldx(this.peek(zp_shop_num));
    this.lda(this.peek(T.price + this.cpu.x));
    this.trySpend(zp_amount);
    if (this.negative()) {
      await this.print(I.cannot_pay);
    } else {
      await this.m.call(J.j_update_status);
      await this.print(I.pleasant_night);
      await this.m.call(J.j_rand);
      if ((this.cpu.a & 0x03) === 0) {
        await this.print(I.rats);
      }
      await this.night();
    }
  }


  private async delay(turns: number): Promise<void> {
    this.poke(zp_delay, this.lda(turns));
    do {
      await this.m.call(J.j_update_view);
    } while (this.dec(zp_delay) !== 0);
  }


  /** To bed and asleep; the party woken, healed by 100 to 198 and its magic restored; and what comes in the night. */
  private async night(): Promise<void> {
    await this.delay(0x0A);
    this.ldx(this.peek(zp_shop_num));
    this.poke(PRTY.player_xpos, this.lda(this.peek(T.table_bed_x + this.cpu.x)));
    this.poke(PRTY.player_ypos, this.lda(this.peek(T.table_bed_y + this.cpu.x)));
    await this.delay(0x0A);
    this.poke(PRTY.player_transport, this.lda(TILES.tile_human_prone));
    await this.delay(0x32);
    this.poke(PRTY.player_transport, this.lda(TILES.tile_walk));
    this.poke(ZP_MAIN.curr_player, this.lda(this.peek(PRTY.party_size)));
    do {
      await this.isAlive();
      if (!this.negative()) {
        await this.wake();
      }
    } while (this.dec(ZP_MAIN.curr_player) !== 0);
    await this.restoreMp();
    this.poke(ZP_MAIN.curr_player, this.lda(0x01));
    await this.isAlive();
    if (!this.negative() && ((await this.rand() & 0x07) === 0)) {
      await this.print(I.stroll);
      await this.m.callInline(JUMP_OVERLAY.j_inn_combat, INN_COMBAT_SITE + 3, 0);
    } else {
      await this.haunting();
    }
    await this.m.call(J.j_update_view);
    await this.print(I.morning);
  }


  private async rand(): Promise<number> {
    await this.m.call(J.j_rand);

    return this.cpu.a;
  }


  /** A sleeper woken, and twice a number from 50 to 99 in BCD added to its hit points. */
  private async wake(): Promise<void> {
    this.ldy(ROST.player_status);
    this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + ROST.player_status));
    this.cmp(ROST.status_Sleep);
    if (this.zero()) {
      this.poke(this.pointer(ZP_MAIN.ptr1) + ROST.player_status, this.lda(ROST.status_Good));
    }
    this.lda(0x32);
    await this.randModulo();
    this.cpu.adc(0x32);
    this.ldx(this.cpu.a);
    this.lda(0x00);
    this.cpu.setFlag(DECIMAL, true);
    do {
      this.cpu.adc(0x01);
    } while (this.dex() !== 0);
    this.cpu.setFlag(DECIMAL, false);
    this.cpu.push(this.cpu.a);
    await this.incHp();
    this.lda(this.cpu.pull());
    await this.incHp();
  }


  /** In Skara Brae, one night in four, a ghost beside the bed. */
  private async haunting(): Promise<void> {
    this.lda(this.peek(zp_shop_num));
    this.cmp(PRTY.towne_skara_brae);
    if (this.zero() && ((await this.rand() & 0x03) === 0)) {
      await this.print(I.eerie_noise);
      this.ldx(0x00);
      this.lda(TILES.tile_ghost);
      this.poke(O.object_tile_type, this.cpu.a);
      this.poke(O.object_tile_sprite, this.cpu.a);
      this.poke(O.object_ypos, this.lda(this.peek(PRTY.player_ypos)));
      this.lda(this.peek(PRTY.player_xpos));
      this.poke(O.object_xpos, this.subtract(0x01));
      this.poke(O.npc_movement_ai, this.lda(O.ai_random));
      this.poke(O.npc_dialogue, this.lda(GHOST_DIALOGUE));
    }
  }


  /** inc_hp: A in BCD onto the current player's hit points, held to the most only when both bytes reach it. */
  private async incHp(): Promise<void> {
    const stats: () => number = (): number => this.pointer(ZP_MAIN.ptr1);

    this.poke(zp_amount_hp, this.cpu.a);
    await this.m.call(J.j_get_stats_ptr);
    this.ldy(ROST.player_cur_hp_lo);
    this.cpu.setFlag(DECIMAL, true);
    this.setCarry(false);
    this.lda(this.peek(stats() + ROST.player_cur_hp_lo));
    this.cpu.adc(this.peek(zp_amount_hp));
    this.poke(stats() + ROST.player_cur_hp_lo, this.cpu.a);
    this.dey();
    this.lda(this.peek(stats() + ROST.player_cur_hp_hi));
    this.cpu.adc(0x00);
    this.poke(stats() + ROST.player_cur_hp_hi, this.cpu.a);
    this.cpu.setFlag(DECIMAL, false);
    this.ldy(ROST.player_cur_hp_hi);
    this.lda(this.peek(stats() + ROST.player_cur_hp_hi));
    this.ldy(ROST.player_max_hp_hi);
    this.cmp(this.peek(stats() + ROST.player_max_hp_hi));
    if (this.carry()) {
      this.ldy(ROST.player_cur_hp_lo);
      this.lda(this.peek(stats() + ROST.player_cur_hp_lo));
      this.ldy(ROST.player_max_hp_lo);
      this.cmp(this.peek(stats() + ROST.player_max_hp_lo));
      if (this.carry()) {
        this.ldy(ROST.player_max_hp_hi);
        this.lda(this.peek(stats() + ROST.player_max_hp_hi));
        this.ldy(ROST.player_cur_hp_hi);
        this.poke(stats() + ROST.player_cur_hp_hi, this.cpu.a);
        this.ldy(ROST.player_max_hp_lo);
        this.lda(this.peek(stats() + ROST.player_max_hp_lo));
        this.ldy(ROST.player_cur_hp_lo);
        this.poke(stats() + ROST.player_cur_hp_lo, this.cpu.a);
      }
    }
  }


  /** is_alive: A 0 for a member of the party who is good, poisoned or asleep, $FF otherwise, with its flags. */
  private async isAlive(): Promise<void> {
    let alive: boolean = false;

    await this.m.call(J.j_get_stats_ptr);
    this.ldy(ROST.player_status);
    this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + ROST.player_status));
    for (const status of [ ROST.status_Good, ROST.status_Poison, ROST.status_Sleep ]) {
      if (!alive) {
        this.cmp(status);
        alive = this.zero();
      }
    }
    if (alive) {
      this.lda(this.peek(ZP_MAIN.curr_player));
      this.cmp(this.peek(PRTY.party_size));
      alive = this.zero() || !this.carry();
    }
    this.lda(alive ? 0x00 : 0xFF);
  }


  /** rand_modulo: a random number below A, unless A is 0, with the carry set. */
  private async randModulo(): Promise<void> {
    this.cmp(0x00);
    if (!this.zero()) {
      this.poke(T.modulus, this.cpu.a);
      await this.m.call(J.j_rand);
      this.cmp(this.peek(T.modulus));
      while (this.carry()) {
        this.subtract(this.peek(T.modulus));
        this.cmp(this.peek(T.modulus));
      }
      this.cmp(0x00);
    }
  }


  /** restore_mp: each member's magic points from intelligence by class, from the last to the one before the first. */
  private async restoreMp(): Promise<void> {
    this.poke(ZP_MAIN.curr_player, this.lda(this.peek(PRTY.party_size)));
    do {
      await this.isAlive();
      if (!this.negative()) {
        this.restoreOwnMp();
      }
    } while (this.dec(ZP_MAIN.curr_player) < 0x80);
  }


  /** Twice the intelligence for a mage, all or a part of it for the others, none for a fighter or shepherd. */
  private restoreOwnMp(): void {
    const stats: number = this.pointer(ZP_MAIN.ptr1);

    this.ldy(ROST.player_class_index);
    const classIndex: number = this.lda(this.peek(stats + ROST.player_class_index));
    this.poke(zp_class, classIndex);
    this.ldy(ROST.player_intelligence);
    this.lda(this.peek(stats + ROST.player_intelligence));
    this.decodeBcdValue();
    this.cpu.a = this.cpu.asl(this.cpu.a);
    const share: Share = MP_SHARES[classIndex] ?? 'none';
    this.ldx((classIndex < MP_SHARES.length) ? 0x00 : classIndex - (MP_SHARES.length - 1));
    if (share === 'none') {
      this.lda(0x00);
    } else if (share === 'quarter') {
      this.cpu.a = this.cpu.lsr(this.cpu.lsr(this.cpu.a));
    } else if (share === 'half') {
      this.cpu.a = this.cpu.lsr(this.cpu.a);
    } else if (share === 'three_quarters') {
      this.cpu.a = this.cpu.lsr(this.cpu.a);
      this.poke(zp_amount, this.cpu.a);
      this.cpu.a = this.cpu.lsr(this.cpu.a);
      this.cpu.adc(this.peek(zp_amount));
    }
    this.encodeBcdValue();
    this.ldy(ROST.player_magic_points);
    this.poke(stats + ROST.player_magic_points, this.cpu.a);
  }
}


export const SHP6_MODULE = overlayModule('towne', 'SHP6', OVERLAY_ENTRY, SHP6_DATA, (machine: LiftedMachine): Shp6 => new Shp6(machine), (program: Shp6): Promise<Exit> => program.run());
