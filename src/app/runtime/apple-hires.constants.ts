export const HIRES_WIDTH: number = 280;
export const HIRES_HEIGHT: number = 192;

/** One hi-res page: seven pixels per byte, bit 0 leftmost, bit 7 the palette bit. */
export const HIRES_BYTES: number = 0x2000;
export const PIXELS_PER_BYTE: number = 7;
export const BYTES_PER_ROW: number = 40;

export const HIRES_PAGE_1: number = 0x2000;
export const HIRES_PAGE_2: number = 0x4000;

/** The offset of a pixel row from the start of its page, as the hardware scans it. */
export function hiresRowOffset(pixelRow: number): number {
  return ((pixelRow & 7) * 0x400) + (((pixelRow >> 3) & 7) * 0x80) + ((pixelRow >> 6) * BYTES_PER_ROW);
}
