// trainer/TRAINERS.s: the remaster's trainers, ported. Loaded at $FB00 in the language card, it
// holds the travel trainer's teleport (from Talk, to a towne, dungeon or shrine by letter, or to a
// map coordinate) and transport (from Board, to foot, horse, ship or balloon), and the fixed
// build's choice of a single player to act in a fight (a digit selects one, 0 the party). Its
// variables and tables stay at their addresses in its image, and so do the two operands its
// awake check rewrites.

import type { LiftedMachine } from '../../lifted-runtime/lifted-machine';
import { JUMP_SUBS, JUMP_TRAINERS, MAP_OBJECTS, PRTY, TILES, TRAINERS, ZP_MAIN } from '../../state/symbols';
import { inline } from '../inline-data';
import type { IInlineData } from '../inline-data';
import { PortProgram } from '../port-program';
import type { Exit } from '../routine';
import { overlayModule, text } from './overlay';
import { COMBAT_ENTRIES } from './ult4-combat-data';
import { COMMAND_TABLES } from './ult4-commands-data';
import { ULT4_ENTRIES } from './ult4-data';

const E = ULT4_ENTRIES;
const J = JUMP_SUBS;
const JT = JUMP_TRAINERS;
const zp_teleport_index: number = 0xD8;
const CHAR_ZERO: number = 0xB0;
const CHAR_NINE: number = 0xB9;
const COORDINATE_SPAN: number = 0x10;
const MOBS: number = 0x07;

export const TRAINERS_VARIABLES = {
  teleport_loc_offset: 0xFBB6,
  teleport_loc_mask: 0xFBB9,
  /** active_char_check_awake: the operands of its `ldx #` and `lda #`, the player put back and the answer. */
  restore_player: 0xFCE6,
  result: 0xFCEA,
  combat_active_char: 0xFCF3,
} as const;

const V = TRAINERS_VARIABLES;

export const TRAINERS_INLINE = {
  teleport: text(0xFB2C, 'Teleport-'),
  towne: text(0xFB4F, 'Towne-'),
  dungeon: text(0xFB5E, 'Dungeon-'),
  shrine: text(0xFB6F, 'Shrine-'),
  coordinate: text(0xFB7F, 'Coord:'),
  what: text(0xFC05, 'what? '),
  active: text(0xFCA5, ' active\n'),
  party_mode: text(0xFCBB, 'Party mode\n'),
} as const;

const I = TRAINERS_INLINE;

export const TRAINERS_DATA: readonly IInlineData[] = [
  ...Object.values(TRAINERS_INLINE),
  inline(V.teleport_loc_offset, [ 0x00, 0x10, 0x18 ]),
  inline(V.teleport_loc_mask, [ 0x0F, 0x07, 0x07 ]),
  inline(V.restore_player, [ 0x00 ]),
  inline(V.result, [ 0x00 ]),
  inline(V.combat_active_char, [ 0x00 ]),
];

/** The places teleport goes to by letter, A on: the townes, the dungeons and the shrines, from location_map's first, ninth and twenty-fifth. */
const PLACES: readonly [ string, IInlineData ][] = [ [ 'T', I.towne ], [ 'D', I.dungeon ], [ 'S', I.shrine ] ];


/** A key as the game reads it, its high bit set. */
function key(letter: string): number {
  return letter.charCodeAt(0) | 0x80;
}


/** getcoord's way out: a key past P, which ends the command. */
class Aborted extends Error {
}


export class Trainers extends PortProgram {
  constructor(machine: LiftedMachine) {
    super(machine);
  }


  /** trainer_teleport: from Talk, with the travel trainer on and the party in Britannia off ship, a place to go to; otherwise back to Talk. */
  public async teleport(): Promise<Exit> {
    let exit: Exit = null;

    if (this.lda(this.peek(TRAINERS.trainer_travel)) !== 0) {
      this.lda(this.peek(PRTY.game_mode));
      this.cmp(PRTY.mode_world);
      if (this.zero()) {
        this.cpu.pull();
        this.cpu.pull();
        exit = await this.teleportOnFoot();
      }
    }

    return exit;
  }


