// The differential cases for the towne's shops and MIX: each loaded from the towne disk in one of the
// townes that has it, with the party's gold, arms, food, reagents, mixtures and virtues drawn at
// random, and keys for its questions drawn from the answers they take, ending with ones that leave
// whatever question is being asked.

import type { LiftedMachine } from '../../../src/app/lifted-runtime/lifted-machine';
import type { INativeModule } from '../../../src/app/lifted-runtime/native-module';
import { OVERLAY_ENTRY } from '../../../src/app/port/program/overlay';
import { MIXTURE_TABLE, MIX_MODULE } from '../../../src/app/port/program/towne/mix';
import { SHP0_MODULE } from '../../../src/app/port/program/towne/shp0';
import { SHP1_MODULE } from '../../../src/app/port/program/towne/shp1';
import { SHP2_MODULE } from '../../../src/app/port/program/towne/shp2';
import { SHP3_MODULE } from '../../../src/app/port/program/towne/shp3';
import { SHP4_MODULE } from '../../../src/app/port/program/towne/shp4';
import { DISKS, PRTY, ROST, TRAINERS, ZP_MAIN } from '../../../src/app/state/symbols';
import type { Random } from './differential';
import { bcd, inventory, loaded, party, typedWord } from './overlay-cases';
import type { IOverlayCase, Key } from './overlay-cases';
import { STOPS, pick, world } from './ult4-cases';

const RETURN: number = 0x0D;
const SHOPPING_CYCLES: number = 200_000_000;
const WEAPONRIES: readonly number[] = [ 0x06, 0x07, 0x09, 0x0A, 0x0E, 0x0F ];
const ARMOURIES: readonly number[] = [ 0x06, 0x07, 0x0A, 0x0D, 0x0E ];
const WEAPONS: string = 'BCDEFGHIJKLMNOPQ';
const ARMOUR: string = 'BCDEFGHI';
const PUB_SUBJECTS: readonly string[] = [ 'BLACK STONE', 'SEXTANT', 'WHITE STONE', 'MANDRAKE', 'SKULL', 'NIGHTSHADE' ];
const PUB_TOWNES: readonly number[] = [ 0x06, 0x07, 0x0A, 0x0D, 0x0E, 0x0F ];
const DIGITS: readonly string[] = [ '0', '1', '2', '3', '5', '9', '12', '25', '99' ];


/** In one of `townes`, the party's belongings at random, gold from none to all it can hold. */
function shopping(townes: readonly number[]): (machine: LiftedMachine, random: Random) => void {
  return (machine: LiftedMachine, random: Random): void => {
    world(machine, random);
    party(machine, random);
    inventory(machine, random);
    machine.write(PRTY.game_mode, PRTY.mode_towne);
    machine.write(PRTY.current_location, pick(random, townes));
    machine.write(ZP_MAIN.currdisk_drive1, DISKS.disk_towne);
    machine.insertDisk(1, 'towne');
    machine.write(ROST.party_stats + ROST.party_stat_gold_hi, pick(random, [ 0x00, 0x01, 0x05, 0x20, 0x50, 0x99, 0x99 ]));
    machine.write(ROST.party_stats + ROST.party_stat_gold_lo, pick(random, [ 0x00, 0x02, 0x10, 0x99, bcd(random) ]));
    machine.write(ROST.party_stats + ROST.party_stat_food_hi, pick(random, [ 0x00, 0x05, 0x99 ]));
    machine.write(ROST.party_stats + ROST.party_stat_food_lo, pick(random, [ 0x00, 0x80, 0x99, bcd(random) ]));
    for (let index: number = 0; index < 0x18; index++) {
      machine.write(ROST.armour + index, pick(random, [ 0x00, 0x01, 0x05, 0x98, 0x99 ]));
    }
    for (let index: number = 0; index < 0x1A; index++) {
      machine.write(ROST.mixtures + index, pick(random, [ 0x00, 0x00, 0x01, 0x12, 0x99 ]));
    }
    machine.write(TRAINERS.trainer_price, (random() < 0.5) ? 0x01 : 0x00);
    machine.write(ZP_MAIN.key_buf_len, 0x00);
  };
}


function keyed(codes: readonly (string | number)[], random: Random): Key[] {
  return codes.map((code: string | number): Key => ({ code: (typeof code === 'string') ? code.charCodeAt(0) : code, polls: Math.floor(random() * 3) }));
}


/** Keys from `answers`, then `leaving` over and over: those that end whichever question is left. */
function shopKeys(first: readonly string[], answers: (random: Random) => readonly (string | number)[], leaving: readonly (string | number)[]): (random: Random) => readonly Key[] {
  return (random: Random): readonly Key[] => {
    const keys: Key[] = keyed([ ...pick(random, first) ], random);

    for (let count: number = 4 + Math.floor(random() * 12); count > 0; count--) {
      keys.push(...keyed(answers(random), random));
    }
    for (let leave: number = 0; leave < 8; leave++) {
      keys.push(...keyed(leaving, random));
    }

    return keys;
  };
}


/** An amount for j_getnumber, which waits for a digit first, and RETURN. */
function amount(random: Random): (string | number)[] {
  return [ ...pick(random, DIGITS), RETURN ];
}


