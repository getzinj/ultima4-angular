// The game's font, HTXT: 128 glyphs of 7 x 8 pixels, one HGR byte a row, stored a row at a time
// across all glyphs: row r of glyph g is at r * 128 + g (`tools/font.py` in the remaster).

export const GLYPH_COUNT: number = 128;
export const GLYPH_ROWS: number = 8;
export const FONT_BYTES: number = GLYPH_COUNT * GLYPH_ROWS;


export class Font {
  constructor(private readonly bytes: Uint8Array) {
    if (bytes.length < FONT_BYTES) {
      throw new RangeError(`the font is ${ FONT_BYTES } bytes; got ${ bytes.length }`);
    }
  }


  public row(glyph: number, row: number): number {
    return this.bytes[(row * GLYPH_COUNT) + (glyph & 0x7F)];
  }

}
