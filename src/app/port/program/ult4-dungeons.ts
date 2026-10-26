// ULT4.s's dungeon code, ported: the monsters spawning on the level and moving through its halls,
// a fight where the party stands on a monster, the rooms read from the dungeon's own disk with
// their foes and the party's places, the way out of a room and of the altar rooms, and whether the
// party may advance or retreat. Only the 3D view (DNGD) is still lifted. Like the rest of ULT4's
// port, each entry leaves the registers and flags as the original does, and returns where control
// goes next.

import { DOS, DUNGEON, JUMP_OVERLAY, JUMP_SUBS, MAP_OBJECTS, MUSIC, PRTY, TILES, ZP_COMBAT, ZP_MAIN } from '../../state/symbols';
import type { Exit } from '../routine';
import { COMBAT_ENTRIES, COMBAT_TABLES, COMBAT_VARIABLES } from './ult4-combat-data';
import { COMMAND_TABLES } from './ult4-commands-data';
import { DUNGEON_INLINE, DUNGEON_TABLES } from './ult4-dungeons-data';
import { Ult4Townes } from './ult4-townes';

const C = COMBAT_ENTRIES;
const CT = COMBAT_TABLES;
const CV = COMBAT_VARIABLES;
const DI = DUNGEON_INLINE;
const DT = DUNGEON_TABLES;
const D = DUNGEON;
const J = JUMP_SUBS;
const O = MAP_OBJECTS;
/** ULT4.s's own uses of zero page for the dungeons. */
const zp_index1: number = 0xD8;
const zp_number1: number = 0xD8;
const zp_save_reg1: number = 0xD8;
const zp_trainer_avoid: number = 0xD8;
const zp_attempts: number = 0xF0;
const CHANCE_8: number = 0x07;
const MOVE_ATTEMPTS: number = 0x07;
const ALTAR_ROOM: number = 0x0F;
const ALTAR_LOVE_X: number = 0x03;
/** The foe types, from the tile under the party, of tiles where no foe can be met. */
const NO_FOE_TILES: readonly number[] = [ D.dng_tile_trap, D.dng_tile_fountain, D.dng_tile_field, D.dng_tile_room, D.dng_tile_wall ];


export class Ult4Dungeons extends Ult4Townes {
  // --- the monsters (ULT4.s:4939-4994, 5443-5561, 8223-8256) ------------------------------------

  /** ULT4.s spawn_dungeon: a monster of the level's four kinds in each free slot of the level's own, somewhere empty and off the party's row and column. */
  public async spawnDungeon(): Promise<Exit> {
    let done: boolean = false;

    this.lda(this.peek(PRTY.dungeon_level));
    this.cpu.a = this.cpu.asl(this.cpu.asl(this.cpu.a));
    this.cpu.adc(0x01);
    this.ldx(this.cpu.a);
    while (!done) {
      if (this.lda(this.peek(O.object_tile_type + this.cpu.x)) === 0) {
        await this.spawnInSlot();
      }
      if (this.dex() >= 0x80) {
        done = true;
      } else {
        this.lda(this.cpu.x);
        this.cpu.a = this.cpu.lsr(this.cpu.lsr(this.cpu.a));
        this.cmp(this.peek(PRTY.dungeon_level));
        done = !this.carry();
      }
    }

    return null;
  }


  private async spawnInSlot(): Promise<void> {
    let placed: boolean = false;

    this.poke(zp_index1, this.cpu.x);
    await this.m.call(J.j_rand);
    this.poke(PRTY.dest_x, this.lda(this.cpu.a & O.xy_max_dungeon));
    this.cmp(this.peek(PRTY.player_xpos));
    if (!this.zero()) {
      await this.m.call(J.j_rand);
      this.poke(PRTY.dest_y, this.lda(this.cpu.a & O.xy_max_dungeon));
      this.cmp(this.peek(PRTY.player_ypos));
      if (!this.zero()) {
        await this.m.call(J.j_gettile_dungeon);
        if (this.zero()) {
          await this.m.call(J.j_rand);
          this.lda(this.cpu.a & 0x03);
          this.add(this.peek(PRTY.dungeon_level));
          this.cpu.a = this.cpu.asl(this.cpu.asl(this.cpu.a));
          this.cpu.adc(TILES.tile_monster_dungeon);
          this.cmp(TILES.tile_mimic);
          placed = !this.zero();
        }
      }
    }
    if (placed) {
      this.ldx(this.peek(zp_index1));
      this.poke(O.object_tile_type + this.cpu.x, this.cpu.a);
      this.lda(this.peek(PRTY.dest_x));
      this.poke(O.object_xpos + this.cpu.x, this.cpu.a);
      this.poke(O.object_xpos_prev + this.cpu.x, this.cpu.a);
      this.lda(this.peek(PRTY.dest_y));
      this.poke(O.object_ypos + this.cpu.x, this.cpu.a);
      this.poke(O.object_ypos_prev + this.cpu.x, this.cpu.a);
      this.poke(O.object_dng_level + this.cpu.x, this.lda(this.peek(PRTY.dungeon_level)));
      this.lda(this.peek(O.object_tile_type + this.cpu.x));
      await this.sub(0x682D, (): Promise<Exit> => Promise.resolve(this.tileToMonsterNum()));
      this.markMonster();
    }
  }


