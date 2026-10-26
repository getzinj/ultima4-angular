// underworld/DNGD.s: the dungeon's 3D view, ported. Up to four squares ahead are drawn from the
// level's map, nearest first, unless only the monsters and items changed: the walls, doors and
// corridors either side and ahead in perspective, the ladders and holes, a field filling the view,
// and then the monsters and items on the party's square and ahead as sprites from the tile map,
// doubled in width when near. Nothing is drawn without light. The view has a generator of its
// own, whose state stays in its image with every variable and the operands of the sprite copies,
// which the original rewrites; the port writes them there too. ULT4 loads it at $8C00.

import type { LiftedMachine } from '../../../lifted-runtime/lifted-machine';
import { APPLE, DUNGEON, MAP_OBJECTS, PRTY, TABLES, TILES, ZP_MAIN } from '../../../state/symbols';
import { PortProgram } from '../../port-program';
import type { Exit } from '../../routine';
import { overlayModule } from '../overlay';
import { DNGD_DATA, DNGD_ENTRIES, DNGD_TABLES, DNGD_VARIABLES, SPRITE_OPERANDS } from './dngd-data';
import type { ISpriteOperands } from './dngd-data';

const D = DUNGEON;
const T = DNGD_TABLES;
const V = DNGD_VARIABLES;
const tile_forward_1: number = 0xC9;
const tile_forward_2: number = 0xCA;
const tile_forward_3: number = 0xCB;
const tile_behind: number = 0xCC;
const LINE_MIN: number = 0x08;
const LINE_MAX: number = 0xB8;
const COLUMN_MAX: number = 0x16;
const BLANK_BYTE: number = 0x80;
const DISTANCES: number = 0x04;
const DNG_MAP_PAGE: number = 0xE8;
const LADDER_SIDE_X: number = 0x53;
const VIEW_MIDDLE_TOP: number = 0x5F;
const VIEW_MIDDLE_BOTTOM: number = 0x60;
const FOUNTAIN_SPRITE: number = 0x02;
const ALTAR_SPRITE: number = 0x4A;
const TILEMAP_END_PAGE: number = (TABLES.tilemap >> 8) + 0x10;
/** The `jsr get_item_sprite` of each square, nearest first: a field there pulls its return address. */
const ITEM_SITES: readonly number[] = [ 0x947B, 0x949F, 0x94BD, 0x94DB ];
/** After the square ahead: its sides drawn, the next square straight on, or the view done. */
type Ahead = 'sides' | 'next' | 'done';
/** Each square ahead's tile, nearest first. */
const AHEAD: readonly number[] = [ tile_forward_1, tile_forward_2, tile_forward_3 ];


export class UnderworldDngd extends PortProgram {
  constructor(machine: LiftedMachine) {
    super(machine);
  }


  /** dungeon_check_update: the view drawn again if the party, or anything it can see, has changed; the monsters and items in any case. */
  public checkUpdate(): Exit {
    this.getNeighborTiles();
    if (this.changed()) {
      this.dungeonRender();
    }
    this.drawItemsMonsters();

    return null;
  }


  /** The third entry: the neighbours read and the whole view drawn. */
  public redraw(): Exit {
    this.getNeighborTiles();
    this.dungeonRender();
    this.drawItemsMonsters();

    return null;
  }


  /** What dungeon_check_update compares, up to a square that hides what is beyond: true if any differs from when last drawn. */
  private changed(): boolean {
    let changed: boolean = false;
    let decided: boolean = false;

    for (const [ now, drawn ] of [
      [ PRTY.dungeon_level, V.last_drawn_dungeon_level ],
      [ PRTY.player_xpos, V.last_drawn_player_xpos ],
      [ PRTY.player_ypos, V.last_drawn_player_ypos ],
      [ PRTY.dng_direction, V.last_drawn_dng_direction ],
    ] as const) {
      if (!changed) {
        this.lda(this.peek(now));
        this.cmp(this.peek(drawn));
        changed = !this.zero();
      }
    }
    if (!changed) {
      this.lda(this.peek(ZP_MAIN.tile_under_player));
      this.cmp(this.peek(V.last_drawn_tile_under_player));
      changed = !this.zero();
      if (!changed) {
        decided = this.hidesBeyond(D.dng_tile_room);
      }
    }
    for (let ahead: number = 0; ahead < AHEAD.length; ahead++) {
      if (!changed && !decided) {
        this.lda(this.peek(AHEAD[ahead]));
        this.cmp(this.peek(V.last_drawn_forward_1 + ahead));
        changed = !this.zero();
        if (!changed && (ahead < AHEAD.length - 1)) {
          decided = this.hidesBeyond(D.dng_tile_door);
        }
      }
    }

    return changed;
  }


  /** `and #dng_tile_type_mask` / `cmp #dng_tile_field` / `beq` / `cmp #opaque` / `bcs`: a field, or a tile from `opaque` up. */
  private hidesBeyond(opaque: number): boolean {
    let hides: boolean;

    this.lda(this.cpu.a & D.dng_tile_type_mask);
    this.cmp(D.dng_tile_field);
    if (this.zero()) {
      hides = true;
    } else {
      this.cmp(opaque);
      hides = this.carry();
    }

    return hides;
  }


  private dungeonRender(): void {
    this.poke(V.last_drawn_dungeon_level, this.lda(this.peek(PRTY.dungeon_level)));
    this.poke(V.last_drawn_player_xpos, this.lda(this.peek(PRTY.player_xpos)));
    this.poke(V.last_drawn_player_ypos, this.lda(this.peek(PRTY.player_ypos)));
    this.poke(V.last_drawn_dng_direction, this.lda(this.peek(PRTY.dng_direction)));
    this.poke(V.last_drawn_under_player, this.lda(this.peek(tile_behind)));
    this.poke(V.last_drawn_tile_under_player, this.lda(this.peek(ZP_MAIN.tile_under_player)));
    this.poke(V.last_drawn_forward_1, this.lda(this.peek(tile_forward_1)));
    this.poke(V.last_drawn_forward_2, this.lda(this.peek(tile_forward_2)));
    this.poke(V.last_drawn_forward_3, this.lda(this.peek(tile_forward_3)));
    this.drawDungeon();
  }


  // --- the view (DNGD.s:104-236) ----------------------------------------------------------------

