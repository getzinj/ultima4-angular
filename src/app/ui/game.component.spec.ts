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
    game = mock<PortedGame>({ screen: new AppleMachine() });
    fixture = TestBed.createComponent(GameComponent);
    fixture.componentRef.setInput('game', game);
    await fixture.whenStable();
    game.runFrame.mockClear();
  });

  afterEach((): void => {
    fixture.destroy();
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
