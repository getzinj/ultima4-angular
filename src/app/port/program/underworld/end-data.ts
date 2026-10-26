import { inline } from '../../inline-data';
import type { IInlineData } from '../../inline-data';
import { encode } from '../../text';
import { text } from '../overlay';

// Where END keeps its strings, tables and variables in the `fixed` build ($8800-$988C), and what
// they hold when it is loaded. The port keeps them at these addresses, so memory matches the
// original's byte for byte.

export const END_ENTRIES = {
  halt: 0x9069,
} as const;

/** Variables, and the operands END rewrites in its own code and inline data. */
export const END_VARIABLES = {
  leading_spaces: 0x906C,
  /** insert_disk: the drive's digit in its `BLOAD DISK,D1`. */
  drive_number: 0x9184,
  /** input_answer: the inline word match_input_inline compares, copied from answer_table. */
  keyword_compare: 0x91DE,
  save_party_size: 0x921E,
  question_number: 0x921F,
  /** match_input_inline: the word of its `lda TMP_ADDR`, stepped through the inline string. */
  match_pointer: 0x924C,
  match_mismatch: 0x9268,
} as const;

export const END_TABLES = {
  world_location_x: 0x90DA,
  world_location_y: 0x90E7,
  answer_table: 0x91E4,
  spk_addr_table: 0x9544,
  string_table: 0x955E,
} as const;

export const END_INLINE = {
  bload_cstring: text(0x880D, '\u0004BLOAD CSTRING,A$4000\n'),
  darkness: text(0x883A, '\n\n\nThere is a\nsudden darkness,\nand you find\nyourself alone\nin an empty\nchamber.\n'),
  no_key: text(0x88A1, '\nThou dost not\nhave the key of\nthree parts.\n'),
  use_key: text(0x88D6, '\nYou use your\nkey of three\nparts.\n'),
  word_of_passage: text(0x8901, '\nA voice rings\nout, \'What is\nthe Word of\nPassage?\'\n\n'),
  veramocor: text(0x893C, 'VERAMOCOR'),
  not_leader: text(0x8959, '\nThou hast not\nproved thy\nleadership in\nall eight\nvirtues.\n'),
  not_ready: text(0x89AC, '\nThou art not\nready.\n'),
  not_granted: text(0x89C5, '\nPassage is not\ngranted.\n'),
  granted: text(0x89E7, '\nPassage is\ngranted.\n'),
  not_complete: text(0x8A12, '\nThy quest is not\nyet complete.\n'),
  voice_says: text(0x8A56, '\nThe voice says:\n'),
  well_versed: text(0x8A70, '\nThou art well\nversed in the\nvirtues of the\nAvatar.\n'),
  rumbles: text(0x8AB7, '\n\nThe floor\nrumbles beneath\nyour feet.\n'),
  above_the_din: text(0x8AED, '\nAbove the din,\nthe voice asks:\n'),
  not_know: text(0x8B22, '\nThou dost not\nknow the true\nnature of the\nUniverse.\n'),
  codex: text(0x8B7E, '\n\nThe boundless\nknowledge of the\nCodex of\nUltimate Wisdom\nis revealed unto\nthee.'),
  truly_good: text(0x8BDA, '\n\nThe voice says:\nThou hast proven\nthyself to be\ntruly good in\nnature.'),
  endless_quest: text(0x8C27, '\n\nThou must know\nthat thy quest\nto become an\nAvatar is the\nendless quest of\na lifetime.'),
  living_gift: text(0x8C85, '\n\nAvatarhood is a\nliving gift. It\nmust always and\nforever be\nnurtured to\nflourish.'),
  stray: text(0x8CDE, '\n\nFor if thou dost\nstray from the\npaths of virtue,\nthy way may be\nlost forever.'),
  return_now: text(0x8D34, '\n\nReturn now unto\nthine own world,\nlive there as an\nexample to thy\npeople, as our\nmemory of thy\ngallant deeds\nserves us.'),
  vertigo: text(0x8DB6, '\n\nAs the sound of\nthe voice trails\noff, darkness\nseems to rise\naround you.\nThere is a\nmoment of\nintense, \nwrenching\nvertigo.'),
  circle_of_stones: text(0x8E3E, '\n\nYou open your\neyes to a\nfamiliar circle\nof stones. You\nwonder of your\nrecent\nadventures.'),
  the_ankh: text(0x8E9F, '\n\nIt seems a time\nand place very\ndistant. You\nwonder if it\nreally happened.\nThen you realize\nthat in your\nhand you hold\nThe Ankh.'),
  the_gates: text(0x8F27, '\n\nYou walk away\nfrom the circle,\nknowing that\nyou can always\nreturn from\nwhence you came,\nsince you now\nknow the secret\nof the gates.'),
  congratulations: text(0x8FB3, '\n\nCONGRATULATIONS!\n   Thou hast\n   completed\n   ULTIMA IV\n  Quest of the\n     AVATAR\n  in '),
  turns: text(0x902A, '\n turns! Report\n thy feat unto\nLord British at\nOrigin Systems!'),
  newline: text(0x9098, '\n'),
  bload_ult4: text(0x90A2, '\u0004BLOAD ULT4,A$4000\n'),
  place_disk: text(0x910D, '\nPLEASE PLACE THE\nULTIMA DISK\nINTO DRIVE '),
  press_esc: text(0x913F, '\nAND PRESS [ESC]\n'),
  bload_disk: text(0x9177, '\u0004BLOAD DISK,D1\n'),
  voice_asks: text(0x919D, '\n\nThe voice asks:\n'),
} as const;

