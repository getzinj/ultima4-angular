import type { Download, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

import { syntheticDiskSet } from '../src/app/data/testing/synthetic-disks';


async function importSyntheticDisks(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Disk images').setInputFiles(Object.entries(syntheticDiskSet()).map(([ name, disk ]) =>
    ({ name: `${ name }.do`, mimeType: 'application/octet-stream', buffer: Buffer.from(disk.image.bytes) })));
}


/** The synthetic disks imported, a new save disk made, and played. */
async function playNewSaveDisk(page: Page): Promise<void> {
  await importSyntheticDisks(page);
  await page.getByRole('button', { name: 'Make a new save disk' }).click();
  await page.getByRole('button', { name: 'Play' }).click();
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

test('the four disks lead to the save disks', async ({ page }: { page: Page }) => {
  await importSyntheticDisks(page);

  await expect(page.getByText('No save disks yet')).toBeVisible();
});

test('a new save disk plays on the screen', async ({ page }: { page: Page }) => {
  await playNewSaveDisk(page);

  await expect(page.locator('ultima4-apple-screen canvas.picture')).toHaveJSProperty('width', 280);
});

test('the disks and the save disks are remembered for the next visit', async ({ page }: { page: Page }) => {
  await importSyntheticDisks(page);
  await page.getByRole('button', { name: 'Make a new save disk' }).click();
  await expect(page.getByLabel('Name of DISK 1')).toBeVisible();
  await page.reload();

  await expect(page.getByLabel('Name of DISK 1')).toBeVisible();
});

test('a save disk exports as a .do', async ({ page }: { page: Page }) => {
  await importSyntheticDisks(page);
  await page.getByRole('button', { name: 'Make a new save disk' }).click();
  const download: Promise<Download> = page.waitForEvent('download');

  await page.getByRole('button', { name: 'Export' }).click();

  expect((await download).suggestedFilename()).toBe('DISK-1.do');
});

test('the game runs from the disks without stopping', async ({ page }: { page: Page }) => {
  await playNewSaveDisk(page);
  await expect(page.locator('ultima4-game')).toBeVisible();
  await page.waitForTimeout(3_000);

  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('the CRT effect can be turned off from the settings', async ({ page }: { page: Page }) => {
  await playNewSaveDisk(page);
  await page.getByLabel('Display settings').click();
  await page.getByLabel('CRT effect').uncheck();

  await expect(page.locator('.scanlines')).toHaveCount(0);
});

test('the game\'s messages are a log for screen readers', async ({ page }: { page: Page }) => {
  await playNewSaveDisk(page);

  await expect(page.getByRole('log', { name: 'Messages' })).toBeAttached();
});
