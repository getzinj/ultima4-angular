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


export const SCENARIOS: Readonly<Record<string, (session: Session) => Promise<void>>> = {
  'boot-to-title': bootToTitle,
  creation,
  'first-steps': firstSteps,
  transport,
};
