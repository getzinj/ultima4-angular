// ULT4.s's spells, ported: the Cast command, its mixtures and magic points, the twenty-six spells,
// in Britannia, the townes, the dungeons and combat, and the status window's mixtures and reagents
// with the Mix command that loads MIX. Like the rest of ULT4's port, each entry
// leaves the registers and flags as the original does, and returns where control goes next.

import { DECIMAL } from '../../lifted-runtime/cpu';
import { CHAR, DUNGEON, JUMP_OVERLAY, JUMP_SUBS, JUMP_SYSTEM, MAP_OBJECTS, MUSIC, PRTY, ROST, SOUND, STRINGS, TILES, TRAINERS, ZP_MAIN } from '../../state/symbols';
import type { IInlineData } from '../inline-data';
import type { Exit } from '../routine';
import { Ult4Combat } from './ult4-combat';
import { COMBAT_ENTRIES, COMBAT_LIFTED } from './ult4-combat-data';
import { ULT4_ENTRIES, ULT4_TABLES } from './ult4-data';
import { SPELL_ENTRIES, SPELL_INLINE, SPELL_LIFTED, SPELL_TABLES, SPELL_VARIABLES } from './ult4-spells-data';

const S = SPELL_ENTRIES;
const SI = SPELL_INLINE;
const SL = SPELL_LIFTED;
const ST = SPELL_TABLES;
const SV = SPELL_VARIABLES;
const C = COMBAT_ENTRIES;
const E = ULT4_ENTRIES;
const J = JUMP_SUBS;
const O = MAP_OBJECTS;
const T = ULT4_TABLES;
/** ULT4.s's own uses of zero page in the spells. */
const zp_index2: number = 0xEA;
const zp_field_type: number = 0xEA;
const zp_attempts: number = 0xF0;
const zp_inventory_index: number = 0xD8;
const zp_display_line: number = 0xD9;
const zp_reagent_count: number = 0xEA;
const zp_reagent_index: number = 0xF0;
const STATUS_X: number = 0x18;
const STATUS_TITLE_X: number = 0x1A;
const STATUS_RIGHT: number = 0x24;
const SPELLS_MAX: number = 0x1A;
const HP_FLEEING: number = 0x17;
const AURA_TURNS: number = 0x0A;
const LIGHT_TURNS: number = 0x64;
const DUNGEON_TRIES: number = 0x20;
const DEEPEST_LEVEL: number = 0x07;


export abstract class Ult4Spells extends Ult4Combat {
  // --- casting (ULT4.s:1247-1335) -----------------------------------------------------------

  /** ULT4.s cmd_cast: who casts, if they are awake. */
  public async cmdCast(): Promise<Exit> {
    let exit: Exit = E.done_not_a_player;

    await this.print(SI.cast_spell);
    await this.m.call(J.j_getplayernum);
    if (!this.zero()) {
      this.cmp(this.peek(PRTY.party_size));
      if (this.zero() || !this.carry()) {
        this.poke(ZP_MAIN.curr_player, this.cpu.a);
        await this.sub(0x48E4, (): Promise<Exit> => this.isAwake());
        exit = this.negative() ? E.done_disabled : S.choose_spell;
      }
    }

    return exit;
  }


  /** ULT4.s choose_spell: the spell, a mixture of it, and its magic points, unless the trainer makes magic free. */
  public async chooseSpell(): Promise<Exit> {
    let exit: Exit;

    await this.sub(0x48EC, (): Promise<Exit> => this.displaySpells());
    await this.print(SI.spell);
    await this.sub(0x48F9, (): Promise<Exit> => this.inputChar());
    this.cpu.push(this.cpu.a);
    await this.m.call(J.j_clearstatwindow);
    await this.m.call(J.j_update_status);
    if (this.lda(this.peek(PRTY.game_mode)) & 0x80) {
      await this.m.call(COMBAT_LIFTED.invert_player_name);
    }
    this.lda(this.cpu.pull());
    this.subtract(CHAR.char_alpha_first);
    this.cmp(SPELLS_MAX);
    if (this.carry()) {
      exit = E.done_what;
    } else {
      this.poke(SV.current_spell, this.cpu.a);
      this.add(STRINGS.string_spells);
      await this.m.call(J.j_printstring);
      await this.print(SI.exclaim);
      if (this.lda(this.peek(TRAINERS.trainer_magic)) !== 0) {
        exit = this.spellRoutine();
      } else {
        exit = await this.useMixture();
      }
    }

    return exit;
  }


