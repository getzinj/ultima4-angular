import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';


async function pixelAt(page: Page, x: number, y: number): Promise<number[]> {
  return page.locator('ultima4-apple-screen canvas').evaluate((canvas: HTMLCanvasElement, point: { x: number; y: number }): number[] => {
    const context: CanvasRenderingContext2D | null = canvas.getContext('2d');

    return context == null ? [] : Array.from(context.getImageData(point.x, point.y, 1, 1).data);
  }, { x, y });
}


test('the screen is a 280 by 192 canvas', async ({ page }: { page: Page }) => {
  await page.goto('/');

  await expect(page.locator('ultima4-apple-screen canvas')).toHaveJSProperty('width', 280);
});

test('the test pattern paints the violet bar', async ({ page }: { page: Page }) => {
  await page.goto('/');

  await expect.poll((): Promise<number[]> => pixelAt(page, 14, 64)).toEqual([ 0xD4, 0x00, 0xCC, 255 ]);
});

test('the test pattern paints the blue bar', async ({ page }: { page: Page }) => {
  await page.goto('/');

  await expect.poll((): Promise<number[]> => pixelAt(page, 142, 64)).toEqual([ 0x00, 0x99, 0xFF, 255 ]);
});
