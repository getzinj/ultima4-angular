import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import type { WritableSignal } from '@angular/core';

import { DiskImage } from './data/disk-image';
import { loadMasterImages, storeMasterImages } from './data/disk-storage';
import type { MasterImages } from './data/disk-storage';
import { Dos33Disk } from './data/dos33';
import { GameDisks } from './data/game-disks';
import { DISK_NAMES } from './data/ultima-disks';
import type { UltimaDiskName } from './data/ultima-disks';
import { AppleMachine } from './runtime/apple-machine';
import { drawTestPattern } from './runtime/test-pattern';
import { AppleScreenComponent } from './ui/apple-screen.component';
import { DiskImportComponent } from './ui/disk-import.component';
import type { ImportedDisks } from './ui/disk-import.component';


type AppState = 'loading' | 'importing' | 'ready';


@Component({
  selector: 'ultima4-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ AppleScreenComponent, DiskImportComponent ],
  template: `
    @switch (state()) {
      @case ('importing') {
        <ultima4-disk-import (imported)="onImported($event)" />
      }
      @case ('ready') {
        <ultima4-apple-screen [machine]="machine" />
      }
    }
  `,
  styles: [ ':host { display: block; width: 100%; height: 100%; }' ],
  host: {
    '(document:keydown)': 'onKeyDown($event)',
  },
})
export class AppComponent {
  protected readonly machine: AppleMachine = new AppleMachine();
  protected readonly state: WritableSignal<AppState> = signal<AppState>('loading');

  /** The disks as the game will play them; nothing reads them until the game is ported. */
  protected disks: GameDisks | null = null;


  constructor() {
    drawTestPattern(this.machine);
    void this.start();
  }


  protected async onImported(masters: ImportedDisks): Promise<void> {
    await storeMasterImages(Object.fromEntries(DISK_NAMES.map((name: UltimaDiskName): [ UltimaDiskName, Uint8Array ] =>
      [ name, masters[name].image.bytes ])) as MasterImages);
    await this.ready(masters);
  }


  protected onKeyDown(event: KeyboardEvent): void {
    if ((this.state() === 'ready') && !event.altKey && !event.metaKey && this.machine.keyboard.pressKey(event.key, event.ctrlKey)) {
      event.preventDefault();
    }
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
    try {
      this.disks = await GameDisks.prepare(masters);
      this.state.set('ready');
    } catch (thrown: unknown) {
      console.error('The stored disks could not be prepared; asking for them again.', thrown);
      this.state.set('importing');
    }
  }

}
