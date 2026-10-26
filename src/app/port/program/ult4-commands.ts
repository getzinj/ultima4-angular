// ULT4.s's remaining Britannia commands, ported: Attack, Enter and the places it loads, Fire, Get
// chest and its traps, Ignite, Jimmy, Locate, New order, Open, Quit, Ready, Volume, Music, Wear and
// Ztats; the turn's tile effects, food and magic; and the party's health and the screen effects
// that go with them. Talk is in Ult4Townes, and the dungeons' own code in Ult4Dungeons. Like the
// rest of ULT4's port, each entry leaves the registers and flags as the original does, and returns
// where control goes next.

import { DECIMAL } from '../../lifted-runtime/cpu';
import {
  APPLE, CHAR, DISKS, DUNGEON, JUMP_OVERLAY, JUMP_SUBS, JUMP_SYSTEM, MAP_OBJECTS, MUSIC, MUSIC_STATE, PRTY, ROST, SOUND, STRINGS, TABLES, TILES, TRAINERS,
  VIEW_MAP, ZP_COMBAT, ZP_MAIN,
} from '../../state/symbols';
import type { IInlineData } from '../inline-data';
import type { Exit } from '../routine';
import { COMBAT_ENTRIES } from './ult4-combat-data';
import { COMMAND_ENTRIES, COMMAND_INLINE, COMMAND_TABLES, COMMAND_VARIABLES } from './ult4-commands-data';
import { ULT4_ENTRIES } from './ult4-data';
import { Ult4Monsters } from './ult4-monsters';

const C = COMBAT_ENTRIES;
const CE = COMMAND_ENTRIES;
const CI = COMMAND_INLINE;
const CT = COMMAND_TABLES;
const CV = COMMAND_VARIABLES;
const E = ULT4_ENTRIES;
const J = JUMP_SUBS;
const O = MAP_OBJECTS;
/** ULT4.s's own uses of zero page for the commands. */
const zp_index1: number = 0xD8;
const zp_number1: number = 0xD8;
const zp_number2: number = 0xD9;
const zp_amount: number = 0xDA;
const zp_count: number = 0xEA;
const zp_save_reg1: number = 0xD8;
const zp_save_reg2: number = 0xD9;
const zp_target_index: number = 0xD9;
const zp_trap_type: number = 0xDA;
const zp_inventory_index: number = 0xD8;
const zp_display_line: number = 0xD9;
const zp_item_flags: number = 0xD8;
const zp_mp_max: number = 0xD8;
const zp_mp_class: number = 0xD8;
const zp_selected: number = 0xEA;
const zp_invert_line: number = 0xF0;
const zp_trainer_avoid: number = 0xD8;
const CHANCE_4: number = 0x03;
const CHANCE_8: number = 0x07;
const RANGE_MISSILE_TRAVEL: number = 0x03;
const TRAP_SLEEP: number = 0x01;
const TRAP_POISON: number = 0x02;
const STATUS_X: number = 0x18;
/** The arms and armour the commands that equip and show them tell apart: Wear reuses Ready's refusal. */
const ARMOUR_AS_WEAPON: number = 0x10;
/** Where the status window's player lines start, eight bitmap rows each, and the columns inverted. */
const NAME_COLUMN_LAST: number = 0x26;
const NAME_COLUMN_FIRST: number = 0x18;
const VIEW_ROWS: number = 0xAE;
const VIEW_COLUMNS: number = 0x16;


export abstract class Ult4Commands extends Ult4Monsters {
  // --- Attack (ULT4.s:1023-1146) ------------------------------------------------------------

  public async cmdAttack(): Promise<Exit> {
    let exit: Exit;

    await this.print(CI.attack);
    this.lda(this.peek(PRTY.game_mode));
    this.cmp(PRTY.mode_dungeon);
    if (this.zero()) {
      this.poke(zp_trainer_avoid, this.lda(0x00));
      exit = (await this.sub(0x4729, (): Promise<Exit> => this.dngCheckAttacked())) ?? E.done_what;
    } else {
      await this.sub(0x472F, (): Promise<Exit> => this.inputDirection());
      if (this.zero()) {
        exit = E.done_pass;
      } else {
        await this.sub(0x4737, (): Promise<Exit> => Promise.resolve(this.getMobAtTempXy()));
        exit = this.negative() ? E.done_nothing_there : await this.attackMob();
      }
    }

    return exit;
  }


  /** The object in X attacked, unless it is a chest, a whirlpool or a twister: in a towne the guards turn on the party. */
  private async attackMob(): Promise<Exit> {
    let exit: Exit;
    let nothing: boolean = false;

    this.poke(zp_index1, this.cpu.x);
    this.lda(this.peek(O.object_tile_type + this.cpu.x));
    for (const tile of [ TILES.tile_chest, TILES.tile_whirlpool, TILES.tile_twister ]) {
      if (!nothing) {
        this.cmp(tile);
        nothing = this.zero();
      }
    }
    if (nothing) {
      exit = E.done_nothing_there;
    } else {
      this.lda(this.peek(PRTY.game_mode));
      this.cmp(PRTY.mode_towne);
      if (this.zero()) {
        this.angerGuards();
      }
      exit = await this.checkVirtue();
    }

    return exit;
  }


  private angerGuards(): void {
    this.ldx(O.object_max);
    do {
      this.lda(this.peek(O.object_tile_type + this.cpu.x));
      this.cmp(TILES.tile_guard);
      if (!this.zero()) {
        this.cmp(TILES.tile_lord_british);
      }
      if (this.zero()) {
        this.poke(O.npc_movement_ai + this.cpu.x, this.lda(O.ai_hostile));
        this.poke(O.npc_dialogue + this.cpu.x, this.lda(0x00));
      }
    } while (!(this.dex() & 0x80));
  }


  /** An attack in a towne, or on anything that is not evil, costs compassion, justice and honour. */
  private async checkVirtue(): Promise<Exit> {
    let penalty: boolean;

    this.lda(this.peek(PRTY.game_mode));
    this.cmp(PRTY.mode_towne);
    if (this.zero()) {
      penalty = true;
    } else {
      this.ldx(this.peek(zp_index1));
      this.lda(this.peek(O.object_tile_type + this.cpu.x));
      await this.sub(0x477B, (): Promise<Exit> => Promise.resolve(this.isEvil()));
      penalty = !this.negative();
    }
    if (penalty) {
      await this.lowerVirtue(ROST.virtue_compassion, 0x05);
      await this.lowerVirtue(ROST.virtue_justice, 0x03);
      await this.lowerVirtue(ROST.virtue_honor, 0x03);
      await this.m.call(J.j_update_status);
    }

    return this.doAttack();
  }


  /** ULT4.s do_attack: a fight with the object in zp_index1, on the ground it stands on; townsfolk and odd tiles fight as their proper foes. */
  public async doAttack(): Promise<Exit> {
    this.ldx(this.peek(zp_index1));
    this.lda(this.peek(O.object_tile_type + this.cpu.x));
    for (const [ tile, foe ] of [
      [ TILES.tile_human_prone, TILES.tile_beggar ], [ TILES.tile_water_shallow, TILES.tile_water_coast ], [ TILES.tile_walk, TILES.tile_class_paladin ],
      [ TILES.tile_horse_east, TILES.tile_horse_west ],
    ]) {
      this.cmp(tile);
      if (this.zero()) {
        this.lda(foe);
      }
    }
    this.poke(ZP_COMBAT.foe_type_encountered, this.cpu.a);
    this.lda(this.peek(O.object_xpos + this.cpu.x));
    this.poke(ZP_COMBAT.pre_combat_x, this.cpu.a);
    this.poke(ZP_MAIN.temp_x, this.cpu.a);
    this.lda(this.peek(O.object_ypos + this.cpu.x));
    this.poke(ZP_COMBAT.pre_combat_y, this.cpu.a);
    this.poke(ZP_MAIN.temp_y, this.cpu.a);
    this.lda(this.peek(PRTY.game_mode));
    this.cmp(PRTY.mode_world);
    await this.m.call(this.zero() ? J.j_gettile_bounds : J.j_gettile_towne);
    this.poke(ZP_COMBAT.pre_combat_tile, this.cpu.a);
    this.lda(0x00);
    this.ldx(this.peek(zp_index1));
    this.poke(O.object_tile_type + this.cpu.x, this.cpu.a);
    this.poke(O.object_tile_sprite + this.cpu.x, this.cpu.a);
    this.poke(O.npc_movement_ai + this.cpu.x, this.cpu.a);

    return C.init_combat;
  }


  // --- Enter (ULT4.s:2255-2549) -------------------------------------------------------------

  public async cmdEnter(): Promise<Exit> {
    let exit: Exit;

    await this.print(CI.enter);
    if (this.lda(this.peek(PRTY.current_location)) !== 0) {
      exit = E.done_what;
    } else {
      this.lda(this.peek(PRTY.player_transport));
      this.cmp(TILES.tile_balloon);
      exit = this.zero() ? E.done_cant : await this.findLocation();
    }

    return exit;
  }


  /** The place the party stands on, from the last of the table down: its number, one more than its index, becomes the location. */
  private async findLocation(): Promise<Exit> {
    let found: boolean = false;

    this.ldx(O.object_last);
    while (!found && !(this.dex() & 0x80)) {
      this.lda(this.peek(CT.location_map_x + this.cpu.x));
      this.cmp(this.peek(PRTY.player_xpos));
      if (this.zero()) {
        this.lda(this.peek(CT.location_map_y + this.cpu.x));
        this.cmp(this.peek(PRTY.player_ypos));
        found = this.zero();
      }
    }

    return found ? this.enterLocation() : E.done_what;
  }


  private async enterLocation(): Promise<Exit> {
    let exit: Exit = null;

    this.poke(PRTY.current_location, this.cpu.x);
    this.inc(PRTY.current_location);
    this.poke(PRTY.britannia_x, this.lda(this.peek(PRTY.player_xpos)));
    this.poke(PRTY.britannia_y, this.lda(this.peek(PRTY.player_ypos)));
    this.lda(this.peek(ZP_MAIN.tile_under_player));
    const places: readonly [ number, () => Promise<Exit> ][] = [
      [ TILES.tile_dungeon_entrance, (): Promise<Exit> => this.tryEnterDungeon() ],
      [ TILES.tile_towne, (): Promise<Exit> => this.printTowne() ],
      [ TILES.tile_castle, (): Promise<Exit> => this.printCastle() ],
      [ TILES.tile_village, (): Promise<Exit> => this.printVillage() ],
      [ TILES.tile_castle_center, (): Promise<Exit> => this.printCastle() ],
      [ TILES.tile_ruin, (): Promise<Exit> => this.printRuin() ],
      [ TILES.tile_shrine, (): Promise<Exit> => this.printShrine() ],
      [ TILES.tile_field_fire, (): Promise<Exit> => this.tryEnterAbyss() ],
    ];
    let place: (() => Promise<Exit>) | null = null;

    for (const [ tile, enter ] of places) {
      if (place == null) {
        this.cmp(tile);
        if (this.zero()) {
          place = enter;
        }
      }
    }
    if (place == null) {
      this.poke(PRTY.current_location, this.lda(PRTY.loc_world));
      exit = E.done_what;
    } else {
      exit = await place();
    }

    return exit;
  }


  public async tryEnterAbyss(): Promise<Exit> {
    let exit: Exit;

    this.lda(this.peek(ROST.bell_book_candle));
    this.cmp(ROST.items_opened_abyss);
    if (this.zero()) {
      await this.sub(0x50F2, (): Promise<Exit> => this.printLocationName());
      exit = await this.checkOnFoot();
    } else {
      this.poke(PRTY.current_location, this.lda(PRTY.loc_world));
      exit = E.done_cant;
    }

    return exit;
  }


