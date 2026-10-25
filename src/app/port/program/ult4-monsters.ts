// ULT4.s's wandering monsters in Britannia, ported: where they spawn, how they move, sail and shoot,
// the whirlpools and twisters, and their attacks on the party. The townes' and the dungeons' monsters
// are still lifted. Like the rest of ULT4's port, each entry leaves the registers and flags as the
// original does, and returns where control goes next.

import { CHAR, JUMP_SUBS, MAP_OBJECTS, PRTY, SOUND, TILES, TRAINERS, ZP_COMBAT, ZP_MAIN } from '../../state/symbols';
import type { Exit } from '../routine';
import { COMMAND_ENTRIES } from './ult4-commands-data';
import { MONSTER_INLINE, MONSTER_LIFTED } from './ult4-monsters-data';
import { Ult4Spells } from './ult4-spells';

const MI = MONSTER_INLINE;
const ML = MONSTER_LIFTED;
const CE = COMMAND_ENTRIES;
const J = JUMP_SUBS;
const O = MAP_OBJECTS;
/** ULT4.s's own uses of zero page for the monsters. */
const zp_index1: number = 0xD8;
const zp_number1: number = 0xD8;
const zp_number2: number = 0xD9;
const zp_save_reg1: number = 0xD8;
const zp_save_reg2: number = 0xD9;
const zp_cur_mob_index: number = 0xD8;
const zp_tile_type: number = 0xDA;
const zp_sound: number = 0xDB;
const zp_missile_travel: number = 0xEA;
const zp_attempts: number = 0xF0;
const CHANCE_4: number = 0x03;
const CHANCE_8: number = 0x07;
const CHANCE_16: number = 0x0F;
const RANGE_MISSILE_TRAVEL: number = 0x03;
const RANGE_MISSILE_ATTACK: number = 0x05;
const SAIL_RANGE: number = 0x06;
const WHIRLPOOL_X: number = 0x7F;
const WHIRLPOOL_Y: number = 0x4E;


/** Where a pirate ship goes next: along its facing, toward the party, or about. */
type Sailing = 'e_w' | 'n_s' | 'turn_or_sail';


export abstract class Ult4Monsters extends Ult4Spells {
  // --- spawning (ULT4.s:4790-4890) ----------------------------------------------------------

  public async spawnMonsters(): Promise<Exit> {
    let exit: Exit = null;

    this.lda(this.peek(PRTY.game_mode));
    this.cmp(PRTY.mode_world);
    if (this.zero()) {
      exit = await this.spawnWorld();
    } else {
      this.cmp(PRTY.mode_dungeon);
      if (this.zero()) {
        await this.jmp(ML.spawn_dungeon);
      }
    }

    return exit;
  }


  /** ULT4.s spawn_world: one chance in sixteen of a monster off screen in each empty slot, the fiercer the longer the game. */
  public async spawnWorld(): Promise<Exit> {
    await this.m.call(J.j_rand);
    if (this.lda(this.cpu.a & CHANCE_16) === 0) {
      this.poke(ZP_MAIN.temp2_x, this.mul16(this.peek(PRTY.map_x)));
      this.poke(ZP_MAIN.temp2_y, this.mul16(this.peek(PRTY.map_y)));
      this.lda(this.peek(PRTY.tile_xpos));
      this.poke(ZP_MAIN.delta_x, this.subtract(O.xy_center_screen));
      this.lda(this.peek(PRTY.tile_ypos));
      this.poke(ZP_MAIN.delta_y, this.subtract(O.xy_center_screen));
      this.ldx(O.object_wandering_max);
      do {
        if (this.lda(this.peek(O.object_tile_type + this.cpu.x)) === 0) {
          await this.trySpawn();
        }
      } while (!(this.dex() & 0x80));
    }

    return null;
  }


  private async trySpawn(): Promise<void> {
    if ((await this.offScreen(PRTY.dest_x, ZP_MAIN.delta_x)) && (await this.offScreen(PRTY.dest_y, ZP_MAIN.delta_y))) {
      await this.m.call(J.j_gettile_britannia);
      this.cmp(TILES.tile_water_shallow);
      if (!this.carry()) {
        await this.spawnAtSea();
      } else {
        this.cmp(TILES.tile_grass);
        if (this.carry()) {
          this.cmp(TILES.tile_mountain);
          if (!this.carry()) {
            await this.spawnOnLand();
          }
        }
      }
    }
  }


  /** A random square of the tile cache along `axis`, in `dest`, that is off the screen. */
  private async offScreen(dest: number, delta: number): Promise<boolean> {
    await this.m.call(J.j_rand);
    this.poke(dest, this.lda(this.cpu.a & O.xy_max_tile_cache));
    this.subtract(this.peek(delta));
    this.cmp(O.xy_last_screen);

    return this.carry();
  }


