// scenarios.py's Session and the scenarios the gate runs, on the lifted machine: the same keys at
// the same polls, so each snapshot lines up with the oracle's.

import type { ILiftedModule } from '../../../src/app/lifted-runtime/lifted-module';
import type { LiftedMachine } from '../../../src/app/lifted-runtime/lifted-machine';

export const RETURN: number = 0x0D;
export const ESC: number = 0x1B;
const LEFT: number = 0x08;
const RIGHT: number = 0x15;
const UP: number = 0x0B;
const DOWN: number = 0x0A;
const MODE_WORLD: number = 0x01;
const GAME_MODE: number = 0x0B;
const PLAYER_XPOS: number = 0x00;
const PLAYER_YPOS: number = 0x01;
const OBJECT_TILE_SPRITE: number = 0xEE00;
const OBJECT_XPOS: number = 0xEE20;
const OBJECT_YPOS: number = 0xEE40;
const OBJECT_TILE_TYPE: number = 0xEE60;
const TILE_SHIP_WEST: number = 0x10;
const TILE_HORSE_WEST: number = 0x14;
const MOON_COUNTER: number = 0x1833;
const MOON_CTR_TRAMMEL: number = 0x1834;
const MOON_CTR_FELUCCA: number = 0x1835;
const MOONGATE_TILE: number = 0xED;
const MOONGATE_XPOS: number = 0xEE;
const MOONGATE_YPOS: number = 0xEF;
const MOONGATE_SPRITE: number = 0xF1;
const TILE_MOONGATE_FULL: number = 0x43;
const GEMS: number = 0xED09;
const HORN: number = 0xED15;
const PLAYER_1_STATUS: number = 0xEC12;
const STATUS_DEAD: number = 0xC4;
const KEY_BUF_LEN: number = 0xB8;
const PLAYER_TRANSPORT: number = 0x0E;
const PLAYER_1_STRENGTH: number = 0xEC13;
const PLAYER_1_DEXTERITY: number = 0xEC14;
const PLAYER_1_WEAPON: number = 0xEC1E;
const WEAPON_SWORD: number = 0x06;
const WEAPON_BOW: number = 0x07;
const TILE_PIRATE: number = 0x80;
const TILE_ORC: number = 0xC0;
const TILE_PYTHON: number = 0xCC;
const TILE_TWISTER: number = 0x8E;
const MIXTURES: number = 0xED40;
const SPELLS_MAX: number = 0x1A;
const PLAYER_1_MP: number = 0xEC16;
const PLAYER_1_HP_HI: number = 0xEC18;
const PLAYER_1_MAX_HP_HI: number = 0xEC1A;
const STATUS_POISON: number = 0xD0;
const RUNES: number = 0xED0D;
const RUNE_HONESTY: number = 0x80;
const LAST_MEDITATED: number = 0x19;
const VIRTUE_HONESTY: number = 0xED00;
const VIRTUE_SPIRITUALITY: number = 0xED06;
const NPC_MOVEMENT_AI: number = 0xEEC0;
const TILE_LORD_BRITISH: number = 0x5E;
const PARTY_SIZE: number = 0x0F;
const PLAYER_1_EXPERIENCE_HI: number = 0xEC1C;
const MOVE_COUNTER: number = 0x1C;
const BACKSPACE: number = 0x08;
const TILE_XPOS: number = 0x02;
const TILE_YPOS: number = 0x03;
const WORLD_MAP: number = 0xE800;
const PARTY_STATS: number = 0xED00;
const TORCHES: number = 0xED08;
const KEYS: number = 0xED0A;
const SEXTANT: number = 0xED0B;
const STONES: number = 0xED0C;
const BELL_BOOK_CANDLE: number = 0xED0E;
const THREEPARTKEY: number = 0xED0F;
const FOOD_HI: number = 0xED10;
const FOOD_LO: number = 0xED11;
const FOOD_FRAC: number = 0xED12;
const STATUS_GOOD: number = 0xC7;
const PLAYER_STATUS: number = 0xEC12;
const PLAYER_SIZE: number = 0x20;
const MODE_COMBAT: number = 0x80;
const WHEEL: number = 0xED16;
const SKULL: number = 0xED17;
const ARMOUR: number = PARTY_STATS + 0x18;
const WEAPONS: number = PARTY_STATS + 0x20;
const CTRL_V: number = 0x16;
const TILE_CHEST: number = 0x3C;
const TILE_WHIRLPOOL: number = 0x8C;
const TILE_RAT: number = 0x90;
const TILE_SWAMP: number = 0x03;
const TILE_BRIDGE_NARROW: number = 0x17;
const TILE_FIELD_POISON: number = 0x44;
const TILE_FIELD_FIRE: number = 0x46;
const TILE_FIELD_SLEEP: number = 0x47;
const TILE_LAVA: number = 0x4C;
const TILE_WALK: number = 0x1F;
const TILE_GRASS: number = 0x04;
const TILE_BALLOON: number = 0x18;
const TILE_HUMAN_PRONE: number = 0x38;
const TILE_DOOR_LOCKED: number = 0x3A;
const TOWNE_MAP: number = 0xE800;
const BRITANNIA_X: number = 0x08;
const BRITANNIA_Y: number = 0x09;
const ITEMS_OPENED_ABYSS: number = 0x77;
const DISK_PROMPT: number = 300;
const GOLD_HI: number = 0xED13;
const GOLD_LO: number = 0xED14;
const PLAYER_1_CLASS: number = 0xEC11;
const CLASS_SHEPHERD: number = 0x07;
const NPC_DIALOGUE: number = 0xEEE0;
const TILE_FLOOR_BRICK: number = 0x3E;
const TILE_VILLAGER: number = 0x20;
const TILE_BEGGAR: number = 0x58;
const AI_HOSTILE: number = 0xFF;
/** Moonglow's townsfolk, by their records on the towne disk's track 4, numbered from one. */
const MARIAH: number = 0x01;
const CROMWELL: number = 0x03;
const PATRIC: number = 0x06;
const CALABRINI: number = 0x0D;
/** TMAP's entry, which SEAR's telescope calls once the map is loaded. */
const VIEW_MAP: number = 0x9000;

