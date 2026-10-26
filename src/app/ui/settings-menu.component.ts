import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { InputSignal, OutputEmitterRef } from '@angular/core';

import { APPLE_PALETTES } from '../runtime/apple-palette';
import type { IApplePalette } from '../runtime/apple-palette';
import type { IDisplaySettings } from './display-settings';

const PALETTE_LABELS: Record<string, string> = {
  ntsc: 'Colour (Apple II)',
  green: 'Green phosphor',
  amber: 'Amber phosphor',
  white: 'White',
};


/** A small corner menu for the screen colour, the CRT effect and the sound. */
@Component({
  selector: 'ultima4-settings-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <details class="menu">
      <summary aria-label="Display settings">⚙</summary>
      <div class="panel">
        <label>Screen
          <select [value]="settings().palette" (change)="choosePalette($event)">
            @for (palette of palettes; track palette.name) {
              <option [value]="palette.name" [selected]="palette.name === settings().palette">{{ label(palette) }}</option>
            }
          </select>
        </label>
        <label><input type="checkbox" [checked]="settings().crt" (change)="chooseCrt($event)" /> CRT effect</label>
        <label><input type="checkbox" [checked]="settings().sound" (change)="chooseSound($event)" /> Sound</label>
      </div>
    </details>
  `,
  styles: [ `
    :host { position: fixed; top: 8px; right: 8px; z-index: 3; font: 14px sans-serif; color: #ddd; }
    summary { cursor: pointer; list-style: none; width: 32px; height: 32px; line-height: 32px; text-align: center; border-radius: 16px; background: rgba(30, 30, 30, 0.7); opacity: 0.5; }
    summary:hover, details[open] summary { opacity: 1; }
    .panel { margin-top: 6px; padding: 10px 12px; display: grid; gap: 8px; border: 1px solid #555; border-radius: 8px; background: rgba(20, 20, 20, 0.92); }
    select { margin-left: 6px; }
  ` ],
})
export class SettingsMenuComponent {
  public readonly settings: InputSignal<IDisplaySettings> = input.required<IDisplaySettings>();
  public readonly changed: OutputEmitterRef<IDisplaySettings> = output<IDisplaySettings>();

  protected readonly palettes: readonly IApplePalette[] = APPLE_PALETTES;


  protected label(palette: IApplePalette): string {
    return PALETTE_LABELS[palette.name] ?? palette.name;
  }


  protected choosePalette(event: Event): void {
    this.changed.emit({ ...this.settings(), palette: (event.target as HTMLSelectElement).value });
  }


  protected chooseCrt(event: Event): void {
    this.changed.emit({ ...this.settings(), crt: (event.target as HTMLInputElement).checked });
  }


  protected chooseSound(event: Event): void {
    this.changed.emit({ ...this.settings(), sound: (event.target as HTMLInputElement).checked });
  }

}
