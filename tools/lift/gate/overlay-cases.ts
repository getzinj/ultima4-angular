// The differential cases for the ported Britannia overlays: each loaded at its address and run from
// its entry, with the inventory, the party and the place drawn at random from the values that
// reach each branch: an item's spot, the Abyss's entrance, dark moons, a sleeping party.

import type { LiftedMachine } from '../../../src/app/lifted-runtime/lifted-machine';
import type { INativeModule } from '../../../src/app/lifted-runtime/native-module';
import { HELP_MODULE } from '../../../src/app/port/program/britannia/help';
import { HOLE_MODULE } from '../../../src/app/port/program/britannia/hole';
import { LORD_MODULE } from '../../../src/app/port/program/britannia/lord';
import { OVERLAY_ENTRY } from '../../../src/app/port/program/britannia/overlay';
import { SAVE_MODULE } from '../../../src/app/port/program/britannia/save';
import { SEAR_MODULE } from '../../../src/app/port/program/britannia/sear';
import { SHRN_MODULE } from '../../../src/app/port/program/britannia/shrn';
import { TMAP_MODULE } from '../../../src/app/port/program/britannia/tmap';
import { USE_MODULE } from '../../../src/app/port/program/britannia/use';
import { DISKS, JUMP_OVERLAY, PLACES, PRTY, ROST, VIEW_MAP, ZP_MAIN } from '../../../src/app/state/symbols';
import { byte } from './differential';
import type { ICase, Random } from './differential';
import { ESCAPE, STOPS, pick, world } from './ult4-cases';

export interface IOverlayCase {
  readonly module: INativeModule;
  /** The native programs, when the overlay BRUNs another that is ported too: LORD and HELP. */
  readonly modules?: readonly INativeModule[];
  readonly entry: number;
  readonly testCase: ICase;
}

type Key = { code: number; polls: number };

const SEAR_X: readonly number[] = [ 0xB6, 0x64, 0x2E, 0xCD, 0xB0, 0x2D, 0x60, 0xC5, 0xE0, 0x40 ];
const SEAR_Y: readonly number[] = [ 0x36, 0xA5, 0x95, 0x2C, 0xD0, 0xAD, 0xD7, 0xF5, 0x85, 0x50 ];
const ITEMS: readonly string[] = [ 'STONES', 'BELL', 'BOOK', 'CANDLE', 'KEY', 'HORN', 'WHEEL', 'SKULL' ];
const NOT_ITEMS: readonly string[] = [ 'SKUX', 'SWORDFISHBATTERY', 'X', '' ];
const SUBJECTS: readonly string[] = [
  'BYE', 'NAME', 'LOOK', 'JOB', 'HEAL', 'TRUTH', 'LOVE', 'COURAGE', 'HONESTY', 'COMPASSION', 'VALOR', 'JUSTICE', 'SACRIFICE', 'HONOR',
  'SPIRITUALITY', 'HUMILITY', 'PRIDE', 'AVATAR', 'QUEST', 'BRITANNIA', 'ANKH', 'HELP', 'ABYSS', 'MONDAIN', 'MINAX', 'EXODUS', 'VIRTUE', 'XYZZY',
  'Y', 'N', '', 'HE',
];
const VIRTUES: readonly string[] = [ 'HONESTY', 'COMPASSION', 'VALOR', 'JUSTICE', 'SACRIFICE', 'HONOR', 'SPIRITUALITY', 'HUMILITY' ];
const MANTRAS: readonly string[] = [ 'AHM', 'MU', 'RA', 'BEH', 'CAH', 'SUMMUM', 'OM', 'LUM' ];
/** The return a case's overlay was entered by BRUN with: the overlay drops two frames, the second this one. */
const RETURN: number = 0xC0FE;
/** Three cycles of SHRN's sixteen dots, each five delays of 255 x 255 loops. */
const MEDITATION_CYCLES: number = 400_000_000;
const STATUSES: readonly number[] = [ ROST.status_Good, ROST.status_Good, ROST.status_Poison, ROST.status_Sleep, ROST.status_Dead, 0xC1 ];


