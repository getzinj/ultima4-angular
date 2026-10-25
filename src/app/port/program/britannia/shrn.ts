// britannia/SHRN.s: the shrines, ported. With the shrine's rune, the party meditates on a virtue for
// up to three cycles, each with its mantra; done rightly it is granted a vision, a hint for its
// quest, and spirituality; at the height of the shrine's virtue, three cycles make it a partial
// avatar, and the rune is drawn. A wrong mantra costs spirituality. ULT4's load_shrine loads it at
// $8800; it loads the shrine's map, SHRI, itself.

import { DECIMAL } from '../../../lifted-runtime/cpu';
import type { LiftedMachine } from '../../../lifted-runtime/lifted-machine';
import { CHAR, JUMP_SUBS, JUMP_SYSTEM, MAP_OBJECTS, MUSIC, PRTY, ROST, SOUND, SUPER_PACKER, TABLES, ZP_MAIN } from '../../../state/symbols';
import { inline } from '../../inline-data';
import type { IInlineData } from '../../inline-data';
import { PortProgram } from '../../port-program';
import type { Exit } from '../../routine';
import { encode } from '../../text';
import { SuperPacker } from '../super-packer';
import { OVERLAY_ENTRY, overlayModule, text } from './overlay';

const J = JUMP_SUBS;
const SPK = SUPER_PACKER;
const zp_index: number = 0xEA;
const zp_count: number = 0xF0;
const zp_save_reg: number = 0xD9;
const zp_dec_amount: number = 0xDA;
const zp_inc_amount: number = 0xD9;
const MAX_SPK_COL: number = 0x16;
const MAX_SPK_ROW: number = 0xB7;
const MIN_SPK_COL: number = 0x00;
const MIN_SPK_ROW: number = 0x07;
const INPUT_MAX: number = 0x0F;
const WORD_LENGTH: number = 0x06;
const DOTS: number = 0x10;
const MANTRAS_FIRST: number = 0x08;
const SHORT_DELAYS: number = 0x05;
/** string_virtues less one: the virtue's name after "partial avatarhood in the virtue of". */
const STRING_VIRTUE_BEFORE: number = 0x97;

export const SHRN_VARIABLES = {
  shrine_num: 0x8C01,
  num_cycles: 0x8C02,
  cycle_ctr: 0x8C03,
  unused: 0x8C04,
  key_buf_tmp: 0x95C5,
} as const;

const V = SHRN_VARIABLES;

const SHRN_TABLES = {
  shrine_msg_idx: 0x8C05,
  shrine_msg_per_cycle: 0x8C0D,
  bit_msb: 0x8C17,
  virtues_and_mantras: 0x8C97,
  string_table: 0x8D09,
  rune_addr: 0x95D5,
} as const;

const T = SHRN_TABLES;

export const SHRN_INLINE = {
  no_rune: text(0x8814, '\nTHOU DOST NOT\nBEAR THE RUNE\nOF ENTRY! A\nSTRANGE FORCE\nKEEPS YOU OUT!\n'),
  bload_shri: text(0x8861, '\u0004BLOAD SHRI,A$280\n'),
  enter: text(0x888E, '\nYOU ENTER THE\nANCIENT SHRINE\nAND SIT BEFORE\nTHE ALTAR...\n\nUPON WHAT VIRTUE\nDOST THOU\nMEDITATE?\n'),
  cycles: text(0x88FA, '\nFOR HOW MANY\nCYCLES (0-3):'),
  begin: text(0x8946, '\nBEGIN MEDITATION\n'),
  mantra: text(0x8973, '\nMANTRA'),
  wrong_mantra: text(0x8997, '\nTHOU ART NOT\nABLE TO FOCUS\nTHY THOUGHTS\nWITH THAT\nMANTRA!\n'),
  vision: text(0x89F4, '\nTHY THOUGHTS\nARE PURE,\nTHOU ART GRANTED\nA VISION!\n'),
  no_focus: text(0x8A88, '\nTHOU ART UNABLE\nTO FOCUS THY\nTHOUGHTS ON\nTHIS SUBJECT!\n'),
  still_weary: text(0x8ACA, '\nTHY MIND IS\nSTILL WEARY\nFROM THY LAST\nMEDITATION!\n'),
  lost_an_eighth: text(0x8B33, '\nTHOU HAST LOST\nAN EIGHTH!\n'),
  partial_avatar: text(0x8B59, '\nTHOU HAST\nACHIEVED PARTIAL\nAVATARHOOD IN\nTHE VIRTUE OF\n'),
  granted_vision: text(0x8BBB, '\nTHOU ART GRANTED\nA VISION!\n'),
} as const;

