import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';

import { AppleScreenComponent } from './apple-screen.component';


describe('AppleScreenComponent', (): void => {
  let canvas: HTMLCanvasElement;

  beforeEach(async (): Promise<void> => {
    const fixture: ComponentFixture<AppleScreenComponent> = TestBed.createComponent(AppleScreenComponent);

    await fixture.whenStable();
    canvas = (fixture.nativeElement as HTMLElement).querySelector('canvas') as HTMLCanvasElement;
  });

  it('has a backing width of 280 pixels', (): void => {
    expect(canvas.width).toBe(280);
  });

  it('has a backing height of 192 pixels', (): void => {
    expect(canvas.height).toBe(192);
  });
});
