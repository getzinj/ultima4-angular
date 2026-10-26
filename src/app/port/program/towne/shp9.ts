// towne/SHP9.s: Hawkwind the seer, in Lord British's castle, ported: for each virtue asked about, a
// reading of the party's standing in it, and a pilgrimage urged at its height; spirituality up once
// a cycle for the visit. ULT4's check_shop loads it at $8800 for row 25 of the castle.

import { DECIMAL } from '../../../lifted-runtime/cpu';
import type { LiftedMachine } from '../../../lifted-runtime/lifted-machine';
import { JUMP_SUBS, PRTY, ROST, TABLES, ZP_MAIN } from '../../../state/symbols';
import { inline } from '../../inline-data';
import type { IInlineData } from '../../inline-data';
import type { Exit } from '../../routine';
import { OVERLAY_ENTRY, overlayModule, text } from '../overlay';
import { ShopOverlay, stringTable } from './shop-overlay';

const J = JUMP_SUBS;
const zp_index: number = 0xEA;
const zp_input_index: number = 0xEA;
const KEYWORD_LENGTH: number = 4;
const SPIRITUALITY: number = 0x03;
const AVATAR: number = 0x99;

/** Each reading's first string, by how far the party has come in the virtue: below 20, 40, 60, 99, and at 99. */
const READINGS: readonly (readonly [ number, number ])[] = [ [ 0x20, 0x01 ], [ 0x40, 0x09 ], [ 0x60, 0x11 ], [ 0x99, 0x19 ] ];
const ELEVATED: number = 0x21;

const SHP9_TABLES = {
  keywords: 0x8AF3,
  string_table: 0x8BF0,
} as const;

const T = SHP9_TABLES;

export const SHP9_INLINE = {
  only_with: text(0x8816, '\nTHE SEER SAYS:\nI WILL SPEAK\nONLY WITH\n'),
  return_when: text(0x8844, '\nRETURN WHEN\n'),
  revived: text(0x8858, '\nIS REVIVED!\n'),
  welcome: text(0x886A, '\nWELCOME,\n'),
  hawkwind: text(0x887B, '\nI AM HAWKWIND,\nSEER OF SOULS.\nI SEE THAT WHICH\nIS WITHIN THEE\nAND DRIVES THEE\nTO DEEDS OF GOOD\nOR EVIL...\n'),
  which_path: text(0x88ED, '\nFOR WHAT PATH\nDOST THOU SEEK\nENLIGHTENMENT?\n'),
  other_path: text(0x8921, '\nHAWKWIND ASKS:\nWHAT OTHER PATH\nSEEKS CLARITY?\n'),
  word_blank: text(0x8957, '    '),
  word_bye: text(0x8961, 'BYE'),
  word_none: text(0x896A, 'NONE'),
  not_a_subject: text(0x8979, '\nHE SAYS:\nTHAT IS NOT A\nSUBJECT FOR\nENLIGHTENMENT.\n'),
  fare_thee_well: text(0x89B6, '\nHAWKWIND SAYS:\nFARE THEE WELL\nAND MAY THOU\nCOMPLETE THE\nQUEST OF\nTHE AVATAR!\n'),
  partial_avatar: text(0x8A2C, 'HE SAYS:\nTHOU HAST BECOME\nA PARTIAL AVATAR\nIN THAT\nATTRIBUTE. THOU\nNEED NOT MY\nINSIGHTS.\n'),
  meditate: text(0x8ABB, '\nGO TO THE SHRINE\nAND MEDITATE FOR\nTHREE CYCLES!\n'),
} as const;

const I = SHP9_INLINE;

/** The virtues' first four letters, honesty to humility, and a word of zeros to end them. */
const KEYWORDS: readonly number[] = [
  0xC8, 0xCF, 0xCE, 0xC5, 0xC3, 0xCF, 0xCD, 0xD0, 0xD6, 0xC1, 0xCC, 0xCF, 0xCA, 0xD5, 0xD3, 0xD4,
  0xD3, 0xC1, 0xC3, 0xD2, 0xC8, 0xCF, 0xCE, 0xCF, 0xD3, 0xD0, 0xC9, 0xD2, 0xC8, 0xD5, 0xCD, 0xC9,
  0x00, 0x00, 0x00, 0x00,
];