  private placeAtDest(): void {
    this.setCarry(false);
    this.lda(this.peek(PRTY.dest_x));
    this.cpu.adc(this.peek(ZP_MAIN.temp2_x));
    this.poke(O.object_xpos + this.cpu.x, this.cpu.a);
    this.setCarry(false);
    this.lda(this.peek(PRTY.dest_y));
    this.cpu.adc(this.peek(ZP_MAIN.temp2_y));
    this.poke(O.object_ypos + this.cpu.x, this.cpu.a);
  }


  private async spawnOnLand(): Promise<void> {
    this.placeAtDest();
    let range: number = 0x0F;

    if (this.lda(this.peek(PRTY.move_counter)) === 0) {
      if (this.lda(this.peek(PRTY.move_counter + 1)) === 0) {
        range = 0x03;
      } else {
        this.cmp(0x03);
        range = this.carry() ? 0x0F : 0x07;
      }
    }
    this.poke(zp_number1, this.lda(range));
    await this.m.call(J.j_rand);
    this.poke(zp_number1, this.lda(this.cpu.a & this.peek(zp_number1)));
    await this.m.call(J.j_rand);
    this.lda(this.cpu.a & this.peek(zp_number1));
    this.cpu.a = this.cpu.asl(this.cpu.asl(this.cpu.a));
    this.cpu.adc(TILES.tile_monster_world);
    this.poke(O.object_tile_type + this.cpu.x, this.cpu.a);
    this.poke(O.object_tile_sprite + this.cpu.x, this.cpu.a);
  }


  private async spawnAtSea(): Promise<void> {
    await this.m.call(J.j_rand);
    if (this.lda(this.cpu.a & CHANCE_8) === 0) {
      this.placeAtDest();
      await this.m.call(J.j_rand);
      this.lda(this.cpu.a & 0x07);
      this.cpu.a = this.cpu.asl(this.cpu.a);
      this.cpu.adc(TILES.tile_monster_water);
      this.cmp(TILES.tile_pirate_east);
      if (this.zero()) {
        this.lda(TILES.tile_pirate_west);
      }
      this.poke(O.object_tile_type + this.cpu.x, this.cpu.a);
      this.poke(O.object_tile_sprite + this.cpu.x, this.cpu.a);
    }
  }


  public tileToMonsterNum(): Exit {
    this.subtract(TILES.tile_monster_dungeon);
    this.cpu.a = this.cpu.lsr(this.cpu.lsr(this.cpu.a));
    this.add(0x01);
    this.ldy(0x00);

    return null;
  }


  // --- the monsters' turns (ULT4.s:4975-5310) -----------------------------------------------

  public async mobsAct(): Promise<Exit> {
    let exit: Exit = null;

    this.lda(this.peek(PRTY.game_mode));
    this.cmp(PRTY.mode_world);
    if (this.zero()) {
      exit = await this.mobsActWorld();
    } else {
      this.cmp(PRTY.mode_towne);
      if (this.zero()) {
        await this.jmp(ML.mobs_act_towne);
      } else {
        this.cmp(PRTY.mode_dungeon);
        if (this.zero()) {
          await this.jmp(ML.mobs_act_dungeon);
        }
      }
    }

    return exit;
  }


  /** ULT4.s mobs_act_world: each monster in the tile cache takes its turn; those outside it are gone. */
  public async mobsActWorld(): Promise<Exit> {
    let exit: Exit = null;

    this.poke(ZP_MAIN.temp2_x, this.mul16(this.peek(PRTY.map_x)));
    this.poke(ZP_MAIN.temp2_y, this.mul16(this.peek(PRTY.map_y)));
    this.ldx(O.object_mobs_max);
    do {
      if (this.lda(this.peek(O.object_tile_type + this.cpu.x)) !== 0) {
        if (this.inCache(O.object_xpos, ZP_MAIN.temp2_x) && this.inCache(O.object_ypos, ZP_MAIN.temp2_y)) {
          this.poke(zp_cur_mob_index, this.cpu.x);
          exit = await this.sub(0x6884, (): Promise<Exit> => this.mobWorldTakeTurn());
          if (exit == null) {
            this.ldx(this.peek(zp_cur_mob_index));
          }
        } else {
          this.lda(0x00);
          this.poke(O.object_tile_type + this.cpu.x, this.cpu.a);
          this.poke(O.object_tile_sprite + this.cpu.x, this.cpu.a);
        }
      }
    } while ((exit == null) && !(this.dex() & 0x80));

    return exit;
  }


  private inCache(position: number, origin: number): boolean {
    this.lda(this.peek(position + this.cpu.x));
    this.subtract(this.peek(origin));
    this.cmp(O.xy_last_tile_cache);

    return !this.carry();
  }


