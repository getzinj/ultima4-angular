// ULT4.s, ported in part: the turn loop, the commands that end a turn, and moving round Britannia
// on foot, on horseback, by ship and by balloon. The rest of ULT4 is still lifted, and lifted
// code jumps into these routines and calls them, so each leaves the registers and flags as the
// original does, and its own JSRs push their return addresses as the 6502's would.
//
// An entry returns where control goes next: null for its RTS, or the address of a JMP. A routine
// that drops its caller's return address (`pla` / `pla`) pulls it itself before jumping.

import { DECIMAL } from '../../lifted-runtime/cpu';
import {
  APPLE, CHAR, DISKS, DUNGEON, JUMP_OVERLAY, JUMP_SUBS, JUMP_SYSTEM, JUMP_TRAINERS, MAP_OBJECTS, MUSIC, PLACES, PRTY, ROST, SOUND, TILES, TRAINERS, VIEW_MAP, ZP_MAIN,
} from '../../state/symbols';
import type { IInlineData } from '../inline-data';
import { PortProgram } from '../port-program';
import type { Exit } from '../routine';
import { ULT4_ENTRIES, ULT4_INLINE, ULT4_LIFTED, ULT4_TABLES, ULT4_VARIABLES } from './ult4-data';
import { COMMAND_ENTRIES } from './ult4-commands-data';

const CE = COMMAND_ENTRIES;
const E = ULT4_ENTRIES;
const L = ULT4_LIFTED;
const I = ULT4_INLINE;
const T = ULT4_TABLES;
const V = ULT4_VARIABLES;
const J = JUMP_SUBS;
/** ULT4.s's own uses of zero page. */
const ZP_INDEX2: number = 0xEA;
const ZP_SAVE_REG1: number = 0xD8;
const zp_inc_amount: number = 0xD9;
const zp_dec_amount: number = 0xDA;
const zp_save_reg2: number = 0xD9;
const BCD_MAX: number = 0x63;
const ZP_TRANSPORT: number = 0xD8;
const ANIMATION_MASK: number = 0xFC;
const CHANCE_4: number = 0x03;
const CHANCE_8: number = 0x07;
const PIRATE_FLEET_COUNT: number = 8;
/** The low bytes of SUBS's four moves, which try_walk's JSR is patched with. */
const MOVE_NORTH: number = J.j_move_north & 0xFF;
const MOVE_SOUTH: number = J.j_move_south & 0xFF;
const MOVE_WEST: number = J.j_move_west & 0xFF;
const MOVE_EAST: number = J.j_move_east & 0xFF;


/** How a direction differs: its tile, its ship and horse facings, its move and its printer. */
interface IDirection {
  readonly tile: number;
  readonly ship: number;
  readonly move: number;
  readonly wind: number;
  readonly print: () => Promise<Exit>;
}


export abstract class Ult4 extends PortProgram {
  /** The wandering monsters' routines, which Ult4Monsters ports; mobs_act may drop its return for a fight. */
  public abstract checkWaterHazards(): Promise<Exit>;
  public abstract spawnMonsters(): Promise<Exit>;
  public abstract mobsAct(): Promise<Exit>;
  /** Ult4Commands's tile_effect, which drops the turn's return for the bridge trolls' fight. */
  public abstract tileEffect(): Promise<Exit>;


  // --- calls and jumps ----------------------------------------------------------------------

  /** A JSR from `site` to a routine of ULT4's own, which may drop this return address and jump. */
  protected async sub(site: number, body: () => Promise<Exit>): Promise<Exit> {
    this.cpu.pushWord(site + 2);
    const exit: Exit = await body();

    if (exit == null) {
      this.cpu.pullWord();
    }

    return exit;
  }


  /** `pla` / `pla`: the caller's return address dropped, its high byte left in A. */
  protected dropReturn(): void {
    this.cpu.pull();
    this.lda(this.cpu.pull());
  }


  protected print(block: IInlineData): Promise<void> {
    return this.callWith(J.j_primm, block);
  }


  protected async playsfx(sound: number): Promise<void> {
    this.lda(sound);
    await this.m.call(J.j_playsfx);
  }


  protected async musicCtl(tune: number): Promise<void> {
    this.lda(tune);
    await this.m.call(JUMP_SYSTEM.music_ctl);
  }


  // --- starting (ULT4.s:118-198) --------------------------------------------------------------

  public async gameInit(): Promise<Exit> {
    await this.musicCtl(MUSIC.music_off);
    this.cpu.bit(this.peek(APPLE.hw_LCBANK1));
    this.cpu.bit(this.peek(APPLE.hw_LCBANK1));
    await this.m.call(J.j_drawinterface);
    this.poke(ZP_MAIN.console_ypos, this.lda(0x0D));
    this.poke(ZP_MAIN.console_xpos, this.lda(0x18));
    this.poke(PRTY.game_mode, this.lda(PRTY.mode_suspended));
    this.poke(ZP_MAIN.magic_aura, this.lda(ZP_MAIN.aura_none));
    this.lda(DISKS.disk_britannia);
    await this.m.call(J.j_request_disk);

    return (this.lda(this.peek(PRTY.party_size)) === 0) ? this.loadSavedGame() : E.game_start;
  }


  public async loadSavedGame(): Promise<Exit> {
    await this.callWith(J.j_primm_cout, I.bload_prty);
    let exit: Exit = E.load_saved_map;

    if (this.lda(this.peek(PRTY.party_size)) === 0) {
      await this.print(I.no_active_game);
      exit = E.halt;
    }

    return exit;
  }


  /** ULT4.s halt: no game to load, and nothing more to do. */
  public halt(): Exit {
    this.cpu.cycles = this.cpu.cycles + 3;

    return E.halt;
  }


  public async loadSavedMap(): Promise<Exit> {
    await this.callWith(J.j_primm_cout, I.bload_list_rost);

    return E.game_start;
  }


  public async gameStart(): Promise<Exit> {
    this.ldx(this.peek(PRTY.terrain_occlusion));
    if (this.inx() === 0) {
      this.ldx(this.peek(TRAINERS.trainer_balloon));
      this.dex();
    }
    this.poke(ZP_MAIN.balloon_movement, this.cpu.x);
    this.poke(ZP_MAIN.sfx_volume, this.lda(ZP_MAIN.volume_on));
    this.lda(this.peek(PRTY.game_mode));
    this.cmp(PRTY.mode_dungeon);
    let exit: Exit;

    if (this.zero()) {
      this.lda(0x00);
      this.poke(PRTY.game_mode, this.cpu.a);
      this.poke(ZP_MAIN.wind_direction, this.cpu.a);
      await this.m.call(CE.load_dungeon);
      exit = E.cmd_done;
    } else {
      this.lda(0x00);
      this.poke(PRTY.current_location, this.cpu.a);
      this.poke(PRTY.horse_mode, this.cpu.a);
      this.lda(0x01);
      this.poke(PRTY.game_mode, this.cpu.a);
      this.poke(ZP_MAIN.wind_direction, this.cpu.a);
      await this.m.call(J.j_update_status);
      await this.m.call(J.j_player_teleport);
      await this.musicCtl(MUSIC.music_Overworld);
      exit = E.next_turn;
    }

    return exit;
  }


  // --- the turn (ULT4.s:199-281) ----------------------------------------------------------

  /** ULT4.s next_turn: the view, what the tile does, and the prompt for a command. */
  public async nextTurn(): Promise<Exit> {
    await this.m.call(J.j_update_view);
    let exit: Exit = await this.sub(0x40C8, (): Promise<Exit> => this.tileEffect());

    if (exit == null) {
      await this.m.call(CE.anyone_awake);
      if (this.negative()) {
        exit = E.cmd_timeout;
      } else {
        await this.print(I.prompt);
        exit = await this.command();
      }
    }

    return exit;
  }