  /** `ora (ptr1),y` / `sta (ptr1),y`: the monster's number on the map's tile. */
  private markMonster(): void {
    const tile: number = this.pointer(ZP_MAIN.ptr1) + this.cpu.y;

    this.poke(tile, this.lda(this.cpu.a | this.peek(tile)));
  }


  /** ULT4.s mobs_act_dungeon: each monster on the level, but mimics and reapers, a step at random, up to eight tries; then the view. */
  public async mobsActDungeon(): Promise<Exit> {
    this.ldx(O.object_max);
    do {
      if (this.isMobile()) {
        await this.moveMonster();
      }
    } while (this.dex() < 0x80);
    await this.m.call(JUMP_OVERLAY.j_dng_check_update);

    return null;
  }


  private isMobile(): boolean {
    let mobile: boolean = false;

    if (this.lda(this.peek(O.object_tile_type + this.cpu.x)) !== 0) {
      this.lda(this.peek(O.object_dng_level + this.cpu.x));
      this.cmp(this.peek(PRTY.dungeon_level));
      if (this.zero()) {
        this.lda(this.peek(O.object_tile_type + this.cpu.x));
        this.cmp(TILES.tile_mimic);
        if (!this.zero()) {
          this.cmp(TILES.tile_reaper);
          mobile = !this.zero();
        }
      }
    }
    if (mobile) {
      this.poke(zp_attempts, this.lda(MOVE_ATTEMPTS));
      this.lda(this.peek(O.object_xpos + this.cpu.x));
      this.cmp(this.peek(PRTY.player_xpos));
      if (this.zero()) {
        this.lda(this.peek(O.object_ypos + this.cpu.x));
        this.cmp(this.peek(PRTY.player_ypos));
        mobile = !this.zero();
      }
    }

    return mobile;
  }


  /** A step across, along or across again, whichever is legal first, until the tries run out. */
  private async moveMonster(): Promise<void> {
    let moved: boolean = false;
    let tries: boolean = true;

    while (!moved && tries) {
      await this.m.call(J.j_rand);
      await this.m.call(J.j_math_sign);
      this.poke(ZP_MAIN.delta_x, this.cpu.a);
      await this.m.call(J.j_rand);
      await this.m.call(J.j_math_sign);
      this.poke(ZP_MAIN.delta_y, this.cpu.a);
      await this.m.call(J.j_rand);
      if (!this.negative() && (this.lda(this.peek(ZP_MAIN.delta_x)) !== 0)) {
        moved = await this.tryDungeonStep(0x6BCA, 'across');
      }
      if (!moved && (this.lda(this.peek(ZP_MAIN.delta_y)) !== 0)) {
        moved = await this.tryDungeonStep(0x6BE3, 'along');
      }
      if (!moved) {
        moved = await this.tryDungeonStep(0x6BFA, 'across_again');
      }
      if (!moved) {
        tries = this.dec(zp_attempts) < 0x80;
      }
    }
    if (moved) {
      await this.moveInHalls();
    }
  }