type Key = string | number;
type Condition = () => boolean;


export class ScenarioError extends Error {
}


function codeOf(key: Key): number {
  return (typeof key === 'string') ? key.charCodeAt(0) : key;
}


export class Session {
  constructor(public readonly machine: LiftedMachine) {
  }


  public label(program: string, name: string): number {
    const module: ILiftedModule | undefined = this.machine.modules.find((candidate: ILiftedModule): boolean => candidate.name === program);
    const address: number | undefined = module?.labels[name];

    if (address == null) {
      throw new ScenarioError(`no label ${ name } in ${ program }`);
    } else {
      return address;
    }
  }


  public entered(program: string, name: string): Condition {
    const address: number = this.label(program, name);

    return (): boolean => (this.machine.cpu.pc === address) && (this.machine.programAt(address) === program);
  }


  public dosSeen(prefix: string): Condition {
    return (): boolean => this.machine.dosLog.some((line: string): boolean => line.startsWith(prefix));
  }


  public memoryIs(address: number, value: number): Condition {
    return (): boolean => this.machine.apple.read(address) === value;
  }


  public poke(address: number, value: number): void {
    this.machine.write(address, value);
  }


  public press(key: Key, polls: number = 0): Promise<void> {
    return this.machine.press(codeOf(key), polls);
  }


  public async type(text: string): Promise<void> {
    for (const character of text) {
      await this.press((character === '\n') ? RETURN : character);
    }
  }


  public idle(polls: number): Promise<void> {
    return this.machine.idle(polls);
  }


  public checkpoint(): void {
    this.machine.snapshots.push(this.machine.snapshot(null));
  }


  /** Presses the keys in turn, each at the next poll, until the condition holds. */
  public async pressUntil(keys: readonly Key[], condition: Condition, limit: number): Promise<void> {
    let reached: boolean = false;
    const check: Condition = (): boolean => {
      if (condition()) {
        reached = true;
      }

      return reached;
    };
    let count: number = 0;

    while ((count < limit) && !check()) {
      this.machine.pending = { code: codeOf(keys[count % keys.length]), polls: 0 };
      this.machine.polls = 0;
      await this.machine.runUntil((): boolean => check() || ((this.machine.pending == null) && ((this.machine.key & 0x80) === 0)));
      if (reached && (this.machine.pending != null)) {
        this.machine.pending = null;
      }
      count = count + 1;
    }
    if (!check()) {
      throw new ScenarioError(`not reached after ${ limit } key presses`);
    }
  }
}


/** A new character: the menu's I, a name, a gender, A to every question, into the game. */
export async function creation(session: Session): Promise<void> {
  await session.machine.runUntil(session.dosSeen('BRUN BOOT'));
  await session.pressUntil([ 'I' ], session.entered('BOOT', 'input_text'), 2000);
  await session.type('AVATAR\n');
  await session.press('M');
  await session.pressUntil([ 'A', ESC ], session.dosSeen('BRUN ULT4'), 400);
  await session.pressUntil([ ESC ], session.memoryIs(GAME_MODE, MODE_WORLD), 20);
  await session.idle(20);
  session.checkpoint();
}


/** Boot and let the intro run, a checkpoint every 250 polls. */
export async function bootToTitle(session: Session): Promise<void> {
  await session.machine.runUntil(session.dosSeen('BRUN BOOT'));
  for (let checkpoint: number = 0; checkpoint < 8; checkpoint++) {
    await session.idle(250);
    session.checkpoint();
  }
}


/** creation, then a few steps round Britannia, then long enough idle to pass a turn. */
export async function firstSteps(session: Session): Promise<void> {
  await creation(session);
  for (const key of [ UP, UP, RIGHT, DOWN, LEFT ]) {
    await session.press(key, 10);
  }
  await session.idle(140);
  session.checkpoint();
}


/** creation, with the party moved to (x, y) before ULT4 starts. */
async function newGameAt(session: Session, x: number, y: number): Promise<void> {
  await session.machine.runUntil(session.dosSeen('BRUN BOOT'));
  await session.pressUntil([ 'I' ], session.entered('BOOT', 'input_text'), 2000);
  await session.type('AVATAR\n');
  await session.press('M');
  await session.pressUntil([ 'A', ESC ], session.dosSeen('BRUN ULT4'), 400);
  session.poke(PLAYER_XPOS, x);
  session.poke(PLAYER_YPOS, y);
}


async function inBritannia(session: Session): Promise<void> {
  await session.pressUntil([ ESC ], session.memoryIs(GAME_MODE, MODE_WORLD), 20);
  await session.idle(20);
  session.checkpoint();
}


