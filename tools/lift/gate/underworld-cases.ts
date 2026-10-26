// The differential cases for the underworld's overlays: the gem's map of the level, Search on an
// orb, a fountain, an altar or nothing, and Use of each item, the stones on an altar room's centre
// and the Abyss's altars, and words that are colours, virtues or nothing; each in a dungeon set up
// as for ULT4's dungeon cases, with the party's belongings at random.

import type { LiftedMachine } from '../../../src/app/lifted-runtime/lifted-machine';
import { OVERLAY_ENTRY } from '../../../src/app/port/program/overlay';
import { UNDERWORLD_DNGD_MODULE } from '../../../src/app/port/program/underworld/dngd';
import { END_MODULE } from '../../../src/app/port/program/underworld/end';
import { END_ENTRIES } from '../../../src/app/port/program/underworld/end-data';
import { DNGD_ENTRIES, DNGD_VARIABLES } from '../../../src/app/port/program/underworld/dngd-data';
import { UNDERWORLD_SEAR_MODULE } from '../../../src/app/port/program/underworld/sear';
import { UNDERWORLD_TMAP_MODULE } from '../../../src/app/port/program/underworld/tmap';
import { UNDERWORLD_USE_MODULE } from '../../../src/app/port/program/underworld/use';
import { DISKS, DUNGEON, JUMP_OVERLAY, MAP_OBJECTS, PRTY, ROST, VIEW_MAP, ZP_MAIN } from '../../../src/app/state/symbols';
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


/** The stones of each principle's colours, and its part of the key. */
const PRINCIPLE_STONES: readonly number[] = [ 0x96, 0x5A, 0x2E ];
const PRINCIPLE_KEYPARTS: readonly number[] = [ 0x04, 0x02, 0x01 ];


/** In the fight in the altar room of `principle`, outside the Abyss, the player on its centre more often than not, most stones held. */
function inAltarRoom(principle: number): (machine: LiftedMachine, random: Random) => void {
  return (machine: LiftedMachine, random: Random): void => {
    belowground(machine, random);
    machine.write(PRTY.current_location, PRTY.loc_dng_first + Math.floor(random() * 7));
    machine.write(PRTY.game_mode, (random() < 0.9) ? PRTY.mode_combat_dng_room : PRTY.mode_dungeon);
    machine.write(PRTY.altar_room_principle, (random() < 0.95) ? principle : PRTY.principle_none);
    for (let player: number = 0; player < 8; player++) {
      machine.write(O.combat_player_xpos + player, (random() < 0.9) ? 0x05 : 0x04);
      machine.write(O.combat_player_ypos + player, (random() < 0.9) ? 0x05 : 0x06);
    }
    machine.write(ROST.stones, pick(random, [ 0xFF, 0xFF, 0xFF, 0xFF, PRINCIPLE_STONES[principle], PRINCIPLE_STONES[principle], byte(random) ]));
    machine.write(ROST.threepartkey, pick(random, [ 0x00, 0x00, 0x07 ^ PRINCIPLE_KEYPARTS[principle], 0x07, byte(random) & 0x07 ]));
  };
}


