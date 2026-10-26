import type { DiskSet } from '../data/game-disks';
import { LiftedMachine } from '../lifted-runtime/lifted-machine';
import type { AppleMachine } from '../runtime/apple-machine';
import { PORTED_MODULES } from './ported-modules';

const CYCLES_PER_MILLISECOND: number = 1_023;
/** The most one frame catches up, so a tab left in the background doesn't fast-forward the game. */
const MOST_ELAPSED_MS: number = 100;
/** The host time one frame may take, whatever the game is doing. */
const FRAME_BUDGET_MS: number = 12;


/**
 * The game as the player plays it: every program ported, none lifted, booted from the player's
 * prepared disks. The ported code counts only the original's delays, never its instructions, so
 * time passes in the game as those delays and the frames say.
 */
export class PortedGame {
  public readonly machine: LiftedMachine;

  private target: number = 0;


  constructor(disks: DiskSet, private readonly frameBudget: number = FRAME_BUDGET_MS) {
    this.machine = new LiftedMachine(disks, [], null, PORTED_MODULES);
    this.machine.boot();
  }


  public get screen(): AppleMachine {
    return this.machine.apple;
  }


  /** A key arriving, latched with its strobe set over whatever was there, as on the Apple. */
  public press(code: number): void {
    this.machine.key = code | 0x80;
  }


  /** Runs the game for `elapsed` milliseconds of Apple time, or less if the frame's host time runs out first. */
  public async runFrame(elapsed: number): Promise<void> {
    const machine: LiftedMachine = this.machine;
    const deadline: number = performance.now() + this.frameBudget;

    this.target = this.target + (Math.min(elapsed, MOST_ELAPSED_MS) * CYCLES_PER_MILLISECOND);
    await machine.runUntil((): boolean => (machine.cpu.cycles >= this.target) || (performance.now() >= deadline));
    if (machine.cpu.cycles < this.target) {
      this.target = machine.cpu.cycles;
    }
  }
}
