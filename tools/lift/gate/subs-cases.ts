// The differential cases for SUBS: each jump-table entry with the inputs it takes.

import type { LiftedMachine } from '../../../src/app/lifted-runtime/lifted-machine';
import { ZP_MAIN } from '../../../src/app/state/symbols';
import { byte } from './differential';
import type { ICase, Random } from './differential';

const KEY: (random: Random) => { code: number; polls: number } = (random: Random): { code: number; polls: number } =>
  ({ code: 0x20 + Math.floor(random() * 0x5F), polls: Math.floor(random() * 6) });

/** Up to 20 printable high-bit characters, sometimes a newline, then the terminator. */
function text(random: Random, terminator: number): number[] {
  const length: number = Math.floor(random() * 20);

  return [ ...Array.from({ length }, (): number => ((random() < 0.1) ? 0x8D : (0xA0 + Math.floor(random() * 0x5F)))), terminator ];
}


function line(random: Random): number[] {
  return [ Math.floor(random() * 30), Math.floor(random() * 22), ...Array.from({ length: Math.floor(random() * 10) }, (): number => byte(random) & 0x7F), 0xFF ];
}


function digits(machine: LiftedMachine, keys: readonly number[]): void {
  keys.forEach((key: number, index: number): void => machine.apple.write(ZP_MAIN.key_buf + index, key));
  machine.apple.write(ZP_MAIN.key_buf_len, keys.length);
}


function digitKeys(random: Random): number[] {
  const pool: readonly number[] = [ 0xB0, 0xB1, 0xB5, 0xB9, 0x8D, 0x88, 0xC1 ];

  return [ ...Array.from({ length: 5 }, (): number => pool[Math.floor(random() * pool.length)]), 0xB1, 0x8D, 0x8D ];
}


export const SUBS_CASES: Readonly<Record<string, readonly [ number, ICase ]>> = {
  waitkey: [ 0x0800, { key: KEY } ],
  player_teleport: [ 0x0803, {} ],
  move_east: [ 0x0806, {} ],
  move_west: [ 0x0809, {} ],
  move_south: [ 0x080C, {} ],
  move_north: [ 0x080F, {} ],
  drawinterface: [ 0x0812, {} ],
  drawview: [ 0x0815, { key: KEY } ],
  update_britannia: [ 0x0818, { key: KEY } ],
  primm_cout: [ 0x081B, { inline: (random: Random): number[] => text(random, 0x00).map((value: number): number => value & 0x7F) } ],
  primm_xy: [ 0x081E, { inline: (random: Random): number[] => text(random, 0x00) } ],
  primm: [ 0x0821, { inline: (random: Random): number[] => text(random, 0x00) } ],
  console_out: [ 0x0824, {} ],
  clearbitmap: [ 0x0827, {} ],
  mulax: [ 0x082A, {} ],
  get_stats_ptr: [ 0x082D, {} ],
  printname: [ 0x0830, {} ],
  printbcd: [ 0x0833, {} ],
  drawcursor: [ 0x0836, {} ],
  drawcursor_xy: [ 0x0839, { setup: (machine: LiftedMachine, random: Random): void => {
    machine.cpu.x = Math.floor(random() * 40);
    machine.cpu.y = Math.floor(random() * 24);
  } } ],
  drawvert: [ 0x083C, { inline: line } ],
  drawhoriz: [ 0x083F, { inline: line } ],
  request_disk: [ 0x0842, { setup: (machine: LiftedMachine, random: Random): void => {
    machine.cpu.a = 1 + Math.floor(random() * 4);
    machine.apple.write(ZP_MAIN.numdrives, 1);
    machine.apple.write(ZP_MAIN.currdisk_drive1, machine.cpu.a);
  } } ],
  update_status: [ 0x0845, {} ],
  blocked_tile: [ 0x0848, {} ],
  update_view: [ 0x084B, { key: KEY } ],
  rand: [ 0x084E, {} ],
  loadsector: [ 0x0851, { setup: (machine: LiftedMachine): void => {
    machine.apple.write(ZP_MAIN.diskio_command, 1);
  } } ],
  playsfx: [ 0x0854, { setup: (machine: LiftedMachine, random: Random): void => {
    machine.cpu.a = Math.floor(random() * 13);
    machine.cpu.x = 1 + Math.floor(random() * 8);
  } } ],
  update_view_combat: [ 0x0857, {} ],
  getnumber: [ 0x085A, { setup: (machine: LiftedMachine, random: Random): void => digits(machine, digitKeys(random)) } ],
  getnumber_typed: [ 0x085A, { keys: (random: Random): readonly { code: number; polls: number }[] =>
    digitKeys(random).map((code: number): { code: number; polls: number } => ({ code: code & 0x7F, polls: Math.floor(random() * 12) })) } ],
  getplayernum: [ 0x085D, { setup: (machine: LiftedMachine, random: Random): void => digits(machine, [ 0xB0 + Math.floor(random() * 10) ]) } ],
  update_wind: [ 0x0860, {} ],
  animate_view: [ 0x0863, { key: KEY } ],
  printdigit: [ 0x0866, {} ],
  clearstatwindow: [ 0x0869, {} ],
  animate_tiles: [ 0x086C, {} ],
  centername: [ 0x086F, {} ],
  print_direction: [ 0x0872, {} ],
  clearview: [ 0x0875, {} ],
  invertview: [ 0x0878, {} ],
  centerstring: [ 0x087B, { setup: (machine: LiftedMachine, random: Random): void => {
    machine.cpu.a = 1 + Math.floor(random() * 170);
  } } ],
  printstring: [ 0x087E, { setup: (machine: LiftedMachine, random: Random): void => {
    machine.cpu.a = 1 + Math.floor(random() * 170);
  } } ],
  gettile_bounds: [ 0x0881, {} ],
  gettile_britannia: [ 0x0884, {} ],
  gettile_opposite: [ 0x0887, {} ],
  gettile_drawn_map: [ 0x088A, {} ],
  gettile_actual_map: [ 0x088D, {} ],
  get_player_tile: [ 0x0890, {} ],
  gettile_towne: [ 0x0893, {} ],
  gettile_dungeon: [ 0x0896, {} ],
  math_sign: [ 0x0899, {} ],
};