const I = SHRN_INLINE;

/** virtues_and_mantras: the eight virtues' first four letters, then their mantras. */
const VIRTUES_AND_MANTRAS: readonly string[] = [
  'HONE', 'COMP', 'VALO', 'JUST', 'SACR', 'HONO', 'SPIR', 'HUMI', 'AHM ', 'MU  ', 'RA  ', 'BEH ', 'CAH ', 'SUMM', 'OM  ', 'LUM ',
];

/** string_table: the visions, three to a shrine, the one numbered A found by counting its zeros. */
const HINTS: readonly string[] = [
  'TAKE NOT THE\nGOLD OF OTHERS\nFOUND IN TOWNS\nAND CASTLES FOR\nYOURS IT IS NOT!\n',
  'CHEAT NOT THE\nMERCHANTS AND\nPEDDLERS FOR\n\'TIS AN EVIL\nTHING TO DO!\n',
  'SECOND, READ THE\nBOOK OF TRUTH AT\nTHE ENTRANCE TO\nTHE GREAT\nSTYGIAN ABYSS!\n',
  'KILL NOT THE\nNON-EVIL BEASTS\nOF THE LAND, AND\nDO NOT ATTACK\nTHE FAIR PEOPLE!\n',
  'GIVE OF THY\nPURSE TO THOSE\nWHO BEG AND THY\nDEED SHALL NOT\nBE FORGOTTEN!\n',
  'THIRD, LIGHT THE\nCANDLE OF LOVE\nAT THE ENTRANCE\nTO THE GREAT\nSTYGIAN ABYSS!\n',
  'VICTORIES SCORED\nOVER EVIL\nCREATURES HELP\nTO BUILD A\nVALOROUS SOUL!\n',
  'TO FLEE FROM\nBATTLE WITH LESS\nTHAN GRIEVOUS\nWOUNDS OFTEN\nSHOWS A COWARD!\n',
  'FIRST, RING THE\nBELL OF COURAGE\nAT THE ENTRANCE\nTO THE GREAT\nSTYGIAN ABYSS!\n',
  'TO TAKE THE GOLD\nOF OTHERS IS\nINJUSTICE NOT\nSOON FORGOTTEN,\nTAKE ONLY THY\nDUE!\n',
  'ATTACK NOT A\nPEACEFUL CITIZEN\nFOR THAT ACTION\nDESERVES STRICT\nPUNISHMENT!\n',
  'KILL NOT A\nNON-EVIL BEAST\nFOR THEY DESERVE\nNOT DEATH EVEN\nIF IN HUNGER\nTHEY ATTACK\nTHEE!\n',
  'TO GIVE THY LAST\nGOLD PIECE UNTO\nTHE NEEDY SHOWS\nGOOD MEASURE OF\nSELF-SACRIFICE!\n',
  'FOR THEE TO FLEE\nAND LEAVE THY\nCOMPANIONS IS A\nSELF-SEEKING\nACTION TO BE\nAVOIDED!\n',
  'TO GIVE OF THY\nLIFE\'S BLOOD SO\nTHAT OTHERS MAY\nLIVE IS A VIRTUE\nOF GREAT PRAISE!\n',
  'TAKE NOT THE\nGOLD OF OTHERS\nFOR THIS SHALL\nBRING DISHONOR\nUPON THEE!\n',
  'TO STRIKE FIRST\nA NON-EVIL BEING\nIS BY NO MEANS\nAN HONORABLE\nDEED!\n',
  'SEEK YE TO SOLVE\nTHE MANY QUESTS\nBEFORE THEE, AND\nHONOR SHALL BE\nA REWARD!\n',
  'SEEK YE TO KNOW\nTHYSELF, VISIT\nTHE SEER OFTEN\nFOR HE CAN\nSEE INTO THY\nINNER BEING!\n',
  'MEDITATION\nLEADS TO\nENLIGHTENMENT.\nSEEK YE ALL\nWISDOM AND\nKNOWLEDGE!\n',
  'IF THOU DOST\nSEEK THE WHITE\nSTONE, SEARCH YE\nNOT UNDER THE\nGROUND, BUT IN\nTHE SKY NEAR\nSERPENTS SPINE!\n',
  'CLAIM NOT TO BE\nTHAT WHICH THOU\nART NOT, HUMBLE\nACTIONS SPEAK\nWELL OF THEE!\n',
  'STRIVE NOT TO\nWIELD THE GREAT\nFORCE OF EVIL\nFOR ITS POWER\nWILL OVERCOME\nTHEE!\n',
  'IF THOU DOST\nSEEK THE BLACK\nSTONE, SEARCH YE\nAT THE TIME AND\nPLACE OF THE\nGATE ON THE\nDARKEST OF ALL\nNIGHTS!\n',
];

