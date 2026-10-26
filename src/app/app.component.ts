import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import type { WritableSignal } from '@angular/core';

import { DiskImage } from './data/disk-image';
import { BrowserSaveDiskStore, loadMasterImages, requestDurableStorage, storeMasterImages } from './data/disk-storage';
import type { MasterImages } from './data/disk-storage';
import { Dos33Disk } from './data/dos33';
import { GameDisks } from './data/game-disks';
import { exportSaveDisk, importSaveDisk, nameFromFile, offerDownload } from './data/save-disk-file';
import { MAXIMUM_SAVE_DISKS, SaveDiskLibrary } from './data/save-disks';
import type { ISaveDisk, ISaveDiskSummary, NewDiskResult } from './data/save-disks';
import { DISK_NAMES } from './data/ultima-disks';
import type { UltimaDiskName } from './data/ultima-disks';
import type { PortedGame } from './port/ported-game';
import { DiskImportComponent } from './ui/disk-import.component';
import type { ImportedDisks } from './ui/disk-import.component';
import { GameComponent } from './ui/game.component';
import { SaveDiskPickerComponent } from './ui/save-disk-picker.component';


type AppState = 'loading' | 'importing' | 'picking' | 'ready';


@Component({
  selector: 'ultima4-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ DiskImportComponent, GameComponent, SaveDiskPickerComponent ],
  template: `
    @switch (state()) {
      @case ('importing') {
        <ultima4-disk-import (imported)="onImported($event)" />
      }
      @case ('picking') {
        <ultima4-save-disk-picker
          [disks]="saveDisks()"
          [limit]="limit"
          [failure]="failure()"
          (played)="play($event)"
          (exported)="exportDisk($event)"
          (discarded)="discard($event)"
          (renamed)="rename($event)"
          (created)="create($event)"
          (restored)="restore($event)"
        />
      }
      @case ('ready') {
        @if (game(); as running) {
          <ultima4-game [game]="running" (diskWritten)="keepSave()" />
        }
      }
    }
  `,
  styles: [ ':host { display: block; width: 100%; height: 100%; }' ],
})
export class AppComponent {
  protected readonly state: WritableSignal<AppState> = signal<AppState>('loading');
  protected readonly game: WritableSignal<PortedGame | null> = signal<PortedGame | null>(null);
  protected readonly saveDisks: WritableSignal<readonly ISaveDiskSummary[]> = signal<readonly ISaveDiskSummary[]>([]);
  protected readonly failure: WritableSignal<string | null> = signal<string | null>(null);
  protected readonly limit: number = MAXIMUM_SAVE_DISKS;

  private readonly library: SaveDiskLibrary = new SaveDiskLibrary(new BrowserSaveDiskStore());
  private masters: ImportedDisks | null = null;
  private playing: ISaveDisk | null = null;
  private saving: Promise<void> = Promise.resolve();


  constructor() {
    void this.start();
  }


  protected async onImported(masters: ImportedDisks): Promise<void> {
    await storeMasterImages(Object.fromEntries(DISK_NAMES.map((name: UltimaDiskName): [ UltimaDiskName, Uint8Array ] =>
      [ name, masters[name].image.bytes ])) as MasterImages);
    await this.ready(masters);
  }


  /** The save disk played on the masters, the game fetched on demand to keep it out of the first download. */
  protected async play(id: string): Promise<void> {
    const disk: ISaveDisk | null = await this.library.read(id);

    if ((disk != null) && (this.masters != null)) {
      try {
        const disks: GameDisks = await GameDisks.prepare({ ...this.masters, britannia: new Dos33Disk(new DiskImage(disk.image.slice())) });
        const { PortedGame: Game } = await import('./port/ported-game');

        this.playing = disk;
        this.game.set(new Game(disks.all));
        this.state.set('ready');
      } catch (thrown: unknown) {
        console.error('The disks could not be prepared.', thrown);
        this.failure.set(`${ disk.name } could not be played: ${ (thrown instanceof Error) ? thrown.message : String(thrown) }`);
      }
    }
  }


  /** What the game has written to its Britannia disk, kept on the save disk; one save at a time, in order. */
  protected keepSave(): void {
    const game: PortedGame | null = this.game();

    if ((game != null) && (this.playing != null)) {
      const image: Uint8Array = game.savedImage();

      this.saving = this.saving.then(async (): Promise<void> => {
        if (this.playing != null) {
          this.playing = await this.library.save(this.playing, image);
        }
      }).catch((thrown: unknown): void => console.error('The save disk could not be kept.', thrown));
    }
  }


  protected async create(name: string): Promise<void> {
    if (this.masters != null) {
      await this.added(await this.library.create(this.masters.britannia.image.bytes, name));
    }
  }


  protected async restore(file: File): Promise<void> {
    try {
      const image: Uint8Array = importSaveDisk(file.name, new Uint8Array(await file.arrayBuffer()));

      await this.added(await this.library.create(image, nameFromFile(file.name)));
    } catch (thrown: unknown) {
      this.failure.set((thrown instanceof Error) ? thrown.message : String(thrown));
    }
  }


  protected async exportDisk(id: string): Promise<void> {
    const disk: ISaveDisk | null = await this.library.read(id);

    if (disk != null) {
      offerDownload(exportSaveDisk(disk));
    }
  }


  protected async discard(id: string): Promise<void> {
    await this.library.remove(id);
    await this.refresh();
  }


  protected async rename(change: { id: string; name: string }): Promise<void> {
    await this.library.rename(change.id, change.name);
    await this.refresh();
  }


  private async added(result: NewDiskResult): Promise<void> {
    if (result.ok) {
      this.failure.set(null);
      void requestDurableStorage();
    } else {
      this.failure.set(result.message);
    }
    await this.refresh();
  }


  private async refresh(): Promise<void> {
    this.saveDisks.set(await this.library.list());
  }


  private async start(): Promise<void> {
    const stored: MasterImages | null = await loadMasterImages();

    if (stored == null) {
      this.state.set('importing');
    } else {
      await this.ready(Object.fromEntries(DISK_NAMES.map((name: UltimaDiskName): [ UltimaDiskName, Dos33Disk ] =>
        [ name, new Dos33Disk(new DiskImage(stored[name])) ])) as ImportedDisks);
    }
  }


  private async ready(masters: ImportedDisks): Promise<void> {
    this.masters = masters;
    await this.refresh();
    this.state.set('picking');
  }

}
