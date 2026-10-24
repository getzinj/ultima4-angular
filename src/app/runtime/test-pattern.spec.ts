import { hiresRowOffset } from './apple-hires.constants';
import { AppleMachine } from './apple-machine';
import { hiresToAscii } from './hires-renderer';
import { drawTestPattern } from './test-pattern';


function patternMachine(): AppleMachine {
  const machine: AppleMachine = new AppleMachine();

  drawTestPattern(machine);

  return machine;
}


describe('drawTestPattern', (): void => {
  it('leaves the display in full-screen hi-res', (): void => {
    expect(patternMachine().video.fullScreenHires).toBe(true);
  });

  it('draws the top-left corner of the frame', (): void => {
    expect(hiresToAscii(patternMachine().displayedPage, 0, 0, 4, 3)).toEqual([ '####', '#...', '#...' ]);
  });

  it('draws the bottom-right corner of the frame', (): void => {
    expect(hiresToAscii(patternMachine().displayedPage, 276, 189, 4, 3)).toEqual([ '...#', '...#', '####' ]);
  });

  it('starts the violet bar on alternate pixels', (): void => {
    expect(hiresToAscii(patternMachine().displayedPage, 14, 64, 14, 1)).toEqual([ '#.#.#.#.#.#.#.' ]);
  });

  it('sets the palette bit in the blue bar', (): void => {
    expect(patternMachine().displayedPage[hiresRowOffset(64) + 20] & 0x80).toBe(0x80);
  });
});
