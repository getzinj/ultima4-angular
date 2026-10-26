// underworld/SEAR.s: Search in a dungeon, ported. An orb, touched by a member of the party who is
// awake, hurts them by the dungeon's depth and raises the dungeon's own stats by five; a fountain
// heals, hurts, cures or poisons whoever drinks, or does nothing; and the altar of each of the six
// dungeons with a stone holds it, its colour the dungeon's, for honour and experience. ULT4's
// cmd_search loads it at $8800.

import { DECIMAL } from '../../../lifted-runtime/cpu';
import type { LiftedMachine } from '../../../lifted-runtime/lifted-machine';
import { DUNGEON, JUMP_SUBS, PRTY, ROST, SOUND, TABLES, ZP_MAIN } from '../../../state/symbols';
import { inline } from '../../inline-data';
import type { IInlineData } from '../../inline-data';
import { PortProgram } from '../../port-program';
import type { Exit } from '../../routine';
import { OVERLAY_ENTRY, overlayModule, text } from '../overlay';

const J = JUMP_SUBS;
const D = DUNGEON;
const zp_save_reg: number = 0xD9;
const zp_amount: number = 0xDA;
const zp_count: number = 0xF0;
const STONE_HONOR: number = 0x05;
const STONE_EXPERIENCE: number = 0x02;
const FOUNTAIN_DAMAGE: number = 0x01;

const SEAR_TABLES = {
  bit_msb: 0x8B35,
  orb_strength: 0x8B3D,
  orb_dexterity: 0x8B45,
  orb_intelligence: 0x8B4D,
  orb_damage: 0x8B55,
  dungeon_number: 0x8B5D,
} as const;

const T = SEAR_TABLES;

export const UNDERWORLD_SEAR_INLINE = {
  find_nothing: text(0x880F, '\nYOU FIND\nNOTHING!\n'),
  orb: text(0x883B, '\nYOU FIND A\nMAGICAL BALL...\nWHO WILL TOUCH\nIT? '),
  strength: text(0x889E, 'STRENGTH+5\n'),
  dexterity: text(0x88BA, 'DEXTERITY+5\n'),
  intelligence: text(0x88D7, 'INTELLIGENCE+5\n'),
  fountain: text(0x88EB, '\nYOU FIND A\nFOUNTAIN, WHO\nWILL DRINK? '),
  no_effect: text(0x8936, '\nHMMM--NO EFFECT!\n'),
  refreshing: text(0x894D, '\nAHH--REFRESHING!\n'),
  nasty: text(0x8974, '\nBLECK--NASTY!\n'),
  delicious: text(0x899F, '\nMMM--DELICIOUS!\n'),
  choke: text(0x89C7, '\nARGH-CHOKE-GASP!\n'),
  you_find_the: text(0x89FC, '\nYOU FIND THE\n'),
  stone: text(0x8A11, ' STONE!\n'),
  blue: text(0x8A6D, 'BLUE'),
  yellow: text(0x8A76, 'YELLOW'),
  red: text(0x8A81, 'RED'),
  green: text(0x8A89, 'GREEN'),
  orange: text(0x8A93, 'ORANGE'),
  purple: text(0x8A9E, 'PURPLE'),
} as const;

const I = UNDERWORLD_SEAR_INLINE;

/** Each dungeon's stone colour, from Deceit's blue; Shame's, past orange, is purple. */
const COLOURS: readonly IInlineData[] = [ I.blue, I.yellow, I.red, I.green, I.orange ];

export const UNDERWORLD_SEAR_DATA: readonly IInlineData[] = [
  ...Object.values(UNDERWORLD_SEAR_INLINE),
  inline(T.bit_msb, [ 0x80, 0x40, 0x20, 0x10, 0x08, 0x04, 0x02, 0x01 ]),
  inline(T.orb_strength, [ 0x00, 0x00, 0x05, 0x00, 0x05, 0x05, 0x05, 0x00 ]),
  inline(T.orb_dexterity, [ 0x00, 0x05, 0x00, 0x05, 0x05, 0x00, 0x05, 0x00 ]),
  inline(T.orb_intelligence, [ 0x05, 0x00, 0x00, 0x05, 0x00, 0x05, 0x05, 0x00 ]),
  inline(T.orb_damage, [ 0x02, 0x02, 0x02, 0x04, 0x04, 0x04, 0x08, 0x08 ]),
  inline(T.dungeon_number, [ 0x00 ]),
];


export class UnderworldSear extends PortProgram {
  constructor(machine: LiftedMachine) {
    super(machine);
  }


  public async run(): Promise<Exit> {
    let found: boolean = false;

    this.lda(this.peek(PRTY.current_location));
    this.poke(T.dungeon_number, this.subtract(PRTY.loc_dng_first));
    if (this.lda(this.peek(ZP_MAIN.tile_under_player)) !== 0) {
      this.lda(this.cpu.a & D.dng_tile_type_mask);
      this.cmp(D.dng_tile_orb);
      if (this.zero()) {
        found = await this.findOrb();
      } else {
        this.cmp(D.dng_tile_fountain);
        if (this.zero()) {
          found = await this.findFountain();
        } else {
          this.cmp(D.dng_tile_altar);
          found = this.zero() && await this.findAltar();
        }
      }
    }
    if (!found) {
      await this.print(I.find_nothing);
    }

    return null;
  }


