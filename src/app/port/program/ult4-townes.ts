// ULT4.s's towne code, ported: Talk, which reads the townsperson's dialogue from the towne disk and
// loads TALK, or LORD for Lord British, or across a shop's counter the shop it serves; and the
// townsfolk's own movement, wandering, following the party or attacking it. Like the rest of ULT4's
// port, each entry leaves the registers and flags as the original does, and returns where control
// goes next.

import { CHAR, DISKS, DOS, JUMP_OVERLAY, JUMP_SUBS, JUMP_TRAINERS, MAP_OBJECTS, MUSIC, PRTY, TILES, ZP_MAIN } from '../../state/symbols';
import type { Exit } from '../routine';
import { Ult4Commands } from './ult4-commands';
import { ULT4_ENTRIES } from './ult4-data';
import { TOWNE_INLINE, TOWNE_VARIABLES } from './ult4-townes-data';

const E = ULT4_ENTRIES;
const TI = TOWNE_INLINE;
const J = JUMP_SUBS;
const O = MAP_OBJECTS;
/** ULT4.s's own uses of zero page for the townes. */
const zp_cur_mob_index: number = 0xD8;
const zp_index2: number = 0xEA;
const zp_attempts: number = 0xF0;
const SHOP_HORSE: number = 0x08;
const SHOP_HAWKWIND: number = 0x09;
const ROW_HORSE: number = 0x18;
const ROW_HAWKWIND: number = 0x19;
const SHOPS: number = 0x8800;
const DIALOG_PAGE: number = 0xEF;
const MODE_COMBAT: number = 0x10;


export abstract class Ult4Townes extends Ult4Commands {
  // --- Talk (ULT4.s:3409-3560) --------------------------------------------------------------

  public async cmdTalk(): Promise<Exit> {
    let exit: Exit;

    await this.jsrOut(0x5B70, JUMP_TRAINERS.j_trainer_teleport);
    await this.print(TI.talk);
    await this.sub(0x5B7C, (): Promise<Exit> => this.inputDirection());
    if (this.zero()) {
      exit = E.done_pass;
    } else {
      exit = await this.checkThroughSign();
    }

    return exit;
  }


  /** A sign between: talk to whoever is beyond it, who must keep a shop; otherwise to whoever is there. */
  private async checkThroughSign(): Promise<Exit> {
    let exit: Exit;

    await this.m.call(J.j_gettile_towne);
    if (this.isSign()) {
      this.setCarry(false);
      this.lda(this.peek(ZP_MAIN.temp_x));
      this.cpu.adc(this.peek(ZP_MAIN.delta_x));
      this.poke(ZP_MAIN.temp_x, this.cpu.a);
      this.setCarry(false);
      this.lda(this.peek(ZP_MAIN.temp_y));
      this.cpu.adc(this.peek(ZP_MAIN.delta_y));
      this.poke(ZP_MAIN.temp_y, this.cpu.a);
      await this.sub(0x5B9D, (): Promise<Exit> => Promise.resolve(this.getMobAtTempXy()));
      if (this.negative()) {
        exit = await this.noResponse();
      } else {
        this.lda(this.peek(O.object_tile_type + this.cpu.x));
        this.cmp(TILES.tile_shopkeeper);
        exit = this.zero() ? await this.checkShop() : await this.noResponse();
      }
    } else {
      exit = await this.checkDirect();
    }

    return exit;
  }


  private isSign(): boolean {
    let sign: boolean = false;

    this.cmp(TILES.tile_sign_first);
    if (this.carry()) {
      this.cmp(TILES.tile_sign_last);
      sign = !this.carry();
    }

    return sign;
  }


  /** Only in a towne, and only someone with something to say. */
  private async checkDirect(): Promise<Exit> {
    let exit: Exit;
    let towne: boolean = false;

    await this.sub(0x5BAC, (): Promise<Exit> => Promise.resolve(this.getMobAtTempXy()));
    if (!this.negative()) {
      this.poke(zp_index2, this.cpu.x);
      if (this.lda(this.peek(PRTY.current_location)) !== 0) {
        this.cmp(PRTY.loc_dng_first);
        towne = !this.carry();
      }
    }
    if (towne) {
      exit = await this.talkTo();
    } else {
      exit = await this.noResponse();
    }

    return exit;
  }


  private async noResponse(): Promise<Exit> {
    await this.print(TI.no_response);

    return E.cmd_done;
  }


