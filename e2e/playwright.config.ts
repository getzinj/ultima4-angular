import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

const port: number = 4203;
const onCi: boolean = process.env['CI'] != null;

// Sandboxed runners pre-install Chromium here; elsewhere Playwright uses its own.
const chromium: string = '/opt/pw-browsers/chromium';

export default defineConfig({
  testDir: '.',
  fullyParallel: true,
  forbidOnly: onCi,
  retries: onCi ? 2 : 0,
  outputDir: 'test-results',
  reporter: [ [ 'list' ], [ 'html', { outputFolder: 'playwright-report', open: 'never' } ] ],
  timeout: 30_000,
  use: { baseURL: `http://localhost:${ port }`, trace: 'on-first-retry' },
  webServer: {
    command: `npx ng serve --port=${ port }`,
    cwd: '..',
    url: `http://localhost:${ port }`,
    reuseExistingServer: !onCi,
    timeout: 120_000,
  },
  projects: [ {
    name: 'chromium',
    use: { ...devices['Desktop Chrome'], launchOptions: existsSync(chromium) ? { executablePath: chromium } : {} },
  } ],
});
