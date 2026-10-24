import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

import { syntheticDiskSet } from '../src/app/data/testing/synthetic-disks';


async function pixelAt(page: Page, x: number, y: number): Promise<number[]> {
  return page.locator('ultima4-apple-screen canvas').evaluate((canvas: HTMLCanvasElement, point: { x: number; y: number }): number[] => {
    const context: CanvasRenderingContext2D | null = canvas.getContext('2d');

    return context == null ? [] : Array.from(context.getImageData(point.x, point.y, 1, 1).data);
  }, { x, y });
}


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

test('the test pattern paints the violet bar', async ({ page }: { page: Page }) => {
  await importSyntheticDisks(page);

  await expect.poll((): Promise<number[]> => pixelAt(page, 14, 64)).toEqual([ 0xD4, 0x00, 0xCC, 255 ]);
});

test('the test pattern paints the blue bar', async ({ page }: { page: Page }) => {
  await importSyntheticDisks(page);

  await expect.poll((): Promise<number[]> => pixelAt(page, 142, 64)).toEqual([ 0x00, 0x99, 0xFF, 255 ]);
});
