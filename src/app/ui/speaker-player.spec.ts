import type { SoundOutput } from './speaker-player';
import { SpeakerPlayer } from './speaker-player';

const RATE: number = 1000;


/** An audio output that keeps what it is asked to play: each buffer's samples and when it starts. */
class RecordingOutput {
  public currentTime: number = 0;
  public readonly sampleRate: number = RATE;
  public readonly destination: AudioDestinationNode = {} as AudioDestinationNode;
  public readonly played: { at: number; samples: Float32Array }[] = [];


  public createBuffer(_channels: number, length: number): AudioBuffer {
    const data: Float32Array = new Float32Array(length);

    return { getChannelData: (): Float32Array => data } as unknown as AudioBuffer;
  }


  public createBufferSource(): AudioBufferSourceNode {
    const source: { buffer: AudioBuffer | null; connect: () => void; start: (at: number) => void } = {
      buffer: null,
      connect: (): void => undefined,
      start: (at: number): void => {
        this.played.push({ at, samples: (source.buffer as AudioBuffer).getChannelData(0) });
      },
    };

    return source as unknown as AudioBufferSourceNode;
  }
}


function playerOn(output: RecordingOutput): SpeakerPlayer {
  return new SpeakerPlayer(output as unknown as SoundOutput);
}


describe('SpeakerPlayer', (): void => {
  it('starts a frame\'s sound a little after now', (): void => {
    const output: RecordingOutput = new RecordingOutput();

    playerOn(output).play(new Float32Array(10));

    expect(output.played[0].at).toBe(0.05);
  });

  it('queues the next frame\'s sound right after the last', (): void => {
    const output: RecordingOutput = new RecordingOutput();
    const player: SpeakerPlayer = playerOn(output);

    player.play(new Float32Array(10));
    player.play(new Float32Array(10));

    expect(output.played[1].at).toBeCloseTo(0.06);
  });

  it('starts again a little after now when the queue has run dry', (): void => {
    const output: RecordingOutput = new RecordingOutput();
    const player: SpeakerPlayer = playerOn(output);

    player.play(new Float32Array(10));
    output.currentTime = 5;
    player.play(new Float32Array(10));

    expect(output.played[1].at).toBe(5.05);
  });

  it('drops a frame\'s sound when the queue is too far ahead', (): void => {
    const output: RecordingOutput = new RecordingOutput();
    const player: SpeakerPlayer = playerOn(output);

    player.play(new Float32Array(400));
    player.play(new Float32Array(10));

    expect(output.played.length).toBe(1);
  });

  it('plays nothing for a frame without samples', (): void => {
    const output: RecordingOutput = new RecordingOutput();

    playerOn(output).play(new Float32Array(0));

    expect(output.played.length).toBe(0);
  });

  it('lets a cone held at one level fall silent', (): void => {
    const output: RecordingOutput = new RecordingOutput();

    playerOn(output).play(new Float32Array(200).fill(0.25));

    expect(Math.abs(output.played[0].samples[199])).toBeLessThan(0.25 / 2);
  });
});
