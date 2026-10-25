// SUBS.s: the resident library at $0800, ported. Every other program reaches it through the jump
// table (`j_waitkey` ... `j_math_sign`), so until its callers are ported too each routine leaves
// the registers and flags exactly as the original does: the CPU is the register file, and the
// code follows the original's instructions wherever they decide what is left in it. Its
// variables, tables and inline data stay at their addresses in SUBS's image (subs-data.ts).

import { DECIMAL } from '../../lifted-runtime/cpu';
import {
  APPLE, CHAR, DOS, JUMP_OVERLAY, JUMP_SYSTEM, MAP_OBJECTS, MOONS, PRTY, ROST, TABLES, TILES, ZP_LINE_OF_SIGHT, ZP_MAIN, ZP_MAP_SCROLL,
} from '../../state/symbols';
import { PortProgram } from '../port-program';
import { SUBS_INLINE, SUBS_TABLES, SUBS_VARIABLES, WALKABLE_TILES_LAST } from './subs-data';
import type { IInlineData } from '../inline-data';

const V = SUBS_VARIABLES;
const T = SUBS_TABLES;
const XY_LAST_TILE_CACHE: number = MAP_OBJECTS.xy_last_tile_cache;
const XY_CENTER: number = MAP_OBJECTS.xy_center_screen;
const XY_LAST_SCREEN: number = MAP_OBJECTS.xy_last_screen;
const CENTER_INDEX: number = (XY_LAST_SCREEN * XY_CENTER) + XY_CENTER;
/** SUBS.s's own uses of zero page. */
const ZP_COUNT: number = 0xD8;
const ZP_NAME_COUNT: number = 0xDA;
const ZP_NUMBER: number = 0xDA;
const ZP_SFX_FREQ: number = 0xDA;
const ZP_SFX_DURATION: number = 0xF0;
/** One idle tick of `delay`: ldx #$4b / ldy #$00 and the two loops. */
const DELAY_CYCLES: number = 96_303;


export class Subs extends PortProgram {
  // --- movement round Britannia (SUBS.s:196-468) -----------------------------------------

  /** SUBS.s:196 move_east. */
  public async moveEast(): Promise<void> {
    this.inc(PRTY.player_xpos);
    this.inc(PRTY.tile_xpos);
    this.lda(this.peek(PRTY.tile_xpos));
    this.cmp(XY_LAST_TILE_CACHE - 8);
    if (this.carry()) {
      await this.m.call(JUMP_SYSTEM.spin_drive_motor);
    }
    this.cmp(XY_LAST_TILE_CACHE - XY_CENTER);
    if (this.carry()) {
      this.poke(PRTY.tile_xpos, this.lda(this.cpu.a & 0x0F));
      this.mapScroll(MAP_OBJECTS.world_map_NE, MAP_OBJECTS.world_map_NW, MAP_OBJECTS.world_map_SE, MAP_OBJECTS.world_map_SW);
      this.inc(PRTY.map_x);
      this.poke(PRTY.map_x, this.lda(this.peek(PRTY.map_x) & 0x0F));
      await this.loadTiles('east');
    }
  }


  /** SUBS.s:217 move_west. */
  public async moveWest(): Promise<void> {
    this.dec(PRTY.player_xpos);
    this.dec(PRTY.tile_xpos);
    this.lda(this.peek(PRTY.tile_xpos));
    this.cmp(8);
    if (!this.carry()) {
      await this.m.call(JUMP_SYSTEM.spin_drive_motor);
    }
    this.cmp(XY_CENTER);
    if (!this.carry()) {
      this.poke(PRTY.tile_xpos, this.lda(this.cpu.a | 0x10));
      this.mapScroll(MAP_OBJECTS.world_map_NW, MAP_OBJECTS.world_map_NE, MAP_OBJECTS.world_map_SW, MAP_OBJECTS.world_map_SE);
      this.dec(PRTY.map_x);
      this.poke(PRTY.map_x, this.lda(this.peek(PRTY.map_x) & 0x0F));
      await this.loadTiles('west');
    }
  }


  /** SUBS.s:236 move_south. */
  public async moveSouth(): Promise<void> {
    this.inc(PRTY.player_ypos);
    this.inc(PRTY.tile_ypos);
    this.lda(this.peek(PRTY.tile_ypos));
    this.cmp(XY_LAST_TILE_CACHE - 8);
    if (this.carry()) {
      await this.m.call(JUMP_SYSTEM.spin_drive_motor);
    }
    this.cmp(XY_LAST_TILE_CACHE - XY_CENTER);
    if (this.carry()) {
      this.poke(PRTY.tile_ypos, this.lda(this.cpu.a & 0x0F));
      this.mapScroll(MAP_OBJECTS.world_map_SW, MAP_OBJECTS.world_map_NW, MAP_OBJECTS.world_map_SE, MAP_OBJECTS.world_map_NE);
      this.inc(PRTY.map_y);
      this.poke(PRTY.map_y, this.lda(this.peek(PRTY.map_y) & 0x0F));
      await this.loadTiles('south');
    }
  }


  /** SUBS.s:257 move_north. */
  public async moveNorth(): Promise<void> {
    this.dec(PRTY.player_ypos);
    this.dec(PRTY.tile_ypos);
    this.lda(this.peek(PRTY.tile_ypos));
    this.cmp(8);
    if (!this.carry()) {
      await this.m.call(JUMP_SYSTEM.spin_drive_motor);
    }
    this.cmp(XY_CENTER);
    if (!this.carry()) {
      this.poke(PRTY.tile_ypos, this.lda(this.cpu.a | 0x10));
      this.mapScroll(MAP_OBJECTS.world_map_NW, MAP_OBJECTS.world_map_SW, MAP_OBJECTS.world_map_NE, MAP_OBJECTS.world_map_SE);
      this.dec(PRTY.map_y);
      this.poke(PRTY.map_y, this.lda(this.peek(PRTY.map_y) & 0x0F));
      await this.loadTiles('north');
    }
  }


  /** SUBS.s:278-320 map_scroll_*: two pages copied over two others, as one loop of `inx` to zero. */
  private mapScroll(fromA: number, toA: number, fromB: number, toB: number): void {
    for (let index: number = 0; index < 0x100; index++) {
      this.poke(toA + index, this.peek(fromA + index));
      this.poke(toB + index, this.lda(this.peek(fromB + index)));
    }
    this.cpu.x = this.cpu.nz(0);
  }


  /** SUBS.s:322-404 loadtiles_*: the two map chunks that came into view. */
  private async loadTiles(direction: 'east' | 'west' | 'south' | 'north'): Promise<void> {
    const mapX: number = this.peek(PRTY.map_x);
    const mapY: number = this.peek(PRTY.map_y);
    const next: (value: number) => number = (value: number): number => {
      this.lda(value);

      return this.add(1) & 0x0F;
    };

    this.poke(ZP_MAIN.diskio_command, this.lda(DOS.RWTS_command_read));
    if (direction === 'east') {
      this.setCarry(false);
      this.poke(ZP_MAIN.diskio_sector, this.lda(next(mapX)));
      this.poke(ZP_MAIN.diskio_track, this.lda(mapY));
      this.poke(ZP_MAIN.diskio_addr_hi, this.lda(MAP_OBJECTS.world_map_NE >> 8));
      await this.loadsector();
      this.poke(ZP_MAIN.diskio_track, this.lda(next(this.peek(PRTY.map_y))));
      this.poke(ZP_MAIN.diskio_addr_hi, this.lda(MAP_OBJECTS.world_map_SE >> 8));
    } else if (direction === 'west') {
      this.setCarry(false);
      this.poke(ZP_MAIN.diskio_sector, this.lda(mapX));
      this.poke(ZP_MAIN.diskio_track, this.lda(mapY));
      this.poke(ZP_MAIN.diskio_addr_hi, this.lda(MAP_OBJECTS.world_map_NW >> 8));
      await this.loadsector();
      this.poke(ZP_MAIN.diskio_track, this.lda(next(this.peek(PRTY.map_y))));
      this.poke(ZP_MAIN.diskio_addr_hi, this.lda(MAP_OBJECTS.world_map_SW >> 8));
    } else if (direction === 'south') {
      this.poke(ZP_MAIN.diskio_track, this.lda(next(mapY)));
      this.poke(ZP_MAIN.diskio_sector, this.lda(mapX));
      this.poke(ZP_MAIN.diskio_addr_hi, this.lda(MAP_OBJECTS.world_map_SW >> 8));
      await this.loadsector();
      this.poke(ZP_MAIN.diskio_sector, this.lda(next(this.peek(PRTY.map_x))));
      this.poke(ZP_MAIN.diskio_addr_hi, this.lda(MAP_OBJECTS.world_map_SE >> 8));
    } else {
      this.setCarry(false);
      this.poke(ZP_MAIN.diskio_track, this.lda(mapY));
      this.poke(ZP_MAIN.diskio_sector, this.lda(mapX));
      this.poke(ZP_MAIN.diskio_addr_hi, this.lda(MAP_OBJECTS.world_map_NW >> 8));
      await this.loadsector();
      this.poke(ZP_MAIN.diskio_sector, this.lda(next(this.peek(PRTY.map_x))));
      this.poke(ZP_MAIN.diskio_addr_hi, this.lda(MAP_OBJECTS.world_map_NE >> 8));
    }
    await this.loadsector();
  }


  /** SUBS.s:406 player_teleport: the four chunks round wherever the player now is. */
  public async playerTeleport(): Promise<void> {
    this.poke(PRTY.map_x, this.div16(this.lda(this.peek(PRTY.player_xpos))));
    this.poke(PRTY.tile_xpos, this.lda(this.peek(PRTY.player_xpos) & 0x0F));
    this.cmp(8);
    if (!this.carry()) {
      this.poke(PRTY.tile_xpos, this.add(0x10));
      this.dec(PRTY.map_x);
      this.poke(PRTY.map_x, this.lda(this.peek(PRTY.map_x) & 0x0F));
    }
    this.poke(PRTY.map_y, this.div16(this.lda(this.peek(PRTY.player_ypos))));
    this.poke(PRTY.tile_ypos, this.lda(this.peek(PRTY.player_ypos) & 0x0F));
    this.cmp(8);
    if (!this.carry()) {
      this.poke(PRTY.tile_ypos, this.add(0x10));
      this.dec(PRTY.map_y);
      this.poke(PRTY.map_y, this.lda(this.peek(PRTY.map_y) & 0x0F));
    }
    this.poke(ZP_MAIN.diskio_command, this.lda(DOS.RWTS_command_read));
    this.poke(ZP_MAIN.diskio_sector, this.lda(this.peek(PRTY.map_x)));
    this.poke(ZP_MAIN.diskio_track, this.lda(this.peek(PRTY.map_y)));
    this.poke(ZP_MAIN.diskio_addr_hi, this.lda(MAP_OBJECTS.world_map_NW >> 8));
    await this.loadsector();
    this.lda(this.peek(PRTY.map_x));
    this.add(1);
    this.poke(ZP_MAIN.diskio_sector, this.lda(this.cpu.a & 0x0F));
    this.poke(ZP_MAIN.diskio_addr_hi, this.lda(MAP_OBJECTS.world_map_NE >> 8));
    await this.loadsector();
    this.lda(this.peek(PRTY.map_y));
    this.add(1);
    this.poke(ZP_MAIN.diskio_track, this.lda(this.cpu.a & 0x0F));
    this.poke(ZP_MAIN.diskio_addr_hi, this.lda(MAP_OBJECTS.world_map_SE >> 8));
    await this.loadsector();
    this.poke(ZP_MAIN.diskio_sector, this.lda(this.peek(PRTY.map_x)));
    this.poke(ZP_MAIN.diskio_addr_hi, this.lda(MAP_OBJECTS.world_map_SW >> 8));
    await this.loadsector();
  }