/**
 * One command's keys, each 10 polls after the game has taken the last from its type-ahead buffer
 * (a space empties it), and on to the next turn.
 */
async function command(session: Session, ...keys: readonly Key[]): Promise<void> {
  for (const key of keys) {
    await session.press(key, 10);
    await session.machine.runUntil(session.memoryIs(KEY_BUF_LEN, 0));
  }
  await session.machine.runUntil(session.entered('ULT4', 'next_turn'));
}


/**
 * A new game moved to (E1,85) by Britain's moongate, open with Trammel and Felucca set to send it
 * to the second gate, with two gems and the horn: search where nothing is, step through the gate,
 * peer at a gem, use the horn and the bell, camp, then die and wake in Lord British's castle.
 */
export async function britannia(session: Session): Promise<void> {
  await newGameAt(session, 0xE1, 0x85);
  for (const [ address, value ] of [
    [ MOON_COUNTER, 0x00 ], [ MOON_CTR_TRAMMEL, 0x04 ], [ MOON_CTR_FELUCCA, 0x24 ], [ MOONGATE_XPOS, 0xE0 ], [ MOONGATE_YPOS, 0x85 ],
    [ MOONGATE_SPRITE, 0x03 ], [ MOONGATE_TILE, TILE_MOONGATE_FULL ], [ GEMS, 0x02 ], [ HORN, 0x01 ],
  ]) {
    session.poke(address, value);
  }
  await inBritannia(session);
  await command(session, 'S');
  await command(session, LEFT);
  await command(session, 'P', ' ');
  await command(session, 'U', ...'HORN', RETURN);
  await command(session, 'U', ...'BELL', RETURN);
  await command(session, 'H');
  session.poke(PLAYER_1_STATUS, STATUS_DEAD);
  await session.press(' ', 10);
  await session.pressUntil([ ESC ], session.entered('ULT4', 'next_turn'), 40);
  await session.idle(140);
  session.checkpoint();
}


function placeObject(session: Session, slot: number, tile: number, x: number, y: number): void {
  for (const [ table, value ] of [ [ OBJECT_TILE_TYPE, tile ], [ OBJECT_TILE_SPRITE, tile ], [ OBJECT_XPOS, x ], [ OBJECT_YPOS, y ] ]) {
    session.poke(table + slot, value);
  }
}


/**
 * A new game moved, before ULT4 starts, to (E7,88) by Britain, with a horse to the north and a
 * ship to the west: ride, gallop into the shallows, dismount, board the ship and sail.
 */
export async function transport(session: Session): Promise<void> {
  await session.machine.runUntil(session.dosSeen('BRUN BOOT'));
  await session.pressUntil([ 'I' ], session.entered('BOOT', 'input_text'), 2000);
  await session.type('AVATAR\n');
  await session.press('M');
  await session.pressUntil([ 'A', ESC ], session.dosSeen('BRUN ULT4'), 400);
  session.poke(PLAYER_XPOS, 0xE7);
  session.poke(PLAYER_YPOS, 0x88);
  placeObject(session, 0x1D, TILE_HORSE_WEST, 0xE7, 0x87);
  placeObject(session, 0x1E, TILE_SHIP_WEST, 0xE6, 0x88);
  await session.pressUntil([ ESC ], session.memoryIs(GAME_MODE, MODE_WORLD), 20);
  await session.idle(20);
  session.checkpoint();
  for (const key of [ 'B', '1', ' ', UP, 'B', 'Y', RIGHT, DOWN, 'Y', LEFT, 'X', LEFT, LEFT, LEFT, 'B', LEFT, DOWN, DOWN, RIGHT, RIGHT, UP, UP, LEFT ]) {
    await session.press(key, 10);
    await session.machine.runUntil(session.entered('ULT4', 'next_turn'));
  }
  await session.idle(140);
  session.checkpoint();
}


/**
 * One turn's keys, each 10 polls after the game has taken the last, and on to the next player's
 * turn in combat or, when the fight is over, the next turn in Britannia.
 */
async function combatTurn(session: Session, ...keys: readonly Key[]): Promise<void> {
  const playerTurn: Condition = session.entered('ULT4', 'combat_take_turn');
  const nextTurn: Condition = session.entered('ULT4', 'next_turn');

  for (const key of keys) {
    await session.press(key, 10);
    await session.machine.runUntil(session.memoryIs(KEY_BUF_LEN, 0));
  }
  await session.machine.runUntil((): boolean => playerTurn() || nextTurn());
}


async function combatTurns(session: Session, count: number, ...keys: readonly Key[]): Promise<void> {
  for (let turn: number = 0; turn < count; turn++) {
    await combatTurn(session, ...keys);
  }
}


/**
 * A new game by Britain with a strong avatar, in three fights: a sword against two orcs to the
 * north, waiting for them and killing both; a bow against two pythons to the east, killing one,
 * wounding the other, poisoned, and fleeing off the arena's south edge; and on a ship, a bow
 * against the crew of a pirate ship to the west.
 */