  /** ULT4.s mob_world_take_turn: a monster beside the party attacks; whirlpools and twisters only drift. */
  public async mobWorldTakeTurn(): Promise<Exit> {
    let near: boolean = false;

    this.lda(this.peek(O.object_tile_type + this.cpu.x));
    this.cmp(TILES.tile_whirlpool);
    if (!this.zero()) {
      this.cmp(TILES.tile_twister);
      if (!this.zero()) {
        await this.sub(0x68A3, (): Promise<Exit> => this.manhattanDist());
        this.cmp(0x02);
        near = !this.carry();
      }
    }

    return near ? this.playerAttacked() : this.checkRange();
  }


  /** ULT4.s player_attacked: unless avoided, a fight, dropping mob_world_take_turn's and mobs_act's returns. */
  public async playerAttacked(): Promise<Exit> {
    let exit: Exit = null;

    await this.m.call(J.j_update_view);
    this.ldx(this.peek(zp_cur_mob_index));
    this.poke(ZP_COMBAT.foe_type_encountered, this.lda(this.peek(O.object_tile_type + this.cpu.x)));
    await this.sub(0x68B4, (): Promise<Exit> => this.attackedBy());
    const attacked: boolean = !this.zero();

    this.ldx(this.peek(zp_cur_mob_index));
    if (attacked) {
      this.poke(ZP_MAIN.temp_x, this.lda(this.peek(O.object_xpos + this.cpu.x)));
      this.poke(ZP_MAIN.temp_y, this.lda(this.peek(O.object_ypos + this.cpu.x)));
      this.dropReturn();
      this.dropReturn();
      exit = CE.do_attack;
    }

    return exit;
  }


  /** ULT4.s check_range: A the distance to the party; a pirate fires or sails, a sea serpent, lava lizard or worse may fire, and the rest move. */
  public async checkRange(): Promise<Exit> {
    this.cmp(RANGE_MISSILE_TRAVEL + 1);
    if (this.carry()) {
      await this.tryShipMove();
    } else if (this.isPirate()) {
      await this.checkCannon();
    } else {
      await this.notPirate();
    }

    return null;
  }


  private isPirate(): boolean {
    this.lda(this.peek(O.object_tile_type + this.cpu.x));
    this.cmp(TILES.tile_pirate);

    return this.zero();
  }


  /** A pirate fires when the party is broadside of it. */
  private async checkCannon(): Promise<void> {
    let facing: number | null = null;

    this.lda(this.peek(O.object_tile_sprite + this.cpu.x));
    for (const candidate of [ TILES.tile_pirate_west, TILES.tile_pirate_north, TILES.tile_pirate_east ]) {
      if (facing == null) {
        this.cmp(candidate);
        if (this.zero()) {
          facing = candidate;
        }
      }
    }
    const eastWest: boolean = (facing === TILES.tile_pirate_west) || (facing === TILES.tile_pirate_east);

    if (this.lda(this.peek(eastWest ? ZP_MAIN.delta_x : ZP_MAIN.delta_y)) !== 0) {
      await this.tryShipMove();
    } else {
      await this.fireCannonPirate();
    }
  }


  private async tryShipMove(): Promise<void> {
    if (this.isPirate()) {
      await this.sailAs(this.sailing());
    } else {
      await this.notPirate();
    }
  }


  /** Along the ship's facing when the party lies ahead, else turn or sail. */
  private sailing(): Sailing {
    let sailing: Sailing;

    this.lda(this.peek(O.object_tile_sprite + this.cpu.x));
    this.cmp(TILES.tile_pirate_west);
    if (this.zero()) {
      sailing = (this.lda(this.peek(ZP_MAIN.delta_x)) & 0x80) ? 'e_w' : 'turn_or_sail';
    } else {
      this.cmp(TILES.tile_pirate_north);
      if (this.zero()) {
        sailing = (this.lda(this.peek(ZP_MAIN.delta_y)) & 0x80) ? 'n_s' : 'turn_or_sail';
      } else {
        this.cmp(TILES.tile_pirate_east);
        const east: boolean = this.zero();
        const delta: number = this.lda(this.peek(east ? ZP_MAIN.delta_x : ZP_MAIN.delta_y));

        sailing = ((delta === 0) || (delta & 0x80)) ? 'turn_or_sail' : (east ? 'e_w' : 'n_s');
      }
    }

    return sailing;
  }


  private async sailAs(sailing: Sailing): Promise<void> {
    if (sailing === 'e_w') {
      await this.trySail(0x6976, 0x6980, ZP_MAIN.delta_x, 0);
    } else if (sailing === 'n_s') {
      await this.trySail(0x6998, 0x69A2, 0, ZP_MAIN.delta_y);
    } else {
      await this.turnOrSail();
    }
  }


