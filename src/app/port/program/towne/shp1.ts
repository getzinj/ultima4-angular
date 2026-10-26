// towne/SHP1.s: the armouries of Britain, Jhelom, Trinsic, Paws and Buccaneer's Den, ported.
// ULT4's load_shop loads it at $8800.

import type { LiftedMachine } from '../../../lifted-runtime/lifted-machine';
import { ROST } from '../../../state/symbols';
import { inline } from '../../inline-data';
import type { IInlineData } from '../../inline-data';
import type { Exit } from '../../routine';
import { OVERLAY_ENTRY, overlayModule, text } from '../overlay';
import { ArmsShop } from './arms-shop';
import { stringTable } from './shop-overlay';

const SHP1_TABLES = {
  payment: 0x89CB,
  location_table: 0x8B6A,
  inventory: 0x8B7A,
  price: 0x8B8E,
  string_table: 0x8BE4,
  prev_console_x: 0x8F11,
  prev_console_y: 0x8F12,
} as const;

const T = SHP1_TABLES;

export const SHP1_INLINE = {
  welcome_to: text(0x8803, '\nWELCOME TO\n'),
  greeting: text(0x882E, ' SAYS:\nWANT TO BUY\nOR SELL?'),
  buying: text(0x885B, '\nWELL THEN,\n'),
  we_have: text(0x886B, 'WE\'VE GOT:\nA-NOTHING\n'),
  interest: text(0x88B4, 'WHAT\'LL IT BE?'),
  buy_one: text(0x8902, '\nDO YOU WANT\nTO BUY IT?'),
  too_bad: text(0x892F, 'TOO BAD.\n'),
  anything_else: text(0x893C, 'ANYTHING ELSE?'),
  farewell: text(0x8967, ' SAYS:\nGOOD BYE.\n'),
  cannot_pay: text(0x89A0, 'WHAT YOU TRY\'N\nTO PULL? YOU\nCAN\'T PAY.\n'),
  fine_choice: text(0x89FD, ' SAYS:\nGOOD CHOICE!\nANYTHING ELSE?\n'),
  what_to_sell: text(0x8A27, '\nWHAT DO YOU WANT\nTO SELL?'),
  dont_own: text(0x8A64, '\nCOME ON, YOU\nDON\'T EVEN OWN\nANY! WHAT ELSE?'),
  will_give: text(0x8AB8, '\nI\'LL GIVE YA\n'),
  gp_for_that: text(0x8AD8, 'gp FOR THAT.\n'),
  deal: text(0x8AF4, 'DEAL?'),
  what_else_then: text(0x8B08, 'HARUMPH, WHAT\nELSE THEN?'),
  fine_what_else: text(0x8B56, 'GOOD, WHAT\nELSE?'),
  owned_title: inline(0x8F4C, [ 0x1F, 0xC1, 0xD2, 0xCD, 0xCF, 0xD5, 0xD2, 0x1C, 0x00 ]),
  owned_nothing: text(0x8FA8, 'A-NO ARMOUR'),
} as const;

const LOCATION_TABLE: readonly number[] = [
  0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x00, 0x00, 0x03, 0x00, 0x00, 0x04, 0x05, 0x00, 0x00,
];

const INVENTORY: readonly number[] = [
  0x01, 0x02, 0x03, 0x00, 0x03, 0x04, 0x05, 0x06, 0x01, 0x03, 0x05, 0x00, 0x01, 0x02, 0x00, 0x00,
  0x01, 0x02, 0x03, 0x00,
];

const PRICE: readonly number[] = [
  0x00, 0x00, 0x00, 0x50, 0x02, 0x00, 0x06, 0x00, 0x20, 0x00, 0x40, 0x00, 0x70, 0x00, 0x90, 0x00,
];

const STRINGS: readonly string[] = [
  '',
  'WINDSOR ARMOUR',
  'VALIANT\'S ARMOUR',
  'DUELLING ARMOUR',
  'LIGHT ARMOUR',
  'BASIC ARMOUR',
  '',
  'JEAN',
  'VALIANT',
  'PIERRE',
  'LIMPY',
  'BIG JOHN',
  '',
  'SKIN',
  'CLOTH',
  'LEATHER',
  'CHAIN MAIL',
  'PLATE MAIL',
  'MAGIC CHAIN',
  'MAGIC PLATE',
  'MYSTIC ROBE',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  'SKIN\n',
  'CLOTH ARMOUR IS\nGOOD FOR A TIGHT\nBUDGET, FAIRLY\nPRICED AT 50gp.\n',
  'LEATHER ARMOUR\nIS BOTH SUPPLE\nAND STRONG, AND\nCOSTS A MERE\n200gp, A\nBARGAIN!\n',
  'CHAIN MAIL IS\nTHE ARMOUR USED\nBY MORE WARRIORS\nTHAN ALL OTHERS.\nOURS COSTS 600gp\n',
  'FULL PLATE\nARMOUR IS THE\nULTIMATE IN NON-\nMAGIC ARMOUR,\nGET YOURS\nFOR 2000gp.\n',
  'MAGIC ARMOUR IS\nRARE AND\nEXPENSIVE. THIS\nCHAIN SELLS FOR\n4000gp.\n',
  'MAGICAL PLATE\nARMOUR IS THE\nBEST KNOWN\nPROTECTION, ONLY\nWE HAVE IT.\nCOST: 7000gp.\n',
  'MYSTIC ROBES!\n',
];


const I = SHP1_INLINE;

export const SHP1_DATA: readonly IInlineData[] = [
  ...Object.values(SHP1_INLINE),
  inline(T.payment, [ 0x00, 0x00 ]),
  inline(T.location_table, LOCATION_TABLE),
  inline(T.inventory, INVENTORY),
  inline(T.price, PRICE),
  stringTable(T.string_table, STRINGS),
  inline(T.prev_console_x, [ 0x00, 0x00 ]),
];


export class Shp1 extends ArmsShop {
  constructor(machine: LiftedMachine) {
    super(machine, {
      texts: { ...I, greeting: [ I.greeting ], plural: null },
      stringTable: T.string_table,
      locationTable: T.location_table,
      inventory: T.inventory,
      price: T.price,
      payment: T.payment,
      prevConsoleX: T.prev_console_x,
      prevConsoleY: T.prev_console_y,
      owned: ROST.armour,
      ownedStat: ROST.party_stat_armour,
      kinds: ROST.armour_last,
      abbreviation: 0x0D,
      twoColumns: false,
      offersAgain: false,
      priceFix: false,
      capsOnlyAt99: true,
    });
  }
}


export const SHP1_MODULE = overlayModule('towne', 'SHP1', OVERLAY_ENTRY, SHP1_DATA, (machine: LiftedMachine): Shp1 => new Shp1(machine), (program: Shp1): Promise<Exit> => program.run());
