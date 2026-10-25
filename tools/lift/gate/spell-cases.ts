// The differential cases for ULT4's spells: each entry with a caster in Britannia, a towne, a
// dungeon or a fight, the mixtures and magic points that pay for the spell, the auras, and the
// players asleep, poisoned or dead. A spell that jumps on is stopped at its next step.

import type { LiftedMachine } from '../../../src/app/lifted-runtime/lifted-machine';
import { COMBAT_ENTRIES } from '../../../src/app/port/program/ult4-combat-data';
import { COMMAND_ENTRIES } from '../../../src/app/port/program/ult4-commands-data';
import { ULT4_ENTRIES } from '../../../src/app/port/program/ult4-data';
import { SPELL_ENTRIES, SPELL_ROUTINES, SPELL_VARIABLES } from '../../../src/app/port/program/ult4-spells-data';
import { DISKS, MAP_OBJECTS, PRTY, ROST, TILES, TRAINERS, ZP_MAIN } from '../../../src/app/state/symbols';
import { ARROWS, COMBAT_STOPS, FOES, battle, keyOf } from './combat-cases';
import { byte } from './differential';
import type { ICase, Random } from './differential';
import { pick, world } from './ult4-cases';

const S = SPELL_ENTRIES;
const E = ULT4_ENTRIES;
const O = MAP_OBJECTS;

type Key = { code: number; polls: number };

const DIGITS: readonly number[] = [ 0x31, 0x32, 0x33, 0x35, 0x38, 0x39, 0x30 ];
const LETTERS: readonly number[] = [ ...Array.from({ length: 26 }, (_: unknown, index: number): number => 0x41 + index), 0x5A, 0x5A, 0x5B, 0x40 ];
const SPELL_KEYS: readonly number[] = [ ...ARROWS, ...DIGITS, 0x50, 0x4C, 0x46, 0x53, 0x5A, 0x20 ];
const AURAS: readonly number[] = [ 0x25, 0x25, 0x25, ZP_MAIN.aura_negate, ZP_MAIN.aura_jinx, ZP_MAIN.aura_protect ];
const SPRITES: readonly number[] = [ TILES.tile_attack_small, TILES.tile_attack_blue, TILES.tile_attack_red, TILES.tile_whirlpool, 0x00 ];
/** The ground a spell may land on or clear: fields, open ground, water and walls. */
const GROUND: readonly number[] = [ 0x44, 0x45, 0x46, 0x47, 0x48, 0x04, 0x04, 0x00, 0x02, 0x08, 0x3C, 0x7F ];
/** A dungeon's squares: open, fields of each kind, a door, walls. */
const DUNGEON_SQUARES: readonly number[] = [ 0x00, 0x00, 0x00, 0xA0, 0xA1, 0xA2, 0xA3, 0xA5, 0xB0, 0xC0, 0xF0, 0x10 ];


/** The caster's mixtures, magic points and aura, the dead in the party, and the ground about. */
function caster(machine: LiftedMachine, random: Random): void {
  const player: number = machine.read(ZP_MAIN.curr_player) - 1;
  const stats: number = ROST.player_stats + ((player & 0x07) * 0x20);

  machine.write(SPELL_VARIABLES.current_spell, Math.floor(random() * 26));
  for (let spell: number = 0; spell < 26; spell++) {
    machine.write(ROST.mixtures + spell, pick(random, [ 0x00, 0x01, 0x05, 0x99 ]));
  }
  machine.write(TRAINERS.trainer_magic, (random() < 0.2) ? 0x01 : 0x00);
  machine.write(stats + ROST.player_magic_points, pick(random, [ 0x00, 0x05, 0x20, 0x50, 0x99 ]));
  for (let other: number = 0; other < 8; other++) {
    if (random() < 0.2) {
      machine.write(ROST.player_stats + (other * 0x20) + ROST.player_status, ROST.status_Dead);
    }
  }
  machine.write(ZP_MAIN.magic_aura, pick(random, AURAS));
  machine.write(O.attack_sprite, pick(random, SPRITES));
  machine.write(PRTY.current_location, pick(random, [ 0x00, 0x00, 0x05, 0x11, PRTY.loc_dng_abyss ]));
  for (let index: number = 0; index < 11 * 11; index++) {
    if (random() < 0.3) {
      machine.write(O.world_tiles + index, pick(random, GROUND));
    }
  }
  for (let index: number = 0; index < 0x400; index++) {
    machine.write(O.world_map_NW + index, pick(random, GROUND));
  }
}


