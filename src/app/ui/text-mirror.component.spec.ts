import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';

import { hiresRowOffset } from '../runtime/apple-hires.constants';
import { AppleMachine } from '../runtime/apple-machine';
import { TextMirrorComponent } from './text-mirror.component';

const FONT: number = 0x0400;


/** A font in the language card whose glyphs differ in their first row, and `text` drawn with it at (row, column). */
function machineShowing(...texts: readonly [ number, number, string ][]): AppleMachine {
  const machine: AppleMachine = new AppleMachine();
  const high: Uint8Array = machine.languageCard.contents('high');

  for (let glyph: number = 0; glyph < 0x80; glyph++) {
    for (let row: number = 0; row < 8; row++) {
      high[FONT + (row * 0x80) + glyph] = (row === 0) ? glyph : row;
    }
  }
  for (const [ row, column, text ] of texts) {
    [ ...text ].forEach((character: string, index: number): void => {
      for (let pixelRow: number = 0; pixelRow < 8; pixelRow++) {
        machine.write(0x2000 + hiresRowOffset((row * 8) + pixelRow) + column + index, high[FONT + (pixelRow * 0x80) + character.charCodeAt(0)]);
      }
    });
  }

  return machine;
}


/** A P in the font above, drawn on the message pane's second line. */
function drawP(machine: AppleMachine): void {
  for (let pixelRow: number = 0; pixelRow < 8; pixelRow++) {
    machine.write(0x2000 + hiresRowOffset((13 * 8) + pixelRow) + 24, (pixelRow === 0) ? 'P'.charCodeAt(0) : pixelRow);
  }
}


describe('TextMirrorComponent', (): void => {
  let fixture: ComponentFixture<TextMirrorComponent>;

  async function mirroring(machine: AppleMachine): Promise<HTMLElement> {
    fixture = TestBed.createComponent(TextMirrorComponent);
    fixture.componentRef.setInput('machine', machine);
    await fixture.whenStable();
    settle();

    return fixture.nativeElement as HTMLElement;
  }

  /** Two readings of the same screen, which is when its messages are announced. */
  function settle(): void {
    fixture.componentInstance.refresh();
    fixture.componentInstance.refresh();
    fixture.detectChanges();
  }

  afterEach((): void => {
    fixture.destroy();
  });

  it('announces the messages as a log', async (): Promise<void> => {
    expect((await mirroring(machineShowing([ 12, 24, 'Pass' ]))).querySelector('[role="log"]')?.textContent?.trim()).toBe('Pass');
  });

  it('shows the party apart from the messages', async (): Promise<void> => {
    expect((await mirroring(machineShowing([ 1, 24, '1-IOLO 300G' ]))).querySelector('section')?.textContent?.trim()).toBe('1-IOLO 300G');
  });

  it('does not announce the party', async (): Promise<void> => {
    expect((await mirroring(machineShowing([ 1, 24, '1-IOLO 300G' ]))).querySelector('[role="log"]')?.textContent?.trim()).toBe('');
  });

  it('adds a message drawn later to the log', async (): Promise<void> => {
    const machine: AppleMachine = machineShowing([ 12, 24, 'North' ]);
    const element: HTMLElement = await mirroring(machine);

    drawP(machine);
    settle();

    expect(Array.from(element.querySelectorAll('[role="log"] p')).map((line: Element): string => line.textContent ?? '')).toEqual([ 'North', 'P' ]);
  });

  it('announces nothing new from a screen read only once, which may be half drawn', async (): Promise<void> => {
    const machine: AppleMachine = machineShowing([ 12, 24, 'North' ]);
    const element: HTMLElement = await mirroring(machine);

    drawP(machine);
    fixture.componentInstance.refresh();
    fixture.detectChanges();

    expect(Array.from(element.querySelectorAll('[role="log"] p')).map((line: Element): string => line.textContent ?? '')).toEqual([ 'North' ]);
  });

  it('keeps the log off the screen', async (): Promise<void> => {
    expect((await mirroring(machineShowing())).querySelector('[role="log"]')?.classList.contains('mirror')).toBe(true);
  });
});
