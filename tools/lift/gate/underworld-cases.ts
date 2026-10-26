// The differential cases for the underworld's overlays: the gem's map of the level, Search on an
// orb, a fountain, an altar or nothing, and Use of each item, the stones on an altar room's centre
// and the Abyss's altars, and words that are colours, virtues or nothing; each in a dungeon set up
// as for ULT4's dungeon cases, with the party's belongings at random.

import type { LiftedMachine } from '../../../src/app/lifted-runtime/lifted-machine';
import { OVERLAY_ENTRY } from '../../../src/app/port/program/overlay';
import { UNDERWORLD_SEAR_MODULE } from '../../../src/app/port/program/underworld/sear';
import { UNDERWORLD_TMAP_MODULE } from '../../../src/app/port/program/underworld/tmap';
import { UNDERWORLD_USE_MODULE } from '../../../src/app/port/program/underworld/use';
import { DUNGEON, MAP_OBJECTS, PRTY, ROST, VIEW_MAP, ZP_MAIN } from '../../../src/app/state/symbols';
import { byte } from './differential';
import type { Random } from './differential';
import { dungeonTile, inDungeon } from './dungeon-cases';
import { inventory, loaded, party, typedWord } from './overlay-cases';
import type { IOverlayCase, Key } from './overlay-cases';
import { STOPS, pick } from './ult4-cases';

const D = DUNGEON;
const O = MAP_OBJECTS;
const COLORS: readonly string[] = [ 'BLUE', 'YELLOW', 'RED', 'GREEN', 'ORANGE', 'PURPLE', 'WHITE', 'BLACK' ];
const VIRTUES: readonly string[] = [ 'HONESTY', 'COMPASSION', 'VALOR', 'JUSTICE', 'SACRIFICE', 'HONOR', 'SPIRITUALITY', 'HUMILITY' ];
const ITEMS: readonly string[] = [ 'STONE', 'BELL', 'BOOK', 'CANDLE', 'KEY', 'HORN', 'WHEEL', 'SKULL' ];
const OTHER_WORDS: readonly string[] = [ ...COLORS, ...VIRTUES, 'X', '', 'SKUX' ];
const ABYSS: number = 0x18;


/** A dungeon, the party's belongings and health at random, and SEAR's and USE's own state. */
function belowground(machine: LiftedMachine, random: Random): void {
  inDungeon(machine, random);
  party(machine, random);
  inventory(machine, random);
  machine.write(ROST.stones, pick(random, [ 0x00, 0xFF, byte(random), byte(random) ]));
  machine.write(ROST.threepartkey, pick(random, [ 0x00, 0x01, 0x07, byte(random) & 0x07 ]));
  machine.write(ROST.skull, pick(random, [ 0x00, 0x01, 0x01, 0xFF ]));
  machine.write(ZP_MAIN.curr_player, 1 + Math.floor(random() * machine.read(PRTY.party_size)));
  machine.write(ZP_MAIN.sfx_volume, pick(random, [ 0x00, 0xFF ]));
  machine.write(ZP_MAIN.key_buf_len, 0x00);
}


/** On a tile of `kinds`, its low nibble at random. */
function searching(kinds: readonly number[]): (machine: LiftedMachine, random: Random) => void {
  return (machine: LiftedMachine, random: Random): void => {
    belowground(machine, random);
    machine.write(ZP_MAIN.tile_under_player, pick(random, kinds) | pick(random, [ 0x00, 0x01, 0x02, 0x03, 0x04, Math.floor(random() * 16) ]));
  };
}


/** The colours each altar room's principle takes: truth's, love's and courage's. */
const PRINCIPLE_COLORS: readonly (readonly string[])[] = [
  [ 'BLUE', 'GREEN', 'PURPLE', 'WHITE' ],
  [ 'YELLOW', 'GREEN', 'ORANGE', 'WHITE' ],
  [ 'RED', 'ORANGE', 'PURPLE', 'WHITE' ],
];


/** In the fight in the altar room of `principle`, the player on its centre more often than not, most stones held. */
function inAltarRoom(principle: number): (machine: LiftedMachine, random: Random) => void {
  return (machine: LiftedMachine, random: Random): void => {
    belowground(machine, random);
    machine.write(PRTY.game_mode, (random() < 0.9) ? PRTY.mode_combat_dng_room : PRTY.mode_dungeon);
    machine.write(PRTY.altar_room_principle, (random() < 0.9) ? principle : PRTY.principle_none);
    for (let player: number = 0; player < 8; player++) {
      machine.write(O.combat_player_xpos + player, (random() < 0.9) ? 0x05 : 0x04);
      machine.write(O.combat_player_ypos + player, (random() < 0.9) ? 0x05 : 0x06);
    }
    machine.write(ROST.stones, pick(random, [ 0xFF, 0xFF, 0xFF, 0x96, 0x5A, 0x2E, byte(random) ]));
    machine.write(ROST.threepartkey, pick(random, [ 0x00, 0x00, 0x07, byte(random) & 0x07 ]));
  };
}