  public async tryEnterDungeon(): Promise<Exit> {
    await this.print(CI.dungeon);
    await this.sub(0x5105, (): Promise<Exit> => this.printLocationName());

    return this.checkOnFoot();
  }


  public async checkOnFoot(): Promise<Exit> {
    let exit: Exit;

    this.lda(this.peek(PRTY.player_transport));
    this.cmp(TILES.tile_walk);
    if (this.zero()) {
      this.lda(0x01);
      this.poke(ZP_MAIN.temp_x, this.cpu.a);
      this.poke(ZP_MAIN.temp_y, this.cpu.a);
      await this.musicCtl(MUSIC.music_off);
      await this.sub(0x5120, (): Promise<Exit> => this.fileWriteTempMap());
      exit = CE.begin_dng_load;
    } else {
      this.poke(PRTY.current_location, this.lda(PRTY.loc_world));
      exit = E.done_only_on_foot;
    }

    return exit;
  }


  /** ULT4.s begin_dng_load: the dungeon loaded, the party at (temp_x, temp_y) on its top level, facing east. */
  public async beginDngLoad(): Promise<Exit> {
    await this.sub(0x5123, (): Promise<Exit> => this.loadDungeon());
    this.poke(PRTY.dng_direction, this.lda(DUNGEON.dng_dir_east));
    this.poke(PRTY.player_xpos, this.lda(this.peek(ZP_MAIN.temp_x)));
    this.poke(PRTY.player_ypos, this.lda(this.peek(ZP_MAIN.temp_y)));
    this.poke(PRTY.dungeon_level, this.lda(0x00));

    return E.cmd_done;
  }


  public async loadDungeon(): Promise<Exit> {
    await this.musicCtl(MUSIC.music_off);
    this.lda(DISKS.disk_dungeon);
    await this.m.call(J.j_request_disk);
    await this.callWith(J.j_primm_cout, CI.bload_dngd);
    await this.sub(0x515A, (): Promise<Exit> => this.loadDungeonMap());
    this.poke(PRTY.game_mode, this.lda(PRTY.mode_dungeon));
    this.lda(MUSIC.music_Dungeon);
    await this.jmp(JUMP_SYSTEM.music_ctl);

    return null;
  }


  /** ULT4.s load_dungeon_map: the location's dungeon map, its digit patched into the BLOAD, and the objects cleared. */
  public async loadDungeonMap(): Promise<Exit> {
    this.lda(this.peek(PRTY.current_location));
    this.poke(CV.file_char_dungeon, this.add(CHAR.char_num_first - PRTY.loc_dng_first));
    await this.callWith(J.j_primm_cout, CI.bload_dungeon_map);
    this.ldx(0x00);
    this.lda(this.cpu.x);
    do {
      this.poke(O.object_tile_sprite + this.cpu.x, this.cpu.a);
    } while (this.inx() !== 0);

    return null;
  }


  public async printRuin(): Promise<Exit> {
    await this.print(CI.ruin);

    return this.enterTowne();
  }


  public async printTowne(): Promise<Exit> {
    await this.print(CI.towne);

    return this.enterTowne();
  }


  /** ULT4.s enter_towne: the towne loaded and the party at its west gate, without the companion who lives there. */
  public async enterTowne(): Promise<Exit> {
    await this.musicCtl(MUSIC.music_off);
    await this.sub(0x51AC, (): Promise<Exit> => this.printLocationName());
    await this.sub(0x51AF, (): Promise<Exit> => this.loadTowne());
    this.poke(PRTY.player_ypos, this.lda(0x0F));
    this.poke(PRTY.player_xpos, this.lda(0x01));
    this.lda(this.peek(PRTY.current_location));
    this.subtract(PRTY.loc_towne_first);
    this.cmp(PRTY.num_townes);
    if (!this.carry()) {
      await this.removeCompanion();
    }
    await this.musicCtl(MUSIC.music_Towne);

    return E.cmd_done;
  }