  private async teleportOnFoot(): Promise<Exit> {
    let exit: Exit = E.cmd_done;

    this.lda(this.peek(PRTY.player_transport));
    this.cmp(TILES.tile_ship_last);
    if (!this.carry()) {
      exit = E.done_only_on_foot;
    } else {
      await this.print(I.teleport);
      await this.m.call(E.input_char);

      const place: number = PLACES.findIndex(([ letter ]: [ string, IInlineData ]): boolean => this.matches(letter));

      if (place >= 0) {
        await this.print(PLACES[place][1]);
        this.lda(place);
        await this.teleportToLocation();
      } else if (this.matches('C')) {
        await this.teleportToCoordinate();
      }
    }

    return exit;
  }


  /** `cmp #letter`, the chain of comparisons stopping at the first equal. */
  private matches(letter: string): boolean {
    this.cmp(key(letter));

    return this.zero();
  }


  /** teleport_to_location: a letter for the place, A the kind (towne, dungeon, shrine), and there. */
  private async teleportToLocation(): Promise<void> {
    this.poke(zp_teleport_index, this.cpu.a);
    try {
      await this.getcoord(0xFBBE);
      this.ldx(this.peek(zp_teleport_index));
      this.setCarry(false);
      this.lda(this.cpu.a & this.peek(V.teleport_loc_mask + this.cpu.x));
      this.cpu.adc(this.peek(V.teleport_loc_offset + this.cpu.x));
      this.ldx(this.cpu.a);
      this.ldy(this.peek(COMMAND_TABLES.location_map_y + this.cpu.x));
      await this.teleportTo(this.lda(this.peek(COMMAND_TABLES.location_map_x + this.cpu.x)));
    } catch (error: unknown) {
      this.aborted(error);
    }
  }


  /** @coordinate: a column and a row, each two letters A to P for its nibbles, and there. */
  private async teleportToCoordinate(): Promise<void> {
    await this.print(I.coordinate);
    try {
      await this.pair(0xFB86);
      this.poke(ZP_MAIN.temp_y, this.lda(this.peek(ZP_MAIN.temp_x)));
      await this.pair(0xFB8D);
      this.lda(this.peek(ZP_MAIN.temp_x));
      this.ldy(this.peek(ZP_MAIN.temp_y));
      await this.teleportTo(this.cpu.a);
    } catch (error: unknown) {
      this.aborted(error);
    }
  }


  /** A way out of getcoord is the command's end, its caller's frame, if any, left on the stack as the original leaves it. */
  private aborted(error: unknown): void {
    if (!(error instanceof Aborted)) {
      throw error;
    }
  }


  /** @pair, from the JSR at `site`: two letters, the first the high nibble, in temp_x, shown as `'` and `"` between. */
  private async pair(site: number): Promise<void> {
    this.cpu.pushWord(site + 2);
    this.lda(0x20);
    await this.m.call(J.j_console_out);
    await this.getcoord(0xFB9C);
    this.cpu.a = this.cpu.asl(this.cpu.asl(this.cpu.asl(this.cpu.asl(this.cpu.a))));
    this.poke(ZP_MAIN.temp_x, this.cpu.a);
    this.lda(0x27);
    await this.m.call(J.j_console_out);
    await this.getcoord(0xFBAA);
    this.poke(ZP_MAIN.temp_x, this.lda(this.cpu.a | this.peek(ZP_MAIN.temp_x)));
    this.lda(0x22);
    await this.m.call(J.j_console_out);
    this.cpu.pullWord();
  }