  private async command(): Promise<Exit> {
    let key: number;

    do {
      await this.m.call(J.j_waitkey);
      key = this.cpu.a;
      this.cmp(CHAR.char_none);
    } while (this.zero() && (this.lda(this.peek(TRAINERS.trainer_pass)) !== 0));
    this.lda(key);
    const keys: readonly [ number, number ][] = [
      [ CHAR.char_none, E.done_pass ],
      [ CHAR.char_space, E.done_pass ],
      [ CHAR.char_enter, E.cmd_direction_up ],
      [ CHAR.char_up_arrow, E.cmd_direction_up ],
      [ CHAR.char_down_arrow, E.cmd_direction_down ],
      [ CHAR.char_slash, E.cmd_direction_down ],
      [ CHAR.char_left_arrow, E.cmd_direction_left ],
      [ CHAR.char_right_arrow, E.cmd_direction_right ],
      [ CHAR.char_ctrl_V, CE.cmd_music ],
    ];
    let exit: Exit = null;

    for (const [ code, target ] of keys) {
      if (exit == null) {
        this.cmp(code);
        if (this.zero()) {
          exit = target;
        }
      }
    }
    if (exit == null) {
      this.cmp(CHAR.char_ctrl_S);
      exit = this.zero() ? await this.printVirtues() : this.checkCmdAlpha();
    }

    return exit;
  }


  /** Ctrl-S: the eight virtues' levels, for debugging. */
  private async printVirtues(): Promise<Exit> {
    await this.sub(0x4124, (): Promise<Exit> => this.printNewline());
    this.poke(ZP_INDEX2, this.lda(0x00));
    do {
      this.ldx(this.peek(ZP_INDEX2));
      this.lda(this.peek(ROST.party_stats + this.cpu.x));
      await this.m.call(J.j_printbcd);
      this.inc(ZP_INDEX2);
      this.lda(this.peek(ZP_INDEX2));
      this.cmp(ROST.virtue_last);
    } while (!this.carry());
    await this.sub(0x413B, (): Promise<Exit> => this.printNewline());

    return E.next_turn;
  }


  /** ULT4.s check_cmd_alpha: a letter runs its command from cmd_table, anything else is WHAT?. */
  public checkCmdAlpha(): Exit {
    let exit: Exit = E.done_what;

    this.cmp(CHAR.char_alpha_first);
    if (this.carry()) {
      this.cmp(CHAR.char_alpha_last);
      if (!this.carry()) {
        this.subtract(CHAR.char_alpha_first);
        this.cpu.a = this.cpu.asl(this.cpu.a);
        this.ldy(this.cpu.a);
        this.poke(ZP_MAIN.ptr1, this.lda(this.peek(T.cmd_table + this.cpu.y)));
        this.poke(ZP_MAIN.ptr1 + 1, this.lda(this.peek(T.cmd_table + 1 + this.cpu.y)));
        exit = this.pointer(ZP_MAIN.ptr1);
      }
    }

    return exit;
  }


  // --- the turn's messages (ULT4.s:282-382) -------------------------------------------------

  protected async message(block: IInlineData, exit: Exit): Promise<Exit> {
    await this.print(block);

    return exit;
  }


  public cmdTimeout(): Promise<Exit> {
    return this.message(I.zzzzz, E.cmd_done);
  }


  public donePass(): Promise<Exit> {
    return this.message(I.pass, E.cmd_done);
  }


  public async doneWhat(): Promise<Exit> {
    await this.print(I.what);

    return this.doneSoundDeny();
  }


  public async doneSoundDeny(): Promise<Exit> {
    await this.playsfx(SOUND.sound_what);

    return E.cmd_done;
  }


  public doneNotAPlayer(): Promise<Exit> {
    return this.message(I.not_a_player, E.cmd_done);
  }


  public async doneOnlyOnFoot(): Promise<Exit> {
    await this.print(I.only_on_foot);

    return E.done_sound_deny;
  }


  public doneNothingThere(): Promise<Exit> {
    return this.message(I.nothing_there, E.cmd_done);
  }


  /** Ends in an RTS: the moves call it. */
  public doneSlowProgress(): Promise<Exit> {
    return this.message(I.slow_progress, null);
  }


  public doneNotHere(): Promise<Exit> {
    return this.message(I.not_here, E.cmd_done);
  }


  public doneCant(): Promise<Exit> {
    return this.message(I.cant, E.cmd_done);
  }


  public doneAborted(): Promise<Exit> {
    return this.message(I.aborted, E.cmd_done);
  }


  public async doneDone(): Promise<Exit> {
    await this.m.call(J.j_update_status);

    return this.message(I.done, E.cmd_done);
  }


  public doneHaveNone(): Promise<Exit> {
    return this.message(I.have_none, E.cmd_done);
  }


  public doneDisabled(): Promise<Exit> {
    return this.message(I.disabled, E.cmd_done);
  }


  public async doneBlocked(): Promise<Exit> {
    await this.print(I.blocked);
    await this.playsfx(SOUND.sound_blocked);
    this.poke(ZP_MAIN.key_buf_len, this.lda(0x00));

    return E.cmd_done;
  }


  public doneDriftOnly(): Promise<Exit> {
    return this.message(I.drift_only, E.cmd_done);
  }


  // --- moving (ULT4.s:411-882) ------------------------------------------------------------

  private direction(name: 'north' | 'south' | 'west' | 'east'): IDirection {
    const directions: Record<typeof name, IDirection> = {
      north: { tile: ZP_MAIN.tile_north, ship: TILES.tile_ship_north, move: MOVE_NORTH, wind: ZP_MAIN.wind_dir_north, print: (): Promise<Exit> => this.printNorth() },
      south: { tile: ZP_MAIN.tile_south, ship: TILES.tile_ship_south, move: MOVE_SOUTH, wind: ZP_MAIN.wind_dir_south, print: (): Promise<Exit> => this.printSouth() },
      west: { tile: ZP_MAIN.tile_west, ship: TILES.tile_ship_west, move: MOVE_WEST, wind: ZP_MAIN.wind_dir_west, print: (): Promise<Exit> => this.printWest() },
      east: { tile: ZP_MAIN.tile_east, ship: TILES.tile_ship_east, move: MOVE_EAST, wind: ZP_MAIN.wind_dir_east, print: (): Promise<Exit> => this.printEast() },
    };

    return directions[name];
  }


  /** The ship turns to face `ship` unless it already does, in which case it sails. */
  private async isShip(ship: number, others: readonly number[]): Promise<'sail' | 'turn' | 'land'> {
    let kind: 'sail' | 'turn' | 'land' = 'land';

    this.cmp(ship);
    if (this.zero()) {
      kind = 'sail';
    } else {
      for (const other of others) {
        if (kind === 'land') {
          this.cmp(other);
          if (this.zero()) {
            kind = 'turn';
          }
        }
      }
    }

    return Promise.resolve(kind);
  }


  /** The balloon goes where it is steered only with the trainer; otherwise it drifts. */
  private async balloonMove(printSite: number, print: () => Promise<Exit>, move: number): Promise<Exit> {
    let exit: Exit = E.done_drift_only;

    if (this.lda(this.peek(ZP_MAIN.balloon_movement)) === 0) {
      await this.sub(printSite, print);
      await this.m.call(J.j_move_north - MOVE_NORTH + move);
      exit = E.cmd_done;
    }

    return exit;
  }


  /** @move_ship: past the coast, and against the wind only every fourth turn. */
  private async sail(sites: { print: number; dir: number; can: number; wind: number; slow: number }, direction: IDirection): Promise<Exit> {
    let exit: Exit;

    await this.sub(sites.print, (): Promise<Exit> => this.printSail());
    await this.sub(sites.dir, direction.print);
    this.lda(this.peek(direction.tile));
    await this.sub(sites.can, (): Promise<Exit> => this.canShipMoveHere());
    if (this.carry()) {
      exit = E.done_blocked;
    } else {
      this.lda(direction.wind);
      await this.sub(sites.wind, (): Promise<Exit> => this.isWindFavorable());
      if (!this.zero()) {
        await this.sub(sites.slow, (): Promise<Exit> => this.doneSlowProgress());
        exit = E.cmd_done;
      } else {
        await this.m.call(J.j_move_north - MOVE_NORTH + direction.move);
        exit = (direction.move === MOVE_EAST) ? this.checkAbyssCove() : E.cmd_done;
      }
    }

    return exit;
  }


  /** @move_on_land: a step, or two at a gallop, each through @try_move. */
  private async walk(printSite: number, print: () => Promise<Exit>, firstSite: number, secondSite: number, tryMove: () => Promise<Exit>): Promise<Exit> {
    await this.playsfx(SOUND.sound_footstep);
    await this.sub(printSite, print);
    let exit: Exit = null;

    if (this.lda(this.peek(PRTY.horse_mode)) !== 0) {
      exit = await this.sub(firstSite, tryMove);
      if (exit == null) {
        await this.m.call(J.j_update_view);
      }
    }
    if (exit == null) {
      exit = await this.sub(secondSite, tryMove);
    }

    return exit;
  }