  private print(block: IInlineData): Promise<void> {
    return this.callWith(J.j_primm, block);
  }


  /** A member of the party chosen, true (A 0, Z set) if awake: good or poisoned. */
  private async whoAwake(): Promise<boolean> {
    await this.m.call(J.j_getplayernum);
    await this.isAwake();

    return this.zero();
  }


  /** The orb, gone from the map once touched: the dungeon's damage, and its stats raised. */
  private async findOrb(): Promise<boolean> {
    await this.print(I.orb);
    const touched: boolean = await this.whoAwake();

    if (touched) {
      this.poke(PRTY.dest_x, this.lda(this.peek(PRTY.player_xpos)));
      this.poke(PRTY.dest_y, this.lda(this.peek(PRTY.player_ypos)));
      await this.m.call(J.j_gettile_dungeon);
      this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.lda(0x00));
      this.ldy(this.peek(T.dungeon_number));
      this.lda(this.peek(T.orb_damage + this.cpu.y));
      await this.damagePlayer();
      for (const [ table, stat, raised ] of [
        [ T.orb_strength, ROST.player_strength, I.strength ],
        [ T.orb_dexterity, ROST.player_dexterity, I.dexterity ],
        [ T.orb_intelligence, ROST.player_intelligence, I.intelligence ],
      ] as const) {
        this.ldy(this.peek(T.dungeon_number));
        if (this.lda(this.peek(table + this.cpu.y)) !== 0) {
          this.ldy(stat);
          await this.incrementStat();
          await this.print(raised);
        }
      }
    }

