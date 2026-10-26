import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import type { InputSignal, OutputEmitterRef, Signal, WritableSignal } from '@angular/core';

import type { ISaveDiskSummary } from '../data/save-disks';


/**
 * The shelf of save disks, and the choice of which to play. Each is a copy of the Britannia disk,
 * which the game writes the party onto when it quits, so the master stays as it was.
 */
@Component({
  selector: 'ultima4-save-disk-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel">
      <h1>Save disks</h1>

      @if (disks().length === 0) {
        <p class="note">
          No save disks yet. Make one from your Britannia disk and play on it: the game writes your
          party onto it when you quit, as it did on the Apple, and the master stays as it is.
        </p>
      } @else {
        <ul>
          @for (disk of disks(); track disk.id) {
            <li>
              <input class="name" type="text" [value]="disk.name" [attr.aria-label]="'Name of ' + disk.name"
                     (change)="renamed.emit({ id: disk.id, name: valueOf($event) })" />
              <span class="played">{{ lastPlayed(disk) }}</span>
              <button type="button" class="play" (click)="played.emit(disk.id)">Play</button>
              <button type="button" (click)="exported.emit(disk.id)">Export</button>
              <button type="button" (click)="discard(disk.id)">{{ (confirming() === disk.id) ? 'Really discard?' : 'Discard' }}</button>
            </li>
          }
        </ul>
      }

      @if (full()) {
        <p class="note">There is room for {{ limit() }} save disks. Discard one to make another.</p>
      } @else {
        <div class="new">
          <input type="text" aria-label="Name for the new save disk" [value]="newName()" (input)="newName.set(valueOf($event))" />
          <button type="button" (click)="created.emit(newName())">Make a new save disk</button>
        </div>
      }

      <label class="restore">
        <input type="file" accept=".do,.dsk,.po,.2mg" (change)="onRestore($event)" />
        <span>Import a save disk</span>
      </label>
      <p class="note">An exported save disk is the Britannia disk itself, so an emulator can play it too.</p>

      @if (failure(); as problem) {
        <p class="failure" role="alert">{{ problem }}</p>
      }
    </div>
  `,
  styles: [ `
    :host { display: grid; place-items: center; height: 100%; padding: 16px; box-sizing: border-box; color: #ddd; font: 16px sans-serif; }
    .panel { box-sizing: border-box; width: min(40rem, 100%); padding: 24px; border: 1px solid #3a3a3a; }
    h1 { margin: 0 0 16px; font-size: 1.5rem; }
    ul { margin: 0 0 16px; padding: 0; list-style: none; }
    li { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid #222; }
    .name { flex: 1 1 8rem; }
    .played { color: #888; font-size: 0.8rem; }
    input, button, .restore span { padding: 6px 10px; border: 1px solid #555; background: #000; color: inherit; font: inherit; }
    button, .restore span { cursor: pointer; }
    .play { border-color: #00cc44; }
    .new { display: flex; gap: 8px; }
    .new input { flex: 1 1 auto; }
    .restore { display: inline-block; margin-top: 16px; }
    .restore input { position: absolute; width: 1px; height: 1px; opacity: 0; }
    .restore input:focus-visible + span { border-color: #e0e0e0; }
    .note { color: #999; }
    .failure { padding-left: 12px; border-left: 3px solid #d400cc; }
  ` ],
})
export class SaveDiskPickerComponent {
  public readonly disks: InputSignal<readonly ISaveDiskSummary[]> = input.required<readonly ISaveDiskSummary[]>();
  public readonly limit: InputSignal<number> = input.required<number>();
  public readonly failure: InputSignal<string | null> = input<string | null>(null);

  public readonly played: OutputEmitterRef<string> = output<string>();
  public readonly exported: OutputEmitterRef<string> = output<string>();
  public readonly discarded: OutputEmitterRef<string> = output<string>();
  public readonly renamed: OutputEmitterRef<{ id: string; name: string }> = output<{ id: string; name: string }>();
  public readonly created: OutputEmitterRef<string> = output<string>();
  public readonly restored: OutputEmitterRef<File> = output<File>();

  protected readonly newName: WritableSignal<string> = signal<string>('');
  protected readonly confirming: WritableSignal<string | null> = signal<string | null>(null);
  protected readonly full: Signal<boolean> = computed((): boolean => this.disks().length >= this.limit());


  /** The first press asks again, since a discarded disk takes its party with it. */
  protected discard(id: string): void {
    if (this.confirming() === id) {
      this.confirming.set(null);
      this.discarded.emit(id);
    } else {
      this.confirming.set(id);
    }
  }


  protected onRestore(event: Event): void {
    const field: HTMLInputElement = event.target as HTMLInputElement;
    const file: File | undefined = field.files?.[0];

    if (file != null) {
      this.restored.emit(file);
      field.value = '';
    }
  }


  protected valueOf(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }


  protected lastPlayed(disk: ISaveDiskSummary): string {
    return (disk.playedAt === disk.createdAt) ? 'never saved' : `saved ${ new Date(disk.playedAt).toLocaleDateString() }`;
  }

}