function bcd(random: Random): number {
  return (Math.floor(random() * 10) << 4) | Math.floor(random() * 10);
}


/** Each player alive or not, hurt or not, of any class, and every virtue and reagent in BCD. */
function party(machine: LiftedMachine, random: Random): void {
  for (let index: number = 0; index < 8; index++) {
    const stats: number = ROST.player_stats + (index * 0x20);
    const max: number = bcd(random);

    machine.write(stats + ROST.player_status, pick(random, STATUSES));
    machine.write(stats + ROST.player_class_index, Math.floor(random() * 9));
    machine.write(stats + ROST.player_intelligence, pick(random, [ 0x00, 0x99, bcd(random) ]));
    machine.write(stats + ROST.player_max_hp_hi, max);
    machine.write(stats + ROST.player_max_hp_lo, bcd(random));
    machine.write(stats + ROST.player_cur_hp_hi, pick(random, [ max, bcd(random), 0x00 ]));
    machine.write(stats + ROST.player_cur_hp_lo, bcd(random));
    machine.write(stats + ROST.player_experience_hi, pick(random, [ 0x99, 0x98, bcd(random) ]));
  }
  for (let index: number = 0; index < 0x10; index++) {
    machine.write(ROST.party_stats + index, pick(random, [ 0x00, 0x01, 0x99, bcd(random) ]));
  }
  for (let index: number = 0; index < 8; index++) {
    machine.write(ROST.reagents + index, pick(random, [ 0x00, 0x99, bcd(random) ]));
  }
}


/** The quest items held or not, used or not. */
function inventory(machine: LiftedMachine, random: Random): void {
  machine.write(ROST.stones, pick(random, [ 0x00, 0xFF, byte(random) ]));
  machine.write(ROST.bell_book_candle, pick(random, [ 0x00, 0x07, 0x47, 0x67, 0x77, byte(random) ]));
  machine.write(ROST.threepartkey, pick(random, [ 0x00, 0x07 ]));
  machine.write(ROST.horn, pick(random, [ 0x00, 0x01, 0x01 ]));
  machine.write(ROST.wheel, pick(random, [ 0x00, 0x01, 0x01 ]));
  machine.write(ROST.skull, pick(random, [ 0x00, 0x01, 0x01, 0x01, 0xFF ]));
}


function moons(machine: LiftedMachine, random: Random): void {
  const dark: boolean = random() < 0.5;

  machine.write(PRTY.moon_phase_trammel, dark ? 0 : Math.floor(random() * 8));
  machine.write(PRTY.moon_phase_felucca, dark ? 0 : Math.floor(random() * 8));
}


/** At the spot of SEAR's `item`, or of none. */
function searching(item: number | null): (machine: LiftedMachine, random: Random) => void {
  return (machine: LiftedMachine, random: Random): void => {
    world(machine, random);
    party(machine, random);
    inventory(machine, random);
    moons(machine, random);
    if (item != null) {
      machine.write(PRTY.player_xpos, SEAR_X[item]);
      machine.write(PRTY.player_ypos, (random() < 0.9) ? SEAR_Y[item] : byte(random));
    }
    lastReagent(machine, random);
  };
}


function lastReagent(machine: LiftedMachine, random: Random): void {
  machine.write(PRTY.move_counter + 3, byte(random));
  machine.write(PRTY.last_found_reagent, (random() < 0.3) ? (machine.read(PRTY.move_counter + 3) & 0xF0) : byte(random));
}


