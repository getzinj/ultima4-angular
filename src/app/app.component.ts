import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import type { WritableSignal } from '@angular/core';

import { DiskImage } from './data/disk-image';
import { loadMasterImages, storeMasterImages } from './data/disk-storage';
import type { MasterImages } from './data/disk-storage';
import { Dos33Disk } from './data/dos33';
import { GameDisks } from './data/game-disks';
import { DISK_NAMES } from './data/ultima-disks';
import type { UltimaDiskName } from './data/ultima-disks';
import type { PortedGame } from './port/ported-game';
import { DiskImportComponent } from './ui/disk-import.component';
import type { ImportedDisks } from './ui/disk-import.component';
import { GameComponent } from './ui/game.component';


type AppState = 'loading' | 'importing' | 'ready';


@Component({
  selector: 'ultima4-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ DiskImportComponent, GameComponent ],
  template: `
    @switch (state()) {
      @case ('importing') {
        <ultima4-disk-import (imported)="onImported($event)" />
      }
      @case ('ready') {
        @if (game(); as running) {
          <ultima4-game [game]="running" />
        }
      }
    }
  `,
  styles: [ ':host { display: block; width: 100%; height: 100%; }' ],
})
export class AppComponent {
  protected readonly state: WritableSignal<AppState> = signal<AppState>('loading');
  protected readonly game: WritableSignal<PortedGame | null> = signal<PortedGame | null>(null);


  constructor() {
    void this.start();
  }


  protected async onImported(masters: ImportedDisks): Promise<void> {
    await storeMasterImages(Object.fromEntries(DISK_NAMES.map((name: UltimaDiskName): [ UltimaDiskName, Uint8Array ] =>
      [ name, masters[name].image.bytes ])) as MasterImages);
    await this.ready(masters);
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


  /** The disks prepared, and the game, fetched on demand to keep it out of the first download, booted from them. */
  private async ready(masters: ImportedDisks): Promise<void> {
    try {
      const disks: GameDisks = await GameDisks.prepare(masters);
      const { PortedGame: Game } = await import('./port/ported-game');

      this.game.set(new Game(disks.all));
      this.state.set('ready');
    } catch (thrown: unknown) {
      console.error('The stored disks could not be prepared; asking for them again.', thrown);
      this.state.set('importing');
    }
  }

}
