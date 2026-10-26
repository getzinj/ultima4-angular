import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';

import { TouchPadComponent } from './touch-pad.component';


describe('TouchPadComponent', (): void => {
  let fixture: ComponentFixture<TouchPadComponent>;
  let sent: number[];

  beforeEach(async (): Promise<void> => {
    fixture = TestBed.createComponent(TouchPadComponent);
    sent = [];
    fixture.componentInstance.pressed.subscribe((code: number): void => {
      sent.push(code);
    });
    await fixture.whenStable();
  });

  function button(key: string): HTMLButtonElement {
    return (fixture.nativeElement as HTMLElement).querySelector(`[data-key="${ key }"]`) as HTMLButtonElement;
  }

  it('sends the up arrow when north is touched', (): void => {
    button('↑').click();

    expect(sent).toEqual([ 0x8B ]);
  });

  it('sends A with the high bit set when Attack is touched', (): void => {
    button('A').click();

    expect(sent).toEqual([ 0xC1 ]);
  });

  it('sends the characters typed on the device keyboard', (): void => {
    const field: HTMLInputElement = (fixture.nativeElement as HTMLElement).querySelector('input') as HTMLInputElement;

    field.value = '7a';
    field.dispatchEvent(new Event('input'));

    expect(sent).toEqual([ 0xB7, 0xC1 ]);
  });

  it('empties the field after sending what was typed', (): void => {
    const field: HTMLInputElement = (fixture.nativeElement as HTMLElement).querySelector('input') as HTMLInputElement;

    field.value = '7';
    field.dispatchEvent(new Event('input'));

    expect(field.value).toBe('');
  });

  it('marks its text field as the game\'s own input', (): void => {
    expect((fixture.nativeElement as HTMLElement).querySelector('input')?.hasAttribute('data-game-input')).toBe(true);
  });

  it('labels every button for screen readers', (): void => {
    const buttons: HTMLButtonElement[] = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'));

    expect(buttons.every((candidate: HTMLButtonElement): boolean => (candidate.getAttribute('aria-label') ?? '').length > 0)).toBe(true);
  });
});
