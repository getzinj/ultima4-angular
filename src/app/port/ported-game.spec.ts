import { GameDisks } from '../data/game-disks';
import { syntheticDiskSet } from '../data/testing/synthetic-disks';
import { PortedGame } from './ported-game';

const FRAME_MS: number = 16;
const CYCLES_PER_MILLISECOND: number = 1_023;
const UNHURRIED_MS: number = 60_000;


/** The game on the synthetic disks, its frames given all the host time they need. */
async function booted(): Promise<PortedGame> {
  return new PortedGame((await GameDisks.prepare(syntheticDiskSet())).all, UNHURRIED_MS);
}


describe('PortedGame', (): void => {
  it('boots by running INIT from the program disk', async (): Promise<void> => {
    expect((await booted()).machine.dosLog[0]).toBe('BRUN INIT');
  });

  it('runs a frame for the Apple time it is given', async (): Promise<void> => {
    const game: PortedGame = await booted();

    await game.runFrame(FRAME_MS);

    expect(game.machine.cpu.cycles).toBeGreaterThanOrEqual(FRAME_MS * CYCLES_PER_MILLISECOND);
  });

  it('latches a key with its strobe set', async (): Promise<void> => {
    const game: PortedGame = await booted();

    game.press(0x41);

    expect(game.machine.key).toBe(0xC1);
  });

  it('shows the machine\'s own screen', async (): Promise<void> => {
    const game: PortedGame = await booted();

    expect(game.screen).toBe(game.machine.apple);
  });

  it('has written nothing to its disks on booting', async (): Promise<void> => {
    expect((await booted()).diskWrites).toBe(0);
  });

  it('gives its Britannia disk as the save to keep', async (): Promise<void> => {
    const disks: GameDisks = await GameDisks.prepare(syntheticDiskSet());

    expect(new PortedGame(disks.all, UNHURRIED_MS).savedImage()).toEqual(disks.disk('britannia').image.bytes);
  });

  it('gives the speaker\'s sound for the Apple time just run', async (): Promise<void> => {
    const game: PortedGame = await booted();

    await game.runFrame(FRAME_MS);

    expect(game.drainSound(1_000).length).toBe(Math.round((game.machine.cpu.cycles * 1_000) / (14_318_180 / 14)));
  });

  it('gives no sound twice', async (): Promise<void> => {
    const game: PortedGame = await booted();

    await game.runFrame(FRAME_MS);
    game.drainSound(1_000);

    expect(game.drainSound(1_000).length).toBe(0);
  });
});

