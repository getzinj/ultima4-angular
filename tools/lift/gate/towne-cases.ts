// The differential cases for ULT4's towne code: Talk to whoever is on each side of the party, a
// sign before a shopkeeper among them, with the towne's people read from the disk and TALK, LORD
// and the shops lifted on both sides; and the townsfolk moving, following and attacking.

import type { LiftedMachine } from '../../../src/app/lifted-runtime/lifted-machine';
import { COMMAND_ENTRIES } from '../../../src/app/port/program/ult4-commands-data';
import { MONSTER_ENTRIES } from '../../../src/app/port/program/ult4-monsters-data';
import { TOWNE_ENTRIES } from '../../../src/app/port/program/ult4-townes-data';
import { MAP_OBJECTS, PRTY, TILES, TRAINERS } from '../../../src/app/state/symbols';
import { COMMAND_STOPS, commanding, twoDrives } from './command-cases';
import { DIALOGUE_WORDS } from './dialogue';
import { byte } from './differential';
import type { ICase, Random } from './differential';
import { pick } from './ult4-cases';

type Key = { code: number; polls: number };

const O = MAP_OBJECTS;
const ARROWS: readonly (readonly [ number, number, number ])[] = [ [ 0x0B, 0, -1 ], [ 0x0A, 0, 1 ], [ 0x08, -1, 0 ], [ 0x15, 1, 0 ] ];
const FOLK: readonly number[] = [
  TILES.tile_guard, TILES.tile_beggar, TILES.tile_lord_british, TILES.tile_shopkeeper, 0x50, 0x54, 0x5A, TILES.tile_chest, 0x00,
];
const SHOP_SIGNS: readonly number[] = [ TILES.tile_sign_first, 0x6A, TILES.tile_sign_last - 1 ];
const SIGNS: readonly number[] = [ TILES.tile_sign_first, 0x6A, TILES.tile_sign_last - 1, TILES.tile_sign_last, TILES.tile_sign_last, TILES.tile_floor_brick ];
const WORDS: readonly string[] = [
  'NAME', 'LOOK', 'JOB', 'HEAL', 'JOIN', 'GIVE', 'GIVE', 'Y', 'N', 'N', 'MAYBE', 'XYZZY', '', '5', '12', '0', ...DIALOGUE_WORDS,
];
/** Keys most shops' questions take on the way out: no, nothing bought, food or ale for none, and ESC. */
const SHOP_LEAVING: readonly number[] = [ 0x4E, 0x30, 0x0D, 0x46, 0x30, 0x0D, 0x4E, 0x41, 0x30, 0x0D, 0x0D, 0x4E, 0x1B, 0x42, 0x53 ];
const AI: readonly number[] = [ 0x00, 0x01, 0x40, O.ai_toward_only, O.ai_hostile, O.ai_hostile ];
/** Where each company is met: the castle and Paws for their own shops, and a dungeon's or Britannia's location, where no one talks. */
const PLACES_TALKED_IN: Readonly<Record<string, readonly number[]>> = {
  anyone: [ 0x01, 0x05, 0x06, 0x08, 0x0C, 0x0D, 0x10, 0x00, 0x11, 0x12 ],
  dungeon: [ 0x10, 0x11, 0x11, 0x12 ],
  shops: [ 0x01, 0x01, 0x0D, 0x0D, 0x05, 0x10 ],
  lord: [ 0x01, 0x01, 0x05 ],
  teleport: [ 0x00, 0x00, 0x01 ],
};
const TOWNE_STOPS: readonly number[] = [ ...COMMAND_STOPS, COMMAND_ENTRIES.do_attack ];


/** What is about the party: anyone, anyone in a dungeon, shopkeepers across signs, Lord British, or Britannia's trainer that makes Talk teleport. */
type Company = 'anyone' | 'dungeon' | 'shops' | 'lord' | 'teleport';


