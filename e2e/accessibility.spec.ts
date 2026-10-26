import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

import { importSyntheticDisks, playNewSaveDisk } from './synthetic-play';


async function scrollsSideways(page: Page): Promise<boolean> {
  return page.evaluate((): boolean => document.documentElement.scrollWidth > document.documentElement.clientWidth);
}


test.describe('on a desktop', (): void => {
  test('the page has a language and a title', async ({ page }: { page: Page }): Promise<void> => {
    await page.goto('/');

    await expect(page).toHaveTitle('Ultima IV');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('the picture is an image with a name', async ({ page }: { page: Page }): Promise<void> => {
    await playNewSaveDisk(page);

    await expect(page.getByRole('img', { name: 'Ultima IV' })).toBeVisible();
  });

  test('the party is a region of its own', async ({ page }: { page: Page }): Promise<void> => {
    await playNewSaveDisk(page);

    await expect(page.getByRole('region', { name: 'Party' })).toBeAttached();
  });

  test('every control on the save disks is named', async ({ page }: { page: Page }): Promise<void> => {
    await importSyntheticDisks(page);
    await page.getByRole('button', { name: 'Make a new save disk' }).click();
    await expect(page.getByLabel('Name of DISK 1')).toBeVisible();
    const unnamed: number = await page.locator('button, input').evaluateAll((controls: Element[]): number =>
      controls.filter((control: Element): boolean => (control.getAttribute('aria-label') ?? control.textContent ?? '').trim() === '' && (control.closest('label') == null)).length);

    expect(unnamed).toBe(0);
  });

  test('Tab leaves the game and reaches the settings', async ({ page }: { page: Page }): Promise<void> => {
    await playNewSaveDisk(page);
    await expect(page.locator('ultima4-game')).toBeVisible();
    await page.locator('body').focus();
    await page.keyboard.press('Tab');

    await expect(page.getByLabel('Display settings')).toBeFocused();
  });

  test('the settings open from the keyboard', async ({ page }: { page: Page }): Promise<void> => {
    await playNewSaveDisk(page);
    await page.getByLabel('Display settings').focus();
    await page.keyboard.press('Enter');

    await expect(page.getByLabel('CRT effect')).toBeVisible();
  });

  test('the touch pad stays out of the way of a mouse', async ({ page }: { page: Page }): Promise<void> => {
    await playNewSaveDisk(page);

    await expect(page.getByRole('group', { name: 'Touch controls' })).toBeHidden();
  });

  test('an error nothing caught is put on a banner', async ({ page }: { page: Page }): Promise<void> => {
    await playNewSaveDisk(page);
    await page.evaluate((): void => {
      setTimeout((): void => {
        throw new Error('a test failure');
      });
    });

    await expect(page.getByRole('alert')).toContainText('Something went wrong: a test failure');
  });

  test('the banner can be dismissed', async ({ page }: { page: Page }): Promise<void> => {
    await playNewSaveDisk(page);
    await page.evaluate((): void => {
      setTimeout((): void => {
        throw new Error('a test failure');
      });
    });
    await page.getByRole('button', { name: 'Dismiss' }).click();

    await expect(page.getByRole('alert')).toHaveCount(0);
  });
});


test.describe('on a touch screen', (): void => {
  test.use({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });

  test('the touch pad is shown with every button named', async ({ page }: { page: Page }): Promise<void> => {
    await playNewSaveDisk(page);
    const buttons: string[] = await page.getByRole('group', { name: 'Touch controls' }).getByRole('button').evaluateAll((found: Element[]): string[] =>
      found.map((button: Element): string => button.getAttribute('aria-label') ?? ''));

    expect(buttons.filter((name: string): boolean => name.trim() === '')).toEqual([]);
  });

  test('the picture fits the width of the phone', async ({ page }: { page: Page }): Promise<void> => {
    await playNewSaveDisk(page);
    const box: { width: number } | null = await page.locator('ultima4-apple-screen .monitor').boundingBox();

    expect(Math.round(box?.width ?? 0)).toBe(390);
  });

  test('the game does not scroll sideways', async ({ page }: { page: Page }): Promise<void> => {
    await playNewSaveDisk(page);
    await expect(page.locator('ultima4-game')).toBeVisible();

    expect(await scrollsSideways(page)).toBe(false);
  });

  test('the save disks do not scroll sideways', async ({ page }: { page: Page }): Promise<void> => {
    await importSyntheticDisks(page);
    await page.getByRole('button', { name: 'Make a new save disk' }).click();
    await expect(page.getByLabel('Name of DISK 1')).toBeVisible();

    expect(await scrollsSideways(page)).toBe(false);
  });
});