export async function combat(session: Session): Promise<void> {
  await newGameAt(session, 0xE7, 0x88);
  session.poke(PLAYER_1_STRENGTH, 0x50);
  session.poke(PLAYER_1_DEXTERITY, 0x50);
  session.poke(PLAYER_1_WEAPON, WEAPON_SWORD);
  placeObject(session, 0x00, TILE_ORC, 0xE7, 0x87);
  await inBritannia(session);
  await combatTurn(session, 'A', UP);
  await combatTurns(session, 8, ' ');
  await combatTurns(session, 5, 'A', UP);
  placeObject(session, 0x01, TILE_PYTHON, 0xE8, 0x88);
  session.poke(PLAYER_1_WEAPON, WEAPON_BOW);
  await combatTurn(session, 'A', RIGHT);
  await combatTurns(session, 6, ' ');
  await combatTurns(session, 3, 'A', UP);
  await combatTurns(session, 4, DOWN);
  session.poke(PLAYER_XPOS, 0xE6);
  session.poke(PLAYER_YPOS, 0x88);
  session.poke(PLAYER_TRANSPORT, TILE_SHIP_WEST);
  placeObject(session, 0x02, TILE_PIRATE, 0xE5, 0x88);
  await combatTurn(session, 'A', LEFT);
  await combatTurns(session, 4, ' ');
  await combatTurns(session, 5, 'A', UP);
  await session.idle(140);
  session.checkpoint();
}


/** A spell's keys after C, with the caster's magic topped up first. */
async function cast(session: Session, ...keys: readonly Key[]): Promise<void> {
  session.poke(PLAYER_1_MP, 0x99);
  await combatTurn(session, 'C', ...keys);
}


/**
 * A new game by Britain, poisoned, with nine of every mixture: each spell cast in Britannia, some
 * refused (combat only, dungeon only, negated), then each attack spell and the others cast in a
 * fight with two orcs, which ends in victory.
 */
export async function spells(session: Session): Promise<void> {
  await newGameAt(session, 0xE7, 0x88);
  for (let spell: number = 0; spell < SPELLS_MAX; spell++) {
    session.poke(MIXTURES + spell, 0x09);
  }
  session.poke(PLAYER_1_STATUS, STATUS_POISON);
  await inBritannia(session);
  for (const keys of [
    [ '1', 'L' ], [ '1', 'W', UP ], [ '1', 'B', RIGHT ], [ '1', 'H', '1' ], [ '1', 'C', '1' ], [ '1', 'A', '1' ], [ '1', 'J' ], [ '1', 'M' ],
    [ '1', 'X' ], [ '1', 'E', 'P' ], [ '1', 'D', UP ], [ '1', 'G', '3' ], [ '1', 'V', ' ' ], [ '1', 'R', '1' ], [ '1', 'O' ], [ '1', 'P' ],
    [ '1', 'Q' ], [ '1', 'N' ], [ '1', 'L' ], [ '2', 'L' ], [ '1', 'Z' ],
  ]) {
    await cast(session, ...keys);
  }
  placeObject(session, 0x00, TILE_ORC, 0x26, 0xDF);
  await combatTurn(session, 'A', UP);
  for (const keys of [ [ 'M', UP ], [ 'F', UP ], [ 'I', UP ], [ 'S' ], [ 'T' ], [ 'U' ], [ 'K', UP ], [ 'E', 'P', UP ], [ 'D', UP ], [ 'W' ], [ 'O' ] ]) {
    await cast(session, ...keys);
  }
  await combatTurns(session, 4, 'A', UP);
  await session.idle(140);
  session.checkpoint();
}


/**
 * A new game by Britain's shore, a strong avatar, with a pirate ship to the west, a twister to the
 * east and an orc to the south, passing turn after turn: the twister strikes, the orcs attack and
 * are killed, then the pirate sails in and attacks, and the avatar flees its crew.
 */
export async function monsters(session: Session): Promise<void> {
  await newGameAt(session, 0xE7, 0x88);
  session.poke(PLAYER_1_STRENGTH, 0x50);
  session.poke(PLAYER_1_DEXTERITY, 0x50);
  session.poke(PLAYER_1_WEAPON, WEAPON_SWORD);
  session.poke(PLAYER_1_HP_HI, 0x04);
  session.poke(PLAYER_1_MAX_HP_HI, 0x04);
  placeObject(session, 0x00, TILE_PIRATE, 0xE4, 0x88);
  placeObject(session, 0x01, TILE_TWISTER, 0xE9, 0x89);
  placeObject(session, 0x02, TILE_ORC, 0xE7, 0x8C);
  await inBritannia(session);
  for (const [ keys, turns ] of [ [ [ ' ' ], 12 ], [ [ 'A', UP ], 3 ], [ [ 'A', LEFT ], 4 ], [ [ ' ' ], 17 ], [ [ 'A', UP ], 6 ], [ [ DOWN ], 5 ], [ [ ' ' ], 6 ] ] as const) {
    await combatTurns(session, turns, ...keys);
  }
  await session.idle(140);
  session.checkpoint();
}


/** Keys, each 10 polls after the game has taken the last from its type-ahead buffer, with no wait after. */
async function keys(session: Session, ...pressed: readonly Key[]): Promise<void> {
  for (const key of pressed) {
    await session.press(key, 10);
    await session.machine.runUntil(session.memoryIs(KEY_BUF_LEN, 0));
  }
}


/** A word typed and entered. */
function word(text: string): Key[] {
  return [ ...text, RETURN ];
}


/** A visit to the shrine: E, then the keys at each of its prompts, and back to Britannia. */
async function visitShrine(session: Session, ...pressed: readonly Key[]): Promise<void> {
  await keys(session, 'E', ...pressed);
  await session.machine.runUntil(session.entered('ULT4', 'next_turn'));
}