/** In Britannia, where CAMP is on the disk in the drive. */
function camping(machine: LiftedMachine, random: Random): void {
  world(machine, random);
  party(machine, random);
  machine.write(PRTY.game_mode, PRTY.mode_world);
  machine.write(ZP_MAIN.currdisk_drive1, DISKS.disk_britannia);
  machine.insertDisk(1, 'britannia');
  machine.write(PRTY.move_counter + 2, byte(random));
  machine.write(PRTY.last_sleep, (random() < 0.3) ? machine.read(PRTY.move_counter + 2) : byte(random));
}


function using(machine: LiftedMachine, random: Random): void {
  world(machine, random);
  party(machine, random);
  inventory(machine, random);
  if (random() < 0.4) {
    machine.write(PRTY.player_xpos, PLACES.xpos_abyss_entrance);
    machine.write(PRTY.player_ypos, (random() < 0.9) ? PLACES.ypos_abyss_entrance : byte(random));
  }
  machine.write(PRTY.game_mode, pick(random, [ 0x01, 0x01, 0x80, 0x82 ]));
  machine.write(ZP_MAIN.sfx_volume, pick(random, [ 0x00, 0xFF ]));
  machine.write(ZP_MAIN.key_buf_len, 0x00);
}


/** One of `words` typed at USE's prompt, sometimes with a slip mended by backspace, and RETURN. */
function typed(words: readonly string[]): (random: Random) => readonly Key[] {
  return (random: Random): readonly Key[] => typedWord(pick(random, words), random);
}


function typedWord(word: string, random: Random): readonly Key[] {
  const keys: Key[] = [ ...word ].map((character: string): Key => ({ code: character.charCodeAt(0), polls: Math.floor(random() * 3) }));

  if (random() < 0.3) {
    keys.splice(Math.floor(random() * keys.length), 0, { code: 0x51, polls: 0 }, { code: 0x08, polls: 0 });
  }
  if (random() < 0.1) {
    keys.unshift({ code: 0x08, polls: 0 });
  }

  return [ ...keys, { code: 0x0D, polls: 0 } ];
}


function viewing(machine: LiftedMachine, random: Random): void {
  world(machine, random);
  machine.write(PRTY.tile_xpos, Math.floor(random() * 0x20));
  machine.write(PRTY.tile_ypos, Math.floor(random() * 0x20));
  machine.write(PRTY.player_xpos, pick(random, [ Math.floor(random() * 0x20), byte(random) ]));
  machine.write(PRTY.player_ypos, pick(random, [ Math.floor(random() * 0x20), byte(random) ]));
  for (let index: number = 0; index < 0x400; index++) {
    machine.write(VIEW_MAP.view_buf + index, pick(random, [ byte(random), Math.floor(random() * 0x80), 0x80 | byte(random) ]));
  }
}


/** A key for a waitkey: a space mostly, any letter sometimes. */
function anyKey(random: Random): Key {
  return { code: (random() < 0.8) ? 0x20 : 0x41 + Math.floor(random() * 26), polls: Math.floor(random() * 3) };
}


/** A talk with Lord British: subjects asked, keys between for his pages, and farewell, said until it is heard. */
function conversation(random: Random): readonly Key[] {
  const keys: Key[] = [];
  const count: number = 2 + Math.floor(random() * 6);

  for (let subject: number = 0; subject < count; subject++) {
    keys.push(...typedWord(pick(random, SUBJECTS), random));
    for (let page: number = Math.floor(random() * 4); page > 0; page--) {
      keys.push(anyKey(random));
    }
  }
  for (let bye: number = 0; bye < 4; bye++) {
    keys.push(...typedWord('BYE', random));
  }

  return keys;
}