  private drawDungeon(): void {
    this.clearView();
    if (this.lda(this.peek(PRTY.light_duration)) !== 0) {
      let done: boolean = false;

      this.poke(V.render_distance, this.lda(0x00));
      while (!done) {
        const ahead: Ahead = this.renderAhead();

        done = ahead === 'done';
        if (!done) {
          if (ahead === 'sides') {
            this.renderSides();
          }
          this.inc(V.render_distance);
          this.lda(this.peek(V.render_distance));
          this.cmp(DISTANCES);
          done = this.carry();
        }
      }
    }
  }


  /** render_forward: the square ahead at this distance, then the sides, or straight on to the next (a door from within it), or done. */
  private renderAhead(): Ahead {
    let ahead: Ahead = 'sides';

    this.getCoordsInFront();
    this.getDungeonTileType();
    if (!this.zero()) {
      const type: number = this.ldx(this.cpu.a);

      if (type <= 0x06) {
        this.dex();
        for (let next: number = 1; next < type; next++) {
          this.dex();
        }
        if ((type === 0x01) || (type === 0x03)) {
          this.renderLadderUp();
        }
        if ((type === 0x02) || (type === 0x03)) {
          this.renderLadderDown();
        }
        if (type === 0x05) {
          this.renderCeilingHole();
        }
        if (type === 0x06) {
          this.renderFloorHole();
        }
      } else {
        this.ldx(type - 0x0A);
        if (!this.negative()) {
          ahead = this.renderOpaque(type);
        }
      }
    }

    return ahead;
  }


  /** A field, a door, a room or a wall ahead, X counting down from the field's type; an altar is seen past. */
  private renderOpaque(type: number): Ahead {
    let ahead: Ahead = 'done';

    if (type === 0x0A) {
      this.getDungeonTile();
      this.renderField();
    } else {
      this.dex();
      if (type === 0x0B) {
        ahead = 'sides';
      } else {
        this.dex();
        if (type !== 0x0C) {
          this.dex();
        }
        this.renderFrontWall();
        if (type <= 0x0D) {
          this.renderFrontDoor();
        }
        if ((type === 0x0C) && (this.lda(this.peek(V.render_distance)) === 0)) {
          ahead = 'next';
        }
      }
    }

    return ahead;
  }


  /** render_left and render_right: a corridor, a wall with a door, or a wall, either side. */
  private renderSides(): void {
    this.getCoordsFrontSide(0xFF);
    this.renderSide((): void => this.renderLeftCorridor(), (): void => this.renderLeftWall(), (): void => this.renderLeftDoor());
    this.getCoordsFrontSide(0x01);
    this.renderSide((): void => this.renderRightCorridor(), (): void => this.renderRightWall(), (): void => this.renderRightDoor());
  }


  private renderSide(corridor: () => void, wall: () => void, door: () => void): void {
    this.getDungeonTileType();
    this.cmp(D.dng_tile_door >> 4);
    if (!this.carry()) {
      corridor();
    } else {
      this.cmp(D.dng_tile_secret_door >> 4);

      const doorway: boolean = !this.carry();

      wall();
      if (doorway) {
        door();
      }
    }
  }


  // --- where things are (DNGD.s:237-398) ---------------------------------------------------------

  /** The tiles behind the party, under it and three ahead, wrapping round the level. */
  private getNeighborTiles(): void {
    this.ldx(this.peek(PRTY.dng_direction));
    this.setCarry(true);
    this.lda(this.peek(PRTY.player_xpos));
    this.cpu.sbc(this.peek(T.dir_delta_x + this.cpu.x));
    this.poke(V.gdt_x, this.lda(this.cpu.a & MAP_OBJECTS.xy_max_dungeon));
    this.setCarry(true);
    this.lda(this.peek(PRTY.player_ypos));
    this.cpu.sbc(this.peek(T.dir_delta_y + this.cpu.x));
    this.poke(V.gdt_y, this.lda(this.cpu.a & MAP_OBJECTS.xy_max_dungeon));
    this.getDungeonTile();
    this.poke(tile_behind, this.cpu.a);
    this.poke(V.gdt_x, this.lda(this.peek(PRTY.player_xpos)));
    this.poke(V.gdt_y, this.lda(this.peek(PRTY.player_ypos)));
    this.getDungeonTile();
    this.poke(ZP_MAIN.tile_under_player, this.cpu.a);
    for (const ahead of AHEAD) {
      this.ldx(this.peek(PRTY.dng_direction));
      this.setCarry(false);
      this.lda(this.peek(V.gdt_x));
      this.cpu.adc(this.peek(T.dir_delta_x + this.cpu.x));
      this.poke(V.gdt_x, this.lda(this.cpu.a & MAP_OBJECTS.xy_max_dungeon));
      this.setCarry(false);
      this.lda(this.peek(V.gdt_y));
      this.cpu.adc(this.peek(T.dir_delta_y + this.cpu.x));
      this.poke(V.gdt_y, this.lda(this.cpu.a & MAP_OBJECTS.xy_max_dungeon));
      this.getDungeonTile();
      this.poke(ahead, this.cpu.a);
    }
  }


  private getCoordsInFront(): void {
    this.getCoordsFrontSide(0x00);
  }


  /** get_coords_in_front, _front_left and _front_right: the square `side` across at this distance, turned to face the party's way. */
  private getCoordsFrontSide(side: number): void {
    this.setCarry(true);
    this.lda(0x00);
    this.cpu.sbc(this.peek(V.render_distance));
    this.poke(V.draw_height, this.cpu.a);
    this.poke(V.draw_width, this.lda(side));
    this.rotateCoords();
  }


  private rotateCoords(): void {
    this.ldy(this.peek(PRTY.dng_direction));
    if (!this.zero()) {
      do {
        this.ldx(this.peek(V.draw_width));
        this.lda(this.peek(V.draw_height) ^ 0xFF);
        this.poke(V.draw_width, this.cpu.a);
        this.inc(V.draw_width);
        this.poke(V.draw_height, this.cpu.x);
      } while (this.dey() !== 0);
    }
    this.setCarry(false);
    this.lda(this.peek(PRTY.player_xpos));
    this.cpu.adc(this.peek(V.draw_width));
    this.poke(V.gdt_x, this.lda(this.cpu.a & MAP_OBJECTS.xy_max_dungeon));
    this.setCarry(false);
    this.lda(this.peek(PRTY.player_ypos));
    this.cpu.adc(this.peek(V.draw_height));
    this.poke(V.gdt_y, this.lda(this.cpu.a & MAP_OBJECTS.xy_max_dungeon));
  }