  /** teleport: the party at (A, Y), the level's monsters gone, and the map there. */
  private async teleportTo(x: number): Promise<void> {
    this.poke(PRTY.player_xpos, x);
    this.poke(PRTY.player_ypos, this.cpu.y);
    this.ldx(MOBS);
    this.lda(0x00);
    do {
      this.poke(MAP_OBJECTS.object_tile_type + this.cpu.x, this.cpu.a);
    } while (this.dex() < 0x80);
    await this.m.call(J.j_player_teleport);
  }


  /** getcoord, from the JSR at `site`: a key, shown, as 0 to 15 from A; anything else drops this frame (`pla` / `pla`) and aborts the command. */
  private async getcoord(site: number): Promise<void> {
    this.cpu.pushWord(site + 2);
    await this.m.call(J.j_waitkey);
    this.cpu.push(this.cpu.a);
    await this.m.call(J.j_console_out);
    this.lda(this.cpu.pull());
    this.subtract(key('A'));
    this.cmp(COORDINATE_SPAN);
    if (this.carry()) {
      this.cpu.pull();
      this.lda(this.cpu.pull());
      throw new Aborted();
    } else {
      this.cpu.pullWord();
    }
  }


  /** trainer_board: in Britannia, a transport by its letter, horse, ship (by water), balloon or none, and the command done. */
  public async board(): Promise<Exit> {
    let exit: Exit = E.cmd_done;

    if (this.lda(this.peek(PRTY.current_location)) !== 0) {
      exit = E.done_not_here;
    } else {
      await this.print(I.what);
      await this.m.call(E.input_char);
      if (!this.zero()) {
        exit = this.transport();
      }
    }

    return exit;
  }


  private transport(): Exit {
    let exit: Exit = E.cmd_done;

    this.ldx(TILES.tile_walk);
    if (this.matches('H')) {
      this.ldx(TILES.tile_horse_west);
    }
    if (this.matches('S')) {
      if (this.byWater()) {
        this.ldx(TILES.tile_ship_first);
      } else {
        exit = E.done_not_here;
      }
    }
    if (exit === E.cmd_done) {
      if (this.matches('B')) {
        this.poke(PRTY.terrain_occlusion, this.lda(ZP_MAIN.occlusion_off));
        this.setCarry(false);
        this.cpu.adc(this.peek(TRAINERS.trainer_balloon));
        this.poke(ZP_MAIN.balloon_movement, this.cpu.a);
        this.ldx(TILES.tile_balloon);
      }
      this.poke(PRTY.player_transport, this.cpu.x);
    }

    return exit;
  }


  /** @trainer_ship: water, shallow or deeper, beside the party, the last of the four that is, in A. */
  private byWater(): boolean {
    let water: boolean = false;

    this.ldx(0x03);
    do {
      this.lda(this.peek(ZP_MAIN.tile_north + this.cpu.x));
      this.cmp(TILES.tile_water_shallow);
      water = !this.carry();
    } while (!water && (this.dex() < 0x80));

    return water;
  }


  /** active_char_combat_start: the fight starts with the party, no one selected. */
  public combatStart(): Exit {
    this.poke(V.combat_active_char, this.lda(0x00));

    return null;
  }


  /** active_char_player_turn: the selected player first, if still awake, else the first, with no one selected. */
  public async playerTurn(): Promise<Exit> {
    let selected: boolean = false;

    if (this.lda(this.peek(V.combat_active_char)) !== 0) {
      this.poke(ZP_MAIN.curr_player, this.cpu.a);
      selected = (await this.checkAwake()) === 0;
    }
    if (selected) {
      this.lda(this.peek(ZP_MAIN.curr_player));
    } else {
      this.poke(V.combat_active_char, this.lda(0x00));
      this.poke(ZP_MAIN.curr_player, this.lda(0x01));
    }

    return null;
  }


