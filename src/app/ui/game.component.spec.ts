import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { mock } from 'vitest-mock-extended';
import type { MockProxy } from 'vitest-mock-extended';

import type { PortedGame } from '../port/ported-game';
import { AppleMachine } from '../runtime/apple-machine';
import { GameComponent } from './game.component';


describe('GameComponent', (): void => {
  let fixture: ComponentFixture<GameComponent>;
  let game: MockProxy<PortedGame>;

  beforeEach(async (): Promise<void> => {
    game = mock<PortedGame>();
    Object.assign(game, { screen: new AppleMachine() });
    fixture = TestBed.createComponent(GameComponent);
    fixture.componentRef.setInput('game', game);
    await fixture.whenStable();
    game.runFrame.mockClear();
  });

  afterEach((): void => {
    fixture.destroy();
    localStorage.clear();
  });

  function keyDown(init: KeyboardEventInit): KeyboardEvent {
    const event: KeyboardEvent = new KeyboardEvent('keydown', { ...init, cancelable: true });

    document.dispatchEvent(event);

    return event;
  }

  describe('the keyboard', (): void => {
    it('gives a key to the game as the Apple would read it', (): void => {
      keyDown({ key: 'a' });

      expect(game.press).toHaveBeenCalledWith(0xC1);
    });

    it('keeps a key the game took from the browser', (): void => {
      expect(keyDown({ key: 'a' }).defaultPrevented).toBe(true);
    });

    it('leaves a key held with Alt to the browser', (): void => {
      keyDown({ key: 'a', altKey: true });

      expect(game.press).not.toHaveBeenCalled();
    });

    it('leaves a key the Apple has no code for to the browser', (): void => {
      expect(keyDown({ key: 'F5' }).defaultPrevented).toBe(false);
    });

    it('leaves a key pressed on one of the page\'s controls to it', (): void => {
      const summary: HTMLElement = (fixture.nativeElement as HTMLElement).querySelector('summary') as HTMLElement;

      summary.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));

      expect(game.press).not.toHaveBeenCalled();
    });
  });

  describe('the touch pad', (): void => {
    it('gives its keys to the game', (): void => {
      ((fixture.nativeElement as HTMLElement).querySelector('[data-key="↑"]') as HTMLButtonElement).click();

      expect(game.press).toHaveBeenCalledWith(0x8B);
    });
  });

  describe('the display settings', (): void => {
    it('are kept for the next visit', (): void => {
      const crt: HTMLInputElement = (fixture.nativeElement as HTMLElement).querySelector('input[type="checkbox"]') as HTMLInputElement;

      crt.checked = false;
      crt.dispatchEvent(new Event('change'));

      expect(JSON.parse(localStorage.getItem('ultima4.display') ?? 'null')).toEqual({ palette: 'ntsc', crt: false, sound: true });
    });

    it('take the CRT effect off the screen', async (): Promise<void> => {
      const crt: HTMLInputElement = (fixture.nativeElement as HTMLElement).querySelector('input[type="checkbox"]') as HTMLInputElement;

      crt.checked = false;
      crt.dispatchEvent(new Event('change'));
      await fixture.whenStable();

      expect((fixture.nativeElement as HTMLElement).querySelector('.scanlines')).toBeNull();
    });
  });

  describe('the save disk', (): void => {
    let writes: number;

    beforeEach((): void => {
      writes = 0;
      fixture.componentInstance.diskWritten.subscribe((): void => {
        writes = writes + 1;
      });
    });

    it('is not reported written by a frame that wrote nothing', async (): Promise<void> => {
      await fixture.componentInstance.frame(1_000);
      await fixture.componentInstance.frame(1_020);

      expect(writes).toBe(0);
    });

    it('is reported written by a frame in which the game wrote to it', async (): Promise<void> => {
      Object.assign(game, { diskWrites: 0 });
      await fixture.componentInstance.frame(1_000);
      Object.assign(game, { diskWrites: 3 });
      await fixture.componentInstance.frame(1_020);

      expect(writes).toBe(1);
    });
  });

  describe('the sound', (): void => {
    let started: number;

    beforeEach((): void => {
      started = 0;
      vi.stubGlobal('AudioContext', class {
        public readonly currentTime: number = 0;
        public readonly sampleRate: number = 1000;
        public readonly destination: object = {};

        public createBuffer(_channels: number, length: number): object {
          return { getChannelData: (): Float32Array => new Float32Array(length) };
        }

        public createBufferSource(): object {
          return { connect: (): void => undefined, start: (): void => {
            started = started + 1;
          } };
        }
      });
      game.drainSound.mockReturnValue(new Float32Array(16));
    });

    afterEach((): void => {
      vi.unstubAllGlobals();
    });

    it('stays silent until the player has pressed something', async (): Promise<void> => {
      await fixture.componentInstance.frame(1_000);

      expect(started).toBe(0);
    });

    it('plays the speaker once a key has been pressed', async (): Promise<void> => {
      keyDown({ key: 'a' });
      await fixture.componentInstance.frame(1_000);

      expect(started).toBe(1);
    });

    it('plays the speaker once the screen has been touched', async (): Promise<void> => {
      document.dispatchEvent(new Event('pointerdown'));
      await fixture.componentInstance.frame(1_000);

      expect(started).toBe(1);
    });

    it('plays nothing with the sound turned off', async (): Promise<void> => {
      const sound: HTMLInputElement = (fixture.nativeElement as HTMLElement).querySelectorAll('input[type="checkbox"]')[1] as HTMLInputElement;

      sound.checked = false;
      sound.dispatchEvent(new Event('change'));
      keyDown({ key: 'a' });
      await fixture.componentInstance.frame(1_000);

      expect(started).toBe(0);
    });
  });

  describe('the frames', (): void => {
    it('runs the game for the time since the last frame', async (): Promise<void> => {
      await fixture.componentInstance.frame(1_000);
      await fixture.componentInstance.frame(1_020);

      expect(game.runFrame).toHaveBeenLastCalledWith(20);
    });

    it('says why the game stopped', async (): Promise<void> => {
      game.runFrame.mockRejectedValue(new Error('no lifted code at $1234'));
      await fixture.componentInstance.frame(1_000);
      fixture.detectChanges();

      expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')?.textContent).toContain('no lifted code at $1234');
    });

    it('takes no keys once the game has stopped', async (): Promise<void> => {
      game.runFrame.mockRejectedValue(new Error('stopped'));
      await fixture.componentInstance.frame(1_000);
      keyDown({ key: 'a' });

      expect(game.press).not.toHaveBeenCalled();
    });
  });
});
