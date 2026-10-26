import type { OnDestroy } from '@angular/core';
import { ChangeDetectionStrategy, Component, afterNextRender, input, signal } from '@angular/core';
import type { InputSignal, WritableSignal } from '@angular/core';

import type { PortedGame } from '../port/ported-game';
import { appleKeyCodeOf } from '../runtime/keyboard';
import { AppleScreenComponent } from './apple-screen.component';

const FIRST_FRAME_MS: number = 1000 / 60;


/** The game running on the screen, a frame at a time, with the keyboard as the Apple's. */
@Component({
  selector: 'ultima4-game',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ AppleScreenComponent ],
  template: `
    @if (failure(); as message) {
      <p role="alert">The game stopped: {{ message }}</p>
    }
    <ultima4-apple-screen [machine]="game().screen" />
  `,
  styles: [ ':host { display: flex; flex-direction: column; width: 100%; height: 100%; } ultima4-apple-screen { flex: 1; } p { margin: 0; padding: 8px 16px; color: #fff; background: #800; }' ],
  host: {
    '(document:keydown)': 'onKeyDown($event)',
  },
})
export class GameComponent implements OnDestroy {
  public readonly game: InputSignal<PortedGame> = input.required<PortedGame>();

  protected readonly failure: WritableSignal<string | null> = signal<string | null>(null);

  private frameHandle: number = 0;
  private lastFrame: number | null = null;
  private stopped: boolean = false;


  constructor() {
    afterNextRender((): void => this.schedule());
  }


  public ngOnDestroy(): void {
    this.stopped = true;
    if (typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.frameHandle);
    }
  }


  /** One frame of the game, `now` the frame's time, and the next frame asked for unless it stopped. */
  public async frame(now: number): Promise<void> {
    const elapsed: number = (this.lastFrame == null) ? FIRST_FRAME_MS : (now - this.lastFrame);

    this.lastFrame = now;
    try {
      await this.game().runFrame(elapsed);
      this.schedule();
    } catch (thrown: unknown) {
      console.error('The game stopped.', thrown);
      this.failure.set((thrown instanceof Error) ? thrown.message : String(thrown));
    }
  }


  protected onKeyDown(event: KeyboardEvent): void {
    const code: number | null = (event.altKey || event.metaKey) ? null : appleKeyCodeOf(event.key, event.ctrlKey);

    if ((code != null) && (this.failure() == null)) {
      this.game().press(code);
      event.preventDefault();
    }
  }


  private schedule(): void {
    if (!this.stopped && (typeof requestAnimationFrame !== 'undefined')) {
      this.frameHandle = requestAnimationFrame((now: number): void => {
        void this.frame(now);
      });
    }
  }

}
