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


export const SCENARIOS: Readonly<Record<string, (session: Session) => Promise<void>>> = {
  'boot-to-title': bootToTitle,
  creation,
  'first-steps': firstSteps,
  transport,
  britannia,
  combat,
  spells,
  monsters,
};