  /** SUBS.s:468 loadsector: one sector through RWTS, retried until it reads. */
  public async loadsector(): Promise<void> {
    do {
      this.lda(0x00);
      this.poke(DOS.RWTS_volume, 0x00);
      this.poke(DOS.RWTS_buf_LO, 0x00);
      this.poke(DOS.RWTS_track, this.lda(this.peek(ZP_MAIN.diskio_track)));
      this.poke(DOS.RWTS_sector, this.lda(this.peek(ZP_MAIN.diskio_sector)));
      this.poke(DOS.RWTS_buf_HI, this.lda(this.peek(ZP_MAIN.diskio_addr_hi)));
      this.poke(DOS.RWTS_command, this.lda(this.peek(ZP_MAIN.diskio_command)));
      this.lda(DOS.RWTS_data_epilogue_byte3);
      this.poke(DOS.DOS_data_prologue_3, this.cpu.a);
      this.poke(DOS.RWTS_write_data_epilogue3, this.cpu.a);
      this.poke(DOS.DOS_NIBL + 3, this.lda(0x9B));
      this.lda(DOS.RWTS_params & 0xFF);
      this.ldy(DOS.RWTS_params >> 8);
      await this.m.call(DOS.RWTS_readblock);
      this.lda(0x00);
      this.poke(DOS.RWTS_IOBPL, 0x00);
    } while (this.carry());
  }


  // --- the keyboard and the idle loop (SUBS.s:493-561, 1963-2002) --------------------------

  /**
   * SUBS.s:493 waitkey: a key, or zero after 128 idle ticks. Returns it in A, with flags from `cmp
   * #$00`. A key taken from the type-ahead buffer is a checkpoint, as the 6502 stops between the
   * instructions there: a caller such as getnumber may poll again before calling out.
   */
  public async waitkey(): Promise<void> {
    let key: number | null = null;

    this.poke(V.idletimeout, this.lda(0x80));
    while (key == null) {
      await this.scankey();
      this.drawcursor();
      this.getkey();
      if (this.negative()) {
        key = this.cpu.a;
        await this.m.checkpoint();
      } else {
        await this.idle();
        if (this.dec(V.idletimeout) === 0) {
          key = 0;
        }
      }
    }
    if ((key & 0x80) !== 0) {
      this.clearcursor();
      this.lda(key);
      this.cmp(0x00);
    } else {
      this.clearcursor();
      this.lda(0x00);
    }
  }


  /** SUBS.s:1963 scankey: a waiting key into the type-ahead buffer. */
  public async scankey(): Promise<void> {
    this.lda(await this.m.readKeyboard());
    if (this.negative()) {
      this.cmp(CHAR.char_space);
      if (this.zero()) {
        this.poke(ZP_MAIN.key_buf_len, this.ldy(0x00));
      }
      this.cmp(CHAR.char_DEL);
      if (this.zero()) {
        this.lda(CHAR.char_left_arrow);
      }
      this.ldy(this.peek(ZP_MAIN.key_buf_len));
      this.cpu.compare(this.cpu.y, 0x08);
      if (!this.carry()) {
        this.poke(ZP_MAIN.key_buf + this.cpu.y, this.cpu.a);
        this.inc(ZP_MAIN.key_buf_len);
        this.cpu.bit(await this.m.clearKeyboardStrobe());
      }
    }
  }


  /** SUBS.s:1984 getkey: the oldest buffered key in A, flags from `cmp #$00`; A = 0, Z set, when there is none. */
  public getkey(): void {
    if (this.lda(this.peek(ZP_MAIN.key_buf_len)) !== 0) {
      const key: number = this.lda(this.peek(ZP_MAIN.key_buf));

      if (this.dec(ZP_MAIN.key_buf_len) !== 0) {
        this.ldy(0x00);
        do {
          this.poke(ZP_MAIN.key_buf + this.cpu.y, this.lda(this.peek(ZP_MAIN.key_buf + 1 + this.cpu.y)));
          this.iny();
          this.cpu.compare(this.cpu.y, this.peek(ZP_MAIN.key_buf_len));
        } while (!this.carry());
      }
      this.lda(key);
      this.cmp(0x00);
    }
  }


  /** SUBS.s:518 idle (j_update_view): one tick of whatever the current mode animates. */
  public async idle(): Promise<void> {
    const mode: number = this.lda(this.peek(PRTY.game_mode));

    if (mode === 0) {
      this.delay();
    } else if (this.negative()) {
      this.cmp(PRTY.mode_shrine);
      if (this.zero()) {
        await this.animateView();
      } else {
        await this.idleCombat();
      }
    } else {
      this.cmp(PRTY.mode_world);
      if (this.zero()) {
        this.updateWind();
        await this.updateBalloon();
        await this.updateBritannia();
      } else {
        this.cmp(PRTY.mode_towne);
        if (this.zero()) {
          await this.updateTowne();
        } else {
          this.cmp(PRTY.mode_dungeon);
          if (this.zero()) {
            this.scrollTiles();
            this.animateFields();
            await this.m.call(JUMP_OVERLAY.j_dng_draw_items_monsters);
          }
          this.delay();
        }
      }
    }
  }


  /** SUBS.s:553 delay: about 94 ms of nothing. */
  public delay(): void {
    this.cpu.cycles = this.cpu.cycles + DELAY_CYCLES;
    this.cpu.x = 0x00;
    this.cpu.y = 0x00;
    this.cpu.nz(0x00);
  }


  /** SUBS.s:563 update_balloon: a drifting balloon goes with the wind every fourth tick. */
  private async updateBalloon(): Promise<void> {
    this.lda(this.peek(ZP_MAIN.balloon_movement));
    if (this.negative()) {
      this.dec(V.movement_counter);
      if (this.lda(this.peek(V.movement_counter) & 0x03) === 0) {
        const direction: number = this.ldx(this.peek(ZP_MAIN.wind_direction));

        if (direction === 0) {
          await this.moveEast();
        } else if (this.dex() === 0) {
          await this.moveSouth();
        } else if (this.dex() === 0) {
          await this.moveWest();
        } else {
          await this.moveNorth();
        }
      }
    }
  }


  // --- the views (SUBS.s:599-1190) ----------------------------------------------------------

  /** SUBS.s:599 animate_view: the water, fields and flags move, and the view is drawn again. */
  public async animateView(): Promise<void> {
    this.scrollTiles();
    this.animateFields();
    await this.drawview();
  }


  /** SUBS.s:604 idle_combat (j_update_view_combat): the arena with its foes and party animated. */
  public async idleCombat(): Promise<void> {
    this.scrollTiles();
    this.animateFields();
    for (let index: number = 0x7F; index >= 0; index--) {
      this.poke(MAP_OBJECTS.drawn_tiles + index, this.lda(this.peek(MAP_OBJECTS.world_tiles + index)));
    }
    this.ldx(0xFF);
    for (this.ldx(MAP_OBJECTS.foes_max); !this.negative(); this.dex()) {
      this.animateFoe(this.cpu.x);
    }
    await this.animatePlayers();
  }


  private animateFoe(foe: number): void {
    this.ldy(this.peek(MAP_OBJECTS.combat_foe_cur_y + foe));
    this.lda(this.peek(T.mul_11 + this.cpu.y));
    this.add(this.peek(MAP_OBJECTS.combat_foe_cur_x + foe));
    this.ldy(this.cpu.a);

    const type: number = this.lda(this.peek(MAP_OBJECTS.combat_foe_tile_type + foe));
    let animate: boolean = false;

    if (type !== 0) {
      this.cmp(TILES.tile_ankh);
      if (!this.zero()) {
        this.cmp(TILES.tile_camp_fire);
        if (!this.zero() && (this.lda(this.peek(MAP_OBJECTS.combat_foe_slept + foe)) === 0)) {
          animate = true;
        }
      }
      if (animate) {
        this.lda(this.peek(MAP_OBJECTS.combat_foe_tile_type + foe));
        this.cmp(TILES.tile_monster_land);
        if (!this.carry()) {
          this.rand();
          this.lda(this.cpu.a & 0x01);
          this.settileFoe(foe);
        } else {
          let mimic: boolean = false;

          this.cmp(TILES.tile_mimic);
          if (this.zero()) {
            this.lda(this.peek(MAP_OBJECTS.combat_foe_tile_sprite + foe));
            this.cmp(TILES.tile_chest);
            mimic = this.zero();
          }
          if (mimic) {
            this.poke(MAP_OBJECTS.drawn_tiles + this.cpu.y, this.cpu.a);
          } else {
            this.rand();
            if (this.lda(this.cpu.a & 0x01) === 0) {
              this.poke(MAP_OBJECTS.drawn_tiles + this.cpu.y, this.lda(this.peek(MAP_OBJECTS.combat_foe_tile_sprite + foe)));
            } else {
              this.inc(MAP_OBJECTS.combat_foe_tile_sprite + foe);
              this.lda(this.peek(MAP_OBJECTS.combat_foe_tile_sprite + foe) & 0x03);
              this.settileFoe(foe);
            }
          }
        }
      } else {
        this.poke(MAP_OBJECTS.drawn_tiles + this.cpu.y, this.lda(this.peek(MAP_OBJECTS.combat_foe_tile_sprite + foe)));
      }
    }
  }


  private settileFoe(foe: number): void {
    this.add(this.peek(MAP_OBJECTS.combat_foe_tile_type + foe));
    this.poke(MAP_OBJECTS.combat_foe_tile_sprite + foe, this.cpu.a);
    this.poke(MAP_OBJECTS.drawn_tiles + this.cpu.y, this.cpu.a);
  }


  /** SUBS.s:664 animateplayers, then the attack sprite, then the view. */
  private async animatePlayers(): Promise<void> {
    this.ldx(this.peek(PRTY.party_size));
    do {
      const slot: number = this.cpu.x - 1;

      if (this.lda(this.peek(MAP_OBJECTS.combat_player_tile + slot)) !== 0) {
        this.ldy(this.peek(MAP_OBJECTS.combat_player_ypos + slot));
        this.lda(this.peek(T.mul_11 + this.cpu.y));
        this.add(this.peek(MAP_OBJECTS.combat_player_xpos + slot));
        this.ldy(this.cpu.a);
        this.lda(this.peek(MAP_OBJECTS.combat_player_tile + slot));
        this.cmp(TILES.tile_human_prone);
        if (!this.zero()) {
          let cursor: boolean = false;

          this.cpu.compare(this.cpu.x, this.peek(ZP_MAP_SCROLL.curr_y));
          if (this.zero()) {
            this.dec(V.movement_counter);
            cursor = this.lda(this.peek(V.movement_counter) & 0x03) === 0;
          }
          if (cursor) {
            this.lda(TILES.tile_cursor);
          } else {
            this.rand();
            this.lda(this.cpu.a & 0x01);
            this.add(this.peek(MAP_OBJECTS.combat_player_tile + slot));
          }
        }
        this.poke(MAP_OBJECTS.drawn_tiles + this.cpu.y, this.cpu.a);
      }
    } while (this.dex() !== 0);
    if (this.lda(this.peek(MAP_OBJECTS.attack_sprite)) !== 0) {
      this.ldx(this.peek(MAP_OBJECTS.target_y));
      this.lda(this.peek(T.mul_11 + this.cpu.x));
      this.add(this.peek(MAP_OBJECTS.target_x));
      this.ldy(this.cpu.a);
      this.poke(MAP_OBJECTS.drawn_tiles + this.cpu.y, this.lda(this.peek(MAP_OBJECTS.attack_sprite)));
    }
    await this.drawview();
  }


