/** What the player needs of an `AudioContext`, so the specs can give it a stand-in. */
export type SoundOutput = Pick<AudioContext, 'currentTime' | 'sampleRate' | 'destination' | 'createBuffer' | 'createBufferSource'>;

/** How far ahead of the output a frame's sound is queued, so a late frame does not leave a gap. */
const LATENCY_SECONDS: number = 0.05;
/** How far ahead the queue may run before a frame's sound is dropped, which bounds the delay. */
const MOST_AHEAD_SECONDS: number = 0.3;
/** The DC blocker's pole: the cone resting high or low is silence, not a held level. */
const DC_POLE: number = 0.995;


/** The speaker's square wave played through Web Audio, a frame's samples at a time, queued end to end. */
export class SpeakerPlayer {
  private next: number = 0;
  private lastIn: number = 0;
  private lastOut: number = 0;


  constructor(private readonly output: SoundOutput) {
  }


  public get sampleRate(): number {
    return this.output.sampleRate;
  }


  public play(samples: Float32Array): void {
    const now: number = this.output.currentTime;
    const filtered: Float32Array = this.blockDc(samples);

    if (this.next < (now + LATENCY_SECONDS)) {
      this.next = now + LATENCY_SECONDS;
    }
    if ((filtered.length > 0) && ((this.next - now) <= MOST_AHEAD_SECONDS)) {
      const buffer: AudioBuffer = this.output.createBuffer(1, filtered.length, this.output.sampleRate);
      const source: AudioBufferSourceNode = this.output.createBufferSource();

      buffer.getChannelData(0).set(filtered);
      source.buffer = buffer;
      source.connect(this.output.destination);
      source.start(this.next);
      this.next = this.next + (filtered.length / this.output.sampleRate);
    }
  }


  private blockDc(samples: Float32Array): Float32Array {
    const filtered: Float32Array = new Float32Array(samples.length);

    for (let index: number = 0; index < samples.length; index++) {
      this.lastOut = (samples[index] - this.lastIn) + (DC_POLE * this.lastOut);
      this.lastIn = samples[index];
      filtered[index] = this.lastOut;
    }

    return filtered;
  }
}
