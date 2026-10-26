import type { OnDestroy } from '@angular/core';
import { ChangeDetectionStrategy, Component, afterNextRender, computed, input, signal } from '@angular/core';
import type { InputSignal, Signal, WritableSignal } from '@angular/core';

import type { PortedGame } from '../port/ported-game';
import type { IApplePalette } from '../runtime/apple-palette';
import { paletteByName } from '../runtime/apple-palette';
import { appleKeyCodeOf } from '../runtime/keyboard';
import { AppleScreenComponent } from './apple-screen.component';
import type { IDisplaySettings } from './display-settings';
import { browserStorage, loadDisplaySettings, saveDisplaySettings } from './display-settings';
import { isControl } from './key-target';
import { SettingsMenuComponent } from './settings-menu.component';
import { TextMirrorComponent } from './text-mirror.component';
import { TouchPadComponent } from './touch-pad.component';

const FIRST_FRAME_MS: number = 1000 / 60;


/** The game running on the screen, a frame at a time, with the keyboard as the Apple's, a touch pad, the display's settings, and its text for screen readers. */
@Component({
  selector: 'ultima4-game',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ AppleScreenComponent, SettingsMenuComponent, TextMirrorComponent, TouchPadComponent ],
  template: `
    @if (failure(); as message) {
      <p role="alert">The game stopped: {{ message }}</p>
    }
    <ultima4-apple-screen [machine]="game().screen" [palette]="palette()" [crt]="settings().crt" />
    <ultima4-text-mirror [machine]="game().screen" />
    <ultima4-settings-menu [settings]="settings()" (changed)="choose($event)" />
    <ultima4-touch-pad (pressed)="press($event)" />
  `,
  styles: [ `
    :host { display: flex; flex-direction: column; width: 100%; height: 100%; box-sizing: border-box; }
    @media (pointer: coarse) { :host { padding-bottom: 232px; } }
    ultima4-apple-screen { flex: 1; min-height: 0; }
    p { margin: 0; padding: 8px 16px; color: #fff; background: #800; }
  ` ],
  host: {
    '(document:keydown)': 'onKeyDown($event)',
  },
})
export class GameComponent implements OnDestroy {
  public readonly game: InputSignal<PortedGame> = input.required<PortedGame>();

  protected readonly failure: WritableSignal<string | null> = signal<string | null>(null);
  protected readonly settings: WritableSignal<IDisplaySettings> = signal<IDisplaySettings>(loadDisplaySettings(browserStorage()));
  protected readonly palette: Signal<IApplePalette> = computed((): IApplePalette => paletteByName(this.settings().palette));

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
    const code: number | null = (event.altKey || event.metaKey || isControl(event.target)) ? null : appleKeyCodeOf(event.key, event.ctrlKey);

    if (code != null) {
      this.press(code);
      event.preventDefault();
    }
  }


  /** A key from the keyboard or the touch pad, unless the game has stopped. */
  protected press(code: number): void {
    if (this.failure() == null) {
      this.game().press(code);
    }
  }


  protected choose(settings: IDisplaySettings): void {
    this.settings.set(settings);
    saveDisplaySettings(browserStorage(), settings);
  }


  private schedule(): void {
    if (!this.stopped && (typeof requestAnimationFrame !== 'undefined')) {
      this.frameHandle = requestAnimationFrame((now: number): void => {
        void this.frame(now);
      });
    }
  }

}
