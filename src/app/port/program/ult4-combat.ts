// ULT4.s's combat in Britannia, the townes and the inn, ported: the arena and its foes, the
// players' turns with their moves and attacks, the foes' turns, and the end of a fight. Dungeon
// rooms are still lifted; the spells are Ult4Spells'. Like the rest of ULT4's port, each entry leaves the registers
// and flags as the original does, and returns where control goes next.

import { DECIMAL } from '../../lifted-runtime/cpu';
import {
  ARENAS, CHAR, DUNGEON, JUMP_OVERLAY, JUMP_SUBS, JUMP_TRAINERS, MAP_OBJECTS, MUSIC, PRTY, ROST, SOUND, STRINGS, TILES, TRAINERS, ZP_COMBAT, ZP_MAIN,
} from '../../state/symbols';
import type { IInlineData } from '../inline-data';
import type { Exit } from '../routine';
import { Ult4 } from './ult4';
import { COMBAT_ENTRIES, COMBAT_INLINE, COMBAT_LIFTED, COMBAT_TABLES, COMBAT_VARIABLES } from './ult4-combat-data';
import { ULT4_ENTRIES } from './ult4-data';
import { SPELL_ENTRIES } from './ult4-spells-data';

const C = COMBAT_ENTRIES;
const CL = COMBAT_LIFTED;
const CI = COMBAT_INLINE;
const CT = COMBAT_TABLES;
const CV = COMBAT_VARIABLES;
const E = ULT4_ENTRIES;
const J = JUMP_SUBS;
const O = MAP_OBJECTS;
/** ULT4.s's own uses of zero page in combat. */
const zp_index1: number = 0xD8;
const zp_number1: number = 0xD8;
const zp_number2: number = 0xD9;
const zp_amount: number = 0xDA;
const zp_dist: number = 0xDA;
const zp_nearest_dist: number = 0xDB;
const zp_cur_foe_index: number = 0xEA;
const zp_foe_attempts: number = 0xF0;
const zp_percent_75: number = 0xD8;
const zp_percent_50: number = 0xD9;
const zp_percent_25: number = 0xDA;
const zp_tile_type: number = 0xDA;
const modulus: number = 0xF1;
const CHANCE_4: number = 0x03;
const CHANCE_8: number = 0x07;
const HP_FLEEING: number = 0x17;
const RANGE_MISSILE_ATTACK: number = 0x05;
const COMPANION_DOUBLE: number = 0x1F;
const COMPANION: number = 0x07;


export abstract class Ult4Combat extends Ult4 {
  // --- the start of a fight (ULT4.s:5856-5872, 6105-6366) ----------------------------------

  /** ULT4.s inn_combat: a rogue in the inn's room comes for the party's leader alone. */
  public innCombat(): Promise<Exit> {
    this.ldx(0x00);
    this.lda(0x00);
    do {
      this.poke(O.combat_foe_cur_x + this.cpu.x, this.cpu.a);
    } while (this.inx() !== 0);
    this.poke(ZP_MAIN.curr_player, this.lda(0x01));
    this.poke(ZP_MAIN.game_mode_pre_combat, this.lda(this.peek(PRTY.game_mode)));
    this.poke(PRTY.game_mode, this.lda(PRTY.mode_combat_inn));
    this.lda(TILES.tile_rogue);
    this.poke(ZP_COMBAT.foe_type_encountered, this.cpu.a);
    this.poke(ZP_MAIN.foe_type_combat, this.cpu.a);
    this.lda(ARENAS.arena_inn);

    return this.loadArena();
  }


  /** ULT4.s init_combat: the arena for where the party stands and what it fights. */
  public async initCombat(): Promise<Exit> {
    await this.print(CI.combat);
    this.poke(ZP_MAIN.foe_type_combat, this.lda(this.peek(ZP_COMBAT.foe_type_encountered)));
    this.ldx(0x00);
    this.lda(this.cpu.x);
    do {
      this.poke(O.combat_foe_cur_x + this.cpu.x, this.cpu.a);
    } while (this.dex() !== 0);
    this.lda(this.arena());

    return this.loadArena();
  }


  private onShip(): boolean {
    let ship: boolean = false;

    this.lda(this.peek(PRTY.player_transport));
    this.cmp(TILES.tile_ship_last);
    if (!this.carry()) {
      ship = true;
    } else {
      this.lda(this.peek(ZP_MAIN.tile_under_player));
      this.cmp(TILES.tile_ship_last);
      if (!this.carry()) {
        this.cmp(TILES.tile_ship_first);
        ship = this.carry();
      }
    }

    return ship;
  }


  /** A pirate's crew are rogues. */
  private againstPirates(): boolean {
    this.lda(this.peek(ZP_COMBAT.foe_type_encountered));
    this.cmp(TILES.tile_pirate);

    return this.zero();
  }


  private arena(): number {
    let arena: number;

    if (this.onShip()) {
      if (this.againstPirates()) {
        this.poke(ZP_MAIN.foe_type_combat, this.lda(TILES.tile_rogue));
        arena = ARENAS.arena_ship_v_ship;
      } else {
        this.lda(this.peek(ZP_COMBAT.pre_combat_tile));
        this.cmp(TILES.tile_water_last);
        arena = this.carry() ? ARENAS.arena_ship_s_shore : ARENAS.arena_ship_at_sea;
      }
    } else if (this.againstPirates()) {
      this.poke(ZP_MAIN.foe_type_combat, this.lda(TILES.tile_rogue));
      arena = ARENAS.arena_ship_n_shore;
    } else {
      this.lda(this.peek(ZP_COMBAT.pre_combat_tile));
      this.cmp(TILES.tile_water_last);
      arena = this.carry() ? this.landArena() : ARENAS.arena_shore;
    }

    return arena;
  }


  /** The arena for the ground under the party, compared tile by tile as the original does. */
  private landArena(): number {
    const grounds: readonly [ number, number ][] = [
      [ TILES.tile_swamp, ARENAS.arena_swamp ], [ TILES.tile_brush, ARENAS.arena_brush ], [ TILES.tile_forest, ARENAS.arena_forest ],
      [ TILES.tile_hills, ARENAS.arena_mountains ], [ TILES.tile_floor_stone, ARENAS.arena_floor_stone ],
      [ TILES.tile_floor_brick, ARENAS.arena_floor_brick ],
    ];
    const bridges: readonly number[] = [ TILES.tile_bridge_narrow, TILES.tile_bridge_top, TILES.tile_bridge_bottom, TILES.tile_bridge_middle ];
    let arena: number | null = null;

    this.lda(this.peek(ZP_MAIN.tile_under_player));
    for (const [ ground, ofGround ] of grounds) {
      if (arena == null) {
        this.cmp(ground);
        if (this.zero()) {
          arena = ofGround;
        }
      }
    }
    for (const bridge of bridges) {
      if (arena == null) {
        this.cmp(bridge);
        if (this.zero()) {
          arena = ARENAS.arena_bridge;
        }
      }
    }

    return arena ?? ARENAS.arena_grass;
  }


  /** ULT4.s load_arena: its file's letter patched into the BLOAD, and on into the arena. */
  public async loadArena(): Promise<Exit> {
    this.poke(CV.file_char_arena, this.cpu.a);
    await this.musicCtl(MUSIC.music_off);
    await this.callWith(J.j_primm_cout, CI.bload_con);

    return this.initializeArena();
  }


  /** ULT4.s initialize_arena: the foes, how many for the party, and the players in their places. */
  public async initializeArena(): Promise<Exit> {
    this.lda(this.peek(PRTY.game_mode));
    this.cmp(PRTY.mode_combat_inn);
    if (!this.zero()) {
      this.poke(ZP_MAIN.game_mode_pre_combat, this.cpu.a);
      this.poke(PRTY.game_mode, this.lda(PRTY.mode_combat_wandering));
    }
    let towneArena: boolean = false;

    this.lda(this.peek(ZP_MAIN.game_mode_pre_combat));
    this.cmp(PRTY.mode_towne);
    if (this.zero()) {
      this.lda(this.peek(PRTY.game_mode));
      this.cmp(PRTY.mode_combat_inn);
      towneArena = !this.zero();
    }
    if (!towneArena) {
      await this.setFoeCount();
    } else {
      this.lda(this.peek(ZP_COMBAT.foe_type_encountered));
      this.cmp(TILES.tile_guard);
      if (this.zero()) {
        this.lda(this.peek(PRTY.party_size));
        this.cpu.a = this.cpu.asl(this.cpu.a);
        this.subtract(0x01);
      } else {
        this.lda(0x00);
      }
    }
    await this.clampFoeCount();
    await this.placeFoes();
    await this.placePlayers();

    return C.begin_combat;
  }


  /** Townsfolk come two to eight; monsters by their kind's number, as the original's rand works it out. */
  private async setFoeCount(): Promise<void> {
    let lookUp: boolean = this.lda(this.peek(ZP_MAIN.foe_type_combat)) >= 0x80;

    if (!lookUp) {
      await this.m.call(J.j_rand);
      lookUp = this.lda(this.cpu.a & 0x07) === 0;
    }
    if (lookUp) {
      await this.sub(0x7145, (): Promise<Exit> => this.foeIndexFromTile());
      this.ldx(this.cpu.a);
      this.lda(this.peek(CT.foe_max_count + this.cpu.x));
      await this.sub(0x714C, (): Promise<Exit> => this.randModulo());
      this.setCarry(false);
      this.cpu.adc(this.peek(CT.foe_max_count + this.cpu.x));
      this.cpu.a = this.cpu.lsr(this.cpu.a);
    }
  }


  /** No more than twice the party. */
  private async clampFoeCount(): Promise<void> {
    let clamped: boolean = false;

    while (!clamped) {
      this.poke(zp_cur_foe_index, this.cpu.a);
      this.poke(CV.foe_count, this.cpu.a);
      this.cpu.a = this.cpu.lsr(this.cpu.a);
      this.cmp(this.peek(PRTY.party_size));
      clamped = !this.carry();
      if (!clamped) {
        this.lda(this.peek(PRTY.party_size));
        this.cpu.a = this.cpu.asl(this.cpu.a);
        await this.sub(0x7161, (): Promise<Exit> => this.randModulo());
      }
    }
  }


  /** Each foe in a free starting place, now and then with a companion of another kind, and its hit points. */
  private async placeFoes(): Promise<void> {
    do {
      do {
        await this.m.call(J.j_rand);
        this.lda(this.cpu.a & O.foes_max);
        this.ldx(this.cpu.a);
      } while (this.lda(this.peek(O.combat_foe_cur_x + this.cpu.x)) !== 0);
      this.poke(O.combat_foe_cur_x + this.cpu.x, this.lda(this.peek(O.map_start_foe_x + this.cpu.x)));
      this.poke(O.combat_foe_cur_y + this.cpu.x, this.lda(this.peek(O.map_start_foe_y + this.cpu.x)));
      if (this.lda(this.peek(ZP_MAIN.foe_type_combat)) >= 0x80) {
        await this.chooseCompanion();
      }
      this.poke(O.combat_foe_tile_type + this.cpu.x, this.cpu.a);
      this.poke(O.combat_foe_tile_sprite + this.cpu.x, this.cpu.a);
      await this.sub(0x71B8, (): Promise<Exit> => this.foeIndexFromTile());
      this.ldy(this.cpu.a);
      this.poke(zp_number1, this.lda(this.peek(CT.foe_power_table + this.cpu.y)));
      await this.sub(0x71C1, (): Promise<Exit> => this.randModulo());
      this.poke(zp_number1, this.cpu.lsr(this.peek(zp_number1)));
      this.lda(this.cpu.a | this.peek(zp_number1));
      this.poke(O.combat_foe_hp + this.cpu.x, this.cpu.a);
    } while (this.dec(zp_cur_foe_index) < 0x80);
  }


  /** A in: the foe's own kind. Out: its kind, its companion's, or its companion's companion's. */
  private async chooseCompanion(): Promise<void> {
    let companions: number = 0;

    if (this.lda(this.peek(zp_cur_foe_index)) !== 0) {
      await this.m.call(J.j_rand);
      if (this.lda(this.cpu.a & COMPANION_DOUBLE) === 0) {
        companions = 2;
      } else if (this.lda(this.cpu.a & COMPANION) === 0) {
        companions = 1;
      }
    }
    this.lda(this.peek(ZP_MAIN.foe_type_combat));
    if (companions >= 1) {
      await this.sub(companions === 1 ? 0x7198 : 0x71A4, (): Promise<Exit> => this.foeIndexFromTile());
      this.ldy(this.cpu.a);
      this.lda(this.peek(CT.foe_companion_table + this.cpu.y));
    }
    if (companions === 2) {
      await this.sub(0x71AB, (): Promise<Exit> => this.foeIndexFromTile());
      this.ldy(this.cpu.a);
      this.lda(this.peek(CT.foe_companion_table + this.cpu.y));
    }
  }