  /** The common end of @try_move: try_walk to X, Y with the tile there and SUBS's move. */
  private tryWalkTo(direction: IDirection, dx: number, dy: number): Promise<Exit> {
    this.poke(V.try_walk_handler, this.lda(direction.move));
    this.lda(this.peek(direction.tile));
    this.ldx(this.peek(PRTY.player_xpos) + dx);
    this.ldy(this.peek(PRTY.player_ypos) + dy);

    return this.tryWalk();
  }


  /** @try_move for south, west and east: blocked tiles drop the caller's return and say BLOCKED. */
  private async tryStep(direction: IDirection, dx: number, dy: number): Promise<Exit> {
    this.lda(this.peek(direction.tile));
    await this.m.call(J.j_blocked_tile);
    let exit: Exit;

    if (this.negative()) {
      this.dropReturn();
      exit = E.done_blocked;
    } else {
      exit = await this.tryWalkTo(direction, dx, dy);
    }

    return exit;
  }


  /** cmd_direction_up's @try_move: the castle's centre tile lets Lord British's throne room through. */
  private async tryMoveNorth(): Promise<Exit> {
    const north: IDirection = this.direction('north');
    let denied: boolean;

    this.lda(this.peek(ZP_MAIN.tile_under_player));
    this.cmp(TILES.tile_castle_center);
    if (this.zero()) {
      denied = true;
    } else {
      this.lda(this.peek(ZP_MAIN.tile_north));
      this.cmp(TILES.tile_castle_center);
      if (this.zero()) {
        denied = false;
      } else {
        await this.m.call(J.j_blocked_tile);
        denied = this.negative();
      }
    }
    let exit: Exit;

    if (denied) {
      this.dropReturn();
      exit = E.done_blocked;
    } else {
      exit = await this.tryWalkTo(north, 0, -1);
    }

    return exit;
  }


  public async cmdDirectionUp(): Promise<Exit> {
    const north: IDirection = this.direction('north');
    let exit: Exit;

    this.lda(this.peek(PRTY.game_mode));
    this.cmp(PRTY.mode_dungeon);
    if (this.zero()) {
      exit = await this.dngTryAdvance();
    } else {
      this.lda(this.peek(PRTY.player_transport));
      this.cmp(TILES.tile_balloon);
      if (this.zero()) {
        exit = await this.balloonMove(0x42B5, north.print, MOVE_NORTH);
      } else {
        const kind: 'sail' | 'turn' | 'land' = await this.isShip(TILES.tile_ship_north, [ TILES.tile_ship_west, TILES.tile_ship_east, TILES.tile_ship_south ]);

        if (kind === 'sail') {
          exit = await this.sail({ print: 0x42F9, dir: 0x42FC, can: 0x4301, wind: 0x430B, slow: 0x4310 }, north);
        } else if (kind === 'turn') {
          exit = await this.turnShip(TILES.tile_ship_north, 0x42F0, 0x42F3, north.print, true);
        } else {
          exit = await this.walk(0x42D9, north.print, 0x42E0, 0x42E6, (): Promise<Exit> => this.tryMoveNorth());
          exit = exit ?? E.cmd_done;
        }
      }
    }

    return exit;
  }


  /** @set_ship_facing: the ship turns, and says so. East sets its facing after printing. */
  private async turnShip(ship: number, turnSite: number, printSite: number, print: () => Promise<Exit>, first: boolean): Promise<Exit> {
    if (first) {
      this.poke(PRTY.player_transport, this.lda(ship));
    }
    await this.sub(turnSite, (): Promise<Exit> => this.printTurn());
    await this.sub(printSite, print);
    if (!first) {
      this.poke(PRTY.player_transport, this.lda(ship));
    }

    return E.cmd_done;
  }


  private async dngTryAdvance(): Promise<Exit> {
    await this.print(I.advance);
    this.lda(this.peek(ZP_MAIN.tile_north));
    await this.m.call(L.dng_can_advance);
    let exit: Exit = E.done_blocked;

    if (!this.negative()) {
      this.ldx(this.peek(PRTY.dng_direction));
      exit = this.dngMove();
    }

    return exit;
  }


  /** ULT4.s dng_move: a step in the dungeon in direction X, wrapping round the level. */
  public dngMove(): Exit {
    this.setCarry(false);
    this.lda(this.peek(PRTY.player_xpos));
    this.cpu.adc(this.peek(T.dng_dir_delta_x + this.cpu.x));
    this.poke(PRTY.player_xpos, this.lda(this.cpu.a & MAP_OBJECTS.xy_max_dungeon));
    this.setCarry(false);
    this.lda(this.peek(PRTY.player_ypos));
    this.cpu.adc(this.peek(T.dng_dir_delta_y + this.cpu.x));
    this.poke(PRTY.player_ypos, this.lda(this.cpu.a & MAP_OBJECTS.xy_max_dungeon));

    return E.cmd_done;
  }


  public async cmdDirectionDown(): Promise<Exit> {
    const south: IDirection = this.direction('south');
    let exit: Exit;

    this.lda(this.peek(PRTY.game_mode));
    this.cmp(PRTY.mode_dungeon);
    if (this.zero()) {
      await this.print(I.retreat);
      this.lda(this.peek(ZP_MAIN.tile_west));
      await this.m.call(L.dng_can_retreat);
      if (this.negative()) {
        exit = E.done_blocked;
      } else {
        this.ldx(this.lda(this.peek(PRTY.dng_direction) ^ 0x02));
        exit = this.dngMove();
      }
    } else {
      this.lda(this.peek(PRTY.player_transport));
      this.cmp(TILES.tile_balloon);
      if (this.zero()) {
        exit = await this.balloonMove(0x43A6, south.print, MOVE_SOUTH);
      } else {
        const kind: 'sail' | 'turn' | 'land' = await this.isShip(TILES.tile_ship_south, [ TILES.tile_ship_east, TILES.tile_ship_west, TILES.tile_ship_north ]);

        if (kind === 'sail') {
          exit = await this.sail({ print: 0x4401, dir: 0x4404, can: 0x4409, wind: 0x4413, slow: 0x4418 }, south);
        } else if (kind === 'turn') {
          exit = await this.turnShip(TILES.tile_ship_south, 0x43F8, 0x43FB, south.print, true);
        } else {
          exit = await this.walk(0x43CA, south.print, 0x43D1, 0x43D7, (): Promise<Exit> => this.tryStep(south, 0, 1));
          exit = exit ?? this.checkShrineHumility();
        }
      }
    }

    return exit;
  }


  /** Walking south into the Abyss's shrine raises its daemon guard. */
  private checkShrineHumility(): Exit {
    const inside: boolean = this.within(PRTY.player_xpos, PLACES.xpos_abyss_shrine_min, PLACES.xpos_abyss_shrine_max)
      && this.within(PRTY.player_ypos, PLACES.ypos_abyss_shrine_min, PLACES.ypos_abyss_shrine_max);

    return inside ? E.spawn_daemon_guard : E.cmd_done;
  }


  /** `lda` / `cmp #min` / `bcc` / `cmp #max` / `bcs`: min <= the value < max. */
  private within(address: number, min: number, max: number): boolean {
    let inside: boolean = false;

    this.lda(this.peek(address));
    this.cmp(min);
    if (this.carry()) {
      this.cmp(max);
      inside = !this.carry();
    }

    return inside;
  }


  public async cmdDirectionLeft(): Promise<Exit> {
    return this.sideways('west', TILES.tile_horse_east, TILES.tile_horse_west, {
      dngTurn: 0x4445, dngSign: -1, dngText: I.left, balloon: 0x446D, sail: { print: 0x44B9, dir: 0x44BC, can: 0x44C1, wind: 0x44CB, slow: 0x44D0 },
      turn: [ 0x44B0, 0x44B3 ], walk: [ 0x4499, 0x44A0, 0x44A6 ], others: [ TILES.tile_ship_north, TILES.tile_ship_south, TILES.tile_ship_east ], dx: -1, first: true,
    });
  }


