import type { LiftedMachine } from '../../lifted-runtime/lifted-machine';
import type { INativeModule, NativeRoutine } from '../../lifted-runtime/native-module';
import { JUMP_TRAINERS, MAP_OBJECTS, PRTY, TILES, ZP_MAIN } from '../../state/symbols';
import { RETURN, subsMachine } from '../testing/subs-machine';
import { ULT4_ENTRIES } from './ult4-data';
import { ULT4_MODULE } from './ult4-module';
import { TOWNE_ENTRIES } from './ult4-townes-data';

// ULT4's towne code with nothing lifted: what needs no overlay, run with the ported SUBS.

const E = ULT4_ENTRIES;
const O = MAP_OBJECTS;
const PERSON: number = 0x05;
const UP_ARROW: number = 0x0B;
const NOT_A_DIRECTION: number = 0x5A;

/** The trainers, all off: Talk's teleport returns at once. */
const TRAINERS_OFF: INativeModule = {
  disk: 'program',
  name: 'TRAINERS',
  load: JUMP_TRAINERS.j_trainer_teleport,
  install: (): void => undefined,
  entries: new Map<number, NativeRoutine>([ [ JUMP_TRAINERS.j_trainer_teleport, (machine: LiftedMachine): Promise<void> => Promise.resolve(machine.rts()) ] ]),
};


/** The party at (10, 10) of a towne all floor, and one townsperson at (10, 5) moving as `ai`. */
function towne(ai: number): LiftedMachine {
  const machine: LiftedMachine = subsMachine([ ULT4_MODULE, TRAINERS_OFF ]);

  machine.bload('program', 'ULT4');
  machine.bload('program', 'TRAINERS');
  machine.write(PRTY.game_mode, PRTY.mode_towne);
  machine.write(PRTY.current_location, 0x05);
  machine.write(PRTY.player_xpos, 0x0A);
  machine.write(PRTY.player_ypos, 0x0A);
  for (let index: number = 0; index < 0x400; index++) {
    machine.write(O.towne_map + index, TILES.tile_floor_brick);
  }
  for (let slot: number = 0; slot <= O.object_max; slot++) {
    machine.write(O.object_tile_type + slot, 0x00);
  }
  machine.write(O.object_tile_type + PERSON, TILES.tile_guard);
  machine.write(O.object_xpos + PERSON, 0x0A);
  machine.write(O.object_ypos + PERSON, 0x05);
  machine.write(O.npc_movement_ai + PERSON, ai);

  return machine;
}


async function townsfolkAct(machine: LiftedMachine, mode: number = PRTY.mode_towne): Promise<LiftedMachine> {
  machine.cpu.a = machine.cpu.nz(mode);
  machine.cpu.pushWord(RETURN - 1);
  machine.cpu.pc = TOWNE_ENTRIES.mobs_act_towne;
  await machine.runUntil((): boolean => machine.cpu.pc === RETURN);

  return machine;
}


async function talk(machine: LiftedMachine, key: number, next: number): Promise<LiftedMachine> {
  machine.write(ZP_MAIN.key_buf_len, 0x00);
  machine.pending = { code: key, polls: 2 };
  machine.cpu.pc = TOWNE_ENTRIES.cmd_talk;
  await machine.runUntil((): boolean => machine.cpu.pc === next);

  return machine;
}


describe('ULT4\'s towne code, ported', (): void => {
  describe('mobs_act_towne', (): void => {
    it('leaves a townsperson who keeps still where they are', async (): Promise<void> => {
      expect((await townsfolkAct(towne(0x00))).read(O.object_ypos + PERSON)).toBe(0x05);
    });

    it('steps a follower toward the party', async (): Promise<void> => {
      expect((await townsfolkAct(towne(O.ai_toward_only))).read(O.object_ypos + PERSON)).toBe(0x06);
    });

    it('remembers where the follower stepped from', async (): Promise<void> => {
      expect((await townsfolkAct(towne(O.ai_toward_only))).read(O.object_ypos_prev + PERSON)).toBe(0x05);
    });

    it('moves no one in a fight', async (): Promise<void> => {
      expect((await townsfolkAct(towne(O.ai_toward_only), 0x80)).read(O.object_ypos + PERSON)).toBe(0x05);
    });
  });

  describe('cmd_talk', (): void => {
    it('passes for a key that is no direction', async (): Promise<void> => {
      expect((await talk(towne(0x00), NOT_A_DIRECTION, E.done_pass)).cpu.pc).toBe(E.done_pass);
    });

    it('reads nothing from the disk for no one there', async (): Promise<void> => {
      const machine: LiftedMachine = towne(0x00);

      machine.write(ZP_MAIN.diskio_track, 0x42);

      expect((await talk(machine, UP_ARROW, E.cmd_done)).read(ZP_MAIN.diskio_track)).toBe(0x42);
    });
  });
});
