import { inline } from '../inline-data';
import type { IInlineData } from '../inline-data';
import { msbString, zeroTerminated } from '../text';

// Where SUBS keeps its variables, tables and inline data in the `fixed` build ($0800-$1FE8), and
// what they hold when it is loaded. The port keeps them at these addresses, so memory matches the
// original's byte for byte, and reads its tables from memory as the original does.

export const SUBS_LOAD: number = 0x0800;

/** Variables, and the operands SUBS rewrites in its own code (SUBS.s `@name=*+$01`). */
export const SUBS_VARIABLES = {
  idletimeout: 0x0ADE,
  movement_counter: 0x0B45,
  cursor_ctr: 0x1080,
  stats_saved_xpos: 0x118F,
  stats_saved_ypos: 0x1190,
  draw_hvflag: 0x1654,
  draw_savex: 0x1655,
  draw_savey: 0x1656,
  moon_counter: 0x1833,
  moon_ctr_trammel: 0x1834,
  moon_ctr_felucca: 0x1835,
  sfx_m2_ctr1: 0x1A5D,
  sfx_m2_ctr2: 0x1A5E,
  rnd0: 0x1549,
  rnd1: 0x154A,
  rnd2: 0x154B,
  rnd3: 0x154C,
  rndf: 0x1558,
  /** drawview: `ldy drawn_tiles`, its low byte. */
  src_tile: 0x0EA2,
  /** drawview: `lda TMP_PAGE,y`, high bytes, and `sta TMP_ADDR,x`, both bytes. */
  src1_hi: 0x0EA9,
  dst1_lo: 0x0EAB,
  dst1_hi: 0x0EAC,
  src2_hi: 0x0EB3,
  dst2_lo: 0x0EB5,
  dst2_hi: 0x0EB6,
  /** primm: `lda TMP_ADDR`. */
  primmaddr: 0x0F9B,
  /** console_scroll: `lda TMP_ADDR,y` and `sta TMP_ADDR,y`. */
  scrollsrc: 0x158F,
  scrolldst: 0x1592,
  /** drawchar: `lda TMP_PAGE,x` and `sta TMP_ADDR,y`. */
  charsrc: 0x15DA,
  chardst: 0x15DD,
  /** request_disk: the drive digit in its `BLOAD DISK,D1`. */
  file_char_drive: 0x18D6,
} as const;

export const SUBS_TABLES = {
  toward_center_1: 0x0EDB,
  toward_center_row: 0x0EE6,
  distance: 0x0EF1,
  walkable_tiles: 0x12EE,
  moon_gfx: 0x171A,
  moongate_xtab: 0x1836,
  moongate_ytab: 0x183E,
  sfxtab: 0x1926,
  strings: 0x1AE7,
  mul_11: 0x1F46,
} as const;

export const WALKABLE_TILES_LAST: number = 40;


const STATUS_RULE: number[] = [ 0x18, 0x00, ...Array.from({ length: 15 }, (_: unknown, index: number): number => ((index % 2) === 0 ? 0x04 : 0x05)), 0xFF ];