  public async cmdDirectionRight(): Promise<Exit> {
    return this.sideways('east', TILES.tile_horse_west, TILES.tile_horse_east, {
      dngTurn: 0x44FD, dngSign: 1, dngText: I.right, balloon: 0x4526, sail: { print: 0x4572, dir: 0x4575, can: 0x457A, wind: 0x4584, slow: 0x4589 },
      turn: [ 0x4565, 0x4568 ], walk: [ 0x4552, 0x4559, 0x455F ], others: [ TILES.tile_ship_north, TILES.tile_ship_south, TILES.tile_ship_west ], dx: 1, first: false,
    });
  }


  /** cmd_direction_left and _right: turning in the dungeon, and moving or turning the horse as they go. */
  private async sideways(
    name: 'west' | 'east',
    facingAway: number,
    facing: number,
    sites: {
      dngTurn: number; dngSign: number; dngText: IInlineData; balloon: number; sail: { print: number; dir: number; can: number; wind: number; slow: number };
      turn: readonly number[]; walk: readonly number[]; others: readonly number[]; dx: number; first: boolean;
    },
  ): Promise<Exit> {
    const direction: IDirection = this.direction(name);
    let exit: Exit;

    this.lda(this.peek(PRTY.game_mode));
    this.cmp(PRTY.mode_dungeon);
    if (this.zero()) {
      await this.sub(sites.dngTurn, (): Promise<Exit> => this.printTurn());
      await this.print(sites.dngText);
      if (sites.dngSign < 0) {
        this.setCarry(true);
        this.lda(this.peek(PRTY.dng_direction));
        this.cpu.sbc(0x01);
      } else {
        this.setCarry(false);
        this.lda(this.peek(PRTY.dng_direction));
        this.cpu.adc(0x01);
      }
      this.poke(PRTY.dng_direction, this.lda(this.cpu.a & 0x03));
      await this.m.call(JUMP_OVERLAY.j_dng_check_update);
      await this.m.call(J.j_print_direction);
      exit = E.next_turn;
    } else {
      this.lda(this.peek(PRTY.player_transport));
      this.cmp(TILES.tile_balloon);
      if (this.zero()) {
        exit = await this.balloonMove(sites.balloon, direction.print, direction.move);
      } else {
        const kind: 'sail' | 'turn' | 'land' = await this.isShip(direction.ship, sites.others);

        if (kind === 'sail') {
          exit = await this.sail(sites.sail, direction);
        } else if (kind === 'turn') {
          exit = await this.turnShip(direction.ship, sites.turn[0], sites.turn[1], direction.print, sites.first);
        } else {
          this.cmp(facingAway);
          if (this.zero()) {
            this.poke(PRTY.player_transport, this.lda(facing));
          }
          exit = await this.walk(sites.walk[0], direction.print, sites.walk[1], sites.walk[2], (): Promise<Exit> => this.tryStep(direction, sites.dx, 0));
          exit = exit ?? E.cmd_done;
        }
      }
    }

    return exit;
  }


  /** Sailing east into the mouth of the Abyss's cove brings out the pirate fleet. */
  private checkAbyssCove(): Exit {
    let exit: Exit = E.cmd_done;

    this.lda(this.peek(PRTY.player_xpos));
    this.cmp(PLACES.xpos_abyss_cove_mouth);
    if (this.zero()) {
      this.lda(this.peek(PRTY.player_ypos));
      this.cmp(PLACES.ypos_abyss_cove_mouth);
      if (this.zero()) {
        exit = E.spawn_pirate_fleet;
      }
    }

    return exit;
  }


  /**
   * ULT4.s try_walk: the step to X, Y onto tile A, unless the terrain slows it. In Britannia SUBS
   * moves the party and a moongate may take it; in a towne, the edge leaves for Britannia.
   */
  public async tryWalk(): Promise<Exit> {
    this.poke(ZP_SAVE_REG1, this.cpu.a);
    this.poke(V.try_walk_x, this.cpu.x);
    this.poke(V.try_walk_y, this.cpu.y);
    await this.sub(0x45C4, (): Promise<Exit> => this.checkSlowTerrain());
    let exit: Exit;

    if (this.zero()) {
      exit = await this.doneSlowProgress();
    } else {
      await this.playsfx(SOUND.sound_footstep);
      this.lda(this.peek(PRTY.game_mode));
      this.cmp(PRTY.mode_world);
      if (this.zero()) {
        await this.m.call(this.patchedWord(V.try_walk_handler));
        this.lda(this.peek(ZP_SAVE_REG1));
        exit = await this.checkEnterMoongate();
      } else {
        exit = await this.tryWalkTowne();
      }
    }

    return exit;
  }


  public async tryWalkTowne(): Promise<Exit> {
    let exit: Exit;

    this.lda(this.peek(V.try_walk_x));
    this.cmp(MAP_OBJECTS.xy_last_towne);
    if (this.carry()) {
      exit = await this.tryWalkExit();
    } else {
      this.lda(this.peek(V.try_walk_y));
      this.cmp(MAP_OBJECTS.xy_last_towne);
      if (this.carry()) {
        exit = await this.tryWalkExit();
      } else {
        this.poke(PRTY.player_ypos, this.cpu.a);
        this.poke(PRTY.player_xpos, this.lda(this.peek(V.try_walk_x)));
        exit = null;
      }
    }

    return exit;
  }


  /** Off the edge of a towne: Britannia, after the trainer's question if it is on. */
  public async tryWalkExit(): Promise<Exit> {
    let leave: boolean = true;

    if (this.lda(this.peek(TRAINERS.trainer_exit)) !== 0) {
      await this.print(I.exit);
      await this.sub(0x4602, (): Promise<Exit> => this.inputChar());
      this.cmp(CHAR.char_Y);
      leave = this.zero();
      if (!leave) {
        this.setCarry(true);
      }
    }
    let exit: Exit = null;

    if (leave) {
      this.dropReturn();
      exit = E.leave_to_world;
    }

    return exit;
  }


  public printTurn(): Promise<Exit> {
    return this.message(I.turn, null);
  }


  public printSail(): Promise<Exit> {
    return this.message(I.sail, null);
  }


  /** Sailing into the Abyss's cove brings out the pirate fleet. */
  public spawnPirateFleet(): Exit {
    this.ldy(PIRATE_FLEET_COUNT - 1);
    do {
      this.poke(MAP_OBJECTS.object_xpos + this.cpu.y, this.lda(this.peek(T.pirate_fleet_x + this.cpu.y)));
      this.poke(MAP_OBJECTS.object_ypos + this.cpu.y, this.lda(this.peek(T.pirate_fleet_y + this.cpu.y)));
      this.poke(MAP_OBJECTS.object_tile_type + this.cpu.y, this.lda(TILES.tile_pirate));
      this.poke(MAP_OBJECTS.object_tile_sprite + this.cpu.y, this.lda(this.peek(T.pirate_fleet_sprite + this.cpu.y)));
      this.dey();
    } while (!this.negative());

    return E.cmd_done;
  }


  /** The daemons guarding the Abyss's shrine, unless the horn was blown. */
  public spawnDaemonGuard(): Exit {
    this.lda(this.peek(ZP_MAIN.magic_aura));
    this.cmp(ZP_MAIN.aura_horn);
    if (!this.zero()) {
      this.ldy(0x07);
      do {
        this.lda(TILES.tile_daemon);
        this.poke(MAP_OBJECTS.object_tile_type + this.cpu.y, this.cpu.a);
        this.poke(MAP_OBJECTS.object_tile_sprite + this.cpu.y, this.cpu.a);
        this.poke(MAP_OBJECTS.object_xpos + this.cpu.y, this.lda(0xE7));
        this.lda(this.peek(PRTY.player_ypos));
        this.poke(MAP_OBJECTS.object_ypos + this.cpu.y, this.add(0x01));
        this.dey();
      } while (!this.negative());
    }

    return E.cmd_done;
  }