  /** Far off, or one time in four, the ship turns toward the party; else it sails on as it faces. */
  private async turnOrSail(): Promise<void> {
    let turn: boolean = true;

    await this.sub(0x692D, (): Promise<Exit> => this.manhattanDist());
    this.cmp(SAIL_RANGE);
    if (!this.carry()) {
      await this.m.call(J.j_rand);
      turn = this.lda(this.cpu.a & CHANCE_4) === 0;
    }
    if (turn) {
      this.turnToParty();
    } else {
      await this.sailOn();
    }
  }


  private async sailOn(): Promise<void> {
    const headings: readonly [ number, number, number, Sailing ][] = [
      [ TILES.tile_pirate_west, ZP_MAIN.delta_x, 0xFF, 'e_w' ],
      [ TILES.tile_pirate_north, ZP_MAIN.delta_y, 0xFF, 'n_s' ],
      [ TILES.tile_pirate_east, ZP_MAIN.delta_x, 0x01, 'e_w' ],
    ];
    let heading: readonly [ number, number, number, Sailing ] = [ TILES.tile_pirate_south, ZP_MAIN.delta_y, 0x01, 'n_s' ];
    let found: boolean = false;

    this.lda(this.peek(O.object_tile_sprite + this.cpu.x));
    for (const candidate of headings) {
      if (!found) {
        this.cmp(candidate[0]);
        if (this.zero()) {
          found = true;
          heading = candidate;
        }
      }
    }
    this.poke(heading[1], this.lda(heading[2]));
    await this.sailAs(heading[3]);
  }


  /** A step of the ship along an axis, if the sea lets it and the wind does. */
  private async trySail(legalSite: number, windSite: number, dx: number, dy: number): Promise<void> {
    this.setCarry(false);
    this.mobStep(dx, dy);
    await this.m.call(J.j_gettile_bounds);
    await this.sub(legalSite, (): Promise<Exit> => this.legalMoveWorldTwn());
    if (this.carry()) {
      await this.turnShipRandom();
    } else {
      this.lda(this.peek(O.object_tile_sprite + this.cpu.x) & 0x03);
      await this.sub(windSite, (): Promise<Exit> => this.isWindFavorable());
      if (this.zero()) {
        this.doMove();
      }
    }
  }


  /** (temp_x, temp_y) the monster's square, a step along `dx` or `dy`; the caller clears carry. */
  private mobStep(dx: number, dy: number): void {
    this.lda(this.peek(O.object_xpos + this.cpu.x));
    if (dx !== 0) {
      this.cpu.adc(this.peek(dx));
    }
    this.poke(ZP_MAIN.temp_x, this.cpu.a);
    this.lda(this.peek(O.object_ypos + this.cpu.x));
    if (dy !== 0) {
      this.cpu.adc(this.peek(dy));
    }
    this.poke(ZP_MAIN.temp_y, this.cpu.a);
  }


  /** The ship turns to face the party along its greater distance. */
  private turnToParty(): void {
    let sprite: number;

    this.lda(this.peek(ZP_MAIN.temp_x));
    this.cmp(this.peek(ZP_MAIN.temp_y));
    if (this.carry()) {
      sprite = (this.lda(this.peek(ZP_MAIN.temp_x)) & 0x80) ? TILES.tile_pirate_west : TILES.tile_pirate_east;
    } else {
      sprite = (this.lda(this.peek(ZP_MAIN.temp_y)) & 0x80) ? TILES.tile_pirate_north : TILES.tile_pirate_south;
    }
    this.poke(O.object_tile_sprite + this.cpu.x, this.lda(sprite));
  }


  private async turnShipRandom(): Promise<void> {
    await this.m.call(J.j_rand);
    await this.m.call(J.j_math_sign);
    this.add(this.peek(O.object_tile_sprite + this.cpu.x));
    this.lda(this.cpu.a & 0x03);
    this.poke(O.object_tile_sprite + this.cpu.x, this.lda(this.cpu.a | TILES.tile_pirate));
  }


  private async notPirate(): Promise<void> {
    let ranged: boolean = false;

    this.lda(this.peek(O.object_tile_type + this.cpu.x));
    this.cmp(TILES.tile_serpent);
    if (this.zero()) {
      ranged = true;
    } else {
      this.cmp(TILES.tile_lava_lizard);
      if (this.zero()) {
        ranged = true;
      } else {
        this.cmp(TILES.tile_hydra);
        ranged = this.carry();
      }
    }
    if (ranged) {
      await this.rangeAttack();
    }
    await this.mobTryMove();
  }


  /** Within five squares each way, an even chance of a fireball at the party. */
  private async rangeAttack(): Promise<void> {
    await this.sub(0x69F2, (): Promise<Exit> => this.manhattanDist());
    if ((await this.inRange(ZP_MAIN.temp_x, 0x69F7)) && (await this.inRange(ZP_MAIN.temp_y, 0x6A00))) {
      await this.m.call(J.j_rand);
      if (!this.negative()) {
        await this.sub(0x6A0C, (): Promise<Exit> => this.fireRedMissile());
        this.ldx(this.peek(zp_cur_mob_index));
      }
    }
  }