function letter(random: Random, letters: string): string {
  return letters[Math.floor(random() * letters.length)];
}


/** SHP0 and SHP1: a ware's letter, never A, which leaves, and yes or no to it. */
function armsAnswer(wares: string): (random: Random) => (string | number)[] {
  return (random: Random): (string | number)[] => [ letter(random, wares), pick(random, [ 'Y', 'Y', 'Y', 'N' ]) ];
}


/** SHP2: yes or no, or an amount of packs. */
function foodAnswer(random: Random): (string | number)[] {
  return (random() < 0.5) ? [ pick(random, [ 'Y', 'Y', 'N' ]) ] : amount(random);
}


/** SHP3: food, or ale paid for and a subject asked, mostly the pub's own, and a bribe; and yes to more. */
function pubAnswer(subject: string): (random: Random) => (string | number)[] {
  return (random: Random): (string | number)[] => {
    const choice: number = random();
    let keys: (string | number)[];

    if (choice < 0.25) {
      keys = [ 'F', ...amount(random) ];
    } else if (choice < 0.85) {
      const asked: string = (random() < 0.7) ? subject : pick(random, PUB_SUBJECTS);

      keys = [ 'A', ...pick(random, [ '1', '2', '3', '5', '25', '99' ]), RETURN, ...typedWord(asked, random).map((key: Key): number => key.code), ...amount(random), ...amount(random) ];
    } else {
      keys = [ pick(random, [ 'F', 'A', 'Y', 'N', 'X' ]) ];
    }

    return [ ...keys, pick(random, [ 'Y', 'Y', 'Y', 'N' ]) ];
  };
}


/** SHP4: a reagent's letter, mostly one sold, a count, an amount paid, and yes to more. */
function reagentAnswer(random: Random): (string | number)[] {
  return [ letter(random, 'ABCDEFABCDEFGZ'), letter(random, '01234567899'), ...amount(random), pick(random, [ 'Y', 'Y', 'Y', 'N' ]) ];
}


/** MIX: a spell, then its own reagents or any, one maybe twice, and RETURN to mix. */
function mixAnswer(random: Random): (string | number)[] {
  const spell: number = Math.floor(random() * MIXTURE_TABLE.length);
  const mixture: number = (random() < 0.5) ? MIXTURE_TABLE[spell] : Math.floor(random() * 0x100);
  const reagents: string[] = [ ...'ABCDEFGH' ].filter((_: string, index: number): boolean => (mixture & (0x80 >> index)) !== 0);

  const again: string[] = (reagents.length > 0) && (random() < 0.3) ? [ pick(random, reagents) ] : [];

  return [ String.fromCharCode(0x41 + spell), ...reagents, ...again, ...((random() < 0.2) ? [ letter(random, 'ABCDEFGHIZ') ] : []), RETURN ];
}


function shopCase(module: INativeModule, townes: readonly number[], keys: (random: Random) => readonly Key[]): IOverlayCase {
  return { module, entry: OVERLAY_ENTRY, testCase: { ult4: true, screen: true, stops: STOPS, cycles: SHOPPING_CYCLES, keys, setup: loaded(module.name, shopping(townes), 'towne') } };
}


export const SHOP_CASES: Readonly<Record<string, IOverlayCase>> = {
  shp0_buy: shopCase(SHP0_MODULE, WEAPONRIES, shopKeys([ 'B', 'XB' ], armsAnswer(WEAPONS), [ 'N', 'A' ])),
  shp0_sell: shopCase(SHP0_MODULE, WEAPONRIES, shopKeys([ 'S', 'XS' ], armsAnswer(WEAPONS), [ 'N', 'A' ])),
  shp1_buy: shopCase(SHP1_MODULE, ARMOURIES, shopKeys([ 'B', 'XB' ], armsAnswer(ARMOUR), [ 'N', 'A' ])),
  shp1_sell: shopCase(SHP1_MODULE, ARMOURIES, shopKeys([ 'S', 'XS' ], armsAnswer(ARMOUR), [ 'N', 'A' ])),
  shp2: shopCase(SHP2_MODULE, [ 0x05, 0x06, 0x08, 0x0B, 0x0D ], shopKeys([ 'Y', 'Y', 'N' ], foodAnswer, [ '0', RETURN, 'N' ])),
  ...Object.fromEntries(PUB_TOWNES.map((towne: number, pub: number): [ string, IOverlayCase ] => [
    `shp3_${ pub }`,
    shopCase(SHP3_MODULE, [ towne ], shopKeys([ 'F', 'A', 'A' ], pubAnswer(PUB_SUBJECTS[pub]), [ 'A', '0', RETURN, 'N' ])),
  ])),
  shp4: shopCase(SHP4_MODULE, [ 0x05, 0x0B, 0x0D, 0x0E ], shopKeys([ 'Y', 'Y', 'Y', 'N' ], reagentAnswer, [ 'N', 'G', '9', RETURN ])),
  mix: shopCase(MIX_MODULE, [ 0x05, 0x06, 0x01 ], shopKeys([ 'A', 'B', 'Q', '1' ], mixAnswer, [ RETURN, '1' ])),
};
