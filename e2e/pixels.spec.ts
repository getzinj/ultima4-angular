import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

import { NTSC_ARTIFACT_PALETTE } from '../src/app/runtime/apple-palette';
import { renderHires } from '../src/app/runtime/hires-renderer';

// Local only: the game on your own disks, in the browser, against the oracle's recorded screens.
// The disks are the originals tools/oracle/build-disks.sh was given and the screens what
// tools/oracle/record.py kept; with neither here, as in CI, the spec is skipped. The browser imports
// the disks and plays as a player would, then the running game is swapped for a fresh one and the
// scenario's keys replayed at the keyboard polls the oracle took them at, since the game draws
// random numbers while it waits and a key a moment later makes a different screen. At every
// snapshot the canvas must hold, pixel for pixel, the oracle's hi-res page through the renderer.

const ORACLE: string = join(__dirname, '../tools/oracle');
const ORIGINALS: string = join(ORACLE, 'work/u4remasteredA2/files/original');
const DISKS: readonly string[] = [ 'program', 'britannia', 'towne', 'underworld' ];
const SCENARIOS: readonly string[] = [ 'boot-to-title', 'creation', 'first-steps' ];
const NO_CRT: string = JSON.stringify({ palette: 'ntsc', crt: false, sound: false });

interface IStep {
  readonly key: number | null;
  readonly polls: number;
}

interface IReplayMachine {
  readonly dosLog: readonly string[];
  readonly key: number;
  pending: { code: number; polls: number } | null;
  polls: number;
  runUntil(done: () => boolean): Promise<void>;
  idle(polls: number): Promise<void>;
}

interface IReplayGame {
  readonly machine: IReplayMachine;
}

interface IReplayWindow {
  ng: { getComponent(element: Element): unknown };
  replayMachine?: IReplayMachine;
}


function stepsOf(scenario: string): readonly IStep[] {
  return (JSON.parse(readFileSync(join(ORACLE, 'digests', `${ scenario }.json`), 'utf8')) as { steps: IStep[] }).steps;
}


function expectedHash(scenario: string, step: number): string {
  const page: Uint8Array = new Uint8Array(readFileSync(join(ORACLE, 'recordings', scenario, `${ String(step).padStart(4, '0') }.hgr1.bin`)));
  const pixels: Uint8ClampedArray = new Uint8ClampedArray(280 * 192 * 4);

  renderHires(page, pixels, NTSC_ARTIFACT_PALETTE);

  return createHash('sha256').update(pixels).digest('hex');
}


async function canvasHash(page: Page): Promise<string> {
  return page.locator('ultima4-apple-screen canvas.picture').evaluate(async (canvas: HTMLCanvasElement): Promise<string> => {
    const data: Uint8ClampedArray = (canvas.getContext('2d') as CanvasRenderingContext2D).getImageData(0, 0, 280, 192).data;
    const digest: ArrayBuffer = await crypto.subtle.digest('SHA-256', data);

    return Array.from(new Uint8Array(digest)).map((byte: number): string => byte.toString(16).padStart(2, '0')).join('');
  });
}


/** The game the player started stopped and a fresh one put on the screen in its place, run to BOOT. */
async function freshGame(page: Page): Promise<void> {
  await page.evaluate(async (): Promise<void> => {
    const host: IReplayWindow = window as unknown as IReplayWindow;
    const root: { game: { set(game: unknown): void } } = host.ng.getComponent(document.querySelector('ultima4-root') as Element) as { game: { set(game: unknown): void } };
    const view: { ngOnDestroy(): void; game(): IReplayGame } = host.ng.getComponent(document.querySelector('ultima4-game') as Element) as { ngOnDestroy(): void; game(): IReplayGame };
    const running: IReplayGame & { disks: unknown } = view.game() as IReplayGame & { disks: unknown };
    const Game: new (disks: unknown) => IReplayGame = running.constructor as new (disks: unknown) => IReplayGame;

    view.ngOnDestroy();
    const fresh: IReplayGame = new Game(running.disks);

    root.game.set(fresh);
    await fresh.machine.runUntil((): boolean => fresh.machine.dosLog.some((line: string): boolean => line.startsWith('BRUN BOOT')));
    host.replayMachine = fresh.machine;
  });
}


/** The game run to where the oracle took its snapshot: the key handed over at its poll, or the polls idled. */
async function runToSnapshot(page: Page, step: IStep): Promise<void> {
  await page.evaluate(async ({ key, polls }: IStep): Promise<void> => {
    const machine: IReplayMachine = (window as unknown as IReplayWindow).replayMachine as IReplayMachine;

    if (key == null) {
      await machine.idle(polls);
    } else {
      machine.pending = { code: key & 0x7F, polls };
      machine.polls = 0;
      await machine.runUntil((): boolean => machine.pending == null);
    }
  }, step);
}


/** The key just handed over taken by the game, as the oracle's scenario waits for before the next. */
async function takeKey(page: Page): Promise<void> {
  await page.evaluate(async (): Promise<void> => {
    const machine: IReplayMachine = (window as unknown as IReplayWindow).replayMachine as IReplayMachine;

    await machine.runUntil((): boolean => (machine.key & 0x80) === 0);
  });
}


test.skip(!existsSync(join(ORIGINALS, 'u4program.do')) || !existsSync(join(ORACLE, 'recordings')), 'needs your disks and the oracle\'s recordings');

for (const scenario of SCENARIOS) {
  test(`the ${ scenario } scenario draws the oracle's screens`, async ({ page }: { page: Page }): Promise<void> => {
    test.setTimeout(300_000);
    const steps: readonly IStep[] = stepsOf(scenario);

    await page.addInitScript((settings: string): void => localStorage.setItem('ultima4.display', settings), NO_CRT);
    await page.goto('/');
    await page.getByLabel('Disk images').setInputFiles(DISKS.map((disk: string): string => join(ORIGINALS, `u4${ disk }.do`)));
    await page.getByRole('button', { name: 'Make a new save disk' }).click();
    await page.getByRole('button', { name: 'Play' }).click();
    await expect(page.locator('ultima4-game')).toBeVisible();
    await freshGame(page);

    for (let step: number = 0; step < steps.length; step++) {
      await runToSnapshot(page, steps[step]);
      await expect.poll((): Promise<string> => canvasHash(page), { message: `snapshot ${ step }` }).toBe(expectedHash(scenario, step));
      if (steps[step].key != null) {
        await takeKey(page);
      }
    }
  });
}
