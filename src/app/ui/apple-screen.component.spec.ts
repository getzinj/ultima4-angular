import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';

import { AppleMachine } from '../runtime/apple-machine';
import { AppleScreenComponent } from './apple-screen.component';


describe('AppleScreenComponent', (): void => {
  let fixture: ComponentFixture<AppleScreenComponent>;
  let machine: AppleMachine;
  let canvas: HTMLCanvasElement;

  beforeEach(async (): Promise<void> => {
    machine = new AppleMachine();
    fixture = TestBed.createComponent(AppleScreenComponent);
    fixture.componentRef.setInput('machine', machine);
    await fixture.whenStable();
    canvas = (fixture.nativeElement as HTMLElement).querySelector('canvas') as HTMLCanvasElement;
  });

  it('has a backing width of 280 pixels', (): void => {
    expect(canvas.width).toBe(280);
  });

  it('has a backing height of 192 pixels', (): void => {
    expect(canvas.height).toBe(192);
  });

  it('leaves the machine dirty when there is no 2D context to paint', (): void => {
    machine.dirty = true;
    fixture.componentInstance.paint();

    expect(machine.dirty).toBe(true);
  });
});