  private clearView(): void {
    this.ldx(LINE_MIN);
    do {
      this.poke(ZP_MAIN.ptr1, this.lda(this.peek(TABLES.bmplineaddr_lo + this.cpu.x)));
      this.poke(ZP_MAIN.ptr1 + 1, this.lda(this.peek(TABLES.bmplineaddr_hi + this.cpu.x)));
      this.ldy(COLUMN_MAX);
      this.lda(BLANK_BYTE);
      do {
        this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.cpu.a);
      } while (this.dey() !== 0);
      this.inx();
      this.cpu.compare(this.cpu.x, LINE_MAX);
    } while (!this.carry());
  }


  private getDungeonTileType(): void {
    this.getDungeonTile();
    this.div16(this.cpu.a);
  }


  /** get_dungeon_tile: the tile at (gdt_x, gdt_y) on the party's level, four levels a page of the map. */
  private getDungeonTile(): void {
    this.lda(this.peek(PRTY.dungeon_level));
    this.cpu.a = this.cpu.lsr(this.cpu.lsr(this.cpu.a));
    this.poke(ZP_MAIN.ptr2 + 1, this.add(DNG_MAP_PAGE));
    this.lda(this.peek(PRTY.dungeon_level) & 0x03);
    this.cpu.a = this.cpu.asl(this.cpu.asl(this.cpu.asl(this.cpu.a)));
    this.lda(this.cpu.a | this.peek(V.gdt_y));
    this.cpu.a = this.cpu.asl(this.cpu.asl(this.cpu.asl(this.cpu.a)));
    this.poke(ZP_MAIN.ptr2, this.lda(this.cpu.a | this.peek(V.gdt_x)));
    this.ldy(0x00);
    this.lda(this.peek(this.pointer(ZP_MAIN.ptr2) + this.cpu.y));
  }


  // --- walls, doors and corridors (DNGD.s:399-549) -----------------------------------------------

  /** The wall's corners from the tables, X the distance: across from `x1` to `x2`, its top and bottom from `top1`/`bottom1` to `top2`/`bottom2`. */
  private wallCoords(x1: number, x2: number, top1: number, top2: number, bottom1: number, bottom2: number): void {
    this.ldx(this.peek(V.render_distance));
    this.poke(V.draw_x1, this.lda(this.peek(x1 + this.cpu.x)));
    this.poke(V.draw_x2, this.lda(this.peek(x2 + this.cpu.x)));
    this.poke(V.draw_top_y1, this.lda(this.peek(top1 + this.cpu.x)));
    this.poke(V.draw_top_y2, this.lda(this.peek(top2 + this.cpu.x)));
    this.poke(V.draw_bottom_y1, this.lda(this.peek(bottom1 + this.cpu.x)));
    this.poke(V.draw_bottom_y2, this.lda(this.peek(bottom2 + this.cpu.x)));
  }


  /** A wall facing the party, X the distance: from `x1` to `x2`, the same top and bottom across. */
  private frontCoords(x1: number, x2: number, top: number, bottom: number): void {
    this.ldx(this.peek(V.render_distance));
    this.poke(V.draw_x1, this.lda(this.peek(x1 + this.cpu.x)));
    this.poke(V.draw_x2, this.lda(this.peek(x2 + this.cpu.x)));
    this.lda(this.peek(top + this.cpu.x));
    this.poke(V.draw_top_y1, this.cpu.a);
    this.poke(V.draw_top_y2, this.cpu.a);
    this.lda(this.peek(bottom + this.cpu.x));
    this.poke(V.draw_bottom_y1, this.cpu.a);
    this.poke(V.draw_bottom_y2, this.cpu.a);
  }


  private renderLeftWall(): void {
    this.wallCoords(T.wall_left_x, T.wall_left_x + 1, T.wall_top_y, T.wall_top_y + 1, T.wall_bottom_y, T.wall_bottom_y + 1);
    this.setWallPattern(0x00);
    this.drawWall();
  }


  private renderRightWall(): void {
    this.wallCoords(T.wall_right_x, T.wall_right_x + 1, T.wall_top_y, T.wall_top_y + 1, T.wall_bottom_y, T.wall_bottom_y + 1);
    this.setWallPattern(0x00);
    this.drawWall();
  }


  private renderFrontWall(): void {
    this.frontCoords(T.wall_left_x, T.wall_right_x, T.wall_top_y, T.wall_bottom_y);
    this.setWallPattern(0x01);
    this.drawWall();
  }


  private renderLeftDoor(): void {
    this.wallCoords(T.door_left_start_x, T.door_left_end_x, T.door_top_start_y, T.door_top_end_y, T.door_bottom_start_y, T.door_bottom_end_y);
    this.poke(V.column_draw_mode, this.lda(0xFF));
    this.drawWall();
  }


  private renderRightDoor(): void {
    this.wallCoords(T.door_right_start_x, T.door_right_end_x, T.door_top_start_y, T.door_top_end_y, T.door_bottom_start_y, T.door_bottom_end_y);
    this.poke(V.column_draw_mode, this.lda(0xFF));
    this.drawWall();
  }


  /** The door in the wall ahead, drawn in the wall's colour, or cleared from it when the party stands in the doorway. */
  private renderFrontDoor(): void {
    this.ldx(this.peek(V.render_distance));
    if (!this.zero()) {
      this.frontCoords(T.wall_left_x + 1, T.wall_right_x + 1, T.wall_top_y + 1, T.wall_bottom_y);
      this.poke(V.column_draw_mode, this.lda(0xFF));
    } else {
      this.frontCoords(T.wall_left_x + 1, T.wall_right_x + 1, T.wall_top_y + 1, T.wall_bottom_y);
      this.poke(V.column_draw_mode, this.lda(0x00));
    }
    this.drawWall();
  }


  private renderLeftCorridor(): void {
    this.corridorCoords(T.wall_left_x);
    this.setWallPattern(0x01);
    this.drawWall();
  }


  private renderRightCorridor(): void {
    this.corridorCoords(T.wall_right_x);
    this.setWallPattern(0x01);
    this.drawWall();
  }


  /** The far wall of a corridor either side: from the wall's edge at this distance to the next. */
  private corridorCoords(edge: number): void {
    this.ldx(this.peek(V.render_distance));
    this.poke(V.draw_x1, this.lda(this.peek(edge + this.cpu.x)));
    this.poke(V.draw_x2, this.lda(this.peek(edge + 1 + this.cpu.x)));
    this.lda(this.peek(T.wall_top_y + 1 + this.cpu.x));
    this.poke(V.draw_top_y1, this.cpu.a);
    this.poke(V.draw_top_y2, this.cpu.a);
    this.lda(this.peek(T.wall_bottom_y + 1 + this.cpu.x));
    this.poke(V.draw_bottom_y1, this.cpu.a);
    this.poke(V.draw_bottom_y2, this.cpu.a);
  }


  /** set_wall_pattern_a (`flip` 0) and _b (1): the columns of one parity coloured, by the way the party faces. */
  private setWallPattern(flip: number): void {
    this.lda(this.peek(PRTY.dng_direction) & 0x01);
    if (flip !== 0) {
      this.lda(this.cpu.a ^ 0x01);
    }
    this.poke(V.column_draw_mode, this.cpu.a);
    this.inc(V.column_draw_mode);
  }


  // --- ladders and holes (DNGD.s:550-747) --------------------------------------------------------

  private renderLadderUp(): void {
    this.renderCeilingHole();
    this.lda(this.peek(PRTY.dng_direction));
    this.cpu.a = this.cpu.lsr(this.cpu.a);
    if (this.carry()) {
      this.ladderRails(this.peek(T.ceiling_hole_top_y + this.peek(V.render_distance)), VIEW_MIDDLE_TOP, true);
      this.ladderRungs([ T.ladder_up_top_rung_y, T.ladder_up_middle_rung_y, T.ladder_up_bottom_rung_y ]);
    } else {
      this.ladderSide(true);
    }
  }


  private renderLadderDown(): void {
    this.renderFloorHole();
    this.lda(this.peek(PRTY.dng_direction));
    this.cpu.a = this.cpu.lsr(this.cpu.a);
    if (this.carry()) {
      this.ladderRails(VIEW_MIDDLE_BOTTOM, this.peek(T.floor_hole_bottom_y + this.peek(V.render_distance)), false);
      this.ladderRungs([ T.ladder_down_top_rung_y, T.ladder_down_middle_rung_y, T.ladder_down_bottom_rung_y ]);
    } else {
      this.ladderSide(false);
    }
  }


  /** A ladder seen head on: its two rails, each two pixels wide, from `top` to `bottom` (set in the order the original sets them). */
  private ladderRails(top: number, bottom: number, up: boolean): void {
    for (const [ rail, step ] of [ [ T.ladder_left_x, 1 ], [ T.ladder_right_x, -1 ] ] as const) {
      this.ldx(this.peek(V.render_distance));
      this.poke(V.pixel_x, this.lda(this.peek(rail + this.cpu.x)));
      if (up) {
        this.poke(V.pixel_column_start_y, this.lda(top));
        this.poke(V.pixel_column_end_y, this.lda(bottom));
      } else {
        this.poke(V.pixel_column_end_y, this.lda(bottom));
        this.poke(V.pixel_column_start_y, this.lda(top));
      }
      this.setPixelColumn();
      if (step > 0) {
        this.inc(V.pixel_x);
      } else {
        this.dec(V.pixel_x);
      }
      this.setPixelColumn();
    }
  }


  private ladderRungs(rungs: readonly number[]): void {
    this.ldx(this.peek(V.render_distance));
    this.poke(V.draw_x1, this.lda(this.peek(T.ladder_left_x + this.cpu.x)));
    this.poke(V.draw_x2, this.lda(this.peek(T.ladder_right_x + this.cpu.x)));
    for (const rung of rungs) {
      if (rung !== rungs[0]) {
        this.ldx(this.peek(V.render_distance));
      }
      this.lda(this.peek(rung + this.cpu.x));
      this.poke(V.draw_y1, this.cpu.a);
      this.poke(V.draw_y2, this.cpu.a);
      this.drawLine();
    }
  }


  /** A ladder seen from the side: one rail, two pixels wide, in the middle of the view. */
  private ladderSide(up: boolean): void {
    this.ldx(this.peek(V.render_distance));
    this.poke(V.pixel_x, this.lda(LADDER_SIDE_X));
    if (up) {
      this.poke(V.pixel_column_start_y, this.lda(this.peek(T.ceiling_hole_top_y + this.cpu.x)));
      this.poke(V.pixel_column_end_y, this.lda(VIEW_MIDDLE_TOP));
    } else {
      this.poke(V.pixel_column_start_y, this.lda(VIEW_MIDDLE_BOTTOM));
      this.poke(V.pixel_column_end_y, this.lda(this.peek(T.floor_hole_bottom_y + this.cpu.x)));
    }
    this.setPixelColumn();
    this.inc(V.pixel_x);
    this.setPixelColumn();
  }


  private renderCeilingHole(): void {
    this.renderHole(T.ceiling_hole_top_y, T.ceiling_hole_bottom_y);
  }


  private renderFloorHole(): void {
    this.renderHole(T.floor_hole_bottom_y, T.floor_hole_top_y);
  }


  /** A hole in the ceiling or floor: its outline, the sides two pixels wide, `near` its edge nearer the party's eye line's far side. */
  private renderHole(near: number, far: number): void {
    this.ldx(this.peek(V.render_distance));
    this.poke(V.draw_x1, this.lda(this.peek(T.hole_bottom_left_x + this.cpu.x)));
    this.poke(V.draw_y1, this.lda(this.peek(near + this.cpu.x)));
    this.poke(V.draw_x2, this.lda(this.peek(T.hole_top_left_x + this.cpu.x)));
    this.poke(V.draw_y2, this.lda(this.peek(far + this.cpu.x)));
    this.drawLine();
    this.inc(V.draw_x1);
    this.inc(V.draw_x2);
    this.drawLine();
    this.ldx(this.peek(V.render_distance));
    this.poke(V.draw_x1, this.lda(this.peek(T.hole_top_right_x + this.cpu.x)));
    this.poke(V.draw_y1, this.lda(this.peek(far + this.cpu.x)));
    this.drawLine();
    this.ldx(this.peek(V.render_distance));
    this.poke(V.draw_x2, this.lda(this.peek(T.hole_bottom_right_x + this.cpu.x)));
    this.poke(V.draw_y2, this.lda(this.peek(near + this.cpu.x)));
    this.drawLine();
    this.dec(V.draw_x1);
    this.dec(V.draw_x2);
    this.drawLine();
    this.ldx(this.peek(V.render_distance));
    this.poke(V.draw_x1, this.lda(this.peek(T.hole_bottom_left_x + this.cpu.x)));
    this.poke(V.draw_y1, this.lda(this.peek(near + this.cpu.x)));
    this.drawLine();
  }


  // --- drawing (DNGD.s:763-1025) -----------------------------------------------------------------

  /** draw_wall: a column at a time from draw_x1 to draw_x2, its top and bottom stepped towards their second ends as a line would be. */
  private drawWall(): void {
    let more: boolean = true;

    this.poke(V.pixel_column_start_y, this.lda(this.peek(V.draw_top_y1)));
    this.poke(V.pixel_column_end_y, this.lda(this.peek(V.draw_bottom_y1)));
    this.poke(V.pixel_x, this.lda(this.peek(V.draw_x1)));
    this.lda(this.peek(V.draw_x1));
    this.cmp(this.peek(V.draw_x2));
    if (!this.carry()) {
      this.poke(V.step_x, this.lda(0x01));
      this.setCarry(true);
      this.lda(this.peek(V.draw_x2));
      this.cpu.sbc(this.peek(V.draw_x1));
    } else {
      this.poke(V.step_x, this.lda(0xFF));
      this.setCarry(true);
      this.lda(this.peek(V.draw_x1));
      this.cpu.sbc(this.peek(V.draw_x2));
    }
    this.poke(V.draw_width, this.cpu.a);
    this.poke(V.draw_top_step_y, this.lda(0xFF));
    this.setCarry(true);
    this.lda(this.peek(V.draw_top_y1));
    this.cpu.sbc(this.peek(V.draw_top_y2));
    this.poke(V.draw_top_height, this.cpu.a);
    if (!this.carry()) {
      this.negateInto(V.draw_top_height);
      this.poke(V.draw_top_step_y, this.lda(0x01));
    }
    this.poke(V.draw_bottom_step_y, this.lda(0xFF));
    this.setCarry(true);
    this.lda(this.peek(V.draw_bottom_y1));
    this.cpu.sbc(this.peek(V.draw_bottom_y2));
    this.poke(V.draw_bottom_height, this.cpu.a);
    if (!this.carry()) {
      this.negateInto(V.draw_bottom_height);
      this.poke(V.draw_bottom_step_y, this.lda(0x01));
      this.poke(V.error_delta_top, this.lsr(this.peek(V.draw_top_height)));
      this.poke(V.error_delta_bottom, this.lsr(this.peek(V.draw_bottom_height)));
    }
    while (more) {
      this.setOrClearColumn();
      this.stepEdge(V.error_delta_top, V.draw_top_height, V.pixel_column_start_y, V.draw_top_step_y);
      this.stepEdge(V.error_delta_bottom, V.draw_bottom_height, V.pixel_column_end_y, V.draw_bottom_step_y);
      this.setCarry(false);
      this.lda(this.peek(V.pixel_x));
      this.cpu.adc(this.peek(V.step_x));
      this.poke(V.pixel_x, this.cpu.a);
      this.cmp(this.peek(V.draw_x2));
      more = !this.zero();
    }
    this.setOrClearColumn();
  }


  /** `lda` / `lsr`. */
  private lsr(value: number): number {
    this.cpu.a = this.cpu.lsr(this.lda(value));

    return this.cpu.a;
  }


  /** `eor #$ff` / `sta` / `inc`: the difference in A made positive. */
  private negateInto(address: number): void {
    this.poke(address, this.lda(this.cpu.a ^ 0xFF));
    this.inc(address);
  }


  /** One edge of the wall's column a column on: its error less its height, and while that is negative, the edge stepped and the width added back. */
  private stepEdge(error: number, height: number, edge: number, step: number): void {
    this.setCarry(true);
    this.lda(this.peek(error));
    this.cpu.sbc(this.peek(height));
    this.poke(error, this.cpu.a);
    if (!this.carry()) {
      do {
        this.setCarry(false);
        this.lda(this.peek(edge));
        this.cpu.adc(this.peek(step));
        this.poke(edge, this.cpu.a);
        this.setCarry(false);
        this.lda(this.peek(error));
        this.cpu.adc(this.peek(V.draw_width));
        this.poke(error, this.cpu.a);
      } while (this.negative());
    }
  }


  /** set_or_clear_column: by column_draw_mode, the column set ($FF), cleared (0), or set only on the columns of its parity (1 or 2). */
  private setOrClearColumn(): void {
    this.lda(this.peek(V.column_draw_mode));
    if (this.negative()) {
      this.setPixelColumn();
    } else if (this.zero()) {
      this.clearPixelColumn();
    } else {
      this.lda(this.cpu.a ^ this.peek(V.pixel_x));
      this.lda(this.cpu.a & 0x01);
      if (this.zero()) {
        this.setPixelColumn();
      }
    }
  }


  private setPixelColumn(): void {
    this.ldx(this.peek(V.pixel_x));
    this.poke(V.temp1, this.lda(this.peek(TABLES.bmpcol_bit + this.cpu.x) | 0x80));
    this.pixelColumn((byte: number): number => this.lda(this.peek(V.temp1) | byte));
  }


  private clearPixelColumn(): void {
    this.ldx(this.peek(V.pixel_x));
    this.poke(V.temp1, this.lda(this.peek(TABLES.bmpcol_bit + this.cpu.x) ^ 0xFF));
    this.pixelColumn((byte: number): number => this.lda(this.peek(V.temp1) & byte));
  }


  /** Each row from pixel_column_start_y to pixel_column_end_y of the column's byte, X the pixel's column: rewritten by `apply`. */
  private pixelColumn(apply: (byte: number) => number): void {
    this.ldy(this.peek(TABLES.bmpcol_byte + this.cpu.x));
    this.ldx(this.peek(V.pixel_column_start_y));
    do {
      this.poke(ZP_MAIN.ptr1, this.lda(this.peek(TABLES.bmplineaddr_lo + this.cpu.x)));
      this.poke(ZP_MAIN.ptr1 + 1, this.lda(this.peek(TABLES.bmplineaddr_hi + this.cpu.x)));

      const address: number = this.pointer(ZP_MAIN.ptr1) + this.cpu.y;

      this.poke(address, apply(this.peek(address)));
      this.inx();
      this.cpu.compare(this.cpu.x, this.peek(V.pixel_column_end_y));
    } while (!this.carry() || this.zero());
  }


  /** draw_line: from (draw_x1, draw_y1) to (draw_x2, draw_y2), stepping along whichever is longer. */
  private drawLine(): void {
    this.setCarry(true);
    this.lda(this.peek(V.draw_x2));
    this.cpu.sbc(this.peek(V.draw_x1));
    this.poke(V.draw_width, this.cpu.a);
    if (this.carry()) {
      this.poke(V.step_x, this.lda(0x01));
    } else {
      this.negateInto(V.draw_width);
      this.poke(V.step_x, this.lda(0xFF));
    }
    this.setCarry(true);
    this.lda(this.peek(V.draw_y2));
    this.cpu.sbc(this.peek(V.draw_y1));
    this.poke(V.draw_height, this.cpu.a);
    if (this.carry()) {
      this.poke(V.step_y, this.lda(0x01));
    } else {
      this.negateInto(V.draw_height);
      this.poke(V.step_y, this.lda(0xFF));
    }
    this.poke(V.pixel_x, this.lda(this.peek(V.draw_x1)));
    this.poke(V.pixel_y, this.lda(this.peek(V.draw_y1)));
    this.setPixel();
    this.lda(this.peek(V.draw_width));
    this.cmp(this.peek(V.draw_height));
    if (this.carry()) {
      this.drawLineAlong(V.draw_width, V.draw_height, V.pixel_y, V.step_y, V.pixel_x, V.step_x);
    } else {
      this.drawLineAlong(V.draw_height, V.draw_width, V.pixel_x, V.step_x, V.pixel_y, V.step_y);
    }
  }


  /** draw_line_horizontal (along x) or _vertical: a pixel each step along `length`, the other way stepped when the error passes it. */
  private drawLineAlong(length: number, rise: number, minor: number, minorStep: number, major: number, majorStep: number): void {
    this.poke(V.temp2, this.lda(this.peek(length)));
    this.poke(V.error_delta_line, this.lsr(this.cpu.a));
    do {
      this.setCarry(false);
      this.lda(this.peek(V.error_delta_line));
      this.cpu.adc(this.peek(rise));
      this.poke(V.error_delta_line, this.cpu.a);
      this.setCarry(true);
      this.cpu.sbc(this.peek(length));
      if (this.carry()) {
        this.poke(V.error_delta_line, this.cpu.a);
        this.setCarry(false);
        this.lda(this.peek(minor));
        this.cpu.adc(this.peek(minorStep));
        this.poke(minor, this.cpu.a);
      }
      this.setCarry(false);
      this.lda(this.peek(major));
      this.cpu.adc(this.peek(majorStep));
      this.poke(major, this.cpu.a);
      this.setPixel();
    } while (this.dec(V.temp2) !== 0);
  }


  private setPixel(): void {
    this.ldy(this.peek(V.pixel_y));
    this.poke(ZP_MAIN.ptr1, this.lda(this.peek(TABLES.bmplineaddr_lo + this.cpu.y)));
    this.poke(ZP_MAIN.ptr1 + 1, this.lda(this.peek(TABLES.bmplineaddr_hi + this.cpu.y)));
    this.ldx(this.peek(V.pixel_x));
    this.ldy(this.peek(TABLES.bmpcol_byte + this.cpu.x));

    const address: number = this.pointer(ZP_MAIN.ptr1) + this.cpu.y;

    this.poke(address, this.lda(this.peek(TABLES.bmpcol_bit + this.cpu.x) | this.peek(address)));
  }


  // --- monsters and items (DNGD.s:1026-1282) -----------------------------------------------------

  /** draw_items_monsters: the nearest monster or item on the party's square or ahead, unless something hides it; the view cleared without light. */
  public drawItemsMonsters(): Exit {
    if (this.lda(this.peek(PRTY.light_duration)) === 0) {
      this.clearView();
    } else {
      let done: boolean = false;
      let distance: number = 0;

      this.poke(V.render_distance, this.lda(0x00));
      while (!done && (distance < DISTANCES)) {
        const tile: number = (distance === 0) ? ZP_MAIN.tile_under_player : AHEAD[distance - 1];

        if (distance > 0) {
          this.inc(V.render_distance);
        }
        if (this.lda(this.peek(tile)) === 0) {
          done = distance === DISTANCES - 1;
        } else {
          done = true;
          this.getMonsterType();
          if (!this.zero()) {
            this.getMonsterSprite();
            this.drawSprite(distance);
          } else {
            this.lda(this.peek(tile));

            const sprite: number | null = this.getItemSprite(ITEM_SITES[distance]);

            if (sprite != null) {
              done = this.itemSeen(distance, tile);
            }
          }
        }
        distance++;
      }
    }

    return null;
  }


  /** After get_item_sprite: the item drawn, or the next square looked at past an empty or see-through one; true if the looking is done. */
  private itemSeen(distance: number, tile: number): boolean {
    let done: boolean = true;

    if (distance === 0) {
      if (this.zero()) {
        done = false;
      } else if (this.negative()) {
        this.lda(this.peek(tile));
        this.cmp(D.dng_tile_room);
        done = this.carry();
      } else {
        this.drawSprite(distance);
      }
    } else if (!this.negative()) {
      if (this.zero()) {
        done = distance === DISTANCES - 1;
      } else {
        this.drawSprite(distance);
      }
    }

    return done;
  }


  private getMonsterSprite(): void {
    this.cpu.a = this.cpu.asl(this.cpu.asl(this.cpu.a));
    this.poke(V.temp1, this.add(TILES.tile_monster_dungeon - 4));
    this.getrand();
    this.lda(this.cpu.a & 0x03);
    this.lda(this.cpu.a | this.peek(V.temp1));
  }


  /** get_item_sprite: the sprite of the item on the tile in A, 0 for none, $FF for what hides what is beyond; null after a field, which pulls its caller's return as the original does. */
  private getItemSprite(site: number): number | null {
    let sprite: number | null = null;

    this.cpu.pushWord(site + 2);
    this.poke(V.temp2, this.cpu.a);
    this.lda(this.cpu.a & D.dng_tile_type_mask);
    if (this.cmpAny([ D.dng_tile_chest ])) {
      sprite = this.lda(TILES.tile_chest);
    } else if (this.cmpAny([ D.dng_tile_orb ])) {
      sprite = this.lda(TILES.tile_attack_blue);
    } else if (this.cmpAny([ D.dng_tile_trap ])) {
      this.trap();
      sprite = this.lda(0x00);
    } else if (this.cmpAny([ D.dng_tile_fountain ])) {
      sprite = this.lda(FOUNTAIN_SPRITE);
    } else if (this.cmpAny([ D.dng_tile_field ])) {
      this.lda(this.peek(V.temp2));
      this.renderField();
      this.cpu.pull();
      this.lda(this.cpu.pull());
    } else if (this.cmpAny([ D.dng_tile_altar ])) {
      sprite = this.lda(ALTAR_SPRITE);
    } else {
      this.cmp(D.dng_tile_door);
      sprite = this.lda(this.carry() ? 0xFF : 0x00);
    }
    if (sprite != null) {
      this.cpu.pullWord();
    }

    return sprite;
  }


  /** A trap now and then shows: a hole in the ceiling for one below 8, a pit for the rest, but none at 0. */
  private trap(): void {
    this.randOneIn64();
    if (!this.negative()) {
      this.lda(this.peek(V.temp2) & 0x0F);
      if (!this.zero()) {
        this.cmp(0x08);
        if (this.carry()) {
          this.renderFloorHole();
        } else {
          this.renderCeilingHole();
        }
      }
    }
  }


  /** `cmp` A with `values` in turn: true (Z) if it equals one. */
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


  private randOneIn64(): void {
    this.getrand();
    this.lda(this.cpu.a & 0x3F);
    if (!this.zero()) {
      this.lda(0xFF);
    }
  }


  /** get_monster_type: the monster's number on the tile in A, 0 on a trap, fountain, field, room or anything above. */
  private getMonsterType(): void {
    this.poke(V.temp2, this.cpu.a);
    this.lda(this.cpu.a & D.dng_tile_type_mask);
    if (this.cmpAny([ D.dng_tile_trap, D.dng_tile_fountain, D.dng_tile_field ])) {
      this.lda(0x00);
    } else {
      this.cmp(D.dng_tile_room);
      if (this.carry()) {
        this.lda(0x00);
      } else {
        this.lda(this.peek(V.temp2) & D.dng_tile_foe_mask);
      }
    }
  }


  /** render_field: the field's kind from the tile in A, and the view at this distance filled with its colour at random, row by row from the bottom. */
  private renderField(): void {
    this.poke(V.column_draw_mode, this.lda(this.cpu.a & 0x0F));
    this.ldx(this.peek(V.render_distance));
    this.poke(V.draw_y1, this.lda(this.peek(T.field_y1 + this.cpu.x)));
    this.poke(V.draw_y2, this.lda(this.peek(T.field_y2 + this.cpu.x)));
    this.poke(V.draw_x1, this.lda(this.peek(T.field_x1 + this.cpu.x)));
    this.poke(V.draw_x2, this.lda(this.peek(T.field_x2 + this.cpu.x)));
    do {
      this.ldx(this.peek(V.draw_y2));
      this.poke(ZP_MAIN.ptr1, this.lda(this.peek(TABLES.bmplineaddr_lo + this.cpu.x)));
      this.poke(ZP_MAIN.ptr1 + 1, this.lda(this.peek(TABLES.bmplineaddr_hi + this.cpu.x)));
      this.ldy(this.peek(V.draw_x2));
      do {
        this.randFieldByte();
        this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.cpu.a);
        this.dey();
        this.cpu.compare(this.cpu.y, this.peek(V.draw_x1));
      } while (this.carry());
      this.dec(V.draw_y2);
      this.lda(this.peek(V.draw_y2));
      this.cmp(this.peek(V.draw_y1));
    } while (this.carry());
  }


  /** A byte of the field's colour at random, shifted to the column's parity; poison's and sleep's in the first palette, the others in the second. */
  private randFieldByte(): void {
    this.getrand();
    this.ldx(this.peek(V.column_draw_mode));
    this.lda(this.cpu.a & this.peek(T.field_color_mask + this.cpu.x));
    this.ldx(this.cpu.a);
    this.lda(this.cpu.y);
    this.cpu.a = this.cpu.lsr(this.cpu.a);
    this.lda(this.cpu.x);
    if (!this.carry()) {
      this.cpu.a = this.cpu.lsr(this.cpu.a);
    }
    this.lda(this.cpu.a & 0x7F);
    this.ldx(this.peek(V.column_draw_mode));
    this.cpu.compare(this.cpu.x, 0x00);
    if (!this.zero()) {
      this.cpu.compare(this.cpu.x, 0x03);
      if (!this.zero()) {
        this.lda(this.cpu.a | 0x80);
      }
    }
  }


  /** getrand: DNGD's own generator, three bytes in its image, taking in the carry as it finds it. */
  private getrand(): void {
    const R: number = V.rand_data;

    this.lda(this.peek(R));
    this.cpu.adc(this.peek(R + 2));
    this.poke(R + 2, this.cpu.a);
    this.lda(this.cpu.a ^ this.peek(R + 1));
    this.poke(R + 1, this.cpu.a);
    this.cpu.adc(this.peek(R));
    this.poke(R, this.cpu.a);
  }


  // --- sprites (DNGD.s:1283-1570) ----------------------------------------------------------------

  private drawSprite(distance: number): void {
    if (distance >= 2) {
      this.drawSpriteFar(SPRITE_OPERANDS[distance], distance === 3 ? 2 : 1);
    } else {
      this.drawSpriteNear(SPRITE_OPERANDS[distance], distance === 0 ? 0x70 : 0x68, distance === 0 ? 0x04 : 0x02);
    }
  }


  /** draw_sprite_3 and _2: tile A's two bytes a line from the tile map's two banks, every `skip`th line of its sixteen, from line $60. */
  private drawSpriteFar(operands: ISpriteOperands, skip: number): void {
    this.ldy(this.cpu.a);
    this.poke(V.sprite_line, this.lda(0x60));
    this.setSourcePage(operands, this.lda(TABLES.tilemap >> 8));
    do {
      this.ldx(this.peek(V.sprite_line));
      this.setDestinations(operands);
      this.ldx(0x0B);
      for (let bank: number = 0; bank < 2; bank++) {
        this.cpu.bit(this.peek(bank === 0 ? APPLE.hw_LCBANK1 : APPLE.hw_LCBANK2));
        this.lda(this.peek(this.patchedWord(operands.sources[bank]) + this.cpu.y));
        this.poke(this.patchedWord(operands.destinations[bank]) + this.cpu.x, this.cpu.a);
        if (bank === 0) {
          this.inx();
        }
      }
      this.inc(V.sprite_line);
      for (const source of operands.sources) {
        for (let times: number = 0; times < skip; times++) {
          this.inc(source + 1);
        }
      }
      this.lda(this.peek(operands.sources[0] + 1));
      this.cmp(TILEMAP_END_PAGE);
    } while (!this.carry());
  }


  /** draw_sprite_1 and _0: tile A doubled in width, each of its lines drawn `lines` times, from line `first`. */
  private drawSpriteNear(operands: ISpriteOperands, first: number, lines: number): void {
    this.ldy(this.cpu.a);
    this.poke(V.sprite_line, this.lda(first));
    this.setSourcePage(operands, this.lda(TABLES.tilemap >> 8));
    this.poke(V.temp2, this.lda(lines));
    do {
      this.cpu.bit(this.peek(APPLE.hw_LCBANK1));
      this.poke(V.sprite1x_byte1, this.lda(this.peek(this.patchedWord(operands.sources[0]) + this.cpu.y)));
      this.poke(V.sprite_palette, this.lda(this.cpu.a & 0x80));
      this.cpu.bit(this.peek(APPLE.hw_LCBANK2));
      this.poke(V.sprite1x_byte2, this.lda(this.peek(this.patchedWord(operands.sources[1]) + this.cpu.y)));
      this.doubleSpriteWidth();
      do {
        this.ldx(this.peek(V.sprite_line));
        this.setDestinations(operands);
        this.ldx(0x0A);
        operands.destinations.forEach((destination: number, index: number): void => {
          if (index > 0) {
            this.inx();
          }
          this.lda(this.peek(V.sprite2x_byte0 + index));
          this.poke(this.patchedWord(destination) + this.cpu.x, this.cpu.a);
        });
        this.inc(V.sprite_line);
      } while (this.dec(V.temp2) !== 0);
      this.poke(V.temp2, this.lda(lines));
      this.inc(operands.sources[0] + 1);
      this.inc(operands.sources[1] + 1);
      this.lda(this.peek(operands.sources[0] + 1));
      this.cmp(TILEMAP_END_PAGE);
    } while (!this.carry());
  }


  private setSourcePage(operands: ISpriteOperands, page: number): void {
    for (const source of operands.sources) {
      this.poke(source + 1, page);
    }
  }


  /** Each `sta TMP_ADDR,x` pointed at the line X of the screen, its low bytes and then its high. */
  private setDestinations(operands: ISpriteOperands): void {
    this.lda(this.peek(TABLES.bmplineaddr_lo + this.cpu.x));
    for (const destination of operands.destinations) {
      this.poke(destination, this.cpu.a);
    }
    this.lda(this.peek(TABLES.bmplineaddr_hi + this.cpu.x));
    for (const destination of operands.destinations) {
      this.poke(destination + 1, this.cpu.a);
    }
  }


  /** double_sprite_width: the tile's fourteen pixels a line into twenty-eight, each pair chosen by it and its neighbours. */
  private doubleSpriteWidth(): void {
    this.poke(V.sprite1x_byte1, this.cpu.asl(this.peek(V.sprite1x_byte1)));
    this.poke(V.sprite1x_byte1, this.cpu.asl(this.peek(V.sprite1x_byte1)));
    this.poke(V.sprite1x_byte2, this.cpu.rol(this.peek(V.sprite1x_byte2)));
    this.lda(0x00);
    for (let byte: number = V.sprite1x_byteW; byte <= V.sprite2x_byte3; byte++) {
      if ((byte === V.sprite1x_byteW) || (byte >= V.sprite2x_byte0)) {
        this.poke(byte, this.cpu.a);
      }
    }
    this.inputBit();
    this.inputBit();
    this.poke(V.bit_count, this.lda(0x0E));
    do {
      this.inputBit();
      this.lda(this.peek(V.sprite1x_byteW) & 0x1F);
      this.ldx(this.cpu.a);
      this.lda(this.peek(T.window_table + this.cpu.x));
      this.cpu.push(this.cpu.a);
      this.outputBit();
      this.lda(this.cpu.pull());
      this.cpu.a = this.cpu.lsr(this.cpu.a);
      this.outputBit();
    } while (this.dec(V.bit_count) !== 0);
    for (let byte: number = V.sprite2x_byte0; byte <= V.sprite2x_byte3; byte++) {
      this.lda(this.peek(byte) & 0x7F);
      this.poke(byte, this.lda(this.cpu.a | this.peek(V.sprite_palette)));
    }
  }


  private inputBit(): void {
    this.poke(V.sprite1x_byte1, this.cpu.asl(this.peek(V.sprite1x_byte1)));
    this.poke(V.sprite1x_byte2, this.cpu.rol(this.peek(V.sprite1x_byte2)));
    this.poke(V.sprite1x_byteW, this.cpu.rol(this.peek(V.sprite1x_byteW)));
  }


  /** output_bit: bit 0 or 1 of A, by bit_count's parity, shifted in through the four 7-bit bytes. */
  private outputBit(): void {
    this.ldx(this.cpu.a);
    this.lda(this.peek(V.bit_count));
    this.cpu.a = this.cpu.lsr(this.cpu.a);
    this.lda(this.cpu.x);
    if (!this.carry()) {
      this.cpu.a = this.cpu.lsr(this.cpu.a);
    }
    this.cpu.a = this.cpu.lsr(this.cpu.a);
    for (let byte: number = V.sprite2x_byte0; byte <= V.sprite2x_byte3; byte++) {
      this.poke(byte, this.cpu.rol(this.peek(byte)));
      if (byte < V.sprite2x_byte3) {
        this.setCarry(this.negative());
      }
    }
  }
}


export const UNDERWORLD_DNGD_MODULE = overlayModule('underworld', 'DNGD', DNGD_ENTRIES.dungeon_check_update, DNGD_DATA,
  (machine: LiftedMachine): UnderworldDngd => new UnderworldDngd(machine),
  (program: UnderworldDngd): Exit => program.checkUpdate(),
  [
    [ DNGD_ENTRIES.draw_items_monsters, (program: UnderworldDngd): Exit => program.drawItemsMonsters() ],
    [ DNGD_ENTRIES.dungeon_redraw, (program: UnderworldDngd): Exit => program.redraw() ],
  ]);