export const SUBS_INLINE = {
  clearstatwindow: inline(0x1096, STATUS_RULE),
  food: inline(0x113E, zeroTerminated('F:')),
  gold: inline(0x1164, zeroTerminated(' G:')),
  ship: inline(0x117E, zeroTerminated(' SHP:')),
  wind: inline(0x11B1, [ 0x1E, ...zeroTerminated('WIND ') ]),
  direction: inline(0x11F2, zeroTerminated('DIR: ')),
  north: inline(0x1234, zeroTerminated('NORTH')),
  south: inline(0x123E, zeroTerminated('SOUTH')),
  east: inline(0x1248, zeroTerminated(' EAST')),
  west: inline(0x1252, zeroTerminated(' WEST')),
  scroll: inline(0x15A1, [ 0x18, 0x17, ...Array.from({ length: 16 }, (): number => 0x20), 0xFF ]),
  frame_top: inline(0x165D, [
    0x00, 0x00, 0x10, 0x05, 0x04, 0x05, 0x04, 0x05, 0x04, 0x05, 0x04, 0x05, 0x1E, 0x20, 0x20, 0x1D,
    0x04, 0x05, 0x04, 0x05, 0x04, 0x05, 0x04, 0x05, 0x04, 0x01, 0x04, 0x05, 0x04, 0x05, 0x04, 0x05,
    0x04, 0x05, 0x04, 0x05, 0x04, 0x05, 0x04, 0x05, 0x04, 0x13, 0xFF,
  ]),
  frame_left: inline(0x168B, [ 0x00, 0x01, ...Array.from({ length: 22 }, (): number => 0x0A), 0x14, 0xFF ]),
  frame_bottom: inline(0x16A8, [ 0x01, 0x17, ...Array.from({ length: 22 }, (_: unknown, index: number): number => ((index % 2) === 0 ? 0x03 : 0x02)), 0xFF ]),
  frame_middle: inline(0x16C4, [
    0x17, 0x01, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x09, 0x0D, 0x09, 0x0D, 0x0D, 0x0D,
    0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0B, 0xFF,
  ]),
  frame_right: inline(0x16E1, [ 0x27, 0x01, 0x09, 0x09, 0x09, 0x09, 0x09, 0x09, 0x09, 0x09, 0x01, 0x09, 0x05, 0xFF ]),
  frame_rule_9: inline(0x16F2, [ 0x18, 0x09, ...Array.from({ length: 15 }, (_: unknown, index: number): number => ((index % 2) === 0 ? 0x06 : 0x07)), 0xFF ]),
  frame_rule_11: inline(0x1707, [ 0x18, 0x0B, ...Array.from({ length: 15 }, (_: unknown, index: number): number => ((index % 2) === 0 ? 0x06 : 0x07)), 0xFF ]),
  please_place: inline(0x185F, zeroTerminated('\nPLEASE PLACE THE\n')),
  disk_into: inline(0x1878, zeroTerminated(' DISK\nINTO DRIVE ')),
  press_esc: inline(0x1892, zeroTerminated('\nAND PRESS [ESC]\n')),
  bload_disk: inline(0x18CA, [ 0x84, ...zeroTerminated('BLOADDISK,D1\n') ]),
  britannia: inline(0x18F0, zeroTerminated('BRITANNIA')),
  towne: inline(0x1901, zeroTerminated('TOWNE')),
  underworld: inline(0x190B, zeroTerminated('UNDERWORLD')),
} as const;


const RND_SEED: readonly number[] = [ 0x64, 0x76, 0x85, 0x54, 0xF6, 0x5C, 0x76, 0x1F, 0xE7, 0x12, 0xA7, 0x6B, 0x93, 0xC4, 0x6E, 0x1B ];

const TOWARD_CENTER_1: readonly number[] = [ 1, 1, 1, 1, 1, 0, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF ];
const TOWARD_CENTER_ROW: readonly number[] = [ 11, 11, 11, 11, 11, 0, 0xF5, 0xF5, 0xF5, 0xF5, 0xF5 ];
const DISTANCE: readonly number[] = [ 5, 4, 3, 2, 1, 0, 1, 2, 3, 4, 5 ];

const WALKABLE_TILES: readonly number[] = [
  0x03, 0x04, 0x05, 0x06, 0x07, 0x09, 0x0A, 0x0B, 0x0C, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16,
  0x17, 0x18, 0x19, 0x1A, 0x1B, 0x1C, 0x1D, 0x1E, 0x3C, 0x3E, 0x3F, 0x43, 0x44, 0x46, 0x47, 0x49,
  0x4A, 0x4C, 0x4C, 0x4C, 0x8C, 0x8D, 0x8E, 0x8F,
];