/** rune_addr and the runes after it: each shrine's rune, packed by Super-Packer. */
const RUNES: readonly number[] = [
  0xE5, 0x95, 0x02, 0x96, 0x3D, 0x96, 0xE5, 0x95, 0x02, 0x96, 0xE5, 0x95, 0x7B, 0x96, 0xA8, 0x96,
  0xFB, 0xFD, 0xFD, 0x03, 0x07, 0xFB, 0xFF, 0x80, 0xFB, 0xE2, 0x80, 0x9C, 0xFC, 0xF8, 0xFB, 0x16,
  0xB8, 0xBC, 0xFC, 0xF0, 0xFD, 0x03, 0x07, 0xFB, 0xFF, 0x80, 0xFB, 0x30, 0x80, 0xFB, 0xFD, 0xFD,
  0x03, 0x07, 0xFB, 0xFF, 0x80, 0xFB, 0x3B, 0x80, 0x8F, 0x9F, 0xB9, 0xB0, 0xB0, 0xB8, 0x9C, 0xFB,
  0xA0, 0x80, 0x9C, 0xFC, 0xF8, 0xFB, 0x07, 0xB8, 0xF8, 0xF8, 0xF8, 0xBC, 0xBE, 0xBF, 0xBB, 0xFB,
  0x09, 0xB8, 0xBC, 0xFC, 0xF0, 0xFB, 0x9D, 0x80, 0xF0, 0xB8, 0x98, 0x98, 0xB8, 0xF0, 0xE0, 0xFD,
  0x03, 0x06, 0xFB, 0xFF, 0x80, 0xFB, 0x8A, 0x80, 0xFB, 0xFD, 0xFD, 0x03, 0x07, 0xFB, 0xFF, 0x80,
  0xFB, 0x42, 0x80, 0x83, 0x87, 0x8E, 0x8C, 0x9C, 0xFB, 0x05, 0x98, 0xBC, 0xBC, 0xFB, 0x95, 0x80,
  0x81, 0x81, 0xFB, 0x0C, 0x80, 0xFF, 0xFF, 0xC0, 0x80, 0x80, 0x8F, 0x9F, 0xB8, 0xB0, 0xB0, 0xB0,
  0xF9, 0xF9, 0xFB, 0x94, 0x80, 0xB8, 0xF8, 0xFB, 0x17, 0xF0, 0xF8, 0xF8, 0xE0, 0xFD, 0x03, 0x06,
  0xFB, 0xFF, 0x80, 0xFB, 0x7F, 0x80, 0xFB, 0xFD, 0xFD, 0x03, 0x07, 0xFB, 0xFF, 0x80, 0xFB, 0x48,
  0x80, 0xF0, 0xFC, 0x9F, 0x87, 0x81, 0xFB, 0x95, 0x80, 0x9C, 0xFC, 0xF8, 0xFB, 0x15, 0xB8, 0xBB,
  0xFF, 0xFE, 0xB8, 0xFB, 0xAA, 0x80, 0x9C, 0xFC, 0xF0, 0xC0, 0xFD, 0x03, 0x06, 0xFB, 0xFF, 0x80,
  0xFB, 0x81, 0x80, 0xFB, 0xFD, 0xFD, 0x03, 0x06, 0xFB, 0xFF, 0x80, 0xFB, 0x81, 0x80, 0x83, 0x87,
  0x87, 0xFB, 0x10, 0x83, 0x87, 0x87, 0xFB, 0x9B, 0x80, 0xE0, 0xE0, 0xFB, 0x0A, 0xC0, 0xFF, 0xFF,
  0xFB, 0x06, 0xC0, 0xF8, 0xFF, 0x8F, 0x81, 0xFB, 0x98, 0x80, 0xB8, 0xF8, 0xF0, 0xFB, 0x09, 0xB0,
  0xFF, 0xFF, 0xFB, 0x08, 0x80, 0xF0, 0xFE, 0x9F, 0x83, 0xFB, 0x96, 0x80, 0x87, 0x9F, 0x9E, 0xFB,
  0x09, 0x8E, 0xFE, 0xFE, 0xFB, 0x0A, 0x8E, 0xEE, 0xFE, 0xBF, 0x87, 0xFD, 0x03, 0x06, 0xFB, 0xFF,
  0x80, 0xFB, 0x7F, 0x80, 0x02,
];

