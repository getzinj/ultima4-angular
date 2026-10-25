// The differential cases for the ported Britannia and towne overlays: each loaded at its address and
// run from its entry, with the inventory, the party and the place drawn at random from the values
// that reach each branch: an item's spot, the Abyss's entrance, dark moons, a sleeping party, a
// townsperson's record.

import type { LiftedMachine } from '../../../src/app/lifted-runtime/lifted-machine';
import type { INativeModule } from '../../../src/app/lifted-runtime/native-module';
import { HELP_MODULE } from '../../../src/app/port/program/britannia/help';
import { HOLE_MODULE } from '../../../src/app/port/program/britannia/hole';
import { LORD_MODULE } from '../../../src/app/port/program/britannia/lord';
import { OVERLAY_ENTRY } from '../../../src/app/port/program/overlay';
import { SAVE_MODULE } from '../../../src/app/port/program/britannia/save';
import { SEAR_MODULE } from '../../../src/app/port/program/britannia/sear';
import { SHRN_MODULE } from '../../../src/app/port/program/britannia/shrn';
import { TMAP_MODULE } from '../../../src/app/port/program/britannia/tmap';
import { USE_MODULE } from '../../../src/app/port/program/britannia/use';
import { TOWNE_SEAR_MODULE } from '../../../src/app/port/program/towne/sear';
import { DIALOG, TALK_MODULE } from '../../../src/app/port/program/towne/talk';
import { TOWNE_TMAP_MODULE } from '../../../src/app/port/program/towne/tmap';
import { TOWNE_USE_MODULE } from '../../../src/app/port/program/towne/use';
import type { UltimaDiskName } from '../../../src/app/data/ultima-disks';
import { DISKS, JUMP_OVERLAY, MAP_OBJECTS, PLACES, PRTY, ROST, TILES, VIEW_MAP, ZP_MAIN } from '../../../src/app/state/symbols';
import { DIALOGUE_WORDS, dialogue } from './dialogue';
import { byte } from './differential';
import type { ICase, Random } from './differential';
import { rigRand } from './monster-cases';
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
/** What is asked of Lord British, with healing's answer after it. */
const SUBJECTS: readonly (readonly string[])[] = [
  [ 'NAME' ], [ 'LOOK' ], [ 'JOB' ], [ 'HEAL', 'N' ], [ 'HEAL', 'N' ], [ 'HEAL', 'Y' ], [ 'HEAL', 'MAYBE' ], [ 'TRUTH' ], [ 'LOVE' ], [ 'COURAGE' ],
  [ 'HONESTY' ], [ 'COMPASSION' ], [ 'VALOR' ], [ 'JUSTICE' ], [ 'SACRIFICE' ], [ 'HONOR' ], [ 'SPIRITUALITY' ], [ 'HUMILITY' ], [ 'PRIDE' ],
  [ 'AVATAR' ], [ 'QUEST' ], [ 'BRITANNIA' ], [ 'ANKH' ], [ 'HELP' ], [ 'HELP' ], [ 'ABYSS' ], [ 'MONDAIN' ], [ 'MINAX' ], [ 'EXODUS' ],
  [ 'VIRTUE' ], [ 'XYZZY' ], [ 'HE' ], [ 'BYE' ],
];
/** A key for one of Lord British's pages: the left arrow, which an empty word ignores if there is no page left. */
const PAGE: number = 0x08;
const VIRTUES: readonly string[] = [ 'HONESTY', 'COMPASSION', 'VALOR', 'JUSTICE', 'SACRIFICE', 'HONOR', 'SPIRITUALITY', 'HUMILITY' ];
const MANTRAS: readonly string[] = [ 'AHM', 'MU', 'RA', 'BEH', 'CAH', 'SUMMUM', 'OM', 'LUM' ];
/** The return a case's overlay was entered by BRUN with: the overlay drops two frames, the second this one. */
const RETURN: number = 0xC0FE;
/** Three cycles of SHRN's sixteen dots, each five delays of 255 x 255 loops. */
const MEDITATION_CYCLES: number = 400_000_000;
/** Polls past the meditation's dots and the flush after them, and short of j_waitkey's timeout. */
const AFTER_THE_DOTS: number = 300;
const MAP_POLLS: number = 5000;
const D = DIALOG;
const TOWNE_SEAR_X: readonly number[] = [ 0x08, 0x19, 0x1E, 0x0D, 0x1C, 0x02, 0x11, 0x1D, 0x06, 0x16, 0x16, 0x16, 0x08 ];
const TOWNE_SEAR_Y: readonly number[] = [ 0x06, 0x01, 0x1E, 0x06, 0x1E, 0x1D, 0x08, 0x1D, 0x06, 0x01, 0x03, 0x04, 0x0F ];
const TOWNE_SEAR_LOCATION: readonly number[] = [ 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x01, 0x0D, 0x02, 0x10, 0x02, 0x03, 0x04 ];
const TALK_WORDS: readonly string[] = [
  'NAME', 'LOOK', 'JOB', 'HEAL', 'JOIN', 'JOIN', 'GIVE', 'GIVE', 'Y', 'N', 'YES', 'MAYBE', 'XYZZY', '', '5', 'ORBS', 'RUNE', ...DIALOGUE_WORDS,
];
const AMOUNTS: readonly string[] = [ '0', '5', '12', '99' ];
/** Each kind of meeting, and the words said at it. */
const MEETINGS: Readonly<Record<string, readonly string[]>> = {
  anyone: TALK_WORDS,
  companion: [ 'JOIN', 'JOIN', 'NAME', 'GIVE' ],
  asks: [ 'ORBS', 'RUNE', 'JOB', 'JOB', 'LOOK', 'GIVE' ],
  beggar: [ 'GIVE', 'GIVE', 'NAME', 'GIVE' ],
  hostile: TALK_WORDS,
};
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