/** Lord British's party: met before or not, of one to eight, with experience to raise a level or not. */
function court(machine: LiftedMachine, random: Random): void {
  world(machine, random);
  party(machine, random);
  inventory(machine, random);
  machine.write(PRTY.game_mode, PRTY.mode_towne);
  machine.write(ZP_MAIN.currdisk_drive1, DISKS.disk_britannia);
  machine.insertDisk(1, 'britannia');
  machine.write(PRTY.player_has_spoken_to_lb, (random() < 0.7) ? 0x01 : 0x00);
  machine.write(PRTY.party_size, pick(random, [ 0x01, 0x01, 0x02, 0x02, 0x03, 0x08 ]));
  machine.write(ROST.runes, pick(random, [ 0x00, 0x00, 0xFF, byte(random) ]));
  for (let digit: number = 0; digit < 4; digit++) {
    machine.write(PRTY.move_counter + digit, pick(random, [ 0x00, 0x00, 0x01, 0x10, byte(random) ]));
  }
  if (random() < 0.5) {
    for (let virtue: number = 0; virtue < 8; virtue++) {
      machine.write(ROST.party_stats + virtue, pick(random, [ 0x00, 0x00, 0x50 ]));
    }
  }
  machine.write(ZP_MAIN.key_buf_len, 0x00);
}


/** The court, entered as a BRUN would leave it: a word under the two frames the overlay drops, to return by. */
function brunInto(machine: LiftedMachine, random: Random): void {
  court(machine, random);
  machine.cpu.pushWord(RETURN - 1);
  machine.cpu.pushWord(byte(random) | (byte(random) << 8));
}


/** Shrine `shrineNumber`, its rune held or not, the party rested or weary, its virtue at its height or not. */
function shrine(shrineNumber: number): (machine: LiftedMachine, random: Random) => void {
  return (machine: LiftedMachine, random: Random): void => {
    world(machine, random);
    party(machine, random);
    machine.write(PRTY.game_mode, PRTY.mode_world);
    machine.write(ZP_MAIN.currdisk_drive1, DISKS.disk_britannia);
    machine.insertDisk(1, 'britannia');
    machine.write(PRTY.current_location, PRTY.loc_shrine_first + shrineNumber);
    machine.write(PRTY.tile_xpos, Math.floor(random() * 0x20));
    machine.write(PRTY.tile_ypos, Math.floor(random() * 0x20));
    machine.write(ROST.runes, (random() < 0.85) ? (0x80 >> shrineNumber) | byte(random) : byte(random) & ~(0x80 >> shrineNumber));
    machine.write(PRTY.move_counter + 2, byte(random));
    machine.write(PRTY.last_meditated, (random() < 0.2) ? machine.read(PRTY.move_counter + 2) : byte(random));
    machine.write(ROST.party_stats + shrineNumber, pick(random, [ 0x99, 0x99, 0x00, 0x50 ]));
    machine.write(ROST.party_stats + ROST.virtue_spirituality, pick(random, [ 0x00, 0x01, 0x02, 0x50, 0x97, 0x99 ]));
    machine.write(ZP_MAIN.key_buf_len, 0x00);
  };
}


/** A meditation: a virtue, mostly the shrine's, its cycles, mostly its mantra, and keys for the pages. */
function meditation(shrineNumber: number): (random: Random) => readonly Key[] {
  return (random: Random): readonly Key[] => meditationKeys(shrineNumber, random);
}


function meditationKeys(shrineNumber: number, random: Random): readonly Key[] {
  const keys: Key[] = [];
  const cycles: number = 1 + Math.floor(random() * 3);

  keys.push(...typedWord((random() < 0.7) ? VIRTUES[shrineNumber] : pick(random, [ ...VIRTUES, 'HON', 'X' ]), random));
  if (random() < 0.2) {
    keys.push({ code: 0x37, polls: 0 });
  }
  keys.push({ code: 0x30 + cycles, polls: Math.floor(random() * 3) });
  for (let cycle: number = 0; cycle < cycles; cycle++) {
    keys.push(...typedWord((random() < 0.85) ? MANTRAS[shrineNumber] : pick(random, MANTRAS), random));
  }
  for (let page: number = 0; page < 4; page++) {
    keys.push(pageKey(random));
  }

  return keys;
}


