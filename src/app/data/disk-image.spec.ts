import { DiskImage, DiskImageError, IMAGE_SIZE, prodosToDosOrder, sectorOffset, unwrapImage } from './disk-image';


function numberedImage(): Uint8Array {
  const image: Uint8Array = new Uint8Array(IMAGE_SIZE);

  for (let track: number = 0; track < 35; track++) {
    for (let sector: number = 0; sector < 16; sector++) {
      image[sectorOffset(track, sector)] = sector;
      image[sectorOffset(track, sector) + 1] = track;
    }
  }

  return image;
}


describe('unwrapImage', (): void => {
  it('takes a .do image as DOS order', (): void => {
    expect(unwrapImage('U4.DO', new Uint8Array(IMAGE_SIZE)).declaredOrder).toBe('dos');
  });

  it('takes a .po image as ProDOS order', (): void => {
    expect(unwrapImage('u4.po', new Uint8Array(IMAGE_SIZE)).declaredOrder).toBe('prodos');
  });

  it('leaves the order of a .dsk image to be worked out', (): void => {
    expect(unwrapImage('u4.dsk', new Uint8Array(IMAGE_SIZE)).declaredOrder).toBeNull();
  });

  it('refuses a nibble image', (): void => {
    expect((): unknown => unwrapImage('u4.nib', new Uint8Array(232_960))).toThrow(/nibble image/);
  });

  it('refuses a WOZ image', (): void => {
    expect((): unknown => unwrapImage('u4.bin', new TextEncoder().encode('WOZ2rest'))).toThrow(/WOZ image/);
  });

  it('refuses an image of the wrong size', (): void => {
    expect((): unknown => unwrapImage('u4.dsk', new Uint8Array(1000))).toThrow(DiskImageError);
  });

  it('takes the sectors out of a 2IMG file', (): void => {
    const file: Uint8Array = new Uint8Array(64 + IMAGE_SIZE);

    file.set(new TextEncoder().encode('2IMG'));
    file.set([ 64, 0, 0, 0 ], 24);
    file.set([ 0x00, 0x30, 0x02, 0x00 ], 28);
    file[64] = 0x5A;

    expect(unwrapImage('u4.2mg', file).sectors[0]).toBe(0x5A);
  });
});


describe('prodosToDosOrder', (): void => {
  it('puts the second half of block 0 at DOS sector 14', (): void => {
    const prodos: Uint8Array = new Uint8Array(IMAGE_SIZE);

    prodos[256] = 0x77;

    expect(prodosToDosOrder(prodos)[sectorOffset(0, 14)]).toBe(0x77);
  });

  it('puts block 1 of track 3 at DOS sectors 13 and 12', (): void => {
    const prodos: Uint8Array = new Uint8Array(IMAGE_SIZE);

    prodos[(3 * 4096) + 512] = 0x33;
    prodos[(3 * 4096) + 768] = 0x44;

    expect([ prodosToDosOrder(prodos)[sectorOffset(3, 13)], prodosToDosOrder(prodos)[sectorOffset(3, 12)] ]).toEqual([ 0x33, 0x44 ]);
  });
});


describe('DiskImage', (): void => {
  it('reads a sector by track and sector', (): void => {
    expect(Array.from(new DiskImage(numberedImage()).readSector(17, 5).subarray(0, 2))).toEqual([ 5, 17 ]);
  });

  it('writes a sector in place', (): void => {
    const disk: DiskImage = new DiskImage(numberedImage());

    disk.writeSector(2, 3, new Uint8Array(256).fill(0xEE));

    expect(disk.bytes[sectorOffset(2, 3) + 100]).toBe(0xEE);
  });

  it('reads whole tracks from track 0', (): void => {
    expect(new DiskImage(numberedImage()).readTracks(16).length).toBe(16 * 16 * 256);
  });
});
