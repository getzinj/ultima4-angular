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

  describe('the CRT effect', (): void => {
    async function screenWith(crt: boolean): Promise<HTMLElement> {
      fixture.componentRef.setInput('crt', crt);
      await fixture.whenStable();

      return fixture.nativeElement as HTMLElement;
    }

    it('adds scanlines when on', async (): Promise<void> => {
      expect((await screenWith(true)).querySelector('.scanlines')).not.toBeNull();
    });

    it('adds a glow layer when on', async (): Promise<void> => {
      expect((await screenWith(true)).querySelector('canvas.glow')).not.toBeNull();
    });

    it('has no scanlines when off', async (): Promise<void> => {
      expect((await screenWith(false)).querySelector('.scanlines')).toBeNull();
    });

    it('has no glow layer when off', async (): Promise<void> => {
      expect((await screenWith(false)).querySelector('canvas.glow')).toBeNull();
    });
  });
});
