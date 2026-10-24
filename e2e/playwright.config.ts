import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';


// Some sandboxed CI environments pre-install Chromium at this fixed path instead of
// letting Playwright manage its own browser binary. Only pin executablePath when that
// path actually exists, so local dev and other CI runners fall back to Playwright's
// normal managed-browser resolution.
const sandboxChromiumPath: string = '/opt/pw-browsers/chromium';

// CI hands the e2e job one E2E_PORT and runs every affected app's e2e at once, so Ultima4 takes
// the port after it and leaves E2E_PORT itself to Stonequest.
const ciPort: string | undefined = process.env['E2E_PORT'];
const port: number = ciPort == null ? 4203 : Number(ciPort) + 1;
const baseURL: string = `http://localhost:${ port }`;


export default defineConfig({
  testDir: '.',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  // 'html' writes a self-contained report to playwright-report/ so CI has something to
  // upload as an artifact when a run fails; 'list' keeps the terminal output contributors see.
  //
  // Both output paths are spelled out because Playwright's defaults are not relative to this
  // config: given no explicit value it resolves them against the nearest package.json above the
  // config directory, which here is the workspace root, three levels up, where CI's upload of
  // apps/*/e2e/playwright-report/ would find nothing.
  reporter: [ [ 'list' ], [ 'html', { outputFolder: 'playwright-report', open: 'never' } ] ],
  outputDir: 'test-results',
  timeout: 30_000,
  use: {
    baseURL: baseURL,
    trace: 'on-first-retry',
  },
  webServer: {
    command: `npx nx serve Ultima4 --port=${ port }`,
    cwd: '../../..',
    url: baseURL,
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: existsSync(sandboxChromiumPath) ? { executablePath: sandboxChromiumPath } : {},
      },
    },
  ],
});