const MOON_GFX: readonly number[] = [
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x04, 0x02, 0x01, 0x01, 0x02, 0x04, 0x00,
  0x00, 0x04, 0x06, 0x07, 0x07, 0x06, 0x04, 0x00, 0x00, 0x0C, 0x0E, 0x1F, 0x1F, 0x0E, 0x0C, 0x00,
  0x00, 0x0C, 0x1E, 0x3F, 0x3F, 0x1E, 0x0C, 0x00, 0x00, 0x0C, 0x1C, 0x3E, 0x3E, 0x1C, 0x0C, 0x00,
  0x00, 0x08, 0x18, 0x38, 0x38, 0x18, 0x08, 0x00, 0x00, 0x08, 0x10, 0x20, 0x20, 0x10, 0x08, 0x00,
];

const MOONGATE_XTAB: readonly number[] = [ 0xE0, 0x60, 0x26, 0x32, 0xA6, 0x68, 0x17, 0xBB ];
const MOONGATE_YTAB: readonly number[] = [ 0x85, 0x66, 0xE0, 0x25, 0x13, 0xC2, 0x7E, 0xA7 ];
const MUL_11: readonly number[] = [ 0x00, 0x0B, 0x16, 0x21, 0x2C, 0x37, 0x42, 0x4D, 0x58, 0x63, 0x6E ];

/** sfx_walk ... sfx_storm, less one, as `.addr` pushes them for an RTS. */
export const SFX_ENTRIES: readonly number[] = [ 0x1940, 0x1954, 0x1962, 0x1972, 0x1983, 0x1993, 0x19A3, 0x19B5, 0x19C7, 0x1A06, 0x19D8, 0x19EE, 0x1A5F ];

const STRING_NAMES: readonly string[] = [
  'PIRATE', 'PIRATE', 'NIXIE', 'SQUID', 'SERPENT', 'SEAHORSE', 'WHIRLPOOL', 'TWISTER', 'RAT', 'BAT', 'SPIDER', 'GHOST', 'SLIME',
  'TROLL', 'GREMLIN', 'MIMIC', 'REAPER', 'INSECTS', 'GAZER', 'PHANTOM', 'ORC', 'SKELETON', 'ROGUE', 'PYTHON', 'ETTIN', 'HEADLESS',
  'CYCLOPS', 'WISP', 'MAGE', 'LICHE', 'LAVA LIZARD', 'ZORN', 'DAEMON', 'HYDRA', 'DRAGON', 'BALRON',
  'HANDS', 'STAFF', 'DAGGER', 'SLING', 'MACE', 'AXE', 'SWORD', 'BOW', 'CROSSBOW', 'FLAMING OIL', 'HALBERD', 'MAGIC AXE',
  'MAGIC SWORD', 'MAGIC BOW', 'MAGIC WAND', 'MYSTIC SWORD',
  'SKIN', 'CLOTH', 'LEATHER', 'CHAIN MAIL', 'PLATE MAIL', 'MAGIC CHAIN', 'MAGIC PLATE', 'MYSTIC ROBE',
  'HND', 'STF', 'DAG', 'SLN', 'MAC', 'AXE', 'SWD', 'BOW', 'XBO', 'OIL', 'HAL', '+AX', '+SW', '+BO', 'WND', '^SW',
  'MAGE', 'BARD', 'FIGHTER', 'DRUID', 'TINKER', 'PALADIN', 'RANGER', 'SHEPHERD',
  'GUARD', 'MERCHANT', 'BARD', 'JESTER', 'BEGGAR', 'CHILD', 'BULL', 'LORD BRITISH',
  'SULFUR ASH', 'GINSENG', 'GARLIC', 'SPIDER SILK', 'BLOOD MOSS', 'BLACK PEARL', 'NIGHTSHADE', 'MANDRAKE',
  'AWAKEN', 'BLINK', 'CURE', 'DISPEL', 'ENERGY', 'FIREBALL', 'GATE', 'HEAL', 'ICEBALL', 'JINX', 'KILL', 'LIGHT', 'MAGIC MISL',
  'NEGATE', 'OPEN', 'PROTECTION', 'QUICKNESS', 'RESURRECT', 'SLEEP', 'TREMOR', 'UNDEAD', 'VIEW', 'WINDS', 'X-IT', 'Y-UP', 'Z-DOWN',
  'BRITANNIA', 'THE LYCAEUM', 'EMPATH ABBEY', 'SERPENT\'S HOLD', 'MOONGLOW', 'BRITAIN', 'JHELOM', 'YEW', 'MINOC', 'TRINSIC',
  'SKARA BRAE', 'MAGINCIA', 'PAWS', 'BUCCANEER\'S DEN', 'VESPER', 'COVE',
  'DECEIT', 'DESPISE', 'DESTARD', 'WRONG', 'COVETOUS', 'SHAME', 'HYTHLOTH', 'THE GREAT\nSTYGIAN ABYSS!',
  'HONESTY', 'COMPASSION', 'VALOR', 'JUSTICE', 'SACRIFICE', 'HONOR', 'SPIRITUALITY', 'HUMILITY',
  'WATER', 'HORSE', 'ANKH', 'CAMPFIRE',
];