/**
 * A new game by the shrine of Honesty: turned away without its rune, then with it a vision after
 * one cycle, too weary to meditate again, a wrong mantra with spirituality spent (an eighth lost),
 * three cycles with honesty at its height for the partial avatarhood and the rune, then no focus
 * on the wrong virtue. (No cycles is not offered: the check reads the flags of a compare, not the
 * count, so it meditates 256 times.)
 */
export async function shrines(session: Session): Promise<void> {
  await newGameAt(session, 0xE9, 0x43);
  await inBritannia(session);
  await command(session, UP);
  await visitShrine(session);
  session.poke(RUNES, RUNE_HONESTY);
  session.poke(LAST_MEDITATED, 0xFF);
  await visitShrine(session, ...word('HONESTY'), '1', ...word('AHM'), ' ', ' ');
  await visitShrine(session, ...word('HON'), '2', ' ');
  session.poke(LAST_MEDITATED, 0xFF);
  session.poke(VIRTUE_SPIRITUALITY, 0x00);
  await visitShrine(session, ...'HONX', BACKSPACE, ...word('E'), '7', '2', ...word('OM'));
  session.poke(LAST_MEDITATED, 0xFF);
  session.poke(VIRTUE_HONESTY, 0x99);
  await visitShrine(session, ...word('HONE'), '3', ...word('AHM'), ...word('AHM'), ...word('AHM'), ' ', ' ');
  session.poke(LAST_MEDITATED, 0xFF);
  await visitShrine(session, ...word('VALOR'), '1', ' ');
  await session.idle(140);
  session.checkpoint();
}


/** A talk with Lord British, brought beside the party: T, north, the disk he is on, and the keys after. */
async function talkToLordBritish(session: Session, ...pressed: readonly Key[]): Promise<void> {
  await keys(session, 'T', UP, ESC, ...pressed);
  await session.pressUntil([ ESC ], session.entered('ULT4', 'next_turn'), 10);
}


/**
 * A new game into Lord British's castle, with him beside the party: his welcome to a newcomer, then
 * every subject he answers (healing declined and taken, help early in the game), one he cannot,
 * and farewell; then, with the avatar more experienced and a companion, a level gained and help
 * that asks for runes; and with four in the party, his greeting to them all.
 */
export async function lordBritish(session: Session): Promise<void> {
  await newGameAt(session, 0x56, 0x6C);
  await inBritannia(session);
  await command(session, UP);
  await keys(session, 'E');
  await session.pressUntil([ ESC ], session.entered('ULT4', 'next_turn'), 10);
  placeObject(session, 0x1F, TILE_LORD_BRITISH, 0x0F, 0x1D);
  session.poke(NPC_MOVEMENT_AI + 0x1F, 0x00);
  await talkToLordBritish(session, ' ', ' ', ' ',
    ...word('NAME'), ...word('LOOK'), ...word('JOB'), ...word('HEAL'), ...word('Y'), ...word('HEAL'), ...word('N'), ...word('HEAL'), ...word('MAYBE'),
    ...word('TRUTH'), ...word('LOVE'), ...word('COURAGE'), ...word('HONESTY'), ...word('COMPASSION'), ...word('VALOR'), ...word('JUSTICE'),
    ...word('SACRIFICE'), ...word('HONOR'), ...word('SPIRITUALITY'), ...word('HUMILITY'), ' ', ...word('PRIDE'), ' ', ...word('AVATAR'), ' ',
    ...word('QUEST'), ' ', ...word('BRITANNIA'), ' ', ' ', ...word('ANKH'), ...word('HELP'), ' ', ' ', ...word('ABYSS'), ' ', ' ',
    ...word('MONDAIN'), ...word('MINAX'), ...word('EXODUS'), ...word('VIRTUE'), ' ', ...word('XYZZY'), BACKSPACE, ...word('BYE'));
  session.poke(PLAYER_1_EXPERIENCE_HI, 0x04);
  session.poke(PARTY_SIZE, 0x02);
  session.poke(MOVE_COUNTER + 1, 0x01);
  await talkToLordBritish(session, ...word('HELP'), ' ', ' ', ' ', ...word('BYE'));
  session.poke(PARTY_SIZE, 0x04);
  await talkToLordBritish(session, ...word('BYE'));
  await session.idle(140);
  session.checkpoint();
}


/** Attack to the north until the fight is over. */
async function fight(session: Session): Promise<void> {
  for (let turn: number = 0; (turn < 60) && ((session.machine.read(GAME_MODE) & MODE_COMBAT) !== 0); turn++) {
    await combatTurn(session, 'A', UP);
  }
}


/** The tile under the party, in the world's four chunks held, as SUBS's gettile_britannia finds it. */
function setWorldTile(session: Session, tile: number): void {
  const x: number = session.machine.read(TILE_XPOS);
  const y: number = session.machine.read(TILE_YPOS);

  session.poke(WORLD_MAP + ((((y & 0x10) << 1) | x) >> 4 << 8) + (((y & 0x0F) << 4) | (x & 0x0F)), tile);
}


