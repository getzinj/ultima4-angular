import { SECTOR_SIZE } from './disk-image';
import { Dos33Disk, Dos33Error, FILE_TYPE_BINARY, formatDos33 } from './dos33';
import type { IBinaryFile, ICatalogEntry } from './dos33';


function blankDisk(): Dos33Disk {
  return new Dos33Disk(formatDos33());
}


function bytesOf(length: number): Uint8Array {
  return Uint8Array.from({ length }, (_: unknown, index: number): number => (index * 7) & 0xFF);
}


describe('Dos33Disk', (): void => {
  describe('a blank disk', (): void => {
    it('has a DOS 3.3 VTOC', (): void => {
      expect(blankDisk().hasDos33Vtoc).toBe(true);
    });

    it('has an empty catalog', (): void => {
      expect(blankDisk().catalog()).toEqual([]);
    });
  });

  describe('BSAVE then BLOAD', (): void => {
    it('gives back the load address', (): void => {
      const disk: Dos33Disk = blankDisk();

      disk.writeBinary('ROST', 0xEC00, bytesOf(0x200));

      expect(disk.readBinary('ROST').address).toBe(0xEC00);
    });

    it('gives back the data', (): void => {
      const disk: Dos33Disk = blankDisk();

      disk.writeBinary('ROST', 0xEC00, bytesOf(0x200));

      expect(Array.from(disk.readBinary('ROST').data)).toEqual(Array.from(bytesOf(0x200)));
    });

    it('catalogs the file as binary', (): void => {
      const disk: Dos33Disk = blankDisk();

      disk.writeBinary('PRTY', 0x0000, bytesOf(0x20));

      expect(disk.find('PRTY')?.type).toBe(FILE_TYPE_BINARY);
    });

    it('counts the track/sector list and the data sectors', (): void => {
      const disk: Dos33Disk = blankDisk();

      disk.writeBinary('ROST', 0xEC00, bytesOf(0x200));

      expect(disk.find('ROST')?.sectorCount).toBe(4);
    });

    it('reads a file longer than one track/sector list holds', (): void => {
      const disk: Dos33Disk = blankDisk();
      const big: Uint8Array = bytesOf(130 * SECTOR_SIZE);

      disk.writeBinary('BIG', 0x2000, big);

      expect(disk.readBinary('BIG').data.length).toBe(big.length);
    });
  });

  describe('BSAVE over an existing file', (): void => {
    it('keeps one catalog entry', (): void => {
      const disk: Dos33Disk = blankDisk();

      disk.writeBinary('LIST', 0xEE00, bytesOf(0x100));
      disk.writeBinary('LIST', 0xEE00, bytesOf(0x80));

      expect(disk.catalog().filter((entry: ICatalogEntry): boolean => entry.name === 'LIST').length).toBe(1);
    });

    it('reads back the new contents', (): void => {
      const disk: Dos33Disk = blankDisk();

      disk.writeBinary('LIST', 0xEE00, bytesOf(0x100));
      disk.writeBinary('LIST', 0xEE00, new Uint8Array(0x10).fill(9));

      expect(Array.from(disk.readBinary('LIST').data)).toEqual(new Array<number>(0x10).fill(9));
    });

    it('frees the sectors of the old contents', (): void => {
      const disk: Dos33Disk = blankDisk();

      for (let round: number = 0; round < 400; round++) {
        disk.writeBinary('LIST', 0xEE00, bytesOf(0x100));
      }

      expect(disk.readBinary('LIST').data.length).toBe(0x100);
    });
  });

  describe('reserved tracks', (): void => {
    it('keeps a file off them', (): void => {
      const disk: Dos33Disk = blankDisk();
      const before: Uint8Array = disk.image.bytes.slice(0, 16 * 16 * SECTOR_SIZE);

      for (let index: number = 0; index < 20; index++) {
        disk.writeBinary(`F${ index }`, 0x4000, bytesOf(10 * SECTOR_SIZE), 16);
      }

      expect(disk.image.bytes.subarray(0, 16 * 16 * SECTOR_SIZE)).toEqual(before);
    });
  });

  describe('LOCK', (): void => {
    it('marks the file locked', (): void => {
      const disk: Dos33Disk = blankDisk();

      disk.writeBinary('MAPB', 0x8B00, bytesOf(0x400));
      disk.setLocked('MAPB', true);

      expect(disk.find('MAPB')?.locked).toBe(true);
    });

    it('keeps BSAVE off a locked file', (): void => {
      const disk: Dos33Disk = blankDisk();

      disk.writeBinary('MAPB', 0x8B00, bytesOf(0x400));
      disk.setLocked('MAPB', true);

      expect((): void => disk.writeBinary('MAPB', 0x8B00, bytesOf(0x400))).toThrow('FILE LOCKED: MAPB');
    });

    it('UNLOCK lets BSAVE in again', (): void => {
      const disk: Dos33Disk = blankDisk();

      disk.writeBinary('MAPB', 0x8B00, bytesOf(0x400));
      disk.setLocked('MAPB', true);
      disk.setLocked('MAPB', false);

      expect(disk.find('MAPB')?.locked).toBe(false);
    });
  });

  describe('patching a file in place', (): void => {
    function lockedMap(): Dos33Disk {
      const disk: Dos33Disk = blankDisk();

      disk.writeBinary('MAPB', 0x8B00, bytesOf(0x400));
      disk.setLocked('MAPB', true);

      return disk;
    }

    function patched(): Uint8Array {
      const data: Uint8Array = bytesOf(0x400);

      data[0x65] = 0x6E;

      return data;
    }

    it('rewrites a locked file', (): void => {
      const disk: Dos33Disk = lockedMap();

      disk.patchBinary('MAPB', patched());

      expect(disk.readBinary('MAPB').data[0x65]).toBe(0x6E);
    });

    it('leaves it locked', (): void => {
      const disk: Dos33Disk = lockedMap();

      disk.patchBinary('MAPB', patched());

      expect(disk.find('MAPB')?.locked).toBe(true);
    });

    it('keeps its load address', (): void => {
      const disk: Dos33Disk = lockedMap();

      disk.patchBinary('MAPB', patched());

      expect(disk.readBinary('MAPB').address).toBe(0x8B00);
    });

    it('touches no other sector', (): void => {
      const disk: Dos33Disk = lockedMap();
      const before: Uint8Array = disk.image.bytes.slice();
      const changed: number[] = [];

      disk.patchBinary('MAPB', patched());
      for (let offset: number = 0; offset < before.length; offset++) {
        if (before[offset] !== disk.image.bytes[offset]) {
          changed.push(offset);
        }
      }

      expect(changed.length).toBe(1);
    });

    it('refuses to change the length', (): void => {
      expect((): void => lockedMap().patchBinary('MAPB', bytesOf(0x401))).toThrow(Dos33Error);
    });
  });

  describe('errors', (): void => {
    it('reports a missing file', (): void => {
      expect((): IBinaryFile => blankDisk().readBinary('NONE')).toThrow(Dos33Error);
    });

    it('reports a full disk', (): void => {
      expect((): void => blankDisk().writeBinary('HUGE', 0, bytesOf(140 * 1024))).toThrow(Dos33Error);
    });
  });

  describe('names', (): void => {
    it('leaves control characters out of a name', (): void => {
      const disk: Dos33Disk = blankDisk();
      const catalog: Uint8Array = disk.image.readSector(17, 15);

      disk.writeBinary('INIT', 0x4000, bytesOf(4));
      catalog[0x0B + 3 + 2] = 0x81;

      expect(disk.catalog()[0].name).toBe('INT');
    });
  });
});