export const SHRN_DATA: readonly IInlineData[] = [
  ...Object.values(SHRN_INLINE),
  inline(V.shrine_num, [ 0x00, 0x00, 0x00, 0x00 ]),
  inline(T.shrine_msg_idx, [ 0x00, 0x03, 0x06, 0x09, 0x0C, 0x0F, 0x12, 0x15 ]),
  inline(T.shrine_msg_per_cycle, [ 0x18, 0x00, 0x01, 0x02, 0x01, 0x01, 0x01, 0x02, 0x02, 0x02 ]),
  inline(T.bit_msb, [ 0x80, 0x40, 0x20, 0x10, 0x08, 0x04, 0x02, 0x01 ]),
  inline(T.virtues_and_mantras, VIRTUES_AND_MANTRAS.flatMap((word: string): number[] => [ ...encode(word) ])),
  inline(T.string_table, [ 0x00, ...HINTS.flatMap((hint: string): number[] => [ ...encode(hint), 0x00 ]) ]),
  inline(V.key_buf_tmp, Array.from({ length: 0x10 }, (): number => 0x00)),
  inline(T.rune_addr, RUNES),
];


export class Shrn extends PortProgram {
  public async run(): Promise<Exit> {
    this.lda(this.peek(PRTY.current_location));
    this.poke(V.shrine_num, this.subtract(PRTY.loc_shrine_first));
    this.ldy(this.cpu.a);
    if (this.lda(this.peek(ROST.runes) & this.peek(T.bit_msb + this.cpu.y)) === 0) {
      await this.callWith(J.j_primm, I.no_rune);
    } else {
      await this.meditate();
    }
    await this.exitShrine();

    return null;
  }


  private async meditate(): Promise<void> {
    await this.callWith(J.j_primm_cout, I.bload_shri);
    this.ldx(0x7F);
    do {
      this.poke(MAP_OBJECTS.drawn_tiles + this.cpu.x, this.lda(this.peek(MAP_OBJECTS.world_tiles + this.cpu.x)));
    } while (!(this.dex() & 0x80));
    this.poke(PRTY.game_mode, this.lda(PRTY.mode_shrine));
    await this.m.call(J.j_update_view);
    this.lda(MUSIC.music_shrine);
    await this.m.call(JUMP_SYSTEM.music_ctl);
    await this.callWith(J.j_primm, I.enter);
    this.poke(V.num_cycles, this.lda(0x00));
    await this.getString();
    await this.askCycles();
    let focused: boolean = !this.zero();

    if (focused) {
      this.poke(V.unused, this.lda(0x00));
      this.compareString();
      this.cmp(this.peek(V.shrine_num));
      focused = this.zero();
    }
    if (!focused) {
      await this.noFocus();
    } else {
      this.lda(this.peek(PRTY.move_counter + 2));
      this.cmp(this.peek(PRTY.last_meditated));
      if (this.zero()) {
        await this.stillWeary();
      } else {
        this.poke(PRTY.last_meditated, this.cpu.a);
        await this.callWith(J.j_primm, I.begin);
        await this.cycles();
      }
    }
  }


  /**
   * @askcycles: up to three. Its check for none reads the flags of the compare with four, not the
   * count, so none is never refused, and meditates 256 times.
   */
  private async askCycles(): Promise<void> {
    do {
      await this.callWith(J.j_primm, I.cycles);
      await this.getNumber();
      this.cmp(0x04);
    } while (this.carry());
    this.poke(V.num_cycles, this.cpu.a);
    this.poke(V.cycle_ctr, this.cpu.a);
  }


