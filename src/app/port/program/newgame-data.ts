import { inline } from '../inline-data';
import type { IInlineData } from '../inline-data';
import { encode } from '../text';

// Where NEWGAME keeps its variables, tables and inline data in the `fixed` build ($6400-$9733), and
// what they hold when it is loaded. The port keeps them at these addresses, so memory matches the
// original's byte for byte, and reads its tables from memory as the original does.

export const NEWGAME_LOAD: number = 0x6400;

/** Variables, and the operands NEWGAME rewrites in its own code (NEWGAME.s `@name=*+$01`). */
export const NEWGAME_VARIABLES = {
  scene: 0x642E,
  card_eligible: 0x67D9,
  card_chosen: 0x67E8,
  card_left: 0x67E9,
  card_right: 0x67EA,
  question_number: 0x67EB,
  cur_str: 0x67FC,
  cur_dex: 0x67FD,
  cur_int: 0x67FE,
  virtue_level: 0x6817,
  /** draw_bead: the word of `lda TMP_ADDR,x`. */
  bead_src: 0x6AD6,
  /** draw_card: the word of `lda TMP_ADDR,x`. */
  card_src: 0x6B5F,
} as const;

export const NEWGAME_TABLES = {
  question_table: 0x67E1,
  start_world_x: 0x67EC,
  start_world_y: 0x67F4,
  virtue_str: 0x67FF,
  virtue_dex: 0x6807,
  virtue_int: 0x680F,
  bead_row: 0x6AE2,
  bead_col: 0x6AE9,
  bead_addr: 0x6AF1,
  card_col_table: 0x6B77,
  card_addr: 0x6B79,
  string_table: 0x6CA6,
} as const;

/** print_string's numbers for the gypsy's words. */
export const NEWGAME_STRING = {
  first_scene: 0x1D,
  cards_first: 0x35,
  cards_more: 0x36,
  cards_last: 0x37,
  cards_of: 0x38,
  virtue_first: 0x39,
  farewell: 0x42,
  transport: 0x43,
} as const;


function text(address: number, value: string): IInlineData {
  return inline(address, [ ...encode(value), 0x00 ]);
}


function bload(address: number, file: string): IInlineData {
  return text(address, `\u0004BLOAD ${ file },A$4000\n`);
}


export const NEWGAME_INLINE = {
  run_ult4: text(0x6415, '\u0004BRUN ULT4,A$4000\n'),
  load_tree: bload(0x643B, 'TREE.SPK'),
  load_portal: bload(0x6487, 'PRTL.SPK'),
  load_tree_again: bload(0x64AC, 'TREE.SPK'),
  load_look: bload(0x64D1, 'LOOK.SPK'),
  load_fair: bload(0x6502, 'FAIR.SPK'),
  load_wagon: bload(0x6527, 'WAGN.SPK'),
  load_gypsy: bload(0x654C, 'GYPS.SPK'),
  load_table: bload(0x6571, 'TABL.SPK'),
  load_cards: bload(0x6596, 'CRDS'),
  and: text(0x664A, ' and '),
  she_says: text(0x665C, '. She says,'),
  consider_this: text(0x6671, '\'Consider this:\''),
  load_party: text(0x672D, '\u0004BLOAD NPRT,A$0\n\u0004BLOAD NLST,A$EE00\n\u0004BLOAD NRST,A$EC00\n'),
} as const;


/** virtue_str, virtue_dex and virtue_int: what each virtue adds, 8 bytes each. */
const VIRTUE_STATS: readonly number[] = [
  0x00, 0x00, 0x03, 0x00, 0x01, 0x01, 0x01, 0x00, 0x00, 0x03, 0x00, 0x01, 0x01, 0x00, 0x01, 0x00,
  0x03, 0x00, 0x00, 0x01, 0x00, 0x01, 0x01, 0x00,
];