  /** SUBS.s:708 update_towne: the 11 x 11 tiles round the player, grass outside the 32 x 32 towne. */
  private async updateTowne(): Promise<void> {
    this.animateTiles();
    this.lda(this.peek(PRTY.player_xpos));
    this.poke(ZP_MAP_SCROLL.first_x, this.subtract(XY_CENTER));
    this.lda(this.peek(PRTY.player_ypos));
    this.poke(ZP_MAP_SCROLL.first_y, this.subtract(XY_CENTER));
    this.lda(0x00);
    this.poke(ZP_MAP_SCROLL.count_x, 0x00);
    this.poke(ZP_MAP_SCROLL.count_y, 0x00);
    this.cpu.y = this.cpu.nz(0x00);
    this.cpu.x = this.cpu.nz(0x00);
    do {
      do {
        let outside: boolean = true;

        this.lda(this.peek(ZP_MAP_SCROLL.first_x));
        this.poke(ZP_MAP_SCROLL.curr_x, this.add(this.peek(ZP_MAP_SCROLL.count_x)));
        this.cmp(MAP_OBJECTS.xy_last_towne);
        if (!this.carry()) {
          this.lda(this.peek(ZP_MAP_SCROLL.first_y));
          this.poke(ZP_MAP_SCROLL.curr_y, this.add(this.peek(ZP_MAP_SCROLL.count_y)));
          this.cmp(MAP_OBJECTS.xy_last_towne);
          if (!this.carry()) {
            outside = false;
            this.poke(ZP_MAIN.ptr2 + 1, this.cpu.a);
            this.lda(0x00);
            for (let shift: number = 0; shift < 3; shift++) {
              this.poke(ZP_MAIN.ptr2 + 1, this.cpu.lsr(this.peek(ZP_MAIN.ptr2 + 1)));
              this.cpu.a = this.cpu.ror(this.cpu.a);
            }
            this.cpu.adc(this.peek(ZP_MAP_SCROLL.curr_x));
            this.poke(ZP_MAIN.ptr2, this.cpu.a);
            this.lda(this.peek(ZP_MAIN.ptr2 + 1));
            this.poke(ZP_MAIN.ptr2 + 1, this.add(MAP_OBJECTS.world_map_NW >> 8));
            this.lda(this.peek(this.pointer(ZP_MAIN.ptr2) + this.cpu.y));
          }
        }
        if (outside) {
          this.lda(TILES.tile_grass);
        }
        this.poke(MAP_OBJECTS.world_tiles + this.cpu.x, this.cpu.a);
        this.inx();
        this.inc(ZP_MAP_SCROLL.count_x);
        this.lda(this.peek(ZP_MAP_SCROLL.count_x));
        this.cmp(XY_LAST_SCREEN);
      } while (!this.zero());
      this.poke(ZP_MAP_SCROLL.count_x, this.cpu.y);
      this.inc(ZP_MAP_SCROLL.count_y);
      this.lda(this.peek(ZP_MAP_SCROLL.count_y));
      this.cmp(XY_LAST_SCREEN);
    } while (!this.zero());
    await this.updateMonsters();
  }


  /** SUBS.s:769 update_britannia: the moons move, and the 11 x 11 tiles round the player come from the four chunks. */
  public async updateBritannia(): Promise<void> {
    this.animateTiles();
    this.updateMoons();
    this.lda(this.peek(PRTY.tile_xpos));
    this.poke(ZP_MAP_SCROLL.first_x, this.subtract(XY_CENTER));
    this.lda(this.peek(PRTY.tile_ypos));
    this.poke(ZP_MAP_SCROLL.first_y, this.subtract(XY_CENTER));
    this.lda(0x00);
    this.poke(ZP_MAP_SCROLL.count_x, 0x00);
    this.poke(ZP_MAP_SCROLL.count_y, 0x00);
    this.cpu.y = this.cpu.nz(0x00);
    this.cpu.x = this.cpu.nz(0x00);
    do {
      do {
        this.lda(this.peek(ZP_MAP_SCROLL.first_x));
        this.poke(ZP_MAP_SCROLL.curr_x, this.add(this.peek(ZP_MAP_SCROLL.count_x)));
        this.lda(this.peek(ZP_MAP_SCROLL.first_y));
        this.poke(ZP_MAP_SCROLL.curr_y, this.add(this.peek(ZP_MAP_SCROLL.count_y)));
        this.poke(ZP_MAIN.ptr2, this.mul16(this.cpu.a));
        this.lda(this.peek(ZP_MAP_SCROLL.curr_x) & 0x0F);
        this.poke(ZP_MAIN.ptr2, this.lda(this.cpu.a | this.peek(ZP_MAIN.ptr2)));
        this.lda(this.peek(ZP_MAP_SCROLL.curr_y) & 0x10);
        this.cpu.a = this.cpu.asl(this.cpu.a);
        this.lda(this.cpu.a | this.peek(ZP_MAP_SCROLL.curr_x));
        this.div16(this.cpu.a);
        this.poke(ZP_MAIN.ptr2 + 1, this.add(MAP_OBJECTS.world_map_NW >> 8));
        this.poke(MAP_OBJECTS.world_tiles + this.cpu.x, this.lda(this.peek(this.pointer(ZP_MAIN.ptr2) + this.cpu.y)));
        this.inx();
        this.inc(ZP_MAP_SCROLL.count_x);
        this.lda(this.peek(ZP_MAP_SCROLL.count_x));
        this.cmp(XY_LAST_SCREEN);
      } while (!this.zero());
      this.poke(ZP_MAP_SCROLL.count_x, this.cpu.y);
      this.inc(ZP_MAP_SCROLL.count_y);
      this.lda(this.peek(ZP_MAP_SCROLL.count_y));
      this.cmp(XY_LAST_SCREEN);
    } while (!this.zero());
    await this.updateMonsters();
  }


  /** Where an object at (x, y) falls in the view, or null outside it; leaves X and Y as the original does. */
  private viewIndex(x: number, y: number): number | null {
    let index: number | null = null;

    this.lda(x);
    this.add(XY_CENTER);
    this.subtract(this.peek(PRTY.player_xpos));
    this.cmp(XY_LAST_SCREEN);
    if (!this.carry()) {
      this.poke(ZP_MAP_SCROLL.curr_x, this.cpu.a);
      this.lda(y);
      this.add(XY_CENTER);
      this.subtract(this.peek(PRTY.player_ypos));
      this.cmp(XY_LAST_SCREEN);
      if (!this.carry()) {
        this.poke(ZP_MAP_SCROLL.curr_y, this.cpu.a);
        this.ldy(this.peek(ZP_MAP_SCROLL.curr_y));
        this.lda(this.peek(T.mul_11 + this.cpu.y));
        this.add(this.peek(ZP_MAP_SCROLL.curr_x));
        index = this.ldy(this.cpu.a);
      }
    }

    return index;
  }


  /** SUBS.s:820 update_monsters: the objects and the moongate over the tiles, then the view drawn as seen. */
  private async updateMonsters(): Promise<void> {
    for (this.ldx(MAP_OBJECTS.object_max); !this.negative(); this.dex()) {
      const x: number = this.cpu.x;

      if (this.lda(this.peek(MAP_OBJECTS.object_tile_sprite + x)) !== 0) {
        const index: number | null = this.viewIndex(this.peek(MAP_OBJECTS.object_xpos + x), this.peek(MAP_OBJECTS.object_ypos + x));

        if (index != null) {
          this.poke(MAP_OBJECTS.world_tiles + index, this.lda(this.peek(MAP_OBJECTS.object_tile_sprite + x)));
        }
      }
    }
    if (this.lda(this.peek(MOONS.moongate_tile)) !== 0) {
      const index: number | null = this.viewIndex(this.peek(MOONS.moongate_xpos), this.peek(MOONS.moongate_ypos));

      if (index != null) {
        this.poke(MAP_OBJECTS.world_tiles + index, this.lda(this.peek(MOONS.moongate_tile)));
      }
    }
    this.poke(ZP_MAIN.tile_north, this.lda(this.peek(MAP_OBJECTS.world_tiles + CENTER_INDEX - XY_LAST_SCREEN)));
    this.poke(ZP_MAIN.tile_south, this.lda(this.peek(MAP_OBJECTS.world_tiles + CENTER_INDEX + XY_LAST_SCREEN)));
    this.poke(ZP_MAIN.tile_east, this.lda(this.peek(MAP_OBJECTS.world_tiles + CENTER_INDEX + 1)));
    this.poke(ZP_MAIN.tile_west, this.lda(this.peek(MAP_OBJECTS.world_tiles + CENTER_INDEX - 1)));
    this.poke(ZP_MAIN.tile_under_player, this.lda(this.peek(MAP_OBJECTS.world_tiles + CENTER_INDEX)));
    this.poke(MAP_OBJECTS.world_tiles + CENTER_INDEX, this.lda(this.peek(PRTY.player_transport)));
    if (this.lda(this.peek(PRTY.terrain_occlusion)) === 0) {
      await this.lineOfSight();
    } else {
      for (this.ldx((XY_LAST_SCREEN * XY_LAST_SCREEN) - 1); !this.negative(); this.dex()) {
        this.poke(MAP_OBJECTS.drawn_tiles + this.cpu.x, this.lda(this.peek(MAP_OBJECTS.world_tiles + this.cpu.x)));
      }
      await this.drawview();
    }
  }


  private blocksSight(tile: number): boolean {
    let blocked: boolean = false;

    this.lda(tile);
    for (const blocker of [ TILES.tile_forest, TILES.tile_mountain, TILES.tile_secret_panel, TILES.tile_blank, TILES.tile_wall ]) {
      if (!blocked) {
        this.cmp(blocker);
        blocked = this.zero();
      }
    }

    return blocked;
  }


  /** SUBS.s:900 line_of_sight: a tile shows if a straight walk from it to the player meets nothing opaque. */
  private async lineOfSight(): Promise<void> {
    const LOS = ZP_LINE_OF_SIGHT;
    const last: number = XY_LAST_SCREEN - 1;

    this.lda(TILES.tile_blank);
    for (this.ldx((XY_LAST_SCREEN * XY_LAST_SCREEN) - 1); !this.negative(); this.dex()) {
      this.poke(MAP_OBJECTS.drawn_tiles + this.cpu.x, this.cpu.a);
    }
    this.poke(LOS.los_candidate_idx, this.lda((XY_LAST_SCREEN * XY_LAST_SCREEN) - 1));
    this.lda(last);
    this.poke(LOS.los_candidate_x, last);
    this.poke(LOS.los_candidate_y, last);
    do {
      do {
        let visible: boolean = false;
        let resolved: boolean = false;

        this.poke(LOS.los_probe_x, this.lda(this.peek(LOS.los_candidate_x)));
        this.poke(LOS.los_probe_y, this.lda(this.peek(LOS.los_candidate_y)));
        this.poke(LOS.los_probe_idx, this.lda(this.peek(LOS.los_candidate_idx)));
        while (!resolved) {
          this.ldx(this.peek(LOS.los_probe_x));
          this.ldy(this.peek(LOS.los_probe_y));
          this.lda(this.peek(LOS.los_probe_idx));
          this.add(this.peek(T.toward_center_1 + this.cpu.x));
          this.add(this.peek(T.toward_center_row + this.cpu.y));
          this.cmp(CENTER_INDEX);
          if (this.zero()) {
            visible = true;
            resolved = true;
          } else {
            this.poke(LOS.los_probe_idx, this.cpu.a);
            this.ldx(this.cpu.a);
            if (this.blocksSight(this.peek(MAP_OBJECTS.world_tiles + this.cpu.x))) {
              resolved = true;
            } else {
              this.ldx(this.lda(this.peek(LOS.los_probe_x)));
              this.poke(LOS.los_probe_x, this.add(this.peek(T.toward_center_1 + this.cpu.x)));
              this.ldx(this.lda(this.peek(LOS.los_probe_y)));
              this.poke(LOS.los_probe_y, this.add(this.peek(T.toward_center_1 + this.cpu.x)));
            }
          }
        }
        if (visible) {
          this.ldx(this.peek(LOS.los_candidate_idx));
          this.poke(MAP_OBJECTS.drawn_tiles + this.cpu.x, this.lda(this.peek(MAP_OBJECTS.world_tiles + this.cpu.x)));
        }
        this.dec(LOS.los_candidate_idx);
        this.dec(LOS.los_candidate_x);
      } while (!this.negative());
      this.poke(LOS.los_candidate_x, this.lda(last));
      this.dec(LOS.los_candidate_y);
    } while (!this.negative());
    await this.lineOfSightPass2();
  }