/** A row of SHPS's for the location, as smoke-disks fills them, or Paws's or the castle's own: input_direction leaves the row talked across in dest_y. */
function shopRow(random: Random, location: number): number {
  const row: number = (((((location - 1) * 8) + pick(random, [ 0, 3, 6, 7, 7 ])) * 5) + 3) & 0x1F;

  const own: number = (location === PRTY.loc_village_paws) ? 0x18 : 0x19;

  return pick(random, [ row, row, own, own, (own === 0x18) ? 0x19 : 0x18, byte(random) & 0x1F ]);
}


/** In a towne, a castle or elsewhere, someone or no one on each side of the party, and a sign before a shopkeeper now and then. */
function talking(company: Company): (machine: LiftedMachine, random: Random) => void {
  return (machine: LiftedMachine, random: Random): void => {
    twoDrives(machine, random);
    machine.bload('program', 'TRAINERS');
    machine.write(PRTY.game_mode, (company === 'teleport') ? PRTY.mode_world : PRTY.mode_towne);
    machine.write(TRAINERS.trainer_travel, ((company === 'teleport') && (random() < 0.7)) ? 0x01 : 0x00);
    machine.write(PRTY.current_location, pick(random, PLACES_TALKED_IN[company]));
    machine.write(PRTY.player_xpos, 2 + Math.floor(random() * 28));
    machine.write(PRTY.player_ypos, (company === 'shops') ? shopRow(random, machine.read(PRTY.current_location)) : 2 + Math.floor(random() * 28));
    const x: number = machine.read(PRTY.player_xpos);
    const y: number = machine.read(PRTY.player_ypos);

    for (let slot: number = 0; slot <= O.object_max; slot++) {
      if (random() < 0.9) {
        machine.write(O.object_xpos + slot, (x + 3 + Math.floor(random() * 20)) & 0x1F);
      }
    }

    ARROWS.forEach(([ , dx, dy ]: readonly [ number, number, number ], side: number): void => {
      const slot: number = (side * 2) + Math.floor(random() * 2);
      const sign: boolean = (company === 'shops') || (random() < 0.2);
      const at: number = sign ? 2 : 1;
      const person: number = (company === 'lord') ? pick(random, [ TILES.tile_lord_british, TILES.tile_lord_british, TILES.tile_guard ]) : pick(random, FOLK);

      machine.write(O.towne_map + ((((y + dy) & 0x1F) * 0x20) + ((x + dx) & 0x1F)), sign ? pick(random, (company === 'shops') ? SHOP_SIGNS : SIGNS) : TILES.tile_floor_brick);
      machine.write(O.object_tile_type + slot, (company === 'shops') ? TILES.tile_shopkeeper : (sign ? pick(random, [ TILES.tile_shopkeeper, TILES.tile_guard ]) : person));
      machine.write(O.object_xpos + slot, (x + (dx * at)) & 0xFF);
      machine.write(O.object_ypos + slot, (y + (dy * at)) & 0xFF);
      machine.write(O.npc_dialogue + slot, pick(random, ((company === 'lord') || (company === 'dungeon')) ? [ 0x01, 0x05 ] : [ 0x00, 0x01, 0x02, 0x07, 0x10 ]));
    });
  };
}


/** A typed word and RETURN. SPACE is never one of the keys: it empties the type-ahead buffer. */
function word(text: string, random: Random): readonly Key[] {
  return [ ...[ ...text ].map((character: string): Key => ({ code: character.charCodeAt(0), polls: Math.floor(random() * 3) })), { code: 0x0D, polls: 0 } ];
}


/** A direction, then a talk's interests, farewells, and the keys a shop's questions take, until it is left. */
function conversation(random: Random): readonly Key[] {
  return conversationFrom(ARROWS, random);
}


/** East or west, across a counter on the party's own row: the row a shop is found by. */
function acrossTheCounter(random: Random): readonly Key[] {
  return conversationFrom(ARROWS.slice(2), random);
}