/** SUBS.s `strings`: a zero, then each name with bit 7 of its last character cleared. */
export const STRINGS: readonly number[] = [ 0x00, ...STRING_NAMES.flatMap((name: string): number[] => msbString(name)) ];


/** Every byte SUBS's code reads as data, by address, as loading it leaves them. */
export function subsData(): ReadonlyMap<number, readonly number[]> {
  const variables: [ number, readonly number[] ][] = [
    [ SUBS_VARIABLES.idletimeout, [ 0 ] ],
    [ SUBS_VARIABLES.movement_counter, [ 0 ] ],
    [ SUBS_VARIABLES.cursor_ctr, [ 0 ] ],
    [ SUBS_VARIABLES.stats_saved_xpos, [ 0, 0 ] ],
    [ SUBS_VARIABLES.draw_hvflag, [ 0, 0, 0 ] ],
    [ SUBS_VARIABLES.moon_counter, [ 0, 0, 0 ] ],
    [ SUBS_VARIABLES.sfx_m2_ctr1, [ 0, 0 ] ],
    [ SUBS_VARIABLES.rnd0, RND_SEED ],
    [ SUBS_VARIABLES.src_tile, [ 0x00 ] ],
    [ SUBS_VARIABLES.src1_hi, [ 0xFF ] ],
    [ SUBS_VARIABLES.dst1_lo, [ 0xFF, 0xFF ] ],
    [ SUBS_VARIABLES.src2_hi, [ 0xFF ] ],
    [ SUBS_VARIABLES.dst2_lo, [ 0xFF, 0xFF ] ],
    [ SUBS_VARIABLES.primmaddr, [ 0xFF, 0xFF ] ],
    [ SUBS_VARIABLES.scrollsrc, [ 0xFF, 0xFF ] ],
    [ SUBS_VARIABLES.scrolldst, [ 0xFF, 0xFF ] ],
    [ SUBS_VARIABLES.charsrc, [ 0x00, 0xFF ] ],
    [ SUBS_VARIABLES.chardst, [ 0xFF, 0xFF ] ],
  ];
  const tables: [ number, readonly number[] ][] = [
    [ SUBS_TABLES.toward_center_1, TOWARD_CENTER_1 ],
    [ SUBS_TABLES.toward_center_row, TOWARD_CENTER_ROW ],
    [ SUBS_TABLES.distance, DISTANCE ],
    [ SUBS_TABLES.walkable_tiles, WALKABLE_TILES ],
    [ SUBS_TABLES.moon_gfx, MOON_GFX ],
    [ SUBS_TABLES.moongate_xtab, MOONGATE_XTAB ],
    [ SUBS_TABLES.moongate_ytab, MOONGATE_YTAB ],
    [ SUBS_TABLES.sfxtab, SFX_ENTRIES.flatMap((entry: number): number[] => [ (entry - 1) & 0xFF, (entry - 1) >> 8 ]) ],
    [ SUBS_TABLES.strings, STRINGS ],
    [ SUBS_TABLES.mul_11, MUL_11 ],
  ];

  return new Map<number, readonly number[]>([
    ...variables,
    ...tables,
    ...Object.values(SUBS_INLINE).map((block: IInlineData): [ number, readonly number[] ] => [ block.address, block.bytes ]),
  ]);
}