  /** The towne's companion, the last object, gone if one of the party's class is that towne's. */
  private async removeCompanion(): Promise<void> {
    let joined: boolean = false;

    this.poke(zp_index1, this.cpu.a);
    this.poke(ZP_MAIN.curr_player, this.lda(this.peek(PRTY.party_size)));
    this.lda(this.peek(ZP_MAIN.curr_player));
    this.cmp(0x02);
    while (!joined && this.carry()) {
      await this.m.call(J.j_get_stats_ptr);
      this.ldy(ROST.player_class_index);
      this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y));
      this.cmp(this.peek(zp_index1));
      joined = this.zero();
      if (!joined) {
        this.dec(ZP_MAIN.curr_player);
        this.lda(this.peek(ZP_MAIN.curr_player));
        this.cmp(0x02);
      }
    }
    if (joined) {
      this.lda(0x00);
      this.ldx(O.object_max);
      this.poke(O.object_tile_type + this.cpu.x, this.cpu.a);
      this.poke(O.object_tile_sprite + this.cpu.x, this.cpu.a);
      this.poke(O.npc_movement_ai + this.cpu.x, this.cpu.a);
    }
  }


  public async printVillage(): Promise<Exit> {
    await this.print(CI.village);

    return this.enterTowne();
  }


  public async printCastle(): Promise<Exit> {
    await this.musicCtl(MUSIC.music_off);
    await this.print(CI.castle);
    await this.sub(0x5215, (): Promise<Exit> => this.printLocationName());
    await this.sub(0x5218, (): Promise<Exit> => this.loadTowne());
    this.poke(PRTY.player_xpos, this.lda(0x0F));
    this.poke(PRTY.player_ypos, this.lda(0x1E));
    this.poke(PRTY.dungeon_level, this.lda(0x00));
    await this.musicCtl(MUSIC.music_Castles);

    return E.cmd_done;
  }


  public async printShrine(): Promise<Exit> {
    await this.print(CI.shrine);
    this.lda(this.peek(PRTY.current_location));
    this.add(STRINGS.string_shrines);
    await this.m.call(J.j_printstring);
    await this.sub(0x5249, (): Promise<Exit> => this.printNewline());

    return CE.load_shrine;
  }


  public async loadShrine(): Promise<Exit> {
    await this.loadOverlay(CI.bload_shrn);
    await this.jsrOut(0x5268, JUMP_OVERLAY.j_overlay_entry);
    await this.musicCtl(MUSIC.music_adventure);

    return E.cmd_done;
  }


  public async printLocationName(): Promise<Exit> {
    await this.sub(0x52B3, (): Promise<Exit> => this.printNewline());
    this.lda(this.peek(PRTY.current_location));
    this.add(STRINGS.string_locations);
    await this.m.call(J.j_centerstring);
    await this.sub(0x52BE, (): Promise<Exit> => this.printNewline());

    return null;
  }


  public async fileWriteTempMap(): Promise<Exit> {
    this.lda(DISKS.disk_britannia);
    await this.m.call(J.j_request_disk);
    await this.callWith(J.j_primm_cout, CI.bsave_tlst);

    return null;
  }


  public async loadTowne(): Promise<Exit> {
    await this.sub(0x52E5, (): Promise<Exit> => this.fileWriteTempMap());
    this.lda(DISKS.disk_towne);
    await this.m.call(J.j_request_disk);
    this.lda(this.peek(PRTY.current_location));
    this.add(CHAR.char_at_sign);

    return this.loadLetterLocation();
  }


  /** ULT4.s load_letter_location: towne map A (a letter), patched into the BLOAD, copied to the towne's map and objects. */
  public async loadLetterLocation(): Promise<Exit> {
    this.poke(CV.map_number, this.cpu.a);
    await this.callWith(J.j_primm_cout, CI.bload_map);
    this.ldx(0x00);
    do {
      for (let page: number = 0; page < 4; page++) {
        this.poke(O.towne_map + (page << 8) + this.cpu.x, this.lda(this.peek(VIEW_MAP.load_buf + (page << 8) + this.cpu.x)));
      }
      this.poke(O.object_tile_sprite + this.cpu.x, this.lda(this.peek(VIEW_MAP.load_buf + 0x400 + this.cpu.x)));
    } while (this.inx() !== 0);
    this.poke(PRTY.game_mode, this.lda(PRTY.mode_towne));

    return null;
  }


  // --- Fire (ULT4.s:2548-2641) --------------------------------------------------------------

  public fireAtWhat(): Exit {
    return E.done_what;
  }


  public async cmdFire(): Promise<Exit> {
    let exit: Exit;

    await this.print(CI.fire);
    this.lda(this.peek(PRTY.player_transport));
    this.cmp(TILES.tile_ship_first);
    if (!this.carry()) {
      exit = this.fireAtWhat();
    } else {
      this.cmp(TILES.tile_ship_last);
      if (this.carry()) {
        exit = this.fireAtWhat();
      } else {
        await this.sub(0x534B, (): Promise<Exit> => this.inputDirection());
        exit = this.zero() ? E.done_pass : await this.aimCannon();
      }
    }

    return exit;
  }


  /** Only broadsides: east and west from a ship sailing north or south, and the other way about. */
  private async aimCannon(): Promise<Exit> {
    const across: readonly number[] = (this.lda(this.peek(ZP_MAIN.delta_x)) === 0)
      ? [ TILES.tile_ship_west, TILES.tile_ship_east ]
      : [ TILES.tile_ship_north, TILES.tile_ship_south ];
    let broadside: boolean = false;

    this.lda(this.peek(PRTY.player_transport));
    for (const ship of across) {
      if (!broadside) {
        this.cmp(ship);
        broadside = this.zero();
      }
    }
    if (broadside) {
      await this.fireCannon();
    } else {
      await this.print(CI.only_broadsides);
      await this.playsfx(SOUND.sound_what);
    }

    return E.cmd_done;
  }


  private async fireCannon(): Promise<void> {
    let hit: boolean = false;

    await this.playsfx(SOUND.sound_cannon);
    this.poke(zp_count, this.lda(RANGE_MISSILE_TRAVEL));
    do {
      await this.sub(0x5394, (): Promise<Exit> => Promise.resolve(this.anyObjAtTempXy()));
      hit = !this.negative();
      if (hit) {
        await this.cannonHit();
      } else {
        await this.flash(TILES.tile_attack_small, false);
        this.lda(this.peek(ZP_MAIN.temp_x));
        this.poke(ZP_MAIN.temp_x, this.add(this.peek(ZP_MAIN.delta_x)));
        this.lda(this.peek(ZP_MAIN.temp_y));
        this.poke(ZP_MAIN.temp_y, this.add(this.peek(ZP_MAIN.delta_y)));
      }
    } while (!hit && (this.dec(zp_count) !== 0));
  }


  /** A tile flashed at (temp_x, temp_y) in the view, with the damage sound if it hit, and put back. */
  private async flash(tile: number, damage: boolean): Promise<void> {
    await this.m.call(J.j_gettile_opposite);
    this.cpu.push(this.cpu.a);
    this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.lda(tile));
    await this.m.call(J.j_animate_view);
    if (damage) {
      await this.playsfx(SOUND.sound_damage);
    }
    await this.m.call(J.j_gettile_opposite);
    this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.lda(this.cpu.pull()));
  }


  /** A monster hit has one chance in four of sinking; anything else is gone, save Lord British. */
  private async cannonHit(): Promise<void> {
    let destroyed: boolean = true;

    this.poke(zp_target_index, this.cpu.x);
    await this.flash(TILES.tile_attack_red, true);
    this.lda(this.peek(zp_target_index));
    this.cmp(O.object_inanimate_first);
    if (!this.carry()) {
      await this.m.call(J.j_rand);
      destroyed = this.lda(this.cpu.a & CHANCE_4) === 0;
    }
    if (destroyed) {
      this.lda(0x00);
      this.ldx(this.peek(zp_target_index));
      this.ldy(this.peek(O.object_tile_type + this.cpu.x));
      this.cpu.compare(this.cpu.y, TILES.tile_lord_british);
      if (!this.zero()) {
        this.poke(O.object_tile_type + this.cpu.x, this.cpu.a);
        this.poke(O.object_tile_sprite + this.cpu.x, this.cpu.a);
      }
    }
  }


  // --- Get chest (ULT4.s:2643-2832) ---------------------------------------------------------

  public async cmdGetChest(): Promise<Exit> {
    let exit: Exit;

    await this.print(CI.get_chest);
    await this.m.call(J.j_getplayernum);
    if (this.zero()) {
      exit = E.done_aborted;
    } else {
      this.cmp(this.peek(PRTY.party_size));
      if (this.carry() && !this.zero()) {
        exit = E.done_not_a_player;
      } else {
        await this.sub(0x5426, (): Promise<Exit> => this.isAwake());
        exit = this.zero() ? await this.tryGetChest() : E.done_disabled;
      }
    }

    return exit;
  }


  public async tryGetChest(): Promise<Exit> {
    let exit: Exit;

    this.lda(this.peek(PRTY.game_mode));
    this.cmp(PRTY.mode_dungeon);
    if (this.zero()) {
      exit = await this.getInDungeon();
    } else {
      this.lda(this.peek(ZP_MAIN.tile_under_player));
      this.cmp(TILES.tile_chest);
      if (!this.zero()) {
        exit = E.done_not_here;
      } else if (this.lda(this.peek(PRTY.current_location)) === 0) {
        exit = this.getDroppedChest();
      } else {
        await this.m.call(J.j_get_player_tile);
        this.cmp(TILES.tile_chest);
        exit = this.zero() ? await this.getTowneChest() : this.getDroppedChest();
      }
    }

    return exit;
  }


  /** A towne's own chest, taken from the floor: stealing costs honesty, justice and honour. */
  public async getTowneChest(): Promise<Exit> {
    this.poke(this.pointer(ZP_MAIN.ptr2) + this.cpu.y, this.lda(TILES.tile_floor_brick));
    await this.lowerVirtue(ROST.virtue_honesty, 0x01);
    await this.lowerVirtue(ROST.virtue_justice, 0x01);
    await this.lowerVirtue(ROST.virtue_honor, 0x01);

    return this.getChest();
  }


  /** A chest a foe left, the object under the party, gone. */
  public getDroppedChest(): Exit {
    let found: boolean = false;

    this.ldx(O.object_max);
    do {
      this.lda(this.peek(O.object_tile_type + this.cpu.x));
      this.cmp(TILES.tile_chest);
      if (this.zero()) {
        this.lda(this.peek(O.object_xpos + this.cpu.x));
        this.cmp(this.peek(PRTY.player_xpos));
        if (this.zero()) {
          this.lda(this.peek(O.object_ypos + this.cpu.x));
          this.cmp(this.peek(PRTY.player_ypos));
          found = this.zero();
        }
      }
    } while (!found && !(this.dex() & 0x80));
    if (found) {
      this.lda(0x00);
      this.poke(O.object_tile_type + this.cpu.x, this.cpu.a);
      this.poke(O.object_tile_sprite + this.cpu.x, this.cpu.a);
    }

    return this.getChest();
  }


  public getChest(): Exit {
    return CE.do_get_chest;
  }


  public async getInDungeon(): Promise<Exit> {
    let exit: Exit;

    this.lda(this.peek(ZP_MAIN.tile_under_player));
    this.cmp(DUNGEON.dng_tile_chest);
    if (this.zero()) {
      this.poke(PRTY.dest_x, this.lda(this.peek(PRTY.player_xpos)));
      this.poke(PRTY.dest_y, this.lda(this.peek(PRTY.player_ypos)));
      await this.m.call(J.j_gettile_dungeon);
      this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.lda(0x00));
      exit = await this.doGetChest();
    } else {
      exit = E.done_not_here;
    }

    return exit;
  }


  /** ULT4.s do_get_chest: half the chests are trapped, the trap named and, unless the opener evades it, sprung. */
  public async doGetChest(): Promise<Exit> {
    let exit: Exit;

    await this.m.call(J.j_rand);
    if (this.negative()) {
      exit = await this.collectGold();
    } else {
      this.poke(zp_trap_type, this.lda(this.cpu.a & 0x03));
      await this.m.call(J.j_rand);
      this.poke(zp_trap_type, this.lda(this.cpu.a & this.peek(zp_trap_type)));
      await this.print(this.trapName());
      exit = await this.tryEvade();
    }

    return exit;
  }


  private trapName(): IInlineData {
    let name: IInlineData = CI.bomb;

    if (this.zero()) {
      name = CI.acid;
    } else {
      this.cmp(TRAP_SLEEP);
      if (this.zero()) {
        name = CI.sleep;
      } else {
        this.cmp(TRAP_POISON);
        if (this.zero()) {
          name = CI.poison;
        }
      }
    }

    return name;
  }


  /** Evaded if dexterity and 25 is more than a roll below 100; the trap springs on the party when no one opened it. */
  private async tryEvade(): Promise<Exit> {
    let exit: Exit;

    await this.print(CI.trap);
    if (this.lda(this.peek(ZP_MAIN.curr_player)) === 0) {
      exit = await this.trapEvaded();
    } else {
      await this.m.call(J.j_get_stats_ptr);
      this.ldy(ROST.player_dexterity);
      this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y));
      await this.sub(0x5502, (): Promise<Exit> => Promise.resolve(this.decodeBcdValue()));
      this.poke(zp_number2, this.add(0x19));
      this.lda(0x64);
      await this.sub(0x550C, (): Promise<Exit> => this.randModulo());
      this.cmp(this.peek(zp_number2));
      exit = this.carry() ? await this.checkAcid() : await this.trapEvaded();
    }

    return exit;
  }


  public async trapEvaded(): Promise<Exit> {
    await this.print(CI.evaded);
    await this.playsfx(SOUND.sound_alert);

    return this.collectGold();
  }


  public async checkAcid(): Promise<Exit> {
    let exit: Exit;

    if (this.lda(this.peek(zp_trap_type)) === 0) {
      await this.sub(0x552B, (): Promise<Exit> => this.burnPlayer());
      exit = await this.collectGold();
    } else {
      this.cmp(TRAP_SLEEP);
      if (this.zero()) {
        await this.trapStatus(ROST.status_Sleep, 0x553E);
        this.lda(this.peek(PRTY.game_mode));
        if (this.negative()) {
          this.lda(TILES.tile_human_prone);
          this.ldx(this.peek(ZP_MAIN.curr_player));
          this.poke(O.combat_player_tile - 1 + this.cpu.x, this.cpu.a);
        }
        exit = await this.collectGold();
      } else {
        this.cmp(TRAP_POISON);
        if (this.zero()) {
          await this.trapStatus(ROST.status_Poison, 0x555C);
          exit = await this.collectGold();
        } else {
          exit = await this.checkBomb();
        }
      }
    }

    return exit;
  }


  private async trapStatus(status: number, site: number): Promise<void> {
    await this.m.call(J.j_get_stats_ptr);
    this.ldy(ROST.player_status);
    this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.lda(status));
    await this.sub(site, (): Promise<Exit> => this.hilightDamagedPlr());
  }


  public async checkBomb(): Promise<Exit> {
    const exit: Exit = await this.sub(0x5562, (): Promise<Exit> => this.damageParty());

    return exit ?? this.collectGold();
  }


  /** ULT4.s collect_gold: up to 99 gold, in BCD. */
  public async collectGold(): Promise<Exit> {
    await this.print(CI.chest_holds);
    this.lda(0x64);
    await this.sub(0x557C, (): Promise<Exit> => this.randModulo());
    await this.sub(0x557F, (): Promise<Exit> => Promise.resolve(this.encodeBcdValue()));
    await this.sub(0x5582, (): Promise<Exit> => this.incPartyGold());
    this.lda(this.peek(zp_number1));
    await this.m.call(J.j_printbcd);
    await this.print(CI.gold);

    return E.cmd_done;
  }


  // --- Ignite, Jimmy, Locate (ULT4.s:2865-2908, 2994-3046) ----------------------------------

  public async cmdIgnite(): Promise<Exit> {
    let exit: Exit = E.cmd_done;
    let lit: boolean = true;

    await this.print(CI.ignite);
    if (this.lda(this.peek(TRAINERS.trainer_torch)) === 0) {
      this.ldy(ROST.party_stat_torches);
      await this.sub(0x5622, (): Promise<Exit> => this.decStat());
      lit = this.carry();
    }
    if (lit) {
      this.poke(PRTY.light_duration, this.lda(0x64));
      this.lda(this.peek(PRTY.game_mode));
      this.cmp(PRTY.mode_dungeon);
      if (this.zero()) {
        await this.m.call(JUMP_OVERLAY.j_dng_neighbor_tiles);
      }
    } else {
      exit = E.done_have_none;
    }

    return exit;
  }


  /** ULT4.s cmd_jimmy_lock: a key spent on a locked door in a towne. Its direction is asked even where there is none to pick. */
  public async cmdJimmyLock(): Promise<Exit> {
    let exit: Exit = E.done_not_here;

    await this.print(CI.jimmy);
    await this.sub(0x5649, (): Promise<Exit> => this.inputDirection());
    this.lda(this.peek(PRTY.game_mode));
    this.cmp(PRTY.mode_world);
    if (!this.zero()) {
      await this.m.call(J.j_gettile_towne);
      this.cmp(TILES.tile_door_locked);
      if (this.zero()) {
        exit = await this.unlock();
      }
    }

    return exit;
  }


  private async unlock(): Promise<Exit> {
    let unlocked: boolean = true;

    if (this.lda(this.peek(TRAINERS.trainer_jimmy)) === 0) {
      this.ldy(ROST.party_stat_keys);
      await this.sub(0x5666, (): Promise<Exit> => this.decStat());
      unlocked = this.carry();
    }
    if (unlocked) {
      this.lda(TILES.tile_door_unlocked);
      this.ldy(0x00);
      this.poke(this.pointer(ZP_MAIN.ptr2) + this.cpu.y, this.cpu.a);
    }

    return unlocked ? E.done_done : E.done_have_none;
  }


  /** ULT4.s cmd_locate: with a sextant, the latitude and longitude, each a letter for the sixteenth and one for the tile in it. */
  public async cmdLocate(): Promise<Exit> {
    let exit: Exit = E.cmd_done;

    await this.print(CI.locate);
    if (this.lda(this.peek(ROST.sextant)) === 0) {
      await this.print(CI.with);
      exit = E.done_what;
    } else {
      await this.print(CI.latitude);
      await this.printPosition(PRTY.player_ypos);
      await this.print(CI.longitude);
      await this.printPosition(PRTY.player_xpos);
      this.lda(CHAR.char_double_quote);
      await this.m.call(J.j_console_out);
      await this.sub(0x57B0, (): Promise<Exit> => this.printNewline());
    }

    return exit;
  }


  private async printPosition(address: number): Promise<void> {
    this.lda(this.peek(address));
    this.cpu.a = this.cpu.lsr(this.cpu.lsr(this.cpu.lsr(this.cpu.lsr(this.cpu.a))));
    this.add(CHAR.char_alpha_first);
    await this.m.call(J.j_console_out);
    this.lda(CHAR.char_single_quote);
    await this.m.call(J.j_console_out);
    this.lda(this.peek(address) & 0x0F);
    this.add(CHAR.char_alpha_first);
    await this.m.call(J.j_console_out);
  }


  // --- New order, Open (ULT4.s:3062-3165) ---------------------------------------------------

  public async cmdNewOrder(): Promise<Exit> {
    let exit: Exit;

    await this.print(CI.new_order);
    await this.m.call(J.j_getplayernum);
    if (this.zero()) {
      exit = E.done_aborted;
    } else {
      this.cmp(0x01);
      if (this.zero()) {
        exit = await this.youMustLead();
      } else {
        this.cmp(this.peek(PRTY.party_size));
        exit = (this.carry() && !this.zero()) ? E.done_not_here : await this.exchangeWith();
      }
    }

    return exit;
  }


  private async exchangeWith(): Promise<Exit> {
    let exit: Exit;

    this.poke(ZP_MAIN.target_player, this.cpu.a);
    await this.m.call(J.j_get_stats_ptr);
    this.poke(CV.new_order_stat_ptr, this.lda(this.peek(ZP_MAIN.ptr1)));
    this.poke(CV.new_order_stat_ptr + 1, this.lda(this.peek(ZP_MAIN.ptr1 + 1)));
    await this.print(CI.with_player);
    await this.m.call(J.j_getplayernum);
    if (this.zero()) {
      exit = E.done_aborted;
    } else {
      this.cmp(0x01);
      if (this.zero()) {
        exit = await this.youMustLead();
      } else {
        this.cmp(this.peek(ZP_MAIN.target_player));
        if (this.zero()) {
          exit = E.done_done;
        } else {
          this.cmp(this.peek(PRTY.party_size));
          exit = (this.carry() && !this.zero()) ? E.done_not_here : await this.exchange();
        }
      }
    }

    return exit;
  }


  private async exchange(): Promise<Exit> {
    await this.m.call(J.j_get_stats_ptr);
    this.ldy(ROST.player_stat_max);
    this.poke(ZP_MAIN.ptr2, this.lda(this.peek(CV.new_order_stat_ptr)));
    this.poke(ZP_MAIN.ptr2 + 1, this.lda(this.peek(CV.new_order_stat_ptr + 1)));
    do {
      this.cpu.push(this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y)));
      this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.lda(this.peek(this.pointer(ZP_MAIN.ptr2) + this.cpu.y)));
      this.poke(this.pointer(ZP_MAIN.ptr2) + this.cpu.y, this.lda(this.cpu.pull()));
    } while (!(this.dey() & 0x80));
    await this.m.call(J.j_clearstatwindow);
    await this.m.call(J.j_update_status);

    return E.done_done;
  }


  public async youMustLead(): Promise<Exit> {
    await this.m.call(J.j_printname);
    await this.print(CI.must_lead);

    return E.done_aborted;
  }


  /** ULT4.s cmd_open_door: any door left open shut first, then an unlocked door in a towne opened for five turns. */
  public async cmdOpenDoor(): Promise<Exit> {
    let exit: Exit = E.done_not_here;

    do {
      await this.sub(0x5898, (): Promise<Exit> => this.closeOpenDoor());
    } while (this.lda(this.peek(CV.door_open_countdown)) !== 0);
    await this.print(CI.open);
    await this.sub(0x58A9, (): Promise<Exit> => this.inputDirection());
    this.lda(this.peek(PRTY.game_mode));
    this.cmp(PRTY.mode_towne);
    if (this.zero()) {
      await this.m.call(J.j_gettile_towne);
      this.cmp(TILES.tile_door_unlocked);
      if (this.zero()) {
        exit = await this.open();
      } else {
        this.cmp(TILES.tile_door_locked);
        if (this.zero()) {
          exit = E.done_cant;
        }
      }
    }

    return exit;
  }


  private async open(): Promise<Exit> {
    this.poke(CV.door_open_x, this.lda(this.peek(ZP_MAIN.temp_x)));
    this.poke(CV.door_open_y, this.lda(this.peek(ZP_MAIN.temp_y)));
    this.poke(CV.door_open_countdown, this.lda(0x05));
    this.poke(this.pointer(ZP_MAIN.ptr2) + this.cpu.y, this.lda(TILES.tile_floor_brick));
    await this.print(CI.opened);

    return E.cmd_done;
  }


  /** ULT4.s close_open_door: a turn off an open door's count, and the door shut when it runs out. */
  public async closeOpenDoor(): Promise<Exit> {
    let close: boolean = true;

    this.lda(this.peek(PRTY.game_mode));
    this.cmp(PRTY.mode_towne);
    if (this.zero()) {
      if (this.lda(this.peek(CV.door_open_countdown)) === 0) {
        close = false;
      } else if (this.dec(CV.door_open_countdown) === 0) {
        this.poke(ZP_MAIN.temp_x, this.lda(this.peek(CV.door_open_x)));
        this.poke(ZP_MAIN.temp_y, this.lda(this.peek(CV.door_open_y)));
        await this.m.call(J.j_gettile_towne);
        this.poke(this.pointer(ZP_MAIN.ptr2) + this.cpu.y, this.lda(TILES.tile_door_unlocked));
      } else {
        close = false;
      }
    }
    if (close) {
      this.poke(CV.door_open_countdown, this.lda(0x00));
    }

    return null;
  }


  // --- Quit (ULT4.s:3202-3294) --------------------------------------------------------------

  /** ULT4.s cmd_quit: the moves counted, and the game saved, in Britannia or in a dungeon. */
  public async cmdQuit(): Promise<Exit> {
    let exit: Exit = E.cmd_done;

    await this.print(CI.quit);
    await this.sub(0x5970, (): Promise<Exit> => this.printMoveCount());
    this.lda(this.peek(PRTY.game_mode));
    this.poke(zp_save_reg1, this.cpu.a);
    this.inc(zp_save_reg1);
    this.cmp(PRTY.mode_dungeon);
    if (!this.zero() && (this.lda(this.peek(PRTY.current_location)) !== 0)) {
      exit = E.done_not_here;
    } else {
      await this.musicCtl(MUSIC.music_off);
      this.lda(DISKS.disk_britannia);
      await this.m.call(J.j_request_disk);
      await this.callWith(J.j_primm_cout, CI.bsave_game);
      this.lda(this.peek(zp_save_reg1));
      await this.m.call(J.j_request_disk);
      await this.musicCtl(MUSIC.music_adventure);
    }

    return exit;
  }


  /** The move counter's eight BCD digits from the first that is not zero, or all eight if none is. */
  private async printMoveCount(): Promise<Exit> {
    let digits: number = 8;
    let found: boolean = false;

    for (let byte: number = 0; byte < 4; byte++) {
      if (!found) {
        this.lda(this.peek(PRTY.move_counter + byte));
        this.cmp(0x10);
        if (this.carry()) {
          digits = 8 - (byte * 2);
          found = true;
        } else {
          this.cmp(0x00);
          if (!this.zero()) {
            digits = 7 - (byte * 2);
            found = true;
          }
        }
      }
    }
    for (let digit: number = digits; digit > 0; digit--) {
      this.lda(this.peek(PRTY.move_counter + ((8 - digit) >> 1)));
      await this.sub(0x5A10 + ((8 - digit) * 5), (): Promise<Exit> => this.printBcdDigit((digit & 1) === 0));
    }
    await this.print(CI.moves);

    return null;
  }


  private async printBcdDigit(high: boolean): Promise<Exit> {
    if (high) {
      this.cpu.a = this.cpu.lsr(this.cpu.lsr(this.cpu.lsr(this.cpu.lsr(this.cpu.a))));
    } else {
      this.lda(this.cpu.a & 0x0F);
    }
    await this.m.call(J.j_printdigit);

    return null;
  }


  // --- Ready and Wear (ULT4.s:3296-3407, 3615-3700) -----------------------------------------

  public async cmdReadyWeapon(): Promise<Exit> {
    await this.print(CI.ready_weapon);

    return this.askPlayer(CE.ask_weapon);
  }


  public async cmdWearArmour(): Promise<Exit> {
    await this.print(CI.wear_armour);

    return this.askPlayer(CE.ask_armour);
  }


  /** A player of the party, or not a player. */
  private async askPlayer(ask: number): Promise<Exit> {
    let exit: Exit = E.done_not_a_player;

    await this.m.call(J.j_getplayernum);
    if (!this.zero()) {
      this.cmp(this.peek(PRTY.party_size));
      if (!this.carry() || this.zero()) {
        exit = ask;
      }
    }

    return exit;
  }


  public askWeapon(): Promise<Exit> {
    return this.askArms({
      show: 0x5A7D, shown: (): Promise<Exit> => this.ztats1Weapons(), prompt: CI.weapon, input: 0x5A8B, invert: 0x5A99, last: ROST.weapon_last, none: ROST.weapon_none,
      stats: ROST.party_stat_weapons, masks: CT.weapon_class_masks, worn: ROST.player_weapon, names: STRINGS.string_weapon_first, disallowed: 0,
      increase: 0x5AD4, decrease: 0x5AE3,
    });
  }


  public askArmour(): Promise<Exit> {
    return this.askArms({
      show: 0x5D81, shown: (): Promise<Exit> => this.displayArmour(), prompt: CI.armour, input: 0x5D8F, invert: 0x5D9D, last: ROST.armour_last, none: ROST.armour_none,
      stats: ROST.party_stat_armour, masks: CT.armour_class_masks, worn: ROST.player_armour, names: STRINGS.string_armour, disallowed: ARMOUR_AS_WEAPON,
      increase: 0x5DDF, decrease: 0x5DEE,
    });
  }


  /** ULT4.s ask_weapon and ask_armour: the party's arms shown, one picked by letter, and the player's own put back. */
  private async askArms(arms: IArms): Promise<Exit> {
    let exit: Exit;

    await this.sub(arms.show, arms.shown);
    await this.print(arms.prompt);
    await this.sub(arms.input, (): Promise<Exit> => this.inputChar());
    this.cpu.push(this.cpu.a);
    await this.m.call(J.j_clearstatwindow);
    await this.m.call(J.j_update_status);
    this.lda(this.peek(PRTY.game_mode));
    if (this.negative()) {
      await this.sub(arms.invert, (): Promise<Exit> => this.invertPlayerName());
    }
    this.lda(this.cpu.pull());
    this.subtract(CHAR.char_alpha_first);
    this.cmp(arms.last);
    if (this.carry()) {
      exit = E.done_aborted;
    } else {
      this.poke(zp_selected, this.cpu.a);
      let owned: boolean = true;

      this.cmp(arms.none);
      if (!this.zero()) {
        this.add(arms.stats);
        this.ldy(this.cpu.a);
        owned = this.lda(this.peek(ROST.party_stats + this.cpu.y)) !== 0;
      }
      exit = owned ? await this.checkClassLegal(arms) : E.done_have_none;
    }

    return exit;
  }


  private async checkClassLegal(arms: IArms): Promise<Exit> {
    let exit: Exit;

    await this.m.call(J.j_get_stats_ptr);
    this.ldy(ROST.player_class_bit);
    this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y));
    this.ldx(this.peek(zp_selected));
    if (this.lda(this.cpu.a & this.peek(arms.masks + this.cpu.x)) === 0) {
      if (arms.disallowed !== 0) {
        this.lda(this.peek(zp_selected));
        this.poke(zp_selected, this.add(arms.disallowed));
      }
      exit = CE.weap_arm_disallowed;
    } else {
      exit = await this.equip(arms);
    }

    return exit;
  }


  private async equip(arms: IArms): Promise<Exit> {
    this.ldy(arms.worn);
    if (this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y)) !== 0) {
      this.add(arms.stats);
      this.ldy(this.cpu.a);
      await this.sub(arms.increase, (): Promise<Exit> => Promise.resolve(this.incStat()));
    }
    this.ldy(arms.worn);
    this.lda(this.peek(zp_selected));
    this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.cpu.a);
    if (this.cpu.a !== 0) {
      this.add(arms.stats);
      this.ldy(this.cpu.a);
      await this.sub(arms.decrease, (): Promise<Exit> => this.decStat());
    }
    this.lda(this.peek(zp_selected));
    this.add(arms.names);
    await this.m.call(J.j_printstring);
    await this.sub(arms.decrease + 0x0B, (): Promise<Exit> => this.printNewline());

    return E.done_done;
  }


  /** ULT4.s weap_arm_disallowed: what the player's class may not use, by its name among the weapons, the armour's after them. */
  public async weapArmDisallowed(): Promise<Exit> {
    await this.sub(0x5B04, (): Promise<Exit> => this.printNewline());
    await this.print(CI.a);
    await this.m.call(J.j_get_stats_ptr);
    this.ldy(ROST.player_class_index);
    this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y));
    this.add(STRINGS.string_class_first);
    await this.m.call(J.j_printstring);
    await this.print(CI.may_not_use);
    this.lda(this.peek(zp_selected));
    this.add(STRINGS.string_weapon_first);
    await this.m.call(J.j_printstring);
    await this.sub(0x5B35, (): Promise<Exit> => this.printNewline());

    return E.done_aborted;
  }


  // --- Volume and Music (ULT4.s:3583-3613) --------------------------------------------------

  public async cmdVolume(): Promise<Exit> {
    await this.print(CI.volume);
    this.poke(ZP_MAIN.sfx_volume, this.lda(this.peek(ZP_MAIN.sfx_volume) ^ 0xFF));

    return this.zero() ? this.printOff() : this.printOn();
  }


  public async printOn(): Promise<Exit> {
    await this.print(CI.on);

    return E.cmd_done;
  }


  public async printOff(): Promise<Exit> {
    await this.print(CI.off);

    return E.cmd_done;
  }


  public async cmdMusic(): Promise<Exit> {
    await this.print(CI.music);
    this.poke(MUSIC_STATE.music_mute, this.lda(this.peek(MUSIC_STATE.music_mute) ^ 0xFF));

    return this.negative() ? this.printOn() : this.printOff();
  }


  // --- Ztats (ULT4.s:3794-4147) -------------------------------------------------------------

  public async cmdZtats(): Promise<Exit> {
    let exit: Exit = E.done_not_a_player;

    await this.print(CI.ztats_for);
    await this.m.call(J.j_getplayernum);
    if (this.zero()) {
      exit = CE.zstats_page_1;
    } else {
      this.cmp(this.peek(PRTY.party_size));
      if (!this.carry() || this.zero()) {
        exit = CE.zstats_for_player;
      }
    }

    return exit;
  }


  /** ULT4.s zstats_for_player: the player's page, then the next player's, or the party's pages before the first and after the last. */
  public async zstatsForPlayer(): Promise<Exit> {
    let exit: Exit;

    await this.m.call(J.j_clearstatwindow);
    await this.sub(0x5EDB, (): Promise<Exit> => Promise.resolve(this.saveCursor()));
    this.ldx(0x1C);
    this.ldy(0x00);
    await this.callWith(J.j_primm_xy, CI.plr);
    this.lda(this.peek(ZP_MAIN.curr_player));
    await this.m.call(J.j_printdigit);
    this.lda(CHAR.glyph_less_even);
    await this.m.call(J.j_console_out);
    this.moveTo(STATUS_X, 0x01);
    await this.m.call(J.j_centername);
    this.moveTo(STATUS_X, 0x02);
    await this.playerStat(ROST.player_gender, J.j_console_out);
    this.lda(CHAR.char_space);
    await this.m.call(J.j_console_out);
    this.poke(ZP_MAIN.console_xpos, this.ldx(STATUS_X));
    await this.playerStat(ROST.player_class_index, J.j_centerstring, STRINGS.string_class);
    this.poke(ZP_MAIN.console_xpos, this.ldx(0x26));
    await this.playerStat(ROST.player_status, J.j_console_out);
    for (const [ x, y, label, stats, print ] of STAT_LINES) {
      this.ldx(x);
      this.ldy(y);
      await this.callWith(J.j_primm_xy, label);
      await this.m.call(J.j_get_stats_ptr);
      for (const stat of stats) {
        this.ldy(stat);
        this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y));
        await this.m.call(print);
      }
    }
    for (const [ y, label, stat, names ] of [
      [ 0x07, CI.w, ROST.player_weapon, STRINGS.string_weapon_first ], [ 0x08, CI.a_colon, ROST.player_armour, STRINGS.string_armour ],
    ] as const) {
      this.ldx(STATUS_X);
      this.ldy(y);
      await this.callWith(J.j_primm_xy, label);
      await this.playerStat(stat, J.j_printstring, names);
    }
    await this.sub(0x6024, (): Promise<Exit> => Promise.resolve(this.restoreCursor()));
    await this.sub(0x6027, (): Promise<Exit> => this.inputZtatsKey());
    if (this.zero()) {
      exit = CE.quit_view;
    } else if (this.negative()) {
      exit = (this.dec(ZP_MAIN.curr_player) === 0) ? CE.ztats_page_6 : CE.zstats_for_player;
    } else {
      this.inc(ZP_MAIN.curr_player);
      this.lda(this.peek(PRTY.party_size));
      this.cmp(this.peek(ZP_MAIN.curr_player));
      exit = this.carry() ? CE.zstats_for_player : CE.zstats_page_1;
    }

    return exit;
  }


  private moveTo(x: number, y: number): void {
    this.poke(ZP_MAIN.console_xpos, this.ldx(x));
    this.poke(ZP_MAIN.console_ypos, this.ldy(y));
  }


  /** The player's stat at `offset`, plus `string` for a string's number, handed to `print`. */
  private async playerStat(offset: number, print: number, string?: number): Promise<void> {
    await this.m.call(J.j_get_stats_ptr);
    this.ldy(offset);
    this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y));
    if (string != null) {
      this.add(string);
    }
    await this.m.call(print);
  }


  public async zstatsPage1(): Promise<Exit> {
    let exit: Exit;

    await this.sub(0x6040, (): Promise<Exit> => this.ztats1Weapons());
    await this.sub(0x6043, (): Promise<Exit> => this.inputZtatsKey());
    if (this.zero()) {
      exit = CE.quit_view;
    } else if (!this.negative()) {
      exit = CE.ztats_page_2;
    } else {
      this.poke(ZP_MAIN.curr_player, this.lda(this.peek(PRTY.party_size)));
      exit = CE.zstats_for_player;
    }

    return exit;
  }


  public ztatsPage2(): Promise<Exit> {
    return this.ztatsPage(0x6051, (): Promise<Exit> => this.displayArmour(), CE.zstats_page_1, CE.ztats_page_3);
  }


  public ztatsPage3(): Promise<Exit> {
    return this.ztatsPage(0x605B, (): Promise<Exit> => this.displayTools(), CE.ztats_page_2, CE.ztats_page_4);
  }


  public ztatsPage4(): Promise<Exit> {
    return this.ztatsPage(0x6065, (): Promise<Exit> => this.displayQuests(), CE.ztats_page_3, CE.ztats_page_5);
  }


  public ztatsPage5(): Promise<Exit> {
    return this.ztatsPage(0x606F, (): Promise<Exit> => this.displayReagents(), CE.ztats_page_4, CE.ztats_page_6);
  }


  public async ztatsPage6(): Promise<Exit> {
    let exit: Exit = await this.ztatsPage(0x6079, (): Promise<Exit> => this.displaySpells(), CE.ztats_page_5, null);

    if (exit == null) {
      this.poke(ZP_MAIN.curr_player, this.lda(0x01));
      exit = CE.zstats_for_player;
    }

    return exit;
  }


  /** A party page, its key, and the page before or after it; null after the last. */
  private async ztatsPage(site: number, show: () => Promise<Exit>, previous: number, next: Exit): Promise<Exit> {
    let exit: Exit = next;

    await this.sub(site, show);
    await this.sub(site + 3, (): Promise<Exit> => this.inputZtatsKey());
    if (this.zero()) {
      exit = CE.quit_view;
    } else if (this.negative()) {
      exit = previous;
    }

    return exit;
  }


  /** ULT4.s quit_view: the status window back, and in a fight the turn's player marked again. */
  public async quitView(): Promise<Exit> {
    await this.m.call(J.j_clearstatwindow);
    await this.m.call(J.j_update_status);
    this.lda(this.peek(PRTY.game_mode));
    if (this.negative()) {
      this.poke(ZP_MAIN.curr_player, this.lda(this.peek(ZP_COMBAT.curr_player_turn)));
      await this.sub(0x6098, (): Promise<Exit> => this.invertPlayerName());
    }

    return E.cmd_done;
  }


  /** ULT4.s input_ztats_key: a key, $FF for the left arrow, 1 for the right, 0 for any other. */
  public async inputZtatsKey(): Promise<Exit> {
    do {
      await this.m.call(J.j_waitkey);
    } while (!this.negative());
    this.cmp(CHAR.char_left_arrow);
    if (this.zero()) {
      this.lda(0xFF);
    } else {
      this.cmp(CHAR.char_right_arrow);
      this.lda(this.zero() ? 0x01 : 0x00);
    }

    return null;
  }


  /** ULT4.s ztats_1_weapons: each weapon the party has, its letter, count and name, in two columns, hands first. */
  public async ztats1Weapons(): Promise<Exit> {
    await this.heading(0x60B7, 0x1B);
    this.poke(zp_inventory_index, this.cpu.y);
    this.poke(zp_display_line, this.cpu.y);
    await this.callWith(J.j_primm_xy, CI.weapons);
    do {
      this.lda(this.peek(zp_display_line) & 0x08);
      this.poke(ZP_MAIN.console_xpos, this.add(STATUS_X));
      this.poke(ZP_MAIN.console_ypos, this.lda(this.peek(zp_display_line) & 0x07));
      this.inc(ZP_MAIN.console_ypos);
      await this.showArms(ROST.party_stat_weapons, CI.hands, STRINGS.string_weapons_short);
      this.inc(zp_inventory_index);
      this.lda(this.peek(zp_inventory_index));
      this.cmp(ROST.weapon_last);
    } while (!this.carry());
    await this.sub(0x6122, (): Promise<Exit> => Promise.resolve(this.restoreCursor()));

    return null;
  }


  /** ULT4.s display_armour: each armour the party has, its letter, count and name, none first. */
  public async displayArmour(): Promise<Exit> {
    await this.heading(0x6139, 0x1B);
    this.poke(zp_inventory_index, this.cpu.y);
    this.poke(zp_display_line, this.cpu.y);
    await this.callWith(J.j_primm_xy, CI.armour_heading);
    do {
      this.poke(ZP_MAIN.console_xpos, this.lda(STATUS_X));
      this.poke(ZP_MAIN.console_ypos, this.lda(this.peek(zp_display_line)));
      this.inc(ZP_MAIN.console_ypos);
      await this.showArms(ROST.party_stat_armour, CI.no_armour, STRINGS.string_armour);
      this.inc(zp_inventory_index);
      this.lda(this.peek(zp_inventory_index));
      this.cmp(ROST.armour_last);
    } while (!this.carry());
    await this.sub(0x619C, (): Promise<Exit> => Promise.resolve(this.restoreCursor()));

    return null;
  }


  /** The status window cleared, the cursor kept to be put back, and X and Y where its heading goes. */
  private async heading(site: number, x: number): Promise<void> {
    await this.m.call(J.j_clearstatwindow);
    await this.sub(site, (): Promise<Exit> => Promise.resolve(this.saveCursor()));
    this.ldx(x);
    this.ldy(0x00);
  }


  /** One line of arms: the first, which every party has, by its own words; the rest only if the party has some. */
  private async showArms(stats: number, first: IInlineData, names: number): Promise<void> {
    if (this.lda(this.peek(zp_inventory_index)) === 0) {
      await this.print(first);
      this.inc(zp_display_line);
    } else {
      this.add(stats);
      this.ldy(this.cpu.a);
      if (this.lda(this.peek(ROST.party_stats + this.cpu.y)) !== 0) {
        this.cpu.push(this.cpu.a);
        this.lda(this.peek(zp_inventory_index));
        this.add(CHAR.char_alpha_first);
        await this.m.call(J.j_console_out);
        this.lda(this.cpu.pull());
        this.cmp(0x10);
        if (this.carry()) {
          await this.m.call(J.j_printbcd);
        } else {
          this.cpu.push(this.cpu.a);
          this.lda(CHAR.char_hyphen);
          await this.m.call(J.j_console_out);
          this.lda(this.cpu.pull());
          await this.m.call(J.j_printdigit);
        }
        this.lda(CHAR.char_hyphen);
        await this.m.call(J.j_console_out);
        this.lda(this.peek(zp_inventory_index));
        this.add(names);
        await this.m.call(J.j_printstring);
        this.inc(zp_display_line);
      }
    }
  }


  /** ULT4.s display_tools: the torches, gems and keys, and the sextant if the party has one. */
  public async displayTools(): Promise<Exit> {
    await this.heading(0x61B7, 0x1A);
    await this.callWith(J.j_primm_xy, CI.equipment);
    for (const [ site, stat, label ] of [
      [ 0x61CD, ROST.party_stat_torches, CI.torches ], [ 0x61E4, ROST.party_stat_gems, CI.gems ], [ 0x61F8, ROST.party_stat_keys, CI.keys ],
    ] as const) {
      await this.sub(site, (): Promise<Exit> => Promise.resolve(this.nextLine()));
      this.ldy(stat);
      this.lda(this.peek(ROST.party_stats + this.cpu.y));
      await this.m.call(J.j_printbcd);
      await this.print(label);
    }
    await this.sub(0x620C, (): Promise<Exit> => Promise.resolve(this.nextLine()));
    this.ldy(ROST.party_stat_sextant);
    if (this.lda(this.peek(ROST.party_stats + this.cpu.y)) !== 0) {
      await this.m.call(J.j_printbcd);
      await this.print(CI.sextants);
    }
    await this.sub(0x6226, (): Promise<Exit> => Promise.resolve(this.restoreCursor()));

    return null;
  }


  /** ULT4.s display_quests: the stones, the runes, the bell, book and candle, the key's parts, the horn, wheel and skull held. */
  public async displayQuests(): Promise<Exit> {
    await this.heading(0x622D, 0x1C);
    await this.callWith(J.j_primm_xy, CI.items);
    this.poke(ZP_MAIN.console_ypos, this.lda(0x00));
    if (this.lda(this.peek(ROST.stones)) !== 0) {
      await this.showSymbols(0x624A, CI.stones, CT.stone_sym);
    }

    return this.displayRunes();
  }


  public async displayRunes(): Promise<Exit> {
    if (this.lda(this.peek(ROST.runes)) !== 0) {
      await this.showSymbols(0x6272, CI.runes, CT.rune_sym);
    }

    return this.displayItems();
  }


  /** A line of the held stones or runes, each by its letter, from the flags in A, the high bit first. */
  private async showSymbols(site: number, label: IInlineData, symbols: number): Promise<void> {
    this.poke(zp_item_flags, this.cpu.a);
    await this.sub(site, (): Promise<Exit> => Promise.resolve(this.nextLine()));
    await this.print(label);
    this.ldy(0x07);
    do {
      this.poke(zp_item_flags, this.cpu.rol(this.peek(zp_item_flags)));
      if (this.carry()) {
        this.poke(zp_save_reg2, this.cpu.y);
        this.lda(this.peek(symbols + this.cpu.y));
        await this.m.call(J.j_console_out);
        this.ldy(this.peek(zp_save_reg2));
      }
    } while (!(this.dey() & 0x80));
  }


  public async displayItems(): Promise<Exit> {
    if (this.lda(this.peek(ROST.bell_book_candle)) !== 0) {
      await this.sub(0x6297, (): Promise<Exit> => Promise.resolve(this.nextLine()));
      for (const [ item, label ] of [ [ ROST.item_have_bell, CI.bell ], [ ROST.item_have_book, CI.book ], [ ROST.item_have_candle, CI.candle ] ] as const) {
        if (this.lda(this.peek(ROST.bell_book_candle) & item) !== 0) {
          await this.print(label);
        }
      }
    }

    return this.display3PartKey();
  }


  public async display3PartKey(): Promise<Exit> {
    if (this.lda(this.peek(ROST.threepartkey)) !== 0) {
      await this.sub(0x62CF, (): Promise<Exit> => Promise.resolve(this.nextLine()));
      await this.print(CI.three_part_key);
      for (const [ part, letter ] of [ [ ROST.key3_have_truth, CHAR.char_T ], [ ROST.key3_have_love, CHAR.char_L ], [ ROST.key3_have_courage, CHAR.char_C ] ]) {
        if (this.lda(this.peek(ROST.threepartkey) & part) !== 0) {
          this.lda(letter);
          await this.m.call(J.j_console_out);
        }
      }
    }

    return this.displayHornEtc();
  }


  /** ULT4.s display_horn_etc: the horn, the wheel, and the skull unless it is destroyed (its high bit). */
  public async displayHornEtc(): Promise<Exit> {
    for (const [ site, item, label, destroyed ] of [
      [ 0x630A, ROST.horn, CI.horn, false ], [ 0x631A, ROST.wheel, CI.wheel, false ], [ 0x632D, ROST.skull, CI.skull, true ],
    ] as const) {
      if ((this.lda(this.peek(item)) !== 0) && !(destroyed && this.negative())) {
        await this.sub(site, (): Promise<Exit> => Promise.resolve(this.nextLine()));
        await this.print(label);
      }
    }
    await this.sub(0x6339, (): Promise<Exit> => Promise.resolve(this.restoreCursor()));

    return null;
  }


  // --- the turn's tile effects, food and magic (ULT4.s:4497-4790) ---------------------------

  /** ULT4.s tile_effect: what the ground does to the party, or in a fight to the turn's player; none aloft. */
  public async tileEffect(): Promise<Exit> {
    let exit: Exit = null;

    this.lda(this.peek(PRTY.terrain_occlusion));
    if (!this.negative()) {
      let trolls: boolean = false;

      this.lda(this.peek(PRTY.game_mode));
      this.cmp(PRTY.mode_world);
      if (this.zero()) {
        this.lda(this.peek(ZP_MAIN.tile_under_player));
        this.cmp(TILES.tile_bridge_narrow);
        if (this.zero()) {
          await this.m.call(J.j_rand);
          trolls = this.lda(this.cpu.a & CHANCE_8) === 0;
        }
      }
      exit = trolls ? await this.bridgeTrolls() : await this.groundEffect();
    }

    return exit;
  }


  /** Trolls under the bridge, unless avoided: the turn's frame dropped, as entered from the main loop, for the fight. */
  private async bridgeTrolls(): Promise<Exit> {
    let exit: Exit = null;

    await this.print(CI.bridge_trolls);
    await this.sub(0x64F1, (): Promise<Exit> => this.checkAvoid());
    if (!this.zero()) {
      this.poke(ZP_COMBAT.foe_type_encountered, this.lda(TILES.tile_troll));
      this.poke(ZP_COMBAT.pre_combat_x, this.lda(this.peek(PRTY.player_xpos)));
      this.poke(ZP_COMBAT.pre_combat_y, this.lda(this.peek(PRTY.player_ypos)));
      this.poke(ZP_COMBAT.pre_combat_tile, this.lda(TILES.tile_bridge_narrow));
      this.dropReturn();
      exit = C.init_combat;
    }

    return exit;
  }


  private async groundEffect(): Promise<Exit> {
    let exit: Exit = null;

    this.lda(this.peek(PRTY.game_mode));
    if (this.negative()) {
      await this.combatEffect();
    } else {
      this.cmp(PRTY.mode_dungeon);
      if (this.zero()) {
        exit = await this.dungeonEffect();
      } else {
        this.lda(this.peek(ZP_MAIN.tile_under_player));
        exit = await this.britanniaEffect();
      }
    }

    return exit;
  }


  /** In a fight, the ground under the turn's player: swamp and poison fields poison, fire and lava burn, sleep fields sleep. */
  private async combatEffect(): Promise<void> {
    this.ldx(this.peek(ZP_MAIN.curr_player));
    if (this.lda(this.peek(O.combat_player_tile - 1 + this.cpu.x)) !== 0) {
      this.poke(PRTY.dest_x, this.lda(this.peek(O.combat_player_xpos - 1 + this.cpu.x)));
      this.poke(PRTY.dest_y, this.lda(this.peek(O.combat_player_ypos - 1 + this.cpu.x)));
      await this.m.call(J.j_gettile_actual_map);
      if (this.isOneOf([ TILES.tile_swamp, TILES.tile_field_poison ])) {
        await this.poisonPlayer();
      } else if (this.isOneOf([ TILES.tile_field_fire ])) {
        await this.sub(0x6541, (): Promise<Exit> => this.burnPlayer());
      } else if (this.isOneOf([ TILES.tile_field_sleep ])) {
        await this.sleepPlayer();
      } else if (this.isOneOf([ TILES.tile_lava ])) {
        await this.sub(0x6541, (): Promise<Exit> => this.burnPlayer());
      }
    }
  }


  /** Whether A is one of `tiles`, compared in turn as the original's chain of `cmp`/`beq`. */
  private isOneOf(tiles: readonly number[]): boolean {
    let found: boolean = false;

    for (const tile of tiles) {
      if (!found) {
        this.cmp(tile);
        found = this.zero();
      }
    }

    return found;
  }


  private async poisonPlayer(): Promise<void> {
    await this.sub(0x6547, (): Promise<Exit> => this.isAwake());
    this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y));
    this.cmp(ROST.status_Good);
    if (this.zero()) {
      this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.lda(ROST.status_Poison));
      await this.sub(0x6554, (): Promise<Exit> => this.hilightDamagedPlr());
      await this.m.call(J.j_update_status);
    }
  }


  private async sleepPlayer(): Promise<void> {
    await this.sub(0x655D, (): Promise<Exit> => this.isAwake());
    if (!this.negative()) {
      this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.lda(ROST.status_Sleep));
      this.ldx(this.peek(ZP_MAIN.curr_player));
      this.poke(O.combat_player_tile - 1 + this.cpu.x, this.lda(TILES.tile_human_prone));
      await this.sub(0x656D, (): Promise<Exit> => this.hilightDamagedPlr());
      await this.m.call(J.j_update_status);
    }
  }


  /** In a dungeon, its fields as Britannia's, and its traps: winds put the light out, rocks and pits hurt the party. */
  private async dungeonEffect(): Promise<Exit> {
    let exit: Exit = null;

    this.lda(this.peek(ZP_MAIN.tile_under_player) & DUNGEON.dng_tile_type_mask);
    this.cmp(DUNGEON.dng_tile_field);
    if (this.zero()) {
      if (this.lda(this.peek(ZP_MAIN.tile_under_player) & DUNGEON.dng_tile_field_mask) === 0) {
        await this.poisonAll();
      } else {
        this.cmp(DUNGEON.dng_field_fire);
        if (this.zero()) {
          exit = await this.damageAll();
        } else {
          this.cmp(DUNGEON.dng_field_sleep);
          if (this.zero()) {
            await this.sleepAll();
          }
        }
      }
    } else {
      this.cmp(DUNGEON.dng_tile_trap);
      if (this.zero()) {
        if (this.lda(this.peek(ZP_MAIN.tile_under_player) & DUNGEON.dng_tile_trap_mask) === 0) {
          await this.print(CI.winds);
          this.poke(PRTY.light_duration, this.lda(0x00));
        } else {
          this.cmp(0x08);
          await this.print(this.carry() ? CI.pit : CI.falling_rocks);
          exit = await this.damageAll();
        }
      }
    }

    return exit;
  }


  /** Britannia's ground under the party, tile A. */
  private async britanniaEffect(): Promise<Exit> {
    let exit: Exit = null;

    if (this.isOneOf([ TILES.tile_swamp, TILES.tile_field_poison ])) {
      await this.poisonAll();
    } else if (this.isOneOf([ TILES.tile_field_fire ])) {
      exit = await this.damageAll();
    } else if (this.isOneOf([ TILES.tile_field_sleep ])) {
      await this.sleepAll();
    } else if (this.isOneOf([ TILES.tile_lava ])) {
      exit = await this.damageAll();
    }

    return exit;
  }


  private damageAll(): Promise<Exit> {
    return this.sub(0x65EA, (): Promise<Exit> => this.damageParty());
  }


  /** One chance in eight for each player of being poisoned, from the last; the first who is not in good health stops it. */
  private async poisonAll(): Promise<void> {
    let stopped: boolean = false;

    this.poke(ZP_MAIN.curr_player, this.lda(this.peek(PRTY.party_size)));
    do {
      await this.sub(0x65F4, (): Promise<Exit> => this.isAwake());
      this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y));
      this.cmp(ROST.status_Good);
      stopped = !this.zero();
      if (!stopped) {
        await this.m.call(J.j_rand);
        if (this.lda(this.cpu.a & CHANCE_8) === 0) {
          await this.setStatus(ROST.status_Poison, 0x660A);
        }
      }
    } while (!stopped && (this.dec(ZP_MAIN.curr_player) !== 0));
  }


  /** One chance in four for each player awake of falling asleep. */
  private async sleepAll(): Promise<void> {
    this.poke(ZP_MAIN.curr_player, this.lda(this.peek(PRTY.party_size)));
    do {
      await this.sub(0x661B, (): Promise<Exit> => this.isAwake());
      if (!this.negative()) {
        await this.m.call(J.j_rand);
        if (this.lda(this.cpu.a & CHANCE_4) === 0) {
          await this.setStatus(ROST.status_Sleep, 0x662D);
        }
      }
    } while (this.dec(ZP_MAIN.curr_player) !== 0);
  }


  private async setStatus(status: number, site: number): Promise<void> {
    this.lda(status);
    this.ldy(ROST.player_status);
    this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.cpu.a);
    await this.sub(site, (): Promise<Exit> => this.hilightDamagedPlr());
    await this.m.call(J.j_update_status);
  }


  /** ULT4.s starving: two hit points from each living player. */
  public async starving(): Promise<Exit> {
    await this.print(CI.starving);
    this.poke(ZP_MAIN.curr_player, this.lda(this.peek(PRTY.party_size)));
    do {
      await this.sub(0x6650, (): Promise<Exit> => this.isAlive());
      if (!this.negative()) {
        this.lda(0x02);
        await this.sub(0x6657, (): Promise<Exit> => this.decPlayerHp());
      }
    } while (this.dec(ZP_MAIN.curr_player) !== 0);
    await this.sub(0x665E, (): Promise<Exit> => this.invertAllPlayers());
    await this.playsfx(SOUND.sound_damage);
    await this.sub(0x6666, (): Promise<Exit> => this.invertAllPlayers());

    return null;
  }


  /**
   * ULT4.s recover_mp: a magic point for each living player below the class's share of twice the
   * intelligence. The count runs down to player 0, past the party, as the original's does.
   */
  public async recoverMp(): Promise<Exit> {
    this.poke(ZP_MAIN.curr_player, this.lda(this.peek(PRTY.party_size)));
    do {
      await this.sub(0x666E, (): Promise<Exit> => this.isAlive());
      if (!this.negative()) {
        await this.recoverPlayerMp();
      }
    } while (!(this.dec(ZP_MAIN.curr_player) & 0x80));

    return null;
  }


  private async recoverPlayerMp(): Promise<void> {
    this.ldy(ROST.player_class_index);
    this.poke(zp_mp_class, this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y)));
    this.ldy(ROST.player_intelligence);
    this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y));
    await this.sub(0x667D, (): Promise<Exit> => Promise.resolve(this.decodeBcdValue()));
    this.cpu.a = this.cpu.asl(this.cpu.a);
    this.ldx(this.peek(zp_mp_class));
    this.mpShare();
    await this.sub(0x66AB, (): Promise<Exit> => Promise.resolve(this.encodeBcdValue()));
    this.poke(zp_mp_max, this.cpu.a);
    this.ldy(ROST.player_magic_points);
    this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y));
    this.cmp(this.peek(zp_mp_max));
    if (!this.carry()) {
      this.cpu.setFlag(DECIMAL, true);
      this.add(0x01);
      this.cpu.setFlag(DECIMAL, false);
      this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.cpu.a);
    }
  }


  /** Twice the intelligence, in A, cut to the class (X) share: mage all, druid three quarters, bard, paladin and ranger half, tinker a quarter. */
  private mpShare(): void {
    const shares: readonly number[] = [ 4, 2, 0, 3, 1, 2, 2 ];
    let share: number = 0;
    let found: boolean = this.cpu.x === 0;

    if (found) {
      share = 4;
    }
    for (let index: number = 1; !found && (index < shares.length); index++) {
      if (this.dex() === 0) {
        share = shares[index];
        found = true;
      }
    }
    if (share === 0) {
      this.lda(0x00);
    } else if (share === 1) {
      this.cpu.a = this.cpu.lsr(this.cpu.lsr(this.cpu.a));
    } else if (share === 2) {
      this.cpu.a = this.cpu.lsr(this.cpu.a);
    } else if (share === 3) {
      this.cpu.a = this.cpu.lsr(this.cpu.a);
      this.poke(zp_number1, this.cpu.a);
      this.cpu.a = this.cpu.lsr(this.cpu.a);
      this.cpu.adc(this.peek(zp_number1));
    }
  }


  /** ULT4.s eat_food: A hundredths of a ration eaten, in BCD; carry clear, and the food at zero, if there was not enough. */
  public eatFood(): Exit {
    this.poke(zp_number1, this.cpu.a);
    this.cpu.setFlag(DECIMAL, true);
    this.setCarry(true);
    if (this.lda(this.peek(TRAINERS.trainer_food)) === 0) {
      this.lda(this.peek(ROST.food_frac));
      this.cpu.sbc(this.peek(zp_number1));
      this.poke(ROST.food_frac, this.cpu.a);
      let short: boolean = !this.carry();

      for (const food of [ ROST.food_lo, ROST.food_hi ]) {
        if (short) {
          this.lda(this.peek(food));
          this.cpu.sbc(0x00);
          this.poke(food, this.cpu.a);
          short = !this.carry();
        }
      }
      if (short) {
        this.lda(0x00);
        this.poke(ROST.food_frac, this.cpu.a);
        this.poke(ROST.food_lo, this.cpu.a);
        this.poke(ROST.food_hi, this.cpu.a);
        this.setCarry(false);
      }
    }
    this.cpu.setFlag(DECIMAL, false);

    return null;
  }


  // --- the party's health (ULT4.s:8864-9230) ------------------------------------------------

  /** ULT4.s anyone_awake: A 0 if a player can act, $FF if all who live sleep; with none alive, the game is lost. */
  public async anyoneAwake(): Promise<Exit> {
    let exit: Exit = null;
    let alive: boolean = false;
    let awake: boolean = false;

    this.poke(ZP_MAIN.curr_player, this.lda(this.peek(PRTY.party_size)));
    do {
      await this.sub(0x84A1, (): Promise<Exit> => this.isAlive());
      alive = this.zero();
    } while (!alive && (this.dec(ZP_MAIN.curr_player) !== 0));
    if (alive) {
      do {
        await this.sub(0x84AD, (): Promise<Exit> => this.isAwake());
        awake = this.zero();
      } while (!awake && (this.dec(ZP_MAIN.curr_player) !== 0));
      this.lda(awake ? 0x00 : 0xFF);
    } else {
      exit = E.run_file_dead;
    }

    return exit;
  }


  public async invertAllPlayers(): Promise<Exit> {
    this.poke(ZP_MAIN.curr_player, this.lda(this.peek(PRTY.party_size)));
    do {
      await this.sub(0x84EF, (): Promise<Exit> => this.invertPlayerName());
    } while (this.dec(ZP_MAIN.curr_player) !== 0);

    return null;
  }


  /** ULT4.s invert_player_name: the player's line of the status window inverted, its colour bit kept. */
  public invertPlayerName(): Promise<Exit> {
    this.lda(this.peek(ZP_MAIN.curr_player));
    this.ldx(this.cpu.asl(this.cpu.asl(this.cpu.asl(this.cpu.a))));
    this.poke(zp_invert_line, this.lda(0x08));
    do {
      this.poke(ZP_MAIN.ptr1, this.lda(this.peek(TABLES.bmplineaddr_lo + this.cpu.x)));
      this.poke(ZP_MAIN.ptr1 + 1, this.lda(this.peek(TABLES.bmplineaddr_hi + this.cpu.x)));
      this.ldy(NAME_COLUMN_LAST);
      do {
        this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y) ^ 0x7F));
        this.dey();
        this.cpu.compare(this.cpu.y, NAME_COLUMN_FIRST);
      } while (this.carry());
      this.inx();
    } while (this.dec(zp_invert_line) !== 0);

    return Promise.resolve(null);
  }


  /** ULT4.s dec_player_hp: A hit points from the player, in BCD; A 0, and the player dead (prone in a fight), if none are left. */
  public async decPlayerHp(): Promise<Exit> {
    this.poke(zp_amount, this.cpu.a);
    await this.m.call(J.j_get_stats_ptr);
    this.ldy(ROST.player_cur_hp_lo);
    this.cpu.setFlag(DECIMAL, true);
    this.setCarry(true);
    this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y));
    this.cpu.sbc(this.peek(zp_amount));
    this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.cpu.a);
    this.dey();
    this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y));
    this.cpu.sbc(0x00);
    this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.cpu.a);
    this.cpu.setFlag(DECIMAL, false);
    if (this.carry()) {
      this.lda(0x01);
    } else {
      this.lda(0x00);
      this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.cpu.a);
      this.iny();
      this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.cpu.a);
      await this.m.call(J.j_get_stats_ptr);
      this.ldy(ROST.player_status);
      this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.lda(ROST.status_Dead));
      this.lda(this.peek(PRTY.game_mode));
      if (this.negative()) {
        this.lda(TILES.tile_human_prone);
        this.ldx(this.peek(ZP_MAIN.curr_player));
        this.poke(O.combat_player_tile - 1 + this.cpu.x, this.cpu.a);
      }
      this.lda(0x00);
    }

    return null;
  }


  /** ULT4.s inc_player_hp: A hit points for the player, in BCD, no more than the maximum. */
  public async incPlayerHp(): Promise<Exit> {
    this.poke(zp_amount, this.cpu.a);
    await this.m.call(J.j_get_stats_ptr);
    this.ldy(ROST.player_cur_hp_lo);
    this.cpu.setFlag(DECIMAL, true);
    this.setCarry(false);
    this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y));
    this.cpu.adc(this.peek(zp_amount));
    this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.cpu.a);
    this.dey();
    this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y));
    this.cpu.adc(0x00);
    this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.cpu.a);
    this.cpu.setFlag(DECIMAL, false);
    if (!this.belowMaximum(ROST.player_cur_hp_hi, ROST.player_max_hp_hi) && !this.belowMaximum(ROST.player_cur_hp_lo, ROST.player_max_hp_lo)) {
      for (const [ maximum, current ] of [ [ ROST.player_max_hp_hi, ROST.player_cur_hp_hi ], [ ROST.player_max_hp_lo, ROST.player_cur_hp_lo ] ]) {
        this.ldy(maximum);
        this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y));
        this.ldy(current);
        this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.cpu.a);
      }
    }

    return null;
  }


  private belowMaximum(current: number, maximum: number): boolean {
    this.ldy(current);
    this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y));
    this.ldy(maximum);
    this.cmp(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y));

    return !this.carry();
  }


  /** ULT4.s inc_party_gold: A gold for the party, in BCD. */
  public incPartyGold(): Promise<Exit> {
    this.poke(zp_number1, this.cpu.a);
    this.ldy(ROST.party_stat_gold_lo);
    this.poke(ZP_MAIN.ptr1, this.lda(ROST.party_stats & 0xFF));
    this.poke(ZP_MAIN.ptr1 + 1, this.lda(ROST.party_stats >> 8));

    return Promise.resolve(this.inc4Digit());
  }


  public async incPlayerExp(): Promise<Exit> {
    this.poke(zp_number1, this.cpu.a);
    await this.m.call(J.j_get_stats_ptr);
    this.ldy(ROST.player_experience_lo);

    return this.inc4Digit();
  }


  /** ULT4.s inc_4_digit: zp_number1 added to the four BCD digits ending at (ptr1),Y, held at 9999. */
  public inc4Digit(): Exit {
    this.cpu.setFlag(DECIMAL, true);
    this.setCarry(false);
    this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y));
    this.cpu.adc(this.peek(zp_number1));
    this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.cpu.a);
    this.dey();
    this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y));
    this.cpu.adc(0x00);
    this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.cpu.a);
    this.cpu.setFlag(DECIMAL, false);
    if (this.carry()) {
      this.lda(0x99);
      this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.cpu.a);
      this.iny();
      this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.cpu.a);
    }

    return null;
  }


  /** ULT4.s burn_player: up to 29 hit points from the player. */
  public async burnPlayer(): Promise<Exit> {
    await this.sub(0x8659, (): Promise<Exit> => this.hilightDamagedPlr());
    this.lda(0x1E);
    await this.sub(0x865E, (): Promise<Exit> => this.randModulo());
    await this.sub(0x8661, (): Promise<Exit> => Promise.resolve(this.encodeBcdValue()));
    await this.sub(0x8664, (): Promise<Exit> => this.decPlayerHp());

    return null;
  }


  /** ULT4.s damage_party: the screen shaken, ten off a ship's hull (sinking it at none), or up to 24 hit points from each player by even chance. */
  public async damageParty(): Promise<Exit> {
    let exit: Exit = null;
    let ship: boolean = false;

    await this.sub(0x8668, (): Promise<Exit> => this.invertAllPlayers());
    await this.playsfx(SOUND.sound_damage);
    await this.sub(0x8670, (): Promise<Exit> => this.shakeScreen());
    this.lda(this.peek(PRTY.game_mode));
    if (!this.negative()) {
      this.lda(this.peek(PRTY.player_transport));
      this.cmp(TILES.tile_ship_last);
      ship = !this.carry();
    }
    if (ship) {
      this.cpu.setFlag(DECIMAL, true);
      this.lda(this.peek(PRTY.ship_hull));
      this.subtract(0x0A);
      this.cpu.setFlag(DECIMAL, false);
      if (this.carry()) {
        this.poke(PRTY.ship_hull, this.cpu.a);
        await this.damagePlayers();
      } else {
        this.poke(PRTY.ship_hull, this.lda(0x00));
        await this.sub(0x868A, (): Promise<Exit> => this.invertAllPlayers());
        await this.m.call(J.j_update_status);
        await this.print(CI.ship_sinks);
        exit = E.run_file_dead;
      }
    } else {
      await this.damagePlayers();
    }

    return exit;
  }


  private async damagePlayers(): Promise<void> {
    this.poke(ZP_MAIN.curr_player, this.lda(this.peek(PRTY.party_size)));
    do {
      await this.m.call(J.j_rand);
      if (!this.negative()) {
        await this.sub(0x86B3, (): Promise<Exit> => this.isAlive());
        if (this.zero()) {
          let present: boolean = true;

          this.lda(this.peek(PRTY.game_mode));
          if (this.negative()) {
            this.ldx(this.peek(ZP_MAIN.curr_player));
            present = this.lda(this.peek(O.combat_player_tile - 1 + this.cpu.x)) !== 0;
          }
          if (present) {
            this.lda(0x19);
            await this.sub(0x86C5, (): Promise<Exit> => this.randModulo());
            await this.sub(0x86C8, (): Promise<Exit> => Promise.resolve(this.encodeBcdValue()));
            await this.sub(0x86CB, (): Promise<Exit> => this.decPlayerHp());
          }
        }
      }
    } while (this.dec(ZP_MAIN.curr_player) !== 0);
    await this.sub(0x86D2, (): Promise<Exit> => this.invertAllPlayers());
    await this.m.call(J.j_update_status);
  }


  public async hilightDamagedPlr(): Promise<Exit> {
    await this.sub(0x86D9, (): Promise<Exit> => this.invertPlayerName());
    await this.playsfx(SOUND.sound_firewalk);
    await this.sub(0x86E1, (): Promise<Exit> => this.invertPlayerName());

    return null;
  }


  // --- the screen shaken (ULT4.s:9223-9284) -------------------------------------------------

  public async shakeScreen(): Promise<Exit> {
    for (let shake: number = 0; shake < 4; shake++) {
      await this.sub(0x86EB + (shake * 6), (): Promise<Exit> => this.moveViewUp());
      await this.sub(0x86EE + (shake * 6), (): Promise<Exit> => this.moveViewDown());
    }

    return null;
  }


  /** ULT4.s move_view_down: the view's rows each copied from two above, from the bottom up, the speaker clicked at random. */
  public async moveViewDown(): Promise<Exit> {
    this.ldx(VIEW_ROWS);
    do {
      this.copyViewRow(9, 7);
      await this.click();
    } while (this.dex() !== 0);

    return null;
  }


  /** ULT4.s move_view_up: the view's rows each copied from two below, from the top down. */
  public async moveViewUp(): Promise<Exit> {
    this.ldx(0x00);
    do {
      this.copyViewRow(8, 10);
      await this.click();
      this.inx();
      this.cpu.compare(this.cpu.x, VIEW_ROWS);
    } while (!this.carry());

    return null;
  }


  /** Bitmap row X + `to` copied from row X + `from`, columns 22 to 1. */
  private copyViewRow(to: number, from: number): void {
    this.poke(ZP_MAIN.ptr1, this.lda(this.peek(TABLES.bmplineaddr_lo + to + this.cpu.x)));
    this.poke(ZP_MAIN.ptr1 + 1, this.lda(this.peek(TABLES.bmplineaddr_hi + to + this.cpu.x)));
    this.poke(ZP_MAIN.ptr2, this.lda(this.peek(TABLES.bmplineaddr_lo + from + this.cpu.x)));
    this.poke(ZP_MAIN.ptr2 + 1, this.lda(this.peek(TABLES.bmplineaddr_hi + from + this.cpu.x)));
    this.ldy(VIEW_COLUMNS);
    do {
      this.poke(this.pointer(ZP_MAIN.ptr1) + this.cpu.y, this.lda(this.peek(this.pointer(ZP_MAIN.ptr2) + this.cpu.y)));
    } while (this.dey() !== 0);
  }


  /** The speaker clicked on half the rows, when the sound is on. */
  private async click(): Promise<void> {
    this.cpu.bit(this.peek(ZP_MAIN.sfx_volume));
    if (this.negative()) {
      await this.m.call(J.j_rand);
      if (!this.negative()) {
        this.cpu.bit(this.peek(APPLE.hw_SPEAKER));
      }
    }
  }


  /** ULT4.s is_evil: A $FF for a monster other than the sea horse, rat, bat, spider, insects and python, else 0. */
  public isEvil(): Exit {
    let evil: boolean = false;

    this.cmp(0x00);
    if (this.negative()) {
      evil = !this.isOneOf([ TILES.tile_seahorse, TILES.tile_rat, TILES.tile_bat, TILES.tile_spider, TILES.tile_insects, TILES.tile_python ]);
    }
    this.lda(evil ? 0xFF : 0x00);

    return null;
  }
}