const STRINGS: readonly string[] = [
  '',
  'THOU ART A THIEF\nAND A SCOUNDREL.\nTHOU MAY NOT\nEVER BECOME AN\nAVATAR!\n',
  'THOU ART A COLD\nAND CRUEL BRUTE.\nTHOU SHOULDST GO\nTO PRISON FOR\nTHY CRIMES!\n',
  'THOU ART A\nCOWARD, THOU\nDOST FLEE FROM\nTHE HINT OF\nDANGER!\n',
  'THOU ART AN\nUNJUST WRETCH.\nTHOU ART A\nFULSOME MEDDLER!\n',
  'THOU ART A\nSELF-SERVING\nTUFTHUNTER, THOU\nDESERVETH NOT\nMY HELP, YET I\nGRANT IT!\n',
  'THOU ART A CAD\nAND A BOUNDER.\nTHY PRESENCE IS\nAN AFFRONT, THOU\nART LOW AS A\nSLUG!\n',
  'THY SPIRIT IS\nWEAK AND FEEBLE.\nTHOU DOST NOT\nSTRIVE FOR\nPERFECTION!\n',
  'THOU ART PROUD\nAND VAIN,\nALL OTHER VIRTUE\nIN THEE IS\nA LOSS!\n',
  'THOU ART NOT\nAN HONEST SOUL,\nTHOU MUST LIVE\nA MORE HONEST\nLIFE TO BE\nAN AVATAR!\n',
  'THOU DOST KILL\nWHERE THERE IS\nNO NEED AND GIVE\nTOO LITTLE UNTO\nOTHERS!\n',
  'THOU DOST NOT\nDISPLAY A GREAT\nDEAL OF VALOR.\nTHOU DOST FLEE\nBEFORE THE NEED!\n',
  'THOU ART CRUEL\nAND UNJUST, IN\nTIME THOU WILT\nSUFFER FOR THY\nCRIMES!\n',
  'THOU DOST NEED\nTO THINK MORE\nOF THE LIFE OF\nOTHERS AND LESS\nOF THY OWN!\n',
  'THOU DOST NOT\nFIGHT WITH HONOR\nBUT WITH MALICE\nAND DECEIT!\n',
  'THOU DOST NOT\nTAKE THE TIME TO\nCARE ABOUT THY\nINNER BEING, A\nMUST TO BE AN\nAVATAR!\n',
  'THOU ART TOO\nPROUD OF THY\nLITTLE DEEDS,\nHUMILITY IS THE\nROOT OF ALL\nVIRTUE!\n',
  'THOU HAST MADE\nLITTLE PROGRESS\nON THE PATHS\nOF HONESTY,\nSTRIVE TO PROVE\nTHY WORTH!\n',
  'THOU HAST NOT\nSHOWN THY\nCOMPASSION WELL.\nBE MORE KIND\nUNTO OTHERS!\n',
  'THOU ART NOT YET\nA VALIANT\nWARRIOR, FIGHT\nTO DEFEATE EVIL\nAND PROVE\nTHYSELF!\n',
  'THOU HAST NOT\nPROVEN THYSELF\nTO BE JUST.\nSTRIVE TO DO\nJUSTICE UNTO\nALL THINGS!\n',
  'THY SACRIFICE\nIS SMALL.\nGIVE OF THY\nLIFE\'S BLOOD SO\nTHAT OTHERS MAY\nLIVE.\n',
  'THOU DOST NEED\nTO SHOW THYSELF\nTO BE MORE\nHONORABLE, THE\nPATH LIES BEFORE\nTHEE!\n',
  'STRIVE TO KNOW\nAND MASTER MORE\nOF THINE INNER\nBEING.\nMEDITATION\nLIGHTS THE PATH!\n',
  'THY PROGRESS ON\nTHIS PATH IS\nMOST UNCERTAIN.\nWITHOUT HUMILITY\nTHOU ART\nEMPTY!\n',
  'THOU DOST SEEM\nTO BE AN HONEST\nSOUL, CONTINUED\nHONESTY WILL\nREWARD THEE!\n',
  'THOU DOST SHOW\nTHY COMPASSION\nWELL, CONTINUED\nGOODWILL SHOULD\nBE THY GUIDE!\n',
  'THOU ART SHOWING\nVALOR IN THE\nFACE OF DANGER.\nSTRIVE TO BECOME\nYET MORE SO!\n',
  'THOU DOST SEEM\nFAIR AND JUST.\nSTRIVE TO UPHOLD\nJUSTICE EVEN\nMORE STERNLY!\n',
  'THOU ART GIVING\nOF THYSELF IN\nSOME WAYS, SEEK\nYE NOW TO FIND\nYET MORE!\n',
  'THOU DOST SEEM\nTO BE HONORABLE\nIN NATURE, SEEK\nTO BRING HONOR\nUPON OTHERS AS\nWELL!\n',
  'THOU ART DOING\nWELL ON THE PATH\nTO INNER SIGHT.\nCONTINUE TO SEEK\nTHE INNER LIGHT!\n',
  'THOU DOST SEEM\nA HUMBLE SOUL.\nTHOU ART SETTING\nSTRONG STONES TO\nBUILD VIRTUES\nUPON!\n',
  'THOU ART TRULY\nAN HONEST SOUL.\nSEEK YE NOW TO\nREACH ELEVATION!\n',
  'COMPASSION IS\nA VIRTUE THAT\nTHOU HAST SHOWN\nWELL. SEEK YE\nNOW ELEVATION!\n',
  'THOU ART A TRULY\nVALIANT WARRIOR.\nSEEK YE NOW\nELEVATION IN THE\nVIRTUE OF VALOR!\n',
  'THOU ART JUST\nAND FAIR. SEEK\nYE NOW THE\nELEVATION!\n',
  'THOU ART GIVING\nAND GOOD. THY\nSELF-SACRIFICE IS\nGREAT. SEEK\nNOW ELEVATION!\n',
  'THOU HAST PROVEN\nTHYSELF TO BE\nHONORABLE, SEEK\nYE NOW FOR THE\nELEVATION!\n',
  'SPIRITUALITY\nIS IN THY\nNATURE. SEEK YE\nNOW THE\nELEVATION!\n',
  'THY HUMILITY\nSHINES BRIGHT\nUPON THY BEING.\nSEEK YE NOW FOR\nELEVATION!\n',
];

