import { ChangeDetectionStrategy, Component, output, viewChild } from '@angular/core';
import type { ElementRef, OutputEmitterRef, Signal } from '@angular/core';

import { appleKeyCodeOf } from '../runtime/keyboard';
import { COMMAND_KEYS, MOVEMENT_KEYS } from './touch-keys';
import type { ITouchKey } from './touch-keys';


/**
 * Buttons for phones and tablets, shown only where the main pointer is a finger. The keyboard button
 * raises the device's own keyboard through an invisible text field, for names and numbers.
 */
@Component({
  selector: 'ultima4-touch-pad',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pad" role="group" aria-label="Touch controls">
      <div class="moves">
        @for (key of movement; track key.label) {
          <button type="button" [attr.aria-label]="key.description" [attr.data-key]="key.label" (click)="pressed.emit(key.code)">{{ key.label }}</button>
        }
      </div>
      <div class="commands">
        @for (key of commands; track key.label) {
          <button type="button" [attr.aria-label]="key.description" [attr.data-key]="key.label" (click)="pressed.emit(key.code)">{{ key.label }}</button>
        }
        <button type="button" aria-label="Show the keyboard" data-key="keyboard" (click)="showKeyboard()">⌨</button>
      </div>
    </div>
    <input
      #typer
      class="typer"
      data-game-input
      type="text"
      autocomplete="off"
      autocapitalize="characters"
      autocorrect="off"
      spellcheck="false"
      aria-hidden="true"
      tabindex="-1"
      (input)="typed($event)"
    />
  `,
  styles: [ `
    :host { display: none; }
    @media (pointer: coarse) { :host { display: block; position: fixed; left: 0; right: 0; bottom: 0; z-index: 2; } }
    .pad { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; padding: 8px 16px; }
    .moves { display: grid; grid-template-columns: repeat(3, 56px); grid-template-areas: '. north .' 'west . east' '. south .'; gap: 6px; }
    .moves [data-key='↑'] { grid-area: north; }
    .moves [data-key='←'] { grid-area: west; }
    .moves [data-key='→'] { grid-area: east; }
    .moves [data-key='↓'] { grid-area: south; }
    .commands { display: grid; grid-template-columns: repeat(3, 56px); gap: 6px; }
    button { min-height: 48px; border: 1px solid #555; border-radius: 8px; background: rgba(30, 30, 30, 0.85); color: #ddd; font: inherit; font-size: 16px; }
    button:active { background: #444; }
    .typer { position: fixed; left: 0; bottom: 0; width: 1px; height: 1px; opacity: 0; border: 0; padding: 0; }
  ` ],
})
export class TouchPadComponent {
  public readonly pressed: OutputEmitterRef<number> = output<number>();

  protected readonly movement: readonly ITouchKey[] = MOVEMENT_KEYS;
  protected readonly commands: readonly ITouchKey[] = COMMAND_KEYS;

  private readonly typer: Signal<ElementRef<HTMLInputElement>> = viewChild.required<ElementRef<HTMLInputElement>>('typer');


  protected showKeyboard(): void {
    this.typer().nativeElement.focus();
  }


  /** Characters from the device keyboard, which does not send usable key names. */
  protected typed(event: Event): void {
    const field: HTMLInputElement = event.target as HTMLInputElement;

    for (const character of field.value) {
      const code: number | null = appleKeyCodeOf(character);

      if (code != null) {
        this.pressed.emit(code);
      }
    }
    field.value = '';
  }

}