/** One of Ready's and Wear's two kinds of arms: where they are shown, kept, allowed and named. */
interface IArms {
  readonly show: number;
  readonly shown: () => Promise<Exit>;
  readonly prompt: IInlineData;
  readonly input: number;
  readonly invert: number;
  readonly last: number;
  readonly none: number;
  readonly stats: number;
  readonly masks: number;
  readonly worn: number;
  readonly names: number;
  /** Added to the armour's number to name it among the weapons' names in the refusal. */
  readonly disallowed: number;
  readonly increase: number;
  readonly decrease: number;
}


/** Ztats's lines of numbers: where, the label, the stats in turn, and how each is printed. */
const STAT_LINES: readonly (readonly [ number, number, IInlineData, readonly number[], number ])[] = [
  [ 0x19, 0x03, CI.mp, [ ROST.player_magic_points ], J.j_printbcd ],
  [ 0x20, 0x03, CI.lv, [ ROST.player_max_hp_hi ], J.j_printdigit ],
  [ 0x18, 0x04, CI.str, [ ROST.player_strength ], J.j_printbcd ],
  [ 0x18, 0x05, CI.dex, [ ROST.player_dexterity ], J.j_printbcd ],
  [ 0x18, 0x06, CI.int, [ ROST.player_intelligence ], J.j_printbcd ],
  [ 0x20, 0x04, CI.hp, [ ROST.player_cur_hp_hi, ROST.player_cur_hp_lo ], J.j_printbcd ],
  [ 0x20, 0x05, CI.hm, [ ROST.player_max_hp_hi, ROST.player_max_hp_lo ], J.j_printbcd ],
  [ 0x20, 0x06, CI.ex, [ ROST.player_experience_hi, ROST.player_experience_lo ], J.j_printbcd ],
];