/**
 * A new game by Britain, with three in the party, a sextant, a torch and arms: Locate; Ignite, then
 * with none left; Ztats through every page each way; Ready and Wear, each taken, refused, lacking and
 * aborted; New order; the volume and music off and on; starving; four chests, trapped and not; Attack
 * where nothing is, at a whirlpool and at a rat, fought with Ztats and Ready in the fight; on a ship,
 * Fire not broadside and broadside at pirates; Fire on foot; then a turn each on swamp, fire, sleep,
 * poison and lava, three on a bridge; and Quit.
 */
export async function commands(session: Session): Promise<void> {
  await newGameAt(session, 0xE7, 0x88);
  for (const [ address, value ] of [
    [ PARTY_SIZE, 0x03 ], [ TORCHES, 0x01 ], [ SEXTANT, 0x01 ], [ STONES, 0x81 ], [ RUNES, 0x42 ], [ BELL_BOOK_CANDLE, 0x07 ],
    [ THREEPARTKEY, 0x05 ], [ HORN, 0x01 ], [ WHEEL, 0x01 ], [ SKULL, 0x01 ], [ WEAPONS + 2, 0x02 ], [ WEAPONS + 3, 0x01 ],
    [ WEAPONS + 4, 0x01 ], [ WEAPONS + 7, 0x12 ], [ ARMOUR + 1, 0x01 ], [ ARMOUR + 2, 0x01 ], [ PLAYER_1_DEXTERITY, 0x01 ],
  ]) {
    session.poke(address, value);
  }
  await inBritannia(session);
  await command(session, 'L');
  await command(session, 'I');
  await command(session, 'I');
  await command(session, 'Z', '0', RIGHT, RIGHT, RIGHT, RIGHT, RIGHT, RIGHT, RIGHT, RIGHT, RIGHT, LEFT, LEFT, LEFT, LEFT, LEFT, 'X');
  await command(session, 'Z', '5');
  for (const keys of [ [ '1', 'C' ], [ '1', 'E' ], [ '1', 'G' ], [ '1', 'H' ], [ '1', 'A' ], [ '1', 'Z' ], [ '7' ] ]) {
    await command(session, 'R', ...keys);
  }
  for (const keys of [ [ '1', 'C' ], [ '1', 'A' ], [ '1', 'B' ], [ '1', 'Q' ], [ '4' ] ]) {
    await command(session, 'W', ...keys);
  }
  for (const keys of [ [ '2', '3' ], [ '1' ], [ '2', '2' ], [ '4' ], [ '3', '1' ], [ 'X' ] ]) {
    await command(session, 'N', ...keys);
  }
  await command(session, 'V');
  await command(session, 'V');
  await command(session, CTRL_V);
  await command(session, CTRL_V);
  session.poke(FOOD_HI, 0x00);
  session.poke(FOOD_LO, 0x00);
  session.poke(FOOD_FRAC, 0x00);
  await command(session, ' ');
  session.poke(FOOD_LO, 0x50);
  for (let chest: number = 0; chest < 4; chest++) {
    placeObject(session, 0x10 + chest, TILE_CHEST, 0xE7, 0x88);
    await command(session, ' ');
    await command(session, 'G', '1');
    for (let player: number = 0; player < 3; player++) {
      session.poke(PLAYER_STATUS + (player * PLAYER_SIZE), STATUS_GOOD);
    }
  }
  await command(session, 'G', '4');
  await command(session, 'G', 'X');
  for (let player: number = 0; player < 3; player++) {
    for (const [ address, value ] of [
      [ PLAYER_1_STRENGTH, 0x50 ], [ PLAYER_1_DEXTERITY, 0x50 ], [ PLAYER_1_HP_HI, 0x09 ], [ PLAYER_1_MAX_HP_HI, 0x09 ], [ PLAYER_1_WEAPON, WEAPON_SWORD ],
    ]) {
      session.poke(address + (player * PLAYER_SIZE), value);
    }
  }
  await combatTurn(session, 'A', UP);
  placeObject(session, 0x00, TILE_WHIRLPOOL, 0xE7, 0x87);
  await combatTurn(session, 'A', UP);
  placeObject(session, 0x00, TILE_RAT, 0xE7, 0x87);
  await combatTurn(session, 'A', UP);
  await combatTurn(session, 'Z', RIGHT, 'X');
  await combatTurn(session, 'R', 'B');
  await fight(session);
  session.poke(PLAYER_TRANSPORT, TILE_SHIP_WEST);
  await command(session, 'F', LEFT);
  await command(session, 'F', UP);
  placeObject(session, 0x08, TILE_PIRATE, 0xE7, 0x86);
  await command(session, 'F', UP);
  placeObject(session, 0x01, TILE_PIRATE, 0xE7, 0x8A);
  await command(session, 'F', DOWN);
  await command(session, 'F', DOWN);
  session.poke(PLAYER_TRANSPORT, TILE_WALK);
  await command(session, 'F');
  for (const tile of [ TILE_SWAMP, TILE_FIELD_FIRE, TILE_FIELD_SLEEP, TILE_FIELD_POISON, TILE_LAVA ]) {
    setWorldTile(session, tile);
    await combatTurn(session, ' ');
  }
  setWorldTile(session, TILE_BRIDGE_NARROW);
  await combatTurns(session, 3, ' ');
  setWorldTile(session, TILE_GRASS);
  await command(session, 'Q');
  await session.idle(140);
  session.checkpoint();
}


/** E at a place, and its disk. */
async function enter(session: Session): Promise<void> {
  await keys(session, 'E');
  await answerDiskPrompt(session);
}


