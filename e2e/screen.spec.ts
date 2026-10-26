import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

import { syntheticDiskSet } from '../src/app/data/testing/synthetic-disks';


async function importSyntheticDisks(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Disk images').setInputFiles(Object.entries(syntheticDiskSet()).map(([ name, disk ]) =>
    ({ name: `${ name }.do`, mimeType: 'application/octet-stream', buffer: Buffer.from(disk.image.bytes) })));
}


test('a fresh browser asks for the four disks', async ({ page }: { page: Page }) => {
  await page.goto('/');

  await expect(page.getByText('This port needs your own copies of the four Apple II disks')).toBeVisible();
});

test('a wrong file is refused with a reason', async ({ page }: { page: Page }) => {
  await page.goto('/');
  await page.getByLabel('Disk images').setInputFiles({ name: 'side A.nib', mimeType: 'application/octet-stream', buffer: Buffer.alloc(232_960) });

  await expect(page.getByText('side A.nib is a nibble image')).toBeVisible();
});

test('the four disks lead to the screen', async ({ page }: { page: Page }) => {
  await importSyntheticDisks(page);

  await expect(page.locator('ultima4-apple-screen canvas')).toHaveJSProperty('width', 280);
});

test('the disks are remembered for the next visit', async ({ page }: { page: Page }) => {
  await importSyntheticDisks(page);
  await expect(page.locator('ultima4-apple-screen canvas')).toBeVisible();
  await page.reload();

  await expect(page.locator('ultima4-apple-screen canvas')).toBeVisible();
});

test('the game runs from the disks without stopping', async ({ page }: { page: Page }) => {
  await importSyntheticDisks(page);
  await expect(page.locator('ultima4-game')).toBeVisible();
  await page.waitForTimeout(3_000);

  await expect(page.getByRole('alert')).toHaveCount(0);
});