/** The questions and the Codex's last words, by number from 1; 0 is empty. */
const STRINGS: readonly string[] = [
  '',
  '\nWhat dost thou\npossess if all\nmay rely upon\nthine every\nword?\n',
  '\nWhat quality\ncompels one to\nshare in the\njourneys of\nothers?\n',
  '\nWhat answers\nwhen great deeds\nare called for?\n',
  '\nWhat should be\nthe same for\nLord and Serf\nalike?\n',
  '\nWhat is loath\nto place the\nself above aught\nelse?\n',
  '\nWhat shirks no\nduty?\n',
  '\nWhat, in knowing\nthe true self,\nknows all?\n',
  '\nWhat is that\nwhich Serfs are\nborn with but\nNobles must\nstrive to\nobtain?\n',
  '\nIf all else is\nimaginary, this\nis real...\n',
  '\nWhat plunges to\nthe depths,\nwhile soaring on\nthe heights?\n',
  '\nWhat turns not\naway from any\nperil?\n',
  '\nIf all eight\nvirtues of the\nAvatar combine\ninto and are\nderived from the\nthree principles\nof Truth, Love,\nand Courage...',
  '\n\nthen what is the\none thing which\nencompasses and\nis the whole of\nall undeniable\nTruth, unending\nLove, and\nunyielding\nCourage?\n',
];

/** Each answer's first four letters, by question from 1; SELF is never asked for. */
const ANSWERS: readonly string[] = [ 'HONE', 'COMP', 'VALO', 'JUST', 'SACR', 'HONO', 'SPIR', 'HUMI', 'TRUT', 'LOVE', 'COUR', 'SELF', 'INFI' ];

/** CSTRING's Super-Packer images, at $4000: the eight virtues, the three principles, the win and the lock. */
const SPK_OFFSETS: readonly number[] = [ 0x0F36, 0x0FFB, 0x10AB, 0x10C8, 0x10E5, 0x11B0, 0x126D, 0x12AC, 0x146E, 0x14EB, 0x156E, 0x15EC, 0x181B ];
const CSTRING_ADDRESS: number = 0x4000;

const V = END_VARIABLES;
const T = END_TABLES;

export const END_DATA: readonly IInlineData[] = [
  ...Object.values(END_INLINE),
  inline(V.leading_spaces, [ 0x00 ]),
  inline(T.world_location_x, [ 0xE7, 0x53, 0x23, 0x3B, 0x9E, 0x69, 0x17, 0xBA, 0xD8, 0x1D, 0x91, 0x59, 0xE9 ]),
  inline(T.world_location_y, [ 0x88, 0x69, 0xDD, 0x2C, 0x15, 0xB7, 0x81, 0xAC, 0x6A, 0x30, 0xF3, 0x6A, 0xE9 ]),
  inline(V.keyword_compare, [ 0x00, 0x00, 0x00, 0x00, 0x00 ]),
  inline(T.answer_table, ANSWERS.flatMap((answer: string): number[] => encode(answer))),
  inline(V.save_party_size, [ 0x00, 0x00 ]),
  inline(V.match_pointer, [ 0xFF, 0xFF ]),
  inline(V.match_mismatch, [ 0x00 ]),
  inline(T.spk_addr_table, SPK_OFFSETS.flatMap((offset: number): number[] => [ (CSTRING_ADDRESS + offset) & 0xFF, (CSTRING_ADDRESS + offset) >> 8 ])),
  inline(T.string_table, STRINGS.flatMap((value: string): number[] => [ ...encode(value), 0x00 ])),
];