  /** The towne's track, the person's sector, read into the dialogue page; then LORD or TALK. */
  private async talkTo(): Promise<Exit> {
    let exit: Exit = E.cmd_done;

    this.poke(ZP_MAIN.diskio_track, this.cpu.a);
    this.dec(ZP_MAIN.diskio_track);
    this.ldx(this.peek(zp_index2));
    this.poke(ZP_MAIN.diskio_sector, this.lda(this.peek(O.npc_dialogue + this.cpu.x)));
    if (this.zero()) {
      exit = await this.noResponse();
    } else {
      this.dec(ZP_MAIN.diskio_sector);
      this.poke(ZP_MAIN.diskio_command, this.lda(DOS.RWTS_command_read));
      this.poke(ZP_MAIN.diskio_addr_hi, this.lda(DIALOG_PAGE));
      await this.musicCtl(MUSIC.music_off);
      this.ldx(this.peek(zp_index2));
      this.lda(this.peek(O.object_tile_type + this.cpu.x));
      this.cmp(TILES.tile_lord_british);
      if (this.zero()) {
        await this.talkLordBritish();
      } else {
        await this.m.call(J.j_loadsector);
        await this.callWith(J.j_primm_cout, TI.bload_talk);
        await this.jsrOut(0x5C4B, JUMP_OVERLAY.j_overlay_entry);
      }
      await this.musicCtl(MUSIC.music_explore);
    }

    return exit;
  }


  /** LORD is on the Britannia disk: it goes in for him, and the towne disk back after. */
  private async talkLordBritish(): Promise<void> {
    this.lda(DISKS.disk_britannia);
    await this.m.call(J.j_request_disk);
    await this.callWith(J.j_primm_cout, TI.bload_lord);
    await this.musicCtl(MUSIC.music_British);
    await this.jsrOut(0x5C1C, JUMP_OVERLAY.talk_lord_british);
    await this.musicCtl(MUSIC.music_off);
    this.lda(DISKS.disk_towne);
    await this.m.call(J.j_request_disk);
    await this.musicCtl(MUSIC.music_Castles);
  }