  /** Out of a towne or dungeon onto Britannia where the party went in, with a balloon by Hythloth. */
  public async leaveToWorld(): Promise<Exit> {
    await this.musicCtl(MUSIC.music_off);
    await this.print(I.leaving);
    this.cpu.bit(await this.m.clearKeyboardStrobe());
    this.poke(PRTY.game_mode, this.lda(PRTY.mode_suspended));
    this.lda(DISKS.disk_britannia);
    await this.m.call(J.j_request_disk);
    await this.callWith(J.j_primm_cout, I.bload_tlst);
    this.poke(PRTY.player_xpos, this.lda(this.peek(PRTY.britannia_x)));
    this.poke(PRTY.player_ypos, this.lda(this.peek(PRTY.britannia_y)));
    await this.m.call(J.j_player_teleport);
    this.poke(PRTY.game_mode, this.lda(PRTY.mode_world));
    this.poke(PRTY.current_location, this.lda(PRTY.loc_world));
    this.lda(this.peek(PRTY.player_xpos));
    this.cmp(PLACES.xpos_hythloth);
    if (this.zero()) {
      this.lda(this.peek(PRTY.player_ypos));
      this.cmp(PLACES.ypos_hythloth);
      if (this.zero()) {
        this.lda(TILES.tile_balloon);
        this.poke(MAP_OBJECTS.object_tile_type + MAP_OBJECTS.object_max, this.cpu.a);
        this.poke(MAP_OBJECTS.object_tile_sprite + MAP_OBJECTS.object_max, this.cpu.a);
        this.poke(MAP_OBJECTS.object_xpos + MAP_OBJECTS.object_max, this.lda(PLACES.xpos_balloon_spawn));
        this.poke(MAP_OBJECTS.object_ypos + MAP_OBJECTS.object_max, this.lda(PLACES.ypos_balloon_spawn));
      }
    }
    await this.m.call(J.j_update_britannia);
    await this.musicCtl(MUSIC.music_Overworld);
    this.poke(ZP_MAIN.key_buf_len, this.lda(0x00));

    return E.cmd_done;
  }


  /** ULT4.s check_slow_terrain: Z set when the tile in A slows this step, by its chance. */
  public async checkSlowTerrain(): Promise<Exit> {
    let found: boolean = false;

    this.ldy(0x04);
    while (!found && !this.negative()) {
      this.cmp(this.peek(T.slow_tile_type + this.cpu.y));
      if (this.zero()) {
        found = true;
        await this.m.call(J.j_rand);
        this.lda(this.cpu.a & this.peek(T.slow_chance + this.cpu.y));
      } else {
        this.dey();
      }
    }

    return null;
  }


  /** ULT4.s can_ship_move_here: C set when the tile in A is no water a ship can sail. */
  public canShipMoveHere(): Promise<Exit> {
    this.cmp(TILES.tile_whirlpool);
    if (this.carry()) {
      this.cmp(TILES.tile_monster_land);
    } else {
      this.cmp(TILES.tile_water_shallow);
    }

    return Promise.resolve(null);
  }


  // --- getting on and off (ULT4.s:1138-1245, 3696-3793) -----------------------------------

  public async cmdBoard(): Promise<Exit> {
    let exit: Exit;

    this.lda(this.peek(PRTY.player_transport));
    this.cmp(TILES.tile_walk);
    if (!this.zero()) {
      await this.print(I.board_back);
      exit = E.done_cant;
    } else {
      this.lda(this.peek(ZP_MAIN.tile_under_player));
      this.cmp(TILES.tile_horse_west);
      if (!this.zero()) {
        this.cmp(TILES.tile_horse_east);
      }
      if (this.zero()) {
        exit = E.board_horse;
      } else {
        await this.print(I.board);
        this.lda(this.peek(ZP_MAIN.tile_under_player));
        const ships: readonly number[] = [ TILES.tile_ship_west, TILES.tile_ship_north, TILES.tile_ship_east, TILES.tile_ship_south ];
        let ship: boolean = false;

        for (const tile of ships) {
          if (!ship) {
            this.cmp(tile);
            ship = this.zero();
          }
        }
        if (ship) {
          exit = await this.boardShip();
        } else {
          this.cmp(TILES.tile_balloon);
          exit = this.zero() ? E.board_balloon : this.nothingBoardable();
        }
      }
    }

    return exit;
  }


  private nothingBoardable(): Exit {
    return (this.lda(this.peek(TRAINERS.trainer_travel)) !== 0) ? JUMP_TRAINERS.j_trainer_board : E.done_what;
  }


  private async boardShip(): Promise<Exit> {
    let exit: Exit = E.cmd_done;

    if (this.lda(this.peek(PRTY.current_location)) !== 0) {
      exit = this.nothingBoardable();
    } else {
      this.lda(TILES.tile_ship_first);
      await this.sub(0x483B, (): Promise<Exit> => this.doBoard());
      await this.print(I.frigate);
      this.lda(this.peek(PRTY.player_xpos));
      this.cmp(this.peek(V.last_ship_x));
      let same: boolean = this.zero();

      if (same) {
        this.lda(this.peek(PRTY.player_ypos));
        this.cmp(this.peek(V.last_ship_y));
        same = this.zero();
      }
      if (!same) {
        this.poke(PRTY.ship_hull, this.lda(PRTY.ship_hull_full));
      }
    }

    return exit;
  }


  public async boardHorse(): Promise<Exit> {
    this.lda(TILES.tile_horse_west);
    await this.sub(0x4867, (): Promise<Exit> => this.doBoard());

    return this.message(I.mount_horse, E.cmd_done);
  }


  public async boardBalloon(): Promise<Exit> {
    this.lda(TILES.tile_balloon);
    await this.sub(0x4880, (): Promise<Exit> => this.doBoard());

    return this.message(I.balloon, E.cmd_done);
  }


  /** ULT4.s do_board: the transport of kind A under the party leaves the map, and the party takes it. */
  public doBoard(): Promise<Exit> {
    let found: boolean = false;

    this.poke(ZP_TRANSPORT, this.cpu.a);
    this.ldx(MAP_OBJECTS.object_last);
    this.dex();
    while (!found && !this.negative()) {
      this.lda(this.peek(MAP_OBJECTS.object_tile_type + this.cpu.x) & ANIMATION_MASK);
      this.cmp(this.peek(ZP_TRANSPORT));
      if (this.zero()) {
        this.lda(this.peek(MAP_OBJECTS.object_xpos + this.cpu.x));
        this.cmp(this.peek(PRTY.player_xpos));
        if (this.zero()) {
          this.lda(this.peek(MAP_OBJECTS.object_ypos + this.cpu.x));
          this.cmp(this.peek(PRTY.player_ypos));
          found = this.zero();
        }
      }
      if (!found) {
        this.dex();
      }
    }
    if (found) {
      this.lda(0x00);
      this.poke(MAP_OBJECTS.object_tile_type + this.cpu.x, this.cpu.a);
      this.poke(MAP_OBJECTS.object_tile_sprite + this.cpu.x, this.cpu.a);
    }
    this.poke(PRTY.player_transport, this.lda(this.peek(ZP_MAIN.tile_under_player)));

    return Promise.resolve(null);
  }


  public async cmdXIt(): Promise<Exit> {
    let exit: Exit = E.done_what;

    await this.print(I.x_it);
    this.lda(this.peek(PRTY.player_transport));
    this.cmp(TILES.tile_ship_first);
    if (this.carry()) {
      this.cmp(TILES.tile_ship_last);
      if (!this.carry()) {
        this.poke(V.last_ship_x, this.lda(this.peek(PRTY.player_xpos)));
        this.poke(V.last_ship_y, this.lda(this.peek(PRTY.player_ypos)));
        exit = await this.exitTransport();
      } else {
        this.cmp(TILES.tile_horse_last);
        if (!this.carry()) {
          this.poke(PRTY.horse_mode, this.lda(ZP_MAIN.horse_walk));
          exit = await this.exitTransport();
        } else {
          this.cmp(TILES.tile_balloon);
          if (this.zero()) {
            exit = (this.lda(this.peek(PRTY.terrain_occlusion)) === 0) ? await this.exitTransport() : E.done_not_here;
          }
        }
      }
    }

    return exit;
  }