/** The principle's four colours in any order, or now and then one again or any. */
function placing(principle: number): (random: Random) => readonly Key[] {
  return (random: Random): readonly Key[] => {
    const colors: string[] = [ ...PRINCIPLE_COLORS[principle] ].sort((): number => random() - 0.5);
    const placed: string[] = colors.map((color: string, index: number): string => {
      const roll: number = random();

      return (roll < 0.85) ? color : ((roll < 0.93) && (index > 0)) ? colors[index - 1] : pick(random, [ ...COLORS, 'X' ]);
    });

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
  machine.write(PRTY.current_location, pick(random, [ 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x17, 0x17, ABYSS ]));
  machine.write(ROST.stones, pick(random, [ 0x00, 0x00, byte(random) ]));
}


/** At a fountain, of `kind` or any, the party poisoned more often than not. */
function drinking(kind: number | null): (machine: LiftedMachine, random: Random) => void {
  return (machine: LiftedMachine, random: Random): void => {
    searching([ D.dng_tile_fountain ])(machine, random);
    if (kind != null) {
      machine.write(ZP_MAIN.tile_under_player, D.dng_tile_fountain | kind);
    }
    for (let index: number = 0; index < 8; index++) {
      if (random() < 0.6) {
        machine.write(ROST.player_stats + (index * 0x20) + ROST.player_status, ROST.status_Poison);
      }
    }
  };
}


/** What DNGD draws at each distance ahead, by its high nibble: ladders, holes, a field of each kind, doors, rooms and walls, and halls. */
const VIEW_TILES: readonly number[] = [
  0x00, 0x00, 0x10, 0x10, 0x20, 0x20, 0x30, 0x40, 0x50, 0x60, 0x70, 0x80, 0x80, 0x88, 0x90, 0xA0, 0xA1, 0xA2, 0xA3, 0xB0,
  D.dng_tile_door, D.dng_tile_door, D.dng_tile_room, D.dng_tile_secret_door, D.dng_tile_wall, D.dng_tile_wall,
];
/** The squares ahead for each part of the view: the ladders and holes, the doors (often) and walls, the fields, and the monsters and items. */
const LADDERS: readonly number[] = [ 0x10, 0x20, 0x30, 0x50, 0x60 ];
const DOORS: readonly number[] = [ D.dng_tile_door, D.dng_tile_door, D.dng_tile_door, D.dng_tile_room, D.dng_tile_secret_door, D.dng_tile_wall, 0xB0, 0x40, 0x70 ];
const FIELDS: readonly number[] = [ 0xA0, 0xA1, 0xA2, 0xA3 ];
/** What may hide the squares beyond it from the view: a field, a door and what is above it, and an altar, which does not. */
const HIDING: readonly number[] = [ 0xA0, 0xA2, 0xB0, D.dng_tile_door, D.dng_tile_door, D.dng_tile_room, D.dng_tile_wall ];
const THINGS: readonly number[] = [ 0x01, 0x05, 0x0A, 0x0F, 0x13, 0x47, 0x72, 0x40, 0x70, 0x80, 0x81, 0x89, 0x90, 0xB0, D.dng_tile_door, D.dng_tile_room ];
/** Traps of every number, the one that shows none among them, those either side of 8 often. */
const TRAPS: readonly number[] = [ ...Array.from({ length: 16 }, (_: unknown, index: number): number => D.dng_tile_trap + index), 0x84, 0x87, 0x88, 0x8B ];
const LEVEL_SIZE: number = 0x40;
const DUNGEON_MAP: number = 0xE800;
const DIRECTION_X: readonly number[] = [ 0, 1, 0, -1 ];
const DIRECTION_Y: readonly number[] = [ -1, 0, 1, 0 ];
/** DNGD's zero page: the tiles three ahead and behind, as get_neighbor_tiles leaves them. */
const TILES_AHEAD: readonly number[] = [ 0xC9, 0xCA, 0xCB ];
const TILE_BEHIND: number = 0xCC;


/** A tile of the view's, now and then with a monster's number on it. */
function viewTile(random: Random): number {
  const tile: number = pick(random, VIEW_TILES);

  return (random() < 0.3) ? tile | (1 + Math.floor(random() * 15)) : tile;
}


/** The map's cell `steps` ahead of the party, behind for -1. */
function ahead(machine: LiftedMachine, steps: number): number {
  const direction: number = machine.read(PRTY.dng_direction);
  const x: number = (machine.read(PRTY.player_xpos) + (steps * DIRECTION_X[direction])) & 0x07;
  const y: number = (machine.read(PRTY.player_ypos) + (steps * DIRECTION_Y[direction])) & 0x07;

  return DUNGEON_MAP + (machine.read(PRTY.dungeon_level) * LEVEL_SIZE) + (y * 8) + x;
}


/** A dungeon whose level is drawn from the view's tiles, the party's square and those ahead often empty or of `near`, mostly lit, and the tiles about the party as get_neighbor_tiles reads them. */
function viewing(machine: LiftedMachine, random: Random, near: readonly number[] | null): void {
  belowground(machine, random);
  for (let index: number = 0; index < LEVEL_SIZE; index++) {
    machine.write(DUNGEON_MAP + (machine.read(PRTY.dungeon_level) * LEVEL_SIZE) + index, viewTile(random));
  }
  for (let steps: number = 0; steps <= TILES_AHEAD.length; steps++) {
    if (random() < 0.4) {
      machine.write(ahead(machine, steps), 0x00);
    } else if (near != null) {
      machine.write(ahead(machine, steps), pick(random, near));
    }
  }
  machine.write(PRTY.light_duration, pick(random, [ 0x00, 0x01, 0x50, 0xFF, byte(random) ]));
  TILES_AHEAD.forEach((tile: number, index: number): void => machine.write(tile, machine.read(ahead(machine, index + 1))));
  machine.write(TILE_BEHIND, machine.read(ahead(machine, -1)));
  machine.write(ZP_MAIN.tile_under_player, machine.read(ahead(machine, 0)));
}


/** How a case draws DNGD's state: the view last drawn from here with a tile ahead changed, or the generator set to show a trap. */
interface IDrawn {
  readonly vary?: boolean;
  readonly trap?: boolean;
}


/** DNGD's generator, three bytes whose first roll, with the carry set (as after `cmp #dng_tile_trap`), is a multiple of 64, or of 32 only. */
function trapShows(random: Random): readonly number[] {
  const r0: number = byte(random);
  const r2: number = byte(random);
  const sum: number = r0 + r2 + 1;
  const roll: number = pick(random, [ 0x00, 0x00, 0x20 ]);
  const wanted: number = ((roll + 0x100 - r0 - (sum > 0xFF ? 1 : 0)) & 0x3F) | (byte(random) & 0xC0);

  return [ r0, (sum & 0xFF) ^ wanted, r2 ];
}


/** DNGD loaded, its generator at random, and the view last drawn from here, as it would be if nothing had changed, more often than not. */
function drawnBefore(machine: LiftedMachine, random: Random, drawn: IDrawn): void {
  const generator: readonly number[] = ((drawn.trap === true) && (random() < 0.9)) ? trapShows(random) : [ byte(random), byte(random), byte(random) ];

  machine.bload('underworld', UNDERWORLD_DNGD_MODULE.name);
  generator.forEach((value: number, index: number): void => machine.write(DNGD_VARIABLES.rand_data + index, value));
  if ((drawn.vary === true) || (random() < 0.6)) {
    const now: readonly number[] = [
      machine.read(PRTY.dungeon_level), machine.read(PRTY.player_xpos), machine.read(PRTY.player_ypos), machine.read(PRTY.dng_direction),
      ...[ -1, 0, 1, 2, 3 ].map((steps: number): number => machine.read(ahead(machine, steps))),
    ];

    now.forEach((value: number, index: number): void => {
      machine.write(DNGD_VARIABLES.last_drawn_dungeon_level + index, ((drawn.vary !== true) && (random() < 0.04)) ? byte(random) : value);
    });
    if (drawn.vary === true) {
      machine.write(DNGD_VARIABLES.last_drawn_forward_1 + Math.floor(random() * 3), viewTile(random));
    }
  }
}


function viewCase(entry: number, near: readonly number[] | null = null, drawn: IDrawn = {}): IOverlayCase {
  return { module: UNDERWORLD_DNGD_MODULE, entry, testCase: { ult4: true, screen: true, stops: STOPS, setup: (machine: LiftedMachine, random: Random): void => {
    viewing(machine, random, near);
    drawnBefore(machine, random, drawn);
  } } };
}


/** What the voice asks for in the Codex's chamber: the eight virtues and the three principles, then infinity. */
const CODEX_ANSWERS: readonly string[] = [ ...VIRTUES, 'TRUTH', 'LOVE', 'COURAGE' ];
const END_STOPS: readonly number[] = [ ...STOPS, END_ENTRIES.halt, JUMP_OVERLAY.j_game_init ];
const END_CYCLES: number = 400_000_000;
const WAITING: number = 10;


/** At the Abyss's last altar, END run by USE: the key of three parts, eight in the party and every virtue at its height, each more often than not as `ready` says, or one virtue short of it (honesty's, the last it checks, often), and the drives as they may be. */
function inTheChamber(ready: number, shortOf: boolean = false): (machine: LiftedMachine, random: Random) => void {
  return (machine: LiftedMachine, random: Random): void => {
    belowground(machine, random);
    machine.write(PRTY.current_location, ABYSS);
    machine.write(PRTY.dungeon_level, 0x07);
    machine.write(ROST.threepartkey, (random() < ready) ? ROST.key3_have_all : byte(random) & 0x07);
    machine.write(PRTY.party_size, (random() < ready) ? 0x08 : 1 + Math.floor(random() * 8));
    for (let virtue: number = 0; virtue < ROST.virtue_last; virtue++) {
      machine.write(ROST.party_stats + virtue, (random() < ready) ? 0x00 : pick(random, [ 0x00, 0x01, 0x99 ]));
    }
    if (shortOf) {
      machine.write(ROST.party_stats + pick(random, [ 0x00, 0x00, Math.floor(random() * ROST.virtue_last) ]), pick(random, [ 0x01, 0x99 ]));
    }
    machine.write(ZP_MAIN.numdrives, pick(random, [ 0x01, 0x02 ]));
    machine.write(ZP_MAIN.currdisk_drive1, pick(random, [ DISKS.disk_program, DISKS.disk_dungeon ]));
    machine.write(ZP_MAIN.currdisk_drive2, pick(random, [ DISKS.disk_britannia, DISKS.disk_dungeon ]));
    for (let digit: number = 0; digit < 4; digit++) {
      machine.write(PRTY.move_counter + digit, pick(random, [ 0x00, 0x00, byte(random) & 0x99 ]));
    }
  };
}


/** A word typed once the game waits for it: as the oracle's scenarios do, ten polls on, since printing takes a key already waiting. */
function answered(word: string, random: Random): readonly Key[] {
  const [ first, ...rest ] = typedWord(word, random);

  return [ { code: first.code, polls: WAITING }, ...rest ];
}


/** The word of passage, mostly right; each of the `asked` answers right as `right` says; then the last, and a key for every page and prompt. */
function inTheVoice(asked: number, right: number): (random: Random) => readonly Key[] {
  return (random: Random): readonly Key[] => [
    ...answered((random() < 0.9) ? pick(random, [ 'VERAMOCOR', 'VERAMOCOR', 'VERAMOCOR X' ]) : pick(random, [ 'VERAMOCAR', 'VERA', 'VERAMO COR', 'X' ]), random),
    ...CODEX_ANSWERS.slice(0, asked).flatMap((answer: string): readonly Key[] => answered((random() < right) ? answer : pick(random, [ ...CODEX_ANSWERS, 'SELF', 'HON ESTY' ]), random)),
    { code: 0x20, polls: WAITING },
    ...answered((random() < right) ? 'INFINITY' : pick(random, [ 'SELF', 'INFINIT', 'INF' ]), random),
    ...Array.from({ length: 12 }, (): Key => ({ code: pick(random, [ 0x20, 0x20, 0x1B ]), polls: WAITING })),
    ...Array.from({ length: 4 }, (): Key => ({ code: 0x1B, polls: WAITING })),
  ];
}


function endCase(ready: number, asked: number, right: number, shortOf: boolean = false): IOverlayCase {
  return { module: END_MODULE, entry: OVERLAY_ENTRY, testCase: {
    ult4: true, screen: true, stops: END_STOPS, cycles: END_CYCLES, keys: inTheVoice(asked, right), setup: loaded(END_MODULE.name, inTheChamber(ready, shortOf), 'underworld'),
  } };
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
  end_passage: endCase(0.6, 0, 0),
  end_not_avatar: endCase(1, 0, 0, true),
  end_virtues: endCase(1, 8, 0.9),
  end_principles: endCase(1, CODEX_ANSWERS.length, 0.95),
  end_codex: endCase(1, CODEX_ANSWERS.length, 1),
  dngd_check_update: viewCase(DNGD_ENTRIES.dungeon_check_update),
  dngd_draw_items_monsters: viewCase(DNGD_ENTRIES.draw_items_monsters),
  dngd_redraw: viewCase(DNGD_ENTRIES.dungeon_redraw),
  dngd_ladders: viewCase(DNGD_ENTRIES.dungeon_redraw, LADDERS),
  dngd_doors: viewCase(DNGD_ENTRIES.dungeon_redraw, DOORS),
  dngd_fields: viewCase(DNGD_ENTRIES.dungeon_redraw, FIELDS),
  dngd_sprites: viewCase(DNGD_ENTRIES.draw_items_monsters, THINGS),
  dngd_traps: viewCase(DNGD_ENTRIES.draw_items_monsters, TRAPS, { trap: true }),
  dngd_unchanged: viewCase(DNGD_ENTRIES.dungeon_check_update, HIDING, { vary: true }),
  underworld_tmap: underworldCase(UNDERWORLD_TMAP_MODULE, (random: Random): readonly Key[] => [ { code: 0x41, polls: Math.floor(random() * 5) } ], belowground),
  underworld_sear_orb: underworldCase(UNDERWORLD_SEAR_MODULE, who, searching([ D.dng_tile_orb ])),
  underworld_sear_fountain: underworldCase(UNDERWORLD_SEAR_MODULE, who, drinking(null)),
  underworld_sear_poison: underworldCase(UNDERWORLD_SEAR_MODULE, who, drinking(D.fountain_poison)),
  underworld_sear_altar: underworldCase(UNDERWORLD_SEAR_MODULE, who, atAltar),
  underworld_sear: underworldCase(UNDERWORLD_SEAR_MODULE, who, searching([ 0x00, 0x10, 0x40, 0x80, 0xA0, D.dng_tile_wall ])),
  underworld_use: underworldCase(UNDERWORLD_USE_MODULE, words([ ...ITEMS, ...OTHER_WORDS, COLORS[0], COLORS[0], COLORS[0] ]), belowground),
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