  /** Each player that is not dead at its starting place; in the inn, only the leader. */
  private async placePlayers(): Promise<void> {
    this.lda(this.peek(PRTY.game_mode));
    this.cmp(PRTY.mode_combat_inn);
    if (!this.zero()) {
      this.poke(ZP_MAIN.curr_player, this.lda(this.peek(PRTY.party_size)));
    }
    do {
      let remove: boolean = true;

      await this.sub(0x71D9, (): Promise<Exit> => this.getPlayerSprite());
      if (!this.negative()) {
        this.ldx(this.peek(ZP_MAIN.curr_player));
        this.dex();
        this.poke(O.combat_player_tile + this.cpu.x, this.cpu.a);
        this.poke(O.combat_player_xpos + this.cpu.x, this.lda(this.peek(O.map_start_player_x + this.cpu.x)));
        this.poke(O.combat_player_ypos + this.cpu.x, this.lda(this.peek(O.map_start_player_y + this.cpu.x)));
        await this.sub(0x71F0, (): Promise<Exit> => this.isAlive());
        remove = !this.zero();
      }
      if (remove) {
        this.ldx(this.peek(ZP_MAIN.curr_player));
        this.poke(O.combat_player_tile - 1 + this.cpu.x, this.lda(0x00));
      }
    } while (this.dec(ZP_MAIN.curr_player) !== 0);
  }


  /** ULT4.s begin_combat: the fight's tune, the keyboard cleared, and the first player's turn. */
  public async beginCombat(): Promise<Exit> {
    await this.musicCtl(MUSIC.music_combat);
    await this.m.call(JUMP_TRAINERS.j_active_char_combat_start);
    this.cpu.bit(await this.m.clearKeyboardStrobe());
    this.poke(ZP_MAIN.key_buf_len, this.lda(0x00));

    return this.startPlayersTurn();
  }


  public async startPlayersTurn(): Promise<Exit> {
    await this.m.call(JUMP_TRAINERS.j_active_char_player_turn);
    this.poke(ZP_COMBAT.curr_player_turn, this.cpu.a);

    return C.combat_take_turn;
  }


  /** ULT4.s combat_take_turn: a player's command, or its turn passing if it cannot act. */
  public async combatTakeTurn(): Promise<Exit> {
    let exit: Exit = C.combat_end_turn;

    await this.sub(0x7214, (): Promise<Exit> => this.isAlive());
    if (!this.zero()) {
      this.ldx(this.peek(ZP_MAIN.curr_player));
      if (this.lda(this.peek(O.combat_player_tile - 1 + this.cpu.x)) !== 0) {
        this.poke(O.combat_player_tile - 1 + this.cpu.x, this.lda(0x00));
      }
    } else {
      this.ldx(this.peek(ZP_MAIN.curr_player));
      if (this.lda(this.peek(O.combat_player_tile - 1 + this.cpu.x)) !== 0) {
        this.cmp(TILES.tile_human_prone);
        if (!this.zero()) {
          exit = await this.playerCommand();
        }
      }
    }

    return exit;
  }