/** A key for one of SHRN's pages: never SPACE, which empties the type-ahead buffer of the keys still in it. */
function pageKey(random: Random): Key {
  return { code: 0x41 + Math.floor(random() * 26), polls: Math.floor(random() * 3) };
}


function loaded(name: string, setup: (machine: LiftedMachine, random: Random) => void): (machine: LiftedMachine, random: Random) => void {
  return (machine: LiftedMachine, random: Random): void => {
    setup(machine, random);
    machine.bload('britannia', name);
  };
}


export const OVERLAY_CASES: Readonly<Record<string, IOverlayCase>> = {
  sear: { module: SEAR_MODULE, entry: OVERLAY_ENTRY, testCase: { ult4: true, stops: STOPS, setup: loaded('SEAR', searching(null)) } },
  ...Object.fromEntries(SEAR_X.map((_: number, item: number): [ string, IOverlayCase ] => [ `sear_${ item }`, {
    module: SEAR_MODULE,
    entry: OVERLAY_ENTRY,
    testCase: { ult4: true, stops: STOPS, setup: loaded('SEAR', searching(item)) },
  } ])),
  lord: {
    module: LORD_MODULE,
    modules: [ LORD_MODULE, HELP_MODULE ],
    entry: JUMP_OVERLAY.talk_lord_british,
    testCase: { ult4: true, stops: STOPS, keys: conversation, setup: loaded('LORD', court) },
  },
  lord_after_help: {
    module: LORD_MODULE,
    modules: [ LORD_MODULE, HELP_MODULE ],
    entry: OVERLAY_ENTRY,
    testCase: { ult4: true, stops: STOPS, keys: conversation, setup: loaded('LORD', brunInto) },
  },
  help: {
    module: HELP_MODULE,
    modules: [ LORD_MODULE, HELP_MODULE ],
    entry: OVERLAY_ENTRY,
    testCase: { ult4: true, stops: STOPS, keys: (random: Random): readonly Key[] => [ anyKey(random), anyKey(random), anyKey(random), ...conversation(random) ],
      setup: loaded('HELP', brunInto) },
  },
  ...Object.fromEntries(VIRTUES.map((_: string, shrineNumber: number): [ string, IOverlayCase ] => [ `shrn_${ shrineNumber }`, {
    module: SHRN_MODULE,
    entry: OVERLAY_ENTRY,
    testCase: { ult4: true, stops: STOPS, cycles: MEDITATION_CYCLES, keys: meditation(shrineNumber), setup: loaded('SHRN', shrine(shrineNumber)) },
  } ])),
  hole: { module: HOLE_MODULE, entry: OVERLAY_ENTRY, testCase: { ult4: true, stops: STOPS, setup: loaded('HOLE', camping) } },
  use: { module: USE_MODULE, entry: OVERLAY_ENTRY, testCase: { ult4: true, stops: STOPS, keys: typed(NOT_ITEMS), setup: loaded('USE', using) } },
  ...Object.fromEntries(ITEMS.map((item: string): [ string, IOverlayCase ] => [ `use_${ item.toLowerCase() }`, {
    module: USE_MODULE,
    entry: OVERLAY_ENTRY,
    testCase: { ult4: true, stops: STOPS, keys: typed([ item ]), setup: loaded('USE', using) },
  } ])),
  save: {
    module: SAVE_MODULE,
    entry: OVERLAY_ENTRY,
    testCase: { ult4: true, stops: STOPS, key: ESCAPE, setup: loaded('SAVE', (machine: LiftedMachine, random: Random): void => {
      world(machine, random);
      party(machine, random);
      machine.write(ZP_MAIN.key_buf_len, 0x00);
    }) },
  },
  tmap: {
    module: TMAP_MODULE,
    entry: VIEW_MAP.j_viewmap,
    testCase: { ult4: true, stops: STOPS, key: (random: Random): Key => ({ code: 0x20, polls: Math.floor(random() * 5) }), setup: loaded('TMAP', viewing) },
  },
};