  private async useMixture(): Promise<Exit> {
    let exit: Exit = E.done_have_none;

    this.ldy(this.peek(SV.current_spell));
    if (this.lda(this.peek(ROST.mixtures + this.cpu.y)) !== 0) {
      this.cpu.setFlag(DECIMAL, true);
      this.subtract(0x01);
      this.poke(ROST.mixtures + this.cpu.y, this.cpu.a);
      this.cpu.setFlag(DECIMAL, false);
      await this.m.call(J.j_get_stats_ptr);
      this.ldy(ROST.player_magic_points);
      this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y));
      this.ldx(this.peek(SV.current_spell));
      this.cpu.setFlag(DECIMAL, true);
      this.subtract(this.peek(ST.spell_mp_cost + this.cpu.x));
      this.cpu.setFlag(DECIMAL, false);
      if (this.carry()) {
        this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.cpu.a);
        exit = this.spellRoutine();
      } else {
        exit = await this.message(SI.mp_too_low, S.failed);
      }
    }

    return exit;
  }


  /** The spell's routine from spell_jump_table, through ptr1. */
  private spellRoutine(): Exit {
    this.lda(this.peek(SV.current_spell));
    this.cpu.a = this.cpu.asl(this.cpu.a);
    this.ldy(this.cpu.a);
    this.poke(ZP_MAIN.ptr1, this.lda(this.peek(ST.spell_jump_table + this.cpu.y)));
    this.poke(ZP_MAIN.ptr1 + 1, this.lda(this.peek(ST.spell_jump_table + 1 + this.cpu.y)));

    return this.pointer(ZP_MAIN.ptr1);
  }


  // --- the guards and the effect (ULT4.s:2056-2141) -----------------------------------------

  /** A JSR from `site` to a guard that may drop its return and fail the spell; `then` runs if it passes. */
  private async guarded(site: number, guard: () => Promise<Exit>, then: () => Promise<Exit>): Promise<Exit> {
    const exit: Exit = await this.sub(site, guard);

    return exit == null ? then() : exit;
  }


  private effect(site: number, then: () => Promise<Exit>): Promise<Exit> {
    return this.guarded(site, (): Promise<Exit> => this.spellEffect(), then);
  }


  /** A guard's refusal: its message, its caller's return dropped, and the spell failed. */
  private async refuse(block: IInlineData): Promise<Exit> {
    await this.print(block);
    this.dropReturn();

    return S.failed;
  }


  public notAbyss(): Exit {
    let exit: Exit = null;

    this.lda(this.peek(PRTY.current_location));
    this.cmp(PRTY.loc_dng_abyss);
    if (this.zero()) {
      this.dropReturn();
      exit = S.failed;
    }

    return exit;
  }


  public async dungeonOnly(): Promise<Exit> {
    let exit: Exit = null;

    this.lda(this.peek(PRTY.game_mode));
    this.cmp(PRTY.mode_dungeon);
    if (!this.zero()) {
      exit = await this.refuse(SI.dungeon_only);
    }

    return exit;
  }


  public async combatOnly(): Promise<Exit> {
    let exit: Exit = null;

    if (!(this.lda(this.peek(PRTY.game_mode)) & 0x80)) {
      exit = await this.refuse(SI.combat_only);
    }

    return exit;
  }


  public async outdoorsOnly(): Promise<Exit> {
    let exit: Exit = null;

    this.lda(this.peek(PRTY.game_mode));
    this.cmp(PRTY.mode_world);
    if (!this.zero()) {
      exit = await this.refuse(SI.outdoors_only);
    }

    return exit;
  }


  /** ULT4.s spell_effect: the casting's sounds and flashes; a negated spell fails here. */
  public async spellEffect(): Promise<Exit> {
    let exit: Exit = null;

    this.ldy(this.peek(SV.current_spell));
    this.ldx(this.peek(ST.spell_mp_cost + this.cpu.y));
    await this.playsfx(SOUND.sound_cast);
    await this.m.call(J.j_invertview);
    this.lda(this.peek(SV.current_spell));
    this.add(0x60);
    this.ldx(this.cpu.a);
    await this.playsfx(SOUND.sound_spell_effect);
    await this.m.call(J.j_invertview);
    this.lda(this.peek(ZP_MAIN.magic_aura));
    this.cmp(ZP_MAIN.aura_negate);
    if (this.zero()) {
      this.dropReturn();
      exit = S.failed;
    }

    return exit;
  }


  public async failed(): Promise<Exit> {
    await this.print(SI.failed);
    await this.playsfx(SOUND.sound_alert);

    return E.cmd_done;
  }


  /** ULT4.s is_undead: A 0 for a ghost, a phantom, a skeleton or a liche, else $FF. */
  public isUndead(): Exit {
    let undead: boolean = false;

    for (const tile of [ TILES.tile_ghost, TILES.tile_phantom, TILES.tile_skeleton, TILES.tile_liche ]) {
      if (!undead) {
        this.cmp(tile);
        undead = this.zero();
      }
    }
    this.lda(undead ? 0x00 : 0xFF);

    return null;
  }


  public async promptDirection(): Promise<Exit> {
    await this.print(SI.direction);

    return null;
  }


  // --- the players' spells -------------------------------------------------------------------

  /** A player chosen by number, or the spell failed. */
  private async who(block: IInlineData, then: () => Promise<Exit>): Promise<Exit> {
    await this.print(block);
    await this.m.call(J.j_getplayernum);

    return this.zero() ? S.failed : then();
  }


  /** The chosen player's status from `from` to good, or the spell failed. */
  private async restore(from: number): Promise<Exit> {
    let exit: Exit = S.failed;

    await this.m.call(J.j_get_stats_ptr);
    this.ldy(ROST.player_status);
    this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y));
    this.cmp(from);
    if (this.zero()) {
      this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.lda(ROST.status_Good));
      exit = E.done_done;
    }

    return exit;
  }


  public spellAwake(): Promise<Exit> {
    return this.who(SI.who_awake, (): Promise<Exit> => this.effect(0x49D6, async (): Promise<Exit> => {
      const exit: Exit = await this.restore(ROST.status_Sleep);

      if ((exit === E.done_done) && (this.lda(this.peek(PRTY.game_mode)) & 0x80)) {
        await this.sub(0x49EC, (): Promise<Exit> => this.getPlayerSprite());
        this.ldx(this.peek(ZP_MAIN.curr_player));
        this.poke(O.combat_player_tile - 1 + this.cpu.x, this.cpu.a);
      }

      return exit;
    }));
  }


  public spellCure(): Promise<Exit> {
    return this.who(SI.who_cure, (): Promise<Exit> => this.effect(0x4A6F, (): Promise<Exit> => this.restore(ROST.status_Poison)));
  }


  public spellHeal(): Promise<Exit> {
    return this.who(SI.who_heal, (): Promise<Exit> => this.effect(0x4C6F, async (): Promise<Exit> => {
      let exit: Exit = S.failed;

      await this.sub(0x4C72, (): Promise<Exit> => this.isAlive());
      if (!this.negative()) {
        this.lda(0x19);
        await this.sub(0x4C79, (): Promise<Exit> => this.randModulo());
        this.add(0x4B);
        await this.m.call(COMBAT_LIFTED.encode_bcd_value);
        await this.m.call(SL.inc_player_hp);
        exit = E.done_done;
      }

      return exit;
    }));
  }


  public spellResurrect(): Exit {
    return (this.lda(this.peek(PRTY.game_mode)) & 0x80) ? S.res_view_fail : S.try_resurrect;
  }


  public resViewFail(): Exit {
    return S.failed;
  }


  public tryResurrect(): Promise<Exit> {
    return this.who(SI.who_resurrect, (): Promise<Exit> => this.effect(0x4D34, (): Promise<Exit> => this.restore(ROST.status_Dead)));
  }


  // --- moving the party ----------------------------------------------------------------------

  /** ULT4.s spell_blink: as far as the party can land on its patch of the map, in a direction. */
  public async spellBlink(): Promise<Exit> {
    let exit: Exit = S.failed;

    this.lda(this.peek(PRTY.player_transport));
    this.cmp(TILES.tile_ship_last);
    if (this.carry()) {
      exit = await this.guarded(0x4A00, (): Promise<Exit> => this.outdoorsOnly(), async (): Promise<Exit> => {
        await this.sub(0x4A03, (): Promise<Exit> => this.promptDirection());
        await this.sub(0x4A06, (): Promise<Exit> => this.inputDirection());

        return this.effect(0x4A09, (): Promise<Exit> => this.blink());
      });
    }

    return exit;
  }


  private async blink(): Promise<Exit> {
    let exit: Exit = S.failed;

    this.lda(this.peek(PRTY.player_xpos) & this.peek(PRTY.player_ypos));
    this.cmp(0xC0);
    if (!this.carry()) {
      do {
        await this.sub(0x4A17, (): Promise<Exit> => this.addDelta());
        this.cmp(0xFF);
      } while (!this.zero());
      let landed: boolean = false;
      let edge: boolean = false;

      while (!landed && !edge) {
        await this.sub(0x4A1E, (): Promise<Exit> => this.subDelta());
        this.cmp(0xFF);
        edge = this.zero();
        if (!edge) {
          await this.m.call(J.j_blocked_tile);
          landed = !this.negative();
        }
      }
      if (landed) {
        this.poke(PRTY.player_xpos, this.lda(this.peek(ZP_MAIN.temp_x)));
        this.poke(PRTY.player_ypos, this.lda(this.peek(ZP_MAIN.temp_y)));
        exit = await this.teleport();
      }
    }

    return exit;
  }


  private async teleport(): Promise<Exit> {
    await this.m.call(JUMP_SYSTEM.spin_drive_motor);
    await this.m.call(J.j_player_teleport);

    return E.done_done;
  }


  public addDelta(): Promise<Exit> {
    return this.stepTemp((value: number, delta: number): number => {
      this.setCarry(false);
      this.lda(value);

      this.cpu.adc(delta);

      return this.cpu.a;
    });
  }


  public subDelta(): Promise<Exit> {
    return this.stepTemp((value: number, delta: number): number => {
      this.setCarry(true);
      this.lda(value);

      this.cpu.sbc(delta);

      return this.cpu.a;
    });
  }


  private async stepTemp(step: (value: number, delta: number) => number): Promise<Exit> {
    this.poke(ZP_MAIN.temp_x, step(this.peek(ZP_MAIN.temp_x), this.peek(ZP_MAIN.delta_x)));
    this.poke(ZP_MAIN.temp_y, step(this.peek(ZP_MAIN.temp_y), this.peek(ZP_MAIN.delta_y)));
    await this.m.call(J.j_gettile_bounds);

    return null;
  }


  /** ULT4.s spell_gate: to one of the eight moongates, from Britannia and not from a ship. */
  public async spellGate(): Promise<Exit> {
    let exit: Exit = S.failed;

    this.lda(this.peek(PRTY.player_transport));
    this.cmp(TILES.tile_ship_last);
    if (this.carry()) {
      this.lda(this.peek(PRTY.game_mode));
      this.cmp(PRTY.mode_world);
      if (!this.zero()) {
        exit = S.outdoors_only;
      } else {
        await this.print(SI.to_phase);
        await this.sub(0x4C28, (): Promise<Exit> => this.inputChar());
        this.subtract(CHAR.char_1);
        this.cmp(0x08);
        if (!this.carry()) {
          this.poke(zp_index2, this.cpu.a);
          exit = await this.effect(0x4C37, (): Promise<Exit> => {
            this.ldx(this.peek(zp_index2));
            this.poke(PRTY.player_xpos, this.lda(this.peek(T.moongate_x + this.cpu.x)));
            this.poke(PRTY.player_ypos, this.lda(this.peek(T.moongate_y + this.cpu.x)));

            return this.teleport();
          });
        }
      }
    }

    return exit;
  }


  public spellXIt(): Promise<Exit> {
    return this.guarded(0x4E31, (): Promise<Exit> => this.dungeonOnly(), (): Promise<Exit> => this.effect(0x4E34, (): Promise<Exit> => Promise.resolve(E.leave_to_world)));
  }


  public spellYUp(): Promise<Exit> {
    return this.levelSpell(0x4E3A, async (): Promise<Exit> => {
      let exit: Exit = E.leave_to_world;

      if (!(this.dec(PRTY.dungeon_level) & 0x80)) {
        exit = await this.landOnLevel((): void => {
          this.inc(PRTY.dungeon_level);
        });
      }

      return exit;
    });
  }


  public spellZDown(): Promise<Exit> {
    return this.levelSpell(0x4E75, async (): Promise<Exit> => {
      let exit: Exit = S.failed;

      this.lda(this.peek(PRTY.dungeon_level));
      this.cmp(DEEPEST_LEVEL);
      if (!this.carry()) {
        this.inc(PRTY.dungeon_level);
        exit = await this.landOnLevel((): void => {
          this.dec(PRTY.dungeon_level);
        });
      }

      return exit;
    });
  }


  /** spell_y_up and spell_z_down: in a dungeon, and not in the Abyss. */
  private levelSpell(site: number, then: () => Promise<Exit>): Promise<Exit> {
    return this.guarded(site, (): Promise<Exit> => this.dungeonOnly(), (): Promise<Exit> => this.effect(site + 3, (): Promise<Exit> => {
      return this.guarded(site + 6, (): Promise<Exit> => Promise.resolve(this.notAbyss()), then);
    }));
  }


  /** Thirty-two tries at an empty square on the new level, or back to the old one and failed. */
  private async landOnLevel(back: () => void): Promise<Exit> {
    let exit: Exit = E.done_done;
    let empty: boolean = false;

    this.poke(zp_attempts, this.lda(DUNGEON_TRIES));
    do {
      await this.m.call(J.j_rand);
      this.poke(PRTY.dest_x, this.lda(this.cpu.a & O.xy_max_dungeon));
      await this.m.call(J.j_rand);
      this.poke(PRTY.dest_y, this.lda(this.cpu.a & O.xy_max_dungeon));
      await this.m.call(J.j_gettile_dungeon);
      empty = this.zero();
    } while (!empty && (this.dec(zp_attempts) !== 0));
    if (empty) {
      this.poke(PRTY.player_xpos, this.lda(this.peek(PRTY.dest_x)));
      this.poke(PRTY.player_ypos, this.lda(this.peek(PRTY.dest_y)));
    } else {
      back();
      exit = S.failed;
    }

    return exit;
  }


  // --- fields --------------------------------------------------------------------------------

  /** ULT4.s spell_dispel_field: the field a step away gives way to the ground the party stands on. */
  public async spellDispelField(): Promise<Exit> {
    let exit: Exit;

    this.lda(this.peek(PRTY.game_mode));
    this.cmp(PRTY.mode_dungeon);
    if (this.zero()) {
      exit = await this.effect(0x4AF0, (): Promise<Exit> => this.dispelDungeonField());
    } else {
      await this.sub(0x4A8A, (): Promise<Exit> => this.promptDirection());
      if (this.lda(this.peek(PRTY.game_mode)) & 0x80) {
        exit = await this.aimed(0x4AC2, (): Promise<Exit> => this.inputTargetXy(), 0x4AC7, (): Promise<Exit> => this.dispelArenaField());
      } else {
        this.cmp(PRTY.mode_world);
        const world: boolean = this.zero();

        exit = await this.aimed(world ? 0x4A9A : 0x4AB4, (): Promise<Exit> => this.inputDirection(), world ? 0x4A9F : 0x4AB9, async (): Promise<Exit> => {
          await this.m.call(world ? J.j_gettile_bounds : J.j_gettile_towne);

          return this.tryDispel((): void => {
            this.poke(this.pointer(ZP_MAIN.ptr2) + this.cpu.y, this.lda(this.peek(ZP_MAIN.tile_under_player)));
          });
        });
      }
    }

    return exit;
  }


  /** A direction or a target from `site`, and the spell's effect from `effectSite`; none, and it failed. */
  private async aimed(site: number, input: () => Promise<Exit>, effectSite: number, then: () => Promise<Exit>): Promise<Exit> {
    await this.sub(site, input);

    return this.zero() ? S.failed : this.effect(effectSite, then);
  }


  private isField(): boolean {
    let field: boolean = false;

    this.cmp(TILES.tile_field_first);
    if (this.carry()) {
      this.cmp(TILES.tile_field_last);
      field = !this.carry();
    }

    return field;
  }


  private tryDispel(dispel: () => void): Exit {
    let exit: Exit = S.failed;

    if (this.isField()) {
      dispel();
      exit = E.done_done;
    }

    return exit;
  }


  private async dispelArenaField(): Promise<Exit> {
    await this.m.call(J.j_gettile_actual_map);
    this.poke(ZP_MAIN.tile_under_player, this.cpu.a);
    this.setCarry(false);
    this.lda(this.peek(PRTY.dest_x));
    this.cpu.adc(this.peek(ZP_MAIN.delta_x));
    this.poke(PRTY.dest_x, this.cpu.a);
    this.setCarry(false);
    this.lda(this.peek(PRTY.dest_y));
    this.cpu.adc(this.peek(ZP_MAIN.delta_y));
    this.poke(PRTY.dest_y, this.cpu.a);
    await this.m.call(J.j_gettile_actual_map);

    return this.tryDispel((): void => {
      this.poke(O.world_tiles + this.cpu.y, this.lda(this.peek(ZP_MAIN.tile_under_player)));
    });
  }


  /** The square ahead in the dungeon, in (dest_x, dest_y), and its tile. */
  private async dungeonAhead(): Promise<void> {
    this.setCarry(false);
    this.ldx(this.peek(PRTY.dng_direction));
    this.lda(this.peek(PRTY.player_xpos));
    this.cpu.adc(this.peek(T.dng_dir_delta_x + this.cpu.x));
    this.poke(PRTY.dest_x, this.cpu.a);
    this.setCarry(false);
    this.lda(this.peek(PRTY.player_ypos));
    this.cpu.adc(this.peek(T.dng_dir_delta_y + this.cpu.x));
    this.poke(PRTY.dest_y, this.cpu.a);
    await this.m.call(J.j_gettile_dungeon);
  }


  private async dispelDungeonField(): Promise<Exit> {
    let exit: Exit = S.failed;

    await this.dungeonAhead();
    this.lda(this.cpu.a & DUNGEON.dng_tile_type_mask);
    this.cmp(DUNGEON.dng_tile_field);
    if (this.zero()) {
      this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.lda(0x00));
      exit = E.done_done;
    }

    return exit;
  }


  /** ULT4.s spell_energy_field: a field of poison, lightning, fire or sleep, in a dungeon or the arena. */
  public async spellEnergyField(): Promise<Exit> {
    const letters: readonly number[] = [ CHAR.char_P, CHAR.char_L, CHAR.char_F, CHAR.char_S ];
    let allowed: boolean = false;
    let exit: Exit = S.failed;

    await this.print(SI.type);
    await this.sub(0x4B1E, (): Promise<Exit> => this.inputChar());
    this.ldx(TILES.tile_field_first);
    letters.forEach((letter: number, index: number): void => {
      if (!allowed) {
        if (index > 0) {
          this.inx();
        }
        this.cmp(letter);
        allowed = this.zero();
      }
    });
    if (allowed) {
      this.poke(zp_field_type, this.cpu.x);
      if (this.lda(this.peek(PRTY.game_mode)) & 0x80) {
        exit = await this.arenaField();
      } else {
        this.cmp(PRTY.mode_dungeon);
        if (this.zero()) {
          exit = await this.effect(0x4B43, (): Promise<Exit> => this.dungeonField());
        }
      }
    }

    return exit;
  }


  private async dungeonField(): Promise<Exit> {
    let exit: Exit = S.failed;

    await this.dungeonAhead();
    if (this.zero()) {
      this.lda(this.peek(zp_field_type) & DUNGEON.dng_tile_field_mask);
      this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.lda(this.cpu.a | DUNGEON.dng_tile_field));
      exit = E.done_done;
    }

    return exit;
  }


  private async arenaField(): Promise<Exit> {
    let exit: Exit = S.failed;

    await this.sub(0x4B68, (): Promise<Exit> => this.promptDirection());
    await this.sub(0x4B6B, (): Promise<Exit> => this.inputTargetXy());
    if (!this.zero() && this.inArena(PRTY.dest_x, ZP_MAIN.delta_x) && this.inArena(PRTY.dest_y, ZP_MAIN.delta_y)) {
      exit = await this.effect(0x4B86, async (): Promise<Exit> => {
        let placed: Exit = S.failed;

        await this.m.call(J.j_gettile_actual_map);
        await this.m.call(J.j_blocked_tile);
        if (!this.negative()) {
          this.poke(O.world_tiles + this.cpu.y, this.lda(this.peek(zp_field_type)));
          placed = E.done_done;
        }

        return placed;
      });
    }

    return exit;
  }


  /** A step of `delta` along `axis`, still inside the arena. */
  private inArena(axis: number, delta: number): boolean {
    this.setCarry(false);
    this.lda(this.peek(axis));
    this.cpu.adc(this.peek(delta));
    this.poke(axis, this.cpu.a);
    this.cmp(O.xy_last_screen);

    return !this.carry();
  }


  // --- attack spells (ULT4.s:1631-1691, 1745-1801) ------------------------------------------

  /** A combat spell's start: in combat, a direction and a target. */
  private attackSpell(site: number, then: () => Promise<Exit>): Promise<Exit> {
    return this.guarded(site, (): Promise<Exit> => this.combatOnly(), async (): Promise<Exit> => {
      await this.sub(site + 3, (): Promise<Exit> => this.promptDirection());
      await this.sub(site + 6, (): Promise<Exit> => this.inputTargetXy());

      return then();
    });
  }


  /** iceball, kill and missile: no target and the spell failed, else the missile flies. */
  private missileSpell(site: number, sprite: number): Promise<Exit> {
    return this.attackSpell(site, (): Promise<Exit> => {
      return this.zero() ? Promise.resolve(S.failed) : this.effect(site + 0x0E, (): Promise<Exit> => {
        this.poke(O.attack_sprite, this.lda(sprite));

        return Promise.resolve(S.launch_attack_spell);
      });
    });
  }


  public spellFireball(): Promise<Exit> {
    return this.attackSpell(0x4B99, (): Promise<Exit> => Promise.resolve(this.zero() ? S.spell_attack_failed : S.do_fireball));
  }


  public spellAttackFailed(): Exit {
    this.poke(O.attack_sprite, this.lda(0x00));

    return S.failed;
  }


  public doFireball(): Promise<Exit> {
    return this.effect(0x4BAC, (): Promise<Exit> => {
      this.poke(O.attack_sprite, this.lda(TILES.tile_attack_red));

      return Promise.resolve(S.launch_attack_spell);
    });
  }


  public spellIceball(): Promise<Exit> {
    return this.missileSpell(0x4C88, TILES.tile_attack_blue);
  }


  public spellKill(): Promise<Exit> {
    return this.missileSpell(0x4CAF, TILES.tile_whirlpool);
  }


  public spellMissile(): Promise<Exit> {
    return this.missileSpell(0x4CDB, TILES.tile_attack_small);
  }


  /** ULT4.s launch_attack_spell: the missile flies to the first foe in its way, with damage by its kind. */
  public async launchAttackSpell(): Promise<Exit> {
    let exit: Exit = E.done_done;
    let edge: boolean = false;

    this.poke(O.target_x, this.lda(this.peek(PRTY.dest_x)));
    this.poke(O.target_y, this.lda(this.peek(PRTY.dest_y)));
    do {
      await this.sub(0x4BBE, (): Promise<Exit> => this.nextArenaTile());
      edge = this.negative();
      if (!edge) {
        await this.m.call(J.j_update_view_combat);
        await this.sub(0x4BC6, (): Promise<Exit> => this.checkHitFoe());
      }
    } while (!edge && this.negative());
    if (edge) {
      exit = S.spell_attack_failed;
    } else {
      await this.playsfx(SOUND.sound_damage);
      await this.spellDamage();
      this.ldx(0x00);
      this.poke(O.attack_sprite, this.cpu.x);
      this.poke(ZP_MAIN.damage, this.cpu.a);
      await this.sub(0x4C06, (): Promise<Exit> => this.inflictDamage());
    }

    return exit;
  }


  /** A missile's damage: 16 to 63, an iceball's 32 to 255, a fireball's 24 to 127, and a kill's 232. */
  private async spellDamage(): Promise<void> {
    const kinds: readonly [ number, number, number, number ][] = [
      [ TILES.tile_attack_small, 0x40, 0x10, 0x4BFA ],
      [ TILES.tile_attack_blue, 0xE0, 0x20, 0x4BF0 ],
      [ TILES.tile_attack_red, 0x80, 0x18, 0x4BE6 ],
    ];
    let kind: readonly [ number, number, number, number ] | null = null;

    this.lda(this.peek(O.attack_sprite));
    for (const candidate of kinds) {
      if (kind == null) {
        this.cmp(candidate[0]);
        if (this.zero()) {
          kind = candidate;
        }
      }
    }
    if (kind == null) {
      this.lda(0xE8);
    } else {
      this.lda(kind[1]);
      await this.sub(kind[3], (): Promise<Exit> => this.randModulo());
      this.lda(this.cpu.a | kind[2]);
    }
  }


  /** ULT4.s spell_sleep: each foe but the undead may fall asleep, the likelier the weaker it is. */
  public spellSleep(): Promise<Exit> {
    return this.everyFoe(0x4D4C, async (): Promise<void> => {
      if (this.lda(this.peek(O.combat_foe_tile_type + this.cpu.x)) !== 0) {
        await this.sub(0x4D59, (): Promise<Exit> => Promise.resolve(this.isUndead()));
        if (!this.zero()) {
          this.cmp(TILES.tile_balron);
          if (!this.zero()) {
            await this.m.call(J.j_rand);
            this.cmp(this.peek(O.combat_foe_hp + this.cpu.x));
            if (this.carry()) {
              this.poke(O.combat_foe_slept + this.cpu.x, this.lda(0x01));
            }
          }
        }
      }
    });
  }


  /** ULT4.s spell_tremor: the ground shakes; foes not too strong may be hit for 255 or flee. */
  public spellTremor(): Promise<Exit> {
    return this.everyFoe(0x4D75, async (): Promise<void> => {
      if (this.lda(this.peek(O.combat_foe_tile_type + this.cpu.x)) !== 0) {
        this.cmp(TILES.tile_lord_british);
        if (!this.zero()) {
          this.lda(this.peek(O.combat_foe_hp + this.cpu.x));
          this.cmp(0xC0);
          if (!this.carry()) {
            await this.m.call(J.j_rand);
            if (this.negative()) {
              await this.quake();
            } else if (!(this.lda(this.cpu.a & 0x01))) {
              this.poke(O.combat_foe_hp + this.cpu.x, this.lda(HP_FLEEING));
            }
          }
        }
      }
    }, (): Promise<void> => this.m.call(SL.shake_screen));
  }


  private async quake(): Promise<void> {
    this.poke(zp_index2, this.cpu.x);
    this.poke(O.target_x, this.lda(this.peek(O.combat_foe_cur_x + this.cpu.x)));
    this.poke(O.target_y, this.lda(this.peek(O.combat_foe_cur_y + this.cpu.x)));
    this.poke(O.attack_sprite, this.lda(TILES.tile_attack_red));
    await this.m.call(J.j_update_view_combat);
    await this.playsfx(SOUND.sound_damage);
    this.poke(O.attack_sprite, this.lda(0x00));
    this.poke(ZP_MAIN.damage, this.lda(0xFF));
    await this.sub(0x4DC5, (): Promise<Exit> => this.inflictDamage());
    this.ldx(this.peek(zp_index2));
  }


  /** ULT4.s spell_undead: each undead foe may flee. */
  public spellUndead(): Promise<Exit> {
    return this.everyFoe(0x4DD0, async (): Promise<void> => {
      this.lda(this.peek(O.combat_foe_tile_type + this.cpu.x));
      await this.sub(0x4DDB, (): Promise<Exit> => Promise.resolve(this.isUndead()));
      if (this.zero()) {
        await this.m.call(J.j_rand);
        if (!this.negative()) {
          this.poke(O.combat_foe_hp + this.cpu.x, this.lda(HP_FLEEING));
        }
      }
    });
  }


  /** sleep, tremor and undead: in combat, the spell on each foe from the last. */
  private everyFoe(site: number, each: () => Promise<void>, first: () => Promise<void> = (): Promise<void> => Promise.resolve()): Promise<Exit> {
    return this.guarded(site, (): Promise<Exit> => this.combatOnly(), (): Promise<Exit> => this.effect(site + 3, async (): Promise<Exit> => {
      await first();
      this.ldx(O.foes_max);
      do {
        await each();
      } while (!(this.dex() & 0x80));

      return E.done_done;
    }));
  }


  // --- auras, light, wind and the rest -------------------------------------------------------

  private aura(site: number, aura: number): Promise<Exit> {
    return this.effect(site, (): Promise<Exit> => {
      this.lda(aura);

      return Promise.resolve(S.set_spell_aura);
    });
  }


  public spellJinx(): Promise<Exit> {
    return this.aura(0x4CA1, ZP_MAIN.aura_jinx);
  }


  public spellNegate(): Promise<Exit> {
    return this.aura(0x4CF4, ZP_MAIN.aura_negate);
  }


  public spellProtect(): Promise<Exit> {
    return this.aura(0x4D0D, ZP_MAIN.aura_protect);
  }


  public spellQuickness(): Promise<Exit> {
    return this.aura(0x4D15, ZP_MAIN.aura_quickness);
  }


  public setSpellAura(): Exit {
    this.poke(ZP_MAIN.magic_aura, this.cpu.a);
    this.poke(ZP_MAIN.aura_duration, this.lda(AURA_TURNS));

    return E.done_done;
  }


  public spellLight(): Promise<Exit> {
    return this.effect(0x4CC8, async (): Promise<Exit> => {
      this.poke(PRTY.light_duration, this.lda(LIGHT_TURNS));
      this.lda(this.peek(PRTY.game_mode));
      this.cmp(PRTY.mode_dungeon);
      if (this.zero()) {
        await this.m.call(JUMP_OVERLAY.j_dng_neighbor_tiles);
      }

      return E.done_done;
    });
  }


  public spellOpenChest(): Promise<Exit> {
    return this.effect(0x4CFC, (): Promise<Exit> => {
      let exit: Exit = C.try_get_chest_combat;

      if (!(this.lda(this.peek(PRTY.game_mode)) & 0x80)) {
        this.poke(ZP_MAIN.curr_player, this.lda(0x00));
        exit = SL.try_get_chest;
      }

      return Promise.resolve(exit);
    });
  }


  public async spellView(): Promise<Exit> {
    let exit: Exit = S.res_view_fail;

    if (!(this.lda(this.peek(PRTY.game_mode)) & 0x80)) {
      exit = await this.effect(0x4DF7, async (): Promise<Exit> => {
        const viewed: Exit = await this.sub(0x4DFA, (): Promise<Exit> => this.doView());

        return viewed == null ? E.done_done : viewed;
      });
    }

    return exit;
  }


  /** ULT4.s spell_wind: the wind turns to blow the way chosen. */
  public spellWind(): Promise<Exit> {
    return this.guarded(0x4E00, (): Promise<Exit> => this.outdoorsOnly(), async (): Promise<Exit> => {
      await this.sub(0x4E03, (): Promise<Exit> => this.promptDirection());

      return this.aimed(0x4E06, (): Promise<Exit> => this.inputDirection(), 0x4E0E, (): Promise<Exit> => {
        let wind: number;

        if (this.lda(this.peek(ZP_MAIN.delta_x)) !== 0) {
          wind = this.negative() ? ZP_MAIN.wind_dir_west : ZP_MAIN.wind_dir_east;
        } else {
          this.lda(this.peek(ZP_MAIN.delta_y));
          wind = this.negative() ? ZP_MAIN.wind_dir_north : ZP_MAIN.wind_dir_south;
        }
        this.poke(ZP_MAIN.wind_direction, this.lda(wind));

        return Promise.resolve(E.done_done);
      });
    });
  }


  // --- mixtures and reagents (ULT4.s:3047-3060, 4294-4417) ----------------------------------

  /** ULT4.s cmd_mix_reagents: the mixtures shown, and MIX loaded to mix more. */
  public async cmdMixReagents(): Promise<Exit> {
    await this.sub(0x57B6, (): Promise<Exit> => this.displaySpells());
    await this.print(SI.mix_reagents);
    await this.loadOverlay(SI.bload_mix);
    await this.jsrOut(0x57E5, JUMP_OVERLAY.j_overlay_entry);
    await this.musicCtl(MUSIC.music_main);

    return E.cmd_done;
  }


  public nextLine(): Exit {
    this.inc(ZP_MAIN.console_ypos);
    this.poke(ZP_MAIN.console_xpos, this.ldx(STATUS_X));

    return null;
  }


  public saveCursor(): Exit {
    this.poke(SV.saved_cursor_x, this.lda(this.peek(ZP_MAIN.console_xpos)));
    this.poke(SV.saved_cursor_y, this.lda(this.peek(ZP_MAIN.console_ypos)));

    return null;
  }


  public restoreCursor(): Exit {
    this.poke(ZP_MAIN.console_xpos, this.lda(this.peek(SV.saved_cursor_x)));
    this.poke(ZP_MAIN.console_ypos, this.lda(this.peek(SV.saved_cursor_y)));

    return null;
  }


  /** The status window cleared, the cursor kept to be put back, and X and Y where its heading goes. */
  private async statusWindow(site: number): Promise<void> {
    await this.m.call(J.j_clearstatwindow);
    await this.sub(site, (): Promise<Exit> => Promise.resolve(this.saveCursor()));
    this.ldx(STATUS_TITLE_X);
    this.ldy(0x00);
  }


  /** ULT4.s display_reagents: each reagent the party has, its letter, count and name. */
  public async displayReagents(): Promise<Exit> {
    await this.statusWindow(0x6357);
    this.poke(zp_reagent_index, this.cpu.y);
    await this.callWith(J.j_primm_xy, SI.reagents);
    do {
      this.lda(this.peek(zp_reagent_index));
      this.add(ROST.party_stat_reagents);
      this.ldy(this.cpu.a);
      if (this.lda(this.peek(ROST.party_stats + this.cpu.y)) !== 0) {
        await this.showReagent();
      }
      this.inc(zp_reagent_index);
      this.lda(this.peek(zp_reagent_index));
      this.cmp(ROST.reagent_max);
    } while (!this.carry());
    await this.sub(0x63B1, (): Promise<Exit> => Promise.resolve(this.restoreCursor()));

    return null;
  }


  private async showReagent(): Promise<void> {
    this.poke(zp_reagent_count, this.cpu.a);
    await this.sub(0x637B, (): Promise<Exit> => Promise.resolve(this.nextLine()));
    this.lda(this.peek(zp_reagent_index));
    this.add(CHAR.char_alpha_first);
    await this.m.call(J.j_console_out);
    this.lda(this.peek(zp_reagent_count));
    this.cmp(0x10);
    if (this.carry()) {
      await this.m.call(J.j_printbcd);
    } else {
      this.lda(CHAR.char_hyphen);
      await this.m.call(J.j_console_out);
      this.lda(this.peek(zp_reagent_count));
      await this.m.call(J.j_printdigit);
    }
    this.lda(CHAR.char_hyphen);
    await this.m.call(J.j_console_out);
    this.lda(this.peek(zp_reagent_index));
    this.add(STRINGS.string_reagent_first);
    await this.m.call(J.j_printstring);
  }


  /** ULT4.s display_spells: each mixture the party has, its letter and count, in columns of eight. */
  public async displaySpells(): Promise<Exit> {
    await this.statusWindow(0x63B8);
    this.poke(zp_inventory_index, this.cpu.y);
    this.poke(zp_display_line, this.cpu.y);
    await this.callWith(J.j_primm_xy, SI.mixtures);
    do {
      this.lda(this.peek(zp_display_line));
      this.cpu.a = this.cpu.lsr(this.cpu.lsr(this.cpu.lsr(this.cpu.a)));
      this.ldx(0x05);
      await this.m.call(J.j_mulax);
      this.add(STATUS_X);
      this.poke(ZP_MAIN.console_xpos, this.cpu.a);
      this.cmp(STATUS_RIGHT);
      if (!this.carry()) {
        await this.showMixture();
      }
      this.inc(zp_inventory_index);
      this.lda(this.peek(zp_inventory_index));
      this.cmp(SPELLS_MAX);
    } while (!this.carry());
    await this.sub(0x6412, (): Promise<Exit> => Promise.resolve(this.restoreCursor()));

    return null;
  }


  private async showMixture(): Promise<void> {
    this.poke(ZP_MAIN.console_ypos, this.lda(this.peek(zp_display_line) & 0x07));
    this.inc(ZP_MAIN.console_ypos);
    this.ldy(this.peek(zp_inventory_index));
    if (this.lda(this.peek(ROST.mixtures + this.cpu.y)) !== 0) {
      this.lda(this.peek(zp_inventory_index));
      this.add(CHAR.char_alpha_first);
      await this.m.call(J.j_console_out);
      this.lda(CHAR.char_hyphen);
      await this.m.call(J.j_console_out);
      this.ldy(this.peek(zp_inventory_index));
      this.lda(this.peek(ROST.mixtures + this.cpu.y));
      await this.m.call(J.j_printbcd);
      this.inc(zp_display_line);
    }
  }
}