  /** cmd_x_it's @find_empty_slot: the transport is left as an object, in a free slot or a random one. */
  private async exitTransport(): Promise<Exit> {
    let found: boolean = false;

    this.ldx(0x00);
    if (this.lda(this.peek(PRTY.current_location)) === 0) {
      this.ldx(MAP_OBJECTS.object_inanimate_first);
    }
    do {
      if (this.lda(this.peek(MAP_OBJECTS.object_tile_type + this.cpu.x)) === 0) {
        found = true;
      } else {
        this.inx();
        this.cpu.compare(this.cpu.x, MAP_OBJECTS.object_last);
      }
    } while (!found && !this.carry());
    if (!found) {
      await this.m.call(J.j_rand);
      this.ldx(this.lda((this.cpu.a & 0x0F) | 0x10));
    }
    this.lda(this.peek(PRTY.player_transport));
    this.poke(MAP_OBJECTS.object_tile_type + this.cpu.x, this.cpu.a);
    this.poke(MAP_OBJECTS.object_tile_sprite + this.cpu.x, this.cpu.a);
    this.poke(MAP_OBJECTS.object_xpos + this.cpu.x, this.lda(this.peek(PRTY.player_xpos)));
    this.poke(MAP_OBJECTS.object_ypos + this.cpu.x, this.lda(this.peek(PRTY.player_ypos)));
    this.lda(0x00);
    this.poke(MAP_OBJECTS.npc_movement_ai + this.cpu.x, this.cpu.a);
    this.poke(MAP_OBJECTS.npc_dialogue + this.cpu.x, this.cpu.a);
    this.poke(PRTY.player_transport, this.lda(TILES.tile_walk));
    await this.sub(0x5E78, (): Promise<Exit> => this.printNewline());

    return E.cmd_done;
  }


  public async cmdYellHorse(): Promise<Exit> {
    let exit: Exit = E.done_what;

    await this.print(I.yell);
    this.lda(this.peek(PRTY.player_transport));
    this.cmp(TILES.tile_horse_west);
    if (!this.zero()) {
      this.cmp(TILES.tile_horse_east);
    }
    if (this.zero()) {
      this.poke(PRTY.horse_mode, this.lda(this.peek(PRTY.horse_mode) ^ 0xFF));
      exit = this.negative() ? await this.message(I.giddyup, E.cmd_done) : await this.message(I.whoa, E.cmd_done);
    }

    return exit;
  }


  // --- up and down (ULT4.s:2144-2253, 2910-2993) ------------------------------------------

  public printDescend(): Promise<Exit> {
    return this.message(I.descend, null);
  }


  public async cmdDescend(): Promise<Exit> {
    let exit: Exit;

    this.lda(this.peek(PRTY.player_transport));
    this.cmp(TILES.tile_balloon);
    if (this.zero()) {
      exit = await this.descendBalloon();
    } else {
      await this.sub(0x4F8D, (): Promise<Exit> => this.printDescend());
      this.lda(this.peek(PRTY.current_location));
      this.cmp(PRTY.loc_castle_britannia);
      if (this.zero()) {
        exit = await this.descendCastle();
      } else {
        this.lda(this.peek(PRTY.game_mode));
        this.cmp(PRTY.mode_dungeon);
        exit = this.zero() ? await this.descendDungeon() : E.done_what;
      }
    }

    return exit;
  }


  private async descendDungeon(): Promise<Exit> {
    let exit: Exit = E.done_what;

    this.lda(this.peek(ZP_MAIN.tile_under_player) & DUNGEON.dng_tile_type_mask);
    this.cmp(DUNGEON.dng_tile_ladder_d);
    if (!this.zero()) {
      this.cmp(DUNGEON.dng_tile_ladder_du);
    }
    if (this.zero()) {
      this.inc(PRTY.dungeon_level);
      await this.print(I.down_to_level);
      exit = await this.printLevel(0x4FCB);
    }

    return exit;
  }


  /** "To level n", the dungeon level counted from 1. */
  private async printLevel(newlineSite: number): Promise<Exit> {
    this.setCarry(false);
    this.lda(this.peek(PRTY.dungeon_level));
    this.cpu.adc(0x01);
    await this.m.call(J.j_printdigit);
    await this.sub(newlineSite, (): Promise<Exit> => this.printNewline());

    return E.cmd_done;
  }


  private async descendBalloon(): Promise<Exit> {
    let exit: Exit;

    this.cpu.a = this.cpu.lsr(this.peek(ZP_MAIN.balloon_movement));
    this.lda(this.cpu.a & this.peek(TRAINERS.trainer_balloon));
    if (!this.zero()) {
      this.inc(ZP_MAIN.balloon_movement);
      await this.sub(0x4FDB, (): Promise<Exit> => this.printDescend());
      await this.sub(0x4FDE, (): Promise<Exit> => this.printNewline());
      exit = E.cmd_done;
    } else {
      await this.print(I.land_balloon);
      this.lda(this.peek(ZP_MAIN.tile_under_player));
      this.cmp(TILES.tile_grass);
      if (this.zero()) {
        this.poke(ZP_MAIN.balloon_movement, this.lda(ZP_MAIN.balloon_landed));
        this.poke(PRTY.terrain_occlusion, this.lda(ZP_MAIN.occlusion_on));
        exit = E.cmd_done;
      } else {
        exit = E.done_not_here;
      }
    }

    return exit;
  }


  private async descendCastle(): Promise<Exit> {
    let exit: Exit = E.done_what;

    this.lda(this.peek(PRTY.player_transport));
    this.cmp(TILES.tile_walk);
    if (!this.zero()) {
      exit = E.done_only_on_foot;
    } else {
      this.lda(this.peek(ZP_MAIN.tile_under_player));
      this.cmp(TILES.tile_ladder_down);
      if (this.zero()) {
        this.lda(this.peek(PRTY.player_ypos));
        this.cmp(0x02);
        if (this.zero()) {
          await this.print(I.the_depths);
          this.lda(0x05);
          this.poke(ZP_MAIN.temp_x, this.cpu.a);
          this.poke(ZP_MAIN.temp_y, this.cpu.a);
          this.poke(PRTY.britannia_x, this.lda(PLACES.xpos_hythloth));
          this.poke(PRTY.britannia_y, this.lda(PLACES.ypos_hythloth));
          this.poke(PRTY.current_location, this.lda(PRTY.loc_dng_hythloth));
          exit = CE.begin_dng_load;
        } else {
          await this.print(I.first_floor);
          exit = await this.changeFloor(CHAR.char_A);
        }
      }
    }

    return exit;
  }


  /** Castle Britannia's other floor, with its music. */
  private async changeFloor(letter: number): Promise<Exit> {
    await this.musicCtl(MUSIC.music_off);
    this.lda(letter);
    await this.m.call(CE.load_letter_location);
    await this.musicCtl(MUSIC.music_castle);

    return E.cmd_done;
  }


  public async cmdKlimb(): Promise<Exit> {
    let exit: Exit = E.done_what;

    await this.print(I.klimb);
    if (this.lda(this.peek(PRTY.current_location)) === 0) {
      exit = await this.klimbBalloon();
    } else {
      this.cmp(PRTY.loc_castle_britannia);
      if (this.zero()) {
        exit = await this.klimbCastle();
      } else {
        this.lda(this.peek(PRTY.game_mode));
        this.cmp(PRTY.mode_dungeon);
        if (this.zero()) {
          exit = await this.klimbDungeon();
        }
      }
    }

    return exit;
  }


  private async klimbDungeon(): Promise<Exit> {
    let exit: Exit = E.done_what;

    this.lda(this.peek(ZP_MAIN.tile_under_player) & DUNGEON.dng_tile_type_mask);
    this.cmp(DUNGEON.dng_tile_ladder_u);
    if (!this.zero()) {
      this.cmp(DUNGEON.dng_tile_ladder_du);
    }
    if (this.zero()) {
      await this.print(I.up);
      this.dec(PRTY.dungeon_level);
      if (this.negative()) {
        exit = E.leave_to_world;
      } else {
        await this.print(I.to_level);
        exit = await this.printLevel(0x56C2);
      }
    }

    return exit;
  }


  private async klimbBalloon(): Promise<Exit> {
    let exit: Exit = E.done_what;

    this.lda(this.peek(PRTY.player_transport));
    this.cmp(TILES.tile_balloon);
    if (this.zero()) {
      if (this.ldx(this.peek(PRTY.terrain_occlusion)) === 0) {
        this.dec(PRTY.terrain_occlusion);
        this.ldx(this.peek(TRAINERS.trainer_balloon));
        this.dex();
      }
      this.poke(ZP_MAIN.balloon_movement, this.cpu.x);
      exit = await this.message(I.altitude, E.cmd_done);
    }

    return exit;
  }


  private async klimbCastle(): Promise<Exit> {
    let exit: Exit = E.done_what;

    this.lda(this.peek(ZP_MAIN.tile_under_player));
    this.cmp(TILES.tile_ladder_up);
    if (this.zero()) {
      this.lda(this.peek(PRTY.player_transport));
      this.cmp(TILES.tile_walk);
      if (!this.zero()) {
        await this.sub(0x56F6, (): Promise<Exit> => this.printNewline());
        exit = E.done_only_on_foot;
      } else {
        await this.print(I.second_floor);
        exit = await this.changeFloor(0xC0);
      }
    }

    return exit;
  }