  /** Each cycle: the dots, and the mantra; a wrong one ends it. */
  private async cycles(): Promise<void> {
    let right: boolean = true;

    do {
      this.poke(zp_count, this.lda(DOTS));
      do {
        await this.delay();
        this.lda(CHAR.char_period);
        await this.m.call(J.j_console_out);
      } while (this.dec(zp_count) !== 0);
      this.cpu.bit(await this.m.clearKeyboardStrobe());
      this.poke(ZP_MAIN.key_buf_len, this.lda(0x00));
      await this.callWith(J.j_primm, I.mantra);
      await this.getString();
      this.compareString();
      this.subtract(MANTRAS_FIRST);
      this.cmp(this.peek(V.shrine_num));
      right = this.zero();
    } while (right && (this.dec(V.cycle_ctr) !== 0));
    if (right) {
      await this.checkResult();
    } else {
      await this.callWith(J.j_primm, I.wrong_mantra);
      this.ldy(ROST.virtue_spirituality);
      this.lda(0x03);
      await this.decVirtue();
    }
  }


  private async checkResult(): Promise<void> {
    let avatar: boolean = false;

    this.lda(this.peek(V.num_cycles));
    this.cmp(0x03);
    if (this.zero()) {
      this.ldy(this.peek(V.shrine_num));
      this.lda(this.peek(ROST.party_stats + this.cpu.y));
      this.cmp(0x99);
      avatar = this.zero();
    }
    if (avatar) {
      await this.partialAvatar();
    } else {
      await this.vision();
    }
  }


  /** A vision: spirituality by three for each cycle, and the shrine's hint for that many. */
  private async vision(): Promise<void> {
    await this.callWith(J.j_primm, I.vision);
    this.ldy(ROST.virtue_spirituality);
    this.lda(this.peek(V.num_cycles));
    this.cpu.a = this.cpu.asl(this.cpu.a);
    this.cpu.adc(this.peek(V.num_cycles));
    this.incVirtue();
    await this.m.call(J.j_waitkey);
    this.lda(CHAR.char_enter);
    await this.m.call(J.j_console_out);
    this.ldy(this.peek(V.shrine_num));
    this.lda(this.peek(T.shrine_msg_idx + this.cpu.y));
    this.setCarry(false);
    this.ldy(this.peek(V.num_cycles));
    this.cpu.adc(this.peek(T.shrine_msg_per_cycle + this.cpu.y));
    this.add(0x01);
    await this.printHint();
    await this.m.call(J.j_waitkey);
  }


  private async exitShrine(): Promise<void> {
    this.lda(CHAR.char_enter);
    await this.m.call(J.j_console_out);
    this.poke(PRTY.current_location, this.lda(PRTY.loc_world));
    this.poke(PRTY.game_mode, this.lda(PRTY.mode_world));
    await this.m.call(J.j_update_view);
  }


  /** delay: five of short_delay's loops of 255 times 255, which count nothing, each ending on the keyboard strobe. */
  private async delay(): Promise<void> {
    this.ldx(SHORT_DELAYS);
    do {
      this.ldy(0x00);
      this.lda(0x00);
      this.setCarry(true);
      this.cpu.bit(await this.m.clearKeyboardStrobe());
    } while (this.dex() !== 0);
  }


  private async noFocus(): Promise<void> {
    await this.callWith(J.j_primm, I.no_focus);
    await this.m.call(J.j_waitkey);
  }


  private async stillWeary(): Promise<void> {
    await this.callWith(J.j_primm, I.still_weary);
    await this.m.call(J.j_waitkey);
  }


  /** SHRN's own inc_virtue: A more of virtue Y, in BCD, at most 99; a virtue at zero stays there. */
  private incVirtue(): void {
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
  }


  /** SHRN's own dec_virtue: A less of virtue Y, at least 1; a virtue at zero is an eighth lost, and starts again from 99. */
  private async decVirtue(): Promise<void> {
    this.poke(zp_dec_amount, this.cpu.a);
    this.poke(zp_save_reg, this.cpu.y);
    if (this.lda(this.peek(ROST.party_stats + this.cpu.y)) === 0) {
      await this.callWith(J.j_primm, I.lost_an_eighth);
      this.ldy(this.peek(zp_save_reg));
      this.lda(0x99);
    }
    this.cpu.setFlag(DECIMAL, true);
    this.subtract(this.peek(zp_dec_amount));
    if (this.zero() || !this.carry()) {
      this.lda(0x01);
    }
    this.poke(ROST.party_stats + this.cpu.y, this.cpu.a);
    this.cpu.setFlag(DECIMAL, false);
  }