/** ESC once the game waits at its disk prompt, and on to the next turn. */
async function answerDiskPrompt(session: Session): Promise<void> {
  await session.idle(DISK_PROMPT);
  await keys(session, ESC);
  await session.machine.runUntil(session.entered('ULT4', 'next_turn'));
}


/** Off a towne's west edge, or up a dungeon's ladder, to (x, y) in Britannia, its disk asked for. */
async function leaveTo(session: Session, x: number, y: number, ...pressed: readonly Key[]): Promise<void> {
  session.poke(BRITANNIA_X, x);
  session.poke(BRITANNIA_Y, y);
  await keys(session, ...pressed);
  await answerDiskPrompt(session);
}


async function walkOffTowne(session: Session, x: number, y: number): Promise<void> {
  session.poke(PLAYER_XPOS, 0x00);
  session.poke(PLAYER_YPOS, 0x0F);
  await leaveTo(session, x, y, LEFT);
}


/**
 * A new game by Moonglow with eight in the party and a key: into the towne, where Mariah, who has
 * joined, is not; a door opened and left to close, a wall, a locked door that will not open, jimmied,
 * jimmied again, and with no key; three of the towne's chests and one dropped; a sleeper attacked
 * and fought; then out to Deceit, entered on a horse and on foot and climbed out of to Paws, a
 * village; Magincia, a ruin; the Lycaeum, a castle; the Abyss, shut and opened; and Enter in a
 * balloon and where nothing is.
 */
export async function townes(session: Session): Promise<void> {
  await newGameAt(session, 0xE8, 0x87);
  session.poke(PARTY_SIZE, 0x08);
  session.poke(KEYS, 0x01);
  await inBritannia(session);
  await enter(session);
  session.poke(PLAYER_XPOS, 0x19);
  session.poke(PLAYER_YPOS, 0x02);
  await command(session, 'O', RIGHT);
  await combatTurns(session, 5, ' ');
  await command(session, 'O', UP);
  session.poke(TOWNE_MAP + (0x02 * 0x20) + 0x1A, TILE_DOOR_LOCKED);
  await command(session, 'O', RIGHT);
  await command(session, 'J', RIGHT);
  await command(session, 'J', RIGHT);
  session.poke(TOWNE_MAP + (0x02 * 0x20) + 0x1A, TILE_DOOR_LOCKED);
  await command(session, 'J', RIGHT);
  await command(session, 'J', LEFT);
  for (const [ x, y, player ] of [ [ 0x1C, 0x01, '1' ], [ 0x1D, 0x01, '2' ], [ 0x1E, 0x02, '3' ] ]) {
    session.poke(PLAYER_XPOS, x as number);
    session.poke(PLAYER_YPOS, y as number);
    await command(session, ' ');
    await command(session, 'G', player);
  }
  placeObject(session, 0x1E, TILE_CHEST, 0x1B, 0x02);
  session.poke(PLAYER_XPOS, 0x1B);
  session.poke(PLAYER_YPOS, 0x02);
  await command(session, ' ');
  await command(session, 'G', '4');
  for (let player: number = 0; player < 8; player++) {
    for (const [ address, value ] of [ [ PLAYER_STATUS, STATUS_GOOD ], [ PLAYER_1_STRENGTH, 0x50 ], [ PLAYER_1_DEXTERITY, 0x50 ], [ PLAYER_1_WEAPON, WEAPON_SWORD ] ]) {
      session.poke(address + (player * PLAYER_SIZE), value);
    }
  }
  placeObject(session, 0x1E, TILE_HUMAN_PRONE, 0x1C, 0x02);
  session.poke(NPC_MOVEMENT_AI + 0x1E, 0x00);
  await combatTurn(session, 'A', RIGHT);
  await fight(session);
  await walkOffTowne(session, 0xF0, 0x49);
  session.poke(PLAYER_TRANSPORT, TILE_HORSE_WEST);
  await command(session, 'E');
  session.poke(PLAYER_TRANSPORT, TILE_WALK);
  await enter(session);
  await leaveTo(session, 0x62, 0x91, 'K');
  await enter(session);
  await walkOffTowne(session, 0xBB, 0xA9);
  await enter(session);
  await walkOffTowne(session, 0xDA, 0x6B);
  await enter(session);
  await walkOffTowne(session, 0xE9, 0xE9);
  await command(session, 'E');
  session.poke(BELL_BOOK_CANDLE, ITEMS_OPENED_ABYSS);
  await enter(session);
  await leaveTo(session, 0xE9, 0xE9, 'K');
  session.poke(PLAYER_TRANSPORT, TILE_BALLOON);
  await command(session, 'E');
  session.poke(PLAYER_TRANSPORT, TILE_WALK);
  await command(session, UP);
  await command(session, 'E');
  await session.idle(140);
  session.checkpoint();
}


/** T, a direction, the keys said, and on to the next turn. */
async function talkTo(session: Session, direction: Key, ...pressed: readonly Key[]): Promise<void> {
  await keys(session, 'T', direction, ...pressed);
  await session.machine.runUntil(session.entered('ULT4', 'next_turn'));
}