  /** SUBS.s:967 los_pass2: tiles still blank get a second look, stepping one axis at a time. */
  private async lineOfSightPass2(): Promise<void> {
    const LOS = ZP_LINE_OF_SIGHT;
    const last: number = XY_LAST_SCREEN - 1;
    let finished: boolean = false;

    this.poke(LOS.los_candidate_idx, this.lda((XY_LAST_SCREEN * XY_LAST_SCREEN) - 1));
    this.lda(last);
    this.poke(LOS.los_candidate_x, last);
    this.poke(LOS.los_candidate_y, last);
    while (!finished) {
      let visible: boolean = false;

      this.poke(LOS.los_probe_x, this.lda(this.peek(LOS.los_candidate_x)));
      this.poke(LOS.los_probe_y, this.lda(this.peek(LOS.los_candidate_y)));
      this.poke(LOS.los_probe_idx, this.lda(this.peek(LOS.los_candidate_idx)));
      this.ldx(this.cpu.a);
      this.lda(this.peek(MAP_OBJECTS.drawn_tiles + this.cpu.x));
      this.cmp(TILES.tile_blank);
      if (this.zero()) {
        let resolved: boolean = false;

        while (!resolved) {
          this.ldx(this.peek(LOS.los_probe_x));
          this.ldy(this.peek(LOS.los_probe_y));
          this.lda(this.peek(T.distance + this.cpu.x));
          this.cmp(this.peek(T.distance + this.cpu.y));
          if (this.zero()) {
            this.lda(this.peek(LOS.los_probe_idx));
            this.add(this.peek(T.toward_center_1 + this.cpu.x));
            this.add(this.peek(T.toward_center_row + this.cpu.y));
            this.nextHorizontal();
            this.nextVertical();
          } else if (!this.carry()) {
            this.lda(this.peek(LOS.los_probe_idx));
            this.add(this.peek(T.toward_center_row + this.cpu.y));
            this.nextVertical();
          } else {
            this.lda(this.peek(LOS.los_probe_idx));
            this.add(this.peek(T.toward_center_1 + this.cpu.x));
            this.nextHorizontal();
          }
          this.cmp(CENTER_INDEX);
          if (this.zero()) {
            visible = true;
            resolved = true;
          } else {
            this.poke(LOS.los_probe_idx, this.cpu.a);
            this.ldx(this.cpu.a);
            resolved = this.blocksSight(this.peek(MAP_OBJECTS.world_tiles + this.cpu.x));
          }
        }
      }
      if (visible) {
        this.ldx(this.peek(LOS.los_candidate_idx));
        this.poke(MAP_OBJECTS.drawn_tiles + this.cpu.x, this.lda(this.peek(MAP_OBJECTS.world_tiles + this.cpu.x)));
      }
      this.dec(LOS.los_candidate_idx);
      if (this.dec(LOS.los_candidate_x) >= 0x80) {
        this.poke(LOS.los_candidate_x, this.lda(last));
        this.dec(LOS.los_candidate_y);
        finished = this.negative();
      }
    }
    await this.drawview();
  }


  /** SUBS.s:1107 nexthoriz: the probe one column nearer the player; A kept. */
  private nextHorizontal(): void {
    const a: number = this.cpu.a;

    this.ldx(this.lda(this.peek(ZP_LINE_OF_SIGHT.los_probe_x)));
    this.poke(ZP_LINE_OF_SIGHT.los_probe_x, this.add(this.peek(SUBS_TABLES.toward_center_1 + this.cpu.x)));
    this.lda(a);
  }


  /** SUBS.s:1117 nextvert: the probe one row nearer the player; A kept. */
  private nextVertical(): void {
    const a: number = this.cpu.a;

    this.ldx(this.lda(this.peek(ZP_LINE_OF_SIGHT.los_probe_y)));
    this.poke(ZP_LINE_OF_SIGHT.los_probe_y, this.add(this.peek(SUBS_TABLES.toward_center_1 + this.cpu.x)));
    this.lda(a);
  }


  /**
   * SUBS.s:1046 drawview: the 11 x 11 drawn tiles onto the screen, 14 x 16 pixels each, from both
   * halves of the tile sheet in the language card. The keyboard is scanned once a scan line.
   */
  public async drawview(): Promise<void> {
    this.lda(0x00);
    this.poke(ZP_MAIN.current_draw_line, 0x00);
    this.poke(V.src_tile, 0x00);
    for (;;) {
      this.ldy(this.peek(ZP_MAIN.current_draw_line));
      this.lda(this.peek(TABLES.bmplineaddr_lo + 8 + this.cpu.y));
      this.poke(V.dst1_lo, this.cpu.a);
      this.poke(V.dst2_lo, this.cpu.a);
      this.lda(this.peek(TABLES.bmplineaddr_hi + 8 + this.cpu.y));
      this.poke(V.dst1_hi, this.cpu.a);
      this.poke(V.dst2_hi, this.cpu.a);
      this.lda(this.cpu.y & 0x0F);
      this.lda(this.cpu.a | (TABLES.tilemap >> 8));
      this.poke(V.src1_hi, this.cpu.a);
      this.poke(V.src2_hi, this.cpu.a);
      this.ldx(0x01);
      do {
        this.ldy(this.peek(MAP_OBJECTS.drawn_tiles + this.peek(V.src_tile)));
        this.cpu.bit(this.m.read(APPLE.hw_LCBANK1));
        this.lda(this.peek((this.peek(V.src1_hi) << 8) + this.cpu.y));
        this.poke(this.patchedWord(V.dst1_lo) + this.cpu.x, this.cpu.a);
        this.inx();
        this.cpu.bit(this.m.read(APPLE.hw_LCBANK2));
        this.lda(this.peek((this.peek(V.src2_hi) << 8) + this.cpu.y));
        this.poke(this.patchedWord(V.dst2_lo) + this.cpu.x, this.cpu.a);
        this.inc(V.src_tile);
        this.inx();
        this.cpu.compare(this.cpu.x, (XY_LAST_SCREEN * 2) + 1);
      } while (!this.carry());
      this.inc(ZP_MAIN.current_draw_line);
      this.lda(this.peek(ZP_MAIN.current_draw_line));
      this.cmp(0xB0);
      if (this.zero()) {
        break;
      }
      if (this.lda(this.cpu.a & 0x0F) !== 0) {
        this.lda(this.peek(V.src_tile));
        this.poke(V.src_tile, this.subtract(XY_LAST_SCREEN));
        await this.scankey();
      }
    }
  }


  /** SUBS.s:1127 animate_tiles: monsters, people and the party's objects flip between their frames. */
  public animateTiles(): void {
    for (this.ldx(0x00); ; ) {
      const x: number = this.cpu.x;
      const type: number = this.lda(this.peek(MAP_OBJECTS.object_tile_type + x));
      let frames: 0 | 2 | 4 = 0;

      if (type === 0) {
        this.poke(MAP_OBJECTS.object_tile_sprite + x, this.lda(0x00));
      } else if (this.negative()) {
        this.cmp(TILES.tile_monster_land);
        if (this.carry()) {
          frames = 4;
        } else {
          this.cmp(TILES.tile_monster_water);
          frames = this.zero() ? 0 : 2;
        }
      } else {
        this.cmp(TILES.tile_npc_first);
        if (this.carry()) {
          this.cmp(TILES.tile_npc_last);
          frames = this.carry() ? 0 : 2;
        } else {
          this.cmp(TILES.tile_class_first);
          if (this.carry()) {
            this.cmp(TILES.tile_class_last);
            frames = this.carry() ? 0 : 2;
          }
        }
        if (frames === 0) {
          this.poke(MAP_OBJECTS.object_tile_sprite + x, this.lda(this.peek(MAP_OBJECTS.object_tile_type + x)));
        }
      }
      if (frames !== 0) {
        this.fastrand();
        this.cmp(0xC0);
        if (!this.carry()) {
          this.lda(this.peek(MAP_OBJECTS.object_tile_sprite + x));
          if (frames === 2) {
            this.lda(this.cpu.a ^ 0x01);
            this.lda(this.cpu.a & 0x01);
          } else {
            this.add(0x01);
            this.lda(this.cpu.a & 0x03);
          }
          this.poke(MAP_OBJECTS.object_tile_sprite + x, this.lda(this.cpu.a | this.peek(MAP_OBJECTS.object_tile_type + x)));
        }
      }
      this.inx();
      this.cpu.compare(this.cpu.x, MAP_OBJECTS.object_last);
      if (this.carry()) {
        break;
      }
    }
    this.scrollTiles();
    this.animateFields();
    this.animateFlags();
  }


  // --- printing (SUBS.s:1192-1367) ----------------------------------------------------------

  /** SUBS.s:1192 primm_xy: primm at (X, Y). */
  public primmXy(): void {
    this.poke(ZP_MAIN.console_xpos, this.cpu.x);
    this.poke(ZP_MAIN.console_ypos, this.cpu.y);
    this.primm();
  }


  /** SUBS.s:1195 primm: prints the zero-terminated string after the JSR, and returns past it. */
  public primm(): void {
    const address: number = this.cpu.pullWord();

    this.printFrom(address + 1);
    this.cpu.pushWord(this.patchedWord(V.primmaddr));
    this.m.rts();
  }


  /** The body of primm, for a string at `address`: SUBS's own, or one passed on its behalf. */
  private printFrom(address: number): void {
    this.poke(V.primmaddr, (address - 1) & 0xFF);
    this.poke(V.primmaddr + 1, ((address - 1) >> 8) & 0xFF);
    for (;;) {
      this.inc(V.primmaddr);
      if (this.zero()) {
        this.inc(V.primmaddr + 1);
      }
      if (this.lda(this.peek(this.patchedWord(V.primmaddr))) === 0) {
        break;
      }
      this.consoleOut();
    }
    this.lda(this.peek(V.primmaddr + 1));
    this.lda(this.peek(V.primmaddr));
  }


  private printInline(block: IInlineData): void {
    this.printFrom(block.address);
  }


  /** SUBS.s:1218 console_out: the character in A at the cursor, wrapping at column 40. */
  public consoleOut(): void {
    this.cmp(CHAR.char_newline);
    if (this.zero()) {
      this.consoleNewline();
    } else {
      const glyph: number = this.lda(this.cpu.a & 0x7F);

      this.ldx(this.peek(ZP_MAIN.console_xpos));
      this.cpu.compare(this.cpu.x, 0x28);
      if (this.carry()) {
        this.consoleNewline();
        this.lda(glyph);
      }
      this.drawchar();
      this.inc(ZP_MAIN.console_xpos);
    }
  }


  /** SUBS.s:1233 console_newline: the message pane's next line, scrolling at the bottom. */
  public consoleNewline(): void {
    this.poke(ZP_MAIN.console_xpos, this.lda(0x18));
    this.inc(ZP_MAIN.console_ypos);
    this.lda(this.peek(ZP_MAIN.console_ypos));
    this.cmp(0x18);
    if (this.carry()) {
      this.dec(ZP_MAIN.console_ypos);
      this.consoleScroll();
    }
  }


  /**
   * SUBS.s:1245 primm_cout: the string after the JSR through the character output hook, which DOS
   * has, so a Ctrl-D line is a DOS command. Keeps where to resume if DOS fails, and clears the
   * type-ahead.
   */
  public async primmCout(): Promise<void> {
    const address: number = this.cpu.pullWord();

    await this.coutFrom(address);
    this.cpu.pushWord(this.pointer(ZP_MAIN.ptr1));
    this.m.rts();
  }