  /**
   * The square a step from the monster: across (`clc` / `adc` onto delta_x in A), along (onto
   * delta_y in A), or across again (delta_x onto the monster's column); and whether it may step there.
   */
  private async tryDungeonStep(legalSite: number, step: 'across' | 'along' | 'across_again'): Promise<boolean> {
    if (step === 'along') {
      this.add(this.peek(O.object_ypos + this.cpu.x));
      this.poke(PRTY.dest_y, this.lda(this.cpu.a & O.xy_max_dungeon));
      this.poke(PRTY.dest_x, this.lda(this.peek(O.object_xpos + this.cpu.x)));
    } else {
      if (step === 'across') {
        this.add(this.peek(O.object_xpos + this.cpu.x));
      } else {
        this.setCarry(false);
        this.lda(this.peek(O.object_xpos + this.cpu.x));
        this.cpu.adc(this.peek(ZP_MAIN.delta_x));
      }
      this.poke(PRTY.dest_x, this.lda(this.cpu.a & O.xy_max_dungeon));
      this.poke(PRTY.dest_y, this.lda(this.peek(O.object_ypos + this.cpu.x)));
    }
    await this.m.call(J.j_gettile_dungeon);
    await this.sub(legalSite, (): Promise<Exit> => this.legalMoveDungeon());

    return !this.carry();
  }


