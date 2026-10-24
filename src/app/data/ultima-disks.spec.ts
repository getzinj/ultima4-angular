import { IMAGE_SIZE, prodosToDosOrder } from './disk-image';
import { Dos33Disk, formatDos33 } from './dos33';
import { syntheticDisk } from './testing/synthetic-disks';
import { identifyDisk, identifyDiskSet } from './ultima-disks';
import type { IDiskSetResult } from './ultima-disks';


function dosToProdosOrder(dos: Uint8Array): Uint8Array {
  const prodos: Uint8Array = new Uint8Array(IMAGE_SIZE);
  const blocks: readonly (readonly [ number, number ])[] = [ [ 0, 14 ], [ 13, 12 ], [ 11, 10 ], [ 9, 8 ], [ 7, 6 ], [ 5, 4 ], [ 3, 2 ], [ 1, 15 ] ];

  for (let track: number = 0; track < 35; track++) {
    blocks.forEach(([ first, second ]: readonly [ number, number ], block: number): void => {
      const base: number = (track * 4096) + (block * 512);

      prodos.set(dos.subarray(((track * 16) + first) * 256, ((track * 16) + first + 1) * 256), base);
      prodos.set(dos.subarray(((track * 16) + second) * 256, ((track * 16) + second + 1) * 256), base + 256);
    });
  }

  return prodos;
}


describe('identifyDisk', (): void => {
  it('names the towne disk by its DISK file', (): void => {
    expect(identifyDisk('side B.do', syntheticDisk('towne').image.bytes).name).toBe('towne');
  });

  it('names the underworld disk in a .dsk of unknown order', (): void => {
    expect(identifyDisk('side D.dsk', syntheticDisk('underworld').image.bytes).name).toBe('underworld');
  });

  it('reads a ProDOS-order image', (): void => {
    const prodos: Uint8Array = dosToProdosOrder(syntheticDisk('program').image.bytes);

    expect(identifyDisk('side A.po', prodos).name).toBe('program');
  });

  it('works the order of a ProDOS-order .dsk out', (): void => {
    const prodos: Uint8Array = dosToProdosOrder(syntheticDisk('britannia').image.bytes);

    expect(identifyDisk('side C.dsk', prodos).name).toBe('britannia');
  });

  it('round-trips the ProDOS reordering', (): void => {
    const dos: Uint8Array = syntheticDisk('program').image.bytes;

    expect(prodosToDosOrder(dosToProdosOrder(dos))).toEqual(dos);
  });

  it('refuses a disk that is not DOS 3.3', (): void => {
    expect((): unknown => identifyDisk('blank.do', new Uint8Array(IMAGE_SIZE))).toThrow(/not a DOS 3.3 disk/);
  });

  it('refuses a DOS 3.3 disk with no DISK file', (): void => {
    expect((): unknown => identifyDisk('other.do', formatDos33().bytes)).toThrow(/not one of the four Ultima IV disks/);
  });

  it('names the files a disk is missing', (): void => {
    const disk: Dos33Disk = new Dos33Disk(formatDos33());

    disk.writeBinary('DISK', 0xD0, Uint8Array.of(3), 16);

    expect((): unknown => identifyDisk('partial.do', disk.image.bytes)).toThrow(/towne disk, but it is missing CONA/);
  });
});


describe('identifyDiskSet', (): void => {
  it('finds all four disks in any order', (): void => {
    const result: IDiskSetResult = identifyDiskSet([ 'underworld', 'program', 'towne', 'britannia' ].map((name: string): { name: string; bytes: Uint8Array } =>
      ({ name: `${ name }.do`, bytes: syntheticDisk(name as 'program').image.bytes })));

    expect(result.problems).toEqual([]);
  });

  it('says which disks are still needed', (): void => {
    const result: IDiskSetResult = identifyDiskSet([ { name: 'a.do', bytes: syntheticDisk('program').image.bytes } ]);

    expect(result.problems).toEqual([ 'The britannia disk is still needed.', 'The towne disk is still needed.', 'The underworld disk is still needed.' ]);
  });

  it('keeps the first of two copies of a disk', (): void => {
    const result: IDiskSetResult = identifyDiskSet([
      { name: 'a.do', bytes: syntheticDisk('program').image.bytes },
      { name: 'b.do', bytes: syntheticDisk('program').image.bytes },
    ]);

    expect(result.problems[0]).toBe('b.do is a second program disk; the first one is kept.');
  });

  it('reports an unreadable file without stopping', (): void => {
    const result: IDiskSetResult = identifyDiskSet([ { name: 'x.nib', bytes: new Uint8Array(232_960) } ]);

    expect(result.problems[0]).toMatch(/nibble image/);
  });
});