  private async inRange(distance: number, site: number): Promise<boolean> {
    this.lda(this.peek(distance));
    await this.sub(site, (): Promise<Exit> => this.mathAbs());
    this.cmp(RANGE_MISSILE_ATTACK);

    return !this.carry();
  }


  /** Two tries at a step: evil monsters, and good ones three times in four, toward the party; else at random. */
  private async mobTryMove(): Promise<Exit> {
    let moved: boolean = false;
    let toward: boolean = false;

    this.poke(zp_attempts, this.lda(0x02));
    this.lda(this.peek(O.object_tile_type + this.cpu.x));
    this.cmp(TILES.tile_whirlpool);
    if (!this.zero()) {
      this.cmp(TILES.tile_twister);
      if (!this.zero()) {
        await this.m.call(CE.is_evil);
        if (this.negative()) {
          toward = true;
        } else {
          await this.m.call(J.j_rand);
          toward = this.lda(this.cpu.a & CHANCE_4) === 0;
        }
      }
    }
    do {
      if (toward) {
        moved = await this.xOrY();
      }
      if (!moved) {
        await this.randomDeltas();
        toward = true;
      }
    } while (!moved && (this.dec(zp_attempts) !== 0));
    if (moved) {
      this.doMove();
    }

    return null;
  }


  /** A step along x or y, as chance has it, or the other if that one is blocked. */
  private async xOrY(): Promise<boolean> {
    let moved: boolean = false;

    await this.m.call(J.j_rand);
    if (!this.negative() && (this.lda(this.peek(ZP_MAIN.delta_x)) !== 0)) {
      moved = await this.tryStepWorld(ZP_MAIN.delta_x, 0, 0x6A45);
    }
    if (!moved && (this.lda(this.peek(ZP_MAIN.delta_y)) !== 0)) {
      moved = await this.tryStepWorld(0, ZP_MAIN.delta_y, 0x6A5E);
    }
    if (!moved && (this.lda(this.peek(ZP_MAIN.delta_x)) !== 0)) {
      moved = await this.tryStepWorld(ZP_MAIN.delta_x, 0, 0x6A77);
    }

    return moved;
  }


  private async tryStepWorld(dx: number, dy: number, legalSite: number): Promise<boolean> {
    this.setCarry(false);
    this.mobStep(dx, dy);
    await this.m.call(J.j_gettile_bounds);
    await this.sub(legalSite, (): Promise<Exit> => this.legalMoveWorldTwn());

    return !this.carry();
  }


  private async randomDeltas(): Promise<void> {
    await this.m.call(J.j_rand);
    await this.m.call(J.j_math_sign);
    this.poke(ZP_MAIN.delta_x, this.cpu.a);
    await this.m.call(J.j_rand);
    await this.m.call(J.j_math_sign);
    this.poke(ZP_MAIN.delta_y, this.cpu.a);
  }


  private doMove(): void {
    this.poke(O.object_xpos_prev + this.cpu.x, this.lda(this.peek(O.object_xpos + this.cpu.x)));
    this.poke(O.object_ypos_prev + this.cpu.x, this.lda(this.peek(O.object_ypos + this.cpu.x)));
    this.poke(O.object_xpos + this.cpu.x, this.lda(this.peek(ZP_MAIN.temp_x)));
    this.poke(O.object_ypos + this.cpu.x, this.lda(this.peek(ZP_MAIN.temp_y)));
  }


  /** ULT4.s manhattan_dist: the party's distance from the monster, in A, with (delta_x, delta_y) its direction. */
  public async manhattanDist(): Promise<Exit> {
    this.lda(this.peek(PRTY.player_xpos));
    this.poke(ZP_MAIN.temp_x, this.subtract(this.peek(O.object_xpos + this.cpu.x)));
    await this.m.call(J.j_math_sign);
    this.poke(ZP_MAIN.delta_x, this.cpu.a);
    this.lda(this.peek(PRTY.player_ypos));
    this.poke(ZP_MAIN.temp_y, this.subtract(this.peek(O.object_ypos + this.cpu.x)));
    await this.m.call(J.j_math_sign);
    this.poke(ZP_MAIN.delta_y, this.cpu.a);
    this.lda(this.peek(ZP_MAIN.temp_x));
    await this.sub(0x6DFD, (): Promise<Exit> => this.mathAbs());
    this.poke(zp_number2, this.cpu.a);
    this.lda(this.peek(ZP_MAIN.temp_y));
    await this.sub(0x6E04, (): Promise<Exit> => this.mathAbs());
    this.poke(zp_number2, this.add(this.peek(zp_number2)));

    return null;
  }