/** Britannia, on foot or on horseback, with no aura to negate the spell. */
function outdoors(machine: LiftedMachine, random: Random): void {
  casting(machine, random);
  machine.write(PRTY.game_mode, (random() < 0.85) ? PRTY.mode_world : PRTY.mode_towne);
  machine.write(PRTY.player_transport, pick(random, [ 0x1F, 0x1F, 0x14, 0x10 ]));
  machine.write(PRTY.player_xpos, pick(random, [ 0xC0, 0xC1, 0x40, 0x80, byte(random) ]));
  machine.write(PRTY.player_ypos, pick(random, [ 0xC0, 0xC1, 0x40, 0x80, byte(random) ]));
  machine.write(ZP_MAIN.magic_aura, (random() < 0.9) ? 0x25 : ZP_MAIN.aura_negate);
  machine.write(PRTY.map_x, (machine.read(PRTY.player_xpos) >> 4) - Math.floor(random() * 2));
  machine.write(PRTY.map_y, (machine.read(PRTY.player_ypos) >> 4) - Math.floor(random() * 2));
}


/** The party mostly in the state the spell mends. */
function patients(status: number): (machine: LiftedMachine, random: Random) => void {
  return (machine: LiftedMachine, random: Random): void => {
    casting(machine, random);
    for (let player: number = 0; player < 8; player++) {
      if (random() < 0.7) {
        machine.write(ROST.player_stats + (player * 0x20) + ROST.player_status, status);
      }
    }
    machine.write(ZP_MAIN.magic_aura, (random() < 0.9) ? 0x25 : ZP_MAIN.aura_negate);
  };
}


/** A caster about to cast: in a fight half the time, else in Britannia, a towne or a dungeon. */
function casting(machine: LiftedMachine, random: Random): void {
  if (random() < 0.5) {
    battle(machine, random);
  } else {
    world(machine, random);
    machine.write(ZP_MAIN.curr_player, 1 + Math.floor(random() * machine.read(PRTY.party_size)));
  }
  caster(machine, random);
}


/** A fight, for the spells that hit foes. */
function fighting(machine: LiftedMachine, random: Random): void {
  battle(machine, random);
  caster(machine, random);
}


/** A dungeon, for the spells that only work there. */
function underground(machine: LiftedMachine, random: Random): void {
  casting(machine, random);
  machine.write(PRTY.game_mode, (random() < 0.8) ? PRTY.mode_dungeon : pick(random, [ PRTY.mode_world, 0x80 ]));
  machine.write(PRTY.player_xpos, Math.floor(random() * 8));
  machine.write(PRTY.player_ypos, Math.floor(random() * 8));
  machine.write(ZP_MAIN.magic_aura, (random() < 0.9) ? 0x25 : ZP_MAIN.aura_negate);
  for (let index: number = 0; index < 0x200; index++) {
    machine.write(O.dng_map + index, pick(random, DUNGEON_SQUARES));
  }
}


/** The cast: a player, a spell, and what the spell asks for. */
function cast(random: Random): readonly Key[] {
  return [
    { code: pick(random, DIGITS), polls: 1 }, { code: pick(random, LETTERS), polls: 1 },
    { code: pick(random, SPELL_KEYS), polls: 1 }, { code: pick(random, SPELL_KEYS), polls: 1 },
  ];
}


/** Where a spell goes next: the labels it jumps to, never the ones it calls. */
const SPELL_STOPS: readonly number[] = [
  ...COMBAT_STOPS, ...SPELL_ROUTINES, S.failed, S.do_fireball, S.launch_attack_spell, S.spell_attack_failed, S.set_spell_aura, S.res_view_fail,
  S.try_resurrect, COMMAND_ENTRIES.try_get_chest, COMBAT_ENTRIES.try_get_chest_combat, E.done_done, E.done_have_none,
  E.done_disabled, E.done_not_a_player,
];


function spell(entry: number, extra?: Partial<ICase>): readonly [ number, ICase ] {
  return [ entry, { ult4: true, stops: SPELL_STOPS, key: keyOf(SPELL_KEYS), setup: casting, ...extra } ];
}


