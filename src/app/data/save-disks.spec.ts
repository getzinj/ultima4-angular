import { InMemorySaveDiskStore, SaveDiskLibrary } from './save-disks';
import type { ISaveDisk, ISaveDiskSummary, NewDiskResult } from './save-disks';

const IMAGE: Uint8Array = Uint8Array.of(1, 2, 3);


function created(result: NewDiskResult): ISaveDisk {
  if (!result.ok) {
    throw new Error(result.message);
  } else {
    return result.disk;
  }
}


describe('SaveDiskLibrary', (): void => {
  let library: SaveDiskLibrary;

  beforeEach((): void => {
    library = new SaveDiskLibrary(new InMemorySaveDiskStore(), 2);
  });

  it('keeps a new disk\'s image', async (): Promise<void> => {
    const disk: ISaveDisk = created(await library.create(IMAGE, 'AVATAR'));

    expect((await library.read(disk.id))?.image).toEqual(IMAGE);
  });

  it('copies the image, so the master is never written', async (): Promise<void> => {
    const master: Uint8Array = Uint8Array.of(1, 2, 3);
    const disk: ISaveDisk = created(await library.create(master, 'AVATAR'));

    master[0] = 9;

    expect((await library.read(disk.id))?.image[0]).toBe(1);
  });

  it('names a disk left unnamed with a name not taken', async (): Promise<void> => {
    created(await library.create(IMAGE, 'DISK 1'));

    expect(created(await library.create(IMAGE, '  ')).name).toBe('DISK 2');
  });

  it('refuses a disk past the limit', async (): Promise<void> => {
    created(await library.create(IMAGE, 'A'));
    created(await library.create(IMAGE, 'B'));

    expect((await library.create(IMAGE, 'C')).ok).toBe(false);
  });

  it('keeps what the game wrote', async (): Promise<void> => {
    const disk: ISaveDisk = created(await library.create(IMAGE, 'AVATAR'));

    await library.save(disk, Uint8Array.of(7));

    expect((await library.read(disk.id))?.image).toEqual(Uint8Array.of(7));
  });

  it('lists the disk saved most recently first', async (): Promise<void> => {
    const first: ISaveDisk = created(await library.create(IMAGE, 'FIRST'));

    created(await library.create(IMAGE, 'SECOND'));
    await new Promise<void>((resolve: () => void): void => {
      setTimeout(resolve, 2);
    });
    await library.save(first, IMAGE);

    expect((await library.list()).map((disk: ISaveDiskSummary): string => disk.name)).toEqual([ 'FIRST', 'SECOND' ]);
  });

  it('renames a disk', async (): Promise<void> => {
    const disk: ISaveDisk = created(await library.create(IMAGE, 'AVATAR'));

    await library.rename(disk.id, ' SHAMINO ');

    expect((await library.read(disk.id))?.name).toBe('SHAMINO');
  });

  it('keeps the name when the new one is blank', async (): Promise<void> => {
    const disk: ISaveDisk = created(await library.create(IMAGE, 'AVATAR'));

    await library.rename(disk.id, ' ');

    expect((await library.read(disk.id))?.name).toBe('AVATAR');
  });

  it('discards a disk', async (): Promise<void> => {
    const disk: ISaveDisk = created(await library.create(IMAGE, 'AVATAR'));

    await library.remove(disk.id);

    expect(await library.read(disk.id)).toBeNull();
  });
});
