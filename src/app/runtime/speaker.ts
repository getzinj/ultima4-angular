import { CPU_HZ } from './clock';


/** The speaker: each access to $C030 flips the cone. Kept as the cycles of the flips. */
export class Speaker {
  private readonly toggles: number[] = [];

  private high: boolean = false;


  public toggle(cycle: number): void {
    this.toggles.push(cycle);
  }


  /** Turns the flips between two cycles into a square wave of ±amplitude, and forgets them. */
  public drain(fromCycle: number, toCycle: number, sampleRate: number, amplitude: number = 0.25): Float32Array {
    const count: number = Math.max(0, Math.round(((toCycle - fromCycle) * sampleRate) / CPU_HZ));
    const samples: Float32Array = new Float32Array(count);
    let next: number = 0;

    for (let index: number = 0; index < count; index++) {
      const cycle: number = fromCycle + ((index * CPU_HZ) / sampleRate);

      while ((next < this.toggles.length) && (this.toggles[next] <= cycle)) {
        this.high = !this.high;
        next++;
      }
      samples[index] = this.high ? amplitude : -amplitude;
    }

    while ((next < this.toggles.length) && (this.toggles[next] < toCycle)) {
      this.high = !this.high;
      next++;
    }
    this.toggles.splice(0, next);

    return samples;
  }

}
