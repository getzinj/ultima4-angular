import { exportSaveDisk, importSaveDisk, nameFromFile } from './save-disk-file';
import type { ISaveDisk } from './save-disks';
import { syntheticDisk } from './testing/synthetic-disks';
import { UltimaDiskError } from './ultima-disks';


function saveDisk(name: string): ISaveDisk {
  return { id: 'id', name, createdAt: 0, playedAt: 0, image: syntheticDisk('britannia').image.bytes };
}


describe('save disk files', (): void => {
  it('export as a .do named after the disk', (): void => {
    expect(exportSaveDisk(saveDisk('Lord British\'s party')).fileName).toBe('Lord-Britishs-party.do');
  });

  it('export with a name of their own when the disk\'s has nothing usable', (): void => {
    expect(exportSaveDisk(saveDisk('???')).fileName).toBe('ultima4-save.do');
  });

  it('export the Britannia disk\'s image itself', (): void => {
    const disk: ISaveDisk = saveDisk('AVATAR');

    expect(exportSaveDisk(disk).bytes).toEqual(disk.image);
  });

  it('import a Britannia disk as its image', (): void => {
    const image: Uint8Array = syntheticDisk('britannia').image.bytes;

    expect(importSaveDisk('save.do', image)).toEqual(image);
  });

  it('refuse another Ultima IV disk', (): void => {
    expect((): Uint8Array => importSaveDisk('towne.do', syntheticDisk('towne').image.bytes)).toThrow(UltimaDiskError);
  });

  it('name an imported disk after its file', (): void => {
    expect(nameFromFile('My party.do')).toBe('My party');
  });
});
