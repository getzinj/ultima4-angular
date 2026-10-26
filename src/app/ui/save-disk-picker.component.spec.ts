import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';

import type { ISaveDiskSummary } from '../data/save-disks';
import { SaveDiskPickerComponent } from './save-disk-picker.component';

const DISK: ISaveDiskSummary = { id: 'one', name: 'AVATAR', createdAt: 1, playedAt: 1 };


describe('SaveDiskPickerComponent', (): void => {
  let fixture: ComponentFixture<SaveDiskPickerComponent>;
  let emitted: string[];

  async function showing(disks: readonly ISaveDiskSummary[], limit: number = 6): Promise<HTMLElement> {
    fixture = TestBed.createComponent(SaveDiskPickerComponent);
    fixture.componentRef.setInput('disks', disks);
    fixture.componentRef.setInput('limit', limit);
    emitted = [];
    fixture.componentInstance.played.subscribe((id: string): void => {
      emitted.push(`play ${ id }`);
    });
    fixture.componentInstance.discarded.subscribe((id: string): void => {
      emitted.push(`discard ${ id }`);
    });
    fixture.componentInstance.created.subscribe((name: string): void => {
      emitted.push(`create ${ name }`);
    });
    await fixture.whenStable();

    return fixture.nativeElement as HTMLElement;
  }

  function button(element: HTMLElement, text: string): HTMLButtonElement {
    return Array.from(element.querySelectorAll('button')).find((candidate: HTMLButtonElement): boolean => candidate.textContent?.trim() === text) as HTMLButtonElement;
  }

  it('explains save disks when there are none', async (): Promise<void> => {
    expect((await showing([])).textContent).toContain('No save disks yet');
  });

  it('names each disk', async (): Promise<void> => {
    expect(((await showing([ DISK ])).querySelector('input.name') as HTMLInputElement).value).toBe('AVATAR');
  });

  it('plays the disk chosen', async (): Promise<void> => {
    button(await showing([ DISK ]), 'Play').click();

    expect(emitted).toEqual([ 'play one' ]);
  });

  it('asks again before discarding', async (): Promise<void> => {
    button(await showing([ DISK ]), 'Discard').click();

    expect(emitted).toEqual([]);
  });

  it('discards on the second press', async (): Promise<void> => {
    const element: HTMLElement = await showing([ DISK ]);

    button(element, 'Discard').click();
    await fixture.whenStable();
    button(element, 'Really discard?').click();

    expect(emitted).toEqual([ 'discard one' ]);
  });

  it('makes a new disk with the name typed', async (): Promise<void> => {
    const element: HTMLElement = await showing([]);
    const field: HTMLInputElement = element.querySelector('input[aria-label="Name for the new save disk"]') as HTMLInputElement;

    field.value = 'HONESTY';
    field.dispatchEvent(new Event('input'));
    button(element, 'Make a new save disk').click();

    expect(emitted).toEqual([ 'create HONESTY' ]);
  });

  it('offers no new disk once the shelf is full', async (): Promise<void> => {
    expect(button(await showing([ DISK ], 1), 'Make a new save disk')).toBeUndefined();
  });

  it('says why a disk was refused', async (): Promise<void> => {
    const element: HTMLElement = await showing([]);

    fixture.componentRef.setInput('failure', 'towne.do is the towne disk');
    await fixture.whenStable();

    expect(element.querySelector('[role="alert"]')?.textContent).toContain('towne.do is the towne disk');
  });
});