  /** active_char_check: another player's turn passes while the selected one is awake (its caller's frame dropped); else the view, and the turn. */
  public async check(): Promise<Exit> {
    let exit: Exit = J.j_update_view;

    if (this.lda(this.peek(V.combat_active_char)) !== 0) {
      this.cmp(this.peek(ZP_MAIN.curr_player));
      if (!this.zero()) {
        if ((await this.checkAwake()) === 0) {
          this.cpu.pull();
          this.cpu.pull();
          exit = COMBAT_ENTRIES.combat_end_turn;
        } else {
          this.poke(V.combat_active_char, this.lda(0x00));
        }
      }
    }

    return exit;
  }


  /** active_char_check_command: a digit 0 to 8 in a fight; 1 to the party's size selects that player if awake, 0 or past it the party. */
  public async checkCommand(): Promise<Exit> {
    let exit: Exit = E.cmd_done;
    let digit: boolean;

    this.cmp(CHAR_ZERO);
    digit = this.carry();
    if (digit) {
      this.cmp(CHAR_NINE);
      digit = !this.carry();
    }
    if (!digit) {
      exit = E.done_what;
    } else if ((this.lda(this.cpu.a & 0x0F) === 0) || this.pastTheParty()) {
      await this.deselect();
    } else {
      await this.select();
    }

    return exit;
  }


  /** `cmp party_size` / `bcc` / `bne`: a number past the party's size. */
  private pastTheParty(): boolean {
    this.cmp(this.peek(PRTY.party_size));

    return this.carry() && !this.zero();
  }


  private async select(): Promise<void> {
    this.cpu.push(this.cpu.a);
    await this.m.call(COMBAT_ENTRIES.is_awake);
    if (this.zero()) {
      this.lda(this.cpu.pull());
      this.poke(V.combat_active_char, this.cpu.a);
      this.lda(this.cpu.a | CHAR_ZERO);
      await this.m.call(J.j_console_out);
      await this.print(I.active);
      this.cpu.push(this.cpu.a);
    }
    this.lda(this.cpu.pull());
  }


  private async deselect(): Promise<void> {
    this.poke(V.combat_active_char, this.lda(0x00));
    await this.print(I.party_mode);
  }


  /** active_char_check_awake: player A awake and in the fight, 0 if so, in A; the current player left as it was. */
  private async checkAwake(): Promise<number> {
    this.ldx(this.peek(ZP_MAIN.curr_player));
    this.poke(V.restore_player, this.cpu.x);
    this.poke(ZP_MAIN.curr_player, this.cpu.a);
    await this.m.call(COMBAT_ENTRIES.is_awake);
    this.poke(V.result, this.cpu.a);
    this.ldx(this.peek(ZP_MAIN.curr_player));
    if (this.lda(this.peek(MAP_OBJECTS.combat_player_tile - 1 + this.cpu.x)) === 0) {
      this.poke(V.result, this.lda(0xFF));
    } else {
      this.cmp(TILES.tile_human_prone);
      if (this.zero()) {
        this.poke(V.result, this.lda(0xFF));
      }
    }
    this.poke(ZP_MAIN.curr_player, this.ldx(this.peek(V.restore_player)));

    return this.lda(this.peek(V.result));
  }


  private async print(block: IInlineData): Promise<void> {
    await this.callWith(J.j_primm, block);
  }
}


export const TRAINERS_MODULE = overlayModule('program', 'TRAINERS', JT.j_trainer_teleport, TRAINERS_DATA, (machine: LiftedMachine): Trainers => new Trainers(machine),
  (program: Trainers): Promise<Exit> => program.teleport(),
  [
    [ JT.j_trainer_board, (program: Trainers): Promise<Exit> => program.board() ],
    [ JT.j_active_char_combat_start, (program: Trainers): Exit => program.combatStart() ],
    [ JT.j_active_char_player_turn, (program: Trainers): Promise<Exit> => program.playerTurn() ],
    [ JT.j_active_char_check, (program: Trainers): Promise<Exit> => program.check() ],
    [ JT.j_active_char_check_command, (program: Trainers): Promise<Exit> => program.checkCommand() ],
  ]);