/** A townsperson, still, on floor at (x, y), with the record `dialogue` on the towne disk's track for the towne. */
function placeTownsperson(session: Session, slot: number, tile: number, x: number, y: number, dialogue: number): void {
  placeObject(session, slot, tile, x, y);
  session.poke(NPC_MOVEMENT_AI + slot, 0x00);
  session.poke(NPC_DIALOGUE + slot, dialogue);
  session.poke(TOWNE_MAP + (y * 0x20) + x, TILE_FLOOR_BRICK);
}


/**
 * A new game into Moonglow, the party at (0F,0F): Talk to no one, to one with nothing to say, and
 * to Cromwell, asked everything, his own words, and his question answered after an answer that is
 * neither; Patric's question of humility answered no and yes; a beggar given gold, more than there
 * is, and the last of it; Mariah asked to join, short of experience and then with it; a townsman
 * turned hostile, fought; the rune found and not found again; the horn and the skull used; then
 * the Lycaeum, its book found and its telescope turned to Moonglow, and to a letter it lacks.
 */
export async function townsfolk(session: Session): Promise<void> {
  await newGameAt(session, 0xE8, 0x87);
  session.poke(GOLD_HI, 0x00);
  session.poke(GOLD_LO, 0x30);
  session.poke(PLAYER_1_CLASS, CLASS_SHEPHERD);
  session.poke(PARTY_STATS, 0x50);
  await inBritannia(session);
  await enter(session);
  session.poke(PLAYER_XPOS, 0x0F);
  session.poke(PLAYER_YPOS, 0x0F);
  for (const [ x, y ] of [ [ 0x10, 0x0F ], [ 0x0E, 0x0F ], [ 0x0F, 0x0E ], [ 0x0F, 0x10 ] ]) {
    session.poke(TOWNE_MAP + (y * 0x20) + x, TILE_FLOOR_BRICK);
  }
  await command(session, ' ');
  await talkTo(session, DOWN);
  placeTownsperson(session, 0x10, TILE_VILLAGER, 0x0F, 0x10, 0x00);
  await talkTo(session, DOWN);
  placeTownsperson(session, 0x10, TILE_VILLAGER, 0x10, 0x0F, CROMWELL);
  await talkTo(session, RIGHT, ...word('NAME'), ...word('LOOK'), ...word('JOB'), ...word('HEAL'), ...word('MANTRA'), ...word('XYZZY'),
    ...word('HONESTY'), RETURN, ...word('MAYBE'), ...word('YES'), ...word('BYE'));
  placeTownsperson(session, 0x10, TILE_VILLAGER, 0x10, 0x0F, PATRIC);
  await talkTo(session, RIGHT, ...word('HUMILITY'), RETURN, ...word('N'), ...word('HUMI'), RETURN, ...word('Y'), ...word('BYE'));
  placeTownsperson(session, 0x10, TILE_BEGGAR, 0x10, 0x0F, CALABRINI);
  await talkTo(session, RIGHT, ...word('GIVE'), ...word('5'), ...word('GIVE'), ...word('99'), ...word('GIVE'), ...word('25'), ...word('BYE'));
  placeTownsperson(session, 0x1F, TILE_VILLAGER, 0x0F, 0x0E, MARIAH);
  session.poke(PLAYER_1_MAX_HP_HI, 0x01);
  await talkTo(session, UP, ...word('JOIN'), ...word('BYE'));
  session.poke(PLAYER_1_MAX_HP_HI, 0x02);
  await talkTo(session, UP, ...word('JOIN'));
  for (let player: number = 0; player < 2; player++) {
    for (const [ address, value ] of [ [ PLAYER_STATUS, STATUS_GOOD ], [ PLAYER_1_STRENGTH, 0x50 ], [ PLAYER_1_DEXTERITY, 0x50 ], [ PLAYER_1_WEAPON, WEAPON_SWORD ] ]) {
      session.poke(address + (player * PLAYER_SIZE), value);
    }
  }
  placeTownsperson(session, 0x10, TILE_BEGGAR, 0x0F, 0x0E, CALABRINI);
  session.poke(NPC_MOVEMENT_AI + 0x10, AI_HOSTILE);
  await combatTurn(session, ' ');
  await fight(session);
  session.poke(PLAYER_XPOS, 0x08);
  session.poke(PLAYER_YPOS, 0x06);
  await command(session, 'S');
  await command(session, 'S');
  session.poke(HORN, 0x01);
  session.poke(SKULL, 0x01);
  await command(session, 'U', ...word('HORN'));
  await command(session, 'U', ...word('SKULL'));
  await walkOffTowne(session, 0xDA, 0x6B);
  await enter(session);
  session.poke(PLAYER_XPOS, 0x06);
  session.poke(PLAYER_YPOS, 0x06);
  await command(session, 'S');
  session.poke(PLAYER_XPOS, 0x16);
  session.poke(PLAYER_YPOS, 0x03);
  await keys(session, 'S', 'E');
  await session.machine.runUntil((): boolean => session.machine.cpu.pc === VIEW_MAP);
  await session.idle(40);
  await keys(session, RETURN);
  await session.machine.runUntil(session.entered('ULT4', 'next_turn'));
  await command(session, 'S', 'Q');
  await session.idle(140);
  session.checkpoint();
}


export const SCENARIOS: Readonly<Record<string, (session: Session) => Promise<void>>> = {
  'boot-to-title': bootToTitle,
  creation,
  'first-steps': firstSteps,
  transport,
  britannia,
  combat,
  spells,
  monsters,
  shrines,
  'lord-british': lordBritish,
  commands,
  townes,
  townsfolk,
};
