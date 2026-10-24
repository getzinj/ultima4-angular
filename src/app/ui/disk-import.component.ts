import { ChangeDetectionStrategy, Component, output, signal } from '@angular/core';
import type { OutputEmitterRef, WritableSignal } from '@angular/core';

import type { Dos33Disk } from '../data/dos33';
import { DISK_NAMES, identifyDiskSet } from '../data/ultima-disks';
import type { IDiskSetResult, UltimaDiskName } from '../data/ultima-disks';


export type ImportedDisks = Readonly<Record<UltimaDiskName, Dos33Disk>>;


/** Asks for the four disk images, by picker or by drop, and says what each one turned out to be. */
@Component({
  selector: 'ultima4-disk-import',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      class="drop"
      [class.over]="over()"
      (dragover)="onDragOver($event)"
      (dragleave)="over.set(false)"
      (drop)="onDrop($event)"
    >
      <h1>Ultima IV</h1>
      <p>This port needs your own copies of the four Apple II disks: program, Britannia, towne and underworld. Drop the images here or choose them; they stay in this browser.</p>
      <label>
        Disk images
        <input type="file" multiple accept=".do,.dsk,.po,.2mg" (change)="onChoose($event)" />
      </label>
      <ul>
        @for (name of diskNames; track name) {
          <li [class.found]="found()[name]">{{ name }}: {{ found()[name] ? 'found' : 'needed' }}</li>
        }
      </ul>
      @if (problems().length > 0) {
        <ul class="problems" aria-live="polite">
          @for (problem of problems(); track problem) {
            <li>{{ problem }}</li>
          }
        </ul>
      }
    </section>
  `,
  styles: [ `
    :host { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; color: #e0e0e0; font-family: monospace; }
    .drop { max-width: 40rem; padding: 1.5rem; border: 2px dashed #555; }
    .drop.over { border-color: #e0e0e0; }
    .found { color: #00cc44; }
    .problems { color: #ff6a00; }
  ` ],
})
export class DiskImportComponent {
  public readonly imported: OutputEmitterRef<ImportedDisks> = output<ImportedDisks>();

  protected readonly diskNames: readonly UltimaDiskName[] = DISK_NAMES;
  protected readonly over: WritableSignal<boolean> = signal<boolean>(false);
  protected readonly found: WritableSignal<Partial<Record<UltimaDiskName, Dos33Disk>>> = signal<Partial<Record<UltimaDiskName, Dos33Disk>>>({});
  protected readonly problems: WritableSignal<readonly string[]> = signal<readonly string[]>([]);


  /** Sorts files into the disks already found; emits once all four are there. */
  public async addFiles(files: readonly File[]): Promise<void> {
    const read: { name: string; bytes: Uint8Array }[] = await Promise.all(files.map(async (file: File): Promise<{ name: string; bytes: Uint8Array }> =>
      ({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) })));
    const result: IDiskSetResult = identifyDiskSet(read);
    const found: Partial<Record<UltimaDiskName, Dos33Disk>> = { ...this.found(), ...result.disks };
    const missing: UltimaDiskName[] = DISK_NAMES.filter((name: UltimaDiskName): boolean => found[name] == null);

    this.found.set(found);
    this.problems.set(result.problems.filter((problem: string): boolean => !problem.endsWith('is still needed.')));

    if (missing.length === 0) {
      this.imported.emit(found as ImportedDisks);
    }
  }


  protected onChoose(event: Event): void {
    const input: HTMLInputElement = event.target as HTMLInputElement;

    void this.addFiles(Array.from(input.files ?? []));
  }


  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.over.set(true);
  }


  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.over.set(false);
    void this.addFiles(Array.from(event.dataTransfer?.files ?? []));
  }

}
