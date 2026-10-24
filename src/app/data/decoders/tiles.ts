// The tile sheet: 256 tiles of 14 x 16 pixels, two HGR bytes wide. SHP0 holds every tile's left
// byte and SHP1 its right, each stored a row at a time across all 256 tiles: row r of tile t is at
// r * 256 + t (`tools/tile_sheet.py` in the remaster).

export const TILE_COUNT: number = 256;
export const TILE_ROWS: number = 16;
export const TILE_BYTES: number = TILE_COUNT * TILE_ROWS;


export class TileSheet {
  constructor(private readonly left: Uint8Array, private readonly right: Uint8Array) {
    if ((left.length < TILE_BYTES) || (right.length < TILE_BYTES)) {
      throw new RangeError(`a tile sheet half is ${ TILE_BYTES } bytes; got ${ left.length } and ${ right.length }`);
    }
  }


  /** The two HGR bytes of one row of a tile, left then right. */
  public row(tile: number, row: number): [ number, number ] {
    const index: number = (row * TILE_COUNT) + tile;

    return [ this.left[index], this.right[index] ];
  }

}