/**
 * A talk with Lord British: subjects asked, enough keys after each for his pages, and farewell,
 * said until it is heard. SPACE is never one of them: it empties the type-ahead buffer.
 */
function conversation(random: Random): readonly Key[] {
  const keys: Key[] = [];
  const count: number = 2 + Math.floor(random() * 6);

  for (let page: number = 0; page < 3; page++) {
    keys.push({ code: PAGE, polls: Math.floor(random() * 3) });
  }
  for (let subject: number = 0; subject < count; subject++) {
    for (const word of pick(random, SUBJECTS)) {
      keys.push(...typedWord(word, random));
    }
    for (let page: number = 0; page < 3; page++) {
      keys.push({ code: PAGE, polls: Math.floor(random() * 3) });
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
  const virtues: number = random();

  for (let virtue: number = 0; virtue < 8; virtue++) {
    if (virtues < 0.3) {
      machine.write(ROST.party_stats + virtue, pick(random, [ 0x00, 0x00, 0x50 ]));
    } else if (virtues < 0.5) {
      machine.write(ROST.party_stats + virtue, (virtue === 7) ? 0x00 : 0x50);
    } else if (virtues < 0.6) {
      machine.write(ROST.party_stats + virtue, 0x00);
    }
  }
  machine.write(ROST.threepartkey, pick(random, [ 0x00, 0x07, 0x07, 0x0F, 0x87, 0x03 ]));
  machine.write(ROST.stones, pick(random, [ 0x00, 0xFF, byte(random) ]));
  machine.write(ROST.bell_book_candle, pick(random, [ 0x07, 0x47, 0x03, byte(random) ]));
  if (random() < 0.3) {
    lateInTheQuest(machine);
  }
  machine.write(ZP_MAIN.key_buf_len, 0x00);
}


/** All HELP asks for before the key: runes, the eight partial avatarhoods, stones and items, with companions, past the first thousand moves. */
function lateInTheQuest(machine: LiftedMachine): void {
  machine.write(PRTY.move_counter, 0x01);
  machine.write(PRTY.party_size, 0x08);
  machine.write(ROST.runes, 0xFF);
  machine.write(ROST.stones, 0xFF);
  machine.write(ROST.bell_book_candle, machine.read(ROST.bell_book_candle) | ROST.items_have_all);
  for (let virtue: number = 0; virtue < 8; virtue++) {
    machine.write(ROST.party_stats + virtue, 0x00);
  }
}


/** The court, entered as a BRUN would leave it: a word under the two frames the overlay drops, to return by. */
function brunInto(machine: LiftedMachine, random: Random): void {
  court(machine, random);
  machine.cpu.pushWord(RETURN - 1);
  machine.cpu.pushWord(byte(random) | (byte(random) << 8));
}


/** Shrine `shrineNumber`, its rune held or not, the party rested or weary, its virtue at its height or not; or set for avatarhood. */
function shrine(shrineNumber: number, avatar: boolean = false): (machine: LiftedMachine, random: Random) => void {
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
    machine.write(ROST.party_stats + ROST.virtue_spirituality, pick(random, [ 0x00, 0x01, 0x02, 0x03, 0x03, 0x50, 0x97, 0x99 ]));
    machine.write(ZP_MAIN.key_buf_len, 0x00);
    if (avatar) {
      machine.write(ROST.runes, 0x80 >> shrineNumber);
      machine.write(PRTY.last_meditated, machine.read(PRTY.move_counter + 2) ^ 0x01);
      machine.write(ROST.party_stats + shrineNumber, 0x99);
    }
  };
}


/** A meditation: a virtue, mostly the shrine's, its cycles, mostly its mantra, and keys for the pages; or the three right ones. */
function meditation(shrineNumber: number, avatar: boolean = false): (random: Random) => readonly Key[] {
  return (random: Random): readonly Key[] => meditationKeys(shrineNumber, avatar, random);
}


/** Each mantra's first key waits out the dots, which throw away any key typed during them. */
function meditationKeys(shrineNumber: number, avatar: boolean, random: Random): readonly Key[] {
  const keys: Key[] = [];
  const cycles: number = avatar ? 3 : 1 + Math.floor(random() * 3);
  const right: number = avatar ? 1 : 0.7;

  keys.push(...typedWord((avatar || (random() < 0.7)) ? VIRTUES[shrineNumber] : pick(random, [ ...VIRTUES, 'HON', 'X' ]), random));
  if (random() < 0.2) {
    keys.push({ code: 0x37, polls: 0 });
  }
  keys.push({ code: 0x30 + cycles, polls: Math.floor(random() * 3) });
  for (let cycle: number = 0; cycle < cycles; cycle++) {
    const mantra: Key[] = [ ...typedWord((random() < right) ? MANTRAS[shrineNumber] : pick(random, MANTRAS), random) ];

    mantra[0] = { code: mantra[0].code, polls: AFTER_THE_DOTS };
    keys.push(...mantra);
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


function loaded(name: string, setup: (machine: LiftedMachine, random: Random) => void, disk: UltimaDiskName = 'britannia'): (machine: LiftedMachine, random: Random) => void {
  return (machine: LiftedMachine, random: Random): void => {
    setup(machine, random);
    machine.bload(disk, name);
  };
}


/** At the spot of the towne SEAR's `item` in its place, or of none; for the mystic arms, an Avatar or nearly. */
function searchingTowne(item: number | null): (machine: LiftedMachine, random: Random) => void {
  return (machine: LiftedMachine, random: Random): void => {
    world(machine, random);
    party(machine, random);
    inventory(machine, random);
    machine.write(PRTY.game_mode, PRTY.mode_towne);
    machine.write(ZP_MAIN.currdisk_drive1, DISKS.disk_towne);
    machine.insertDisk(1, 'towne');
    machine.write(ROST.runes, pick(random, [ 0x00, 0xFF, byte(random) ]));
    machine.write(ROST.armour_mystic, pick(random, [ 0x00, 0x00, 0x08 ]));
    machine.write(ROST.weapon_mystic, pick(random, [ 0x00, 0x00, 0x08 ]));
    machine.write(ZP_MAIN.key_buf_len, 0x00);
    if (random() < 0.5) {
      for (let virtue: number = 0; virtue < 8; virtue++) {
        machine.write(ROST.party_stats + virtue, 0x00);
      }
      if (random() < 0.5) {
        machine.write(ROST.party_stats + pick(random, [ ROST.virtue_humility, Math.floor(random() * 8) ]), 0x01);
      }
    }
    if (item != null) {
      machine.write(PRTY.player_xpos, TOWNE_SEAR_X[item]);
      machine.write(PRTY.player_ypos, (random() < 0.9) ? TOWNE_SEAR_Y[item] : byte(random));
      machine.write(PRTY.current_location, (random() < 0.9) ? TOWNE_SEAR_LOCATION[item] : byte(random) & 0x1F);
    }
  };
}


/**
 * The telescope's letter, A to P or not, then a key for the map it shows, held back past the
 * loads: SUBS would take a key typed during them into its type-ahead buffer, which TMAP never reads.
 */
function telescope(random: Random): readonly Key[] {
  return [
    { code: pick(random, [ 0x41, 0x42, 0x48, 0x50, 0x51, 0x40, 0x31 ]), polls: Math.floor(random() * 3) },
    { code: pick(random, [ 0x0D, 0x41, 0x1B ]), polls: MAP_POLLS + Math.floor(random() * 5) },
  ];
}


/** Using in a towne: townsfolk about, Lord British among them, or in a fight. */
function usingInTowne(machine: LiftedMachine, random: Random): void {
  using(machine, random);
  machine.write(PRTY.game_mode, pick(random, [ PRTY.mode_towne, PRTY.mode_towne, 0x80, 0x82 ]));
  for (let slot: number = 0; slot <= MAP_OBJECTS.object_max; slot++) {
    machine.write(MAP_OBJECTS.object_tile_type + slot, pick(random, [ 0x00, TILES.tile_lord_british, TILES.tile_guard, 0x50, byte(random) ]));
  }
}


/** Who is met: anyone, a companion in their towne, one who asks a question, a beggar, or one quick to turn away or fight, the first roll rigged to the margin between. */
type Meeting = 'anyone' | 'companion' | 'asks' | 'beggar' | 'hostile';


/**
 * A townsperson's record, the party asked to join or give or answer, a beggar or not, the towne
 * one a companion may come from, and the person's slot TALK fights from.
 */
function meeting(kind: Meeting): (machine: LiftedMachine, random: Random) => void {
  return (machine: LiftedMachine, random: Random): void => {
    world(machine, random);
    party(machine, random);
    dialogue(random).forEach((value: number, index: number): void => machine.write(D.dialog_strings + index, value));
    machine.write(PRTY.game_mode, PRTY.mode_towne);
    machine.write(PRTY.current_location, (kind === 'companion') ? pick(random, [ 0x05, 0x06, 0x09, 0x0B, 0x0C, 0x0C, 0x0D ]) : pick(random, [ 0x01, 0x05, 0x06, 0x0A, 0x0C, 0x0D, 0x10 ]));
    machine.write(ZP_MAIN.diskio_sector, (kind === 'companion') ? pick(random, [ 0x00, 0x00, 0x00, 0x01 ]) : pick(random, [ 0x00, 0x01, 0x07 ]));
    const person: number = Math.floor(random() * (MAP_OBJECTS.object_max + 1));

    machine.write(0xEA, person);
    machine.write(MAP_OBJECTS.object_tile_type + person, (kind === 'beggar') ? TILES.tile_beggar : pick(random, [ TILES.tile_beggar, TILES.tile_guard, 0x50, 0x54 ]));
    for (let player: number = 0; player < 8; player++) {
      machine.write(ROST.player_stats + (player * 0x20) + ROST.player_class_index, pick(random, [ player, Math.floor(random() * 8) ]));
    }
    if (random() < 0.3) {
      machine.write(ROST.player_stats + ROST.player_class_index, (machine.read(PRTY.current_location) - 5) & 0xFF);
    }
    machine.write(PRTY.party_size, pick(random, [ 0x01, 0x02, 0x05, 0x07 ]));
    machine.write(ROST.player_stats + ROST.player_max_hp_hi, machine.read(PRTY.party_size) + pick(random, [ 0x00, 0x01, 0x01, 0x01, 0x02 ]));
    machine.write(ROST.gold_hi, pick(random, [ 0x00, 0x00, 0x01, 0x99 ]));
    machine.write(ROST.gold_lo, pick(random, [ 0x00, 0x05, 0x12, 0x99, bcd(random) ]));
    machine.write(PRTY.move_counter + 3, byte(random));
    machine.write(PRTY.last_humility_check, (random() < 0.3) ? (machine.read(PRTY.move_counter + 3) & 0xF0) : byte(random));
    if (kind === 'companion') {
      machine.write(ROST.party_stats + machine.read(PRTY.current_location) - 5, pick(random, [ 0x00, 0x20, 0x40, 0x99 ]));
    } else if (kind === 'asks') {
      [ ...'ORBSRUNE' ].forEach((character: string, index: number): void => machine.write(D.dialog_keyword_1 + index, character.charCodeAt(0)));
      machine.write(D.dialog_question_trigger, pick(random, [ 0x03, 0x05, 0x06 ]));
      machine.write(D.dialog_humility, pick(random, [ 0x00, 0x01, 0x01 ]));
      machine.write(ROST.party_stats + ROST.virtue_humility, pick(random, [ 0x00, 0x03, 0x03, 0x50, 0x95 ]));
    }
    machine.write(D.dialog_turns_away_probability, (kind === 'hostile') ? pick(random, [ 0x80, 0xC0, 0xFF ]) : pick(random, [ 0x00, 0x00, 0x00, 0x10 ]));
    if (kind === 'hostile') {
      const margin: number = machine.read(D.dialog_turns_away_probability) - pick(random, [ 0x3F, 0x40, 0x41, 0x80 ]);

      rigRand(machine, random, (value: number): boolean => value === margin);
    }
    machine.write(ZP_MAIN.key_buf_len, 0x00);
  };
}


/**
 * What is said to a townsperson: interests from `words`, answers, an amount after each GIVE (a
 * beggar's j_getnumber waits for a digit), and farewell, said until it is heard.
 */
function talk(words: readonly string[]): (random: Random) => readonly Key[] {
  return (random: Random): readonly Key[] => {
    const keys: Key[] = [];

    for (let interest: number = 2 + Math.floor(random() * 6); interest > 0; interest--) {
      const word: string = pick(random, words);

      keys.push(...typedWord(word, random));
      if (word === 'GIVE') {
        keys.push(...typedWord(pick(random, AMOUNTS), random));
      }
      if (random() < 0.3) {
        keys.push({ code: 0x0D, polls: 0 }, ...typedWord(pick(random, [ 'Y', 'N', 'NO', 'MAYBE' ]), random));
      }
    }
    for (let bye: number = 0; bye < 16; bye++) {
      keys.push(...typedWord(pick(random, [ 'BYE', 'N', 'Y' ]), random));
    }

    return keys;
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
    testCase: { ult4: true, screen: true, stops: STOPS, keys: conversation, setup: loaded('LORD', court) },
  },
  lord_after_help: {
    module: LORD_MODULE,
    modules: [ LORD_MODULE, HELP_MODULE ],
    entry: OVERLAY_ENTRY,
    testCase: { ult4: true, screen: true, stops: STOPS, keys: conversation, setup: loaded('LORD', brunInto) },
  },
  help: {
    module: HELP_MODULE,
    modules: [ LORD_MODULE, HELP_MODULE ],
    entry: OVERLAY_ENTRY,
    testCase: { ult4: true, screen: true, stops: STOPS, keys: conversation,
      setup: loaded('HELP', brunInto) },
  },
  ...Object.fromEntries(VIRTUES.map((_: string, shrineNumber: number): [ string, IOverlayCase ] => [ `shrn_${ shrineNumber }`, {
    module: SHRN_MODULE,
    entry: OVERLAY_ENTRY,
    testCase: { ult4: true, screen: true, stops: STOPS, cycles: MEDITATION_CYCLES, keys: meditation(shrineNumber), setup: loaded('SHRN', shrine(shrineNumber)) },
  } ])),
  ...Object.fromEntries(VIRTUES.map((_: string, shrineNumber: number): [ string, IOverlayCase ] => [ `shrn_avatar_${ shrineNumber }`, {
    module: SHRN_MODULE,
    entry: OVERLAY_ENTRY,
    testCase: {
      ult4: true, screen: true, stops: STOPS, cycles: MEDITATION_CYCLES, keys: meditation(shrineNumber, true), setup: loaded('SHRN', shrine(shrineNumber, true)),
    },
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
  towne_sear: { module: TOWNE_SEAR_MODULE, entry: OVERLAY_ENTRY, testCase: { ult4: true, stops: STOPS, keys: telescope, setup: loaded('SEAR', searchingTowne(null), 'towne') } },
  ...Object.fromEntries(TOWNE_SEAR_X.map((_: number, item: number): [ string, IOverlayCase ] => [ `towne_sear_${ item }`, {
    module: TOWNE_SEAR_MODULE,
    modules: [ TOWNE_SEAR_MODULE, TOWNE_TMAP_MODULE ],
    entry: OVERLAY_ENTRY,
    testCase: { ult4: true, stops: STOPS, keys: telescope, setup: loaded('SEAR', searchingTowne(item), 'towne') },
  } ])),
  towne_use: { module: TOWNE_USE_MODULE, entry: OVERLAY_ENTRY, testCase: { ult4: true, stops: STOPS, keys: typed(NOT_ITEMS), setup: loaded('USE', usingInTowne, 'towne') } },
  ...Object.fromEntries(ITEMS.map((item: string): [ string, IOverlayCase ] => [ `towne_use_${ item.toLowerCase() }`, {
    module: TOWNE_USE_MODULE,
    entry: OVERLAY_ENTRY,
    testCase: { ult4: true, stops: STOPS, keys: typed([ item ]), setup: loaded('USE', usingInTowne, 'towne') },
  } ])),
  ...Object.fromEntries(Object.entries(MEETINGS).map(([ kind, words ]: [ string, readonly string[] ]): [ string, IOverlayCase ] => [ `talk_${ kind }`, {
    module: TALK_MODULE,
    entry: OVERLAY_ENTRY,
    testCase: { ult4: true, screen: true, stops: STOPS, keys: talk(words), setup: loaded('TALK', meeting(kind as Meeting), 'towne') },
  } ])),
  towne_tmap: {
    module: TOWNE_TMAP_MODULE,
    entry: VIEW_MAP.j_viewmap,
    testCase: { ult4: true, stops: STOPS, key: (random: Random): Key => ({ code: 0x41, polls: Math.floor(random() * 5) }), setup: loaded('TMAP', (machine: LiftedMachine, random: Random): void => {
      viewing(machine, random);
      machine.write(PRTY.current_location, pick(random, [ 0x00, 0x05 ]));
      machine.write(PRTY.game_mode, pick(random, [ PRTY.mode_suspended, PRTY.mode_towne ]));
    }, 'towne') },
  },
  tmap: {
    module: TMAP_MODULE,
    entry: VIEW_MAP.j_viewmap,
    testCase: { ult4: true, stops: STOPS, key: (random: Random): Key => ({ code: 0x20, polls: Math.floor(random() * 5) }), setup: loaded('TMAP', viewing) },
  },
};