  // --- the end of a turn (ULT4.s:4420-4496, 5819-5855) --------------------------------------

  /** ULT4.s cmd_done: the ship mends, the party heals or suffers, eats, and the world moves. */
  public async cmdDone(): Promise<Exit> {
    await this.m.call(CE.anyone_awake);
    let exit: Exit;

    if (this.lda(this.peek(PRTY.game_mode)) & 0x80) {
      exit = L.combat_cmd_done;
    } else {
      this.lda(this.peek(PRTY.ship_hull));
      this.cmp(PRTY.ship_hull_full);
      if (!this.carry()) {
        await this.m.call(J.j_rand);
        if (this.lda(this.cpu.a & CHANCE_4) === 0) {
          this.lda(this.peek(PRTY.ship_hull));
          this.cpu.setFlag(DECIMAL, true);
          this.add(0x01);
          this.cpu.setFlag(DECIMAL, false);
          this.poke(PRTY.ship_hull, this.cpu.a);
        }
      }
      exit = await this.updatePlayerHealth();
    }

    return exit;
  }


  public async updatePlayerHealth(): Promise<Exit> {
    this.poke(ZP_MAIN.curr_player, this.lda(this.peek(PRTY.party_size)));
    do {
      await this.m.call(J.j_get_stats_ptr);
      this.ldy(ROST.player_status);
      this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y));
      this.cmp(ROST.status_Sleep);
      if (this.zero()) {
        await this.m.call(J.j_rand);
        if (this.lda(this.cpu.a & CHANCE_8) === 0) {
          this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.lda(ROST.status_Good));
        }
      } else {
        this.cmp(ROST.status_Poison);
        if (this.zero()) {
          this.lda(0x02);
          await this.m.call(CE.dec_player_hp);
          await this.m.call(CE.invert_player_name);
          await this.playsfx(SOUND.sound_damage);
          await this.m.call(CE.invert_player_name);
        }
      }
    } while (this.dec(ZP_MAIN.curr_player) !== 0);
    this.lda(this.peek(PRTY.party_size));
    await this.m.call(CE.eat_food);
    if (!this.carry()) {
      await this.m.call(CE.starving);
    }
    await this.m.call(CE.recover_mp);
    let exit: Exit = null;

    if (!(this.lda(this.peek(PRTY.terrain_occlusion)) & 0x80)) {
      await this.sub(0x6494, (): Promise<Exit> => this.checkWaterHazards());
      await this.sub(0x6497, (): Promise<Exit> => this.spawnMonsters());
      exit = await this.sub(0x649A, (): Promise<Exit> => this.mobsAct());
      if (exit == null) {
        await this.sub(0x649D, (): Promise<Exit> => this.checkWaterHazards());
      }
    }

    return exit == null ? this.updateDungeon() : exit;
  }


  private async updateDungeon(): Promise<Exit> {
    let exit: Exit = null;

    this.lda(this.peek(PRTY.game_mode));
    this.cmp(PRTY.mode_dungeon);
    if (this.zero()) {
      await this.m.call(J.j_print_direction);
      this.poke(ZP_SAVE_REG1, this.lda(this.peek(TRAINERS.trainer_avoid)));
      await this.m.call(L.dng_check_attacked);
      this.lda(this.peek(ZP_MAIN.tile_under_player) & DUNGEON.dng_tile_type_mask);
      this.cmp(DUNGEON.dng_tile_room);
      if (this.zero()) {
        exit = L.do_dungeon_room;
      }
    }
    if (exit == null) {
      if (this.lda(this.peek(PRTY.light_duration)) !== 0) {
        this.dec(PRTY.light_duration);
      }
      exit = E.end_turn;
    }

    return exit;
  }


  /** ULT4.s end_turn: the turn and move counters, the aura and the light run down, and the next turn. */
  public async endTurn(): Promise<Exit> {
    this.inc(ZP_MAIN.turn_counter);
    this.cpu.setFlag(DECIMAL, true);
    this.setCarry(false);
    this.lda(this.peek(PRTY.move_counter + 3));
    this.cpu.adc(0x01);
    this.poke(PRTY.move_counter + 3, this.cpu.a);
    for (const byte of [ 2, 1, 0 ]) {
      this.lda(this.peek(PRTY.move_counter + byte));
      this.cpu.adc(0x00);
      this.poke(PRTY.move_counter + byte, this.cpu.a);
    }
    this.cpu.setFlag(DECIMAL, false);
    if (this.lda(this.peek(ZP_MAIN.aura_duration)) !== 0) {
      if (this.dec(ZP_MAIN.aura_duration) === 0) {
        this.poke(ZP_MAIN.magic_aura, this.lda(ZP_MAIN.aura_none));
      }
    }
    this.lda(this.peek(PRTY.game_mode));
    this.cmp(PRTY.mode_dungeon);
    if (this.zero() && (this.lda(this.peek(PRTY.light_duration)) === 0)) {
      await this.print(I.dark);
    }
    await this.m.call(J.j_update_status);
    await this.m.call(CE.close_open_door);

    return E.next_turn;
  }


  /**
   * ULT4.s is_wind_favorable: Z set when the ship may sail toward direction A this turn: always
   * across the wind, every fourth turn into it or before it. The remaster's `eor $02` reads zero
   * page, where the opposite direction was meant.
   */
  public isWindFavorable(): Promise<Exit> {
    let yes: boolean;

    this.cmp(this.peek(ZP_MAIN.wind_direction));
    if (this.zero()) {
      yes = this.lda(this.peek(ZP_MAIN.turn_counter) & 0x03) === 0;
    } else {
      this.lda(this.cpu.a ^ this.peek(0x02));
      this.cmp(this.peek(ZP_MAIN.wind_direction));
      yes = !this.zero() || (this.lda(this.peek(ZP_MAIN.turn_counter) & 0x03) !== 0);
    }
    this.lda(yes ? 0x00 : 0xFF);

    return Promise.resolve(null);
  }


  // --- printing (ULT4.s:8716-8739, 8854-8862, 9216-9219) ----------------------------------

  public printNorth(): Promise<Exit> {
    return this.message(I.north, null);
  }


  public printSouth(): Promise<Exit> {
    return this.message(I.south, null);
  }


  public printEast(): Promise<Exit> {
    return this.message(I.east, null);
  }


  public printWest(): Promise<Exit> {
    return this.message(I.west, null);
  }


  /** ULT4.s input_char: a key, echoed and then a newline; the key in A with its flags. */
  public async inputChar(): Promise<Exit> {
    await this.m.call(J.j_waitkey);
    this.cpu.push(this.cpu.a);
    if (!this.zero()) {
      await this.m.call(J.j_console_out);
    }
    this.lda(CHAR.char_newline);
    await this.m.call(J.j_console_out);
    this.lda(this.cpu.pull());

    return null;
  }


  public async printNewline(): Promise<Exit> {
    this.lda(CHAR.char_newline);
    await this.m.call(J.j_console_out);

    return null;
  }


  // --- the overlays (ULT4.s:2829-2862, 3164-3200, 3395-3408, 3562-3581, 8886-8911, 8991-8999) ---

  /** A JSR from `site` to code that may not return to it, such as an overlay, pushing the 6502's return address. */
  protected jsrOut(site: number, address: number): Promise<void> {
    return this.m.callInline(address, site + 3, 0);
  }


  /** A BLOAD of an overlay, with the music off while the disk turns. */
  protected async loadOverlay(block: IInlineData): Promise<void> {
    await this.musicCtl(MUSIC.music_off);
    await this.callWith(J.j_primm_cout, block);
  }


  public async cmdHoleUp(): Promise<Exit> {
    let exit: Exit = E.cmd_done;
    let here: boolean = true;

    await this.print(I.hole_up);
    if (this.lda(this.peek(PRTY.current_location)) !== 0) {
      this.lda(this.peek(PRTY.game_mode));
      this.cmp(PRTY.mode_dungeon);
      here = this.zero();
    }
    if (!here) {
      exit = E.done_not_here;
    } else {
      this.lda(this.peek(PRTY.player_transport));
      this.cmp(TILES.tile_walk);
      if (this.zero()) {
        await this.loadOverlay(I.bload_hole);
        await this.jsrOut(0x55F2, JUMP_OVERLAY.j_overlay_entry);
        await this.m.call(J.j_update_status);
        await this.musicCtl(MUSIC.music_main);
        await this.dungeonNeighbours();
      } else {
        await this.print(I.must_be_on_foot);
      }
    }

    return exit;
  }


  /** In a dungeon, what the party can see round it again. */
  private async dungeonNeighbours(): Promise<void> {
    this.lda(this.peek(PRTY.game_mode));
    this.cmp(PRTY.mode_dungeon);
    if (this.zero()) {
      await this.m.call(JUMP_OVERLAY.j_dng_neighbor_tiles);
    }
  }


  public async cmdPeerGem(): Promise<Exit> {
    let exit: Exit = E.cmd_done;
    let gem: boolean = true;

    await this.print(I.peer_at);
    if (this.lda(this.peek(TRAINERS.trainer_peer)) === 0) {
      this.ldy(ROST.party_stat_gems);
      await this.sub(0x58F8, (): Promise<Exit> => this.decStat());
      gem = this.carry();
    }
    if (gem) {
      await this.print(I.a_gem);
      await this.sub(0x590B, (): Promise<Exit> => this.doView());
    } else {
      exit = E.done_what;
    }

    return exit;
  }


  /** The map TMAP draws of the land about, to its own tune; in a dungeon, the level reloaded after. */
  public async doView(): Promise<Exit> {
    await this.loadOverlay(I.bload_tmap);
    await this.musicCtl(MUSIC.music_peer);
    await this.jsrOut(0x5932, VIEW_MAP.j_viewmap);
    this.lda(this.peek(PRTY.game_mode));
    this.cmp(PRTY.mode_dungeon);
    if (this.zero()) {
      await this.loadOverlay(I.bload_dngd);
    }
    await this.musicCtl(MUSIC.music_main);

    return null;
  }


  public async cmdSearch(): Promise<Exit> {
    await this.print(I.search);
    await this.loadOverlay(I.bload_sear);
    await this.jsrOut(0x5B65, JUMP_OVERLAY.j_overlay_entry);
    await this.musicCtl(MUSIC.music_main);

    return E.cmd_done;
  }


  public async cmdUseItem(): Promise<Exit> {
    await this.print(I.use);
    await this.loadOverlay(I.bload_use);
    await this.jsrOut(0x5D03, JUMP_OVERLAY.j_overlay_entry);
    await this.musicCtl((this.lda(this.peek(PRTY.game_mode)) & 0x80) ? MUSIC.music_combat : MUSIC.music_main);

    return E.cmd_done;
  }


  /** The party all dead: SAVE brings it back, and the stack starts again under cmd_done, whichever way it came. */
  public async runFileDead(): Promise<Exit> {
    await this.musicCtl(MUSIC.music_off);
    this.lda(DISKS.disk_britannia);
    await this.m.call(J.j_request_disk);
    await this.callWith(J.j_primm_cout, I.bload_save);
    await this.jsrOut(0x84DD, JUMP_OVERLAY.j_overlay_entry);
    await this.musicCtl(MUSIC.music_main);
    this.ldx(0xFF);
    this.cpu.sp = this.cpu.x;

    return E.cmd_done;
  }


  /** ULT4.s encode_bcd_value: A in BCD, 99 at most. */
  public encodeBcdValue(): Exit {
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

    return null;
  }


  /** ULT4.s decode_bcd_value: A from BCD, by counting it down in decimal mode. */
  public decodeBcdValue(): Exit {
    this.cmp(0x00);
    if (!this.zero()) {
      this.ldx(0x00);
      this.cpu.setFlag(DECIMAL, true);
      do {
        this.inx();
        this.subtract(0x01);
      } while (!this.zero());
      this.lda(this.cpu.x);
      this.cpu.setFlag(DECIMAL, false);
    }

    return null;
  }


  /** One more of a party stat (Y), in BCD, unless it is at 99. */
  public incStat(): Exit {
    this.cpu.setFlag(DECIMAL, true);
    this.lda(this.peek(ROST.party_stats + this.cpu.y));
    this.add(0x01);
    if (!this.carry()) {
      this.poke(ROST.party_stats + this.cpu.y, this.cpu.a);
    }
    this.cpu.setFlag(DECIMAL, false);

    return null;
  }


  /** ULT4.s inc_virtue: A more of virtue Y, in BCD, at most 99; a virtue at zero, an eighth of avatarhood, stays there. */
  public incVirtue(): Exit {
    this.poke(zp_inc_amount, this.cpu.a);
    this.cpu.setFlag(DECIMAL, true);
    this.setCarry(false);
    if (this.lda(this.peek(ROST.party_stats + this.cpu.y)) !== 0) {
      this.cpu.adc(this.peek(zp_inc_amount));
      if (this.carry()) {
        this.lda(0x99);
      }
    }
    this.poke(ROST.party_stats + this.cpu.y, this.cpu.a);
    this.cpu.setFlag(DECIMAL, false);

    return null;
  }


  /** ULT4.s dec_virtue: A less of virtue Y, at least 1; a virtue at zero loses its eighth, and starts again from 99. */
  public async decVirtue(): Promise<Exit> {
    this.poke(zp_dec_amount, this.cpu.a);
    this.poke(zp_save_reg2, this.cpu.y);
    if (this.lda(this.peek(ROST.party_stats + this.cpu.y)) === 0) {
      await this.print(I.lost_an_eighth);
      this.ldy(this.peek(zp_save_reg2));
      this.lda(0x99);
    }
    this.cpu.setFlag(DECIMAL, true);
    this.subtract(this.peek(zp_dec_amount));
    if (this.zero() || !this.carry()) {
      this.lda(0x01);
    }
    this.poke(ROST.party_stats + this.cpu.y, this.cpu.a);
    this.cpu.setFlag(DECIMAL, false);

    return null;
  }


  /** One of a party stat (Y) used up, in BCD: carry clear if there was none. */
  public decStat(): Promise<Exit> {
    this.cpu.setFlag(DECIMAL, true);
    this.lda(this.peek(ROST.party_stats + this.cpu.y));
    this.subtract(0x01);
    if (this.carry()) {
      this.poke(ROST.party_stats + this.cpu.y, this.cpu.a);
    }
    this.cpu.setFlag(DECIMAL, false);

    return Promise.resolve(null);
  }


  // --- moongates (ULT4.s:9285-9337) -------------------------------------------------------

  /**
   * ULT4.s check_enter_moongate: a step onto an open moongate (tile A) drops the caller's return
   * and goes through: to the shrine of Spirituality when both moons are new, else to the gate of
   * Felucca's phase.
   */
  public async checkEnterMoongate(): Promise<Exit> {
    let exit: Exit = null;

    this.cmp(TILES.tile_moongate_full);
    if (this.zero()) {
      this.dropReturn();
      this.lda(this.peek(PRTY.moon_phase_trammel));
      this.cpu.a = this.cpu.asl(this.cpu.a);
      this.cpu.adc(this.peek(PRTY.moon_phase_felucca));
      this.cmp(0x0C);
      if (this.zero()) {
        await this.m.call(J.j_update_view);
        await this.m.call(J.j_invertview);
        this.lda(SOUND.sound_spell_effect);
        this.ldx(0xA0);
        await this.m.call(J.j_playsfx);
        this.poke(PRTY.current_location, this.lda(PRTY.loc_shrine_sacrifice));
        exit = CE.load_shrine;
      } else {
        exit = await this.gateToGate();
      }
    }

    return exit;
  }


  public async gateToGate(): Promise<Exit> {
    await this.m.call(J.j_update_view);
    this.ldx(this.peek(PRTY.moon_phase_felucca));
    this.poke(PRTY.player_xpos, this.lda(this.peek(T.moongate_x + this.cpu.x)));
    this.poke(PRTY.player_ypos, this.lda(this.peek(T.moongate_y + this.cpu.x)));
    await this.m.call(J.j_invertview);
    await this.gateSound();
    await this.m.call(J.j_invertview);
    await this.m.call(J.j_player_teleport);
    await this.m.call(J.j_update_view);
    await this.m.call(J.j_invertview);
    await this.gateSound();
    await this.m.call(J.j_invertview);

    return E.cmd_done;
  }


  private async gateSound(): Promise<void> {
    this.lda(SOUND.sound_spell_effect);
    this.ldx(0xA0);
    await this.m.call(J.j_playsfx);
  }
}