  /** SHPS's eight rows for the towne hold the shops' counters; Paws's horses and Hawkwind have rows of their own. */
  private async checkShop(): Promise<Exit> {
    let exit: Exit = null;
    let found: boolean = false;

    await this.musicCtl(MUSIC.music_off);
    await this.callWith(J.j_primm_cout, TI.bload_shps);
    this.poke(ZP_MAIN.ptr1 + 1, this.lda(SHOPS >> 8));
    this.lda(this.peek(PRTY.current_location));
    this.subtract(0x01);
    this.cpu.a = this.cpu.asl(this.cpu.asl(this.cpu.asl(this.cpu.a)));
    this.poke(ZP_MAIN.ptr1, this.cpu.a);
    this.ldy(0x07);
    do {
      this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + this.cpu.y));
      this.cmp(this.peek(PRTY.dest_y));
      found = this.zero();
    } while (!found && (this.dey() < 0x80));
    if (found) {
      exit = await this.loadShop();
    } else if (this.uniqueShop(ROW_HORSE, PRTY.loc_village_paws)) {
      this.ldy(SHOP_HORSE);
      exit = await this.loadShop();
    } else if (this.uniqueShop(ROW_HAWKWIND, PRTY.loc_castle_britannia)) {
      this.ldy(SHOP_HAWKWIND);
      exit = await this.loadShop();
    } else {
      exit = await this.noResponse();
    }

    return exit;
  }


  private uniqueShop(row: number, location: number): boolean {
    let here: boolean = false;

    this.lda(this.peek(PRTY.dest_y));
    this.cmp(row);
    if (this.zero()) {
      this.lda(this.peek(PRTY.current_location));
      this.cmp(location);
      here = this.zero();
    }

    return here;
  }


  /** SHP0 to SHP9, by Y. */
  private async loadShop(): Promise<Exit> {
    this.lda(this.cpu.y);
    this.poke(TOWNE_VARIABLES.file_char_shop, this.add(CHAR.char_num_first));
    await this.callWith(J.j_primm_cout, TI.bload_shp);
    await this.musicCtl(MUSIC.music_shop);
    await this.jsrOut(0x5CD2, JUMP_OVERLAY.j_overlay_entry);
    await this.musicCtl(MUSIC.music_explore);

    return E.cmd_done;
  }


  // --- the townsfolk (ULT4.s:5340-5440) -----------------------------------------------------

  /** ULT4.s mobs_act_towne: each townsperson that moves wanders, or follows the party; a hostile one beside it attacks. */
  public async mobsActTowne(): Promise<Exit> {
    let exit: Exit = null;

    this.cmp(MODE_COMBAT);
    if (!this.carry()) {
      this.ldx(O.object_max);
      do {
        exit = await this.townspersonActs();
      } while ((exit == null) && !(this.dex() & 0x80));
    }

    return exit;
  }


  private async townspersonActs(): Promise<Exit> {
    let exit: Exit = null;
    let moves: boolean = false;
    let toward: boolean = false;

    this.poke(zp_attempts, this.lda(0x02));
    if ((this.lda(this.peek(O.object_tile_type + this.cpu.x)) !== 0) && (this.lda(this.peek(O.npc_movement_ai + this.cpu.x)) !== 0)) {
      if (this.negative()) {
        await this.sub(0x6AD7, (): Promise<Exit> => this.manhattanDist());
        this.cmp(0x02);
        if (this.carry()) {
          moves = true;
          toward = true;
        } else {
          this.lda(this.peek(O.npc_movement_ai + this.cpu.x));
          this.cmp(O.ai_hostile);
          if (this.zero()) {
            this.poke(zp_cur_mob_index, this.cpu.x);
            exit = await this.sub(0x6AE7, (): Promise<Exit> => this.playerAttacked());
          } else {
            moves = true;
            toward = true;
          }
        }
      } else {
        await this.m.call(J.j_rand);
        moves = !this.negative();
      }
    }
    if (moves) {
      await this.townspersonMoves(toward);
    }

    return exit;
  }


  /** Toward the party, or in a random direction; tried again in another up to twice unless only following. */
  private async townspersonMoves(toward: boolean): Promise<void> {
    let moved: boolean = false;
    let tries: boolean = true;
    let random: boolean = !toward;

    while (!moved && tries) {
      if (random) {
        await this.townsRandomDeltas();
      }
      moved = await this.townsXOrY();
      if (!moved) {
        this.lda(this.peek(O.npc_movement_ai + this.cpu.x));
        this.cmp(O.ai_toward_only);
        tries = !this.zero() && !(this.dec(zp_attempts) & 0x80);
        random = true;
      }
    }
    if (moved) {
      this.townsDoMove();
    }
  }


  private async townsRandomDeltas(): Promise<void> {
    await this.m.call(J.j_rand);
    await this.m.call(J.j_math_sign);
    this.poke(ZP_MAIN.delta_x, this.cpu.a);
    await this.m.call(J.j_rand);
    await this.m.call(J.j_math_sign);
    this.poke(ZP_MAIN.delta_y, this.cpu.a);
  }


  private async townsXOrY(): Promise<boolean> {
    let moved: boolean = false;

    await this.m.call(J.j_rand);
    if (!this.negative() && (this.lda(this.peek(ZP_MAIN.delta_x)) !== 0)) {
      moved = await this.townsStepX(0x6B06);
    }
    if (!moved && (this.lda(this.peek(ZP_MAIN.delta_y)) !== 0)) {
      this.setCarry(false);
      this.lda(this.peek(O.object_ypos + this.cpu.x));
      this.cpu.adc(this.peek(ZP_MAIN.delta_y));
      this.poke(ZP_MAIN.temp_y, this.cpu.a);
      this.poke(ZP_MAIN.temp_x, this.lda(this.peek(O.object_xpos + this.cpu.x)));
      moved = await this.townsLegal(0x6B1F);
    }
    if (!moved) {
      moved = await this.townsStepX(0x6B34);
    }

    return moved;
  }


  private async townsStepX(legalSite: number): Promise<boolean> {
    this.setCarry(false);
    this.lda(this.peek(O.object_xpos + this.cpu.x));
    this.cpu.adc(this.peek(ZP_MAIN.delta_x));
    this.poke(ZP_MAIN.temp_x, this.cpu.a);
    this.poke(ZP_MAIN.temp_y, this.lda(this.peek(O.object_ypos + this.cpu.x)));

    return this.townsLegal(legalSite);
  }


  private async townsLegal(legalSite: number): Promise<boolean> {
    await this.m.call(J.j_gettile_towne);
    await this.sub(legalSite, (): Promise<Exit> => this.legalMoveWorldTwn());

    return !this.carry();
  }


  /** Only within the towne's 32 x 32. */
  private townsDoMove(): void {
    let inside: boolean = false;

    this.lda(this.peek(ZP_MAIN.temp_x));
    this.cmp(O.xy_last_towne);
    if (!this.carry()) {
      this.lda(this.peek(ZP_MAIN.temp_y));
      this.cmp(O.xy_last_towne);
      inside = !this.carry();
    }
    if (inside) {
      this.poke(O.object_xpos_prev + this.cpu.x, this.lda(this.peek(O.object_xpos + this.cpu.x)));
      this.poke(O.object_ypos_prev + this.cpu.x, this.lda(this.peek(O.object_ypos + this.cpu.x)));
      this.poke(O.object_xpos + this.cpu.x, this.lda(this.peek(ZP_MAIN.temp_x)));
      this.poke(O.object_ypos + this.cpu.x, this.lda(this.peek(ZP_MAIN.temp_y)));
    }
  }
}