  /** The virtue's eighth of avatarhood: its name, the effect, the virtue set to zero, and its rune drawn. */
  private async partialAvatar(): Promise<void> {
    await this.callWith(J.j_primm, I.partial_avatar);
    this.lda(STRING_VIRTUE_BEFORE);
    this.add(this.peek(V.shrine_num));
    await this.m.call(J.j_printstring);
    await this.m.call(J.j_invertview);
    this.ldx(0xFF);
    this.lda(SOUND.sound_spell_effect);
    await this.m.call(J.j_playsfx);
    await this.m.call(J.j_invertview);
    this.lda(CHAR.char_enter);
    await this.m.call(J.j_console_out);
    this.ldy(this.peek(V.shrine_num));
    this.poke(ROST.party_stats + this.cpu.y, this.lda(0x00));
    await this.m.call(J.j_waitkey);
    await this.callWith(J.j_primm, I.granted_vision);
    this.poke(PRTY.game_mode, this.lda(PRTY.mode_suspended));
    this.lda(this.peek(V.shrine_num));
    await this.drawRune();
    await this.m.call(J.j_waitkey);
  }


  /** get_number: a digit, echoed; any other key counts as 0. */
  private async getNumber(): Promise<void> {
    do {
      await this.m.call(J.j_waitkey);
    } while (this.zero());
    this.subtract(CHAR.char_num_first);
    this.cmp(0x0A);
    if (this.carry()) {
      this.lda(0x00);
    }
    this.cpu.push(this.cpu.a);
    await this.m.call(J.j_printdigit);
    this.lda(CHAR.char_enter);
    await this.m.call(J.j_console_out);
    this.lda(this.cpu.pull());
  }


  /** get_string: up to fifteen letters, ended by RETURN, or by waiting during a cycle; padded with spaces to six. */
  private async getString(): Promise<void> {
    let done: boolean = false;

    this.lda(CHAR.char_question);
    await this.m.call(J.j_console_out);
    this.poke(zp_index, this.lda(0x00));
    while (!done) {
      await this.m.call(J.j_waitkey);
      if (this.zero() && (this.lda(this.peek(V.num_cycles)) !== 0)) {
        done = true;
      } else {
        done = await this.checkKey();
      }
    }
    this.ldx(this.peek(zp_index));
    this.lda(CHAR.char_space);
    do {
      this.poke(TABLES.inbuffer + this.cpu.x, this.cpu.a);
      this.inx();
      this.cpu.compare(this.cpu.x, WORD_LENGTH);
    } while (!this.carry());
    this.lda(CHAR.char_enter);
    await this.m.call(J.j_console_out);
  }


  private async checkKey(): Promise<boolean> {
    let done: boolean = false;

    this.cmp(CHAR.char_enter);
    if (this.zero()) {
      done = true;
    } else {
      this.cmp(CHAR.char_left_arrow);
      if (this.zero()) {
        await this.rubOut();
      } else {
        this.cmp(CHAR.char_space);
        if (this.carry()) {
          this.ldx(this.peek(zp_index));
          this.poke(TABLES.inbuffer + this.cpu.x, this.cpu.a);
          await this.m.call(J.j_console_out);
          this.inc(zp_index);
          this.lda(this.peek(zp_index));
          this.cmp(INPUT_MAX);
          done = this.carry();
        }
      }
    }

    return done;
  }


  private async rubOut(): Promise<void> {
    if (this.lda(this.peek(zp_index)) !== 0) {
      this.dec(zp_index);
      this.dec(ZP_MAIN.console_xpos);
      this.lda(CHAR.char_space);
      await this.m.call(J.j_console_out);
      this.dec(ZP_MAIN.console_xpos);
    }
  }


  /** compare_string: A the virtue (0-7) or mantra (8-15) the word starts with, or $FF. */
  private compareString(): void {
    let found: boolean = false;

    this.poke(zp_index, this.lda(0x0F));
    while (!found && !this.negative()) {
      this.lda(this.peek(zp_index));
      this.ldy(this.cpu.asl(this.cpu.asl(this.cpu.a)));
      this.ldx(0x00);
      let matching: boolean = true;

      while (matching && !found) {
        this.lda(this.peek(T.virtues_and_mantras + this.cpu.y));
        this.cmp(this.peek(TABLES.inbuffer + this.cpu.x));
        matching = this.zero();
        if (matching) {
          this.iny();
          this.inx();
          this.cpu.compare(this.cpu.x, 0x04);
          found = this.carry();
        }
      }
      if (!found) {
        this.dec(zp_index);
      }
    }
    this.lda(this.peek(zp_index));
  }