  // --- whirlpools, twisters and missiles (ULT4.s:5605-5790) ---------------------------------

  /** ULT4.s check_water_hazards: whirlpools and twisters take the party, and sink what they pass over. */
  public async checkWaterHazards(): Promise<Exit> {
    this.lda(this.peek(PRTY.game_mode));
    this.cmp(PRTY.mode_world);
    if (this.zero()) {
      this.ldx(O.object_wandering_max);
      do {
        this.lda(this.peek(O.object_tile_type + this.cpu.x));
        this.cmp(TILES.tile_whirlpool);
        if (this.zero()) {
          await this.hazard(SOUND.sound_drown, 0x6C94, (): Promise<Exit> => this.enterWhirlpool());
        } else {
          this.cmp(TILES.tile_twister);
          if (this.zero()) {
            await this.hazard(SOUND.sound_twister, 0x6CE4, (): Promise<Exit> => this.enterTwister());
          }
        }
      } while (!(this.dex() & 0x80));
    }

    return null;
  }


  private async hazard(sound: number, site: number, enter: () => Promise<Exit>): Promise<void> {
    this.poke(zp_sound, this.lda(sound));
    this.lda(this.peek(O.object_xpos + this.cpu.x));
    this.cmp(this.peek(PRTY.player_xpos));
    if (this.zero()) {
      this.lda(this.peek(O.object_ypos + this.cpu.x));
      this.cmp(this.peek(PRTY.player_ypos));
      if (this.zero()) {
        await this.sub(site, enter);
      }
    }
    await this.sinkObjects();
  }


  private async sinkObjects(): Promise<void> {
    this.ldy(O.object_max);
    do {
      this.poke(zp_index1, this.cpu.x);
      this.cpu.compare(this.cpu.y, this.peek(zp_index1));
      if (!this.zero() && (this.lda(this.peek(O.object_tile_type + this.cpu.y)) !== 0)) {
        this.lda(this.peek(O.object_xpos + this.cpu.x));
        this.cmp(this.peek(O.object_xpos + this.cpu.y));
        if (this.zero()) {
          this.lda(this.peek(O.object_ypos + this.cpu.x));
          this.cmp(this.peek(O.object_ypos + this.cpu.y));
          if (this.zero()) {
            await this.sink();
          }
        }
      }
    } while (!(this.dey() & 0x80));
  }


  private async sink(): Promise<void> {
    this.lda(0x00);
    this.poke(O.object_tile_type + this.cpu.y, this.cpu.a);
    this.poke(O.object_tile_sprite + this.cpu.y, this.cpu.a);
    this.poke(zp_save_reg1, this.cpu.x);
    this.poke(zp_save_reg2, this.cpu.y);
    await this.m.call(J.j_update_view);
    await this.playsfx(this.peek(zp_sound));
    this.ldx(this.peek(zp_save_reg1));
    this.ldy(this.peek(zp_save_reg2));
  }


  /** ULT4.s enter_whirlpool: the ship is drawn down and comes up by Lord British's castle. */
  public async enterWhirlpool(): Promise<Exit> {
    this.poke(zp_save_reg1, this.cpu.x);
    await this.m.call(J.j_update_view);
    this.poke(PRTY.player_transport, this.lda(TILES.tile_whirlpool));
    await this.m.call(J.j_update_view);
    this.poke(PRTY.player_xpos, this.lda(WHIRLPOOL_X));
    this.poke(PRTY.player_ypos, this.lda(WHIRLPOOL_Y));
    await this.playsfx(SOUND.sound_drown);
    await this.m.call(CE.damage_party);
    this.ldx(this.peek(zp_save_reg1));
    this.poke(PRTY.player_transport, this.lda(TILES.tile_ship_west));
    await this.m.call(J.j_player_teleport);

    return null;
  }


  /** ULT4.s enter_twister: the party is battered four times over. */
  public async enterTwister(): Promise<Exit> {
    this.poke(zp_save_reg1, this.cpu.x);
    this.cpu.push(this.lda(this.peek(PRTY.player_transport)));
    this.poke(PRTY.player_transport, this.lda(TILES.tile_twister));
    await this.m.call(J.j_update_view);
    await this.playsfx(SOUND.sound_twister);
    for (let blow: number = 0; blow < 4; blow++) {
      await this.m.call(CE.damage_party);
    }
    this.poke(PRTY.player_transport, this.lda(this.cpu.pull()));
    this.ldx(this.peek(zp_save_reg1));

    return null;
  }


  public fireCannonPirate(): Promise<Exit> {
    return this.fireAtParty(TILES.tile_attack_small, 0x6D38);
  }


  public fireRedMissile(): Promise<Exit> {
    return this.fireAtParty(TILES.tile_attack_red, 0x6D58);
  }