/** bead_row, bead_col, bead_addr and the four bead pictures (white and black, even and odd columns). */
const BEADS: readonly number[] = [
  0x11, 0x21, 0x31, 0x41, 0x51, 0x61, 0x71, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0xF9,
  0x6A, 0x07, 0x6B, 0x15, 0x6B, 0x23, 0x6B, 0x3A, 0x7E, 0x7E, 0x7E, 0x7E, 0x7E, 0x7F, 0x7F, 0x7E,
  0x7E, 0x7E, 0x7E, 0x7E, 0x3A, 0x5D, 0x7F, 0x7F, 0x7F, 0x7F, 0x7F, 0x7F, 0x7F, 0x7F, 0x7F, 0x7F,
  0x7F, 0x7F, 0x5D, 0x22, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x22, 0x45, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x45,
];

/** card_col_table, and card_addr into CRDS. */
const CARD_TABLES: readonly number[] = [
  0x02, 0x1C, 0x00, 0x40, 0x60, 0x44, 0xC0, 0x48, 0x20, 0x4D, 0x80, 0x51, 0xE0, 0x55, 0x40, 0x5A,
  0xA0, 0x5E,
];

/** string_table: the scenes, the questions, and the gypsy's words, each ended by a zero; a newline is $FF. */
export const NEWGAME_STRINGS: readonly string[] = [
  '',
  'Entrusted to deliver an uncounted purse\nof gold, thou dost meet a poor beggar.\nDost thou A) deliver the gold knowing\nthe Trust in thee was well-placed; or\nB) show Compassion, giving the Beggar a\ncoin, knowing it won\'t be missed?',
  'Thou hast been prohibited by thy absent\nLord from joining thy friends in a close\npitched battle. Dost thou A) refrain, so\nthou mayst Honestly claim obedience; or\nB) show Valor, and aid thy comrades,\nknowing thou mayst deny it later?',
  'A merchant owes thy friend money, now\nlong past due. Thou dost see the same\nmerchant drop a purse of gold. Dost thou\nA) Honestly return the purse intact; or\nB) Justly give thy friend a portion of\nthe gold first?',
  'Thee and thy friend are valiant but\npenniless warriors. Ye both go out to\nslay a mighty dragon. Thy friend thinks\nhe slew it, thee did. When asked, dost\nthou A) Truthfully claim the gold; or\nB) Allow thy friend the large reward?',
  'Thou art sworn to protect thy Lord at\nany cost, yet thou knowest he hath\ncommitted a crime. Authorities ask thee\nof the affair, dost thou A) break thine\noath by Honestly speaking; or B) uphold\nHonor by silently keeping thine oath?',
  'Thy friend seeketh admittance to thy\nSpiritual order. Thou art asked to vouch\nfor his purity of Spirit, of which thou\nart unsure. Dost thou A) Honestly\nexpress thy doubt; or B) Vouch for him,\nhoping for his Spiritual improvement?',
  'Thy Lord mistakenly believes he slew a\ndragon. Thou hast proof that thy lance\nfelled the beast. When asked, dost thou\nA) Honestly claim the kill and the\nprize; or B) Humbly permit thy Lord his\nbelief?',
  'Thou dost manage to disarm thy mortal\nenemy in a duel. He is at thy mercy.\nDost thou A) show Compassion by\npermitting him to yield; or B) slay him\nas expected of a Valiant duelist?',
  'After 20 years thou hast found the\nslayer of thy best friends. The villain\nproves to be a man who provides the sole\nsupport for a young girl. Dost thou\nA) spare him in Compassion for the girl;\nor B) slay him in the name of Justice?',
  'Thee and thy friends have been routed\nand ordered to retreat. In defiance of\nthy orders, dost thou A) stop in\nCompassion to aid a wounded companion;\nor B) Sacrifice thyself to slow the\npursuing enemy, so others can escape?',
  'Thou art sworn to uphold a Lord who\nparticipates in the forbidden torture of\nprisoners. Each night their cries of\npain reach thee. Dost thou A) Show\nCompassion by reporting the deeds; or\nB) Honor thy oath and ignore the deeds?',
  'Thou hast been taught to preserve all\nlife as sacred. A man lies fatally stung\nby a venomous serpent. He pleads for a\nmerciful death. Dost thou A) show\nCompassion and end his pain; or B) heed\nthy Spiritual beliefs and refuse?',
  'As one of the King\'s Guard, thy Captain\nhas asked that one amongst you visit\na hospital to cheer the children with\ntales of thy valiant deeds. Dost thou\nA) Show thy Compassion and play the\nbraggart; or B) Humbly let another go?',
  'Thou hast been sent to secure a needed\ntreaty with a distant Lord. Thy host is\nagreeable to the proposal but insults\nthy country at dinner. Dost thou\nA) Valiantly bear the slurs; or\nB) Justly rise and demand an apology?',
  'A mighty knight accosts thee and demands\nthy food. Dost thou A) Valiantly refuse\nand engage the knight; or B) Sacrifice\nthy food unto the hungry knight?',
  'During battle thou art ordered to guard\nthy commander\'s empty tent. The battle\ngoes poorly and thou dost yearn to aid\nthy fellows. Dost thou A) Valiantly\nenter the battle to aid thy companions;\nor B) Honor thy post as guard?',
  'A local bully pushes for a fight. Dost\nthou A) Valiantly trounce the rogue; or\nB) Decline, knowing in thy Spirit that\nno lasting good will come of it?',
  'Although a teacher of music, thou art\na skillful wrestler. Thou hast been \nasked to fight in a local championship.\nDost thou A) accept the invitation and\nValiantly fight to win; or B) Humbly\ndecline knowing thou art sure to win?',
  'During a pitched battle, thou dost see\na fellow desert his post, endangering\nmany. As he flees, he is set upon by\nseveral enemies. Dost thou A) Justly let\nhim fight alone; or B) Risk Sacrificing\nthine own life to aid him?',
  'Thou hast sworn to do thy Lord\'s\nbidding in all. He covets a piece of\nland and orders the owner removed. Dost\nthou A) serve Justice, refusing to act,\nthus being disgraced; or B) Honor thine\noath and unfairly evict the landowner?',
  'Thou dost believe that virtue resides\nin all people. Thou dost see a rogue\nsteal from thy Lord. Dost thou A) call\nhim to Justice; or B) personally try to\nsway him back to the Spiritual path of\ngood?',
  'Unwitnessed, thou hast slain a great\ndragon in self defense. A poor warrior\nclaims the offered reward. Dost thou\nA) Justly step forward to claim the \nreward; or B) Humbly go about life,\nsecure in thy self-esteem?',
  'Thou art a bounty hunter sworn to return\nan alleged murderer. After his capture,\nthou believest him to be innocent.  Dost\nthou A) Sacrifice thy sizeable bounty\nfor thy belief; or B) Honor thy oath to\nreturn him as thou hast promised?',
  'Thou hast spent thy life in charitable\nand righteous work. Thine uncle the\ninnkeeper lies ill and asks you to take\nover his tavern. Dost thou A) Sacrifice\nthy life of purity to aid thy kin; or\nB) decline & follow thy Spirit\'s call?',
  'Thou art an elderly, wealthy eccentric.\nThy end is near. Dost thou A) donate all\nthy wealth to feed hundreds of starving\nchildren, and receive public adulation;\nor B) Humbly live out thy life, willing\nthy fortune to thine heirs?',
  'In thy youth thou pledged to marry thy\nsweetheart. Now thou art on a sacred\nquest in distant lands. Thy sweetheart \nasks thee to keep thy vow. Dost thou\nA) Honor thy pledge to wed; or B) follow\nthy Spiritual crusade?',
  'Thou art at a crossroads in thy life.\nDost thou A) Choose the Honorable life\nof a Paladin, striving for Truth and\nCourage; or B) Choose the Humble life\nof a Shepherd, and a world of simplicity\nand peace?',
  'Thy parents wish thee to become an\napprentice. Two positions are available.\nDost thou A) Become an acolyte in the\nSpiritual order; or B) Become an\nassistant to a humble village cobbler?',
  '  The day is warm, yet there is a\ncooling breeze. The latest in a series\nof personal crises seems insurmountable.\nYou are being pulled apart in all\ndirections.',
  'Yet this afternoon walk in the country-\nside slowly brings relaxation to your\nharried mind. The soil and stain of\nmodern high-tech living begins to wash\noff in layers. That willow tree near the\nstream looks comfortable and inviting.',
  'The buzz of dragonflies and the whisper\nof the willow\'s swaying branches bring\na deep peace. Searching inward for\ntranquility and happiness, you close\nyour eyes.',
  'A high-pitched cascading sound like\ncrystal wind chimes impinges on your\nfloating awareness. As you open your\neyes, you see a shimmering blueness rise\nfrom the ground. The sound seems to be\nemanating from this glowing portal.',
  'It is difficult to look at the blueness.\nLight seems to bend and distort around\nit, while the sound waves become so\nintense, they appear to become visible.',
  'The portal hangs there for a moment,\nthen, with the rush of an imploding\nvacuum, it sinks into the ground.\nSomething remains suspended in midair\nfor a moment, before falling to earth\nwith a heavy thud.',
  'Somewhat shaken by this vision, you\nrise to your feet to investigate. A\ncrude circle of stones surrounds the\nspot where the portal appeared. There is\nsomething glinting in the grass.',
  'You pick up an amulet shaped like a\ncross with a loop at the top. It is an\nAnkh, the sacred symbol of life and\nrebirth. But this could not have made\nthe thud, so you look again and find\na large book wrapped in thick cloth!',
  'With trembling hands you unwrap the\nbook. Behold, the cloth is a map, and\nwithin lies not one book, but two. The\nmap is of a land strange to you, and the\nstyle speaks of ancient cartography.',
  'The script on the cover of the first\nbook is arcane but readable. The title\nis:\n        The History of Britannia\n               as told by\n            Kyle the Younger',
  'The other book is disturbing to look at.\nIts small cover appears to be fashioned\nout of some form of leathery hide, but\nfrom what creature is uncertain. The\nreddish black skin radiates an intense\naura suggestive of ancient power.',
  'The tongue of the title is beyond your\nken. You dare not open the book and\ndisturb whatever sleeps within. You\ndecide to peruse the History. Settling\nback under the willow tree, you open the\nbook.',
  '\n\n    (You read the Book of History)',
  '\n\n(No, really! Read the Book of History!)',
  'Closing the book, you again pick up\nthe Ankh. As you hold it, you begin to\nhear a hauntingly familiar, lute-like\nsound wafting over a nearby hill. Still\nclutching the strange artifacts, you\nrise unbidden and climb the slope.',
  'In the valley below you see what appears\nto be a fair. It seems strange that you\ncame that way earlier and noticed\nnothing. As you mull this over, your\nfeet carry you down toward the site.',
  'This is no ordinary travelling\ncarnival, but a Renaissance Fair. The\npennants on the tent tops blow briskly\nin the late afternoon breeze.',
  'The ticket taker at the RenFair\'s gate\nstarts to ask you for money, but upon\nspotting your Ankh says, \'Welcome,\nfriend. Enter in peace and find your\npath.\'',
  'The music continues to pull you\nforward amongst the merchants and\nvendors. Glimpses of fabulous treasures\ncan be seen in some of the shadowy\nbooths.',
  'These people are very happy. They seem\nto glow with an inner light. Some look\nup as you pass and smile, but you cannot\nstop-- the music compels you to move\nonward through the crowd.',
  'Through the gathering dusk you see a\nsecluded gypsy wagon sitting off in the\nwoods. The music seems to emanate from\nthe wagon. As you draw nearer, a woman\'s\nvoice weaves into the music, saying:\n\'You may approach, O seeker.\'',
  'You enter to find an old gypsy sitting\nin a small, curtained room. She wears an\nAnkh around her neck. In front of her is\na round table covered in deep green\nvelvet. The room smells so heavily of\nincense that you feel dizzy.',
  'Seeing the Ankh, the ancient gypsy\nsmiles and warns you never to part with\nit. \'We have been waiting such a long\ntime, but at last you have come. Sit\nhere and I shall read the path of your\nfuture.\'',
  'Upon the table she places a curious\nwooden object like an abacus but without\nbeads. In her hands she holds eight\nunusual cards. \'Let us begin the\ncasting.\'',
  'The gypsy places the first two cards\n',
  'The gypsy places two more of the cards\n',
  'The gypsy places the last two cards\n',
  'upon the table. They are the cards of\n',
  'honesty',
  'compassion',
  'valor',
  'justice',
  'sacrifice',
  'honor',
  'spirituality',
  'humility',
  '',
  'With the final choice, the incense\nswells up around you. The gypsy speaks\nas if from a great distance, her voice\ngrowing fainter with each word:\n\'So be it! Thy path is chosen!\'',
  'There is a moment of intense, wrenching\nvertigo.  As you close your eyes, a\nvoice whispers within your mind, \'Seek\nthe counsel of thy sovereign.\' After a\nmoment, the spinning subsides, and you\nopen your eyes to...',
];