  /** print_hint: the A'th string of string_table, counting its zeros. */
  private async printHint(): Promise<void> {
    this.ldy(this.cpu.a);
    this.poke(ZP_MAIN.ptr1, this.lda(T.string_table & 0xFF));
    this.poke(ZP_MAIN.ptr1 + 1, this.lda(T.string_table >> 8));
    this.ldx(0x00);
    let found: boolean = false;

    while (!found) {
      if (this.lda(this.peek(this.pointer(ZP_MAIN.ptr1))) === 0) {
        found = this.dey() === 0;
      }
      if (!found) {
        this.incPtr1();
      }
    }
    let end: boolean = false;

    while (!end) {
      this.incPtr1();
      this.ldx(0x00);
      end = this.lda(this.peek(this.pointer(ZP_MAIN.ptr1))) === 0;
      if (!end) {
        await this.m.call(J.j_console_out);
      }
    }
  }


  private incPtr1(): void {
    if (this.inc(ZP_MAIN.ptr1) === 0) {
      this.inc(ZP_MAIN.ptr1 + 1);
    }
  }


  private incPtr2(): void {
    if (this.inc(ZP_MAIN.ptr2) === 0) {
      this.inc(ZP_MAIN.ptr2 + 1);
    }
  }


  /** draw_rune: the shrine's rune unpacked onto the cleared view, with the type-ahead buffer kept aside. */
  private async drawRune(): Promise<void> {
    const packer: SuperPacker = new SuperPacker(this.m, true);

    this.cpu.push(this.cpu.a);
    this.swapBuf();
    await this.m.call(J.j_clearview);
    this.lda(this.cpu.pull());
    this.ldx(this.cpu.asl(this.cpu.a));
    this.poke(ZP_MAIN.ptr2 + 1, this.lda(this.peek(T.rune_addr + 1 + this.cpu.x)));
    this.poke(ZP_MAIN.ptr2, this.lda(this.peek(T.rune_addr + this.cpu.x)));
    this.ldx(0x00);
    this.poke(SPK.spk_repeat_flag, this.cpu.x);
    this.poke(SPK.spk_pattern_flag, this.cpu.x);
    this.poke(SPK.spk_pattern_len_cur, this.cpu.x);
    this.poke(SPK.spk_repeat_code, this.lda(this.peek(this.pointer(ZP_MAIN.ptr2))));
    this.incPtr2();
    this.poke(SPK.spk_pattern_code, this.lda(this.peek(this.pointer(ZP_MAIN.ptr2))));
    this.incPtr2();
    this.ldy(MAX_SPK_COL);
    do {
      this.ldx(MAX_SPK_ROW);
      this.poke(SPK.spk_row, this.cpu.x);
      do {
        this.poke(ZP_MAIN.ptr1, this.lda(this.peek(TABLES.bmplineaddr_lo + this.cpu.x)));
        this.poke(ZP_MAIN.ptr1 + 1, this.lda(this.peek(TABLES.bmplineaddr_hi + this.cpu.x)));
        packer.writeByte();
        this.dec(SPK.spk_row);
        this.ldx(this.peek(SPK.spk_row));
        this.cpu.compare(this.cpu.x, MIN_SPK_ROW);
      } while (!this.zero());
      this.dey();
      this.cpu.compare(this.cpu.y, MIN_SPK_COL);
    } while (!this.zero());
    this.swapBuf();
  }


  /** swap_buf: the type-ahead buffer and key_buf_tmp exchanged. */
  private swapBuf(): void {
    this.ldx(0x0F);
    do {
      this.ldy(this.peek(ZP_MAIN.key_buf + this.cpu.x));
      this.poke(ZP_MAIN.key_buf + this.cpu.x, this.lda(this.peek(V.key_buf_tmp + this.cpu.x)));
      this.lda(this.cpu.y);
      this.poke(V.key_buf_tmp + this.cpu.x, this.cpu.a);
    } while (!(this.dex() & 0x80));
  }
}


export const SHRN_MODULE = overlayModule('SHRN', OVERLAY_ENTRY, SHRN_DATA, (machine: LiftedMachine): Shrn => new Shrn(machine),
  (program: Shrn): Promise<Exit> => program.run());
