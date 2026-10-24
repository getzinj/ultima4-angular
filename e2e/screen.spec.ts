import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';


test('the screen is a 280 by 192 canvas', async ({ page }: { page: Page }) => {
  await page.goto('/');

  await expect(page.locator('ultima4-apple-screen canvas')).toHaveJSProperty('width', 280);
});