  /** The body of primm_cout, for the string after `returnAddress`. */
  private async coutFrom(returnAddress: number): Promise<void> {
    this.lda(returnAddress & 0xFF);
    this.poke(JUMP_SYSTEM.err_resume_addr, this.cpu.a);
    this.poke(ZP_MAIN.ptr1, this.cpu.a);
    this.lda(returnAddress >> 8);
    this.poke(JUMP_SYSTEM.err_resume_addr + 1, this.cpu.a);
    this.poke(ZP_MAIN.ptr1 + 1, this.cpu.a);
    this.poke(JUMP_SYSTEM.err_resume_stack, this.ldx(this.cpu.sp));
    this.ldy(0x00);
    for (;;) {
      if (this.inc(ZP_MAIN.ptr1) === 0) {
        this.inc(ZP_MAIN.ptr1 + 1);
      }
      if (this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y)) === 0) {
        break;
      }
      this.lda(this.cpu.a | 0x80);
      await this.m.call(this.pointer(APPLE.zp_CSWL));
    }
    this.poke(ZP_MAIN.key_buf_len, this.cpu.a);
    this.lda(this.peek(ZP_MAIN.ptr1 + 1));
    this.lda(this.peek(ZP_MAIN.ptr1));
  }


  /** SUBS.s:1277 get_stats_ptr: ptr1 to the current player's roster record. */
  public getStatsPtr(): void {
    this.lda(this.peek(ZP_MAIN.curr_player));
    this.subtract(0x01);
    for (let shift: number = 0; shift < 5; shift++) {
      this.cpu.a = this.cpu.asl(this.cpu.a);
    }
    this.poke(ZP_MAIN.ptr1, this.cpu.a);
    this.poke(ZP_MAIN.ptr1 + 1, this.lda(ROST.player_stats >> 8));
  }


  /** SUBS.s:1287 centername: printname, centred in 15 columns. */
  public centername(): void {
    this.getStatsPtr();
    this.poke(ZP_NAME_COUNT, this.lda(0x00));
    for (;;) {
      this.ldy(this.peek(ZP_NAME_COUNT));
      if (this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y)) === 0) {
        break;
      }
      this.inc(ZP_NAME_COUNT);
      this.lda(this.peek(ZP_NAME_COUNT));
      this.cmp(0x0F);
      if (this.carry()) {
        break;
      }
    }
    this.lda(0x0F);
    this.subtract(this.peek(ZP_NAME_COUNT));
    this.cpu.a = this.cpu.lsr(this.cpu.a);
    this.add(this.peek(ZP_MAIN.console_xpos));
    this.poke(ZP_MAIN.console_xpos, this.cpu.a);
    this.printname();
  }


  /** SUBS.s:1307 printname: the current player's name, up to 15 characters. */
  public printname(length: number = 0x0F): void {
    this.getStatsPtr();
    this.poke(ZP_NAME_COUNT, this.lda(0x00));
    for (;;) {
      this.ldy(this.peek(ZP_NAME_COUNT));
      if (this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y)) === 0) {
        break;
      }
      this.consoleOut();
      this.inc(ZP_NAME_COUNT);
      this.lda(this.peek(ZP_NAME_COUNT));
      this.cmp(length);
      if (this.carry()) {
        break;
      }
    }
  }


  /** SUBS.s:1339 drawcursor_xy: drawcursor at (X, Y). */
  public drawcursorXy(): void {
    this.poke(ZP_MAIN.console_xpos, this.cpu.x);
    this.poke(ZP_MAIN.console_ypos, this.cpu.y);
    this.drawcursor();
  }


  /** SUBS.s:1342 drawcursor: the next frame of the turning cursor, without moving on. */
  public drawcursor(): void {
    this.dec(V.cursor_ctr);
    this.lda(this.peek(V.cursor_ctr) & 0x7F);
    this.lda(this.cpu.a | 0x7C);
    this.consoleOut();
    this.dec(ZP_MAIN.console_xpos);
  }


  /** SUBS.s:1348 clearcursor. */
  public clearcursor(): void {
    this.lda(0x20);
    this.consoleOut();
    this.dec(ZP_MAIN.console_xpos);
  }


  /** SUBS.s:1358 printbcd: A as two BCD digits. */
  public printbcd(): void {
    this.poke(ZP_NUMBER, this.cpu.a);
    this.div16(this.cpu.a);
    this.printdigit();
    this.lda(this.peek(ZP_NUMBER) & 0x0F);
    this.printdigit();
  }


  /** SUBS.s:1364 printdigit: A, 0-9, as a digit. */
  public printdigit(): void {
    this.add(0x30);
    this.consoleOut();
  }


  // --- the status pane (SUBS.s:1369-1623) ---------------------------------------------------

  /** SUBS.s:1369 clearstatwindow: the four party lines and their rule. */
  public clearstatwindow(): void {
    this.drawLine(false, SUBS_INLINE.clearstatwindow);
    for (this.ldx(0x08); ; ) {
      this.poke(ZP_MAIN.ptr1, this.lda(this.peek(TABLES.bmplineaddr_lo + this.cpu.x)));
      this.poke(ZP_MAIN.ptr1 + 1, this.lda(this.peek(TABLES.bmplineaddr_hi + this.cpu.x)));
      this.ldy(0x18);
      this.lda(0x80);
      do {
        this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.cpu.a);
        this.iny();
        this.cpu.compare(this.cpu.y, 0x27);
      } while (!this.carry());
      this.inx();
      this.cpu.compare(this.cpu.x, 0x48);
      if (this.carry()) {
        break;
      }
    }
  }


  /** SUBS.s:1392 update_status: the virtue ankhs in the font, each player's line, food, and gold or the hull. */
  public async updateStatus(): Promise<void> {
    this.poke(ZP_MAIN.ptr1 + 1, this.lda(TABLES.font_data >> 8));
    this.poke(ZP_MAIN.ptr1, this.lda(TABLES.font_data & 0xFF));
    this.ldx(0x00);
    do {
      if (this.lda(this.peek(ROST.party_stats + this.cpu.x)) === 0) {
        this.ldy(CHAR.glyph_ankh);
        this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y));
      } else {
        this.lda(0x00);
      }
      this.ldy(CHAR.glyph_virtues);
      this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.cpu.a);
      this.lda(this.peek(ZP_MAIN.ptr1));
      this.poke(ZP_MAIN.ptr1, this.add(0x80));
      if (this.carry()) {
        this.inc(ZP_MAIN.ptr1 + 1);
      }
      this.inx();
      this.cpu.compare(this.cpu.x, 0x08);
    } while (!this.zero());
    this.statsSavePos();

    const currentPlayer: number = this.lda(this.peek(ZP_MAIN.curr_player));

    this.poke(ZP_MAIN.curr_player, this.lda(this.peek(PRTY.party_size)));
    do {
      this.ldx(this.peek(ZP_MAIN.curr_player));
      this.getStatsPtr();
      this.poke(ZP_MAIN.console_ypos, this.lda(this.peek(ZP_MAIN.curr_player)));
      this.poke(ZP_MAIN.console_xpos, this.lda(0x18));
      this.lda(this.peek(ZP_MAIN.curr_player));
      this.printdigit();
      this.lda(0xAD);
      this.consoleOut();
      this.printname(0x08);
      this.poke(ZP_MAIN.console_xpos, this.lda(0x23));
      this.getStatsPtr();
      this.ldy(ROST.player_cur_hp_hi);
      this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y));
      this.printdigit();
      this.ldy(ROST.player_cur_hp_lo);
      this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y));
      this.printbcd();
      this.ldy(ROST.player_status);
      this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y));
      this.consoleOut();
      await this.scankey();
    } while (this.dec(ZP_MAIN.curr_player) !== 0);
    this.ldx(0x18);
    this.ldy(0x0A);
    this.poke(ZP_MAIN.console_xpos, this.cpu.x);
    this.poke(ZP_MAIN.console_ypos, this.cpu.y);
    this.printInline(SUBS_INLINE.food);
    this.ldy(ROST.party_stat_food_hi);
    this.lda(this.peek(ROST.party_stats + this.cpu.y));
    this.printbcd();
    this.ldy(ROST.party_stat_food_lo);
    this.lda(this.peek(ROST.party_stats + this.cpu.y));
    this.printbcd();
    this.lda(CHAR.char_space);
    this.consoleOut();
    this.lda(this.peek(ZP_MAIN.magic_aura));
    this.consoleOut();
    this.lda(this.peek(PRTY.player_transport));
    this.cmp(TILES.tile_ship_last);
    if (this.carry()) {
      this.printInline(SUBS_INLINE.gold);
      this.ldy(ROST.party_stat_gold_hi);
      this.lda(this.peek(ROST.party_stats + this.cpu.y));
      this.printbcd();
      this.ldy(ROST.party_stat_gold_lo);
      this.lda(this.peek(ROST.party_stats + this.cpu.y));
      this.printbcd();
    } else {
      this.printInline(SUBS_INLINE.ship);
      this.lda(this.peek(PRTY.ship_hull));
      this.printbcd();
    }
    this.poke(ZP_MAIN.curr_player, this.lda(currentPlayer));
    this.statsRestorePos();
  }


  /** SUBS.s:1493 update_wind: now and then the wind turns, and the wind line is drawn again. */
  public updateWind(): void {
    this.rand();
    if (this.zero()) {
      this.rand();
      this.getsign();
      this.add(this.peek(ZP_MAIN.wind_direction));
      this.poke(ZP_MAIN.wind_direction, this.lda(this.cpu.a & 0x03));
    }
    this.statsSavePos();
    this.poke(ZP_MAIN.console_ypos, this.lda(0x17));
    this.poke(ZP_MAIN.console_xpos, this.lda(0x06));
    this.printInline(SUBS_INLINE.wind);

    const direction: number = this.ldx(this.peek(ZP_MAIN.wind_direction));

    if (direction === 0) {
      this.printInline(SUBS_INLINE.west);
    } else if (this.dex() === 0) {
      this.printInline(SUBS_INLINE.north);
    } else if (this.dex() === 0) {
      this.printInline(SUBS_INLINE.east);
    } else if (this.dex() === 0) {
      this.printInline(SUBS_INLINE.south);
    }
    this.lda(CHAR.glyph_less_odd);
    this.consoleOut();
    this.statsRestorePos();
  }


  /** SUBS.s:1538 print_direction: the dungeon's heading and level. */
  public printDirection(): void {
    this.statsSavePos();
    this.poke(ZP_MAIN.console_ypos, this.lda(0x17));
    this.poke(ZP_MAIN.console_xpos, this.lda(0x07));
    this.printInline(SUBS_INLINE.direction);

    const direction: number = this.ldx(this.peek(PRTY.dng_direction));

    if (direction === 0) {
      this.printInline(SUBS_INLINE.north);
    } else if (this.dex() === 0) {
      this.printInline(SUBS_INLINE.east);
    } else if (this.dex() === 0) {
      this.printInline(SUBS_INLINE.south);
    } else {
      this.printInline(SUBS_INLINE.west);
    }
    this.poke(ZP_MAIN.console_ypos, this.lda(0x00));
    this.poke(ZP_MAIN.console_xpos, this.lda(0x0B));
    this.lda(CHAR.char_L);
    this.consoleOut();
    this.lda(this.peek(PRTY.dungeon_level));
    this.add(0x01);
    this.printdigit();
    this.statsRestorePos();
  }


  /** SUBS.s:1600 getsign (j_math_sign): A as -1, 0 or 1. */
  public getsign(): void {
    this.cmp(0x00);
    if (!this.zero()) {
      this.lda(this.negative() ? 0xFF : 0x01);
    }
  }


  private statsSavePos(): void {
    this.poke(V.stats_saved_xpos, this.lda(this.peek(ZP_MAIN.console_xpos)));
    this.poke(V.stats_saved_ypos, this.lda(this.peek(ZP_MAIN.console_ypos)));
  }


  private statsRestorePos(): void {
    this.poke(ZP_MAIN.console_xpos, this.lda(this.peek(V.stats_saved_xpos)));
    this.poke(ZP_MAIN.console_ypos, this.lda(this.peek(V.stats_saved_ypos)));
  }


  // --- number input (SUBS.s:1625-1688) ------------------------------------------------------

  /**
   * SUBS.s:1627 getnumber: one or two digits, with the left arrow to go back. Leaves the number
   * in BCD in bcdnum and in binary in hexnum.
   */
  public async getnumber(): Promise<void> {
    let done: boolean = false;

    while (!done) {
      await this.waitkey();
      this.subtract(CHAR.char_num_first);
      this.cmp(0x0A);
      if (!this.carry()) {
        this.poke(ZP_MAIN.bcdnum, this.cpu.a);
        this.poke(ZP_MAIN.hexnum, this.cpu.a);
        this.printdigit();
        done = await this.secondDigit();
      }
    }
  }


  /** The rest of getnumber after its first digit; false to start again, after a left arrow. */
  private async secondDigit(): Promise<boolean> {
    let state: 'second' | 'third' | 'restart' | 'convert' | 'done' = 'second';

    while ((state === 'second') || (state === 'third')) {
      await this.waitkey();
      if (state === 'second') {
        this.cmp(CHAR.char_enter);
        if (this.zero()) {
          state = 'done';
        } else {
          this.cmp(CHAR.char_left_arrow);
          if (this.zero()) {
            this.dec(ZP_MAIN.console_xpos);
            state = 'restart';
          } else {
            this.subtract(CHAR.char_num_first);
            this.cmp(0x0A);
            if (!this.carry()) {
              this.poke(ZP_MAIN.hexnum, this.cpu.a);
              this.printdigit();
              state = 'third';
            }
          }
        }
      } else {
        this.cmp(CHAR.char_enter);
        if (this.zero()) {
          state = 'convert';
        } else {
          this.cmp(CHAR.char_left_arrow);
          if (this.zero()) {
            state = (this.dec(ZP_MAIN.console_xpos) < 0x80) ? 'second' : 'convert';
          }
        }
      }
    }
    if (state === 'convert') {
      this.lda(this.peek(ZP_MAIN.bcdnum));
      this.mul16(this.cpu.a);
      this.poke(ZP_MAIN.bcdnum, this.lda(this.cpu.a | this.peek(ZP_MAIN.hexnum)));
      this.ldx(0x00);
      this.cpu.setFlag(DECIMAL, true);
      this.setCarry(true);
      for (;;) {
        this.cpu.sbc(0x01);
        if (!this.carry() || (this.inx() === 0)) {
          break;
        }
      }
      this.poke(ZP_MAIN.hexnum, this.cpu.x);
      this.cpu.setFlag(DECIMAL, false);
    }

    return state !== 'restart';
  }


  /** SUBS.s:1675 getplayernum: a party member's number, 1-8, or 0. */
  public async getplayernum(): Promise<void> {
    await this.waitkey();
    this.subtract(CHAR.char_num_first);
    this.cmp(0x09);
    if (this.carry()) {
      this.lda(0x00);
    }
    this.poke(ZP_MAIN.curr_player, this.cpu.a);
    this.printdigit();
    this.consoleNewline();
    this.lda(this.peek(ZP_MAIN.curr_player));
  }


  /** SUBS.s:1693 blocked_tile: N set if the tile in A cannot be walked on; X its place in walkable_tiles. */
  public blockedTile(): void {
    this.ldx(WALKABLE_TILES_LAST);
    for (;;) {
      if (this.dex() >= 0x80) {
        break;
      }
      this.cmp(this.peek(T.walkable_tiles + this.cpu.x));
      if (this.zero()) {
        break;
      }
    }
  }


  // --- the screen (SUBS.s:1715-1766, 2050-2212) ---------------------------------------------

  /** SUBS.s:1715 clearbitmap: hi-res page 1 cleared to black. */
  public clearbitmap(): void {
    this.poke(ZP_MAIN.ptr1 + 1, this.lda(APPLE.screen_HGR1 >> 8));
    this.poke(ZP_MAIN.ptr1, this.ldy(APPLE.screen_HGR1 & 0xFF));
    this.lda(0x80);
    do {
      do {
        this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.cpu.a);
      } while (this.iny() !== 0);
      this.inc(ZP_MAIN.ptr1 + 1);
      this.ldx(this.peek(ZP_MAIN.ptr1 + 1));
      this.cpu.compare(this.cpu.x, 0x40);
    } while (!this.carry());
  }


  /** SUBS.s:1731 clearview and SUBS.s:1749 invertview: the map view cleared, or inverted. */
  public clearOrInvertView(invert: boolean): void {
    for (this.ldx(0x08); ; ) {
      this.poke(ZP_MAIN.ptr1, this.lda(this.peek(TABLES.bmplineaddr_lo + this.cpu.x)));
      this.poke(ZP_MAIN.ptr1 + 1, this.lda(this.peek(TABLES.bmplineaddr_hi + this.cpu.x)));
      this.ldy(0x16);
      if (!invert) {
        this.lda(0x00);
      }
      do {
        if (invert) {
          this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y) ^ 0xFF);
        }
        this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.cpu.a);
      } while (this.dey() !== 0);
      this.inx();
      this.cpu.compare(this.cpu.x, 0xB8);
      if (this.carry()) {
        break;
      }
    }
  }


  /** SUBS.s:1768 mulax: A times X, in A. */
  public mulax(): void {
    this.poke(ZP_NUMBER, this.cpu.a);
    this.lda(0x00);
    this.cpu.compare(this.cpu.x, 0x00);
    if (!this.zero()) {
      do {
        this.add(this.peek(ZP_NUMBER));
      } while (this.dex() !== 0);
    }
  }


  /** SUBS.s:2050 console_scroll: the message pane up a line, the bottom line cleared. */
  private consoleScroll(): void {
    for (this.ldx(0x60); ; ) {
      this.ldy(0x18);
      this.poke(V.scrolldst, this.lda(this.peek(TABLES.bmplineaddr_lo + this.cpu.x)));
      this.poke(V.scrolldst + 1, this.lda(this.peek(TABLES.bmplineaddr_hi + this.cpu.x)));
      this.poke(V.scrollsrc, this.lda(this.peek(TABLES.bmplineaddr_lo + 8 + this.cpu.x)));
      this.poke(V.scrollsrc + 1, this.lda(this.peek(TABLES.bmplineaddr_hi + 8 + this.cpu.x)));
      do {
        this.lda(this.peek(this.patchedWord(V.scrollsrc) + this.cpu.y));
        this.poke(this.patchedWord(V.scrolldst) + this.cpu.y, this.cpu.a);
        this.iny();
        this.cpu.compare(this.cpu.y, 0x28);
      } while (!this.carry());
      this.inx();
      this.cpu.compare(this.cpu.x, 0xB8);
      if (this.carry()) {
        break;
      }
    }
    this.drawLine(false, SUBS_INLINE.scroll);
  }


  /** SUBS.s:2079 drawchar: glyph A at the console position, a row of the font at a time. */
  private drawchar(): void {
    this.poke(ZP_MAIN.char_glyph, this.cpu.a);
    this.lda(this.peek(ZP_MAIN.console_ypos));
    for (let shift: number = 0; shift < 3; shift++) {
      this.cpu.a = this.cpu.asl(this.cpu.a);
    }
    this.poke(ZP_MAIN.char_bitmap_row, this.cpu.a);
    this.poke(V.charsrc + 1, this.lda(TABLES.font_data >> 8));
    this.poke(ZP_MAIN.char_rows_left, this.lda(0x08));
    this.ldy(this.peek(ZP_MAIN.console_xpos));
    do {
      this.ldx(this.peek(ZP_MAIN.char_bitmap_row));
      this.poke(V.chardst, this.lda(this.peek(TABLES.bmplineaddr_lo + this.cpu.x)));
      this.poke(V.chardst + 1, this.lda(this.peek(TABLES.bmplineaddr_hi + this.cpu.x)));
      this.ldx(this.peek(ZP_MAIN.char_glyph));
      this.lda(this.peek(this.patchedWord(V.charsrc) + this.cpu.x));
      this.poke(this.patchedWord(V.chardst) + this.cpu.y, this.cpu.a);
      this.lda(this.peek(V.charsrc));
      this.poke(V.charsrc, this.add(0x80));
      if (this.carry()) {
        this.inc(V.charsrc + 1);
      }
      this.inc(ZP_MAIN.char_bitmap_row);
    } while (this.dec(ZP_MAIN.char_rows_left) !== 0);
    this.ldy(0x00);
  }


  /** SUBS.s:2114 drawvert and SUBS.s:2119 drawhoriz, from the JSR's inline data. */
  public drawFromStack(vertical: boolean): void {
    const address: number = this.cpu.pullWord();

    this.drawLineAt(vertical, address + 1);
    this.cpu.pushWord(this.pointer(ZP_MAIN.ptr2));
    this.m.rts();
  }


  private drawLine(vertical: boolean, block: IInlineData): void {
    this.drawLineAt(vertical, block.address);
  }


  /**
   * The body of drawhoriz and drawvert: x and y, then glyphs until one with bit 7 set, drawn along
   * the row or down the column. The cursor is left where it was.
   */
  private drawLineAt(vertical: boolean, address: number): void {
    const next: () => void = (): void => {
      if (this.inc(ZP_MAIN.ptr2) === 0) {
        this.inc(ZP_MAIN.ptr2 + 1);
      }
    };

    this.poke(V.draw_hvflag, this.lda(vertical ? 0x80 : 0x00));
    this.poke(V.draw_savex, this.lda(this.peek(ZP_MAIN.console_xpos)));
    this.poke(V.draw_savey, this.lda(this.peek(ZP_MAIN.console_ypos)));
    this.lda((address - 1) & 0xFF);
    this.poke(ZP_MAIN.ptr2, this.cpu.a);
    this.lda((address - 1) >> 8);
    this.poke(ZP_MAIN.ptr2 + 1, this.cpu.a);
    next();
    this.ldy(0x00);
    this.poke(ZP_MAIN.console_xpos, this.lda(this.peek(this.pointer(ZP_MAIN.ptr2) + this.cpu.y)));
    next();
    this.poke(ZP_MAIN.console_ypos, this.lda(this.peek(this.pointer(ZP_MAIN.ptr2) + this.cpu.y)));
    for (;;) {
      next();
      this.lda(this.peek(this.pointer(ZP_MAIN.ptr2) + this.cpu.y));
      if (this.negative()) {
        break;
      }
      this.drawchar();
      this.cpu.bit(this.peek(V.draw_hvflag));
      this.inc(this.negative() ? ZP_MAIN.console_ypos : ZP_MAIN.console_xpos);
    }
    this.lda(this.peek(ZP_MAIN.ptr2 + 1));
    this.lda(this.peek(ZP_MAIN.ptr2));
    this.poke(ZP_MAIN.console_xpos, this.lda(this.peek(V.draw_savex)));
    this.poke(ZP_MAIN.console_ypos, this.lda(this.peek(V.draw_savey)));
  }


  /** SUBS.s:2177 drawinterface: the frame round the map, status and message panes. */
  public drawinterface(): void {
    this.clearbitmap();
    this.drawLine(false, SUBS_INLINE.frame_top);
    this.drawLine(true, SUBS_INLINE.frame_left);
    this.drawLine(false, SUBS_INLINE.frame_bottom);
    this.drawLine(true, SUBS_INLINE.frame_middle);
    this.drawLine(true, SUBS_INLINE.frame_right);
    this.drawLine(false, SUBS_INLINE.frame_rule_9);
    this.drawLine(false, SUBS_INLINE.frame_rule_11);
  }


  // --- tile animation (SUBS.s:1800-1943) ----------------------------------------------------

  /** SUBS.s:1800 scroll_tiles: the water and lava tiles roll down a line, in both halves of the sheet. */
  private scrollTiles(): void {
    for (const tile of [ TILES.tile_water_deep, TILES.tile_water_coast, TILES.tile_water_shallow, TILES.tile_lava ]) {
      this.lda(tile);
      this.ldy(tile);
      this.cpu.bit(this.m.read(APPLE.hw_LCBANK2));
      this.scrollHalf();
      this.cpu.bit(this.m.read(APPLE.hw_LCBANK1));
      this.scrollHalf();
    }
  }


  private scrollHalf(): void {
    const y: number = this.cpu.y;
    const saved: number = this.lda(this.peek(TABLES.tilemap + 0xF00 + y));

    for (let line: number = 0xE; line >= 0; line--) {
      this.poke(TABLES.tilemap + ((line + 1) << 8) + y, this.lda(this.peek(TABLES.tilemap + (line << 8) + y)));
    }
    this.poke(TABLES.tilemap + y, this.lda(saved));
  }


  /**
   * SUBS.s:1852 animate_fields: random bits for the force fields, the altar and the camp fire, line
   * by line. The second half of each line goes to whichever bank the first left switched in.
   */
  private animateFields(): void {
    const writeLine: (mask: number, firstBank: number | null, secondBank: number) => void = (mask: number, firstBank: number | null, secondBank: number): void => {
      this.fastrand();
      this.lda(this.cpu.a & mask);
      if (firstBank != null) {
        this.cpu.bit(this.m.read(firstBank));
      }
      this.ldy(TILES.tile_field_poison);
      this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.cpu.a);
      this.lda(this.cpu.a | 0x80);
      this.ldy(TILES.tile_field_fire);
      this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.cpu.a);

      const fire: number = this.cpu.a;

      this.ldy(TILES.tile_altar);
      this.lda(this.cpu.a & this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y));
      this.ldy(TILES.tile_camp_fire);
      this.lda(this.cpu.a ^ this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y));
      this.lda(this.cpu.a | 0x80);
      this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.cpu.a);
      this.lda(fire);
      this.cpu.bit(this.m.read(secondBank));
      this.ldy(TILES.tile_field_lightning);
      this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.cpu.a);
      this.lda(this.cpu.a & 0x7F);
      this.ldy(TILES.tile_field_sleep);
      this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.cpu.a);
    };

    this.ldx(TABLES.tilemap >> 8);
    this.poke(ZP_MAIN.ptr1, this.lda(TABLES.tilemap & 0xFF));
    do {
      this.poke(ZP_MAIN.ptr1 + 1, this.cpu.x);
      writeLine(0x55, APPLE.hw_LCBANK1, APPLE.hw_LCBANK2);
      writeLine(0x2A, null, APPLE.hw_LCBANK1);
      this.inx();
      this.cpu.compare(this.cpu.x, 0xE0);
    } while (!this.carry());
  }


  /** SUBS.s:1913 animate_flags: the flags on townes, castles and ships wave at random. */
  private animateFlags(): void {
    const swap: (line1: number, line2: number, tile: number) => void = (line1: number, line2: number, tile: number): void => {
      const first: number = this.ldx(this.peek(TABLES.tilemap + (0x100 * line1) + tile));
      const second: number = this.ldy(this.peek(TABLES.tilemap + (0x100 * line2) + tile));

      this.poke(TABLES.tilemap + (0x100 * line1) + tile, second);
      this.poke(TABLES.tilemap + (0x100 * line2) + tile, first);
    };

    this.fastrand();
    if (!this.negative()) {
      this.cpu.bit(this.m.read(APPLE.hw_LCBANK1));
      swap(3, 4, TILES.tile_towne);
    }
    this.fastrand();
    if (!this.negative()) {
      this.cpu.bit(this.m.read(APPLE.hw_LCBANK2));
      swap(1, 2, TILES.tile_castle);
    }
    for (const ship of [ TILES.tile_ship_east, TILES.tile_ship_west ]) {
      this.fastrand();
      if (!this.negative()) {
        this.cpu.bit(this.m.read(APPLE.hw_LCBANK1));
        swap(2, 3, ship);
        this.cpu.bit(this.m.read(APPLE.hw_LCBANK2));
        swap(2, 3, ship);
      }
    }
    this.fastrand();
    if (!this.negative()) {
      this.cpu.bit(this.m.read(APPLE.hw_LCBANK1));
      swap(1, 2, TILES.tile_castle_center);
    }
  }


  // --- random numbers (SUBS.s:2004-2048) ----------------------------------------------------

  /** SUBS.s:2004 rand: the sixteen-byte generator stepped once; rnd0 in A, X kept. */
  public rand(): void {
    const x: number = this.cpu.x;

    this.setCarry(false);
    this.lda(this.peek(V.rndf));
    for (let index: number = 0x0E; index >= 0; index--) {
      this.cpu.adc(this.peek(V.rnd0 + index));
      this.poke(V.rnd0 + index, this.cpu.a);
    }
    for (let index: number = 0x0F; index >= 0; index--) {
      if (this.inc(V.rnd0 + index) !== 0) {
        break;
      }
    }
    this.cpu.x = this.cpu.nz(x);
    this.lda(this.peek(V.rnd0));
  }


  /** SUBS.s:2039 fastrand: a quicker generator over rnd0-rnd3, which takes in the carry it is called with. */
  private fastrand(): void {
    this.lda(this.peek(V.rnd3));
    this.cpu.adc(this.peek(V.rnd2));
    this.poke(V.rnd2, this.cpu.a);
    this.lda(this.cpu.a ^ this.peek(V.rnd1));
    this.poke(V.rnd1, this.cpu.a);
    this.cpu.adc(this.peek(V.rnd0));
    this.poke(V.rnd0, this.cpu.a);
    this.poke(V.rnd3, this.cpu.a);
  }


  // --- the moons (SUBS.s:2214-2333) ---------------------------------------------------------

  /** SUBS.s:2223 update_moons: the phases move on every fourth tick, and the moongate opens and closes. */
  private updateMoons(): void {
    this.lda(this.peek(V.moon_counter));
    this.poke(V.moon_counter, this.add(0x40));
    if (this.zero()) {
      this.inc(V.moon_ctr_trammel);
      this.inc(V.moon_ctr_trammel);
      this.drawMoon(this.peek(V.moon_ctr_trammel), MOONS.trammel_col);
      this.lda(this.peek(V.moon_ctr_felucca));
      this.poke(V.moon_ctr_felucca, this.add(0x06));
      this.drawMoon(this.cpu.a, MOONS.felucca_col);
    }
    this.lda(this.peek(V.moon_ctr_trammel));
    this.poke(PRTY.moon_phase_trammel, this.div32(this.cpu.a));
    this.lda(this.peek(V.moon_ctr_felucca));
    this.poke(PRTY.moon_phase_felucca, this.div32(this.cpu.a));
    this.lda(this.peek(V.moon_ctr_trammel) & 0x1F);
    if (this.zero()) {
      this.moongateUpdate();
      this.lda(this.peek(MOONS.moongate_sprite));
      this.poke(MOONS.moongate_tile, this.add(TILES.tile_moongate));
    } else {
      this.cmp(0x1E);
      if (this.zero()) {
        this.moongateUpdate();
        this.lda(this.peek(MOONS.moongate_sprite) ^ 0x03);
        this.poke(MOONS.moongate_tile, this.add(TILES.tile_moongate));
      }
    }
  }


  private drawMoon(counter: number, column: number): void {
    this.lda(counter & 0xE0);
    this.cpu.a = this.cpu.lsr(this.cpu.a);
    this.cpu.a = this.cpu.lsr(this.cpu.a);
    this.ldy(this.cpu.a);
    for (let line: number = 0; line < 8; line++) {
      this.poke(APPLE.screen_HGR1 + (0x400 * line) + column, this.lda(this.peek(T.moon_gfx + line + this.cpu.y)));
    }
  }


  private div32(value: number): number {
    return this.div16(this.cpu.lsr(value));
  }


  /** SUBS.s:2307 moongate_update: where the moongate is for Trammel's phase, and its frame. */
  private moongateUpdate(): void {
    this.lda(this.peek(V.moon_ctr_trammel) & 0xE0);
    this.ldx(this.div32(this.cpu.a));
    this.poke(MOONS.moongate_xpos, this.lda(this.peek(T.moongate_xtab + this.cpu.x)));
    this.poke(MOONS.moongate_ypos, this.lda(this.peek(T.moongate_ytab + this.cpu.x)));
    this.lda(this.peek(V.moon_counter) & 0xC0);
    for (let rotate: number = 0; rotate < 3; rotate++) {
      this.cpu.a = this.cpu.rol(this.cpu.a);
    }
    this.poke(MOONS.moongate_sprite, this.cpu.a);
  }


  // --- disks (SUBS.s:2335-2418) -------------------------------------------------------------

  /** SUBS.s:2335 request_disk: the disk in A, asking for it until the drive holds it. */
  public async requestDisk(): Promise<void> {
    let ready: boolean = false;

    this.poke(ZP_MAIN.reqdisk, this.cpu.a);
    while (!ready) {
      let twoDrives: boolean = false;

      this.lda(this.peek(ZP_MAIN.reqdisk));
      this.cmp(0x02);
      if (!this.zero()) {
        this.cmp(0x04);
      }
      if (this.zero()) {
        this.lda(this.peek(ZP_MAIN.numdrives));
        this.cmp(0x02);
        twoDrives = this.carry();
      }
      if (twoDrives) {
        this.poke(ZP_MAIN.currdrive, this.lda(0x02));
        this.lda(this.peek(ZP_MAIN.reqdisk));
        this.cmp(this.peek(ZP_MAIN.currdisk_drive2));
      } else {
        this.poke(ZP_MAIN.currdrive, this.lda(0x01));
        this.lda(this.peek(ZP_MAIN.reqdisk));
        this.cmp(this.peek(ZP_MAIN.currdisk_drive1));
      }
      if (!this.zero()) {
        this.printInline(SUBS_INLINE.please_place);
        this.askdisk();
        this.printInline(SUBS_INLINE.disk_into);
        this.lda(this.peek(ZP_MAIN.currdrive));
        this.printdigit();
        this.printInline(SUBS_INLINE.press_esc);
        do {
          await this.waitkey();
          this.cmp(CHAR.char_ESC);
        } while (!this.zero());
      }
      this.lda(this.peek(ZP_MAIN.currdrive));
      this.poke(V.file_char_drive, this.add(CHAR.char_num_first));
      await this.coutFrom(SUBS_INLINE.bload_disk.address - 1);
      this.ldx(this.peek(ZP_MAIN.currdrive));
      this.poke(ZP_MAIN.numdrives + this.cpu.x, this.lda(this.peek(ZP_MAIN.disk_id)));
      this.cmp(this.peek(ZP_MAIN.reqdisk));
      ready = this.zero();
    }
  }


  private askdisk(): void {
    this.ldx(this.peek(ZP_MAIN.reqdisk));
    this.dex();
    if (this.dex() === 0) {
      this.printInline(SUBS_INLINE.britannia);
    } else if (this.dex() === 0) {
      this.printInline(SUBS_INLINE.towne);
    } else {
      this.printInline(SUBS_INLINE.underworld);
    }
  }


  // --- sound (SUBS.s:2420-2674) -------------------------------------------------------------

  private speaker(): void {
    this.cpu.bit(this.m.read(APPLE.hw_SPEAKER));
  }


  /** `dex` / `bne` until X is zero, as the delay loops do; X = 0 runs 256 times. */
  private spinX(): void {
    do {
      this.cpu.cycles = this.cpu.cycles + 5;
    } while (this.dex() !== 0);
  }


  /** SUBS.s:2420 playsfx: sound A, through sfxtab, when sound is on. */
  public async playsfx(): Promise<void> {
    this.cpu.a = this.cpu.asl(this.cpu.a);
    this.ldy(this.cpu.a);
    if (this.lda(this.peek(ZP_MAIN.sfx_volume)) !== 0) {
      const high: number = this.lda(this.peek(T.sfxtab + 1 + this.cpu.y));
      const low: number = this.lda(this.peek(T.sfxtab + this.cpu.y));
      const entry: number = (((high << 8) | low) + 1) & 0xFFFF;
      const index: number = SFX_ENTRY_LIST.indexOf(entry);

      if (index < 0) {
        await this.m.call(entry);
      } else {
        this.playSound(index);
      }
    }
  }


  private playSound(index: number): void {
    const sounds: readonly (() => void)[] = [
      (): void => this.sfxRandomClicks(0x06, 0x3F, 0x20),
      (): void => this.sfxError2(),
      (): void => this.sfxError1(),
      (): void => this.sfxShipFire(),
      (): void => this.sfxSweep(0xFF, -1),
      (): void => this.sfxSweep(0x80, 1),
      (): void => this.sfxRandomClicks(0xFF, 0x7F, 0x00),
      (): void => this.sfxRandomClicks(0xFF, 0xFF, 0x80),
      (): void => this.sfxFlee(),
      (): void => this.sfxMagic2(),
      (): void => this.sfxMagic1(),
      (): void => this.sfxRamp(0x40, 1, 0xC0),
      (): void => this.sfxRamp(0xC0, -1, 0x40),
    ];

    sounds[index]();
  }


  /** sfx_walk, sfx_player_hits, sfx_monster_hits: Y clicks, each after a random delay. */
  private sfxRandomClicks(count: number, mask: number, bits: number): void {
    this.ldy(count);
    do {
      this.rand();
      if (mask !== 0xFF) {
        this.lda(this.cpu.a & mask);
      }
      if (bits !== 0) {
        this.lda(this.cpu.a | bits);
      }
      this.ldx(this.cpu.a);
      this.spinX();
      this.speaker();
    } while (this.dey() !== 0);
  }


  /** sfx_error2: fifty clicks, the first after X loops. */
  private sfxError2(): void {
    this.ldy(0x32);
    do {
      this.cpu.nz(this.cpu.a);
      this.spinX();
      this.speaker();
    } while (this.dey() !== 0);
  }


  private sfxError1(): void {
    this.ldy(0x32);
    do {
      this.spinX();
      this.speaker();
    } while (this.dey() !== 0);
    this.sfxError2();
  }


  private sfxShipFire(): void {
    this.poke(ZP_SFX_FREQ, this.ldx(0x00));
    do {
      do {
        this.cpu.cycles = this.cpu.cycles + 5;
      } while (this.inx() !== 0);
      this.speaker();
      this.dec(ZP_SFX_FREQ);
    } while (this.ldx(this.peek(ZP_SFX_FREQ)) !== 0);
  }


  /** sfx_attack and sfx_unknown: Y steps from `start` until bit 7 flips, a click per step. */
  private sfxSweep(start: number, step: number): void {
    this.lda(start);
    this.ldx(start);
    this.ldy(start);
    do {
      this.spinX();
      this.speaker();
      this.ldy(this.cpu.y + step);
      this.lda(this.cpu.y);
      this.ldx(this.cpu.a);
    } while (this.negative());
  }


  private sfxFlee(): void {
    this.poke(ZP_SFX_FREQ, this.ldx(0x7F));
    do {
      this.spinX();
      this.speaker();
      this.dec(ZP_SFX_FREQ);
    } while (this.ldx(this.peek(ZP_SFX_FREQ)) !== 0);
  }


  private sfxMagic1(): void {
    this.poke(ZP_SFX_DURATION, this.cpu.x);
    do {
      this.rand();
      this.ldx(0x28);
      do {
        this.ldy(this.cpu.a);
        do {
          this.cpu.cycles = this.cpu.cycles + 5;
        } while (this.dey() !== 0);
        this.speaker();
      } while (this.dex() !== 0);
    } while (this.dec(ZP_SFX_DURATION) !== 0);
  }


  /** sfx_whirlpool and sfx_storm: a tone whose period ramps from `start` towards `end`. */
  private sfxRamp(start: number, step: number, end: number): void {
    this.lda(start);
    for (;;) {
      this.ldy(0x20);
      do {
        this.ldx(this.cpu.a);
        do {
          this.cpu.nz(this.cpu.a);
          this.cpu.cycles = this.cpu.cycles + 12;
        } while (this.dex() !== 0);
        this.speaker();
      } while (this.dey() !== 0);
      if (step > 0) {
        this.add(0x01);
        this.cmp(end);
        if (this.carry()) {
          break;
        }
      } else {
        this.subtract(0x01);
        this.cmp(end);
        if (!this.carry()) {
          break;
        }
      }
    }
  }


  private sfxMagic2(): void {
    const tone: () => void = (): void => {
      this.poke(ZP_SFX_DURATION, this.lda(0x30));
      do {
        this.ldx(this.peek(V.sfx_m2_ctr2));
        this.spinX();
        this.speaker();
        this.ldx(this.peek(V.sfx_m2_ctr1));
        this.spinX();
        this.speaker();
      } while (this.dec(ZP_SFX_DURATION) !== 0);
    };

    this.poke(V.sfx_m2_ctr2, this.cpu.x);
    this.poke(V.sfx_m2_ctr1, this.lda(0x01));
    do {
      tone();
      this.dec(V.sfx_m2_ctr2);
      this.inc(V.sfx_m2_ctr1);
      this.lda(this.peek(V.sfx_m2_ctr1));
      this.cmp(0x1B);
    } while (!this.zero());
    do {
      tone();
      this.dec(V.sfx_m2_ctr1);
      this.inc(V.sfx_m2_ctr2);
      this.lda(this.peek(V.sfx_m2_ctr1));
      this.cmp(0x00);
    } while (!this.zero());
  }


  // --- strings (SUBS.s:2676-2750) -----------------------------------------------------------

  /** SUBS.s:2676 centerstring: string A from the table, centred in 15 columns. */
  public centerstring(): void {
    const index: number = this.cpu.a;

    this.ldy(index);
    this.pointAtString();
    this.poke(ZP_COUNT, this.ldx(0x00));
    for (;;) {
      this.nextStringChar();
      this.ldx(0x00);
      if (!(this.lda(this.peek(this.pointer(ZP_MAIN.ptr1))) >= 0x80)) {
        break;
      }
      this.inc(ZP_COUNT);
    }
    this.inc(ZP_COUNT);
    this.lda(0x0F);
    this.subtract(this.peek(ZP_COUNT));
    this.cpu.a = this.cpu.lsr(this.cpu.a);
    this.add(this.peek(ZP_MAIN.console_xpos));
    this.poke(ZP_MAIN.console_xpos, this.cpu.a);
    this.lda(index);
    this.printstring();
  }


  /** SUBS.s:2715 printstring: string A from the table. */
  public printstring(): void {
    this.ldy(this.cpu.a);
    this.pointAtString();
    this.ldx(0x00);
    for (;;) {
      this.nextStringChar();
      this.ldx(0x00);
      if (!(this.lda(this.peek(this.pointer(ZP_MAIN.ptr1))) >= 0x80)) {
        break;
      }
      this.consoleOut();
    }
    this.lda(this.cpu.a | 0x80);
    this.consoleOut();
  }


  /** ptr1 to the end of the string before string Y: scanning from `strings`, each byte with bit 7 clear ends one. */
  private pointAtString(): void {
    this.poke(ZP_MAIN.ptr1, this.lda(T.strings & 0xFF));
    this.poke(ZP_MAIN.ptr1 + 1, this.lda(T.strings >> 8));
    this.ldx(0x00);
    for (;;) {
      if (this.lda(this.peek(this.pointer(ZP_MAIN.ptr1))) < 0x80) {
        if (this.dey() === 0) {
          break;
        }
      }
      this.nextStringChar();
    }
  }


  private nextStringChar(): void {
    if (this.inc(ZP_MAIN.ptr1) === 0) {
      this.inc(ZP_MAIN.ptr1 + 1);
    }
  }


  // --- reading the maps (SUBS.s:2928-3075) --------------------------------------------------

  /** SUBS.s:2928 gettile_bounds: the tile at (temp_x, temp_y) in the four chunks held, or $FF outside them. */
  public gettileBounds(): void {
    this.lda(this.peek(PRTY.map_x));
    this.mul16(this.cpu.a);
    this.lda(this.cpu.a ^ 0xFF);
    this.setCarry(true);
    this.cpu.adc(this.peek(ZP_MAIN.temp_x));
    this.poke(PRTY.dest_x, this.cpu.a);
    this.cmp(XY_LAST_TILE_CACHE);
    if (!this.carry()) {
      this.lda(this.peek(PRTY.map_y));
      this.mul16(this.cpu.a);
      this.lda(this.cpu.a ^ 0xFF);
      this.setCarry(true);
      this.cpu.adc(this.peek(ZP_MAIN.temp_y));
      this.poke(PRTY.dest_y, this.cpu.a);
      this.cmp(XY_LAST_TILE_CACHE);
    }
    if (this.carry()) {
      this.lda(0xFF);
    } else {
      this.gettileBritannia();
    }
  }


  /** SUBS.s:2951 gettile_britannia: the tile at (dest_x, dest_y) in the four chunks held. */
  public gettileBritannia(): void {
    this.lda(this.peek(PRTY.dest_y));
    this.poke(ZP_MAIN.ptr2, this.mul16(this.cpu.a));
    this.lda(this.peek(PRTY.dest_x) & 0x0F);
    this.poke(ZP_MAIN.ptr2, this.lda(this.cpu.a | this.peek(ZP_MAIN.ptr2)));
    this.lda(this.peek(PRTY.dest_y) & 0x10);
    this.cpu.a = this.cpu.asl(this.cpu.a);
    this.lda(this.cpu.a | this.peek(PRTY.dest_x));
    this.div16(this.cpu.a);
    this.poke(ZP_MAIN.ptr2 + 1, this.add(MAP_OBJECTS.world_map_NW >> 8));
    this.ldy(MAP_OBJECTS.world_map_NW & 0xFF);
    this.lda(this.peek(this.pointer(ZP_MAIN.ptr2) + this.cpu.y));
  }


  /** SUBS.s:2975 gettile_opposite: the drawn tile at (temp_x, temp_y), relative to the player. */
  public gettileOpposite(): void {
    this.lda(this.peek(ZP_MAIN.temp_y));
    this.subtract(this.peek(PRTY.player_ypos));
    this.add(XY_CENTER);
    this.ldy(this.cpu.a);
    this.poke(ZP_NUMBER, this.lda(this.peek(T.mul_11 + this.cpu.y)));
    this.lda(this.peek(ZP_MAIN.temp_x));
    this.subtract(this.peek(PRTY.player_xpos));
    this.add(XY_CENTER);
    this.add(this.peek(ZP_NUMBER));
    this.poke(ZP_MAIN.ptr1, this.cpu.a);
    this.poke(ZP_MAIN.ptr1 + 1, this.lda(MAP_OBJECTS.drawn_tiles >> 8));
    this.ldy(0x00);
    this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y));
  }


  /** SUBS.s:2998 gettile_drawn_map: the drawn tile at view position (dest_x, dest_y); Y its index. */
  public gettileDrawnMap(): void {
    this.ldy(this.peek(PRTY.dest_y));
    this.lda(this.peek(T.mul_11 + this.cpu.y));
    this.add(this.peek(PRTY.dest_x));
    this.ldy(this.cpu.a);
    this.lda(this.peek(MAP_OBJECTS.drawn_tiles + this.cpu.y));
  }


  /** SUBS.s:3007 gettile_actual_map: the tile under whatever is drawn there. */
  public gettileActualMap(): void {
    this.gettileDrawnMap();
    this.lda(this.peek(MAP_OBJECTS.world_tiles + this.cpu.y));
  }


  /** SUBS.s:3012 get_player_tile: the tile under the player in Britannia or a towne, else $FF. */
  public getPlayerTile(): void {
    this.lda(this.peek(PRTY.game_mode));
    this.cmp(PRTY.mode_world);
    if (this.zero()) {
      this.poke(PRTY.dest_x, this.lda(this.peek(PRTY.player_xpos)));
      this.poke(PRTY.dest_y, this.lda(this.peek(PRTY.player_ypos)));
      this.gettileBritannia();
    } else {
      this.cmp(PRTY.mode_towne);
      if (this.zero()) {
        this.poke(ZP_MAIN.temp_x, this.lda(this.peek(PRTY.player_xpos)));
        this.poke(ZP_MAIN.temp_y, this.lda(this.peek(PRTY.player_ypos)));
        this.gettileTowne();
      } else {
        this.lda(0xFF);
      }
    }
  }


  /** SUBS.s:3035 gettile_towne: the towne tile at (temp_x, temp_y). */
  public gettileTowne(): void {
    this.poke(ZP_MAIN.ptr2 + 1, this.lda(this.peek(ZP_MAIN.temp_y)));
    this.lda(0x00);
    for (let shift: number = 0; shift < 3; shift++) {
      this.poke(ZP_MAIN.ptr2 + 1, this.cpu.lsr(this.peek(ZP_MAIN.ptr2 + 1)));
      this.cpu.a = this.cpu.ror(this.cpu.a);
    }
    this.cpu.adc(this.peek(ZP_MAIN.temp_x));
    this.poke(ZP_MAIN.ptr2, this.cpu.a);
    this.lda(this.peek(ZP_MAIN.ptr2 + 1));
    this.poke(ZP_MAIN.ptr2 + 1, this.add(MAP_OBJECTS.towne_map >> 8));
    this.ldy(MAP_OBJECTS.towne_map & 0xFF);
    this.lda(this.peek(this.pointer(ZP_MAIN.ptr2) + this.cpu.y));
  }


  /** SUBS.s:3055 gettile_dungeon: the dungeon tile at (dest_x, dest_y) on the current level. */
  public gettileDungeon(): void {
    this.lda(this.peek(PRTY.dungeon_level));
    this.cpu.a = this.cpu.lsr(this.cpu.a);
    this.cpu.a = this.cpu.lsr(this.cpu.a);
    this.poke(ZP_MAIN.ptr1 + 1, this.add(MAP_OBJECTS.dng_map >> 8));
    this.lda(this.peek(PRTY.dungeon_level) & 0x03);
    for (let shift: number = 0; shift < 3; shift++) {
      this.cpu.a = this.cpu.asl(this.cpu.a);
    }
    this.lda(this.cpu.a | this.peek(PRTY.dest_y));
    for (let shift: number = 0; shift < 3; shift++) {
      this.cpu.a = this.cpu.asl(this.cpu.a);
    }
    this.poke(ZP_MAIN.ptr1, this.lda(this.cpu.a | this.peek(PRTY.dest_x)));
    this.ldy(0x00);
    this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y));
  }
}

const SFX_ENTRY_LIST: readonly number[] = [ 0x1940, 0x1954, 0x1962, 0x1972, 0x1983, 0x1993, 0x19A3, 0x19B5, 0x19C7, 0x1A06, 0x19D8, 0x19EE, 0x1A5F ];
