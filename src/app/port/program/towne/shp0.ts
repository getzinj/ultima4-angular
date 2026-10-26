// towne/SHP0.s: the weaponries of Britain, Jhelom, Minoc, Trinsic, Buccaneer's Den and Vesper,
// ported. ULT4's load_shop loads it at $8800.

import type { LiftedMachine } from '../../../lifted-runtime/lifted-machine';
import { ROST } from '../../../state/symbols';
import { inline } from '../../inline-data';
import type { IInlineData } from '../../inline-data';
import type { Exit } from '../../routine';
import { OVERLAY_ENTRY, overlayModule, text } from '../overlay';
import { ArmsShop } from './arms-shop';
import { stringTable } from './shop-overlay';

const SHP0_TABLES = {
  payment: 0x8A00,
  location_table: 0x8BC4,
  inventory: 0x8BD4,
  price: 0x8BEC,
  string_table: 0x8C7C,
  prev_console_x: 0x931E,
  prev_console_y: 0x931F,
} as const;

const T = SHP0_TABLES;

export const SHP0_INLINE = {
  welcome_to: text(0x8803, '\nWELCOME TO\n'),
  greeting: text(0x882E, ' SAYS:\nWELCOME FRIEND,\nART THOU HERE TO\n'),
  buy_or_sell: text(0x885A, 'BUY OR SELL?'),
  buying: text(0x8878, '\nVERY GOOD,\n'),
  we_have: text(0x8888, 'WE HAVE:\nA-NOTHING\n'),
  plural: text(0x88C2, 'S\n'),
  interest: text(0x88D0, 'YOUR INTEREST?'),
  buy_one: text(0x891E, '\nWOULD YOU LIKE\nTO BUY ONE?'),
  too_bad: text(0x894D, 'TOO BAD.\n'),
  anything_else: text(0x895A, 'ANYTHING ELSE?'),
  farewell: text(0x8985, ' SAYS:\nFARE THEE WELL!\n'),
  cannot_pay: text(0x89C4, '\nI FEAR YOU\nHAVE NOT THE\nFUNDS, PERHAPS\nSOMETHING ELSE.\n'),
  fine_choice: text(0x8A32, ' SAYS:\nA FINE CHOICE!\nANYTHING ELSE?\n'),
  what_to_sell: text(0x8A5E, '\nEXCELLENT, WHAT\nWOULDST THOU\nLIKE TO SELL?'),
  dont_own: text(0x8AAC, '\nTHOU DOST NOT\nOWN THAT.\nWHAT ELSE MIGHT\nYOU SELL?'),
  will_give: text(0x8B11, '\nI WILL GIVE YOU\n'),
  gp_for_that: text(0x8B34, 'gp FOR THAT.\n'),
  deal: text(0x8B50, 'DEAL?'),
  what_else_then: text(0x8B64, 'HMMPH, WHAT\nELSE THEN?'),
  fine_what_else: text(0x8BB0, 'FINE, WHAT\nELSE?'),
  owned_title: inline(0x9297, [ 0x1F, 0xD7, 0xC5, 0xC1, 0xD0, 0xCF, 0xCE, 0xD3, 0x1D, 0x00 ]),
  owned_nothing: text(0x92FB, 'A-HANDS'),
} as const;

const LOCATION_TABLE: readonly number[] = [
  0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x00, 0x03, 0x04, 0x00, 0x00, 0x00, 0x05, 0x06, 0x00,
];

const INVENTORY: readonly number[] = [
  0x01, 0x02, 0x03, 0x06, 0x05, 0x06, 0x08, 0x0A, 0x04, 0x0A, 0x0B, 0x0C, 0x04, 0x05, 0x06, 0x07,
  0x08, 0x09, 0x0D, 0x0E, 0x02, 0x03, 0x07, 0x09,
];

const PRICE: readonly number[] = [
  0x00, 0x00, 0x00, 0x20, 0x00, 0x02, 0x00, 0x25, 0x01, 0x00, 0x02, 0x25, 0x03, 0x00, 0x02, 0x50,
  0x06, 0x00, 0x00, 0x05, 0x03, 0x50, 0x15, 0x00, 0x25, 0x00, 0x20, 0x00, 0x50, 0x00, 0x70, 0x00,
];