function conversationFrom(arrows: readonly (readonly [ number, number, number ])[], random: Random): readonly Key[] {
  const keys: Key[] = [ { code: pick(random, arrows)[0], polls: Math.floor(random() * 3) } ];

  for (let count: number = 1 + Math.floor(random() * 5); count > 0; count--) {
    const interest: string = pick(random, WORDS);

    keys.push(...word(interest, random));
    if (interest === 'GIVE') {
      keys.push(...word(pick(random, [ '0', '5', '12' ]), random));
    }
  }
  for (let bye: number = 0; bye < 4; bye++) {
    keys.push(...word('BYE', random));
  }
  for (let leave: number = 0; leave < 4; leave++) {
    keys.push(...SHOP_LEAVING.map((code: number): Key => ({ code, polls: 1 })));
  }

  return keys;
}


/** The townsfolk within three squares of the party, wandering, following or hostile, on a towne mostly of floor, some at its east edge. */
function townsfolk(machine: LiftedMachine, random: Random): void {
  commanding(machine, random);
  machine.write(PRTY.game_mode, PRTY.mode_towne);
  machine.write(PRTY.current_location, pick(random, [ 0x01, 0x05, 0x0D ]));
  const x: number = 3 + Math.floor(random() * 26);
  const y: number = 3 + Math.floor(random() * 26);

  machine.write(PRTY.player_xpos, x);
  machine.write(PRTY.player_ypos, y);
  for (let index: number = 0; index < 0x400; index++) {
    machine.write(O.towne_map + index, (random() < 0.7) ? TILES.tile_floor_brick : pick(random, [ TILES.tile_door_locked, 0x7F, TILES.tile_chest ]));
  }
  for (let slot: number = 0; slot <= O.object_max; slot++) {
    machine.write(O.npc_movement_ai + slot, pick(random, AI));
    machine.write(O.object_xpos + slot, (random() < 0.15) ? 0x1F : x + Math.floor(random() * 7) - 3);
    machine.write(O.object_ypos + slot, y + Math.floor(random() * 7) - 3);
    machine.write(O.object_xpos_prev + slot, byte(random) & 0x1F);
    machine.write(O.object_ypos_prev + slot, byte(random) & 0x1F);
  }
  machine.cpu.a = pick(random, [ PRTY.mode_towne, PRTY.mode_towne, PRTY.mode_towne, 0x10, 0x80 ]);
}


export const TOWNE_CASES: Readonly<Record<string, readonly [ number, ICase ]>> = {
  cmd_talk: [ TOWNE_ENTRIES.cmd_talk, { ult4: true, screen: true, stops: TOWNE_STOPS, keys: conversation, setup: talking('anyone') } ],
  cmd_talk_dungeon: [ TOWNE_ENTRIES.cmd_talk, { ult4: true, screen: true, stops: TOWNE_STOPS, keys: conversation, setup: talking('dungeon') } ],
  cmd_talk_shop: [ TOWNE_ENTRIES.cmd_talk, { ult4: true, screen: true, stops: TOWNE_STOPS, keys: acrossTheCounter, setup: talking('shops') } ],
  cmd_talk_lord: [ TOWNE_ENTRIES.cmd_talk, { ult4: true, screen: true, stops: TOWNE_STOPS, keys: conversation, setup: talking('lord') } ],
  cmd_talk_teleport: [ TOWNE_ENTRIES.cmd_talk, { ult4: true, screen: true, stops: TOWNE_STOPS, keys: conversation, setup: talking('teleport') } ],
  mobs_act_towne: [ TOWNE_ENTRIES.mobs_act_towne, { ult4: true, stops: TOWNE_STOPS, keys: (random: Random): readonly Key[] => word('N', random), setup: townsfolk } ],
  mobs_act_in_towne: [ MONSTER_ENTRIES.mobs_act, { ult4: true, stops: TOWNE_STOPS, keys: (random: Random): readonly Key[] => word('N', random), setup: townsfolk } ],
};
