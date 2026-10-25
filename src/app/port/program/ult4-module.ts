import type { LiftedMachine } from '../../lifted-runtime/lifted-machine';
import type { INativeModule, NativeRoutine } from '../../lifted-runtime/native-module';
import { exitRoutine } from '../routine';
import type { Exit } from '../routine';
import { Ult4 } from './ult4';
import { ULT4_ENTRIES, ULT4_LOAD, ult4Data } from './ult4-data';

// ULT4 as a native module ported in part: its lifted module still runs everything else, and these
// entries run natively. Each returns where control goes: its RTS, or the address it jumps to.

type Body = (program: Ult4) => Exit | Promise<Exit>;

const E = ULT4_ENTRIES;

const BODIES: readonly [ number, Body ][] = [
  [ E.game_init, (p: Ult4): Promise<Exit> => p.gameInit() ],
  [ E.load_saved_game, (p: Ult4): Promise<Exit> => p.loadSavedGame() ],
  [ E.halt, (p: Ult4): Exit => p.halt() ],
  [ E.load_saved_map, (p: Ult4): Promise<Exit> => p.loadSavedMap() ],
  [ E.game_start, (p: Ult4): Promise<Exit> => p.gameStart() ],
  [ E.next_turn, (p: Ult4): Promise<Exit> => p.nextTurn() ],
  [ E.check_cmd_alpha, (p: Ult4): Exit => p.checkCmdAlpha() ],
  [ E.cmd_timeout, (p: Ult4): Promise<Exit> => p.cmdTimeout() ],
  [ E.done_pass, (p: Ult4): Promise<Exit> => p.donePass() ],
  [ E.done_what, (p: Ult4): Promise<Exit> => p.doneWhat() ],
  [ E.done_sound_deny, (p: Ult4): Promise<Exit> => p.doneSoundDeny() ],
  [ E.done_not_a_player, (p: Ult4): Promise<Exit> => p.doneNotAPlayer() ],
  [ E.done_only_on_foot, (p: Ult4): Promise<Exit> => p.doneOnlyOnFoot() ],
  [ E.done_nothing_there, (p: Ult4): Promise<Exit> => p.doneNothingThere() ],
  [ E.done_slow_progress, (p: Ult4): Promise<Exit> => p.doneSlowProgress() ],
  [ E.done_not_here, (p: Ult4): Promise<Exit> => p.doneNotHere() ],
  [ E.done_cant, (p: Ult4): Promise<Exit> => p.doneCant() ],
  [ E.done_aborted, (p: Ult4): Promise<Exit> => p.doneAborted() ],
  [ E.done_done, (p: Ult4): Promise<Exit> => p.doneDone() ],
  [ E.done_have_none, (p: Ult4): Promise<Exit> => p.doneHaveNone() ],
  [ E.done_disabled, (p: Ult4): Promise<Exit> => p.doneDisabled() ],
  [ E.done_blocked, (p: Ult4): Promise<Exit> => p.doneBlocked() ],
  [ E.done_drift_only, (p: Ult4): Promise<Exit> => p.doneDriftOnly() ],
  [ E.cmd_direction_up, (p: Ult4): Promise<Exit> => p.cmdDirectionUp() ],
  [ E.dng_move, (p: Ult4): Exit => p.dngMove() ],
  [ E.cmd_direction_down, (p: Ult4): Promise<Exit> => p.cmdDirectionDown() ],
  [ E.cmd_direction_left, (p: Ult4): Promise<Exit> => p.cmdDirectionLeft() ],
  [ E.cmd_direction_right, (p: Ult4): Promise<Exit> => p.cmdDirectionRight() ],
  [ E.try_walk, (p: Ult4): Promise<Exit> => p.tryWalk() ],
  [ E.try_walk_towne, (p: Ult4): Promise<Exit> => p.tryWalkTowne() ],
  [ E.try_walk_exit, (p: Ult4): Promise<Exit> => p.tryWalkExit() ],
  [ E.print_turn, (p: Ult4): Promise<Exit> => p.printTurn() ],
  [ E.print_sail, (p: Ult4): Promise<Exit> => p.printSail() ],
  [ E.spawn_pirate_fleet, (p: Ult4): Exit => p.spawnPirateFleet() ],
  [ E.spawn_daemon_guard, (p: Ult4): Exit => p.spawnDaemonGuard() ],
  [ E.leave_to_world, (p: Ult4): Promise<Exit> => p.leaveToWorld() ],
  [ E.check_slow_terrain, (p: Ult4): Promise<Exit> => p.checkSlowTerrain() ],
  [ E.can_ship_move_here, (p: Ult4): Promise<Exit> => p.canShipMoveHere() ],
  [ E.cmd_board, (p: Ult4): Promise<Exit> => p.cmdBoard() ],
  [ E.board_horse, (p: Ult4): Promise<Exit> => p.boardHorse() ],
  [ E.board_balloon, (p: Ult4): Promise<Exit> => p.boardBalloon() ],
  [ E.do_board, (p: Ult4): Promise<Exit> => p.doBoard() ],
  [ E.print_descend, (p: Ult4): Promise<Exit> => p.printDescend() ],
  [ E.cmd_descend, (p: Ult4): Promise<Exit> => p.cmdDescend() ],
  [ E.cmd_hole_up, (p: Ult4): Promise<Exit> => p.cmdHoleUp() ],
  [ E.cmd_klimb, (p: Ult4): Promise<Exit> => p.cmdKlimb() ],
  [ E.cmd_peer_gem, (p: Ult4): Promise<Exit> => p.cmdPeerGem() ],
  [ E.do_view, (p: Ult4): Promise<Exit> => p.doView() ],
  [ E.cmd_search, (p: Ult4): Promise<Exit> => p.cmdSearch() ],
  [ E.cmd_use_item, (p: Ult4): Promise<Exit> => p.cmdUseItem() ],
  [ E.cmd_x_it, (p: Ult4): Promise<Exit> => p.cmdXIt() ],
  [ E.cmd_yell_horse, (p: Ult4): Promise<Exit> => p.cmdYellHorse() ],
  [ E.cmd_done, (p: Ult4): Promise<Exit> => p.cmdDone() ],
  [ E.update_player_health, (p: Ult4): Promise<Exit> => p.updatePlayerHealth() ],
  [ E.is_wind_favorable, (p: Ult4): Promise<Exit> => p.isWindFavorable() ],
  [ E.end_turn, (p: Ult4): Promise<Exit> => p.endTurn() ],
  [ E.print_north, (p: Ult4): Promise<Exit> => p.printNorth() ],
  [ E.print_south, (p: Ult4): Promise<Exit> => p.printSouth() ],
  [ E.print_east, (p: Ult4): Promise<Exit> => p.printEast() ],
  [ E.print_west, (p: Ult4): Promise<Exit> => p.printWest() ],
  [ E.input_char, (p: Ult4): Promise<Exit> => p.inputChar() ],
  [ E.run_file_dead, (p: Ult4): Promise<Exit> => p.runFileDead() ],
  [ E.dec_stat, (p: Ult4): Promise<Exit> => p.decStat() ],
  [ E.print_newline, (p: Ult4): Promise<Exit> => p.printNewline() ],
  [ E.check_enter_moongate, (p: Ult4): Promise<Exit> => p.checkEnterMoongate() ],
  [ E.gate_to_gate, (p: Ult4): Promise<Exit> => p.gateToGate() ],
];


function entry(body: Body): NativeRoutine {
  return exitRoutine((machine: LiftedMachine): Ult4 => new Ult4(machine), body);
}


export const ULT4_MODULE: INativeModule = {
  disk: 'program',
  name: 'ULT4',
  load: ULT4_LOAD,
  partial: true,
  install: (machine: LiftedMachine): void => {
    for (const [ address, bytes ] of ult4Data()) {
      bytes.forEach((value: number, index: number): void => machine.write(address + index, value));
    }
  },
  entries: new Map<number, NativeRoutine>(BODIES.map(([ address, body ]: [ number, Body ]): [ number, NativeRoutine ] => [ address, entry(body) ])),
};