const STRINGS: readonly string[] = [
  '',
  'WINDSOR WEAPONRY',
  'WILLARD\'S\nWEAPONRY',
  'THE IRON WORKS',
  'DUELLING WEAPONS',
  'HOOK\'S ARMS',
  'VILLAGE ARMS',
  'WINSTON',
  'WILLARD',
  'PETER',
  'JUMAR',
  'HOOK',
  'WENDY',
  'HANDS',
  'STAFF',
  'DAGGER',
  'SLING',
  'MACE',
  'AXE',
  'SWORD',
  'BOW',
  'CROSSBOW',
  'FLAMING OIL',
  'HALBERD',
  'MAGIC AXE',
  'MAGIC SWORD',
  'MAGIC BOW',
  'MAGIC WAND',
  'MYSTIC SWORD',
  'HANDS\n',
  'WE ARE THE ONLY\nSTAFF MAKERS IN\nBRITANNIA, YET\nSELL THEM FOR\nONLY 20gp.\n',
  'WE SELL THE\nMOST DEADLY OF\nDAGGERS, A\nBARGAIN AT\nONLY 2gp EACH.\n',
  'OUR SLINGS ARE\nMADE FROM ONLY\nTHE FINEST GUT\nAND LEATHER,\n\'TIS YOURS\nFOR 25gp.\n',
  'THESE MACES HAVE\nA HARDENED SHAFT\nAND A 5lb HEAD,\nFAIRLY PRICED\nAT 100gp.\n',
  'NOTICE THE FINE\nWORKMANSHIP ON\nTHIS AXE, YOU\'LL\nAGREE 225gp IS\nA GOOD PRICE.\n',
  'THE FINE WORK\nON THESE SWORDS\nWILL BE THE\nDREAD OF THY\nFOES, FOR 300gp.\n',
  'OUR BOWS ARE\nMADE OF FINEST\nYEW, AND THE\nARROWS WILLOW, A\nSTEAL AT 250gp.\n',
  'CROSSBOWS MADE\nBY IOLO THE BARD\nARE THE FINEST\nIN THE WORLD,\nYOURS FOR 600gp.\n',
  'FLASKS OF OIL\nMAKE GREAT\nWEAPONS AND\nCREATE A WALL\nOF FIRE TOO,\n5gp EACH.\n',
  'A HALBERD IS\nA MIGHTY WEAPON\nTO ATTACK OVER\nOBSTACLES; A\nMUST AND\nONLY 350gp.\n',
  'THIS MAGICAL AXE\nCAN BE THROWN AT\nTHY ENEMY AND\nWILL THEN\nRETURN, ALL FOR\n1500gp.\n',
  'MAGICAL SWORDS\nSUCH AS THESE\nARE RARE INDEED!\nI WILL PART WITH\nONE FOR 2500gp.\n',
  'A MAGICAL BOW\nWILL KEEP THY\nENEMIES FAR AWAY\nOR DEAD! A\nMUST FOR 2000gp!\n',
  'THIS MAGIC WAND\nCASTS MIGHTY\nBLUE BOLTS TO\nSTRIKE DOWN THY\nFOES, 5000gp.\n',
  'MYSTIC SWORDS\nARE AN UNKNOWN\n',
  'HND',
  'STF',
  'DAG',
  'SLN',
  'MAC',
  'AXE',
  'SWD',
  'BOW',
  'XBO',
  'OIL',
  'HAL',
  '+AX',
  '+SW',
  '+BO',
  'WND',
  '^SW',
];


const I = SHP0_INLINE;

export const SHP0_DATA: readonly IInlineData[] = [
  ...Object.values(SHP0_INLINE),
  inline(T.payment, [ 0x00, 0x00 ]),
  inline(T.location_table, LOCATION_TABLE),
  inline(T.inventory, INVENTORY),
  inline(T.price, PRICE),
  stringTable(T.string_table, STRINGS),
  inline(T.prev_console_x, [ 0x00, 0x00 ]),
];


export class Shp0 extends ArmsShop {
  constructor(machine: LiftedMachine) {
    super(machine, {
      texts: { ...I, greeting: [ I.greeting, I.buy_or_sell ] },
      stringTable: T.string_table,
      locationTable: T.location_table,
      inventory: T.inventory,
      price: T.price,
      payment: T.payment,
      prevConsoleX: T.prev_console_x,
      prevConsoleY: T.prev_console_y,
      owned: ROST.weapons,
      ownedStat: ROST.party_stat_weapons,
      kinds: ROST.weapon_last,
      abbreviation: 0x2D,
      twoColumns: true,
      offersAgain: true,
      priceFix: true,
      capsOnlyAt99: false,
    });
  }
}


export const SHP0_MODULE = overlayModule('towne', 'SHP0', OVERLAY_ENTRY, SHP0_DATA, (machine: LiftedMachine): Shp0 => new Shp0(machine), (program: Shp0): Promise<Exit> => program.run());
