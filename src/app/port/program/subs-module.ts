import type { LiftedMachine } from '../../lifted-runtime/lifted-machine';
import type { INativeModule, NativeRoutine } from '../../lifted-runtime/native-module';
import { routine } from '../routine';
import { Subs } from './subs';
import { SUBS_LOAD, subsData } from './subs-data';

// SUBS as a native module: its jump table, each entry run by the port and returning as the
// original's RTS would, and its variables, tables and inline data installed when it is loaded.

type Body = (subs: Subs) => void | Promise<void>;

/** Entries that end in an RTS to the caller; primm, primm_cout and the line drawers return past their inline data themselves. */
const RETURNING: readonly [ number, Body ][] = [
  [ 0x0800, (subs: Subs): Promise<void> => subs.waitkey() ],
  [ 0x0803, (subs: Subs): Promise<void> => subs.playerTeleport() ],
  [ 0x0806, (subs: Subs): Promise<void> => subs.moveEast() ],
  [ 0x0809, (subs: Subs): Promise<void> => subs.moveWest() ],
  [ 0x080C, (subs: Subs): Promise<void> => subs.moveSouth() ],
  [ 0x080F, (subs: Subs): Promise<void> => subs.moveNorth() ],
  [ 0x0812, (subs: Subs): void => subs.drawinterface() ],
  [ 0x0815, (subs: Subs): Promise<void> => subs.drawview() ],
  [ 0x0818, (subs: Subs): Promise<void> => subs.updateBritannia() ],
  [ 0x0824, (subs: Subs): void => subs.consoleOut() ],
  [ 0x0827, (subs: Subs): void => subs.clearbitmap() ],
  [ 0x082A, (subs: Subs): void => subs.mulax() ],
  [ 0x082D, (subs: Subs): void => subs.getStatsPtr() ],
  [ 0x0830, (subs: Subs): void => subs.printname() ],
  [ 0x0833, (subs: Subs): void => subs.printbcd() ],
  [ 0x0836, (subs: Subs): void => subs.drawcursor() ],
  [ 0x0839, (subs: Subs): void => subs.drawcursorXy() ],
  [ 0x0842, (subs: Subs): Promise<void> => subs.requestDisk() ],
  [ 0x0845, (subs: Subs): Promise<void> => subs.updateStatus() ],
  [ 0x0848, (subs: Subs): void => subs.blockedTile() ],
  [ 0x084B, (subs: Subs): Promise<void> => subs.idle() ],
  [ 0x084E, (subs: Subs): void => subs.rand() ],
  [ 0x0851, (subs: Subs): Promise<void> => subs.loadsector() ],
  [ 0x0854, (subs: Subs): Promise<void> => subs.playsfx() ],
  [ 0x0857, (subs: Subs): Promise<void> => subs.idleCombat() ],
  [ 0x085A, (subs: Subs): Promise<void> => subs.getnumber() ],
  [ 0x085D, (subs: Subs): Promise<void> => subs.getplayernum() ],
  [ 0x0860, (subs: Subs): void => subs.updateWind() ],
  [ 0x0863, (subs: Subs): Promise<void> => subs.animateView() ],
  [ 0x0866, (subs: Subs): void => subs.printdigit() ],
  [ 0x0869, (subs: Subs): void => subs.clearstatwindow() ],
  [ 0x086C, (subs: Subs): void => subs.animateTiles() ],
  [ 0x086F, (subs: Subs): void => subs.centername() ],
  [ 0x0872, (subs: Subs): void => subs.printDirection() ],
  [ 0x0875, (subs: Subs): void => subs.clearOrInvertView(false) ],
  [ 0x0878, (subs: Subs): void => subs.clearOrInvertView(true) ],
  [ 0x087B, (subs: Subs): void => subs.centerstring() ],
  [ 0x087E, (subs: Subs): void => subs.printstring() ],
  [ 0x0881, (subs: Subs): void => subs.gettileBounds() ],
  [ 0x0884, (subs: Subs): void => subs.gettileBritannia() ],
  [ 0x0887, (subs: Subs): void => subs.gettileOpposite() ],
  [ 0x088A, (subs: Subs): void => subs.gettileDrawnMap() ],
  [ 0x088D, (subs: Subs): void => subs.gettileActualMap() ],
  [ 0x0890, (subs: Subs): void => subs.getPlayerTile() ],
  [ 0x0893, (subs: Subs): void => subs.gettileTowne() ],
  [ 0x0896, (subs: Subs): void => subs.gettileDungeon() ],
  [ 0x0899, (subs: Subs): void => subs.getsign() ],
];

const INLINE: readonly [ number, Body ][] = [
  [ 0x081B, (subs: Subs): Promise<void> => subs.primmCout() ],
  [ 0x081E, (subs: Subs): void => subs.primmXy() ],
  [ 0x0821, (subs: Subs): void => subs.primm() ],
  [ 0x083C, (subs: Subs): void => subs.drawFromStack(true) ],
  [ 0x083F, (subs: Subs): void => subs.drawFromStack(false) ],
];


function entry(body: Body, returns: boolean): NativeRoutine {
  return routine((machine: LiftedMachine): Subs => new Subs(machine), body, returns);
}


export const SUBS_MODULE: INativeModule = {
  disk: 'program',
  name: 'SUBS',
  load: SUBS_LOAD,
  install: (machine: LiftedMachine): void => {
    for (const [ address, bytes ] of subsData()) {
      bytes.forEach((value: number, index: number): void => machine.write(address + index, value));
    }
  },
  entries: new Map<number, NativeRoutine>([
    ...RETURNING.map(([ address, body ]: [ number, Body ]): [ number, NativeRoutine ] => [ address, entry(body, true) ]),
    ...INLINE.map(([ address, body ]: [ number, Body ]): [ number, NativeRoutine ] => [ address, entry(body, false) ]),
  ]),
};
