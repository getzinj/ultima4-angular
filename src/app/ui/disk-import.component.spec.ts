import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';

import { syntheticDisk } from '../data/testing/synthetic-disks';
import type { UltimaDiskName } from '../data/ultima-disks';
import { DiskImportComponent } from './disk-import.component';
import type { ImportedDisks } from './disk-import.component';


function imageFile(name: UltimaDiskName): File {
  return new File([ syntheticDisk(name).image.bytes.slice() ], `${ name }.do`);
}


describe('DiskImportComponent', (): void => {
  let fixture: ComponentFixture<DiskImportComponent>;
  let emitted: ImportedDisks | null;

  beforeEach(async (): Promise<void> => {
    emitted = null;
    fixture = TestBed.createComponent(DiskImportComponent);
    fixture.componentInstance.imported.subscribe((disks: ImportedDisks): void => {
      emitted = disks;
    });
    await fixture.whenStable();
  });

  function text(): string {
    fixture.detectChanges();

    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  it('lists all four disks as needed at first', (): void => {
    expect(text().match(/needed/g)?.length).toBe(4);
  });

  it('marks a disk found once its image is added', async (): Promise<void> => {
    await fixture.componentInstance.addFiles([ imageFile('towne') ]);

    expect(text()).toContain('towne: found');
  });

  it('does not finish with only some of the disks', async (): Promise<void> => {
    await fixture.componentInstance.addFiles([ imageFile('towne') ]);

    expect(emitted).toBeNull();
  });

  it('finishes once all four have come, in any number of goes', async (): Promise<void> => {
    await fixture.componentInstance.addFiles([ imageFile('towne'), imageFile('program') ]);
    await fixture.componentInstance.addFiles([ imageFile('underworld'), imageFile('britannia') ]);

    expect(emitted?.underworld.find('DNGD')).not.toBeNull();
  });

  it('shows why a file was refused', async (): Promise<void> => {
    await fixture.componentInstance.addFiles([ new File([ new Uint8Array(232_960) ], 'side A.nib') ]);

    expect(text()).toContain('side A.nib is a nibble image');
  });
});