export const SHP9_DATA: readonly IInlineData[] = [
  ...Object.values(SHP9_INLINE),
  inline(T.keywords, KEYWORDS),
  stringTable(T.string_table, STRINGS),
];


export class Shp9 extends ShopOverlay {
  constructor(machine: LiftedMachine) {
    super(machine, T.string_table);
  }


  /** Only for a leader who is well or poisoned; otherwise the seer waits for the leader's revival. */
  public async run(): Promise<Exit> {
    this.poke(ZP_MAIN.curr_player, this.lda(0x01));
    await this.m.call(J.j_get_stats_ptr);
    this.ldy(ROST.player_status);
    this.lda(this.peek(this.pointer(ZP_MAIN.ptr1) + ROST.player_status));
    this.cmp(ROST.status_Good);
    if (!this.zero()) {
      this.cmp(ROST.status_Poison);
    }
    if (this.zero()) {
      await this.print(I.welcome);
      await this.m.call(J.j_printname);
      await this.print(I.hawkwind);
      await this.m.call(J.j_waitkey);
      await this.print(I.which_path);
      await this.consult();
    } else {
      await this.print(I.only_with);
      await this.m.call(J.j_printname);
      await this.print(I.return_when);
      await this.m.call(J.j_printname);
      await this.print(I.revived);
    }

    return null;
  }


