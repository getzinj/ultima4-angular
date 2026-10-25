// britannia/HELP.s: Lord British's help, ported. LORD BRUNs it over himself; it looks at how far the
// party has come (the game's first thousand moves, companions, runes, virtues, stones, avatarhood,
// the bell, book and candle, the three-part key) and tells it the next step, then BRUNs LORD back.

import type { LiftedMachine } from '../../../lifted-runtime/lifted-machine';
import { JUMP_SUBS, JUMP_SYSTEM, MUSIC, PRTY, ROST } from '../../../state/symbols';
import type { IInlineData } from '../../inline-data';
import { PortProgram } from '../../port-program';
import type { Exit } from '../../routine';
import { OVERLAY_ENTRY, overlayModule, text } from '../overlay';

const J = JUMP_SUBS;


export const HELP_INLINE = {
  he_says: text(0x8867, 'HE SAYS:\n'),
  early: text(0x8878, 'TO SURVIVE IN\nTHIS HOSTILE\nLAND THOU MUST\nFIRST KNOW\nTHYSELF! SEEK YE\nTO MASTER THY\nWEAPONS AND THY\nMAGICAL ABILITY!\n'),
  early_2: text(0x88F4, '\nTAKE GREAT CARE\nIN THESE THY\nFIRST TRAVELS\nIN BRITANNIA.\n'),
  early_3: text(0x8935, '\nUNTIL THOU DOST\nWELL KNOW\nTHYSELF TRAVEL\nNOT FAR FROM THE\nSAFETY OF THE\nTOWNES!\n'),
  companions: text(0x8990, 'TRAVEL NOT THE\nOPEN LANDS\nALONE, THERE ARE\nMANY WORTHY\nPEOPLE IN THE\nDIVERSE TOWNES\nWHOM IT WOULD BE\nWISE TO ASK TO\nJOIN THEE!\n'),
  companions_2: text(0x8A16, '\nBUILD THY PARTY\nUNTO EIGHT\nTRAVELLERS, FOR\nONLY A TRUE\nLEADER CAN WIN\nTHE QUEST!\n'),
  runes: text(0x8A72, 'LEARN YE THE\nPATHS OF VIRTUE,\nSEEK TO GAIN\nENTRY UNTO THE\nEIGHT SHRINES!\n'),
  runes_2: text(0x8AC2, '\nFIND YE THE\nRUNES, NEEDED\nFOR ENTRY INTO\nEACH SHRINE, AND\nLEARN EACH CHANT\nOR \'MANTRA\' USED\nTO FOCUS THY\nMEDITATIONS.\n'),
  runes_3: text(0x8B40, '\nWITHIN THE\nSHRINES THOU\nSHALT LEARN OF\nTHE DEEDS WHICH\nSHOW THY INNER\nVIRTUE OR VICE!\n'),
  runes_4: text(0x8B9E, '\nCHOOSE THY PATH\nWISELY FOR ALL\nTHY DEEDS OF\nGOOD OR EVIL ARE\nREMEMBERED AND\nCAN RETURN TO\nHINDER THEE!\n'),
  virtues: text(0x8C10, 'VISIT THE SEER\nHAWKWIND OFTEN\nAND USE HIS\nWISDOM TO HELP\nTHEE PROVE THY\nVIRTUE.\n'),
  virtues_2: text(0x8C67, '\nWHEN THOU ART\nREADY, HAWKWIND\nWILL ADVISE\nTHEE TO SEEK\nTHE ELEVATION\nUNTO PARTIAL\nAVATARHOOD IN A\nVIRTUE.\n'),
  virtues_3: text(0x8CD9, '\nSEEK YE TO\nBECOME A PARTIAL\nAVATAR IN ALL\nEIGHT VIRTUES,\nFOR ONLY THEN\nSHALT THOU BE\nREADY TO SEEK\nTHE CODEX!\n'),
  stones: text(0x8D52, 'GO YE NOW INTO\nTHE DEPTHS OF\nTHE DUNGEONS,\nTHEREIN RECOVER\nTHE 8 COLOURED\nSTONES FROM THE\nALTAR PEDESTALS\nIN THE HALLS\nOF THE DUNGEONS.\n'),
  stones_2: text(0x8DE1, '\nFIND THE USES OF\nTHESE STONES FOR\nTHEY CAN HELP\nTHEE IN THE\nABYSS!\n'),
  avatarhood: text(0x8E2F, 'THOU ART DOING\nVERY WELL INDEED\nON THE PATH TO\nAVATARHOOD!\nSTRIVE YE TO\nACHIEVE THE\nELEVATION IN ALL\nEIGHT VIRTUES!\n'),
  items: text(0x8EAD, 'FIND YE THE\nBELL, BOOK AND\nCANDLE! WITH\nTHESE THREE\nTHINGS, ONE MAY\nENTER THE GREAT\nSTYGIAN ABYSS!\n'),
  threepartkey: text(0x8F1A, 'BEFORE THOU DOST\nENTER THE ABYSS\nTHOU SHALT NEED\nTHE KEY OF THREE\nPARTS, AND THE\nWORD OF PASSAGE.\n'),
  threepartkey_2: text(0x8F83, '\nTHEN MIGHT THOU\nENTER THE\nCHAMBER OF THE\nCODEX OF\nULTIMATE WISDOM!\n'),
  ready: text(0x8FD1, 'THOU DOST NOW\nSEEM READY TO\nMAKE THE FINAL\nJOURNEY INTO THE\nDARK ABYSS!\nGO ONLY WITH A\nPARTY OF EIGHT!\n'),
  ready_2: text(0x903F, '\nGOOD LUCK, AND\nMAY THE POWERS\nOF GOOD WATCH\nOVER THEE ON\nTHIS THY MOST\nPERILOUS\nENDEAVOUR!\n'),
  ready_3: text(0x90A2, '\nTHE HEARTS AND\nSOULS OF ALL\nBRITANNIA GO\nWITH THEE NOW.\nTAKE CARE,\nMY FRIEND.\n'),
  brun_lord: text(0x90FD, '\u0004BRUN LORD,A$8800\n'),
} as const;