/** The string table as the game keeps it: each string through the charmap, a newline as $FF, and a zero after each. */
export function stringTable(): number[] {
  return NEWGAME_STRINGS.flatMap((value: string): number[] => [ ...Array.from(value, (character: string): number => ((character === '\n') ? 0xFF : (character.charCodeAt(0) | 0x80))), 0x00 ]);
}


/** Every byte NEWGAME's code reads as data, by address, as loading it leaves them. */
export function newgameData(): ReadonlyMap<number, readonly number[]> {
  const V = NEWGAME_VARIABLES;
  const T = NEWGAME_TABLES;
  const variables: [ number, readonly number[] ][] = [
    [ V.scene, [ 0x00 ] ],
    [ V.card_eligible, [ 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 ] ],
    [ T.question_table, [ 0x00, 0x06, 0x0B, 0x0F, 0x12, 0x14, 0x15 ] ],
    [ V.card_chosen, [ 0x00, 0x00, 0x00, 0x00 ] ],
    [ T.start_world_x, [ 0xE7, 0x53, 0x23, 0x3B, 0x9E, 0x69, 0x17, 0xBA ] ],
    [ T.start_world_y, [ 0x88, 0x69, 0xDD, 0x2C, 0x15, 0xB7, 0x81, 0xAB ] ],
    [ V.cur_str, [ 0x0F, 0x0F, 0x0F ] ],
    [ V.virtue_level, [ 0x50, 0x50, 0x50, 0x50, 0x50, 0x50, 0x50, 0x50 ] ],
    [ V.bead_src, [ 0xFF, 0xFF ] ],
    [ V.card_src, [ 0xFF, 0xFF ] ],
  ];
  const tables: [ number, readonly number[] ][] = [
    [ T.virtue_str, VIRTUE_STATS ],
    [ T.bead_row, BEADS ],
    [ T.card_col_table, CARD_TABLES ],
    [ T.string_table, stringTable() ],
  ];

  return new Map<number, readonly number[]>([
    ...variables,
    ...tables,
    ...Object.values(NEWGAME_INLINE).map((block: IInlineData): [ number, readonly number[] ] => [ block.address, block.bytes ]),
  ]);
}