  /** Virtues asked about until nothing, BYE or NONE, then spirituality up once a cycle. */
  private async consult(): Promise<void> {
    let done: boolean = false;

    while (!done) {
      await this.getInput(zp_input_index);
      for (const word of [ I.word_blank, I.word_bye, I.word_none ]) {
        if (!done) {
          this.matchInputInline(word);
          done = this.zero();
        }
      }
      if (!done) {
        this.compareVirtues();
        if (this.negative()) {
          await this.print(I.not_a_subject);
        } else {
          await this.checkAvatar();
        }
        await this.print(I.other_path);
      }
    }
    await this.print(I.fare_thee_well);
    this.lda(this.peek(PRTY.move_counter + 2));
    this.cmp(this.peek(PRTY.last_meditated));
    if (!this.zero()) {
      this.poke(PRTY.last_meditated, this.cpu.a);
      this.cpu.setFlag(DECIMAL, true);
      this.setCarry(false);
      if (this.lda(this.peek(ROST.party_stats + ROST.virtue_spirituality)) !== 0) {
        this.cpu.adc(SPIRITUALITY);
        if (this.carry()) {
          this.lda(0x99);
        }
      }
      this.poke(ROST.party_stats + ROST.virtue_spirituality, this.cpu.a);
      this.cpu.setFlag(DECIMAL, false);
    }
  }


  /** The reading for the virtue, by how far the party has come in it; none for a partial Avatar. */
  private async checkAvatar(): Promise<void> {
    await this.printNewline();
    this.ldy(this.peek(zp_index));
    if (this.lda(this.peek(ROST.party_stats + this.cpu.y)) === 0) {
      await this.print(I.partial_avatar);
    } else {
      this.ldy(this.peek(zp_index));
      this.ldx(this.lda(this.peek(ROST.party_stats + this.cpu.y)));
      this.reading();
      this.add(this.peek(zp_index));
      await this.printString(this.cpu.a);
      this.ldy(this.peek(zp_index));
      this.lda(this.peek(ROST.party_stats + this.cpu.y));
      this.cmp(AVATAR);
      if (this.zero()) {
        await this.print(I.meditate);
        await this.m.call(J.j_waitkey);
      }
    }
  }


  /** The reading's first string in A for the virtue in X: `lda` / `cpx` / `bcc` down the bounds. */
  private reading(): void {
    let chosen: boolean = false;

    for (const [ below, first ] of READINGS) {
      if (!chosen) {
        this.lda(first);
        this.cpu.compare(this.cpu.x, below);
        chosen = !this.carry();
      }
    }
    if (!chosen) {
      this.lda(ELEVATED);
    }
  }


  /** compare_keywords: the first of the virtues the four characters typed match, in zp_index and A; or $FF, negative, for none. */
  private compareVirtues(): void {
    let found: boolean | null = null;

    this.poke(zp_index, this.lda(0x00));
    while (found == null) {
      let differs: boolean = false;
      let matched: boolean = false;

      this.lda(this.peek(zp_index));
      this.ldy(this.cpu.asl(this.cpu.asl(this.cpu.a)));
      this.ldx(0x00);
      while (!differs && !matched && (found == null)) {
        if (this.lda(this.peek(T.keywords + this.cpu.y)) === 0) {
          found = false;
        } else {
          this.cmp(this.peek(TABLES.inbuffer + this.cpu.x));
          differs = !this.zero();
          if (!differs) {
            this.iny();
            this.inx();
            this.cpu.compare(this.cpu.x, KEYWORD_LENGTH);
            matched = this.carry();
          }
        }
      }
      if (matched) {
        found = true;
      } else if (differs) {
        this.inc(zp_index);
      }
    }
    if (found) {
      this.lda(this.peek(zp_index));
    } else {
      this.poke(zp_index, this.lda(0xFF));
    }
  }
}


export const SHP9_MODULE = overlayModule('towne', 'SHP9', OVERLAY_ENTRY, SHP9_DATA, (machine: LiftedMachine): Shp9 => new Shp9(machine), (program: Shp9): Promise<Exit> => program.run());
