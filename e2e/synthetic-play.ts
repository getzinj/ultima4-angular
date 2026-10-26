import type { Page } from '@playwright/test';

import { syntheticDiskSet } from '../src/app/data/testing/synthetic-disks';


export async function importSyntheticDisks(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Disk images').setInputFiles(Object.entries(syntheticDiskSet()).map(([ name, disk ]) =>
    ({ name: `${ name }.do`, mimeType: 'application/octet-stream', buffer: Buffer.from(disk.image.bytes) })));
}


/** The synthetic disks imported, a new save disk made, and played. */
export async function playNewSaveDisk(page: Page): Promise<void> {
  await importSyntheticDisks(page);
  await page.getByRole('button', { name: 'Make a new save disk' }).click();
  await page.getByRole('button', { name: 'Play' }).click();
}