const I = HELP_INLINE;

export const HELP_DATA: readonly IInlineData[] = Object.values(HELP_INLINE);


export class Help extends PortProgram {
  /** $8800, by LORD's BRUN: the two frames it leaves dropped, the help for where the party stands, and LORD again. */
  public async run(): Promise<Exit> {
    for (let pull: number = 0; pull < 4; pull++) {
      this.lda(this.cpu.pull());
    }
    this.lda(MUSIC.music_hail_britannia);
    await this.m.call(JUMP_SYSTEM.music_ctl);
    await this.tell(this.advice());
    this.lda(MUSIC.music_off);
    await this.m.call(JUMP_SYSTEM.music_ctl);
    this.cpu.pushWord(I.brun_lord.address - 1);

    return J.j_primm_cout;
  }


  /** The first of the checks the party has not yet passed. */
  private advice(): readonly IInlineData[] {
    let pages: readonly IInlineData[] = [ I.ready, I.ready_2, I.ready_3 ];

    if (this.early()) {
      pages = [ I.early, I.early_2, I.early_3 ];
    } else if (this.alone()) {
      pages = [ I.companions, I.companions_2 ];
    } else if (this.lda(this.peek(ROST.runes)) === 0) {
      pages = [ I.runes, I.runes_2, I.runes_3, I.runes_4 ];
    } else if (this.anyVirtueUnfinished()) {
      pages = [ I.virtues, I.virtues_2, I.virtues_3 ];
    } else if (this.lda(this.peek(ROST.stones)) === 0) {
      pages = [ I.stones, I.stones_2 ];
    } else if (this.anyVirtueLeft()) {
      pages = [ I.avatarhood ];
    } else if (!this.haveAll(ROST.bell_book_candle, ROST.items_have_all, true)) {
      pages = [ I.items ];
    } else if (!this.haveAll(ROST.threepartkey, ROST.key3_have_all, false)) {
      pages = [ I.threepartkey, I.threepartkey_2 ];
    }

    return pages;
  }


  /** Fewer than a thousand moves: the move counter's top three digits all zero. */
  private early(): boolean {
    let early: boolean = false;

    this.lda(this.peek(PRTY.move_counter) | this.peek(PRTY.move_counter + 1));
    if (this.zero()) {
      early = this.lda(this.peek(PRTY.move_counter + 2) & 0xF0) === 0;
    }

    return early;
  }


  private alone(): boolean {
    this.lda(this.peek(PRTY.party_size));
    this.cmp(0x01);

    return this.zero();
  }


  /** check_virtue: some virtue from the seventh down not yet at zero, the partial avatarhood. */
  private anyVirtueUnfinished(): boolean {
    let unfinished: boolean = true;

    this.ldx(ROST.virtue_last - 1);
    while (unfinished && !this.negative()) {
      unfinished = this.lda(this.peek(ROST.party_stats + this.cpu.x)) !== 0;
      if (unfinished) {
        this.dex();
      }
    }

    return unfinished;
  }


  /** check_avatar: some virtue, from the eighth down, not at zero. */
  private anyVirtueLeft(): boolean {
    let left: boolean = false;

    this.ldx(ROST.virtue_last);
    while (!left && !(this.dex() & 0x80)) {
      left = this.lda(this.peek(ROST.party_stats + this.cpu.x)) !== 0;
    }

    return left;
  }


  private haveAll(address: number, all: number, masked: boolean): boolean {
    this.lda(this.peek(address));
    if (masked) {
      this.lda(this.cpu.a & all);
    }
    this.cmp(all);

    return this.zero();
  }


  private async tell(pages: readonly IInlineData[]): Promise<void> {
    await this.callWith(J.j_primm, I.he_says);
    for (const [ index, page ] of pages.entries()) {
      if (index > 0) {
        await this.m.call(J.j_waitkey);
      }
      await this.callWith(J.j_primm, page);
    }
  }
}


export const HELP_MODULE = overlayModule('britannia', 'HELP', OVERLAY_ENTRY, HELP_DATA, (machine: LiftedMachine): Help => new Help(machine),
  (program: Help): Promise<Exit> => program.run());
