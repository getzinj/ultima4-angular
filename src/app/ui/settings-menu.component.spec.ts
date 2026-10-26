import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';

import type { IDisplaySettings } from './display-settings';
import { SettingsMenuComponent } from './settings-menu.component';


describe('SettingsMenuComponent', (): void => {
  let fixture: ComponentFixture<SettingsMenuComponent>;
  let emitted: IDisplaySettings[];

  beforeEach(async (): Promise<void> => {
    fixture = TestBed.createComponent(SettingsMenuComponent);
    emitted = [];
    fixture.componentRef.setInput('settings', { palette: 'ntsc', crt: true });
    fixture.componentInstance.changed.subscribe((settings: IDisplaySettings): void => {
      emitted.push(settings);
    });
    await fixture.whenStable();
  });

  it('offers all four screens', (): void => {
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('option').length).toBe(4);
  });

  it('turns the CRT effect off when its box is cleared', (): void => {
    const box: HTMLInputElement = (fixture.nativeElement as HTMLElement).querySelector('input[type="checkbox"]') as HTMLInputElement;

    box.checked = false;
    box.dispatchEvent(new Event('change'));

    expect(emitted).toEqual([ { palette: 'ntsc', crt: false } ]);
  });

  it('chooses another screen', (): void => {
    const select: HTMLSelectElement = (fixture.nativeElement as HTMLElement).querySelector('select') as HTMLSelectElement;

    select.value = 'green';
    select.dispatchEvent(new Event('change'));

    expect(emitted).toEqual([ { palette: 'green', crt: true } ]);
  });
});