  /** A missile of `sprite` at the party, which bursts on it and hurts it if it gets there. */
  private async fireAtParty(sprite: number, site: number): Promise<Exit> {
    this.poke(O.attack_sprite, this.lda(sprite));
    await this.sub(site, (): Promise<Exit> => this.fireWorldMissile());
    if (!this.negative()) {
      await this.m.call(J.j_gettile_opposite);
      this.cpu.push(this.cpu.a);
      this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.lda(TILES.tile_attack_red));
      await this.m.call(J.j_animate_view);
      await this.m.call(CE.damage_party);
      await this.m.call(J.j_gettile_opposite);
      this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.lda(this.cpu.pull()));
    }

    return null;
  }


  /**
   * ULT4.s fire_world_missile: three squares toward the party; A 0 if it reaches it, else $FF. An
   * object in its way is hit: a monster one time in four, anything else always, is destroyed.
   */
  public async fireWorldMissile(): Promise<Exit> {
    let reached: boolean = false;
    let impact: boolean = false;

    this.poke(zp_missile_travel, this.lda(RANGE_MISSILE_TRAVEL));
    this.poke(ZP_MAIN.temp_x, this.lda(this.peek(O.object_xpos + this.cpu.x)));
    this.poke(ZP_MAIN.temp_y, this.lda(this.peek(O.object_ypos + this.cpu.x)));
    await this.m.call(J.j_update_view);
    await this.playsfx(SOUND.sound_cannon);
    do {
      this.lda(this.peek(ZP_MAIN.temp_x));
      this.poke(ZP_MAIN.temp_x, this.add(this.peek(ZP_MAIN.delta_x)));
      this.lda(this.peek(ZP_MAIN.temp_y));
      this.poke(ZP_MAIN.temp_y, this.add(this.peek(ZP_MAIN.delta_y)));
      this.cmp(this.peek(PRTY.player_ypos));
      if (this.zero()) {
        this.lda(this.peek(ZP_MAIN.temp_x));
        this.cmp(this.peek(PRTY.player_xpos));
        reached = this.zero();
      }
      if (!reached) {
        await this.sub(0x6DA4, (): Promise<Exit> => Promise.resolve(this.anyObjAtTempXy()));
        impact = !this.negative();
        if (!impact) {
          await this.worldMissileFlies();
        }
      }
    } while (!reached && !impact && (this.dec(zp_missile_travel) !== 0));
    if (reached) {
      this.lda(0x00);
    } else {
      if (impact) {
        await this.missileImpact();
      }
      this.lda(0xFF);
    }

    return null;
  }


  private async worldMissileFlies(): Promise<void> {
    await this.m.call(J.j_gettile_opposite);
    this.cpu.push(this.cpu.a);
    this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.lda(this.peek(O.attack_sprite)));
    await this.m.call(J.j_animate_view);
    await this.m.call(J.j_gettile_opposite);
    this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.lda(this.cpu.pull()));
  }


  private async missileImpact(): Promise<void> {
    let destroyed: boolean = true;

    this.poke(zp_save_reg2, this.cpu.x);
    await this.playsfx(SOUND.sound_damage);
    this.ldx(this.peek(zp_save_reg2));
    this.cpu.compare(this.cpu.x, O.object_inanimate_first);
    if (!this.carry()) {
      await this.m.call(J.j_rand);
      destroyed = this.lda(this.cpu.a & CHANCE_4) === 0;
    }
    if (destroyed) {
      this.lda(0x00);
      this.poke(O.object_tile_type + this.cpu.x, this.cpu.a);
      this.poke(O.object_tile_sprite + this.cpu.x, this.cpu.a);
    }
  }


  // --- moving and meeting (ULT4.s:8048-8076, 8740-8790) -------------------------------------

  /** ULT4.s legal_move_world_twn: C clear if the monster may step onto (temp_x, temp_y), whose tile is in A. */
  public async legalMoveWorldTwn(): Promise<Exit> {
    this.poke(zp_tile_type, this.cpu.a);
    await this.sub(0x7F99, (): Promise<Exit> => this.checkSlowTerrain());
    if (this.zero()) {
      this.denyMove();
    } else {
      this.lda(this.peek(O.object_tile_type + this.cpu.x));
      this.cmp(TILES.tile_whirlpool);
      let drifts: boolean = this.zero();

      if (!drifts) {
        this.cmp(TILES.tile_twister);
        drifts = this.zero();
      }
      if (drifts) {
        await this.avoidRepeatMove();
      } else if (this.objectInTheWay()) {
        this.denyMove();
      } else if (!this.ontoParty()) {
        if (this.isPirate()) {
          await this.checkTerrain();
        } else {
          await this.avoidRepeatMove();
        }
      }
    }

    return null;
  }


  /** Any object but a chest on the square. */
  private objectInTheWay(): boolean {
    let blocked: boolean = false;

    this.ldy(O.object_max);
    do {
      if (this.lda(this.peek(O.object_tile_type + this.cpu.y)) !== 0) {
        this.lda(this.peek(O.object_xpos + this.cpu.y));
        this.cmp(this.peek(ZP_MAIN.temp_x));
        if (this.zero()) {
          this.lda(this.peek(O.object_ypos + this.cpu.y));
          this.cmp(this.peek(ZP_MAIN.temp_y));
          if (this.zero()) {
            this.lda(this.peek(O.object_tile_type + this.cpu.y));
            this.cmp(TILES.tile_chest);
            blocked = !this.zero();
          }
        }
      }
    } while (!blocked && !(this.dey() & 0x80));

    return blocked;
  }


  /** The party's own square, which leaves C set by the compare. */
  private ontoParty(): boolean {
    let onto: boolean = false;

    this.lda(this.peek(ZP_MAIN.temp_x));
    this.cmp(this.peek(PRTY.player_xpos));
    if (this.zero()) {
      this.lda(this.peek(ZP_MAIN.temp_y));
      this.cmp(this.peek(PRTY.player_ypos));
      onto = this.zero();
    }

    return onto;
  }


  /** Back to the square it left, only one time in four. */
  private async avoidRepeatMove(): Promise<void> {
    let denied: boolean = false;

    this.lda(this.peek(ZP_MAIN.temp_x));
    this.cmp(this.peek(O.object_xpos_prev + this.cpu.x));
    if (this.zero()) {
      this.lda(this.peek(ZP_MAIN.temp_y));
      this.cmp(this.peek(O.object_ypos_prev + this.cpu.x));
      if (this.zero()) {
        await this.m.call(J.j_rand);
        denied = this.lda(this.cpu.a & CHANCE_4) !== 0;
      }
    }
    if (denied) {
      this.denyMove();
    } else {
      await this.checkTerrain();
    }
  }


  private async checkTerrain(): Promise<void> {
    this.lda(this.peek(O.object_tile_type + this.cpu.x));
    this.poke(zp_save_reg2, this.cpu.x);
    await this.sub(0x7FF5, (): Promise<Exit> => this.collideTerrain());
    this.ldx(this.peek(zp_save_reg2));
  }


  public denyMove(): Exit {
    this.setCarry(true);

    return null;
  }


  /** ULT4.s get_mob_at_temp_xy: the monster on (temp_x, temp_y) in A and X, or $FF; in the townes any object, in the dungeons none. */
  public getMobAtTempXy(): Exit {
    let exit: Exit;

    if (this.lda(this.peek(PRTY.current_location)) === 0) {
      this.ldx(O.object_mobs_max);
      exit = this.checkNextObject();
    } else {
      this.cmp(PRTY.loc_dng_first);
      exit = this.carry() ? this.tempXyNone() : this.anyObjAtTempXy();
    }

    return exit;
  }


  public anyObjAtTempXy(): Exit {
    this.ldx(O.object_max);

    return this.checkNextObject();
  }


  public checkNextObject(): Exit {
    let found: boolean = false;
    let left: boolean = true;

    while (!found && left) {
      this.lda(this.peek(ZP_MAIN.temp_x));
      this.cmp(this.peek(O.object_xpos + this.cpu.x));
      if (this.zero()) {
        this.lda(this.peek(ZP_MAIN.temp_y));
        this.cmp(this.peek(O.object_ypos + this.cpu.x));
        found = this.zero() && (this.lda(this.peek(O.object_tile_type + this.cpu.x)) !== 0);
      }
      if (!found) {
        left = !(this.dex() & 0x80);
      }
    }
    if (found) {
      this.lda(this.cpu.x);
    } else {
      this.tempXyNone();
    }

    return null;
  }


  public tempXySkip(): Exit {
    return (this.dex() & 0x80) ? this.tempXyNone() : this.checkNextObject();
  }


  public tempXyNone(): Exit {
    this.lda(0xFF);

    return null;
  }


  /** ULT4.s attacked_by: the foe's name, and the trainer's chance to avoid it; Z set if avoided. */
  public async attackedBy(): Promise<Exit> {
    await this.print(MI.attacked_by);
    this.lda(this.peek(ZP_COMBAT.foe_type_encountered));
    await this.sub(0x8420, (): Promise<Exit> => this.printTargetName());

    return this.checkAvoid();
  }


  public async checkAvoid(): Promise<Exit> {
    this.ldx(this.peek(TRAINERS.trainer_avoid));
    if (this.dex() === 0) {
      await this.print(MI.avoid);
      await this.sub(0x8487, (): Promise<Exit> => this.inputChar());
      this.cmp(CHAR.char_Y);
    }

    return null;
  }
}
