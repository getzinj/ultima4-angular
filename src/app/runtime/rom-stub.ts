// No Apple ROM is distributed. The game only reads a few ROM bytes to tell which machine it is on,
// so those are answered as an enhanced Apple IIe answers them (Apple IIe Technical Note #2); every
// other ROM byte reads as zero. The ROM routines the game calls are trapped in later phases.

const ROM_BYTES: ReadonlyMap<number, number> = new Map<number, number>([
  [ 0xFBB3, 0x06 ],
  [ 0xFBC0, 0xE0 ],
  // IDRoutine: an RTS everywhere but on a IIgs.
  [ 0xFE1F, 0x60 ],
]);


export function readRomStub(address: number): number {
  return ROM_BYTES.get(address) ?? 0;
}