/** The principle's four colours in any order, or now and then any. */
function placing(principle: number): (random: Random) => readonly Key[] {
  return (random: Random): readonly Key[] => {
    const colors: string[] = [ ...PRINCIPLE_COLORS[principle] ].sort((): number => random() - 0.5);
    const placed: string[] = colors.map((color: string): string => (random() < 0.9) ? color : pick(random, [ ...COLORS, 'X' ]));

    return [ ...typedWord('STONE', random), ...placed.flatMap((color: string): readonly Key[] => typedWord(color, random)) ];
  };
}


/** On level `level` of the Abyss, on its altar more often than not, out of a fight mostly, most stones held. */
function atAbyssAltar(level: number): (machine: LiftedMachine, random: Random) => void {
  return (machine: LiftedMachine, random: Random): void => {
    belowground(machine, random);
    machine.write(PRTY.current_location, ABYSS);
    machine.write(PRTY.game_mode, (random() < 0.85) ? PRTY.mode_dungeon : PRTY.mode_combat_dng_room);
    machine.write(PRTY.dungeon_level, level);
    machine.write(ZP_MAIN.tile_under_player, (random() < 0.85) ? D.dng_tile_altar : dungeonTile(random));
    machine.write(ROST.stones, pick(random, [ 0xFF, 0xFF, 0xFF, byte(random) ]));
  };
}


/** The level's virtue and stone, mostly; on the last, END is BRUN only now and then. */
function answering(level: number): (random: Random) => readonly Key[] {
  return (random: Random): readonly Key[] => {
    const right: number = (level === 7) ? 0.3 : 0.8;
    const virtue: string = (random() < right) ? VIRTUES[level] : pick(random, [ ...VIRTUES, 'X' ]);
    const color: string = (random() < right) ? COLORS[level] : pick(random, [ ...COLORS, 'X' ]);

    return [ ...typedWord('STONE', random), ...typedWord(virtue, random), ...typedWord(color, random) ];
  };
}


/** At an altar of a dungeon with a stone, its stone not found yet more often than not. */
function atAltar(machine: LiftedMachine, random: Random): void {
  searching([ D.dng_tile_altar ])(machine, random);
  machine.write(PRTY.current_location, pick(random, [ 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, ABYSS ]));
  machine.write(ROST.stones, pick(random, [ 0x00, 0x00, byte(random) ]));
}


function words(...lists: readonly (readonly string[])[]): (random: Random) => readonly Key[] {
  return (random: Random): readonly Key[] => lists.flatMap((list: readonly string[]): readonly Key[] => typedWord(pick(random, list), random));
}


function underworldCase(module: typeof UNDERWORLD_USE_MODULE, keys: (random: Random) => readonly Key[], setup: (machine: LiftedMachine, random: Random) => void): IOverlayCase {
  return { module, entry: module === UNDERWORLD_TMAP_MODULE ? VIEW_MAP.j_viewmap : OVERLAY_ENTRY, testCase: { ult4: true, screen: true, stops: STOPS, keys, setup: loaded(module.name, setup, 'underworld') } };
}


/** A member of the party, or none, for getplayernum. */
function who(random: Random): readonly Key[] {
  return [ { code: pick(random, [ 0x31, 0x31, 0x32, 0x33, 0x35, 0x38, 0x30, 0x39 ]), polls: Math.floor(random() * 3) } ];
}


export const UNDERWORLD_CASES: Readonly<Record<string, IOverlayCase>> = {
  underworld_tmap: underworldCase(UNDERWORLD_TMAP_MODULE, (random: Random): readonly Key[] => [ { code: 0x41, polls: Math.floor(random() * 5) } ], belowground),
  underworld_sear_orb: underworldCase(UNDERWORLD_SEAR_MODULE, who, searching([ D.dng_tile_orb ])),
  underworld_sear_fountain: underworldCase(UNDERWORLD_SEAR_MODULE, who, searching([ D.dng_tile_fountain ])),
  underworld_sear_altar: underworldCase(UNDERWORLD_SEAR_MODULE, who, atAltar),
  underworld_sear: underworldCase(UNDERWORLD_SEAR_MODULE, who, searching([ 0x00, 0x10, 0x40, 0x80, 0xA0, D.dng_tile_wall ])),
  underworld_use: underworldCase(UNDERWORLD_USE_MODULE, words([ ...ITEMS, ...OTHER_WORDS ]), belowground),
  ...Object.fromEntries([ 'truth', 'love', 'courage' ].map((name: string, principle: number): [ string, IOverlayCase ] =>
    [ `underworld_use_${ name }`, underworldCase(UNDERWORLD_USE_MODULE, placing(principle), inAltarRoom(principle)) ])),
  ...Object.fromEntries(VIRTUES.map((_: string, level: number): [ string, IOverlayCase ] =>
    [ `underworld_use_abyss_${ level }`, underworldCase(UNDERWORLD_USE_MODULE, answering(level), atAbyssAltar(level)) ])),
  underworld_use_skull: underworldCase(UNDERWORLD_USE_MODULE, words([ 'SKULL' ]), (machine: LiftedMachine, random: Random): void => {
    belowground(machine, random);
    machine.write(PRTY.current_location, pick(random, [ 0x11, 0x14, 0x17, ABYSS ]));
    machine.write(PRTY.game_mode, pick(random, [ PRTY.mode_dungeon, PRTY.mode_dungeon, PRTY.mode_combat_dng_room ]));
  }),
};