  /** The monster's number onto its new square and off its old one, and its place moved. */
  private async moveInHalls(): Promise<void> {
    this.lda(this.peek(O.object_tile_type + this.cpu.x));
    await this.sub(0x6C09, (): Promise<Exit> => Promise.resolve(this.tileToMonsterNum()));
    this.markMonster();
    this.poke(O.object_xpos_prev + this.cpu.x, this.lda(this.peek(O.object_xpos + this.cpu.x)));
    this.poke(O.object_ypos_prev + this.cpu.x, this.lda(this.peek(O.object_ypos + this.cpu.x)));
    this.poke(O.object_xpos + this.cpu.x, this.lda(this.peek(PRTY.dest_x)));
    this.poke(O.object_ypos + this.cpu.x, this.lda(this.peek(PRTY.dest_y)));
    this.poke(PRTY.dest_x, this.lda(this.peek(O.object_xpos_prev + this.cpu.x)));
    this.poke(PRTY.dest_y, this.lda(this.peek(O.object_ypos_prev + this.cpu.x)));
    await this.m.call(J.j_gettile_dungeon);
    this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.lda(this.cpu.a & D.dng_tile_type_mask));
  }


  /** ULT4.s legal_move_dungeon: carry set if monster X may not step onto the tile in A: another monster, a trap, fountain, field, room or wall, or one time in eight back where it was. */
  public async legalMoveDungeon(): Promise<Exit> {
    const tile: number = this.cpu.a;

    if (this.lda(tile & D.dng_tile_foe_mask) !== 0) {
      this.lda(tile);
      this.setCarry(true);
    } else {
      this.lda(tile);
      this.lda(this.cpu.a & D.dng_tile_type_mask);
      if (!this.cmpAny(NO_FOE_TILES)) {
        await this.m.call(J.j_rand);
        if (this.lda(this.cpu.a & CHANCE_8) === 0) {
          this.setCarry(false);
        } else {
          this.lda(this.peek(PRTY.dest_x));
          this.cmp(this.peek(O.object_xpos_prev + this.cpu.x));
          if (!this.zero()) {
            this.setCarry(false);
          } else {
            this.lda(this.peek(PRTY.dest_y));
            this.cmp(this.peek(O.object_ypos_prev + this.cpu.x));
            if (!this.zero()) {
              this.setCarry(false);
            }
          }
        }
      }
    }

    return null;
  }


  /** `cmp` against each of `values` in turn, stopping at the first that is equal: Z (and C) set if one was. */
  private cmpAny(values: readonly number[]): boolean {
    let equal: boolean = false;

    for (const value of values) {
      if (!equal) {
        this.cmp(value);
        equal = this.zero();
      }
    }

    return equal;
  }


  // --- a fight in the halls (ULT4.s:5874-5969) --------------------------------------------------

  /**
   * ULT4.s dng_check_attacked: a monster on the party's square, unless the tile is one no monster
   * stands on, or the trainer lets the party avoid it, is taken off the map and fought in the arena
   * for the tile; the routine then does not return to its caller (`pla` / `pla`), but goes on to load_arena.
   */
  public async dngCheckAttacked(): Promise<Exit> {
    let exit: Exit = null;
    let attacked: boolean = false;

    this.lda(this.peek(ZP_MAIN.tile_under_player) & D.dng_tile_foe_mask);
    if (!this.zero()) {
      this.lda(this.peek(ZP_MAIN.tile_under_player) & D.dng_tile_type_mask);
      attacked = !this.cmpAny(NO_FOE_TILES);
    }
    if (attacked) {
      this.lda(this.peek(ZP_MAIN.tile_under_player) & D.dng_tile_foe_mask);
      this.cpu.a = this.cpu.asl(this.cpu.asl(this.cpu.a));
      this.cpu.adc(TILES.tile_monster_dungeon - 4);
      this.poke(ZP_COMBAT.foe_type_encountered, this.cpu.a);
      this.poke(ZP_MAIN.foe_type_combat, this.cpu.a);
      if (this.lda(this.peek(zp_trainer_avoid)) !== 0) {
        await this.sub(0x6EA7, (): Promise<Exit> => this.attackedBy());
        attacked = !this.zero();
      }
    }
    if (attacked) {
      exit = await this.fightInHalls();
    }

    return exit;
  }


  /** The monster off the map, the foes' places cleared, the caller's return dropped, and on to load_arena with the arena for the tile. */
  private async fightInHalls(): Promise<Exit> {
    let found: boolean = false;

    this.poke(PRTY.dest_x, this.lda(this.peek(PRTY.player_xpos)));
    this.poke(PRTY.dest_y, this.lda(this.peek(PRTY.player_ypos)));
    await this.m.call(J.j_gettile_dungeon);
    this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.lda(this.cpu.a & D.dng_tile_type_mask));
    this.ldx(O.object_max);
    do {
      found = this.atParty();
      if (found) {
        this.lda(0x00);
        this.poke(O.object_dng_level + this.cpu.x, this.cpu.a);
        this.poke(O.object_tile_type + this.cpu.x, this.cpu.a);
        this.poke(O.object_xpos + this.cpu.x, this.cpu.a);
        this.poke(O.object_ypos + this.cpu.x, this.cpu.a);
      }
    } while (!found && (this.dex() < 0x80));
    this.ldx(0x00);
    this.lda(this.cpu.x);
    do {
      this.poke(O.combat_foe_cur_x + this.cpu.x, this.cpu.a);
    } while (this.dex() !== 0);
    this.cpu.pull();
    this.lda(this.cpu.pull());
    this.lda(this.peek(ZP_MAIN.tile_under_player));
    this.ldx(this.div16(this.cpu.a));
    this.lda(this.peek(DT.dungeon_arena + this.cpu.x));

    return C.load_arena;
  }


  private atParty(): boolean {
    let here: boolean = false;

    this.lda(this.peek(O.object_dng_level + this.cpu.x));
    this.cmp(this.peek(PRTY.dungeon_level));
    if (this.zero()) {
      this.lda(this.peek(O.object_xpos + this.cpu.x));
      this.cmp(this.peek(PRTY.player_xpos));
      if (this.zero()) {
        this.lda(this.peek(O.object_ypos + this.cpu.x));
        this.cmp(this.peek(PRTY.player_ypos));
        here = this.zero();
      }
    }

    return here;
  }


  // --- the rooms (ULT4.s:5970-6104, 6996-7069) --------------------------------------------------

  /** ULT4.s do_dungeon_room: the room's sector read from the dungeon's track, its foes and the party's places by the side entered, and the fight begun. */
  public async doDungeonRoom(): Promise<Exit> {
    await this.musicCtl(MUSIC.music_off);
    this.lda(this.peek(PRTY.current_location));
    this.poke(ZP_MAIN.diskio_track, this.subtract(PRTY.loc_dng_first));
    this.cmp(PRTY.dng_abyss);
    if (this.zero()) {
      this.lda(this.peek(PRTY.dungeon_level));
      this.cpu.a = this.cpu.lsr(this.cpu.a);
      this.poke(ZP_MAIN.diskio_track, this.add(this.peek(ZP_MAIN.diskio_track)));
    }
    this.poke(ZP_MAIN.diskio_sector, this.lda(this.peek(ZP_MAIN.tile_under_player) & D.dng_tile_room_mask));
    this.poke(ZP_MAIN.diskio_command, this.lda(DOS.RWTS_command_read));
    this.poke(ZP_MAIN.diskio_addr_hi, this.lda(O.room_load_addr >> 8));
    await this.m.call(J.j_loadsector);
    this.poke(ZP_MAIN.game_mode_pre_combat, this.lda(this.peek(PRTY.game_mode)));
    this.poke(PRTY.game_mode, this.lda(PRTY.mode_combat_dng_room));
    this.lda(0x00);
    this.poke(CV.flee_x, this.cpu.a);
    this.poke(CV.flee_y, this.cpu.a);
    this.ldx(PRTY.principle_none);
    this.lda(this.peek(ZP_MAIN.diskio_sector));
    this.cmp(ALTAR_ROOM);
    if (this.zero()) {
      this.lda(this.peek(ZP_MAIN.diskio_track));
      this.cmp(PRTY.dng_abyss);
      if (!this.carry()) {
        await this.altarRoom();
      }
    }
    this.poke(PRTY.altar_room_principle, this.cpu.x);
    this.lda(0x00);
    this.ldx(this.cpu.a);
    do {
      this.poke(O.combat_foe_cur_x + this.cpu.x, this.cpu.a);
    } while (this.inx() !== 0);
    this.ldx(O.foes_max);
    do {
      this.poke(O.dng_trigger_new_tile + this.cpu.x, this.lda(this.peek(O.room_start_triggers + this.cpu.x)));
    } while (this.dex() < 0x80);
    await this.placeRoomPlayers();
    await this.placeRoomFoes();

    return C.begin_combat;
  }


  /** Which altar room, by the column the party entered on: truth west of 3, love on it, courage east; its principle in X. */
  private async altarRoom(): Promise<void> {
    await this.print(DI.altar_room);
    this.lda(this.peek(PRTY.player_xpos));
    this.cmp(ALTAR_LOVE_X);
    if (this.zero()) {
      await this.print(DI.love);
      this.ldx(PRTY.principle_love);
    } else if (this.carry()) {
      await this.print(DI.courage);
      this.ldx(PRTY.principle_courage);
    } else {
      await this.print(DI.truth);
      this.ldx(PRTY.principle_truth);
    }
  }


  /** Each player at the room's place for its side, the one the party faces from; the dead removed. */
  private async placeRoomPlayers(): Promise<void> {
    this.lda(this.peek(PRTY.dng_direction) ^ 0x02);
    this.poke(zp_number1, this.mul16(this.cpu.a));
    this.poke(ZP_MAIN.curr_player, this.lda(this.peek(PRTY.party_size)));
    do {
      let remove: boolean = true;

      await this.sub(0x6FC2, (): Promise<Exit> => this.getPlayerSprite());
      if (!this.negative()) {
        this.cpu.push(this.cpu.a);
        this.setCarry(false);
        this.lda(this.peek(ZP_MAIN.curr_player));
        this.cpu.adc(this.peek(zp_number1));
        this.ldy(this.cpu.a);
        this.dey();
        this.lda(this.cpu.pull());
        this.ldx(this.peek(ZP_MAIN.curr_player));
        this.dex();
        this.poke(O.combat_player_tile + this.cpu.x, this.cpu.a);
        this.poke(O.combat_player_xpos + this.cpu.x, this.lda(this.peek(O.room_start_player_x + this.cpu.y)));
        this.poke(O.combat_player_ypos + this.cpu.x, this.lda(this.peek(O.room_start_player_y + this.cpu.y)));
        await this.sub(0x6FE2, (): Promise<Exit> => this.isAlive());
        remove = !this.zero();
      }
      if (remove) {
        this.ldx(this.peek(ZP_MAIN.curr_player));
        this.poke(O.combat_player_tile - 1 + this.cpu.x, this.lda(0x00));
      }
    } while (this.dec(ZP_MAIN.curr_player) !== 0);
  }


  /** The room's foes at their places, each with half its kind's power or more in hit points; a mimic looks like a chest. */
  private async placeRoomFoes(): Promise<void> {
    this.ldx(O.foes_max);
    do {
      if (this.lda(this.peek(O.room_start_foe_type + this.cpu.x)) !== 0) {
        this.poke(O.combat_foe_tile_type + this.cpu.x, this.cpu.a);
        this.poke(O.combat_foe_tile_sprite + this.cpu.x, this.cpu.a);
        this.poke(O.combat_foe_cur_x + this.cpu.x, this.lda(this.peek(O.room_start_foe_x + this.cpu.x)));
        this.poke(O.combat_foe_cur_y + this.cpu.x, this.lda(this.peek(O.room_start_foe_y + this.cpu.x)));
        this.lda(this.peek(O.combat_foe_tile_type + this.cpu.x));
        await this.sub(0x700E, (): Promise<Exit> => this.foeIndexFromTile());
        this.ldy(this.cpu.a);
        this.poke(zp_number1, this.lda(this.peek(CT.foe_power_table + this.cpu.y)));
        await this.sub(0x7017, (): Promise<Exit> => this.randModulo());
        this.poke(zp_number1, this.cpu.lsr(this.peek(zp_number1)));
        this.poke(O.combat_foe_hp + this.cpu.x, this.lda(this.cpu.a | this.peek(zp_number1)));
        this.lda(this.peek(O.combat_foe_tile_type + this.cpu.x));
        this.cmp(TILES.tile_mimic);
        if (this.zero()) {
          this.poke(O.combat_foe_tile_sprite + this.cpu.x, this.lda(TILES.tile_chest));
        }
      }
    } while (this.dex() < 0x80);
  }


  /** ULT4.s combat_exit_room: out of the room the way the party fled. */
  public async combatExitRoom(): Promise<Exit> {
    let direction: number;

    await this.print(DI.leave_room);
    this.lda(this.peek(CV.flee_x));
    if (!this.zero()) {
      direction = this.negative() ? D.dng_dir_west : D.dng_dir_east;
    } else {
      this.lda(this.peek(CV.flee_y));
      direction = this.negative() ? D.dng_dir_north : D.dng_dir_south;
    }
    this.lda(direction);

    return this.doExitRoom();
  }


  /** ULT4.s do_exit_room: a step out in direction A; from an altar room, into the dungeon its exit that way leads to. */
  public async doExitRoom(): Promise<Exit> {
    this.poke(PRTY.dng_direction, this.cpu.a);
    this.poke(PRTY.game_mode, this.lda(this.peek(ZP_MAIN.game_mode_pre_combat)));
    if (this.lda(this.peek(PRTY.altar_room_principle)) < 0x80) {
      this.cpu.a = this.cpu.asl(this.cpu.asl(this.cpu.a));
      this.add(this.peek(PRTY.dng_direction));
      this.ldy(this.cpu.a);
      this.poke(PRTY.current_location, this.lda(this.peek(DT.altar_room_exits + this.cpu.y)));
      this.ldy(this.cpu.a);
      this.dey();
      this.poke(PRTY.britannia_x, this.lda(this.peek(COMMAND_TABLES.location_map_x + this.cpu.y)));
      this.poke(PRTY.britannia_y, this.lda(this.peek(COMMAND_TABLES.location_map_y + this.cpu.y)));
      await this.musicCtl(MUSIC.music_off);
      await this.sub(0x7755, (): Promise<Exit> => this.loadDungeonMap());
      await this.print(DI.into_dungeon);
      await this.sub(0x7769, (): Promise<Exit> => this.printLocationName());
    }
    await this.sub(0x776C, (): Promise<Exit> => this.printNewline());
    await this.musicCtl(MUSIC.music_dungeon);
    this.ldx(this.lda(this.peek(PRTY.dng_direction)));
    this.poke(ZP_MAIN.key_buf_len, this.lda(0x00));

    return this.dngMove();
  }


  // --- advance and retreat (ULT4.s:8257-8280) ---------------------------------------------------

  /** ULT4.s dng_can_advance: A 0 if the party may step onto the tile in A: a door, a secret door or a room, or what it may retreat onto; $FF if not. */
  public dngCanAdvance(): Exit {
    this.poke(zp_save_reg1, this.cpu.a);
    this.lda(this.cpu.a & D.dng_tile_type_mask);
    if (this.cmpAny([ D.dng_tile_door, D.dng_tile_secret_door, D.dng_tile_room ])) {
      this.lda(0x00);
    } else {
      this.lda(this.peek(zp_save_reg1));
      this.dngCanRetreat();
    }

    return null;
  }


  /** ULT4.s dng_can_retreat: A 0 if the party may step back onto the tile in A, anything below a door but a lightning field; $FF if not. */
  public dngCanRetreat(): Exit {
    this.cmp(D.dng_tile_field + D.dng_field_lightning);
    if (this.zero()) {
      this.lda(0xFF);
    } else {
      this.cmp(D.dng_tile_door);
      this.lda(this.carry() ? 0xFF : 0x00);
    }

    return null;
  }
}
