import { BOOT_INLINE, BOOT_VARIABLES, bootData } from './boot-data';

const BOOT_END: number = 0x73F3;


describe('BOOT data', (): void => {
  it('keeps every block apart', (): void => {
    const spans: [ number, number ][] = Array.from(bootData()).map(([ address, bytes ]: [ number, readonly number[] ]): [ number, number ] => [ address, address + bytes.length ])
      .sort((a: [ number, number ], b: [ number, number ]): number => a[0] - b[0]);

    expect(spans.every((span: [ number, number ], index: number): boolean => (index === 0) || (spans[index - 1][1] <= span[0]))).toBe(true);
  });

  it('keeps every block inside BOOT', (): void => {
    expect(Array.from(bootData()).every(([ address, bytes ]: [ number, readonly number[] ]): boolean => (address >= 0x6000) && ((address + bytes.length) <= BOOT_END))).toBe(true);
  });

  it('puts the drive count where the menu flips it', (): void => {
    expect(BOOT_INLINE.number_of_drives.bytes[BOOT_VARIABLES.num_drives - BOOT_INLINE.number_of_drives.address]).toBe(0xB1);
  });

  it('puts the drive digit where load_disk_id writes it', (): void => {
    expect(BOOT_INLINE.bload_disk.bytes[BOOT_VARIABLES.drive_number - BOOT_INLINE.bload_disk.address]).toBe(0xB1);
  });
});