export const SPELL_CASES: Readonly<Record<string, readonly [ number, ICase ]>> = {
  cmd_cast: spell(S.cmd_cast, { key: undefined, keys: cast }),
  choose_spell: spell(S.choose_spell, { key: undefined, keys: (random: Random): readonly Key[] => cast(random).slice(1) }),
  spell_awake: spell(S.spell_awake, { setup: patients(ROST.status_Sleep) }),
  spell_blink: spell(S.spell_blink, { setup: outdoors, key: keyOf(ARROWS) }),
  add_delta: spell(S.add_delta),
  sub_delta: spell(S.sub_delta),
  spell_cure: spell(S.spell_cure, { setup: patients(ROST.status_Poison) }),
  spell_dispel_field: spell(S.spell_dispel_field),
  spell_dispel_field_outdoors: spell(S.spell_dispel_field, { setup: outdoors }),
  spell_dispel_field_dungeon: spell(S.spell_dispel_field, { setup: underground }),
  spell_energy_field: spell(S.spell_energy_field, { key: undefined, keys: (random: Random): readonly Key[] => cast(random).slice(2) }),
  spell_energy_field_dungeon: spell(S.spell_energy_field, { setup: underground, key: keyOf([ 0x50, 0x4C, 0x46, 0x53, 0x41 ]) }),
  spell_fireball: spell(S.spell_fireball, { setup: fighting }),
  spell_attack_failed: spell(S.spell_attack_failed),
  do_fireball: spell(S.do_fireball, { setup: fighting }),
  launch_attack_spell: spell(S.launch_attack_spell, { setup: fighting }),
  spell_gate: spell(S.spell_gate, { setup: outdoors, key: keyOf([ ...DIGITS, 0x34, 0x36, 0x37 ]) }),
  spell_heal: spell(S.spell_heal, { setup: patients(ROST.status_Poison) }),
  spell_iceball: spell(S.spell_iceball, { setup: fighting }),
  spell_jinx: spell(S.spell_jinx),
  set_spell_aura: spell(S.set_spell_aura),
  spell_kill: spell(S.spell_kill, { setup: fighting }),
  spell_light: spell(S.spell_light),
  spell_missile: spell(S.spell_missile, { setup: fighting }),
  spell_negate: spell(S.spell_negate),
  spell_open_chest: spell(S.spell_open_chest),
  spell_protect: spell(S.spell_protect),
  spell_quickness: spell(S.spell_quickness),
  spell_resurrect: spell(S.spell_resurrect),
  res_view_fail: spell(S.res_view_fail),
  try_resurrect: spell(S.try_resurrect, { setup: patients(ROST.status_Dead) }),
  spell_sleep: spell(S.spell_sleep, { setup: fighting }),
  spell_tremor: spell(S.spell_tremor, { setup: fighting }),
  spell_undead: spell(S.spell_undead, { setup: fighting }),
  spell_view: spell(S.spell_view),
  spell_wind: spell(S.spell_wind, { setup: outdoors }),
  spell_x_it: spell(S.spell_x_it, { setup: underground }),
  spell_y_up: spell(S.spell_y_up, { setup: underground }),
  spell_z_down: spell(S.spell_z_down, { setup: underground }),
  not_abyss: spell(S.not_abyss),
  dungeon_only: spell(S.dungeon_only),
  combat_only: spell(S.combat_only),
  outdoors_only: spell(S.outdoors_only),
  spell_effect: spell(S.spell_effect),
  failed: spell(S.failed),
  is_undead: spell(S.is_undead, { setup: (machine: LiftedMachine, random: Random): void => {
    casting(machine, random);
    machine.cpu.a = pick(random, [ ...FOES, TILES.tile_ghost, TILES.tile_phantom, TILES.tile_skeleton, TILES.tile_liche ]);
  } }),
  prompt_direction: spell(S.prompt_direction),
  cmd_mix_reagents: spell(S.cmd_mix_reagents, { key: undefined, keys: (random: Random): readonly Key[] => [ 0x1B, 0x0D, 0x41, 0x1B, 0x0D, 0x1B ]
    .map((code: number): Key => ({ code, polls: Math.floor(random() * 3) })), setup: (machine: LiftedMachine, random: Random): void => {
    casting(machine, random);
    machine.write(PRTY.game_mode, PRTY.mode_towne);
    machine.write(ZP_MAIN.currdisk_drive1, DISKS.disk_towne);
    machine.insertDisk(1, 'towne');
  } }),
  next_line: spell(S.next_line),
  display_reagents: spell(S.display_reagents, { setup: (machine: LiftedMachine, random: Random): void => {
    casting(machine, random);
    for (let reagent: number = 0; reagent < ROST.reagent_max; reagent++) {
      machine.write(ROST.party_stats + ROST.party_stat_reagents + reagent, pick(random, [ 0x00, 0x01, 0x09, 0x10, 0x99 ]));
    }
  } }),
  display_spells: spell(S.display_spells),
  save_cursor: spell(S.save_cursor),
  restore_cursor: spell(S.restore_cursor),
};
