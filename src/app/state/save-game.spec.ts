import { mock } from 'vitest-mock-extended';

import { GameDisks } from '../data/game-disks';
import { syntheticDiskSet } from '../data/testing/synthetic-disks';
import { NEW_GAME, SAVE_GAME, SaveGameError, loadSaveFiles, storeSaveFiles } from './save-game';
import type { ISaveDisks } from './save-game';
import { FlatStateMemory } from './state-memory';


async function disks(): Promise<GameDisks> {
  return GameDisks.prepare(syntheticDiskSet());
}


describe('save files', (): void => {
  it('BSAVEs PRTY from zero page', (): void => {
    const saveDisks: ISaveDisks = mock<ISaveDisks>();

    storeSaveFiles(saveDisks, new FlatStateMemory());

    expect(saveDisks.bsave).toHaveBeenCalledWith('britannia', 'PRTY', 0x0000, new Uint8Array(0x20));
  });

  it('BSAVEs ROST from $EC00, both pages', (): void => {
    const saveDisks: ISaveDisks = mock<ISaveDisks>();

    storeSaveFiles(saveDisks, new FlatStateMemory());

    expect(saveDisks.bsave).toHaveBeenCalledWith('britannia', 'ROST', 0xEC00, new Uint8Array(0x200));
  });

  it('BSAVEs LIST from $EE00', (): void => {
    const saveDisks: ISaveDisks = mock<ISaveDisks>();

    storeSaveFiles(saveDisks, new FlatStateMemory());

    expect(saveDisks.bsave).toHaveBeenCalledWith('britannia', 'LIST', 0xEE00, new Uint8Array(0x100));
  });

  it('loads back what it saved', async (): Promise<void> => {
    const gameDisks: GameDisks = await disks();
    const saved: FlatStateMemory = new FlatStateMemory();
    const loaded: FlatStateMemory = new FlatStateMemory();

    saved.write(0x0F, 3);
    saved.write(0xEC05, 0xC1);
    saved.write(0xEEFF, 0x42);
    storeSaveFiles(gameDisks, saved);
    loadSaveFiles(gameDisks, loaded);

    expect(loaded.bytes).toEqual(saved.bytes);
  });

  it('refuses a file of the wrong length', async (): Promise<void> => {
    const gameDisks: GameDisks = await disks();

    expect((): void => loadSaveFiles(gameDisks, new FlatStateMemory(), NEW_GAME)).toThrow(SaveGameError);
  });

  it('names the save game\'s files on the britannia disk', (): void => {
    expect(SAVE_GAME.map((file: { disk: string; name: string }): string => `${ file.disk }/${ file.name }`)).toEqual([ 'britannia/PRTY', 'britannia/ROST', 'britannia/LIST' ]);
  });
});