    return touched;
  }


  private async findFountain(): Promise<boolean> {
    await this.print(I.fountain);
    const drunk: boolean = await this.whoAwake();

    if (drunk) {
      await this.drink();
    }

    return drunk;
  }


  /** The fountain's water, by the low nibble of its tile: none, healing, harm, a cure, poison. */
  private async drink(): Promise<void> {
    let effect: boolean = false;
    const status: () => number = (): number => this.pointer(ZP_MAIN.ptr1) + ROST.player_status;

    this.lda(this.peek(ZP_MAIN.tile_under_player) & D.dng_tile_fountain_mask);
    if (!this.zero()) {
      this.cmp(D.fountain_heal);
      if (this.zero()) {
        await this.print(I.refreshing);
        await this.m.call(J.j_get_stats_ptr);
        this.ldy(ROST.player_max_hp_hi);
        this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y));
        this.ldy(ROST.player_cur_hp_hi);
        this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.cpu.a);
        this.lda(0x00);
        this.iny();
        this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.cpu.a);
        effect = true;
      } else {
        this.cmp(D.fountain_harm);
        if (this.zero()) {
          await this.print(I.nasty);
          this.lda(FOUNTAIN_DAMAGE);
          await this.damagePlayer();
          effect = true;
        } else {
          this.cmp(D.fountain_cure);
          if (this.zero()) {
            await this.m.call(J.j_get_stats_ptr);
            this.ldy(ROST.player_status);
            this.lda(this.peek(status()));
            this.cmp(ROST.status_Poison);
            effect = this.zero();
            if (effect) {
              this.poke(status(), this.lda(ROST.status_Good));
              await this.print(I.delicious);
            }
          } else {
            this.cmp(D.fountain_poison);
            if (this.zero()) {
              await this.m.call(J.j_get_stats_ptr);
              this.ldy(ROST.player_status);
              this.lda(this.peek(status()));
              this.cmp(ROST.status_Poison);
              effect = !this.zero();
              if (effect) {
                this.poke(status(), this.lda(ROST.status_Poison));
                await this.print(I.choke);
                this.lda(FOUNTAIN_DAMAGE);
                await this.damagePlayer();
              }
            }
          }
        }
      }
    }
    if (!effect) {
      await this.print(I.no_effect);
    }
  }


  /** The dungeon's stone, but in the Abyss and Hythloth, and once only: honour by five, the leader's experience by 200. */
  private async findAltar(): Promise<boolean> {
    let found: boolean = false;

    this.lda(this.peek(T.dungeon_number));
    this.cmp(PRTY.dng_abyss);
    if (!this.zero()) {
      this.cmp(PRTY.dng_hythloth);
      if (!this.zero()) {
        this.ldy(this.peek(T.dungeon_number));
        found = this.lda(this.peek(T.bit_msb + this.cpu.y) & this.peek(ROST.stones)) === 0;
      }
    }
    if (found) {
      await this.print(I.you_find_the);
      await this.printColour();
      await this.print(I.stone);
      this.ldy(this.peek(T.dungeon_number));
      this.poke(ROST.stones, this.lda(this.peek(T.bit_msb + this.cpu.y) | this.peek(ROST.stones)));
      this.cpu.setFlag(DECIMAL, true);
      this.setCarry(false);
      if (this.lda(this.peek(ROST.party_stats + ROST.virtue_honor)) !== 0) {
        this.cpu.adc(STONE_HONOR);
        if (this.carry()) {
          this.lda(0x99);
        }
      }
      this.poke(ROST.party_stats + ROST.virtue_honor, this.cpu.a);
      this.cpu.setFlag(DECIMAL, false);
      await this.leaderExperience();
    }

    return found;
  }


  private async leaderExperience(): Promise<void> {
    this.poke(ZP_MAIN.curr_player, this.lda(0x01));
    await this.m.call(J.j_get_stats_ptr);
    this.ldy(ROST.player_experience_hi);
    this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y));
    this.cpu.setFlag(DECIMAL, true);
    this.setCarry(false);
    this.cpu.adc(STONE_EXPERIENCE);
    if (this.carry()) {
      this.lda(0x99);
      this.iny();
      this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.cpu.a);
      this.dey();
    }
    this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.cpu.a);
    this.cpu.setFlag(DECIMAL, false);
  }


  private async printColour(): Promise<void> {
    let colour: IInlineData = I.purple;
    let chosen: boolean = false;

    this.lda(this.peek(T.dungeon_number));
    COLOURS.forEach((block: IInlineData, dungeon: number): void => {
      if (!chosen) {
        this.cmp(dungeon);
        if (this.zero()) {
          colour = block;
          chosen = true;
        }
      }
    });
    await this.print(colour);
  }


  /** damage_player: A hundreds of the current player's hit points, flashed; dead at nothing. */
  private async damagePlayer(): Promise<void> {
    this.poke(zp_amount, this.cpu.a);
    this.invertPlayer();
    for (let sound: number = 0; sound < 3; sound++) {
      this.lda(SOUND.sound_firewalk);
      await this.m.call(J.j_playsfx);
    }
    this.invertPlayer();
    await this.m.call(J.j_get_stats_ptr);
    this.cpu.setFlag(DECIMAL, true);
    this.setCarry(true);
    this.ldy(ROST.player_cur_hp_hi);
    this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y));
    this.cpu.sbc(this.peek(zp_amount));
    this.cpu.setFlag(DECIMAL, false);
    if (this.carry()) {
      this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.cpu.a);
    } else {
      this.lda(0x00);
      this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.cpu.a);
      this.iny();
      this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.cpu.a);
      this.ldy(ROST.player_status);
      this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.lda(ROST.status_Dead));
    }
  }


  /** is_awake: A 0 (Z set) for a member of the party, good or poisoned; $FF otherwise. */
  private async isAwake(): Promise<void> {
    let awake: boolean = false;

    if (this.lda(this.peek(ZP_MAIN.curr_player)) !== 0) {
      await this.m.call(J.j_get_stats_ptr);
      this.ldy(ROST.player_status);
      this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y));
      this.cmp(ROST.status_Good);
      awake = this.zero();
      if (!awake) {
        this.cmp(ROST.status_Poison);
        awake = this.zero();
      }
    }
    this.lda(awake ? 0x00 : 0xFF);
  }


  /** The current player's eight lines of the status window, columns 24 to 38, the colour's bit kept. */
  private invertPlayer(): void {
    this.lda(this.peek(ZP_MAIN.curr_player));
    this.ldx(this.cpu.asl(this.cpu.asl(this.cpu.asl(this.cpu.a))));
    this.poke(zp_count, this.lda(0x08));
    do {
      this.poke(ZP_MAIN.ptr1, this.lda(this.peek(TABLES.bmplineaddr_lo + this.cpu.x)));
      this.poke(ZP_MAIN.ptr1 + 1, this.lda(this.peek(TABLES.bmplineaddr_hi + this.cpu.x)));
      this.ldy(0x26);
      do {
        this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y) ^ 0x7F));
        this.dey();
        this.cpu.compare(this.cpu.y, 0x18);
      } while (this.carry());
      this.inx();
    } while (this.dec(zp_count) !== 0);
  }


  /** increment_stat: stat Y of the current player up by A in BCD, to 50 at most. */
  private async incrementStat(): Promise<void> {
    this.poke(zp_amount, this.cpu.a);
    this.poke(zp_save_reg, this.cpu.y);
    await this.m.call(J.j_get_stats_ptr);
    this.cpu.setFlag(DECIMAL, true);
    this.setCarry(false);
    this.ldy(this.peek(zp_save_reg));
    this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y));
    this.cpu.adc(this.peek(zp_amount));
    this.cpu.setFlag(DECIMAL, false);
    this.cmp(ROST.stat_max + 1);
    if (this.carry()) {
      this.lda(ROST.stat_max);
    }
    this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.cpu.a);
  }
}


export const UNDERWORLD_SEAR_MODULE = overlayModule('underworld', 'SEAR', OVERLAY_ENTRY, UNDERWORLD_SEAR_DATA, (machine: LiftedMachine): UnderworldSear => new UnderworldSear(machine),
  (program: UnderworldSear): Promise<Exit> => program.run());
