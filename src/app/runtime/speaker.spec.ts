import { CPU_HZ } from './clock';
import { Speaker } from './speaker';


const RATE: number = 1000;
const CYCLES_PER_SAMPLE: number = CPU_HZ / RATE;


describe('Speaker', (): void => {
  it('makes one sample per sample period', (): void => {
    expect(new Speaker().drain(0, CYCLES_PER_SAMPLE * 10, RATE).length).toBe(10);
  });

  it('stays low with no flips', (): void => {
    expect(Array.from(new Speaker().drain(0, CYCLES_PER_SAMPLE * 4, RATE))).toEqual([ -0.25, -0.25, -0.25, -0.25 ]);
  });

  it('goes high from the sample at a flip', (): void => {
    const speaker: Speaker = new Speaker();

    speaker.toggle(CYCLES_PER_SAMPLE * 2);

    expect(Array.from(speaker.drain(0, CYCLES_PER_SAMPLE * 4, RATE))).toEqual([ -0.25, -0.25, 0.25, 0.25 ]);
  });

  it('keeps its level from one drain to the next', (): void => {
    const speaker: Speaker = new Speaker();

    speaker.toggle(CYCLES_PER_SAMPLE);
    speaker.drain(0, CYCLES_PER_SAMPLE * 2, RATE);

    expect(Array.from(speaker.drain(CYCLES_PER_SAMPLE * 2, CYCLES_PER_SAMPLE * 4, RATE))).toEqual([ 0.25, 0.25 ]);
  });

  it('counts a flip that falls between samples', (): void => {
    const speaker: Speaker = new Speaker();

    speaker.toggle(CYCLES_PER_SAMPLE * 1.5);
    speaker.drain(0, CYCLES_PER_SAMPLE * 2, RATE);

    expect(Array.from(speaker.drain(CYCLES_PER_SAMPLE * 2, CYCLES_PER_SAMPLE * 3, RATE))).toEqual([ 0.25 ]);
  });
});