  /** The player's name lit, its weapon, the prompt, and its key. */
  private async playerCommand(): Promise<Exit> {
    await this.m.call(JUMP_TRAINERS.j_active_char_check);
    await this.m.call(CL.invert_player_name);
    await this.sub(0x7239, (): Promise<Exit> => this.printNewline());
    await this.m.call(J.j_printname);
    await this.print(CI.weapon);
    await this.m.call(J.j_get_stats_ptr);
    this.ldy(ROST.player_weapon);
    this.poke(CV.current_weapon, this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y)));
    this.add(STRINGS.string_weapon_first);
    await this.m.call(J.j_printstring);
    await this.print(CI.prompt);
    let key: number | null = null;

    while (key == null) {
      await this.m.call(J.j_waitkey);
      if (!this.zero()) {
        key = this.cpu.a;
      } else if (this.lda(this.peek(TRAINERS.trainer_pass)) === 0) {
        key = 0x00;
      }
    }

    return (key === 0x00) ? E.done_pass : this.commandFor();
  }


  /** The key in A: a move, a pass, or a letter's command from combat_cmd_table. */
  private commandFor(): Exit {
    const keys: readonly [ number, Exit ][] = [
      [ CHAR.char_space, E.done_pass ], [ CHAR.char_enter, C.combat_move_up ], [ CHAR.char_up_arrow, C.combat_move_up ],
      [ CHAR.char_down_arrow, C.combat_move_down ], [ CHAR.char_slash, C.combat_move_down ], [ CHAR.char_left_arrow, C.combat_move_left ],
      [ CHAR.char_right_arrow, C.combat_move_right ],
    ];
    let exit: Exit = null;

    for (const [ key, command ] of keys) {
      if (exit == null) {
        this.cmp(key);
        if (this.zero()) {
          exit = command;
        }
      }
    }
    if (exit == null) {
      exit = this.letterCommand();
    }

    return exit;
  }


  private letterCommand(): Exit {
    let exit: Exit = JUMP_TRAINERS.j_active_char_check_command;

    this.cmp(CHAR.char_alpha_first);
    if (this.carry()) {
      this.cmp(CHAR.char_alpha_last);
      if (!this.carry()) {
        this.subtract(CHAR.char_alpha_first);
        this.cpu.a = this.cpu.asl(this.cpu.a);
        this.ldy(this.cpu.a);
        this.poke(ZP_MAIN.ptr1, this.lda(this.peek(CT.combat_cmd_table + this.cpu.y)));
        this.poke(ZP_MAIN.ptr1 + 1, this.lda(this.peek(CT.combat_cmd_table + 1 + this.cpu.y)));
        exit = this.pointer(ZP_MAIN.ptr1);
      }
    }

    return exit;
  }


  // --- the end of a player's turn (ULT4.s:6443-6488) ----------------------------------------

  /** ULT4.s combat_cmd_done: the tile under the player, the status pane, and with quickness, half the time, another go. */
  public async combatCmdDone(): Promise<Exit> {
    let exit: Exit = C.combat_end_turn;

    this.poke(ZP_MAIN.curr_player, this.lda(this.peek(ZP_COMBAT.curr_player_turn)));
    await this.m.call(CL.invert_player_name);
    await this.m.call(CL.tile_effect);
    await this.m.call(J.j_update_status);
    this.lda(this.peek(ZP_MAIN.magic_aura));
    this.cmp(ZP_MAIN.aura_quickness);
    if (this.zero()) {
      await this.m.call(J.j_rand);
      if (!this.negative()) {
        exit = C.combat_take_turn;
      }
    }

    return exit;
  }


  /** ULT4.s combat_end_turn: a sleeper may wake; on to the next player, or when all have gone, the foes. */
  public async combatEndTurn(): Promise<Exit> {
    let exit: Exit = C.combat_take_turn;

    await this.m.call(J.j_get_stats_ptr);
    this.ldy(ROST.player_status);
    this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y));
    this.cmp(ROST.status_Sleep);
    if (this.zero()) {
      await this.m.call(J.j_rand);
      if (this.lda(this.cpu.a & CHANCE_8) === 0) {
        this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.lda(ROST.status_Good));
        await this.sub(0x72E8, (): Promise<Exit> => this.getPlayerSprite());
        this.ldx(this.peek(ZP_MAIN.curr_player));
        this.poke(O.combat_player_tile - 1 + this.cpu.x, this.cpu.a);
      }
    }
    const over: Exit = await this.sub(0x72F0, (): Promise<Exit> => this.checkSceneOver());

    if (over != null) {
      exit = over;
    } else {
      this.inc(ZP_MAIN.curr_player);
      this.inc(ZP_COMBAT.curr_player_turn);
      this.lda(this.peek(ZP_MAIN.curr_player));
      this.cmp(this.peek(PRTY.party_size));
      if (this.carry() && !this.zero()) {
        this.poke(ZP_COMBAT.curr_player_turn, this.lda(0x00));
        await this.m.call(J.j_update_view);
        this.poke(zp_cur_foe_index, this.lda(O.foes_max));
        exit = C.foe_take_turn;
      }
    }

    return exit;
  }


  // --- the foes' turns (ULT4.s:6489-6907) ---------------------------------------------------

  /** ULT4.s foe_take_turn: a sleeping foe may wake; a zorn negates magic, and a wisp now and then blinks away. */
  public async foeTakeTurn(): Promise<Exit> {
    let exit: Exit = C.calc_nearest_player;

    this.ldx(this.peek(zp_cur_foe_index));
    if (this.lda(this.peek(O.combat_foe_tile_type + this.cpu.x)) === 0) {
      exit = C.next_foe;
    } else if (this.lda(this.peek(O.combat_foe_slept + this.cpu.x)) !== 0 && await this.staysAsleep()) {
      exit = C.check_tile_effect;
    } else {
      this.lda(this.peek(O.combat_foe_tile_type + this.cpu.x));
      this.cmp(TILES.tile_zorn);
      if (this.zero()) {
        this.poke(ZP_MAIN.magic_aura, this.lda(ZP_MAIN.aura_negate));
        this.poke(ZP_MAIN.aura_duration, this.lda(0x02));
      } else {
        this.cmp(TILES.tile_wisp);
        if (this.zero()) {
          await this.m.call(J.j_rand);
          if (this.lda(this.cpu.a & CHANCE_8) === 0) {
            await this.wispTeleport();
            exit = C.check_tile_effect;
          }
        }
      }
    }

    return exit;
  }


  /** A sleeping foe wakes one time in eight. */
  private async staysAsleep(): Promise<boolean> {
    let asleep: boolean = true;

    await this.m.call(J.j_rand);
    if (this.lda(this.cpu.a & CHANCE_8) === 0) {
      this.poke(O.combat_foe_slept + this.cpu.x, this.lda(0x00));
      asleep = false;
    }

    return asleep;
  }


  /** Anywhere in the arena it could stand. */
  private async wispTeleport(): Promise<void> {
    do {
      this.lda(O.xy_last_screen);
      await this.sub(0x734D, (): Promise<Exit> => this.randModulo());
      this.poke(PRTY.dest_x, this.cpu.a);
      this.lda(O.xy_last_screen);
      await this.sub(0x7354, (): Promise<Exit> => this.randModulo());
      this.poke(PRTY.dest_y, this.cpu.a);
      await this.m.call(J.j_gettile_actual_map);
      await this.sub(0x735C, (): Promise<Exit> => this.legalMoveCombat());
    } while (this.carry());
    this.ldx(this.peek(zp_cur_foe_index));
    this.poke(O.combat_foe_cur_x + this.cpu.x, this.lda(this.peek(PRTY.dest_x)));
    this.poke(O.combat_foe_cur_y + this.cpu.x, this.lda(this.peek(PRTY.dest_y)));
  }


  /** ULT4.s calc_nearest_player: X the foe; the nearest player that is up and in the arena, by steps. */
  public async calcNearestPlayer(): Promise<Exit> {
    this.poke(ZP_MAIN.temp_x, this.lda(this.peek(O.combat_foe_cur_x + this.cpu.x)));
    this.poke(ZP_MAIN.temp_y, this.lda(this.peek(O.combat_foe_cur_y + this.cpu.x)));
    this.poke(ZP_MAIN.curr_player, this.lda(this.peek(PRTY.party_size)));
    this.poke(zp_nearest_dist, this.lda(0xFF));
    this.poke(ZP_MAIN.target_player, this.lda(0x00));
    do {
      await this.sub(0x7386, (): Promise<Exit> => this.isAlive());
      if (this.zero()) {
        this.ldx(this.peek(ZP_MAIN.curr_player));
        this.dex();
        if (this.lda(this.peek(O.combat_player_tile + this.cpu.x)) !== 0) {
          await this.distanceTo();
        }
      }
    } while (this.dec(ZP_MAIN.curr_player) !== 0);

    return (this.lda(this.peek(ZP_MAIN.target_player)) !== 0) ? this.calcDirection() : C.check_tile_effect;
  }


  private async distanceTo(): Promise<void> {
    this.setCarry(true);
    this.lda(this.peek(O.combat_player_xpos + this.cpu.x));
    this.cpu.sbc(this.peek(ZP_MAIN.temp_x));
    await this.sub(0x7399, (): Promise<Exit> => this.mathAbs());
    this.poke(zp_dist, this.cpu.a);
    this.setCarry(true);
    this.lda(this.peek(O.combat_player_ypos + this.cpu.x));
    this.cpu.sbc(this.peek(ZP_MAIN.temp_y));
    await this.sub(0x73A4, (): Promise<Exit> => this.mathAbs());
    this.add(this.peek(zp_dist));
    this.cmp(this.peek(zp_nearest_dist));
    if (!this.carry()) {
      this.poke(zp_nearest_dist, this.cpu.a);
      this.poke(ZP_MAIN.target_player, this.lda(this.peek(ZP_MAIN.curr_player)));
    }
  }


  /** ULT4.s calc_direction: A the player; which way the foe would go to it. A mimic shows itself only close by. */
  public async calcDirection(): Promise<Exit> {
    let exit: Exit = C.calc_attack_type;

    this.poke(ZP_MAIN.curr_player, this.cpu.a);
    this.ldx(this.cpu.a);
    this.dex();
    this.setCarry(true);
    this.lda(this.peek(O.combat_player_xpos + this.cpu.x));
    this.cpu.sbc(this.peek(ZP_MAIN.temp_x));
    await this.m.call(J.j_math_sign);
    this.poke(ZP_MAIN.delta_x, this.cpu.a);
    this.setCarry(true);
    this.lda(this.peek(O.combat_player_ypos + this.cpu.x));
    this.cpu.sbc(this.peek(ZP_MAIN.temp_y));
    await this.m.call(J.j_math_sign);
    this.poke(ZP_MAIN.delta_y, this.cpu.a);
    this.ldx(this.peek(zp_cur_foe_index));
    this.lda(this.peek(O.combat_foe_tile_type + this.cpu.x));
    this.cmp(TILES.tile_mimic);
    if (this.zero()) {
      this.poke(O.combat_foe_tile_sprite + this.cpu.x, this.lda(TILES.tile_chest));
      this.lda(this.peek(zp_nearest_dist));
      this.cmp(RANGE_MISSILE_ATTACK);
      if (this.carry()) {
        exit = C.no_range_attack;
      } else {
        this.poke(O.combat_foe_tile_sprite + this.cpu.x, this.lda(TILES.tile_mimic));
      }
    }

    return exit;
  }


  /** ULT4.s calc_attack_type: one time in four, a foe that has a missile throws it, unless magic is negated. */
  public async calcAttackType(): Promise<Exit> {
    let exit: Exit = C.no_range_attack;

    await this.m.call(J.j_rand);
    if (this.lda(this.cpu.a & CHANCE_4) === 0) {
      this.lda(this.peek(O.combat_foe_tile_type + this.cpu.x));
      await this.sub(0x73FC, (): Promise<Exit> => this.getRangeattackType());
      if (!this.zero()) {
        let allowed: boolean = true;

        this.cmp(TILES.tile_attack_blue);
        if (this.zero()) {
          this.ldy(this.peek(ZP_MAIN.magic_aura));
          this.cpu.compare(this.cpu.y, ZP_MAIN.aura_negate);
          allowed = !this.zero();
        }
        if (allowed) {
          await this.sub(0x740B, (): Promise<Exit> => this.doFoeRangeAttack());
          await this.m.call(J.j_update_view);
          exit = C.check_tile_effect;
        }
      }
    }

    return exit;
  }


  /** ULT4.s no_range_attack: a balron or reaper's sleep spell, a foe fleeing, stealing or striking, or its move. */
  public async noRangeAttack(): Promise<Exit> {
    let exit: Exit;

    await this.m.call(J.j_rand);
    if ((this.lda(this.cpu.a & CHANCE_4) === 0) && this.castsSleep()) {
      await this.castSleep();
      exit = C.check_tile_effect;
    } else {
      exit = await this.fleeOrClose();
    }

    return exit;
  }


  private castsSleep(): boolean {
    let casts: boolean = false;

    this.ldx(this.peek(zp_cur_foe_index));
    this.lda(this.peek(O.combat_foe_tile_type + this.cpu.x));
    this.cmp(TILES.tile_balron);
    if (!this.zero()) {
      this.cmp(TILES.tile_reaper);
    }
    if (this.zero()) {
      this.lda(this.peek(ZP_MAIN.magic_aura));
      this.cmp(ZP_MAIN.aura_negate);
      casts = !this.zero();
    }

    return casts;
  }


  /** Half the players in good health fall asleep. */
  private async castSleep(): Promise<void> {
    await this.m.call(J.j_update_view);
    await this.m.call(J.j_invertview);
    this.ldx(0x80);
    await this.playsfx(SOUND.sound_spell_effect);
    await this.m.call(J.j_invertview);
    this.poke(ZP_MAIN.curr_player, this.lda(ROST.player_last));
    do {
      this.ldx(this.peek(ZP_MAIN.curr_player));
      if (this.lda(this.peek(O.combat_player_tile - 1 + this.cpu.x)) !== 0) {
        await this.m.call(J.j_get_stats_ptr);
        this.ldy(ROST.player_status);
        this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y));
        this.cmp(ROST.status_Good);
        if (this.zero()) {
          await this.m.call(J.j_rand);
          if (!this.negative()) {
            this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.lda(ROST.status_Sleep));
            this.lda(TILES.tile_human_prone);
            this.ldx(this.peek(ZP_MAIN.curr_player));
            this.poke(O.combat_player_tile - 1 + this.cpu.x, this.cpu.a);
          }
        }
      }
    } while (this.dec(ZP_MAIN.curr_player) !== 0);
  }


  /** A foe near death turns away; one beside a player steals and strikes; any other moves. */
  private async fleeOrClose(): Promise<Exit> {
    let exit: Exit = null;

    this.ldx(this.peek(zp_cur_foe_index));
    this.lda(this.peek(O.combat_foe_hp + this.cpu.x));
    this.cmp(HP_FLEEING + 1);
    if (!this.carry()) {
      this.lda(this.peek(ZP_MAIN.delta_x));
      await this.sub(0x7476, (): Promise<Exit> => this.mathNegate());
      this.poke(ZP_MAIN.delta_x, this.cpu.a);
      this.lda(this.peek(ZP_MAIN.delta_y));
      await this.sub(0x747D, (): Promise<Exit> => this.mathNegate());
      this.poke(ZP_MAIN.delta_y, this.cpu.a);
    } else {
      this.lda(this.peek(zp_nearest_dist));
      this.cmp(0x02);
      if (!this.carry()) {
        await this.stealFrom();
        exit = C.do_foe_melee_attack;
      }
    }

    return exit ?? this.tryFoeMove();
  }


  private async stealFrom(): Promise<void> {
    this.ldx(this.peek(zp_cur_foe_index));
    this.lda(this.peek(O.combat_foe_tile_type + this.cpu.x));
    this.cmp(TILES.tile_gremlin);
    if (this.zero()) {
      await this.sub(0x7494, (): Promise<Exit> => this.stealFood());
    } else {
      this.cmp(TILES.tile_rogue);
      if (this.zero()) {
        await this.sub(0x749E, (): Promise<Exit> => this.tryStealGold());
      }
    }
  }


  /** Toward the player along x or y, then the other, then twice at random; a mimic, reaper or camp fire stays put. */
  private async tryFoeMove(): Promise<Exit> {
    let exit: Exit = null;

    this.ldx(this.peek(zp_cur_foe_index));
    this.lda(this.peek(O.combat_foe_tile_type + this.cpu.x));
    for (const immobile of [ TILES.tile_mimic, TILES.tile_reaper, TILES.tile_camp_fire ]) {
      if (exit == null) {
        this.cmp(immobile);
        if (this.zero()) {
          exit = C.check_tile_effect;
        }
      }
    }
    if (exit == null) {
      this.poke(zp_foe_attempts, this.lda(0x02));
    }
    while (exit == null) {
      exit = await this.tryFoeSteps();
      if (exit == null) {
        await this.m.call(J.j_rand);
        await this.m.call(J.j_math_sign);
        this.poke(ZP_MAIN.delta_x, this.cpu.a);
        await this.m.call(J.j_rand);
        await this.m.call(J.j_math_sign);
        this.poke(ZP_MAIN.delta_y, this.cpu.a);
        if (this.dec(zp_foe_attempts) === 0) {
          this.lda(this.peek(zp_nearest_dist));
          this.cmp(0x02);
          exit = this.carry() ? C.check_tile_effect : C.do_foe_melee_attack;
        }
      }
    }

    return exit;
  }


  /** @x_or_y, @try_y and @try_x: each step the foe could take, until one is allowed. */
  private async tryFoeSteps(): Promise<Exit> {
    let exit: Exit = null;

    await this.m.call(J.j_rand);
    if (!this.negative()) {
      exit = await this.tryFoeStep(ZP_MAIN.delta_x, 0x74D4);
    }
    if (exit == null) {
      exit = await this.tryFoeStep(ZP_MAIN.delta_y, 0x74EC);
    }
    if (exit == null) {
      exit = await this.tryFoeStep(ZP_MAIN.delta_x, 0x7504);
    }

    return exit;
  }


  private async tryFoeStep(delta: number, jinxSite: number): Promise<Exit> {
    let exit: Exit = null;

    if (this.lda(this.peek(delta)) !== 0) {
      const alongX: boolean = delta === ZP_MAIN.delta_x;

      this.add(this.peek(alongX ? ZP_MAIN.temp_x : ZP_MAIN.temp_y));
      this.poke(alongX ? PRTY.dest_x : PRTY.dest_y, this.cpu.a);
      this.poke(alongX ? PRTY.dest_y : PRTY.dest_x, this.lda(this.peek(alongX ? ZP_MAIN.temp_y : ZP_MAIN.temp_x)));
      exit = await this.sub(jinxSite, (): Promise<Exit> => this.doJinx());
      if (exit == null) {
        await this.m.call(J.j_gettile_drawn_map);
        await this.sub(jinxSite + 6, (): Promise<Exit> => this.legalMoveCombat());
        if (!this.carry()) {
          exit = C.do_foe_move;
        }
      }
    }

    return exit;
  }


  /** ULT4.s do_foe_move: the foe steps to (dest_x, dest_y), or off the arena's edge and flees. */
  public async doFoeMove(): Promise<Exit> {
    let exit: Exit = C.fleeing;

    this.ldx(this.peek(zp_cur_foe_index));
    this.poke(O.combat_foe_prev_x + this.cpu.x, this.lda(this.peek(O.combat_foe_cur_x + this.cpu.x)));
    this.poke(O.combat_foe_prev_y + this.cpu.x, this.lda(this.peek(O.combat_foe_cur_y + this.cpu.x)));
    this.lda(this.peek(PRTY.dest_x));
    this.cmp(O.xy_last_screen);
    if (!this.carry()) {
      this.poke(O.combat_foe_cur_x + this.cpu.x, this.cpu.a);
      this.lda(this.peek(PRTY.dest_y));
      this.cmp(O.xy_last_screen);
      if (!this.carry()) {
        this.poke(O.combat_foe_cur_y + this.cpu.x, this.cpu.a);
        await this.m.call(J.j_update_view_combat);
        exit = C.check_tile_effect;
      }
    }

    return exit;
  }


  /** ULT4.s check_tile_effect: a field or lava under the foe poisons, burns or sleeps it. */
  public async checkTileEffect(): Promise<Exit> {
    this.poke(ZP_MAIN.curr_player, this.lda(0x00));
    this.ldx(this.peek(zp_cur_foe_index));
    this.poke(PRTY.dest_x, this.lda(this.peek(O.combat_foe_cur_x + this.cpu.x)));
    this.poke(PRTY.dest_y, this.lda(this.peek(O.combat_foe_cur_y + this.cpu.x)));
    await this.m.call(J.j_gettile_actual_map);
    this.ldx(this.peek(zp_cur_foe_index));
    const effect: 'poison' | 'fire' | 'sleep' | null = this.fieldEffect();

    if (effect === 'sleep') {
      await this.sleepFoe();
    } else if ((effect === 'poison') || ((effect === 'fire') && this.burns())) {
      await this.m.call(J.j_rand);
      this.poke(ZP_MAIN.damage, this.lda(this.cpu.a & 0x7F));
      await this.playsfx(SOUND.sound_damage);
      await this.sub(0x75AA, (): Promise<Exit> => this.inflictDamage());
    }

    return C.next_foe;
  }


  private fieldEffect(): 'poison' | 'fire' | 'sleep' | null {
    const fields: readonly [ number, 'poison' | 'fire' | 'sleep' ][] = [
      [ TILES.tile_field_poison, 'poison' ], [ TILES.tile_field_fire, 'fire' ], [ TILES.tile_field_sleep, 'sleep' ], [ TILES.tile_lava, 'fire' ],
    ];
    let effect: 'poison' | 'fire' | 'sleep' | null = null;

    for (const [ tile, ofTile ] of fields) {
      if (effect == null) {
        this.cmp(tile);
        if (this.zero()) {
          effect = ofTile;
        }
      }
    }

    return effect;
  }


  /** A lava lizard and the daemons and dragons and the rest above it do not burn. */
  private burns(): boolean {
    let burns: boolean = false;

    this.lda(this.peek(O.combat_foe_tile_type + this.cpu.x));
    this.cmp(TILES.tile_lava_lizard);
    if (!this.zero()) {
      this.cmp(TILES.tile_daemon);
      burns = !this.carry();
    }

    return burns;
  }


  /** The undead never sleep; others may, the more likely the fewer their hit points. */
  private async sleepFoe(): Promise<void> {
    this.lda(this.peek(O.combat_foe_tile_type + this.cpu.x));
    await this.m.call(SPELL_ENTRIES.is_undead);
    if (!this.zero()) {
      await this.m.call(J.j_rand);
      this.cmp(this.peek(O.combat_foe_hp + this.cpu.x));
      if (this.carry()) {
        this.poke(O.combat_foe_slept + this.cpu.x, this.lda(0x01));
        await this.playsfx(SOUND.sound_damage);
      }
    }
  }


  public nextFoe(): Exit {
    return ((this.dec(zp_cur_foe_index) & 0x80) === 0) ? C.foe_take_turn : C.end_foes_turn;
  }


  /** ULT4.s fleeing: the foe is gone; letting a foe that is not evil go is compassionate and just. */
  public async fleeing(): Promise<Exit> {
    await this.sub(0x75B7, (): Promise<Exit> => this.printNewline());
    this.ldx(this.peek(zp_cur_foe_index));
    this.lda(this.peek(O.combat_foe_tile_type + this.cpu.x));
    await this.sub(0x75BF, (): Promise<Exit> => this.printTargetName());
    await this.print(CI.flees);
    this.ldx(this.peek(zp_cur_foe_index));
    this.lda(this.peek(O.combat_foe_tile_type + this.cpu.x));
    await this.m.call(CL.is_evil);
    if (!this.negative()) {
      await this.incVirtue(ROST.virtue_compassion, 0x01);
      await this.incVirtue(ROST.virtue_justice, 0x01);
    }
    this.lda(0x00);
    this.ldx(this.peek(zp_cur_foe_index));
    this.poke(O.combat_foe_tile_type + this.cpu.x, this.cpu.a);
    this.poke(O.combat_foe_hp + this.cpu.x, this.cpu.a);
    await this.playsfx(SOUND.sound_alert);

    return C.check_tile_effect;
  }


  protected async incVirtue(virtue: number, amount: number): Promise<void> {
    this.ldy(virtue);
    this.lda(amount);
    await this.m.call(CL.inc_virtue);
  }


  protected async decVirtue(virtue: number, amount: number): Promise<void> {
    this.ldy(virtue);
    this.lda(amount);
    await this.m.call(CL.dec_virtue);
  }


  /**
   * ULT4.s do_jinx: under a jinx, a foe stepping onto another foe strikes it, and the move ends
   * there: the original drops its caller's return and jumps on.
   */
  public async doJinx(): Promise<Exit> {
    let exit: Exit = null;

    this.lda(this.peek(ZP_MAIN.magic_aura));
    this.cmp(ZP_MAIN.aura_jinx);
    if (this.zero()) {
      this.cpu.push(this.lda(this.peek(zp_cur_foe_index)));
      await this.sub(0x7601, (): Promise<Exit> => this.checkHitFoe());
      if (!this.negative()) {
        this.poke(O.attack_sprite, this.lda(TILES.tile_attack_red));
        this.poke(O.target_x, this.lda(this.peek(PRTY.dest_x)));
        this.poke(O.target_y, this.lda(this.peek(PRTY.dest_y)));
        await this.m.call(J.j_update_view_combat);
        await this.playsfx(SOUND.sound_damage);
        this.lda(0x00);
        this.poke(O.attack_sprite, this.cpu.a);
        this.poke(ZP_MAIN.curr_player, this.cpu.a);
        await this.m.call(J.j_rand);
        this.poke(ZP_MAIN.damage, this.lda(this.cpu.a & 0x3F));
        await this.sub(0x762B, (): Promise<Exit> => this.inflictDamage());
        await this.m.call(J.j_update_view_combat);
        this.poke(zp_cur_foe_index, this.lda(this.cpu.pull()));
        this.dropReturn();
        exit = C.check_tile_effect;
      } else {
        this.poke(zp_cur_foe_index, this.lda(this.cpu.pull()));
      }
    }

    return exit;
  }


  /** ULT4.s end_foes_turn: magic comes back, the turn counts, auras wear off, and the players go again. */
  public async endFoesTurn(): Promise<Exit> {
    let exit: Exit = C.start_players_turn;

    await this.m.call(CL.recover_mp);
    await this.m.call(J.j_update_view_combat);
    this.inc(ZP_MAIN.turn_counter);
    const over: Exit = await this.sub(0x7645, (): Promise<Exit> => this.checkSceneOver());

    if (over != null) {
      exit = over;
    } else {
      if ((this.lda(this.peek(ZP_MAIN.aura_duration)) !== 0) && (this.dec(ZP_MAIN.aura_duration) === 0)) {
        this.poke(ZP_MAIN.magic_aura, this.lda(ZP_MAIN.aura_none));
      }
      await this.m.call(J.j_update_status);
    }

    return exit;
  }


  /** ULT4.s steal_food: a gremlin eats 25 of the party's food. */
  public async stealFood(): Promise<Exit> {
    this.lda(0x25);
    await this.m.call(CL.eat_food);
    await this.m.call(J.j_update_status);
    await this.playsfx(SOUND.sound_alert);

    return null;
  }


  /** ULT4.s try_steal_gold: one time in four, a rogue takes up to 63 gold, in BCD, and no more than there is. */
  public async tryStealGold(): Promise<Exit> {
    await this.m.call(J.j_rand);
    if (this.lda(this.cpu.a & CHANCE_4) === 0) {
      await this.m.call(J.j_rand);
      this.lda(this.cpu.a & 0x3F);
      await this.m.call(CL.encode_bcd_value);
      this.poke(zp_number1, this.cpu.a);
      this.cpu.setFlag(DECIMAL, true);
      this.setCarry(true);
      this.lda(this.peek(ROST.gold_lo));
      this.cpu.sbc(this.peek(zp_number1));
      this.poke(ROST.gold_lo, this.cpu.a);
      this.lda(this.peek(ROST.gold_hi));
      this.cpu.sbc(0x00);
      this.poke(ROST.gold_hi, this.cpu.a);
      if (!this.carry()) {
        this.lda(0x00);
        this.poke(ROST.gold_lo, this.cpu.a);
        this.poke(ROST.gold_hi, this.cpu.a);
      }
      this.cpu.setFlag(DECIMAL, false);
      await this.playsfx(SOUND.sound_alert);
      await this.m.call(J.j_update_status);
    }

    return null;
  }


  /** ULT4.s check_scene_over: with no foes left, victory; outside a dungeon room, the caller's return is dropped for it. */
  public checkSceneOver(): Promise<Exit> {
    let foes: boolean = true;

    this.lda(this.peek(PRTY.game_mode));
    this.cmp(PRTY.mode_combat_dng_room);
    if (!this.zero()) {
      this.ldx(O.foes_max);
      do {
        foes = this.lda(this.peek(O.combat_foe_tile_type + this.cpu.x)) !== 0;
      } while (!foes && (this.dex() < 0x80));
    }

    return Promise.resolve(foes ? this.checkPlayersGone() : this.vanquished());
  }


  private vanquished(): Exit {
    this.dropReturn();

    return C.foes_vanquished;
  }


  /** ULT4.s check_players_gone: with no players left in the arena, they have fled. */
  public checkPlayersGone(): Exit {
    let here: boolean = false;
    let exit: Exit = null;

    this.ldx(ROST.player_max);
    do {
      here = this.lda(this.peek(O.combat_player_tile + this.cpu.x)) !== 0;
    } while (!here && (this.dex() < 0x80));
    if (!here) {
      this.dropReturn();
      exit = C.player_flee;
    }

    return exit;
  }


  /** ULT4.s player_flee: out of a dungeon room by its exit, or out of the fight. */
  public playerFlee(): Exit {
    this.lda(this.peek(PRTY.game_mode));
    this.cmp(PRTY.mode_combat_dng_room);

    return this.zero() ? CL.combat_exit_room : C.combat_players_fled;
  }


  /** ULT4.s combat_players_fled: running from evil costs valour; from the innocent it is compassion and justice. */
  public async combatPlayersFled(): Promise<Exit> {
    this.lda(this.peek(ZP_COMBAT.foe_type_encountered));
    await this.m.call(CL.is_evil);
    if (this.negative()) {
      await this.print(CI.battle_lost);
      await this.decVirtue(ROST.virtue_valor, 0x02);
    } else {
      await this.incVirtue(ROST.virtue_compassion, 0x02);
      await this.incVirtue(ROST.virtue_justice, 0x02);
    }

    return C.combat_over;
  }


  // --- the end of a fight (ULT4.s:7070-7206) ------------------------------------------------

  /** ULT4.s foes_vanquished: victory, valour for beating evil, and its loot: a chest, a pirate's ship. */
  public async foesVanquished(): Promise<Exit> {
    await this.print(CI.victory);
    this.lda(this.peek(ZP_COMBAT.foe_type_encountered));
    await this.m.call(CL.is_evil);
    if (this.negative()) {
      this.ldy(ROST.virtue_valor);
      await this.m.call(J.j_rand);
      this.lda(this.cpu.a & 0x01);
      await this.m.call(CL.inc_virtue);
    }
    this.lda(this.peek(PRTY.game_mode));
    this.cmp(PRTY.mode_combat_inn);
    if (!this.zero()) {
      this.lda(this.peek(ZP_MAIN.game_mode_pre_combat));
      this.cmp(PRTY.mode_dungeon);
      if (this.zero()) {
        await this.dungeonLoot();
      } else {
        await this.worldLoot();
      }
    }

    return C.combat_over;
  }


  /** A chest where the fight began, from anything with pockets on ground that is open; a pirate leaves its ship. */
  private async worldLoot(): Promise<void> {
    const loot: 'chest' | 'ship' | null = this.lootOf();

    if (loot === 'ship') {
      await this.sub(0x780A, (): Promise<Exit> => this.getFreeObjectSlot());
      this.placeLoot(TILES.tile_ship_west);
    } else if (loot === 'chest') {
      this.lda(this.peek(ZP_COMBAT.pre_combat_tile));
      await this.m.call(J.j_blocked_tile);
      if (!this.negative()) {
        await this.sub(0x77ED, (): Promise<Exit> => this.getFreeObjectSlot());
        this.placeLoot(TILES.tile_chest);
        this.poke(O.npc_dialogue + this.cpu.x, this.lda(0x00));
      }
    }
  }


  private lootOf(): 'chest' | 'ship' | null {
    let loot: 'chest' | 'ship' | null = null;

    this.lda(this.peek(ZP_COMBAT.foe_type_encountered));
    this.cmp(TILES.tile_monster_land);
    if (this.carry()) {
      loot = this.leavesChest();
    } else {
      this.cmp(TILES.tile_pirate);
      if (this.zero()) {
        loot = 'ship';
      } else if (this.isPerson()) {
        loot = this.leavesChest();
      }
    }

    return loot;
  }


  /** A class or an NPC, as the original's four compares sort the tiles. */
  private isPerson(): boolean {
    let person: boolean = false;

    this.cmp(TILES.tile_class_first);
    if (this.carry()) {
      this.cmp(TILES.tile_npc_last);
      if (!this.carry()) {
        this.cmp(TILES.tile_class_last);
        if (this.carry()) {
          this.cmp(TILES.tile_npc_first);
          person = this.carry();
        } else {
          person = true;
        }
      }
    }

    return person;
  }


  /** Bats, slimes, gazers, insects and wisps carry nothing. */
  private leavesChest(): 'chest' | null {
    let carries: boolean = true;

    for (const pocketless of [ TILES.tile_bat, TILES.tile_slime, TILES.tile_gazer, TILES.tile_insects, TILES.tile_wisp ]) {
      if (carries) {
        this.cmp(pocketless);
        carries = !this.zero();
      }
    }

    return carries ? 'chest' : null;
  }


  private placeLoot(tile: number): void {
    this.poke(O.object_xpos + this.cpu.x, this.lda(this.peek(ZP_COMBAT.pre_combat_x)));
    this.poke(O.object_ypos + this.cpu.x, this.lda(this.peek(ZP_COMBAT.pre_combat_y)));
    this.lda(tile);
    this.poke(O.object_tile_type + this.cpu.x, this.cpu.a);
    this.poke(O.object_tile_sprite + this.cpu.x, this.cpu.a);
  }


  /** In a dungeon, a chest on the party's square, if it is empty. */
  private async dungeonLoot(): Promise<void> {
    if (this.leavesDungeonChest()) {
      this.poke(PRTY.dest_x, this.lda(this.peek(PRTY.player_xpos)));
      this.poke(PRTY.dest_y, this.lda(this.peek(PRTY.player_ypos)));
      await this.m.call(J.j_gettile_dungeon);
      if (this.zero()) {
        this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.lda(DUNGEON.dng_tile_chest));
      }
    }
  }


  private leavesDungeonChest(): boolean {
    let carries: boolean = true;

    this.lda(this.peek(ZP_COMBAT.foe_type_encountered));
    for (const pocketless of [ TILES.tile_bat, TILES.tile_insects, TILES.tile_slime ]) {
      if (carries) {
        this.cmp(pocketless);
        carries = !this.zero();
      }
    }

    return carries;
  }


  /** ULT4.s get_free_object_slot: X, a free map object; or, failing one, an inanimate one at random. */
  public async getFreeObjectSlot(): Promise<Exit> {
    let found: boolean = false;
    let random: boolean = false;

    this.ldx(O.object_max);
    while (!found && !random) {
      if (this.lda(this.peek(O.object_tile_type + this.cpu.x)) === 0) {
        found = true;
      } else if (this.dex() >= 0x80) {
        random = true;
      } else {
        this.lda(this.peek(ZP_MAIN.game_mode_pre_combat));
        this.cmp(PRTY.mode_world);
        if (this.zero()) {
          this.cpu.compare(this.cpu.x, O.object_inanimate_first);
          random = !this.carry();
        }
      }
    }
    if (random) {
      this.lda(O.object_last - O.object_inanimate_first);
      await this.sub(0x785A, (): Promise<Exit> => this.randModulo());
      this.add(O.object_inanimate_first);
      this.ldx(this.cpu.a);
    }

    return null;
  }


  /** ULT4.s combat_over: back to the mode the fight began in; out of the inn's, back to its caller. */
  public async combatOver(): Promise<Exit> {
    let exit: Exit = E.cmd_done;

    this.lda(this.peek(PRTY.game_mode));
    this.cmp(PRTY.mode_combat_inn);
    if (this.zero()) {
      this.poke(PRTY.game_mode, this.lda(this.peek(ZP_MAIN.game_mode_pre_combat)));
      await this.musicCtl(MUSIC.music_explore);
      exit = null;
    } else {
      this.poke(PRTY.game_mode, this.lda(this.peek(ZP_MAIN.game_mode_pre_combat)));
      this.cmp(PRTY.mode_dungeon);
      if (this.zero()) {
        await this.m.call(JUMP_OVERLAY.j_dng_neighbor_tiles);
      }
      await this.musicCtl(MUSIC.music_main);
      this.poke(ZP_MAIN.key_buf_len, this.lda(0x00));
    }

    return exit;
  }


  // --- foes' blows (ULT4.s:7208-7276) -------------------------------------------------------

  /** ULT4.s do_foe_melee_attack: a blow at the player, which its armour (or protection, half the time) may turn. */
  public async doFoeMeleeAttack(): Promise<Exit> {
    let damage: boolean = true;

    this.ldx(this.peek(ZP_MAIN.curr_player));
    this.poke(O.target_x, this.lda(this.peek(O.combat_player_xpos - 1 + this.cpu.x)));
    this.poke(O.target_y, this.lda(this.peek(O.combat_player_ypos - 1 + this.cpu.x)));
    this.poke(O.attack_sprite, this.lda(TILES.tile_attack_small));
    await this.m.call(J.j_update_view_combat);
    await this.playsfx(SOUND.sound_foe_attack);
    this.poke(O.attack_sprite, this.lda(0x00));
    this.lda(this.peek(ZP_MAIN.magic_aura));
    this.cmp(ZP_MAIN.aura_protection);
    if (this.zero()) {
      await this.m.call(J.j_rand);
      damage = !this.negative();
    }
    if (damage) {
      await this.m.call(J.j_get_stats_ptr);
      this.lda(ROST.player_armour);
      this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y));
      this.ldx(this.cpu.a);
      this.poke(zp_amount, this.lda(this.peek(CT.armour_table + this.cpu.x)));
      await this.m.call(J.j_rand);
      this.cmp(this.peek(zp_amount));
      damage = this.carry();
    }
    if (damage) {
      await this.sub(0x78CE, (): Promise<Exit> => this.playerInjured());
    } else {
      await this.m.call(J.j_update_view_combat);
    }

    return C.check_tile_effect;
  }


  /** ULT4.s player_injured: up to a quarter of the foe's power off the player's hit points, in BCD. */
  public async playerInjured(): Promise<Exit> {
    this.poke(O.attack_sprite, this.lda(TILES.tile_attack_red));
    await this.m.call(CL.invert_player_name);
    await this.m.call(J.j_update_view_combat);
    await this.playsfx(SOUND.sound_firewalk);
    this.poke(O.attack_sprite, this.lda(0x00));
    await this.m.call(J.j_update_view_combat);
    this.ldx(this.peek(zp_cur_foe_index));
    this.lda(this.peek(O.combat_foe_tile_type + this.cpu.x));
    await this.sub(0x78F1, (): Promise<Exit> => this.foeIndexFromTile());
    this.ldx(this.cpu.a);
    this.lda(this.peek(CT.foe_power_table + this.cpu.x));
    this.cpu.a = this.cpu.lsr(this.cpu.lsr(this.cpu.a));
    await this.sub(0x78FA, (): Promise<Exit> => this.randModulo());
    await this.m.call(CL.encode_bcd_value);
    await this.m.call(CL.dec_player_hp);
    if (this.zero()) {
      await this.m.call(J.j_printname);
      await this.print(CI.is_killed);
      await this.incVirtue(ROST.virtue_sacrifice, 0x01);
    }
    await this.m.call(CL.invert_player_name);
    await this.m.call(J.j_update_status);

    return null;
  }


  // --- moving and fleeing (ULT4.s:7306-7520) ------------------------------------------------

  public combatMoveUp(): Promise<Exit> {
    return this.combatMove(CI.north, 0, -1);
  }


  public combatMoveDown(): Promise<Exit> {
    return this.combatMove(CI.south, 0, 1);
  }


  public combatMoveRight(): Promise<Exit> {
    return this.combatMove(CI.east, 1, 0);
  }


  public combatMoveLeft(): Promise<Exit> {
    return this.combatMove(CI.west, -1, 0);
  }


  /** The direction's name, and the player's square a step that way: `ldy` / `iny` or `dey` / `sty` along it. */
  private async combatMove(block: IInlineData, dx: number, dy: number): Promise<Exit> {
    const alongX: boolean = dx !== 0;

    await this.print(block);
    this.ldx(this.peek(ZP_MAIN.curr_player));
    this.dex();
    this.poke(alongX ? PRTY.dest_y : PRTY.dest_x, this.lda(this.peek((alongX ? O.combat_player_ypos : O.combat_player_xpos) + this.cpu.x)));
    this.ldy(this.peek((alongX ? O.combat_player_xpos : O.combat_player_ypos) + this.cpu.x));
    if ((dx + dy) > 0) {
      this.iny();
    } else {
      this.dey();
    }
    this.poke(alongX ? PRTY.dest_x : PRTY.dest_y, this.cpu.y);

    return C.try_move;
  }


  /** ULT4.s try_move: off the edge is fleeing; a wall blocks; rough ground may slow; in a dungeon room, the floor's triggers. */
  public async tryMove(): Promise<Exit> {
    let exit: Exit = C.combat_cmd_done;

    await this.playsfx(SOUND.sound_footstep);
    if (this.offArena()) {
      exit = C.try_flee;
    } else {
      await this.m.call(J.j_gettile_drawn_map);
      await this.m.call(J.j_blocked_tile);
      if (this.negative()) {
        exit = E.done_blocked;
      } else {
        await this.m.call(J.j_gettile_drawn_map);
        await this.sub(0x79E9, (): Promise<Exit> => this.checkSlowTerrain());
        if (this.zero()) {
          await this.sub(0x79EE, (): Promise<Exit> => this.doneSlowProgress());
        } else {
          await this.stepTo();
        }
      }
    }

    return exit;
  }


  private offArena(): boolean {
    let off: boolean = true;

    this.lda(this.peek(PRTY.dest_x));
    this.cmp(O.xy_last_screen);
    if (!this.carry()) {
      this.lda(this.peek(PRTY.dest_y));
      this.cmp(O.xy_last_screen);
      off = this.carry();
    }

    return off;
  }


  private async stepTo(): Promise<void> {
    this.ldx(this.peek(ZP_MAIN.curr_player));
    this.dex();
    this.poke(O.combat_player_xpos + this.cpu.x, this.lda(this.peek(PRTY.dest_x)));
    this.poke(O.combat_player_ypos + this.cpu.x, this.lda(this.peek(PRTY.dest_y)));
    await this.playsfx(SOUND.sound_footstep);
    this.lda(this.peek(PRTY.game_mode));
    this.cmp(PRTY.mode_combat_dng_room);
    if (this.zero()) {
      await this.floorTriggers();
    }
  }


  /** A dungeon room's four triggers: stepping on one's square changes the tiles at its one or two places. */
  private async floorTriggers(): Promise<void> {
    this.ldx(0x00);
    this.poke(zp_index1, this.cpu.x);
    do {
      if (this.triggered()) {
        if (this.lda(this.peek(O.dng_trigger_new_pos1 + this.cpu.x)) !== 0) {
          await this.sub(0x7A30, (): Promise<Exit> => this.xyToOffset());
          this.poke(O.world_tiles + this.cpu.y, this.lda(this.peek(O.dng_trigger_new_tile + this.cpu.x)));
        }
        if (this.lda(this.peek(O.dng_trigger_new_pos2 + this.cpu.x)) !== 0) {
          await this.sub(0x7A3E, (): Promise<Exit> => this.xyToOffset());
          this.poke(O.world_tiles + this.cpu.y, this.lda(this.peek(O.dng_trigger_new_tile + this.cpu.x)));
        }
      }
      this.lda(this.peek(zp_index1));
      this.add(0x04);
      this.poke(zp_index1, this.cpu.a);
      this.ldx(this.cpu.a);
      this.cmp(0x10);
    } while (!this.carry());
  }


  private triggered(): boolean {
    let here: boolean = false;

    if ((this.lda(this.peek(O.dng_trigger_new_tile + this.cpu.x)) !== 0) && (this.lda(this.peek(O.dng_trigger_pos + this.cpu.x)) !== 0)) {
      this.div16(this.cpu.a);
      this.cmp(this.peek(PRTY.dest_x));
      if (this.zero()) {
        this.lda(this.peek(O.dng_trigger_pos + this.cpu.x) & 0x0F);
        this.cmp(this.peek(PRTY.dest_y));
        here = this.zero();
      }
    }

    return here;
  }


  /** ULT4.s xy_to_offset: A's two nibbles, x and y, as an index into the 11 x 11 arena, in Y. */
  public xyToOffset(): Promise<Exit> {
    this.cpu.push(this.cpu.a);
    this.poke(zp_number2, this.div16(this.cpu.a));
    this.lda(this.cpu.pull() & 0x0F);
    this.ldy(this.cpu.a);
    this.lda(this.peek(CT.mult_by_11 + this.cpu.y));
    this.add(this.peek(zp_number2));
    this.ldy(this.cpu.a);

    return Promise.resolve(null);
  }


  /** ULT4.s try_flee: out of a dungeon room, the whole party must go by one exit. */
  public async tryFlee(): Promise<Exit> {
    let exit: Exit = C.do_flee;

    this.lda(this.peek(PRTY.game_mode));
    this.cmp(PRTY.mode_combat_dng_room);
    if (this.zero()) {
      let sameExit: boolean = true;

      if (this.lda(this.peek(CV.flee_x)) !== 0) {
        this.cmp(this.peek(PRTY.dest_x));
        sameExit = this.zero();
      } else if (this.lda(this.peek(CV.flee_y)) !== 0) {
        this.cmp(this.peek(PRTY.dest_y));
        sameExit = this.zero();
      } else {
        this.chooseExit();
      }
      if (!sameExit) {
        await this.print(CI.same_exit);
        await this.playsfx(SOUND.sound_blocked);
        exit = C.combat_cmd_done;
      }
    }

    return exit;
  }


  /** The first player out picks the exit: off the east or west edge, else the north or south. */
  private chooseExit(): void {
    this.lda(this.peek(PRTY.dest_x));
    this.cmp(O.xy_last_screen);
    if (this.carry()) {
      this.poke(CV.flee_x, this.cpu.a);
    } else {
      this.poke(CV.flee_y, this.lda(this.peek(PRTY.dest_y)));
    }
  }


  /** ULT4.s do_flee: the player is out; fleeing evil unhurt costs valour and sacrifice. */
  public async doFlee(): Promise<Exit> {
    this.ldx(this.peek(ZP_MAIN.curr_player));
    this.dex();
    this.lda(O.xy_fled);
    this.poke(O.combat_player_xpos + this.cpu.x, this.cpu.a);
    this.poke(O.combat_player_ypos + this.cpu.x, this.cpu.a);
    this.poke(O.combat_player_tile + this.cpu.x, this.lda(0x00));
    await this.playsfx(SOUND.sound_alert);
    this.lda(this.peek(PRTY.game_mode));
    this.cmp(PRTY.mode_combat_wandering);
    if (this.zero()) {
      this.lda(this.peek(ZP_COMBAT.foe_type_encountered));
      await this.m.call(CL.is_evil);
      if (this.negative() && await this.unhurt()) {
        await this.decVirtue(ROST.virtue_valor, 0x02);
        await this.decVirtue(ROST.virtue_sacrifice, 0x02);
      }
    }

    return C.combat_cmd_done;
  }


  /** The high bytes of the player's hit points and its maximum agree. */
  private async unhurt(): Promise<boolean> {
    await this.m.call(J.j_get_stats_ptr);
    this.ldy(ROST.player_cur_hp_hi);
    this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y));
    this.ldy(ROST.player_max_hp_hi);
    this.cmp(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y));

    return this.zero();
  }



  // --- the players' attacks (ULT4.s:7527-7923) ----------------------------------------------

  /** ULT4.s combat_cmd_attack: a direction, and a blow with the weapon in hand or a missile from it. */
  public async combatCmdAttack(): Promise<Exit> {
    let exit: Exit = E.done_pass;

    this.poke(CV.missile_traveled, this.lda(0x00));
    await this.print(CI.attack);
    await this.sub(0x7B1E, (): Promise<Exit> => this.inputTargetXy());
    if (!this.zero()) {
      this.poke(O.target_x, this.lda(this.peek(PRTY.dest_x)));
      this.poke(O.target_y, this.lda(this.peek(PRTY.dest_y)));
      this.ldx(this.peek(CV.current_weapon));
      if (this.lda(this.peek(CT.is_ranged_table + this.cpu.x)) !== 0) {
        exit = C.ranged_attack;
      } else {
        this.cpu.compare(this.cpu.x, ROST.weapon_halberd);
        if (this.zero()) {
          this.reachFarther();
        }
        await this.sub(0x7B4E, (): Promise<Exit> => this.nextArenaTile());
        exit = this.negative() ? C.missed : C.melee_attack;
      }
    }

    return exit;
  }


  /** A halberd reaches a square farther. */
  private reachFarther(): void {
    this.setCarry(false);
    this.lda(this.peek(O.target_x));
    this.cpu.adc(this.peek(ZP_MAIN.delta_x));
    this.poke(O.target_x, this.cpu.a);
    this.setCarry(false);
    this.lda(this.peek(O.target_y));
    this.cpu.adc(this.peek(ZP_MAIN.delta_y));
    this.poke(O.target_y, this.cpu.a);
  }


  /** ULT4.s melee_attack: a blow at the square beside; a dagger that finds no foe there is thrown. */
  public async meleeAttack(): Promise<Exit> {
    let exit: Exit = C.did_hit;

    this.poke(O.attack_sprite, this.lda(TILES.tile_attack_small));
    await this.m.call(J.j_update_view_combat);
    this.poke(O.attack_sprite, this.lda(0x00));
    await this.playsfx(SOUND.sound_player_attack);
    await this.sub(0x7B68, (): Promise<Exit> => this.checkHitFoe());
    if (this.negative()) {
      this.poke(CV.missile_traveled, this.lda(0x01));
      this.lda(this.peek(CV.current_weapon));
      this.cmp(ROST.weapon_dagger);
      exit = this.zero() ? C.ranged_attack : C.missed;
    }

    return exit;
  }


  public didHit(): Exit {
    this.inc(CV.missile_traveled);

    return C.target_hit;
  }


  /** ULT4.s ranged_attack: as far as the arena, or as far as the digit typed for flaming oil. */
  public async rangedAttack(): Promise<Exit> {
    let exit: Exit = C.use_weapon;

    this.poke(CV.aim_range, this.lda(O.xy_last_screen));
    this.lda(this.peek(CV.current_weapon));
    this.cmp(ROST.weapon_flaming_oil);
    if (this.zero()) {
      await this.print(CI.range);
      await this.sub(0x7B98, (): Promise<Exit> => this.inputChar());
      this.subtract(CHAR.char_num_first);
      this.cmp(0x0A);
      if (this.carry()) {
        exit = C.missed;
      } else {
        this.poke(CV.aim_range, this.cpu.a);
      }
    }

    return exit;
  }


  /** ULT4.s use_weapon: a thrown dagger or flask comes out of the party's stock; the last one leaves the hand empty. */
  public async useWeapon(): Promise<Exit> {
    let exit: Exit = C.check_target;

    this.lda(this.peek(CV.current_weapon));
    this.cmp(ROST.weapon_dagger);
    if (!this.zero()) {
      this.cmp(ROST.weapon_flaming_oil);
    }
    if (this.zero()) {
      this.add(ROST.party_stat_weapons);
      this.ldy(this.cpu.a);
      if (this.lda(this.peek(ROST.party_stats + this.cpu.y)) !== 0) {
        await this.sub(0x7BBC, (): Promise<Exit> => this.decStat());
      } else {
        exit = C.last_one;
      }
    }

    return exit;
  }


  public async lastOne(): Promise<Exit> {
    this.lda(0x00);
    await this.m.call(J.j_get_stats_ptr);
    this.ldy(ROST.player_weapon);
    this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.lda(ROST.weapon_none));
    await this.print(CI.last_one);

    return C.check_target;
  }


  /** ULT4.s check_target: the missile flies square by square until it strikes a foe, a wall, or its range. */
  public async checkTarget(): Promise<Exit> {
    let exit: Exit = null;

    while (exit == null) {
      await this.sub(0x7BDB, (): Promise<Exit> => this.nextArenaTile());
      if (this.negative()) {
        exit = C.missed;
      } else {
        this.poke(O.attack_sprite, this.lda(TILES.tile_attack_small));
        this.wandSprite();
        await this.m.call(J.j_update_view_combat);
        this.poke(O.attack_sprite, this.lda(0x00));
        if (this.lda(this.peek(CV.missile_traveled)) === 0) {
          await this.playsfx(SOUND.sound_player_attack);
        }
        this.inc(CV.missile_traveled);
        await this.sub(0x7C09, (): Promise<Exit> => this.checkHitFoe());
        if (!this.negative()) {
          exit = C.target_hit;
        } else if (this.dec(CV.aim_range) === 0) {
          exit = C.missed;
        }
      }
    }

    return exit;
  }


  /** A magic wand's bolt is blue. */
  private wandSprite(): void {
    this.lda(this.peek(CV.current_weapon));
    this.cmp(ROST.weapon_magic_wand);
    if (this.zero()) {
      this.poke(O.attack_sprite, this.lda(TILES.tile_attack_blue));
    }
  }


  /**
   * ULT4.s target_hit: in the Abyss only a magic axe or better bites. Flaming oil sets the ground
   * alight; dexterity decides the hit and strength with the weapon the damage.
   */
  public async targetHit(): Promise<Exit> {
    let exit: Exit = C.missed;

    if (this.canDamage()) {
      await this.oilFire();
      this.poke(O.attack_sprite, this.lda(TILES.tile_attack_red));
      this.wandSprite();
      if (await this.hits()) {
        await this.calcDamage();
        exit = C.end_attack;
      }
    }

    return exit;
  }


  private canDamage(): boolean {
    let can: boolean = true;

    this.lda(this.peek(PRTY.current_location));
    this.cmp(PRTY.loc_dng_abyss);
    if (this.zero()) {
      this.lda(this.peek(CV.current_weapon));
      this.cmp(ROST.weapon_magic_axe);
      can = this.carry();
    }

    return can;
  }


  private async oilFire(): Promise<void> {
    this.lda(this.peek(CV.current_weapon));
    this.cmp(ROST.weapon_flaming_oil);
    if (this.zero()) {
      await this.m.call(J.j_gettile_actual_map);
      this.cmp(TILES.tile_water_last);
      if (this.carry()) {
        this.poke(O.world_tiles + this.cpu.y, this.lda(TILES.tile_field_fire));
      }
    }
  }


  /** Hit chance (128 + 2 x dexterity) / 256, certain at 64 or more. */
  private async hits(): Promise<boolean> {
    let hit: boolean = true;

    await this.m.call(J.j_get_stats_ptr);
    this.ldy(ROST.player_dexterity);
    this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y));
    await this.m.call(CL.decode_bcd_value);
    this.cpu.a = this.cpu.asl(this.cpu.a);
    this.add(0x80);
    if (!this.carry()) {
      this.poke(zp_amount, this.cpu.a);
      await this.m.call(J.j_rand);
      this.cmp(this.peek(zp_amount));
      hit = !this.carry();
    }

    return hit;
  }


  /** Damage up to strength plus the weapon's, at most 255. */
  private async calcDamage(): Promise<void> {
    await this.m.call(J.j_get_stats_ptr);
    this.ldy(ROST.player_strength);
    this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y));
    await this.m.call(CL.decode_bcd_value);
    this.ldx(this.peek(CV.current_weapon));
    this.add(this.peek(CT.weapon_damage_table + this.cpu.x));
    if (this.carry()) {
      this.lda(0xFF);
    }
    await this.sub(0x7C7B, (): Promise<Exit> => this.randModulo());
    this.poke(ZP_MAIN.damage, this.cpu.a);
    await this.m.call(J.j_update_view_combat);
    await this.playsfx(SOUND.sound_damage);
    this.poke(O.attack_sprite, this.lda(0x00));
    await this.sub(0x7C8D, (): Promise<Exit> => this.inflictDamage());
  }


  /**
   * ULT4.s inflict_damage: the foe's name and its wounds, or its death; a player's kill (curr_player
   * not 0) is worth a sixteenth of the foe's power, and one, in experience. Lord British cannot be hurt.
   */
  public async inflictDamage(): Promise<Exit> {
    await this.sub(0x7C93, (): Promise<Exit> => this.printNewline());
    this.ldx(this.peek(zp_cur_foe_index));
    this.poke(ZP_MAIN.foe_type_combat, this.lda(this.peek(O.combat_foe_tile_type + this.cpu.x)));
    await this.sub(0x7C9D, (): Promise<Exit> => this.printTargetName());
    this.ldx(this.peek(zp_cur_foe_index));
    this.lda(this.peek(O.combat_foe_tile_type + this.cpu.x));
    this.cmp(TILES.tile_lord_british);
    if (this.zero()) {
      await this.stillAlive();
    } else {
      this.lda(this.peek(O.combat_foe_hp + this.cpu.x));
      this.subtract(this.peek(ZP_MAIN.damage));
      this.poke(O.combat_foe_hp + this.cpu.x, this.cpu.a);
      if (this.carry()) {
        await this.stillAlive();
      } else {
        await this.killed();
      }
    }

    return null;
  }


  private async killed(): Promise<void> {
    this.lda(0x00);
    this.poke(O.combat_foe_hp + this.cpu.x, this.cpu.a);
    this.poke(O.combat_foe_tile_type + this.cpu.x, this.cpu.a);
    await this.print(CI.killed);
    if (this.lda(this.peek(ZP_MAIN.curr_player)) !== 0) {
      this.lda(this.peek(ZP_MAIN.foe_type_combat));
      await this.sub(0x7CD1, (): Promise<Exit> => this.foeIndexFromTile());
      this.ldy(this.cpu.a);
      this.div16(this.peek(CT.foe_power_table + this.cpu.y));
      this.add(0x01);
      await this.m.call(CL.encode_bcd_value);
      await this.m.call(CL.inc_player_exp);
      await this.print(CI.exp);
      this.lda(this.peek(zp_number1));
      this.cmp(0x10);
      await this.m.call(this.carry() ? J.j_printbcd : J.j_printdigit);
    }
    await this.sub(0x7CFD, (): Promise<Exit> => this.printNewline());
  }


  /** ULT4.s still_alive: how badly the foe is hurt, by its hit points against its power. */
  public async stillAlive(): Promise<Exit> {
    this.ldx(this.peek(zp_cur_foe_index));
    this.lda(this.peek(O.combat_foe_tile_type + this.cpu.x));
    await this.sub(0x7D06, (): Promise<Exit> => this.foeIndexFromTile());
    this.ldx(this.cpu.a);
    this.lda(this.peek(CT.foe_power_table + this.cpu.x));
    this.cpu.a = this.cpu.lsr(this.cpu.a);
    this.poke(zp_percent_50, this.cpu.a);
    this.poke(zp_percent_25, this.cpu.a);
    this.poke(zp_percent_25, this.cpu.lsr(this.peek(zp_percent_25)));
    this.add(this.peek(zp_percent_25));
    this.poke(zp_percent_75, this.cpu.a);
    this.ldx(this.peek(zp_cur_foe_index));
    this.lda(this.peek(O.combat_foe_hp + this.cpu.x));
    this.cmp(HP_FLEEING + 1);
    if (!this.carry()) {
      await this.print(CI.fleeing);
    } else {
      this.cmp(this.peek(zp_percent_25));
      if (!this.carry()) {
        await this.print(CI.critical);
      } else {
        await this.print(this.wounds());
        await this.print(CI.wounded);
      }
    }

    return null;
  }


  private wounds(): IInlineData {
    let wounds: IInlineData = CI.barely;

    this.cmp(this.peek(zp_percent_50));
    if (!this.carry()) {
      wounds = CI.heavily;
    } else {
      this.cmp(this.peek(zp_percent_75));
      if (!this.carry()) {
        wounds = CI.lightly;
      }
    }

    return wounds;
  }


  /** ULT4.s missed: flaming oil that falls on dry ground still sets it alight. */
  public async missed(): Promise<Exit> {
    if (this.lda(this.peek(CV.missile_traveled)) === 0) {
      await this.playsfx(SOUND.sound_player_attack);
    }
    this.poke(O.attack_sprite, this.lda(0x00));
    await this.print(CI.missed);
    this.lda(this.peek(CV.current_weapon));
    this.cmp(ROST.weapon_flaming_oil);
    if (this.zero()) {
      this.lda(this.peek(O.target_x));
      this.cmp(O.xy_last_screen);
      if (!this.carry()) {
        this.poke(PRTY.dest_x, this.cpu.a);
        this.lda(this.peek(O.target_y));
        this.cmp(O.xy_last_screen);
        if (!this.carry()) {
          this.poke(PRTY.dest_y, this.cpu.a);
          await this.m.call(J.j_gettile_actual_map);
          this.cmp(TILES.tile_water_last);
          if (this.carry()) {
            this.poke(O.world_tiles + this.cpu.y, this.lda(TILES.tile_field_fire));
          }
        }
      }
    }

    return C.end_attack;
  }


  /** ULT4.s end_attack: a thrown magic axe flies back the way it went. */
  public async endAttack(): Promise<Exit> {
    this.lda(this.peek(CV.current_weapon));
    this.cmp(ROST.weapon_magic_axe);
    if (this.zero()) {
      this.lda(this.peek(CV.missile_traveled));
      this.cmp(0x02);
      if (this.carry()) {
        await this.axeReturns();
      }
    }

    return C.combat_cmd_done;
  }


  private async axeReturns(): Promise<void> {
    this.dec(CV.missile_traveled);
    this.lda(this.peek(ZP_MAIN.delta_x));
    await this.sub(0x7DDA, (): Promise<Exit> => this.mathNegate());
    this.poke(ZP_MAIN.delta_x, this.cpu.a);
    this.lda(this.peek(ZP_MAIN.delta_y));
    await this.sub(0x7DE1, (): Promise<Exit> => this.mathNegate());
    this.poke(ZP_MAIN.delta_y, this.cpu.a);
    this.poke(O.attack_sprite, this.lda(TILES.tile_attack_small));
    do {
      await this.sub(0x7DEB, (): Promise<Exit> => this.nextArenaTile());
      await this.m.call(J.j_update_view_combat);
    } while (this.dec(CV.missile_traveled) !== 0);
    this.poke(O.attack_sprite, this.lda(0x00));
  }


  public async combatCmdCast(): Promise<Exit> {
    await this.print(CI.cast);

    return SPELL_ENTRIES.choose_spell;
  }


  public async combatCmdGet(): Promise<Exit> {
    await this.print(CI.get_chest);

    return this.tryGetChestCombat();
  }


  /** ULT4.s try_get_chest_combat: the chest under the player, gone from the arena and, in a dungeon, from its square. */
  public async tryGetChestCombat(): Promise<Exit> {
    let exit: Exit = E.done_not_here;

    this.ldx(this.peek(ZP_MAIN.curr_player));
    this.dex();
    this.poke(PRTY.dest_x, this.lda(this.peek(O.combat_player_xpos + this.cpu.x)));
    this.poke(PRTY.dest_y, this.lda(this.peek(O.combat_player_ypos + this.cpu.x)));
    await this.m.call(J.j_gettile_actual_map);
    this.cmp(TILES.tile_chest);
    if (this.zero()) {
      this.poke(O.world_tiles + this.cpu.y, this.lda(TILES.tile_floor_stone));
      this.lda(this.peek(ZP_MAIN.game_mode_pre_combat));
      this.cmp(PRTY.mode_dungeon);
      if (this.zero()) {
        this.poke(PRTY.dest_x, this.lda(this.peek(PRTY.player_xpos)));
        this.poke(PRTY.dest_y, this.lda(this.peek(PRTY.player_ypos)));
        await this.m.call(J.j_gettile_dungeon);
        this.cmp(DUNGEON.dng_tile_chest);
        if (this.zero()) {
          this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.lda(0x00));
        }
      }
      exit = CL.do_get_chest;
    }

    return exit;
  }


  public async combatCmdReady(): Promise<Exit> {
    await this.print(CI.ready_weapon);

    return CL.ask_weapon;
  }


  public async combatCmdZtats(): Promise<Exit> {
    await this.print(CI.ztats);

    return CL.zstats_for_player;
  }


  // --- the players and the foes (ULT4.s:7956-8046) ------------------------------------------

  /**
   * ULT4.s foe_index_from_tile: a foe's tile as an index into the foe tables, by the N flag the caller
   * left: monsters from 0, people from $24.
   */
  public foeIndexFromTile(): Promise<Exit> {
    if (this.negative()) {
      this.lda(this.cpu.a & 0x7F);
      this.cpu.a = this.cpu.lsr(this.cpu.a);
      this.cmp(0x08);
      if (this.carry()) {
        this.cpu.a = this.cpu.lsr(this.cpu.a);
        this.add(0x04);
      }
    } else {
      this.lda(this.cpu.a & 0x1E);
      this.cpu.a = this.cpu.lsr(this.cpu.a);
      this.cpu.adc(0x24);
    }

    return Promise.resolve(null);
  }


  /** ULT4.s is_awake: A 0 if the player is in good health or poisoned and in the party, else $FF. */
  public async isAwake(): Promise<Exit> {
    return this.statusIn([ ROST.status_Good, ROST.status_Poison ]);
  }


  /** ULT4.s is_alive: A 0 if the player is not dead and in the party, else $FF. */
  public async isAlive(): Promise<Exit> {
    return this.statusIn([ ROST.status_Good, ROST.status_Poison, ROST.status_Sleep ]);
  }


  private async statusIn(statuses: readonly number[]): Promise<Exit> {
    let found: boolean = false;

    await this.m.call(J.j_get_stats_ptr);
    this.ldy(ROST.player_status);
    this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y));
    for (const status of statuses) {
      if (!found) {
        this.cmp(status);
        found = this.zero();
      }
    }

    return found ? this.inParty() : this.isNot();
  }


  public isNot(): Exit {
    this.lda(0xFF);

    return null;
  }


  public inParty(): Exit {
    let exit: Exit;

    this.lda(this.peek(ZP_MAIN.curr_player));
    this.cmp(this.peek(PRTY.party_size));
    if (this.carry() && !this.zero()) {
      exit = this.isNot();
    } else {
      this.lda(0x00);
      exit = null;
    }

    return exit;
  }


  /** ULT4.s get_player_sprite: the player's class, prone if asleep, $FF if dead. */
  public async getPlayerSprite(): Promise<Exit> {
    await this.m.call(J.j_get_stats_ptr);
    this.ldy(ROST.player_status);
    this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y));
    this.cmp(ROST.status_Good);
    if (!this.zero()) {
      this.cmp(ROST.status_Poison);
    }
    if (this.zero()) {
      this.ldy(ROST.player_class_index);
      this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y));
      this.cpu.a = this.cpu.asl(this.cpu.a);
      this.cpu.adc(TILES.tile_class_first);
    } else {
      this.cmp(ROST.status_Dead);
      this.lda(this.zero() ? 0xFF : TILES.tile_human_prone);
    }

    return null;
  }


  /** ULT4.s rand_modulo: a random number below A, by subtracting A from it until it is; 0 for 0. */
  public async randModulo(): Promise<Exit> {
    this.cmp(0x00);
    if (!this.zero()) {
      this.poke(modulus, this.cpu.a);
      await this.m.call(J.j_rand);
      this.cmp(this.peek(modulus));
      while (this.carry()) {
        this.cpu.sbc(this.peek(modulus));
        this.cmp(this.peek(modulus));
      }
    }

    return null;
  }


  /**
   * ULT4.s legal_move_combat: carry set if the foe may not step to (dest_x, dest_y), its tile in A:
   * rough ground, a foe or player there, a step back where it came from three times in four; off
   * the edge only to flee. Then the ground, as collide_terrain judges it for the foe.
   */
  public async legalMoveCombat(): Promise<Exit> {
    let exit: Exit = null;

    this.poke(zp_tile_type, this.cpu.a);
    await this.sub(0x7FFF, (): Promise<Exit> => this.checkSlowTerrain());
    if (this.zero()) {
      this.setCarry(true);
    } else if (this.offArena()) {
      this.ldx(this.peek(zp_cur_foe_index));
      this.lda(this.peek(O.combat_foe_hp + this.cpu.x));
      this.cmp(HP_FLEEING + 1);
    } else if (await this.stepsBack()) {
      this.setCarry(true);
    } else if (!this.occupied()) {
      this.ldx(this.peek(zp_cur_foe_index));
      this.lda(this.peek(O.combat_foe_tile_type + this.cpu.x));
      exit = await this.collideTerrain();
    }

    return exit;
  }


  /** Back to its last square, three times in four refused. */
  private async stepsBack(): Promise<boolean> {
    let refused: boolean = false;

    this.ldx(this.peek(zp_cur_foe_index));
    this.lda(this.peek(O.combat_foe_prev_x + this.cpu.x));
    this.cmp(this.peek(PRTY.dest_x));
    if (this.zero()) {
      this.lda(this.peek(O.combat_foe_prev_y + this.cpu.x));
      this.cmp(this.peek(PRTY.dest_y));
      if (this.zero()) {
        await this.m.call(J.j_rand);
        refused = this.lda(this.cpu.a & CHANCE_4) !== 0;
      }
    }

    return refused;
  }


  /** A foe or a player on the square: the last compare's zero leaves carry set. */
  private occupied(): boolean {
    let occupied: boolean = false;

    this.ldx(O.foes_max);
    do {
      occupied = this.foeAt() || this.playerAt();
    } while (!occupied && (this.dex() < 0x80));

    return occupied;
  }


  private foeAt(): boolean {
    let here: boolean = false;

    if (this.lda(this.peek(O.combat_foe_tile_type + this.cpu.x)) !== 0) {
      this.lda(this.peek(O.combat_foe_cur_x + this.cpu.x));
      this.cmp(this.peek(PRTY.dest_x));
      if (this.zero()) {
        this.lda(this.peek(O.combat_foe_cur_y + this.cpu.x));
        this.cmp(this.peek(PRTY.dest_y));
        here = this.zero();
      }
    }

    return here;
  }


  private playerAt(): boolean {
    let here: boolean = false;

    this.cpu.compare(this.cpu.x, ROST.player_last);
    if (!this.carry() && (this.lda(this.peek(O.combat_player_tile + this.cpu.x)) !== 0)) {
      this.lda(this.peek(O.combat_player_xpos + this.cpu.x));
      this.cmp(this.peek(PRTY.dest_x));
      if (this.zero()) {
        this.lda(this.peek(O.combat_player_ypos + this.cpu.x));
        this.cmp(this.peek(PRTY.dest_y));
        here = this.zero();
      }
    }

    return here;
  }


  /**
   * ULT4.s collide_terrain: carry set if the foe in A (by its N flag) may not stand on zp_tile_type.
   * Sea monsters keep to deep water, flyers pass over water, ghosts and zorns through what is not
   * shallower than shallow water, and the rest walk where the ground is not blocked.
   */
  public async collideTerrain(): Promise<Exit> {
    const kind: 'land' | 'water' | 'fly' | 'phase' = this.negative() ? this.monsterKind() : 'land';

    if (kind === 'water') {
      this.cmp(TILES.tile_pirate);
      if (!this.zero()) {
        this.setCarry(false);
      }
      this.lda(this.peek(zp_tile_type));
      this.cpu.sbc(TILES.tile_water_shallow);
    } else if (kind === 'phase') {
      this.lda(this.peek(zp_tile_type));
      this.cmp(TILES.tile_field_lightning);
      if (!this.zero()) {
        this.lda(TILES.tile_water_shallow);
        this.cmp(this.peek(zp_tile_type));
      }
    } else {
      this.lda(this.peek(zp_tile_type));
      let blocked: boolean = true;

      if (kind === 'fly') {
        this.cmp(TILES.tile_water_last);
        blocked = this.carry();
      }
      if (blocked) {
        await this.m.call(J.j_blocked_tile);
        this.cpu.php();
        this.lda(this.cpu.pull());
        this.cpu.a = this.cpu.rol(this.cpu.a);
      }
    }

    return null;
  }


  private monsterKind(): 'land' | 'water' | 'fly' | 'phase' {
    const kinds: readonly [ number, 'fly' | 'phase' ][] = [
      [ TILES.tile_bat, 'fly' ], [ TILES.tile_ghost, 'phase' ], [ TILES.tile_insects, 'fly' ], [ TILES.tile_zorn, 'phase' ], [ TILES.tile_daemon, 'fly' ],
    ];
    let kind: 'land' | 'water' | 'fly' | 'phase' | null = null;

    this.cmp(TILES.tile_twister);
    if (!this.carry()) {
      kind = 'water';
    } else if (this.zero()) {
      kind = 'fly';
    }
    for (const [ tile, ofTile ] of kinds) {
      if (kind == null) {
        this.cmp(tile);
        if (this.zero()) {
          kind = ofTile;
        }
      }
    }
    if (kind == null) {
      this.cmp(TILES.tile_dragon);
      kind = this.carry() ? 'fly' : 'land';
    }

    return kind;
  }


  // --- the foes' missiles (ULT4.s:8318-8560) ------------------------------------------------

  /** ULT4.s get_rangeattack_type: A the foe; the missile it throws, a field at random for $FF, or 0. */
  public async getRangeattackType(): Promise<Exit> {
    let found: boolean = false;

    this.ldy(CT.range_table_size - 1);
    do {
      this.cmp(this.peek(CT.range_foe + this.cpu.y));
      found = this.zero();
    } while (!found && (this.dey() !== 0));
    if (this.lda(this.peek(CT.range_sprite + this.cpu.y)) >= 0x80) {
      await this.m.call(J.j_rand);
      this.lda(this.cpu.a & (TILES.num_fields - 1));
      this.add(TILES.tile_field_first);
    }

    return null;
  }


  /** ULT4.s do_foe_range_attack: A the missile, X the foe; it flies toward the player until it hits one or stops. */
  public async doFoeRangeAttack(): Promise<Exit> {
    let exit: Exit = null;
    let flying: boolean = true;

    this.poke(O.attack_sprite, this.cpu.a);
    this.poke(O.target_x, this.lda(this.peek(O.combat_foe_cur_x + this.cpu.x)));
    this.poke(O.target_y, this.lda(this.peek(O.combat_foe_cur_y + this.cpu.x)));
    await this.playsfx(SOUND.sound_cannon);
    while (flying) {
      await this.sub(0x8188, (): Promise<Exit> => this.nextArenaTile());
      if (this.negative()) {
        flying = false;
        await this.missileLands();
      } else {
        await this.sub(0x818D, (): Promise<Exit> => this.checkHitPlayer());
        if (!this.zero()) {
          flying = false;
          exit = await this.hitPlayer();
        } else {
          await this.m.call(J.j_update_view_combat);
        }
      }
    }

    return exit;
  }


  /** Lava, where it stops, makes lava. */
  private async missileLands(): Promise<void> {
    this.lda(this.peek(O.attack_sprite));
    this.ldx(0x00);
    this.poke(O.attack_sprite, this.cpu.x);
    this.cmp(TILES.tile_lava);
    if (this.zero()) {
      this.poke(PRTY.dest_x, this.lda(this.peek(O.target_x)));
      this.poke(PRTY.dest_y, this.lda(this.peek(O.target_y)));
      await this.m.call(J.j_gettile_drawn_map);
      this.poke(O.world_tiles + this.cpu.y, this.lda(TILES.tile_lava));
    }
  }


  /** ULT4.s hit_player: poison and sleep half the time, unless the player is already ill; the rest injure. */
  public async hitPlayer(): Promise<Exit> {
    await this.sub(0x81B8, (): Promise<Exit> => this.printNewline());
    await this.m.call(J.j_printname);
    await this.sub(0x81BE, (): Promise<Exit> => this.printNewline());
    this.lda(this.peek(O.attack_sprite));
    this.cmp(TILES.tile_field_poison);
    if (this.zero()) {
      await this.print(CI.poisoned);
      await this.sub(0x81D6, (): Promise<Exit> => this.effectPoisonSleep());
      await this.m.call(J.j_rand);
      await this.ailment(this.negative(), ROST.status_Poison);
    } else {
      this.cmp(TILES.tile_field_lightning);
      if (this.zero()) {
        await this.print(CI.electrified);
        await this.sub(0x8203, (): Promise<Exit> => this.playerInjured());
      } else {
        this.cmp(TILES.tile_field_sleep);
        if (this.zero()) {
          await this.print(CI.slept);
          await this.sub(0x8227, (): Promise<Exit> => this.effectPoisonSleep());
          await this.m.call(J.j_rand);
          await this.ailment(this.negative(), ROST.status_Sleep);
        } else {
          await this.hit();
        }
      }
    }

    return null;
  }


  /** A player in good health takes the ailment, or else it fails. */
  private async ailment(chance: boolean, status: number): Promise<void> {
    let took: boolean = false;

    if (chance) {
      await this.m.call(J.j_get_stats_ptr);
      this.ldy(ROST.player_status);
      this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y));
      this.cmp(ROST.status_Good);
      if (this.zero()) {
        took = true;
        this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.lda(status));
        if (status === ROST.status_Sleep) {
          this.lda(TILES.tile_human_prone);
          this.ldx(this.peek(ZP_MAIN.curr_player));
          this.poke(O.combat_player_tile - 1 + this.cpu.x, this.cpu.a);
        }
      }
    }
    if (!took) {
      await this.print(CI.failed);
    }
  }


  /** FIERY, LAVA or MAGICAL HIT!, or a plain one. */
  private async hit(): Promise<void> {
    const kinds: readonly [ number, IInlineData ][] = [ [ TILES.tile_field_fire, CI.fiery ], [ TILES.tile_lava, CI.lava ], [ TILES.tile_attack_blue, CI.magical ] ];
    let kind: IInlineData | null = null;

    for (const [ tile, block ] of kinds) {
      if (kind == null) {
        this.cmp(tile);
        if (this.zero()) {
          kind = block;
        }
      }
    }
    if (kind != null) {
      await this.print(kind);
    }
    await this.print(CI.hit);
    await this.sub(0x827F, (): Promise<Exit> => this.playerInjured());
  }


  public async effectPoisonSleep(): Promise<Exit> {
    await this.m.call(CL.invert_player_name);
    this.poke(O.target_x, this.lda(this.peek(PRTY.dest_x)));
    this.poke(O.target_y, this.lda(this.peek(PRTY.dest_y)));
    await this.m.call(J.j_update_view_combat);
    await this.playsfx(SOUND.sound_firewalk);
    await this.m.call(CL.invert_player_name);
    this.poke(O.attack_sprite, this.lda(0x00));

    return null;
  }


  /** ULT4.s check_hit_player: A the player standing at (target_x, target_y), or 0. */
  public async checkHitPlayer(): Promise<Exit> {
    let hit: boolean = false;

    this.poke(ZP_MAIN.curr_player, this.lda(this.peek(PRTY.party_size)));
    do {
      await this.sub(0x82A5, (): Promise<Exit> => this.isAlive());
      if (this.zero()) {
        this.ldx(this.peek(ZP_MAIN.curr_player));
        this.dex();
        this.lda(this.peek(O.target_x));
        this.cmp(this.peek(O.combat_player_xpos + this.cpu.x));
        if (this.zero()) {
          this.lda(this.peek(O.target_y));
          this.cmp(this.peek(O.combat_player_ypos + this.cpu.x));
          hit = this.zero();
        }
      }
    } while (!hit && (this.dec(ZP_MAIN.curr_player) !== 0));
    if (hit) {
      this.lda(this.peek(ZP_MAIN.curr_player));
    }

    return null;
  }


  /** ULT4.s check_hit_foe: zp_cur_foe_index and A the foe at (dest_x, dest_y), or $FF (negative). */
  public checkHitFoe(): Promise<Exit> {
    let here: boolean = false;

    this.ldy(O.foes_max);
    do {
      if (this.lda(this.peek(O.combat_foe_tile_type + this.cpu.y)) !== 0) {
        this.lda(this.peek(O.combat_foe_cur_x + this.cpu.y));
        this.cmp(this.peek(PRTY.dest_x));
        if (this.zero()) {
          this.lda(this.peek(O.combat_foe_cur_y + this.cpu.y));
          this.cmp(this.peek(PRTY.dest_y));
          here = this.zero();
        }
      }
    } while (!here && (this.dey() < 0x80));
    this.lda(this.cpu.y);
    this.poke(zp_cur_foe_index, this.cpu.a);
    this.cmp(0x00);

    return Promise.resolve(null);
  }


  /**
   * ULT4.s next_arena_tile: a step from (target_x, target_y) by the deltas, into dest and, if a
   * missile can fly there, into target; A 0, or $FF where it cannot.
   */
  public async nextArenaTile(): Promise<Exit> {
    let ok: boolean = false;

    this.setCarry(false);
    this.lda(this.peek(O.target_x));
    this.cpu.adc(this.peek(ZP_MAIN.delta_x));
    this.poke(PRTY.dest_x, this.cpu.a);
    this.setCarry(false);
    this.lda(this.peek(O.target_y));
    this.cpu.adc(this.peek(ZP_MAIN.delta_y));
    this.poke(PRTY.dest_y, this.cpu.a);
    if (!this.offArena()) {
      await this.m.call(J.j_gettile_actual_map);
      ok = await this.missileFlies();
    }
    if (ok) {
      this.poke(O.target_x, this.lda(this.peek(PRTY.dest_x)));
      this.poke(O.target_y, this.lda(this.peek(PRTY.dest_y)));
      this.lda(0x00);
    } else {
      this.lda(0xFF);
    }

    return null;
  }


  /** Over a foe, water, white space and the diagonals; not into a secret panel or anything else blocked. */
  private async missileFlies(): Promise<boolean> {
    let flies: boolean | null = null;

    if (this.negative()) {
      flies = true;
    } else {
      this.cmp(TILES.tile_water_last);
      if (!this.carry()) {
        flies = true;
      } else {
        this.cmp(TILES.tile_white_space);
        if (this.zero()) {
          flies = true;
        } else {
          this.cmp(TILES.tile_secret_panel);
          if (this.zero()) {
            flies = false;
          } else {
            this.cmp(TILES.tile_diagonal_first);
            if (this.carry()) {
              this.cmp(TILES.tile_diagonal_last);
              if (!this.carry()) {
                flies = true;
              }
            }
          }
        }
      }
    }
    if (flies == null) {
      await this.m.call(J.j_blocked_tile);
      flies = !this.negative();
    }

    return flies;
  }


  /** ULT4.s math_abs: A made positive, by the N flag the caller left. */
  public mathAbs(): Promise<Exit> {
    return this.negative() ? this.mathNegate() : Promise.resolve(null);
  }


  public mathNegate(): Promise<Exit> {
    this.lda(this.cpu.a ^ 0xFF);
    this.add(0x01);

    return Promise.resolve(null);
  }


  // --- choosing a target (ULT4.s:8636-8714, 8779-8828) -------------------------------------

  /** ULT4.s input_target_xy: a direction, and (dest_x, dest_y) the player's square; A 1, or 0 for none. */
  public async inputTargetXy(): Promise<Exit> {
    await this.sub(0x8335, (): Promise<Exit> => this.inputDirection());
    if (!this.zero()) {
      this.ldx(this.peek(ZP_MAIN.curr_player));
      this.dex();
      this.poke(PRTY.dest_x, this.lda(this.peek(O.combat_player_xpos + this.cpu.x)));
      this.poke(PRTY.dest_y, this.lda(this.peek(O.combat_player_ypos + this.cpu.x)));
      this.lda(0x01);
    }

    return null;
  }


  /** ULT4.s input_direction: an arrow key's deltas and its name, and the square that way from the party; A 0 for none. */
  public async inputDirection(): Promise<Exit> {
    const arrows: readonly [ number, () => Promise<Exit>, number, number, number ][] = [
      [ CHAR.char_enter, (): Promise<Exit> => this.printNorth(), 0x837F, 0, 0xFF ],
      [ CHAR.char_up_arrow, (): Promise<Exit> => this.printNorth(), 0x837F, 0, 0xFF ],
      [ CHAR.char_slash, (): Promise<Exit> => this.printSouth(), 0x8389, 0, 0x01 ],
      [ CHAR.char_down_arrow, (): Promise<Exit> => this.printSouth(), 0x8389, 0, 0x01 ],
      [ CHAR.char_left_arrow, (): Promise<Exit> => this.printWest(), 0x8393, 0xFF, 0 ],
      [ CHAR.char_right_arrow, (): Promise<Exit> => this.printEast(), 0x839D, 0x01, 0 ],
    ];
    let arrow: readonly [ number, () => Promise<Exit>, number, number, number ] | null = null;

    await this.m.call(J.j_waitkey);
    if (!this.zero()) {
      this.cpu.push(this.cpu.a);
      this.lda(0x00);
      this.poke(ZP_MAIN.delta_x, this.cpu.a);
      this.poke(ZP_MAIN.delta_y, this.cpu.a);
      this.lda(this.cpu.pull());
      for (const candidate of arrows) {
        if (arrow == null) {
          this.cmp(candidate[0]);
          if (this.zero()) {
            arrow = candidate;
          }
        }
      }
      if (arrow == null) {
        this.cmp(CHAR.char_space);
        if (!this.zero()) {
          await this.m.call(J.j_console_out);
        }
      }
    }
    if (arrow == null) {
      await this.sub(0x834F, (): Promise<Exit> => this.printNewline());
      this.lda(0x00);
    } else {
      await this.toward(arrow[1], arrow[2], arrow[3], arrow[4]);
    }

    return null;
  }


  private async toward(print: () => Promise<Exit>, site: number, dx: number, dy: number): Promise<void> {
    await this.sub(site, print);
    this.lda(dx === 0 ? dy : dx);
    this.poke(dx === 0 ? ZP_MAIN.delta_y : ZP_MAIN.delta_x, this.cpu.a);
    this.setCarry(false);
    this.lda(this.peek(PRTY.player_xpos));
    this.cpu.adc(this.peek(ZP_MAIN.delta_x));
    this.poke(ZP_MAIN.temp_x, this.cpu.a);
    this.poke(PRTY.dest_x, this.cpu.a);
    this.setCarry(false);
    this.lda(this.peek(PRTY.player_ypos));
    this.cpu.adc(this.peek(ZP_MAIN.delta_y));
    this.poke(ZP_MAIN.temp_y, this.cpu.a);
    this.poke(PRTY.dest_y, this.cpu.a);
    this.lda(0x01);
  }


  /** ULT4.s print_target_name: A the foe's tile, by the N flag the caller left: its name and a newline. */
  public async printTargetName(): Promise<Exit> {
    if (this.negative()) {
      this.subtract(TILES.tile_monster_first);
      this.cmp(TILES.num_water_monsters);
      if (!this.carry()) {
        this.cpu.a = this.cpu.lsr(this.cpu.a);
      } else {
        this.cpu.a = this.cpu.lsr(this.cpu.lsr(this.cpu.a));
        this.add(0x04);
      }
    } else if (this.isPerson()) {
      this.lda(this.cpu.a & 0x1E);
      this.cpu.a = this.cpu.lsr(this.cpu.a);
      this.cpu.adc(0x4C);
    } else {
      this.ldx(0x04);
      do {
        this.cmp(this.peek(CT.special_type + this.cpu.x));
      } while (!this.zero() && (this.dex() !== 0));
      this.lda(this.peek(CT.special_string + this.cpu.x));
    }
    this.add(0x01);
    await this.m.call(J.j_printstring);
    this.lda(CHAR.char_newline);
    await this.m.call(J.j_console_out);

    return null;
  }
}
